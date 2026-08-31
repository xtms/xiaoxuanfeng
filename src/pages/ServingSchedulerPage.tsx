import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function ServingSchedulerPage() {
  return (
    <div className="prose max-w-none">
      <h1>服务调度</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 20 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · 调度系统</span>
      </div>
      <p>调度器是 LLM 推理引擎的<strong>决策中枢</strong>，负责在有限的 GPU 资源下最大化吞吐、最小化延迟。本文从请求生命周期出发，系统分析四种主流调度策略及其实现。</p>

      {/* ==================== 1. 调度问题定义 ==================== */}
      <div className="section-divider"><span>调度问题定义</span></div>

      <h3>核心约束</h3>
      <ul>
        <li><strong>显存约束</strong>：KV Cache block 数量有限，每个请求需要分配 block</li>
        <li><strong>计算约束</strong>：每步 token budget 有限（max_num_batched_tokens）</li>
        <li><strong>并发约束</strong>：最大并发请求数限制（max_num_seqs）</li>
        <li><strong>延迟约束</strong>：TTFT（首 token 延迟）和 TPOT（每 token 延迟）需满足 SLA</li>
      </ul>

      <h3>调度目标</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph Goals["调度目标"]
        T["吞吐最大化<br/>tokens/s"]
        L["延迟最小化<br/>TTFT + TPOT"]
        F["公平性<br/>无饥饿"]
        U["利用率最大化<br/>GPU 利用率"]
    end
    T --> Trade["权衡: 吞吐 ↑ ↔ 延迟 ↑"]
    L --> Trade
    F --> Trade
    U --> Trade
      `} />

      {/* ==================== 2. Continuous Batching ==================== */}
      <div className="section-divider"><span>Continuous Batching</span></div>

      <h3>从 Static Batching 到 Continuous Batching</h3>
      <p>传统 Static Batching 等所有请求完成后才开始下一批，导致 GPU 空转。Continuous Batching 每步动态调整批处理，请求完成后立即加入新请求。</p>

      <MermaidDiagram chart={`
gantt
    title Static vs Continuous Batching
    dateFormat X
    axisFormat %s

    section Static
    Req1 (长) :s1, 0, 10
    Req2 (短) :s2, 0, 3
    GPU 空转 :s3, 3, 10
    Req3 (新) :s4, 10, 12

    section Continuous
    Req1 (长) :c1, 0, 10
    Req2 (短) :c2, 0, 3
    Req3 (新) :c3, 3, 5
    Req4 (新) :c4, 5, 8
    Req5 (新) :c5, 8, 10
      `} />

      <h3>vLLM 三步调度</h3>
      <CodeBlock language="python" title="vLLM V1 调度器核心循环" code={`class Scheduler:
    def schedule(self) -> SchedulerOutput:
        """三步调度: Running → Waiting → 终态化"""
        scheduled = SchedulerOutput()

        # Phase 1: 调度 RUNNING 请求 (decode)
        for req in self.running:
            if self._try_allocate_slot(req):
                scheduled.add(req, num_tokens=1)  # decode: 每次 1 token

        # Phase 2: 调度 WAITING 请求 (prefill)
        token_budget = self.max_num_batched_tokens
        for req in self.waiting:
            remaining = len(req.prompt_tokens) - req.num_computed
            chunk = min(remaining, token_budget)
            if self._try_allocate(req, chunk):
                scheduled.add(req, num_tokens=chunk)
                token_budget -= chunk
                if token_budget <= 0:
                    break

        # Phase 3: 终态化 — 公共前缀、级联注意力
        scheduled.finalize()
        return scheduled`} />

      <h3>SGLang 零开销调度器</h3>
      <p>SGLang 使用 Rust 实现的调度器，调度开销近乎为零。核心优化：</p>
      <ul>
        <li><strong>Radix 感知调度</strong>：优先调度与当前缓存前缀匹配的请求</li>
        <li><strong>无锁数据结构</strong>：Rust 的 ownership 模型天然避免数据竞争</li>
        <li><strong>批处理合并</strong>：将多个小请求合并为大 batch，减少 kernel launch 开销</li>
      </ul>

      {/* ==================== 3. Chunked Prefill ==================== */}
      <div className="section-divider"><span>Chunked Prefill</span></div>

      <h3>核心思想</h3>
      <p>将长 prefill 拆分为多个 chunk，每个 chunk 与 decode 交替执行。避免长 prefill 独占 GPU 导致 decode 请求阻塞。</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant S as Scheduler
    participant P as Prefill (长请求)
    participant D1 as Decode 1
    participant D2 as Decode 2

    Note over S,D2: Step 1: Prefill Chunk 1 + Decode
    S->>P: Chunk 1 (2048 tokens)
    S->>D1: Decode 1 token
    S->>D2: Decode 1 token

    Note over S,D2: Step 2: Prefill Chunk 2 + Decode
    S->>P: Chunk 2 (2048 tokens)
    S->>D1: Decode 1 token
    S->>D2: Decode 1 token

    Note over S,D2: Step 3: 全部进入 Decode
    S->>P: Decode 1 token
    S->>D1: Decode 1 token
    S->>D2: Decode 1 token
      `} />

      <h3>Token Budget 分配策略</h3>
      <table>
        <thead><tr><th>策略</th><th>描述</th><th>优点</th><th>缺点</th></tr></thead>
        <tbody>
          <tr><td><strong>均分</strong></td><td>所有 WAITING 请求均分 budget</td><td>公平</td><td>短请求排队时间过长</td></tr>
          <tr><td><strong>短请求优先</strong></td><td>短 prefill 先分配</td><td>降低平均 TTFT</td><td>长请求可能饥饿</td></tr>
          <tr><td><strong>FCFS 分块</strong></td><td>队首请求尽可能多分配</td><td>简单，无饥饿</td><td>队首长请求阻塞后续</td></tr>
          <tr><td><strong>混合策略</strong></td><td>短请求完整 prefill，长请求分块</td><td>兼顾延迟和公平</td><td>实现复杂</td></tr>
        </tbody>
      </table>

      {/* ==================== 4. 抢占策略 ==================== */}
      <div className="section-divider"><span>抢占策略</span></div>

      <h3>为什么需要抢占</h3>
      <p>当 KV Cache block 不足时，调度器必须<strong>释放</strong>部分正在运行的请求的 KV block 以腾出空间。这需要抢占（preemption）机制。</p>

      <h3>抢占策略对比</h3>
      <table>
        <thead><tr><th>策略</th><th>选择逻辑</th><th>恢复成本</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>PRIORITY</strong></td><td>抢占优先级最低的请求</td><td>全量重算 (高)</td><td>有优先级区分的在线服务</td></tr>
          <tr><td><strong>FCFS (LIFO)</strong></td><td>抢占最后到达的请求</td><td>全量重算 (高)</td><td>批处理，公平性优先</td></tr>
          <tr><td><strong>SWAP</strong></td><td>KV Cache 换出到 CPU 内存</td><td>CPU→GPU 拷贝 (低)</td><td>CPU 内存充足</td></tr>
          <tr><td><strong>Recompute</strong></td><td>保留部分 KV Cache，重算剩余</td><td>部分重算 (中)</td><td>长序列，避免全量重算</td></tr>
        </tbody>
      </table>

      <CodeBlock language="python" title="抢占决策伪代码" code={`def _preempt_if_needed(self, num_blocks_needed: int):
    """当空闲 block 不足时触发抢占"""
    while len(self.free_blocks) < num_blocks_needed:
        # 1. 选择抢占目标
        victim = self._select_victim()  # PRIORITY 或 FCFS
        if victim is None:
            raise OutOfMemoryError("无法抢占任何请求")

        # 2. 释放 victim 的 KV blocks
        for block_id in victim.block_table:
            self.block_pool.free(block_id)

        # 3. victim 回到 waiting 队列
        victim.num_computed_tokens = 0  # 全量重算
        self.running.remove(victim)
        self.waiting.append(victim)`} />

      <Callout type="warning">
        <strong>抢占的代价：</strong>被抢占的请求需要<strong>全量重算</strong>所有 token（vLLM V1 不支持 SWAP）。
        在长 prompt（32K+）场景下，被抢占的请求可能需要数秒才能恢复。因此，合理的 <code>max_num_seqs</code> 和 <code>gpu_memory_utilization</code> 配置可以减少抢占发生。
      </Callout>

      {/* ==================== 5. 前缀感知调度 ==================== */}
      <div className="section-divider"><span>前缀感知调度</span></div>

      <h3>Radix 感知调度 (SGLang)</h3>
      <p>SGLang 调度器在调度决策时，<strong>优先选择与当前 KV Cache 前缀匹配度最高的请求</strong>，最大化缓存命中率。</p>

      <CodeBlock language="python" title="Radix 感知调度" code={`class RadixAwareScheduler:
    def select_next_requests(self, waiting: list[Request]) -> list[Request]:
        """选择与当前缓存前缀匹配度最高的请求"""
        # 为每个请求计算缓存命中长度
        scored = []
        for req in waiting:
            hit_len = self.radix_tree.find_longest_prefix(req.prompt_tokens)
            req.cache_hit_score = hit_len  # 命中长度越长，优先级越高
            scored.append(req)

        # 按命中长度降序排序
        scored.sort(key=lambda r: r.cache_hit_score, reverse=True)

        # 按 token budget 选取
        selected = []
        budget = self.max_num_batched_tokens
        for req in scored:
            remaining = len(req.prompt_tokens) - req.cache_hit_score
            if remaining <= budget:
                selected.append(req)
                budget -= remaining
        return selected`} />

      <h3>前缀感知调度的收益</h3>
      <table>
        <thead><tr><th>场景</th><th>无前缀感知</th><th>前缀感知</th><th>提升</th></tr></thead>
        <tbody>
          <tr><td><strong>多轮对话</strong></td><td>~30% 命中率</td><td>~90% 命中率</td><td>3x</td></tr>
          <tr><td><strong>Few-shot Prompt</strong></td><td>~50% 命中率</td><td>~95% 命中率</td><td>1.9x</td></tr>
          <tr><td><strong>Agent 工作负载</strong></td><td>~40% 命中率</td><td>~85% 命中率</td><td>2.1x</td></tr>
        </tbody>
      </table>

      {/* ==================== 6. 请求优先级与公平性 ==================== */}
      <div className="section-divider"><span>请求优先级与公平性</span></div>

      <h3>优先级模型</h3>
      <table>
        <thead><tr><th>维度</th><th>说明</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td><strong>用户指定优先级</strong></td><td>API 请求携带 priority 字段</td><td>VIP 用户 priority=0, 免费用户 priority=10</td></tr>
          <tr><td><strong>请求类型</strong></td><td>交互式 vs 批处理</td><td>在线聊天 priority=0, 离线评估 priority=5</td></tr>
          <tr><td><strong>SLA 等级</strong></td><td>不同延迟保证</td><td>TTFT {'<'} 100ms (高), TTFT {'<'} 1s (低)</td></tr>
          <tr><td><strong>到达时间</strong></td><td>等待时间补偿</td><td>等待超 10s, 自动提升优先级</td></tr>
        </tbody>
      </table>

      <h3>公平性保证</h3>
      <ul>
        <li><strong>Starvation Prevention</strong>：等待时间超过阈值时自动提升优先级</li>
        <li><strong>Weighted Fair Queueing</strong>：按优先级权重分配 token budget</li>
        <li><strong>Max Waiting Time</strong>：超过最大等待时间直接升级到最高优先级</li>
      </ul>

      <CodeBlock language="python" title="公平性调度" code={`class FairScheduler:
    def __init__(self):
        self.wait_times = {}  # req_id -> wait_time

    def apply_fairness_boost(self, req: Request):
        """等待时间超过阈值时提升优先级"""
        wait_time = time.time() - req.arrival_time
        if wait_time > self.max_wait_time:
            req.priority = 0  # 最高优先级
        elif wait_time > self.warning_time:
            req.priority = max(0, req.priority - 1)  # 逐级提升

    def schedule(self):
        for req in self.waiting:
            self.apply_fairness_boost(req)

        # 按优先级排序
        self.waiting.sort(key=lambda r: r.priority)
        # ... 继续调度逻辑`} />

      {/* ==================== 7. 多框架调度器对比 ==================== */}
      <div className="section-divider"><span>多框架调度器对比</span></div>

      <table>
        <thead><tr><th>框架</th><th>调度算法</th><th>实现语言</th><th>前缀感知</th><th>抢占</th><th>异步</th></tr></thead>
        <tbody>
          <tr><td><strong>vLLM V1</strong></td><td>Continuous Batching + Chunked Prefill</td><td>Python</td><td>✅ 哈希匹配</td><td>PRIORITY / FCFS</td><td>✅ 两步执行</td></tr>
          <tr><td><strong>SGLang</strong></td><td>Radix 感知 + Continuous Batching</td><td>Rust</td><td>✅ Radix Tree</td><td>前缀感知抢占</td><td>✅</td></tr>
          <tr><td><strong>nano-vLLM</strong></td><td>两阶段 Prefill 优先</td><td>Python</td><td>✅ HashChain</td><td>LIFO</td><td>❌ 同步</td></tr>
          <tr><td><strong>TensorRT-LLM</strong></td><td>In-flight Batching</td><td>C++</td><td>❌</td><td>❌</td><td>✅</td></tr>
          <tr><td><strong>LMDeploy</strong></td><td>Persistent Batching</td><td>C++</td><td>✅</td><td>❌</td><td>✅</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>调度器选择建议：</strong>
        <ul>
          <li><strong>通用生产部署</strong>：vLLM V1 Continuous Batching，成熟稳定</li>
          <li><strong>多轮对话 / Agent</strong>：SGLang Radix 感知调度，前缀缓存命中率最高</li>
          <li><strong>学习调度原理</strong>：nano-vLLM 两阶段调度，代码最简洁</li>
          <li><strong>极致性能</strong>：TensorRT-LLM In-flight Batching，C++ 零开销</li>
        </ul>
      </Callout>

      <ResourceTable resources={[
        { name: 'vLLM Scheduler 源码', url: 'https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/scheduler.py', desc: 'vLLM V1 调度器核心实现，三步调度 + 抢占' },
        { name: 'SGLang Scheduler 源码', url: 'https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/managers/scheduler.py', desc: 'SGLang Radix 感知调度器' },
        { name: 'Orca (OSDI 2022)', url: 'https://www.usenix.org/conference/osdi22/presentation/yu', desc: 'Continuous Batching 原始论文' },
        { name: 'Sarathi (OSDI 2024)', url: 'https://arxiv.org/abs/2308.16369', desc: 'Chunked Prefill 调度策略论文' },
        { name: 'Splitwise (OSDI 2024)', url: 'https://arxiv.org/abs/2311.18677', desc: 'P/D 分离调度，GPU 异构调度' },
        { name: 'nano-vLLM Scheduler', url: 'https://github.com/xtms/nano-vllm-npu', desc: '两阶段 Prefill 优先调度器，精简实现' },
      ]} />
    </div>
  );
}