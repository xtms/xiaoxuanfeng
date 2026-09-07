import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

const GH_VLLM = 'https://github.com/vllm-project/vllm/blob/main';
const GH_SGLANG = 'https://github.com/sgl-project/sglang/blob/main';

function SrcLink({ gh, path }: { gh: 'vllm' | 'sglang'; path: string }) {
  const base = gh === 'vllm' ? GH_VLLM : GH_SGLANG;
  return (
    <a href={`${base}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function ServingSchedulerPage() {
  return (
    <div className="prose max-w-none">
      <h1>服务调度概览 — vLLM 与 SGLang 调度模块对照分析</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">⏱️ 阅读约 35 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · 调度系统</span>
      </div>
      <p>
        调度器是 LLM 推理引擎的<strong>决策中枢</strong>——它决定每一轮 forward pass 跑哪些请求、每个请求算多少 token、KV Cache 怎么分配。
        本概览页在「<a href="/vllm-scheduler">vLLM V1 调度模块</a>」与「<a href="/sglang-scheduler">SGLang 调度模块</a>」两篇 Pi-0.5 源码深挖的基础上，
        以<strong>对照分析</strong>的方式提炼两大主流引擎调度器的<strong>共同点</strong>与<strong>差异点</strong>：哪些是它们殊途同归的必然设计，哪些是它们路径分岔的关键抉择，以及这些抉择带来的性能与复杂度权衡。
      </p>

      <Callout type="info">
        本文所有代码与文件路径均来自真实源码：vLLM 本地克隆 <code>/data/sd/vllm</code>、SGLang 本地克隆 <code>/data/sd/sglang</code>。
        页内 <code>SrcLink</code> 分两色——<strong>vLLM</strong>（GH = <code>{'{'}GH_VLLM{'}'}</code> = <code>https://github.com/vllm-project/vllm/blob/main</code>）与 <strong>SGLang</strong>（GH = <code>{'{'}GH_SGLANG{'}'}</code> = <code>https://github.com/sgl-project/sglang/blob/main</code>）。
        深挖细节请回到两个子页面。
      </Callout>

      {/* ==================== 1 概览：两种架构 ==================== */}
      <div className="section-divider"><span>两种引擎，两种调度组织方式</span></div>

      <p>
        vLLM V1 与 SGLang 都把「调度」视为吞吐的第一杠杆，但组织方式截然不同：<strong>vLLM 把调度塞进 EngineCore 单进程</strong>，与模型执行每步耦合；
        <strong>SGLang 把调度做成独立 CPU 进程</strong>，通过 ZMQ 与上游 tokenizer、下游 GPU worker 解耦通信。
      </p>

      <MermaidDiagram chart={`
flowchart TB
    subgraph V["vLLM V1 — EngineCore 单进程"]
        direction TB
        VC["<b>EngineCore busy loop</b><br/>step() · schedule → execute → update"]
        VS["Scheduler<br/>schedule() / update_from_output"]
        VK["KVCacheManager<br/>Coordinator + BlockPool"]
        VE[ModelExecutor<br/>GPU]
        VC --- VS
        VC --- VK
        VC --- VE
    end
    subgraph S["SGLang — 独立 Scheduler 进程"]
        direction TB
        ST[TokenizerManager<br/>http server + tokenize]
        SS["<b>Scheduler 进程</b><br/>event_loop<br/>get_next_batch_to_run"]
        SR[RadixCache<br/>mem_cache/radix_cache.py]
        SM[ModelWorker<br/>GPU]
        ST -->|"ZMQ"| SS
        SS --> SR
        SS -->|"ScheduleBatch / ForwardBatch"| SM
    end
      `} />

      <p>
        <strong>为什么调度值得单独讨论</strong>：Continuous Batching（迭代级调度）让每步 batch 动态重组，是吞吐提升的根本；
        Chunked Prefill 让长 prompt 不再阻塞短请求；前缀缓存让 prefill 从「命中处」而非「开头」开始算。
        这些机制<strong>两大引擎全部具备</strong>——本文先从共同点入手，再剖析差异。
      </p>

      {/* ==================== 2 共同点总览 ==================== */}
      <div className="section-divider"><span>共同点总览：六大收敛设计</span></div>

      <p>
        两个团队独立解决同一个问题，在<strong>架构性设计上高度收敛</strong>。六大共同点逐项展开见下文，先给总览：
      </p>
      <table>
        <thead>
          <tr>
            <th>共同点</th>
            <th>vLLM V1 落点</th>
            <th>SGLang 落点</th>
            <th>本质</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>① 迭代级 Continuous Batching</strong></td>
            <td><code>EngineCore.step()</code> → <code>schedule()</code></td>
            <td><code>event_loop</code> → <code>get_next_batch_to_run()</code></td>
            <td>每步按最新状态重组 batch，请求完成即腾位</td>
          </tr>
          <tr>
            <td><strong>② Token Budget + Chunked Prefill</strong></td>
            <td><code>token_budget = max_num_scheduled_tokens</code></td>
            <td><code>PrefillAdder</code> 的 <code>rem_total_tokens</code> / <code>rem_chunk_tokens</code></td>
            <td>用预算把长 prefill 切成可被 decode 穿插的片段</td>
          </tr>
          <tr>
            <td><strong>③ 前缀缓存深度集成</strong></td>
            <td>Block Hash + <code>find_longest_cache_hit</code></td>
            <td>Radix Tree <code>match_prefix</code></td>
            <td>prefill 只算「缓存命中之后」的尾部</td>
          </tr>
          <tr>
            <td><strong>④ 抢占 + 缓存恢复</strong></td>
            <td>regenerate（<code>num_computed_tokens = 0</code>）</td>
            <td>retract_decode（放回 waiting 重 prefill）</td>
            <td>抢占成本被前缀缓存兜底，恢复近乎无痛</td>
          </tr>
          <tr>
            <td><strong>⑤ 优先级调度</strong></td>
            <td>PRIORITY 策略（heap 键 <code>(priority, arrival_time)</code>）</td>
            <td><code>enable_priority_scheduling</code>（含抢占式）</td>
            <td>优先级同时影响排队顺序与「谁被抢占」</td>
          </tr>
          <tr>
            <td><strong>⑥ 调度与执行重叠</strong></td>
            <td><code>AsyncScheduler</code> placeholder 预更新</td>
            <td><code>event_loop_overlap</code> 延迟一 iter 处理结果</td>
            <td>把状态推进与 GPU forward 重叠，隐藏执行延迟</td>
          </tr>
        </tbody>
      </table>

      {/* ==================== 3 共同点① 迭代级调度 ==================== */}
      <div className="section-divider"><span>共同点① 迭代级 Continuous Batching</span></div>

      <p>
        两者都是<strong>迭代级（iteration-level）调度</strong>：每步（iter）重新组装 batch，已完成的请求立即让位给新请求，而不是等整批结束。
        骨架几乎互为镜像——「收请求 → 决策 batch → 前向 → 处理结果」：
      </p>

      <CodeBlock language="python" title="vLLM: EngineCore.step() 调度→执行→更新 (vllm/v1/engine/core.py)" code={`def step(self) -> tuple[dict[int, EngineCoreOutputs], bool]:
    if not self.scheduler.has_requests():
        return {}, False
    scheduler_output = self.scheduler.schedule()          # ① 调度：本轮跑谁、算多少
    future = self.model_executor.execute_model(
        scheduler_output, non_block=True)                 # ② 异步发起模型执行
    ...
    model_output = future.result()                        # ③ 等待 GPU 结果
    ...
    engine_core_outputs = self.scheduler.update_from_output(
        scheduler_output, model_output)                   # ④ 用输出推进请求状态
    return engine_core_outputs, scheduler_output.total_num_scheduled_tokens > 0`} />

      <CodeBlock language="python" title="SGLang: event_loop_normal (scheduler.py)" code={`def event_loop_normal(self):
    while True:
        if self.gracefully_exit:
            break
        recv_reqs = self.request_receiver.recv_requests() # ① 从 ZMQ 收请求
        self.process_input_requests(recv_reqs)
        plan = self.get_next_batch_to_run(
            running_batch=self.running_batch,
            last_batch=self.last_batch)                    # ② 决策下一批
        batch = plan.batch_to_run
        if batch:
            result = self.run_batch(batch)                 # ③ 前向
            self.process_batch_result(batch, result)       # ④ 处理结果
        else:
            self.on_idle()
        self.last_batch = batch`} />

      <Callout type="tip">
        <strong>分析：</strong>「每步重组 batch」是两者吞吐优势的共同根基——它把 GPU 利用率从静态 batching 的「等最长请求」提升为「随时补位」。
        差异只体现在组织方式：vLLM 把三步压在 <code>step()</code> 一个原子调用里（调度与执行严格耦合），SGLang 把循环放进独立进程、每个阶段是独立组件
        （<SrcLink gh="sglang" path="python/sglang/srt/managers/scheduler_components/request_receiver.py" /> 收请求、<SrcLink gh="vllm" path="vllm/v1/core/sched/scheduler.py" /> 决策）。
      </Callout>

      {/* ==================== 4 共同点② Token Budget ==================== */}
      <div className="section-divider"><span>共同点② Token Budget 与 Chunked Prefill</span></div>

      <p>
        两者都用<strong>「每步 token 上限」</strong>控制单步计算量，防止单个长 prefill 独占 GPU——这是 Chunked Prefill 的预算基础。
      </p>

      <CodeBlock language="python" title="vLLM: token_budget + chunked 截断 (vllm/v1/core/sched/scheduler.py)" code={`token_budget = self.max_num_scheduled_tokens  # 每步可调度 token 总数
...
# chunked prefill 必须显式启用；否则超预算直接停止调度
if not self.scheduler_config.enable_chunked_prefill and num_new_tokens > token_budget:
    break
num_new_tokens = min(num_new_tokens, token_budget)   # 截断到预算内`} />

      <CodeBlock language="python" title="SGLang: PrefillAdder 双预算 (scheduler.py)" code={`adder = PrefillAdder(
    self.page_size, self.tree_cache, self.token_to_kv_pool_allocator,
    running_batch, self.new_token_ratio_tracker.current,
    self.max_prefill_tokens,        # rem_total_tokens 上限
    chunked_prefill_size,           # rem_chunk_tokens 上限
    ...
)
# add_one_req 里：预算不够 → 整批停止；超 chunk 大小 → 截断续跑
if total_tokens >= self.rem_total_tokens:
    return AddReqResult.NO_TOKEN
if input_tokens > chunk_tokens_limit:
    # chunked prefill：截断到 chunk 大小，余下下 iter 续跑
    ...`} />

      <Callout type="tip">
        <strong>分析：</strong>两者都认识到「长 prefill 不切片，decode 就永远被饿死」。机制对齐：vLLM 用单一 <code>token_budget</code>（缺省回退 <code>max_num_batched_tokens</code>），
        SGLang 用 <code>PrefillAdder</code> 维护「总预算 + chunk 预算」两块。<code>PrefillAdder</code> 的实现见「<a href="/sglang-scheduler">SGLang 调度模块</a>」第 6 节，vLLM 的预算分配见「<a href="/vllm-scheduler">vLLM V1 调度模块</a>」第 6 节。
      </Callout>

      {/* ==================== 5 共同点③ 前缀缓存 ==================== */}
      <div className="section-divider"><span>共同点③ 前缀缓存深度集成</span></div>

      <p>
        两者都把<strong>「前缀缓存命中」集成进调度决策</strong>——调度时直接读缓存，命中后 prefill 从命中位置开始算，而不是从头算。
        这是多轮对话 / Agent / few-shot 场景吞吐倍增的共同杠杆。
      </p>

      <CodeBlock language="python" title="vLLM: waiting 阶段查最长缓存命中 (vllm/v1/core/sched/scheduler.py)" code={`if request.num_computed_tokens == 0:
    new_computed_blocks, num_new_local_computed_tokens = (
        self.kv_cache_manager.get_computed_blocks(request)  # → coordinator.find_longest_cache_hit
    )
# 命中后 num_computed_tokens 跳到命中位置，prefill 只算未命中尾部`} />

      <CodeBlock language="python" title="SGLang: 调度循环内触发 radix 前缀匹配 (scheduler.py)" code={`for req in self.waiting_queue:
    ...
    # ★ 关键：init_next_round_input 触发 radix cache 前缀匹配
    req.init_next_round_input(self.tree_cache)   # prefix_indices 直接指向已有 KV 位置
    res = adder.add_one_req(req, ...)`} />

      <Callout type="tip">
        <strong>分析：</strong>「缓存感知调度」不是可选优化，而是两者共同的第一性能杠杆。
        vLLM 用「每 N 个 token 一块」的 block hash（<SrcLink gh="vllm" path="vllm/v1/core/kv_cache_manager.py" /> 的 <code>find_longest_cache_hit</code>），
        SGLang 用 radix tree 的 <code>match_prefix</code>（<SrcLink gh="sglang" path="python/sglang/srt/mem_cache/radix_cache.py" />）。
        命中信息直接改写调度器的 <code>num_computed_tokens</code> / <code>prefix_indices</code>，从而决定 prefill 的起点——这就是「调度决策」与「缓存状态」耦合的具体形态。
      </Callout>

      {/* ==================== 6 共同点④ 抢占 ==================== */}
      <div className="section-divider"><span>共同点④ 抢占与缓存恢复</span></div>

      <p>
        显存不足时必须释放部分请求的 KV 块。两者都不做 swap（V0 式的 KV 搬到 CPU），统一为<strong>「放回等待队列重算」</strong>——
        但都依赖前缀缓存把重算成本压到最低。
      </p>

      <CodeBlock language="python" title="vLLM: _preempt_request — regenerate (vllm/v1/core/sched/scheduler.py)" code={`def _preempt_request(self, request: Request, timestamp: float) -> None:
    self.kv_cache_manager.free(request)       # ① 释放 KV blocks
    self.encoder_cache_manager.free(request)
    request.status = RequestStatus.PREEMPTED
    request.num_computed_tokens = 0           # ② 重置 → regenerate
    self.waiting.prepend_request(request)     # ③ 放回 waiting 队首`} />

      <CodeBlock language="python" title="SGLang: update_running_batch → retract_decode (scheduler.py)" code={`if (kv_full_retract_flag := not batch.check_decode_mem()) or (...):
    retracted_reqs, new_token_ratio, reqs_to_abort = batch.retract_decode()
    self.new_token_ratio_tracker.current = new_token_ratio
    for req in reqs_to_abort:
        ...  # 无法撤回的 beam 组 → abort
    for req in retracted_reqs:
        self._add_request_to_queue(req, is_retracted=True)  # 放回 waiting 重 prefill
else:
    self.new_token_ratio_tracker.decay_step()`} />

      <Callout type="warning">
        <strong>分析：</strong>抢占都是「请求被打回 waiting，之后重走 prefill」。之所以成本可接受，是因为<strong>已算前缀留在缓存里</strong>：
        vLLM 靠 <code>block_hashes</code> 未变 → 下次 <code>get_computed_blocks()</code> 恢复命中位置；SGLang 靠 radix tree 里已入树的 prefix → 重 prefill 时 <code>match_prefix</code> 只补尾部。
        换句话说，抢占的「重算代价」被前缀缓存从 O(整条序列) 压到 O(未缓存尾部)。
      </Callout>

      {/* ==================== 7 共同点⑤ 优先级 ==================== */}
      <div className="section-divider"><span>共同点⑤ 优先级调度</span></div>

      <p>
        两者都支持显式优先级，且优先级同时作用于<strong>排队顺序</strong>与<strong>抢占/驱逐对象选择</strong>。默认策略都是 FCFS，优先级需要显式开启。
      </p>

      <CodeBlock language="python" title="vLLM: PriorityRequestQueue — 堆键 (priority, arrival_time) (vllm/v1/core/sched/request_queue.py)" code={`class PriorityRequestQueue(RequestQueue):
    """requests with a smaller value of 'priority' are processed first.
    If multiple requests have the same priority, the one with the earlier
    'arrival_time' is processed first."""

    def __init__(self) -> None:
        self._heap: list[Request] = []

    def add_request(self, request: Request) -> None:
        heapq.heappush(self._heap, request)   # 堆排序：priority 小者优先

    def pop_request(self) -> Request:
        return heapq.heappop(self._heap)`} />

      <CodeBlock language="python" title="SGLang: _set_or_validate_priority (scheduler.py)" code={`def _set_or_validate_priority(self, req):
    if self.enable_priority_scheduling and req.priority is None:
        if self.schedule_low_priority_values_first:
            req.priority = sys.maxsize       # 值大 → 排后
        else:
            req.priority = -sys.maxsize - 1
    elif (not self.enable_priority_scheduling and req.priority is not None
          and self.abort_on_priority_when_disabled):
        ...  # 配置禁止 priority 时，直接 abort 带 priority 的请求`} />

      <Callout type="tip">
        <strong>分析：</strong>优先级语义也一致——<strong>值越小越优先调度</strong>；抢占/驱逐时挑「优先级最差（值最大）」者。
        vLLM 用 <code>max(running, key=(priority, arrival_time))</code> 选 victim（同优先级抢最晚到达的），SGLang 在队列溢出时用 <code>max(enumerate(waiting_queue))</code> 踢人
        （<SrcLink gh="sglang" path="python/sglang/srt/managers/scheduler.py" /> 的 <code>_abort_on_queued_limit</code>）。
        差异在于 SGLang 额外支持<strong>抢占式优先级</strong>（高优先级 waiting 可踢低优先级 running），vLLM 只在本轮 running 内抢。
      </Callout>

      {/* ==================== 8 共同点⑥ 重叠 ==================== */}
      <div className="section-divider"><span>共同点⑥ 调度与执行重叠</span></div>

      <p>
        两者都意识到「等 GPU 回填结果再调度」浪费时间，于是用不同机制把<strong>状态推进与 GPU forward 重叠</strong>，隐藏执行延迟。
      </p>

      <CodeBlock language="python" title="vLLM: AsyncScheduler placeholder 预更新 (async_scheduler.py)" code={`def _update_after_schedule(self, scheduler_output):
    super()._update_after_schedule(scheduler_output)
    for req_id in scheduler_output.num_scheduled_tokens:
        request = self.requests[req_id]
        if request.is_prefill_chunk:
            continue
        # 调度后立即预占 1 + num_spec_tokens 个 token，不等 GPU 回填
        cur_num_spec_tokens = len(spec_decode_tokens.get(req_id, ()))
        request.num_output_placeholders += 1 + cur_num_spec_tokens
        request.spec_token_ids = self._spec_token_placeholders`} />

      <CodeBlock language="python" title="SGLang: event_loop_overlap — 结果延迟一 iter (scheduler.py)" code={`def event_loop_overlap(self):
    self.result_queue = deque()
    while True:
        ...
        batch_result = self.run_batch(batch)      # 当前 GPU forward
        self.result_queue.append((batch.copy(), batch_result))
        # 与当前 forward 重叠处理上一个 batch 的结果
        if self.last_batch:
            pop_and_process()
        ...
        self.last_batch = batch`} />

      <Callout type="tip">
        <strong>分析：</strong>vLLM 的 placeholder 是「<strong>预更新</strong>」——调度完立即把请求状态推到"看起来已生成"的位置，下一轮 schedule 基于 placeholder 计算、不重复调度（见「<a href="/vllm-scheduler">vLLM V1 调度模块</a>」第 9 节）；
        SGLang 是「<strong>延迟处理</strong>」——把上一 iter 的结果处理排进 <code>result_queue</code>，与当前 iter 的 GPU forward 并行跑（见「<a href="/sglang-scheduler">SGLang 调度模块</a>」第 3 节）。
        殊途同归：都是 CPU 状态机不与 GPU 执行串行。
      </Callout>

      {/* ==================== 9 差异点总览 ==================== */}
      <div className="section-divider"><span>差异点总览：七大设计分野</span></div>

      <p>
        共同点回答「都要做什么」，差异点回答「怎么组织才能做到」。七大分野逐项展开见下文：
      </p>
      <table>
        <thead>
          <tr>
            <th>维度</th>
            <th>vLLM V1</th>
            <th>SGLang</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>① 进程模型</strong></td>
            <td>EngineCore 单进程，调度与执行耦合</td>
            <td>独立 Scheduler 进程 + Tokenizer 解耦</td>
          </tr>
          <tr>
            <td><strong>② 前缀缓存</strong></td>
            <td>Block Hash 数组 + <code>find_longest_cache_hit</code></td>
            <td>Radix Tree / UnifiedRadixCache（三层分层）</td>
          </tr>
          <tr>
            <td><strong>③ 调度策略</strong></td>
            <td>FCFS / PRIORITY（2 种）</td>
            <td>LPM / DFS-Weight / FCFS / LOF / RANDOM / ROUTING_KEY（6 种）</td>
          </tr>
          <tr>
            <td><strong>④ 抢占</strong></td>
            <td>统一 regenerate，仅在 running 阶段触发</td>
            <td>retract_decode + 优先级抢占 running + beam 组 abort</td>
          </tr>
          <tr>
            <td><strong>⑤ Token 预算</strong></td>
            <td>固定 <code>max_num_scheduled_tokens</code></td>
            <td>动态估算（可用 + 可驱逐 − 未来 decode 占用）</td>
          </tr>
          <tr>
            <td><strong>⑥ prefill/decode 共存</strong></td>
            <td>token budget 切片，同一调度轮共存</td>
            <td><code>ForwardMode.MIXED</code>：decode 当 1-token extend 并入 prefill</td>
          </tr>
          <tr>
            <td><strong>⑦ 可观测 / 路由联动</strong></td>
            <td>metrics collector + KV events（内部）</td>
            <td>load_publisher / kv_events_publisher 直连 router（闭环）</td>
          </tr>
        </tbody>
      </table>

      {/* ==================== 10 差异点① 进程模型 ==================== */}
      <div className="section-divider"><span>差异点① 进程模型：单循环 vs 独立进程</span></div>

      <h3>vLLM：调度器与执行器共生</h3>
      <p>
        vLLM V1 的 <code>EngineCore</code>（<SrcLink gh="vllm" path="vllm/v1/engine/core.py" />）单进程内同时跑调度、KV 管理和模型执行。
        调度器不是独立服务，而是 <code>step()</code> 里「schedule → execute → update」的中间一环。好处是<strong>调度器天然拿得到最新 GPU 状态</strong>（显存水位、模型输出），不需要额外同步；
        代价是<strong>调度逻辑必须足够快</strong>，否则会卡住整个 GPU 流水线。
      </p>

      <h3>SGLang：调度器独立成进程</h3>
      <p>
        SGLang 的 <code>Scheduler</code>（<SrcLink gh="sglang" path="python/sglang/srt/managers/scheduler.py" />）是独立进程，靠 <code>while True + zmq.NOBLOCK</code> 轮询驱动（见 <SrcLink gh="sglang" path="python/sglang/srt/managers/scheduler_components/request_receiver.py" />），
        idle 时经 <code>IdleSleeper</code> 睡 1 秒省电。TokenizerManager 在另一进程，调度器拿到的已是 token id——<strong>调度器不做 tokenization</strong>，这是「零开销调度」的第一层含义。
        好处是<strong>调度与 GPU 故障隔离、可独立扩展</strong>；代价是跨进程 IPC + 跨 TP/DP/CP rank 广播的开销。
      </p>

      <table>
        <thead>
          <tr>
            <th></th>
            <th>vLLM V1</th>
            <th>SGLang</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>执行循环</td>
            <td><code>run_busy_loop()</code>：schedule→execute→update 原子</td>
            <td>独立进程 <code>event_loop_*</code>，ZMQ 驱动</td>
          </tr>
          <tr>
            <td>请求进入</td>
            <td>ZMQ 收到后先算 block hash（<code>request_block_hasher</code>）</td>
            <td>tokenizer 已转好 token id，直接入 <code>waiting_queue</code></td>
          </tr>
          <tr>
            <td>idle 行为</td>
            <td>busy loop 空转（has_requests 早退）</td>
            <td><code>zmq.Poller().poll(1000)</code> 阻塞省电</td>
          </tr>
        </tbody>
      </table>

      {/* ==================== 11 差异点② 前缀缓存 ==================== */}
      <div className="section-divider"><span>差异点② 前缀缓存：Block Hash vs Radix Tree</span></div>

      <p>
        这是两者最核心的数据结构分野。<strong>vLLM 用哈希</strong>——每 N 个 token 一块，预先计算 block hash（<SrcLink gh="vllm" path="vllm/v1/engine/core.py" /> 里的 <code>request_block_hasher</code>），调度时 <code>find_longest_cache_hit</code> 找最长公共前缀块；
        <strong>SGLang 用树</strong>——以「token 序列为 key、KV pool indices 为 value」的 radix tree（<SrcLink gh="sglang" path="python/sglang/srt/mem_cache/radix_cache.py" />），请求结束时 <code>cache_finished_req</code> 把整段序列插入，共享前缀不重复占 KV pool。
      </p>

      <CodeBlock language="python" title="vLLM: get_computed_blocks — 至少重算 1 token 拿 logits (kv_cache_manager.py)" code={`def get_computed_blocks(self, request):
    if not self.enable_caching or request.skip_reading_prefix_cache:
        return self.empty_kv_cache_blocks, 0
    # 至少重算 1 个 token，保证拿到 logits（输出 token 需要）
    max_cache_hit_length = request.num_tokens - 1
    computed_blocks, num_new_computed_tokens = (
        self.coordinator.find_longest_cache_hit(
            request.block_hashes, max_cache_hit_length))
    return self.create_kv_cache_blocks(computed_blocks), num_new_computed_tokens`} />

      <CodeBlock language="python" title="SGLang: match_prefix — 按 page 对齐沿树匹配 (radix_cache.py)" code={`def match_prefix(self, params) -> MatchResult:
    key = params.key
    if self.disable or len(key) == 0:
        return self._empty_match_result
    key = key.page_aligned(self.page_size)   # 按 page 对齐
    value, last_node = self._match_prefix_helper(self.root_node, key)
    ...
    return MatchResult(device_indices=value, last_device_node=last_node, ...)`} />

      <table>
        <thead>
          <tr>
            <th></th>
            <th>vLLM V1（Block Hash）</th>
            <th>SGLang（Radix Tree）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>匹配粒度</td>
            <td>block（每 N token 一块）</td>
            <td>token 序列，按 <code>page_size</code> 对齐</td>
          </tr>
          <tr>
            <td>命中边界</td>
            <td>至少重算 1 token（保证 logits）</td>
            <td>节点拆分 <code>_split_node</code> 精确切分</td>
          </tr>
          <tr>
            <td>共享复用</td>
            <td>块级复用，靠哈希等价</td>
            <td>请求结束时整段入树，前缀段天然共享</td>
          </tr>
          <tr>
            <td>驱逐</td>
            <td>由 coordinator / BlockPool 管理</td>
            <td><code>evictable_leaves</code> 堆：LRU / LFU / 优先级</td>
          </tr>
          <tr>
            <td>扩展形态</td>
            <td>—</td>
            <td><code>UnifiedRadixCache</code>：device / host / storage 三层</td>
          </tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>分析：</strong>哈希方案的优点是<strong>简单、确定性、无树结构维护</strong>；树方案的优点是<strong>表达力更强</strong>——共享前缀的引用计数、per-node 访问频率（LRU/LFU 驱逐）、优先级驱逐都能精确到节点，
        还能天然承载 <code>UnifiedRadixCache</code> 的分层 cache（GPU 显存放不下时把冷前缀挪到 host / storage，见 <SrcLink gh="sglang" path="python/sglang/srt/mem_cache/unified_radix_cache.py" />）。
        两者的共同点是都承担了「让抢占变便宜」的职责——因为缓存记住了已算过的前缀。
      </Callout>

      {/* ==================== 12 差异点③ 调度策略 ==================== */}
      <div className="section-divider"><span>差异点③ 调度策略：2 种 vs 6 种</span></div>

      <p>
        vLLM 只提供 <strong>FCFS / PRIORITY</strong> 两种策略（<SrcLink gh="vllm" path="vllm/v1/core/sched/request_queue.py" />），并把复杂细节留在「双等待队列 + 跳过」上；
        SGLang 提供 <strong>6 种</strong>，且分成 cache-aware（LPM / DFS-Weight）与 cache-agnostic（FCFS / LOF / RANDOM / ROUTING_KEY）两族（<SrcLink gh="sglang" path="python/sglang/srt/managers/schedule_policy.py" />）。
      </p>

      <CodeBlock language="python" title="SGLang: calc_priority 策略分派 (schedule_policy.py)" code={`def calc_priority(self, waiting_queue, running_batch=None):
    policy = self._determine_active_policy(waiting_queue)
    ...
    if isinstance(policy, CacheAwarePolicy):
        temporary_deprioritized = self._compute_prefix_matches(waiting_queue, policy)
        if policy == CacheAwarePolicy.LPM:
            SchedulePolicy._sort_by_longest_prefix(waiting_queue, temporary_deprioritized)
        elif policy == CacheAwarePolicy.DFS_WEIGHT:
            SchedulePolicy._sort_by_dfs_weight(waiting_queue, self.tree_cache)
    else:
        if policy == CacheAgnosticPolicy.LOF:       ...
        elif policy == CacheAgnosticPolicy.RANDOM:  ...
        elif policy == CacheAgnosticPolicy.ROUTING_KEY: ...`} />

      <table>
        <thead>
          <tr>
            <th>策略</th>
            <th>归属</th>
            <th>排序依据</th>
            <th>适用</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>FCFS</strong></td>
            <td>两者共有</td>
            <td>到达时间</td>
            <td>默认，公平</td>
          </tr>
          <tr>
            <td><strong>PRIORITY</strong></td>
            <td>vLLM 专属</td>
            <td><code>(priority, arrival_time)</code> 堆</td>
            <td>有优先级区分</td>
          </tr>
          <tr>
            <td><strong>LPM</strong></td>
            <td>SGLang</td>
            <td>最长前缀命中</td>
            <td>多轮对话 / Agent</td>
          </tr>
          <tr>
            <td><strong>DFS-Weight</strong></td>
            <td>SGLang</td>
            <td>子树请求数权重</td>
            <td>大量共享前缀</td>
          </tr>
          <tr>
            <td><strong>LOF</strong></td>
            <td>SGLang</td>
            <td>最长输出优先</td>
            <td>离线长生成</td>
          </tr>
          <tr>
            <td><strong>RANDOM / ROUTING_KEY</strong></td>
            <td>SGLang</td>
            <td>随机 / running 同键优先</td>
            <td>负载均衡 / 路由亲和</td>
          </tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>分析：</strong>策略集合的差异本质是「调度器对缓存状态的利用深度」。SGLang 的策略直接消费 radix tree 的前缀信息（<code>num_matched_prefix_tokens</code>）做全局排序，
        甚至做<strong>batch 内前缀共用启发式</strong>（<code>_compute_prefix_matches</code>：多个互享前缀但全局命中短的请求，本 iter 只调一个，其余下 iter 命中它刚写入的 KV）。
        但 SGLang 也为此付出代价——它有一个 <strong>LPM 队列长 &gt; 128 自动降级 FCFS</strong> 的防护，避免前缀匹配的 O(N²) 拖慢调度。
        vLLM 的策略刻意保持简单：把「缓存命中能省多少算力」交给 token budget 与 chunked prefill 隐式表达，而不是显式排序。
      </Callout>

      {/* ==================== 13 差异点④ 抢占 ==================== */}
      <div className="section-divider"><span>差异点④ 抢占机制与触发时机</span></div>

      <p>
        两者都「放回 waiting 重算」，但<strong>触发时机与精细度</strong>不同：
      </p>

      <CodeBlock language="python" title="vLLM: 抢占发生在 running 阶段 allocate_slots 失败时 (scheduler.py)" code={`while True:
    new_blocks = self.kv_cache_manager.allocate_slots(request, num_new_tokens, ...)
    if new_blocks is not None:
        break  # 成功
    # 抢占最低优先级请求
    if self.policy == SchedulingPolicy.PRIORITY:
        preempted_req = max(self.running, key=lambda r: (r.priority, r.arrival_time))
        self.running.remove(preempted_req)
    else:
        preempted_req = self.running.pop()   # FCFS：弹最后进入的（LIFO）
    self._preempt_request(preempted_req, ...)`} />

      <CodeBlock language="python" title="SGLang: check_decode_mem → 先驱逐缓存再 retract (schedule_batch.py)" code={`def check_decode_mem(self, selected_indices=None):
    num_tokens = self.new_tokens_required_next_decode(selected_indices)
    evict_from_tree_cache(self.tree_cache, num_tokens)   # ① 先驱逐树缓存
    return self.token_to_kv_pool_allocator.available_size() >= num_tokens  # ② 再看池水位`} />

      <table>
        <thead>
          <tr>
            <th></th>
            <th>vLLM V1</th>
            <th>SGLang</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>触发时机</td>
            <td>running 阶段 <code>allocate_slots</code> 返回 None</td>
            <td>decode 前 <code>check_decode_mem</code> 不足</td>
          </tr>
          <tr>
            <td>前置缓解</td>
            <td>无（直接抢 running）</td>
            <td>先 <code>evict_from_tree_cache</code> 驱逐缓存</td>
          </tr>
          <tr>
            <td>抢占对象</td>
            <td>policy 决定（PRIORITY 最差 / FCFS LIFO）</td>
            <td><code>_get_decode_retraction_order</code> 顺序 + beam 组整体 abort</td>
          </tr>
          <tr>
            <td>优先级抢占</td>
            <td>仅本轮 running 内部</td>
            <td><code>preempt_to_schedule</code> 高优先级可踢 running（需 <code>enable_priority_preemption</code>）</td>
          </tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>分析：</strong>SGLang 的抢占链条更长也更渐进——<strong>先驱逐树缓存腾空间，再考虑撤回请求</strong>，且 decode 撤回按「最不值得保留」的顺序逐个释放，直到够用为止；
        vLLM 则一步到位：分配失败直接抢一个 running 请求整条重置（regenerate）。前者对显存水位更敏感，后者实现更直接。
      </Callout>

      {/* ==================== 14 差异点⑤ Token 预算 ==================== */}
      <div className="section-divider"><span>差异点⑤ Token 预算：固定 vs 动态估算</span></div>

      <p>
        vLLM 的预算是一步到位算死的：<code>token_budget = max_num_scheduled_tokens</code>（缺省回退 <code>max_num_batched_tokens</code>）。
        SGLang 的 <code>PrefillAdder</code> 则动态计算「还剩多少 token 可调度」：
      </p>

      <CodeBlock language="python" title="SGLang: rem_total_tokens — 动态预算 (schedule_policy.py)" code={`@property
def rem_total_tokens(self):
    # 可用内存 + 可驱逐缓存 − 未来 decode 占用估算
    available_and_evictable = (
        self.token_to_kv_pool_allocator.full_available_size()
        + self.tree_cache.full_evictable_size()
    )
    return available_and_evictable - self.rem_total_token_offset

# rem_total_token_offset 预先扣除每个 running 请求的估算占用：
#   min(max_new_tokens, CLIP) * new_token_ratio
# new_token_ratio 由 NewTokenRatioTracker 动态调整（decode OOM 时衰减，idle 时 reset）`} />

      <Callout type="warning">
        <strong>分析：</strong>这是两者预算哲学的分岔。vLLM 的固定预算<strong>简单、可预测</strong>，但「max_num_scheduled_tokens 设多大」要靠运维调参——设小了浪费 GPU，设大了 decode 可能挤爆显存。
        SGLang 用「<strong>可用显存 + 可驱逐缓存 − 正在跑的 decode 未来占用</strong>」实时计算预算，并用 <code>new_token_ratio_tracker</code> 跟踪实际 token 增长速度、
        decode OOM 时动态调低系数，预算自动贴现实水位。代价是实现复杂度显著上升（见「<a href="/sglang-scheduler">SGLang 调度模块</a>」第 6 节）。
      </Callout>

      {/* ==================== 15 差异点⑥ prefill/decode 共存 ==================== */}
      <div className="section-divider"><span>差异点⑥ prefill/decode 共存方式</span></div>

      <p>
        都解决了「长 prefill 别饿死 decode」，但实现层级不同。vLLM 让 prefill chunk 与 running decode 在<strong>同一调度轮</strong>里共享 token budget（数值层共存）；
        SGLang 更进一步提供 <strong>ForwardMode.MIXED</strong>——把 running decode 请求当「1-token extend」拼进 prefill batch，<strong>一次 forward</strong> 同时完成 prefill 和 decode：
      </p>

      <CodeBlock language="python" title="SGLang: mix_with_running — decode 转 1-token extend (schedule_batch.py)" code={`def mix_with_running(self, running_batch):
    self.forward_mode = ForwardMode.MIXED
    running_bs = running_batch.batch_size()
    for req in running_batch.reqs:
        full_len = len(req.full_untruncated_fill_ids)
        req.set_extend_range(full_len - 1, full_len)   # 只 extend 1 token
    self.merge_batch(running_batch)
    self.extend_lens = self.extend_lens + [1] * running_bs  # decode 请求视作 extend=1
    self.is_prefill_only = False`} />

      <Callout type="tip">
        <strong>分析：</strong>vLLM 靠「预算切片」让两类请求共存于 batch（调度层面），SGLang 靠「把 decode 语义临时改写成 extend」让它们<strong>在 attention 层面共用一次前向</strong>（执行层面）。
        MIXED 需要 attention 后端支持 extend+decode 混合，且要求 decode 的 prefix_lens / extend_lens 计算正确——这是 SGLang 对「prefill iter 里 GPU 只做 prefill、decode 资源空转」的针对性优化。
      </Callout>

      {/* ==================== 16 差异点⑦ 可观测与路由 ==================== */}
      <div className="section-divider"><span>差异点⑦ 可观测性与路由联动</span></div>

      <p>
        vLLM 的调度状态观测偏<strong>内部指标</strong>（metrics collector + KV cache events）。
        SGLang 则把调度器状态<strong>直接广播给上层 router</strong>，形成「调度-路由」闭环：
      </p>

      <CodeBlock language="python" title="SGLang: load_publisher 周期发布 LoadStat (load_publisher.py)" code={`# 每个 Scheduler 在独立 ZMQ PUB socket 周期发布真实负载
#  → sgl-router 的 cache_aware_zmq 策略据此路由：
#     真实队列深度 + 前缀命中统计（谁命中了最多前缀）
def publish_loop(self):
    while True:
        load_stat = LoadStat(...)     # 队列长度 + prefix match 统计
        self.publisher.pub(load_stat.to_pub())`} />

      <Callout type="info">
        <strong>分析：</strong>这是架构差异的自然延伸——vLLM 调度器在 EngineCore 内部，状态天然不外发；SGLang 调度器本就是独立进程、开着 ZMQ 通道，
        于是顺手把 <code>LoadStat</code>（真实队列深度 + 前缀命中）在 PUB socket 上周期广播（<SrcLink gh="sglang" path="python/sglang/srt/managers/scheduler_components/load_publisher.py" />），
        配合 <code>kv_events_publisher</code> 推送 KV 事件。<strong>这就是「<a href="/sglang-gateway">SGLang Model Gateway</a>」中 cache-aware 负载均衡策略能拿到「谁命中最多前缀」数据的数据源头</strong>。
      </Callout>

      {/* ==================== 17 综合对比 ==================== */}
      <div className="section-divider"><span>综合对比：一张表看全</span></div>

      <table>
        <thead>
          <tr>
            <th>维度</th>
            <th>vLLM V1</th>
            <th>SGLang</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>进程结构</td>
            <td>EngineCore 单进程（调度 + 执行耦合）</td>
            <td>独立 Scheduler 进程（TokenizerManager 解耦）</td>
          </tr>
          <tr>
            <td>事件驱动</td>
            <td>busy loop + ZMQ；每步 schedule→execute 原子</td>
            <td>while True + <code>zmq.NOBLOCK</code> 轮询；idle 睡 1s</td>
          </tr>
          <tr>
            <td>前缀缓存</td>
            <td>Block Hash + <code>find_longest_cache_hit</code></td>
            <td>Radix Tree（<code>RadixCache</code> / <code>UnifiedRadixCache</code>）</td>
          </tr>
          <tr>
            <td>调度策略</td>
            <td>FCFS / PRIORITY</td>
            <td>LPM / DFS-Weight / FCFS / LOF / RANDOM / ROUTING_KEY</td>
          </tr>
          <tr>
            <td>Token 预算</td>
            <td>固定 <code>max_num_scheduled_tokens</code></td>
            <td>动态：可用 + 可驱逐 − 未来 decode 估算（<code>new_token_ratio</code>）</td>
          </tr>
          <tr>
            <td>Chunked Prefill</td>
            <td><code>long_prefill_token_threshold</code> + <code>enable_chunked_prefill</code></td>
            <td><code>chunked_prefill_size</code> + mixed chunk + 动态 chunk（PP）</td>
          </tr>
          <tr>
            <td>抢占</td>
            <td>regenerate（<code>num_computed_tokens=0</code>），running 阶段触发</td>
            <td>retract_decode + 优先级抢占 + beam 组 abort</td>
          </tr>
          <tr>
            <td>overlap</td>
            <td><code>AsyncScheduler</code> placeholder 预更新</td>
            <td><code>event_loop_overlap</code> 结果延迟一 iter</td>
          </tr>
          <tr>
            <td>可观测 / 路由</td>
            <td>metrics collector + KV cache events（内部）</td>
            <td>load_publisher / kv_events_publisher（router 数据源）</td>
          </tr>
          <tr>
            <td>代码形态</td>
            <td>Scheduler 类 + AsyncScheduler 子类，单文件组织</td>
            <td>Scheduler + 6 个 mixin + 20+ scheduler_components 子组件</td>
          </tr>
        </tbody>
      </table>

      {/* ==================== 18 结论与选型 ==================== */}
      <div className="section-divider"><span>分析结论与选型建议</span></div>

      <h3>一句话总结</h3>
      <Callout type="warning">
        <strong>共性：</strong>两者都把「<strong>前缀缓存 × 调度决策</strong>」当作吞吐的第一杠杆——缓存命中决定 prefill 从哪开始，抢占成本被缓存兜底。
        <strong>差异：</strong>vLLM V1 用「<strong>EngineCore 单循环 + token budget + block hash</strong>」组织调度，追求每步决策精确、可预测、简单；SGLang 用「<strong>独立进程 + Radix Tree + 缓存感知策略</strong>」组织调度，追求调度决策本身零开销、且与真实显存水位、上层路由深度联动。
        一个像「<strong>精密的定时器</strong>」，一个像「<strong>自治的调度中心</strong>」。
      </Callout>

      <h3>按场景选型</h3>
      <table>
        <thead>
          <tr>
            <th>场景</th>
            <th>推荐</th>
            <th>理由</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>多轮对话 / Agent / few-shot</strong>（前缀复用率高）</td>
            <td>SGLang</td>
            <td>LPM / DFS-Weight 显式缓存感知 + batch 内前缀共用启发式，命中率最高</td>
          </tr>
          <tr>
            <td><strong>稳定生产 + vLLM 生态绑定</strong></td>
            <td>vLLM V1</td>
            <td>调度策略简单可预测，token budget 明确，生态成熟</td>
          </tr>
          <tr>
            <td><strong>需要细粒度优先级抢占</strong></td>
            <td>SGLang</td>
            <td><code>preempt_to_schedule</code> 支持高优先级 waiting 踢低优先级 running</td>
          </tr>
          <tr>
            <td><strong>大 cache / 冷热前缀分层</strong></td>
            <td>SGLang</td>
            <td><code>UnifiedRadixCache</code> device / host / storage 三层，缓存容量可扩展</td>
          </tr>
          <tr>
            <td><strong>调度-路由联动 / 多实例负载均衡</strong></td>
            <td>SGLang</td>
            <td><code>load_publisher</code> 直接暴露真实队列深度 + 前缀命中给 router</td>
          </tr>
          <tr>
            <td><strong>学习调度原理</strong></td>
            <td>vLLM V1</td>
            <td>三步 <code>schedule()</code> 单文件主线清晰，最适合入门</td>
          </tr>
        </tbody>
      </table>

      {/* ==================== 19 资源 ==================== */}
      <div className="section-divider"><span>源码索引</span></div>

      <h3>本文引用的关键源码文件</h3>
      <table>
        <thead>
          <tr>
            <th>文件</th>
            <th>模块</th>
            <th>一句话职责</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><SrcLink gh="vllm" path="vllm/v1/core/sched/scheduler.py" /></td>
            <td>vLLM</td>
            <td>V1 调度器核心：三步 <code>schedule()</code>、抢占、token budget</td>
          </tr>
          <tr>
            <td><SrcLink gh="vllm" path="vllm/v1/core/sched/async_scheduler.py" /></td>
            <td>vLLM</td>
            <td>流水线化调度：placeholder 预更新，schedule/execute 重叠</td>
          </tr>
          <tr>
            <td><SrcLink gh="vllm" path="vllm/v1/core/sched/request_queue.py" /></td>
            <td>vLLM</td>
            <td>FCFS deque / PRIORITY heap 队列抽象</td>
          </tr>
          <tr>
            <td><SrcLink gh="vllm" path="vllm/v1/core/sched/output.py" /></td>
            <td>vLLM</td>
            <td><code>SchedulerOutput</code> / <code>NewRequestData</code> / <code>CachedRequestData</code></td>
          </tr>
          <tr>
            <td><SrcLink gh="vllm" path="vllm/v1/core/kv_cache_manager.py" /></td>
            <td>vLLM</td>
            <td>KV 管理三层：<code>find_longest_cache_hit</code>、<code>allocate_slots</code></td>
          </tr>
          <tr>
            <td><SrcLink gh="vllm" path="vllm/v1/engine/core.py" /></td>
            <td>vLLM</td>
            <td>EngineCore：busy loop、step()、block hasher 初始化</td>
          </tr>
          <tr>
            <td><SrcLink gh="sglang" path="python/sglang/srt/managers/scheduler.py" /></td>
            <td>SGLang</td>
            <td>调度器本体：event loop、<code>get_next_batch_to_run</code>、mixin 组合</td>
          </tr>
          <tr>
            <td><SrcLink gh="sglang" path="python/sglang/srt/managers/schedule_policy.py" /></td>
            <td>SGLang</td>
            <td>调度策略 + <code>PrefillAdder</code> token 预算管家</td>
          </tr>
          <tr>
            <td><SrcLink gh="sglang" path="python/sglang/srt/managers/schedule_batch.py" /></td>
            <td>SGLang</td>
            <td><code>ScheduleBatch</code> / <code>retract_decode</code> / <code>mix_with_running</code></td>
          </tr>
          <tr>
            <td><SrcLink gh="sglang" path="python/sglang/srt/mem_cache/radix_cache.py" /></td>
            <td>SGLang</td>
            <td>Radix Cache：<code>match_prefix</code> / <code>cache_finished_req</code> / LRU-LFU 驱逐</td>
          </tr>
          <tr>
            <td><SrcLink gh="sglang" path="python/sglang/srt/mem_cache/unified_radix_cache.py" /></td>
            <td>SGLang</td>
            <td>device / host / storage 三层分层 cache</td>
          </tr>
          <tr>
            <td><SrcLink gh="sglang" path="python/sglang/srt/managers/scheduler_components/load_publisher.py" /></td>
            <td>SGLang</td>
            <td>向 router 发布真实队列深度 + 前缀命中（cache-aware 路由数据源）</td>
          </tr>
        </tbody>
      </table>

      <ResourceTable
        resources={[
          { name: 'vLLM V1 调度模块（本专题深挖）', url: '/vllm-scheduler', desc: 'Pi-0.5 逐行分析：schedule() 三步循环、regenerate 抢占、AsyncScheduler' },
          { name: 'SGLang 调度模块（本专题深挖）', url: '/sglang-scheduler', desc: 'Pi-0.5 逐行分析：Radix Cache、PrefillAdder、retract_decode、MIXED' },
          { name: 'vLLM GitHub', url: 'https://github.com/vllm-project/vllm', desc: 'V1 Scheduler / KVCacheManager 源码仓库' },
          { name: 'SGLang GitHub', url: 'https://github.com/sgl-project/sglang', desc: 'Scheduler / Radix Cache 源码仓库' },
          { name: 'Efficiently Scaling LLM Inference (SGLang 论文)', url: 'https://arxiv.org/abs/2312.07104', desc: 'RadixAttention 与零开销调度' },
          { name: 'PagedAttention 论文 (SOSP 2023)', url: 'https://arxiv.org/abs/2309.06180', desc: 'KV 分页与调度基础' },
          { name: 'Orca (OSDI 2022)', url: 'https://www.usenix.org/conference/osdi22/presentation/yu', desc: 'Continuous Batching 原始论文' },
        ]}
      />

      <Callout type="tip">
        <strong>下一步建议：</strong>本文是「服务调度」专题的<strong>概览层</strong>。想要 Pi-0.5 粒度的源码细节，请进入
        「<a href="/vllm-scheduler">vLLM V1 调度模块</a>」与「<a href="/sglang-scheduler">SGLang 调度模块</a>」两个子页面；
        若关注调度之上的请求路由层，可前往「<a href="/vllm-router">vLLM Router</a>」与「<a href="/sglang-gateway">SGLang Model Gateway</a>」。
      </Callout>
    </div>
  );
}
