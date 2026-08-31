import { MermaidDiagram } from '../components/MermaidDiagram';
import { CodeBlock, Callout, ExternalLink, ResourceTable } from '../components/CodeBlock';

export function VLLMArchPage() {
  return (
    <div className="prose max-w-none">
      <h1>vLLM 架构快速入门</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 20 分钟</span>
        <span className="page-meta-item">🏷️ 入门 · 架构 · 概念</span>
      </div>
      <p>
        本文是 vLLM 框架的<strong>架构入门指南</strong>，面向想快速理解 vLLM 整体设计的读者。
        参考 <a href="https://zhuanlan.zhihu.com/p/1984742841528902530" target="_blank" rel="noreferrer">vLLM(一)：vLLM框架快速入门引导</a>，
        结合 vLLM V1 (v0.23.0) 源码分析。
      </p>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://github.com/vllm-project/vllm" label="GitHub" />
        <ExternalLink href="https://docs.vllm.ai" label="官方文档" />
        <ExternalLink href="https://arxiv.org/abs/2309.06180" label="PagedAttention 论文" />
        <ExternalLink href="https://zhuanlan.zhihu.com/p/1984742841528902530" label="参考文章" />
      </div>

      {/* ==================== 1. vLLM 是什么 ==================== */}
      <h2>1. vLLM 是什么？</h2>
      <p>
        vLLM 是 UC Berkeley 开发的<strong>高性能 LLM 推理引擎</strong>，核心创新是 <strong>PagedAttention</strong>：
        将操作系统的虚拟内存分页思想引入 KV Cache 管理，将内存利用率从 ~25% 提升至 99%+。
      </p>

      <Callout type="info">
        <strong>一句话概括：</strong>vLLM = 高效 KV Cache 管理 (PagedAttention) + 动态批处理 (Continuous Batching) + 多进程异步架构。
      </Callout>

      <p>vLLM 的核心能力：</p>
      <ul>
        <li><strong>支持 200+ 模型</strong>：Llama / Qwen / DeepSeek / Mistral / GPT 系列等</li>
        <li><strong>OpenAI 兼容 API</strong>：无缝替换 OpenAI 端点</li>
        <li><strong>高性能推理</strong>：PagedAttention + Continuous Batching + CUDA Graph</li>
        <li><strong>多硬件支持</strong>：CUDA / ROCm / Ascend NPU / TPU / x86 CPU</li>
        <li><strong>分布式推理</strong>：TP / PP / DP / EP / CP 等多种并行策略</li>
      </ul>

      {/* ==================== 2. 一句话架构 ==================== */}
      <h2>2. 一句话架构</h2>

      <MermaidDiagram chart={`
flowchart LR
  CLIENT["Client<br/>HTTP Request"] --> API["API Server<br/>FastAPI + AsyncLLM"]
  API -->|"ZMQ<br/>ROUTER→DEALER"| CORE["Engine Core<br/>Scheduler + KV Cache"]
  CORE -->|"collective_rpc"| WORKER["GPU Worker<br/>ModelRunner"]
  WORKER -->|"ZMQ<br/>PUSH→PULL"| API
  API --> CLIENT
      `} />

      <p>
        vLLM V1 采用<strong>多进程三层架构</strong>：API Server（前端接入）→ Engine Core（调度核心）→ GPU Worker（模型执行）。
        进程间通过 ZMQ 消息队列通信，实现异步非阻塞的请求处理。
      </p>

      <table>
        <thead><tr><th>层级</th><th>进程</th><th>职责</th><th>关键类</th></tr></thead>
        <tbody>
          <tr><td><strong>API 层</strong></td><td>API Server 进程</td><td>接收 HTTP 请求，Tokenize，路由到 Engine</td><td><code>AsyncLLM</code> / <code>OpenAIServing</code></td></tr>
          <tr><td><strong>引擎层</strong></td><td>Engine Core 进程</td><td>调度决策、KV Cache 管理、Block 分配</td><td><code>EngineCore</code> / <code>Scheduler</code> / <code>KVCacheManager</code></td></tr>
          <tr><td><strong>执行层</strong></td><td>GPU Worker 进程</td><td>模型 Forward、CUDA Graph 执行、采样</td><td><code>Worker</code> / <code>GPUModelRunner</code> / <code>Sampler</code></td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>为什么多进程？</strong>Python GIL 限制导致单进程无法充分利用多核 CPU。多进程架构让 API Server 处理 HTTP 请求、
        Engine Core 做调度决策、GPU Worker 跑模型推理，三者异步并行，互不阻塞。
      </Callout>

      {/* ==================== 3. 请求处理全流程 ==================== */}
      <h2>3. 请求处理全流程</h2>
      <p>一个请求从进入到返回，经过以下 6 个阶段：</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Client
    participant API as API Server
    participant EC as EngineCore
    participant SCHED as Scheduler
    participant BM as BlockManager
    participant W as GPU Worker

    C->>API: POST /v1/chat/completions
    API->>API: Tokenize (tokenizer.encode)
    API->>EC: ZMQ: EngineCoreRequest
    EC->>SCHED: add_request()
    SCHED->>BM: can_allocate()?
    BM-->>SCHED: True/False
    alt 可分配
        SCHED->>BM: allocate(seq)
        SCHED->>SCHED: schedule() → SchedulerOutput
        SCHED->>W: execute_model(scheduler_output)
        W->>W: Forward (Attention + MLP)
        W-->>SCHED: ModelRunnerOutput
        SCHED->>SCHED: sample_tokens()
        SCHED->>BM: hash_blocks() (prefix cache)
        SCHED->>API: ZMQ: EngineCoreOutputs
        API->>API: Detokenize
        API-->>C: Streaming Response
    else 不可分配
        SCHED->>SCHED: 等待下轮 (或抢占)
    end
      `} />

      <h3>阶段详解</h3>
      <table>
        <thead><tr><th>阶段</th><th>位置</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td>① Tokenize</td><td><code>InputProcessor</code></td><td>将原始文本转为 token IDs，构建 EngineCoreRequest</td></tr>
          <tr><td>② 入队</td><td><code>EngineCore</code></td><td>ZMQ ROUTER→DEALER 发送请求到 Engine Core 进程</td></tr>
          <tr><td>③ 调度</td><td><code>Scheduler</code></td><td>决定本步执行哪些序列、分配多少 token（prefill/decode 混合）</td></tr>
          <tr><td>④ 分配</td><td><code>BlockManager</code></td><td>为序列分配物理 KV Cache Block，检查前缀缓存命中</td></tr>
          <tr><td>⑤ 执行</td><td><code>GPUModelRunner</code></td><td>组装 InputBatch → 模型 Forward → 返回 logits</td></tr>
          <tr><td>⑥ 输出</td><td><code>OutputProcessor</code></td><td>采样 → Detokenize → ZMQ PUSH→PULL 返回 API Server</td></tr>
        </tbody>
      </table>

      {/* ==================== 4. PagedAttention ==================== */}
      <h2>4. PagedAttention：KV Cache 分页管理</h2>
      <p>
        PagedAttention 是 vLLM 最核心的创新。它将 KV Cache 划分为固定大小的 <strong>Block</strong>（默认 256 tokens），
        通过 Block Table 将逻辑位置映射到物理 Block，实现非连续存储。
      </p>

      <MermaidDiagram chart={`
flowchart TB
  subgraph LOGICAL["逻辑序列 (Sequence)"]
    T0["token_0"]
    T1["token_1"]
    T2["..."]
    T255["token_255"]
    T256["token_256"]
    T257["..."]
    T511["token_511"]
  end

  subgraph BT["Block Table"]
    B0["block_table[0] = 7"]
    B1["block_table[1] = 3"]
  end

  subgraph PHYSICAL["物理 Block Pool"]
    B3["Block 3<br/>KV[0:256]"]
    B7["Block 7<br/>KV[0:256]"]
  end

  T0 --> B0
  T256 --> B1
  B0 --> B7
  B1 --> B3
      `} />

      <Callout type="info">
        <strong>核心优势：</strong>Block 不需要连续存储，消除内存碎片。多个序列可以共享同一个 Block（前缀缓存），
        节省显存。内存利用率从传统方案的 ~25% 提升至 <strong>99%+</strong>。
      </Callout>

      <CodeBlock language="python" title="KVCacheBlock 数据结构" code={`class KVCacheBlock:
    block_id: int              # 物理块 ID
    ref_count: int             # 引用计数 (共享时>1)
    block_hash: int | None     # 前缀缓存哈希值
    token_ids: tuple[int, ...] # 块内 token 序列 (用于哈希验证)

class BlockPool:
    blocks: list[KVCacheBlock]
    free_block_queue: FreeKVCacheBlockQueue
    cached_block_hash_to_block: dict[int, KVCacheBlock]  # 哈希→Block 映射
    get_new_blocks(n: int) -> list[KVCacheBlock]
    free_blocks(blocks: list[KVCacheBlock])`} />

      <h3>PagedAttention 的内存优化效果</h3>
      <table>
        <thead><tr><th>方案</th><th>内存利用率</th><th>碎片</th><th>共享</th></tr></thead>
        <tbody>
          <tr><td>传统方案 (连续分配)</td><td>~25%</td><td>严重 (内部+外部碎片)</td><td>❌ 不支持</td></tr>
          <tr><td><strong>PagedAttention</strong></td><td><strong>99%+</strong></td><td><strong>几乎为零</strong></td><td><strong>✅ Block 级共享</strong></td></tr>
        </tbody>
      </table>

      {/* ==================== 5. Continuous Batching ==================== */}
      <h2>5. Continuous Batching：动态批处理</h2>
      <p>
        传统静态 batching 要求一个 batch 中的所有序列同时完成，导致 GPU 利用率低。
        Continuous Batching 在<strong>每一步 (step) 动态决定</strong>哪些序列参与计算，完成的序列立即退出，新序列随时加入。
      </p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant S as Scheduler
    participant W as GPU Worker

    Note over S: Step 1
    S->>W: batch = [seq_A(prefill), seq_B(decode)]
    W->>W: Forward
    Note over S: Step 2: seq_A 完成 prefill 转为 decode
    S->>W: batch = [seq_A(decode), seq_B(decode), seq_C(prefill)]
    W->>W: Forward
    Note over S: Step 3: seq_B 完成
    S->>W: batch = [seq_A(decode), seq_C(decode), seq_D(prefill)]
    W->>W: Forward
    Note over S: 每步动态组合 prefill + decode
      `} />

      <Callout type="tip">
        <strong>关键点：</strong>Continuous Batching 让 prefill 和 decode 在同一个 batch 中混合执行，
        GPU 几乎不会空闲等待。这是 vLLM 吞吐量远超传统方案的核心原因之一。
      </Callout>

      {/* ==================== 6. 调度器 ==================== */}
      <h2>6. Scheduler：调度决策核心</h2>
      <p>Scheduler 是 vLLM 的"大脑"，每步做出以下决策：</p>

      <CodeBlock language="python" title="Scheduler 核心逻辑" code={`class Scheduler:
    def schedule(self) -> SchedulerOutput:
        # 1. 从 waiting 队列取出请求，尝试分配 KV Cache
        for req in self.waiting:
            if self.block_manager.can_allocate(req):
                self.block_manager.allocate(req)
                self.running.append(req)
            else:
                break  # KV Cache 不够，停止接收新请求

        # 2. 为每个 running 序列计算本步处理的 token 数
        for seq in self.running:
            if seq.is_prefill:
                seq.num_scheduled_tokens = min(
                    seq.remaining_tokens,      # 剩余 token 数
                    self.max_num_batched_tokens # 批次上限
                )
            else:
                seq.num_scheduled_tokens = 1   # decode 每步 1 token

        # 3. 构建 SchedulerOutput (传给 ModelRunner)
        return SchedulerOutput(scheduled_seqs=..., num_scheduled_tokens=...)`} />

      <h3>调度策略</h3>
      <ul>
        <li><strong>Prefill 优先</strong>：优先调度 prefill 请求，降低首 token 延迟 (TTFT)</li>
        <li><strong>Chunked Prefill</strong>：长 prefill 分块执行，与 decode 交替，避免 decode 饥饿</li>
        <li><strong>LIFO 抢占</strong>：KV Cache 不足时，后进先出抢占 running 序列，释放 Block</li>
        <li><strong>FCFS 队列</strong>：默认先来先服务，支持优先级队列扩展</li>
      </ul>

      {/* ==================== 7. KV Cache 管理器 ==================== */}
      <h2>7. KVCacheManager：三级缓存管理</h2>

      <MermaidDiagram chart={`
flowchart TB
  subgraph L1["L1: KVCacheManager"]
    KM["KVCacheManager<br/>统一入口"]
  end

  subgraph L2["L2: KVCacheCoordinator"]
    KC["KVCacheCoordinator<br/>协调前缀缓存策略"]
    U["UnitaryKVCacheCoordinator<br/>单层 Attention"]
    H["HybridKVCacheCoordinator<br/>混合 Attention (Full+Sliding)"]
    N["NoPrefixCache<br/>无前缀缓存"]
  end

  subgraph L3["L3: SingleTypeKVCacheManager"]
    FA["FullAttentionManager<br/>全注意力"]
    SW["SlidingWindowManager<br/>滑动窗口"]
    MB["MambaManager<br/>Mamba (SSM)"]
  end

  KM --> KC
  KC --> U
  KC --> H
  KC --> N
  U --> FA
  U --> SW
  U --> MB
      `} />

      <p>
        KV Cache 管理分为三级：<strong>KVCacheManager</strong>（统一入口）→ <strong>KVCacheCoordinator</strong>（前缀缓存策略）→
        <strong>SingleTypeKVCacheManager</strong>（具体 Attention 类型的 Block 分配）。
        这种分层设计使得支持新的 Attention 类型只需实现 SingleTypeKVCacheManager 接口。
      </p>

      {/* ==================== 8. ModelRunner ==================== */}
      <h2>8. GPUModelRunner：模型执行引擎</h2>
      <p>GPUModelRunner 是真正执行模型 Forward 的组件，负责：</p>

      <CodeBlock language="python" title="InputBatch 核心属性" code={`class InputBatch:
    # 输入元数据 (持久化，跨 step 复用)
    input_ids: torch.Tensor       # [max_batch, max_seqlen]
    positions: torch.Tensor       # [max_batch, max_seqlen]
    block_table: torch.Tensor     # [max_batch, max_blocks]  物理 Block 映射
    slot_mapping: torch.Tensor    # [max_tokens]             每个 token → KV slot

    # 模型配置
    num_heads: int
    head_size: int
    num_layers: int

    def refresh_metadata(self) -> None:
        """每步刷新元数据，复用 GPU buffer 避免内存分配"""`} />

      <Callout type="tip">
        <strong>性能关键：</strong>InputBatch 的 GPU buffer 在初始化时一次性分配，后续每步只刷新元数据（refresh_metadata），
        避免 Python 层的 GPU 内存分配开销。这是 vLLM 低延迟的关键设计之一。
      </Callout>

      {/* ==================== 9. 进程间通信 ==================== */}
      <h2>9. 进程间通信 (IPC)</h2>

      <table>
        <thead><tr><th>通信路径</th><th>机制</th><th>数据</th><th>相关文件</th></tr></thead>
        <tbody>
          <tr><td>AsyncLLM → EngineCore</td><td>ZMQ ROUTER → DEALER (msgpack)</td><td><code>EngineCoreRequest</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core_client.py" target="_blank" rel="noreferrer"><code>core_client.py</code></a></td></tr>
          <tr><td>EngineCore → AsyncLLM</td><td>ZMQ PUSH → PULL (msgpack)</td><td><code>EngineCoreOutputs</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core_client.py" target="_blank" rel="noreferrer"><code>core_client.py</code></a></td></tr>
          <tr><td>EngineCore → Scheduler</td><td>函数调用</td><td><code>SchedulerOutput</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core.py" target="_blank" rel="noreferrer"><code>core.py</code></a></td></tr>
          <tr><td>EngineCore → Executor</td><td>函数调用 (Future)</td><td><code>SchedulerOutput</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core.py" target="_blank" rel="noreferrer"><code>core.py</code></a></td></tr>
          <tr><td>Executor → Worker</td><td><code>collective_rpc</code></td><td>方法名 + 参数</td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/executor/abstract.py" target="_blank" rel="noreferrer"><code>executor/abstract.py</code></a></td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>注意：</strong>离线推理使用 <code>InprocClient</code>（直接引用 EngineCore，无 ZMQ 开销），
        在线服务使用 <code>AsyncMPClient</code>（ZMQ 通信）。ZMQ 的 ROUTER→DEALER 模式支持多客户端并发请求。
      </Callout>

      {/* ==================== 10. 核心类关系 ==================== */}
      <h2>10. 核心类关系图</h2>

      <MermaidDiagram chart={`
classDiagram
    class LLM {
        +generate(prompts, sampling_params)
    }
    class AsyncLLM {
        +generate(prompts, sampling_params)
        +engine_client: EngineCoreClient
    }
    class LLMEngine {
        +add_request()
        +step()
        +generate()
    }
    class EngineCore {
        +run_busy_loop()
        +add_request()
        +step()
    }
    class Scheduler {
        +schedule() SchedulerOutput
        +waiting: list[Sequence]
        +running: list[Sequence]
    }
    class BlockManager {
        +can_allocate(seq) bool
        +allocate(seq)
        +deallocate(seq)
        +hash_blocks(seq)
    }
    class KVCacheManager {
        +allocate_slots(seq) bool
        +free_slots(seq)
    }
    class Executor {
        +execute_model(scheduler_output)
    }
    class GPUModelRunner {
        +execute_model(scheduler_output)
        +input_batch: InputBatch
    }
    class Worker {
        +execute_model(scheduler_output)
    }

    LLM --> LLMEngine
    AsyncLLM --> EngineCoreClient
    EngineCore --> Scheduler
    EngineCore --> Executor
    Scheduler --> BlockManager
    Scheduler --> KVCacheManager
    Executor --> Worker
    Worker --> GPUModelRunner
      `} />

      {/* ==================== 11. 关键特性一览 ==================== */}
      <h2>11. 关键特性一览</h2>
      <table>
        <thead><tr><th>特性</th><th>说明</th><th>性能影响</th></tr></thead>
        <tbody>
          <tr><td><strong>PagedAttention</strong></td><td>页面式 KV Cache 管理</td><td>内存利用率 ~25% → 99%+</td></tr>
          <tr><td><strong>Continuous Batching</strong></td><td>动态 prefill+decode 混合批处理</td><td>吞吐量 10x+ 提升</td></tr>
          <tr><td><strong>Chunked Prefill</strong></td><td>长 prefill 分块执行</td><td>首 token 延迟降低 50%+</td></tr>
          <tr><td><strong>Prefix Caching</strong></td><td>自动复用共享前缀 KV Cache</td><td>相同前缀场景 5x+ 加速</td></tr>
          <tr><td><strong>CUDA Graph</strong></td><td>预捕获计算图 (DECODE 模式)</td><td>kernel launch 开销降低 90%+</td></tr>
          <tr><td><strong>Speculative Decoding</strong></td><td>n-gram / EAGLE 推测解码</td><td>decode 吞吐 2-3x 提升</td></tr>
          <tr><td><strong>PD 分离</strong></td><td>Prefill / Decode 独立 GPU 池</td><td>资源利用率最大化</td></tr>
          <tr><td><strong>Multi-LoRA</strong></td><td>同时服务多个 LoRA 适配器</td><td>多租户场景支持</td></tr>
        </tbody>
      </table>

      {/* ==================== 12. 学习路线 ==================== */}
      <h2>12. 推荐学习路线</h2>

      <Callout type="tip">
        <strong>入门三步走：</strong><br/>
        ① 理解 PagedAttention 原理（为什么需要分页 KV Cache）<br/>
        ② 看懂请求处理流程（Client → API → Scheduler → Worker）<br/>
        ③ 阅读 Scheduler 和 BlockManager 源码（调度与内存管理是核心）
      </Callout>

      <ResourceTable resources={[
        { name: 'vLLM GitHub', url: 'https://github.com/vllm-project/vllm', desc: 'vLLM 官方仓库，PagedAttention 推理引擎的完整实现' },
        { name: 'vLLM 官方文档', url: 'https://docs.vllm.ai', desc: '安装指南、API 参考、架构设计文档' },
        { name: 'PagedAttention 论文', url: 'https://arxiv.org/abs/2309.06180', desc: 'SOSP 2023 论文，KV Cache 分页管理的理论基础' },
        { name: 'vLLM 技术博客', url: 'https://blog.vllm.ai/2023/06/20/vllm.html', desc: 'vLLM 团队官方博客，深入解读 PagedAttention' },
        { name: 'vLLM 业务分析文档', url: 'https://github.com/xtms/vllm/blob/releases/v0.23.0/vllm_business_analysis.md', desc: 'vLLM v0.23.0 完整业务逻辑分析' },
        { name: 'vLLM 知乎入门引导', url: 'https://zhuanlan.zhihu.com/p/1984742841528902530', desc: 'vLLM(一)：vLLM框架快速入门引导' },
        { name: 'Transformer 原始论文', url: 'https://arxiv.org/abs/1706.03762', desc: '"Attention Is All You Need"，理解 Attention 机制的基础' },
        { name: 'The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/', desc: 'Jay Alammar 经典可视化图解，直观理解 Attention' },
      ]} />
    </div>
  );
}