import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

const GH = 'https://github.com/vllm-project/vllm/blob/main';

function SrcLink({ path }: { path: string }) {
  return (
    <a href={`${GH}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function VllmSchedulerPage() {
  return (
    <div className="prose max-w-none">
      <h1>vLLM V1 调度模块 — Scheduler 源码分析</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">⏱️ 阅读约 45 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · 服务调度</span>
      </div>
      <p>
        深入分析 vLLM V1 引擎的调度模块：单轮 <code>schedule()</code> 主循环、双等待队列、Token Budget 控制的 Chunked Prefill、regenerate 式抢占、前缀缓存深度集成、Policy（FCFS/PRIORITY）与 <code>AsyncScheduler</code> 流水线化调度。本节按 <strong>Pi-0.5 粒度</strong>逐步分析——每个关键点附真实源码 + 逐行解释 + 可点击跳转 GitHub 的文件路径。源码基于本地克隆 <code>/data/sd/vllm</code>（仅含 V1 checkout）。
      </p>

      <Callout type="info">
        源码位置：<code>/data/sd/vllm</code>（本地克隆）。核心文件：<SrcLink path="vllm/v1/core/sched/scheduler.py" />（111KB）、<SrcLink path="vllm/v1/core/sched/request_queue.py" />、<SrcLink path="vllm/v1/core/sched/output.py" />、<SrcLink path="vllm/v1/core/kv_cache_manager.py" />、<SrcLink path="vllm/v1/engine/core.py" />。页面内所有 <code>SrcLink</code> 均指向 <code>{'{'}GH{'}'}/&lt;path&gt;</code>（GH = <code>https://github.com/vllm-project/vllm/blob/main</code>）。
      </Callout>

      {/* ===================== 1 调度器在 V1 架构中的位置 ===================== */}
      <div className="section-divider"><span>调度器在 vLLM V1 架构中的位置</span></div>

      <p>
        vLLM V1 采用 <strong>EngineCore</strong> 单进程执行模型：调度（Scheduler）、KV 管理（KVCacheManager）、模型执行（ModelExecutor）全部跑在同一个 <code>EngineCore</code> 循环里，
        通过 ZMQ 与前端 <code>LLMEngine</code> 通信。调度器是每步执行的「大脑」——它决定<strong>这一轮 forward pass 里跑哪些请求、每个请求算多少 token、KV 块怎么分配</strong>。
      </p>

      <MermaidDiagram
        chart={`flowchart LR
    subgraph 前端
        LLM[LLMEngine<br/>LLM / AsyncLLM 层]
    end
    subgraph EngineCore 进程
        CORE[EngineCore busy loop]
        SCH["<b>Scheduler</b><br/>schedule() / update_from_output"]
        KV[KVCacheManager<br/>Coordinator + BlockPool]
        EXEC[ModelExecutor<br/>GPU worker]
        CORE --> SCH
        SCH -->|SchedulerOutput| EXEC
        SCH --> KV
    end
    LLM -->|"ZMQ 请求/输出"| CORE
    CORE -->|"EngineCoreOutputs"| LLM
`}
      />

      <h3>1.1 一次 step 的生命周期</h3>
      <p>
        EngineCore 的 <code>step()</code>（<SrcLink path="vllm/v1/engine/core.py" />）把「调度 → 执行 → 更新」串成一个原子步骤：
      </p>
      <CodeBlock language="python" title="EngineCore.step(): 调度→执行→更新 (vllm/v1/engine/core.py)" code={`def step(self) -> tuple[dict[int, EngineCoreOutputs], bool]:
    if not self.scheduler.has_requests():
        return {}, False
    scheduler_output = self.scheduler.schedule()          # ① 调度：决定本轮跑谁、算多少
    future = self.model_executor.execute_model(
        scheduler_output, non_block=True)                 # ② 异步发起模型执行
    grammar_output = self.scheduler.get_grammar_bitmask(
        scheduler_output)
    with (...):
        model_output = future.result()                    # ③ 等待 GPU 结果
        if model_output is None:
            model_output = self.model_executor.sample_tokens(
                grammar_output)                           # 采样兜底
    self._process_aborts_queue()                          # ④ 处理 abort
    engine_core_outputs = self.scheduler.update_from_output(
        scheduler_output, model_output)                   # ⑤ 用输出推进请求状态
    return engine_core_outputs, scheduler_output.total_num_scheduled_tokens > 0
`}
      />
      <p>
        这个循环被 <code>run_busy_loop()</code>（<SrcLink path="vllm/v1/engine/core.py" />）反复驱动：
      </p>
      <CodeBlock language="python" title="EngineCore busy loop (vllm/v1/engine/core.py)" code={`def run_busy_loop(self):
    """Core busy loop of the EngineCore."""
    while self._handle_shutdown():
        self._process_input_queue()     # 处理新请求 / abort
        self._process_engine_step()     # step() + 输出回传
`}
      />
      <p>
        <strong>理解要点</strong>：调度器不是独立的「排队服务」，而是与模型执行<strong>每步耦合</strong>的决策单元。
        <code>schedule()</code> 的输出（SchedulerOutput）直接决定 ModelExecutor 的输入，因此调度的质量（吞吐、延迟、公平性）就是整个引擎的质量。
      </p>

      {/* ===================== 2 Scheduler 类结构 ===================== */}
      <div className="section-divider"><span>Scheduler 类结构：字段即配置</span></div>

      <h3>2.1 关键数据字段</h3>
      <p>
        <code>Scheduler</code>（<SrcLink path="vllm/v1/core/sched/scheduler.py" />）继承 <code>SchedulerInterface</code>，构造时把 vLLM 配置拍平为可直接查询的内部状态：
      </p>
      <CodeBlock language="python" title="Scheduler.__init__ 关键字段 (vllm/v1/core/sched/scheduler.py)" code={`class Scheduler(SchedulerInterface):
    def __init__(self, ...):
        self.vllm_config = vllm_config
        self.scheduler_config = vllm_config.scheduler_config
        self.cache_config = vllm_config.cache_config
        # ...
        self.max_num_running_reqs = self.scheduler_config.max_num_seqs
        self.max_num_scheduled_tokens = (
            self.scheduler_config.max_num_scheduled_tokens
            if self.scheduler_config.max_num_scheduled_tokens is not None
            else self.scheduler_config.max_num_batched_tokens
        )
        self.max_model_len = vllm_config.model_config.max_model_len
`}
      />
      <p>运行时核心状态（均为 <code>__init__</code> 中初始化）：</p>
      <table>
        <thead>
          <tr>
            <th>字段</th>
            <th>含义</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>self.requests: dict[str, Request]</code></td>
            <td>req_id → Request 的全局映射，所有请求的唯一登记处</td>
          </tr>
          <tr>
            <td><code>self.policy: SchedulingPolicy</code></td>
            <td>调度策略枚举（FCFS / PRIORITY），决定等待队列排序</td>
          </tr>
          <tr>
            <td><code>self.waiting: RequestQueue</code></td>
            <td>等待队列（按策略排序）</td>
          </tr>
          <tr>
            <td><code>self.skipped_waiting: RequestQueue</code></td>
            <td>被跳过等待的请求（remote KV / grammar / streaming 阻塞）</td>
          </tr>
          <tr>
            <td><code>self.running: list[Request]</code></td>
            <td>运行中的请求列表</td>
          </tr>
          <tr>
            <td><code>self.finished_req_ids: set[str]</code></td>
            <td>上一步与当前步之间完成的请求（用于通知 worker 释放）</td>
          </tr>
          <tr>
            <td><code>self._inflight_prefills: set[Request]</code></td>
            <td>仍在 prefill 的请求 + 异步加载中的请求（预留资源保护）</td>
          </tr>
          <tr>
            <td><code>self.token_budget</code></td>
            <td>每一步可调度的 token 总数上限（= <code>max_num_scheduled_tokens</code>）</td>
          </tr>
        </tbody>
      </table>

      <h3>2.2 数值配置速查</h3>
      <CodeBlock language="python" title="三个关键数值 (vllm/v1/core/sched/scheduler.py)" code={`self.max_num_running_reqs = self.scheduler_config.max_num_seqs  # 并发请求上限
self.max_num_scheduled_tokens = (... or ... max_num_batched_tokens) # 单步 token 预算
self.max_model_len = vllm_config.model_config.max_model_len          # 上下文长度上限
`}
      />
      <table>
        <thead>
          <tr>
            <th>配置</th>
            <th>作用</th>
            <th>缺省回退</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>max_num_seqs</code></td>
            <td>running 队列上限，schedule 中 <code>len(self.running) == self.max_num_running_reqs</code> 即停止接纳新请求</td>
            <td>—</td>
          </tr>
          <tr>
            <td><code>max_num_scheduled_tokens</code></td>
            <td>token_budget 初始值，单步可调度的总 token 数</td>
            <td><code>max_num_batched_tokens</code></td>
          </tr>
          <tr>
            <td><code>max_num_batched_tokens</code></td>
            <td>传入 KVCacheManager，用于 coordinator 计算 admission cap（限制单请求可分配的 block 数）</td>
            <td><code>max_model_len</code></td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>理解要点</strong>：<code>max_num_batched_tokens</code> 有双重身份——既是 token budget 的缺省值，又独立参与 KV admission cap 计算。
        即使设置了独立的 <code>max_num_scheduled_tokens</code>，<code>max_num_batched_tokens</code> 依然约束着每个请求最多能占用的 KV 块数，防止超长请求独占显存。
      </p>

      {/* ===================== 3 schedule() 三步主循环 ===================== */}
      <div className="section-divider"><span>schedule() 三步主循环：一次调用，一轮决策</span></div>

      <p>
        <code>schedule()</code>（<SrcLink path="vllm/v1/core/sched/scheduler.py" />）是调度模块的心脏。它在一个调用里完成三步：<strong>① Running 队列调度 → ② Waiting 队列调度 → ③ 构建输出与终态化</strong>。
        注意它是<strong>单轮</strong>遍历，不会在同一轮里回到 running 队列——running 和 waiting 之间的优先级区分靠「先 running 后 waiting」的顺序保证。
      </p>
      <CodeBlock language="python" title="schedule() 骨架 (vllm/v1/core/sched/scheduler.py)" code={`def schedule(self) -> SchedulerOutput:
    self.current_step += 1
    scheduled_new_reqs: list[Request] = []
    scheduled_resumed_reqs: list[Request] = []
    scheduled_running_reqs: list[Request] = []
    preempted_reqs: list[Request] = []
    req_to_new_blocks: dict[str, KVCacheBlocks] = {}
    num_scheduled_tokens: dict[str, int] = {}
    token_budget = self.max_num_scheduled_tokens

    # ---- 第一步：Running 队列 ----
    req_index = 0
    while req_index < len(self.running) and token_budget > 0:
        request = self.running[req_index]
        ...
        # 计算本轮可算的 token 数，尝试分配 KV 块；失败则抢占
        ...

    # ---- 第二步：Waiting 队列 ----
    if not preempted_reqs and self._pause_state == PauseState.UNPAUSED:
        while (self.waiting or self.skipped_waiting) and token_budget > 0:
            ...
            # 前缀缓存命中 → 分配 KV 块 → 移入 running

    # ---- 第三步：构建输出 ----
    ...
    return scheduler_output
`}
      />

      <h3>3.1 第一步：Running 队列（decode 优先）</h3>
      <p>
        先调度 running 请求，保证已开始的请求（decode 阶段）优先继续。循环条件有两个出口：<code>token_budget &lt;= 0</code> 或遍历完所有 running 请求。
        每个请求本轮能算多少 token 由三个量决定：
      </p>
      <CodeBlock language="python" title="Running 请求的 num_new_tokens (vllm/v1/core/sched/scheduler.py)" code={`num_new_tokens = (
    request.num_tokens_with_spec
    + request.num_output_placeholders   # async 模式下已承诺但尚未执行的 token
    - request.num_computed_tokens       # 已算过的 token
)
# long_prefill_token_threshold 截断超长 prefill
if 0 < self.scheduler_config.long_prefill_token_threshold < num_new_tokens:
    num_new_tokens = self.scheduler_config.long_prefill_token_threshold
# 受 token_budget 与上下文上限双重约束
num_new_tokens = min(num_new_tokens, token_budget)
num_new_tokens = min(
    num_new_tokens, self.max_model_len - 1 - request.num_computed_tokens
)
`}
      />
      <p>
        然后调用 <code>kv_cache_manager.allocate_slots()</code> 为这批新 token 分配 KV 块。如果分配失败（显存不足），进入抢占逻辑：
      </p>
      <CodeBlock language="python" title="分配失败触发抢占 (vllm/v1/core/sched/scheduler.py)" code={`with record_function_or_nullcontext("schedule: allocate_slots"):
    while True:
        new_blocks = self.kv_cache_manager.allocate_slots(
            request, num_new_tokens,
            num_lookahead_tokens=self.num_lookahead_tokens,
        )
        if new_blocks is not None:
            break  # 成功

        # 抢占最低优先级请求
        if self.policy == SchedulingPolicy.PRIORITY:
            preempted_req = max(
                self.running,
                key=lambda r: (r.priority, r.arrival_time),
            )
            self.running.remove(preempted_req)
        else:
            preempted_req = self.running.pop()  # FCFS：弹最后进入的

        self._preempt_request(preempted_req, scheduled_timestamp)
        preempted_reqs.append(preempted_req)
        if preempted_req == request:
            break  # 没有更多可抢占的
`}
      />

      <h3>3.2 第二步：Waiting 队列（新请求入场）</h3>
      <p>
        waiting 阶段只有在<strong>没有发生抢占</strong>（<code>not preempted_reqs</code>）且未暂停时才进行——避免「抢占一个又接纳一个」的抖动。
        循环出口三选一：等待队列空、<code>token_budget &lt;= 0</code>、或并发数达上限 <code>len(self.running) == self.max_num_running_reqs</code>。
      </p>
      <CodeBlock language="python" title="Waiting 队列调度骨架 (vllm/v1/core/sched/scheduler.py)" code={`step_skipped_waiting = create_request_queue(self.policy)
while (self.waiting or self.skipped_waiting) and token_budget > 0:
    if len(self.running) == self.max_num_running_reqs:
        break
    request_queue = self._select_waiting_queue_for_scheduling()
    request = request_queue.peek_request()
    # 处理阻塞状态：remote KVs / grammar / streaming
    #  → 移入 skipped_waiting 并跳过
    # 前缀缓存：num_computed_tokens == 0 时查最长缓存命中
    if request.num_computed_tokens == 0:
        new_computed_blocks, num_new_local_computed_tokens = (
            self.kv_cache_manager.get_computed_blocks(request)
        )
    # 计算 num_new_tokens（支持 chunked prefill 截断）
    ...
    new_blocks = self.kv_cache_manager.allocate_slots(request, num_new_tokens)
    if new_blocks is None:
        # 显存不足 → 停止接纳新请求（不抢占 waiting）
        break
    # 移入 running
    self.running.append(request)
    request.status = RequestStatus.RUNNING
`}
      />

      <h3>3.3 第三步：构建 SchedulerOutput</h3>
      <p>
        调度完成后的数据被打包成 <code>SchedulerOutput</code>（<SrcLink path="vllm/v1/core/sched/output.py" />），其中 <code>scheduled_new_reqs</code> 需要把完整 prompt 传给 worker，而 <code>scheduled_cached_reqs</code> 只传增量 diff，大幅减少通信量：
      </p>
      <CodeBlock language="python" title="构建 SchedulerOutput (vllm/v1/core/sched/scheduler.py)" code={`# cascade attention：计算所有 running 请求的最长公共前缀块数
num_common_prefix_blocks = [0] * len(self.kv_cache_config.kv_cache_groups)
if self.running:
    any_request_id = self.running[0].request_id
    num_common_prefix_blocks = (
        self.kv_cache_manager.get_num_common_prefix_blocks(any_request_id)
    )

scheduler_output = SchedulerOutput(
    scheduled_new_reqs=new_reqs_data,
    scheduled_cached_reqs=cached_reqs_data,
    num_scheduled_tokens=num_scheduled_tokens,
    total_num_scheduled_tokens=total_num_scheduled_tokens,
    scheduled_spec_decode_tokens=scheduled_spec_decode_tokens,
    scheduled_encoder_inputs=scheduled_encoder_inputs,
    num_common_prefix_blocks=num_common_prefix_blocks,
    preempted_req_ids={req.request_id for req in preempted_reqs},
    finished_req_ids=self.finished_req_ids,
    free_encoder_mm_hashes=self.encoder_cache_manager.get_freed_mm_hashes(),
    new_block_ids_to_zero=new_block_ids_to_zero,
)
`}
      />

      <h3>3.4 终止条件汇总</h3>
      <table>
        <thead>
          <tr>
            <th>终止条件</th>
            <th>含义</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>token_budget &lt;= 0</code></td>
            <td>本步 token 配额耗尽（同时约束 running 与 waiting）</td>
          </tr>
          <tr>
            <td><code>req_index &gt;= len(self.running)</code></td>
            <td>Running 队列全部遍历完</td>
          </tr>
          <tr>
            <td><code>len(self.running) == self.max_num_running_reqs</code></td>
            <td>达到并发请求数上限（仅 waiting 阶段）</td>
          </tr>
          <tr>
            <td><code>new_blocks is None</code> 且无法再抢占</td>
            <td>显存不足（running 阶段抢占；waiting 阶段直接停止接纳）</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>理解要点</strong>：单轮架构是 V1 与 V0（多轮 <code>schedule_running</code> / <code>schedule_new</code>）的关键差异。V1 把「running 优先 + waiting 补充」压进一次遍历，配合 token budget 实现整个批次的精确上限，这也是 V1 支持 <code>max_num_scheduled_tokens</code> 独立配置的原因。
      </p>

      {/* ===================== 4 Request 状态机 ===================== */}
      <div className="section-divider"><span>Request 生命周期：从 WAITING 到终态</span></div>

      <h3>4.1 Request 数据结构</h3>
      <p>
        <code>Request</code>（<SrcLink path="vllm/v1/request.py" />）是调度的最小单元，字段里同时记录「已算多少」「还要算多少」「前缀缓存哈希」：
      </p>
      <CodeBlock language="python" title="Request.__init__ 关键字段 (vllm/v1/request.py)" code={`class Request:
    def __init__(self, request_id, prompt_token_ids, sampling_params, ...):
        self.request_id = request_id
        self.client_index = client_index
        self.priority = priority
        self.status = RequestStatus.WAITING   # 初始状态
        self.prompt_token_ids = prompt_token_ids
        self.num_prompt_tokens = ...
        self._output_token_ids: list[int] = []
        self._all_token_ids: list[int] = self.prompt_token_ids.copy()
        self.num_output_placeholders = 0     # async 调度用
        self.spec_token_ids: list[int] = []  # speculative decoding
        self.num_computed_tokens = 0         # 已计算 token 数
        self.is_prefill_chunk = False        # 是否为非最终 prefill chunk
        self.num_preemptions = 0             # 被抢占次数
        self.block_hashes: list[BlockHash] = []  # 前缀缓存哈希
`}
      />

      <h3>4.2 RequestStatus 状态机</h3>
      <p>
        <code>RequestStatus</code>（<SrcLink path="vllm/v1/request.py" />）是 <code>IntEnum</code>，关键设计是「终态按数值大小判定」——所有 <code>FINISHED_*</code> 都大于 <code>PREEMPTED</code>：
      </p>
      <CodeBlock language="python" title="RequestStatus 定义 (vllm/v1/request.py)" code={`class RequestStatus(enum.IntEnum):
    WAITING = enum.auto()                                # 刚入队
    WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR = enum.auto()  # 等待 grammar 就绪
    WAITING_FOR_REMOTE_KVS = enum.auto()                 # 等待远程 KV 传输
    WAITING_FOR_STREAMING_REQ = enum.auto()              # 等待 streaming 后续输入
    RUNNING = enum.auto()                                # 正在执行
    PREEMPTED = enum.auto()                              # 被抢占
    # 终态（> PREEMPTED）:
    FINISHED_STOPPED = enum.auto()
    FINISHED_LENGTH_CAPPED = enum.auto()
    FINISHED_ABORTED = enum.auto()
    FINISHED_IGNORED = enum.auto()
    FINISHED_ERROR = enum.auto()
    FINISHED_REPETITION = enum.auto()

    @staticmethod
    def is_finished(status: "RequestStatus") -> bool:
        return status > RequestStatus.PREEMPTED
`}
      />

      <h3>4.3 状态转移</h3>
      <MermaidDiagram
        chart={`stateDiagram-v2
    [*] --> WAITING: 请求入队
    WAITING --> WAITING_FOR_REMOTE_KVS: 等待远程 KV
    WAITING --> WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR: 等待 grammar
    WAITING --> WAITING_FOR_STREAMING_REQ: 等待流式输入
    WAITING --> RUNNING: schedule() 分配 KV 块成功
    WAITING_FOR_REMOTE_KVS --> RUNNING: KV 就绪后重新调度
    WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR --> RUNNING: grammar 就绪
    WAITING_FOR_STREAMING_REQ --> RUNNING: 新输入到达
    RUNNING --> PREEMPTED: 显存不足 allocate_slots 失败
    RUNNING --> FINISHED_STOPPED: EOS / stop token
    RUNNING --> FINISHED_LENGTH_CAPPED: max_tokens / max_model_len
    RUNNING --> FINISHED_ABORTED: 客户端 abort
    RUNNING --> FINISHED_ERROR: 执行异常
    RUNNING --> FINISHED_REPETITION: 重复模式检测
    PREEMPTED --> WAITING: prepend_request 回到队首
    PREEMPTED --> RUNNING: 重新调度（前缀缓存恢复）
`}
      />
      <p>
        <strong>理解要点</strong>：三个 <code>WAITING_FOR_*</code> 中间态不是真正的「等待调度」，而是「暂时不可调度」——调度器见到它们就把请求挪到 <code>skipped_waiting</code>，不占用本轮 token budget，也不阻塞其他请求。
      </p>

      {/* ===================== 5 前缀缓存 ===================== */}
      <div className="section-divider"><span>前缀缓存：KVCacheManager 三层架构</span></div>

      <p>
        vLLM V1 的前缀缓存（APC, Automatic Prefix Caching）通过 <strong>KVCacheManager → KVCacheCoordinator → BlockPool</strong> 三层实现。
        调度器不直接碰 block，而是通过 <code>self.kv_cache_manager</code> 抽象层访问。
      </p>

      <h3>5.1 三层架构</h3>
      <CodeBlock language="python" title="KVCacheManager 初始化 (vllm/v1/core/kv_cache_manager.py)" code={`class KVCacheManager:
    def __init__(self, kv_cache_config, max_model_len, scheduler_block_size,
                 hash_block_size, ...):
        self.enable_caching = enable_caching
        self.coordinator = get_kv_cache_coordinator(
            kv_cache_config=kv_cache_config,
            max_model_len=self.max_model_len,
            max_num_batched_tokens=max_num_batched_tokens,
            use_eagle=self.use_eagle,
            enable_caching=self.enable_caching,
            ...
        )
        self.block_pool = self.coordinator.block_pool
`}
      />
      <table>
        <thead>
          <tr>
            <th>层</th>
            <th>职责</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>KVCacheManager</code></td>
            <td>Scheduler 与底层之间的抽象门面；封装 enable_caching 开关、空缓存短路</td>
          </tr>
          <tr>
            <td><code>KVCacheCoordinator</code></td>
            <td>真实逻辑：<code>find_longest_cache_hit</code> 前缀匹配、<code>allocate_new_blocks</code>、<code>cache_blocks</code>、<code>free</code></td>
          </tr>
          <tr>
            <td><code>BlockPool</code></td>
            <td>物理 KV 块池，管理显存中实际 block 的分配与回收</td>
          </tr>
        </tbody>
      </table>
      <p>
        Scheduler 在构造时创建 <code>KVCacheManager</code>（<SrcLink path="vllm/v1/core/sched/scheduler.py" />），并传递缓存开关：
      </p>
      <CodeBlock language="python" title="Scheduler 创建 KVCacheManager (vllm/v1/core/sched/scheduler.py)" code={`self.kv_cache_manager = KVCacheManager(
    kv_cache_config=kv_cache_config,
    max_model_len=self.max_model_len,
    max_num_batched_tokens=self.scheduler_config.max_num_batched_tokens,
    enable_caching=self.cache_config.enable_prefix_caching,
    use_eagle=self.use_eagle,
    log_stats=self.log_stats,
    enable_kv_cache_events=self.enable_kv_cache_events,
    dcp_world_size=self.dcp_world_size,
    pcp_world_size=self.pcp_world_size,
    scheduler_block_size=self.block_size,
    hash_block_size=hash_block_size,
    metrics_collector=self.kv_metrics_collector,
)
`}
      />

      <h3>5.2 前缀命中：get_computed_blocks</h3>
      <p>
        在 waiting 阶段，新请求（<code>num_computed_tokens == 0</code>）会先查缓存命中。核心逻辑在 <SrcLink path="vllm/v1/core/kv_cache_manager.py" />：
      </p>
      <CodeBlock language="python" title="get_computed_blocks: 最长前缀匹配 (vllm/v1/core/kv_cache_manager.py)" code={`def get_computed_blocks(self, request: Request) -> tuple[KVCacheBlocks, int]:
    if not self.enable_caching or request.skip_reading_prefix_cache:
        return self.empty_kv_cache_blocks, 0
    # 至少重算 1 个 token，保证拿到 logits（输出 token 需要）
    max_cache_hit_length = request.num_tokens - 1
    computed_blocks, num_new_computed_tokens = (
        self.coordinator.find_longest_cache_hit(
            request.block_hashes, max_cache_hit_length
        )
    )
    return self.create_kv_cache_blocks(computed_blocks), num_new_computed_tokens
`}
      />
      <p>
        调度器侧在 waiting 阶段调用（<SrcLink path="vllm/v1/core/sched/scheduler.py" />）：
      </p>
      <CodeBlock language="python" title="schedule() 中查前缀缓存 (vllm/v1/core/sched/scheduler.py)" code={`if request.num_computed_tokens == 0:
    new_computed_blocks, num_new_local_computed_tokens = (
        self.kv_cache_manager.get_computed_blocks(request)
    )
`}
      />

      <h3>5.3 Block Hash 计算</h3>
      <p>
        block hash 在 EngineCore 接收请求时预先算好（<SrcLink path="vllm/v1/engine/core.py" />），缓存在 <code>Request.block_hashes</code> 上：
      </p>
      <CodeBlock language="python" title="EngineCore 初始化 block hasher (vllm/v1/engine/core.py)" code={`self.request_block_hasher: Callable[[Request], list[BlockHash]] | None = None
if vllm_config.cache_config.enable_prefix_caching or kv_connector is not None:
    caching_hash_fn = get_hash_fn_by_name(
        vllm_config.cache_config.prefix_caching_hash_algo
    )
    init_none_hash(caching_hash_fn)
    self.request_block_hasher = get_request_block_hasher(
        hash_block_size, caching_hash_fn
    )
`}
      />
      <p>
        <strong>理解要点</strong>：vLLM V1 用「每 N 个 token 一块」的 block hash 做前缀匹配，命中后 <code>num_computed_tokens</code> 直接跳到命中位置，<strong>prefill 只算未命中的尾部</strong>。这与 SGLang 的 Radix Tree 是两种等价但实现不同的方案——vLLM 用哈希数组 + 最长公共前缀查找，SGLang 用树状结构统一管理。
      </p>

      {/* ===================== 6 Chunked Prefill ===================== */}
      <div className="section-divider"><span>Chunked Prefill：Token Budget 切片</span></div>

      <h3>6.1 触发条件</h3>
      <p>
        waiting 阶段计算 <code>num_new_tokens</code> 时（<SrcLink path="vllm/v1/core/sched/scheduler.py" />），如果启用 chunked prefill，超预算的长 prefill 会被切成多步执行：
      </p>
      <CodeBlock language="python" title="Chunked Prefill 截断逻辑 (vllm/v1/core/sched/scheduler.py)" code={`num_new_tokens = request.num_tokens - num_computed_tokens
threshold = self.scheduler_config.long_prefill_token_threshold
if 0 < threshold < num_new_tokens:
    num_new_tokens = threshold          # 超长 prefill 先截断到阈值

# chunked prefill 必须显式启用；否则超预算直接停止调度
if (
    not self.scheduler_config.enable_chunked_prefill
    and num_new_tokens > token_budget
):
    break

num_new_tokens = min(num_new_tokens, token_budget)   # 再受 token budget 约束
`}
      />
      <p>
        <strong>关键条件</strong>：<code>enable_chunked_prefill=True</code> 才允许把 prefill 切成多片（<code>num_new_tokens &gt; token_budget</code> 时截断到 budget 继续调度）。
        禁用时若新请求超出预算则直接 <code>break</code>，不再调度后续请求——prefill 与 decode 完全互斥，这是旧版行为。
      </p>

      <h3>6.2 Running 队列中的 chunk</h3>
      <p>
        running 阶段的请求同样可能处于 prefill 中间态，<code>long_prefill_token_threshold</code> 同样生效：
      </p>
      <CodeBlock language="python" title="Running 请求的 prefill 截断 (vllm/v1/core/sched/scheduler.py)" code={`num_new_tokens = (
    request.num_tokens_with_spec
    + request.num_output_placeholders
    - request.num_computed_tokens
)
if 0 < self.scheduler_config.long_prefill_token_threshold < num_new_tokens:
    num_new_tokens = self.scheduler_config.long_prefill_token_threshold
num_new_tokens = min(num_new_tokens, token_budget)
num_new_tokens = min(
    num_new_tokens, self.max_model_len - 1 - request.num_computed_tokens
)
`}
      />

      <h3>6.3 is_prefill_chunk 标记</h3>
      <CodeBlock language="python" title="is_prefill_chunk 判定 (vllm/v1/core/sched/scheduler.py)" code={`request.is_prefill_chunk = request.num_computed_tokens < (
    request.num_tokens + request.num_output_placeholders
)
`}
      />
      <p>
        <code>is_prefill_chunk=True</code> 表示该请求仍是 prefill 中间态（非最终 chunk），影响：async scheduling 中不递增 placeholder、structured output 的 grammar 推进节奏。
      </p>

      <h3>6.4 Inflight Prefill 资源预留</h3>
      <p>
        异步 KV 加载场景下，正在 prefill 的请求需要预留其未完成 chunk 的块数，防止被新请求挤占（<SrcLink path="vllm/v1/core/sched/scheduler.py" />）：
      </p>
      <CodeBlock language="python" title="_inflight_prefill_reserved_blocks (vllm/v1/core/sched/scheduler.py)" code={`def _inflight_prefill_reserved_blocks(self) -> int:
    """Blocks in-flight prefills still need to finish (their reservation)."""
    return sum(
        self._request_remaining_blocks(req) for req in self._inflight_prefills
    )
`}
      />

      <MermaidDiagram
        chart={`flowchart LR
    A[长 prefill 请求<br/>prompt = 6000 token] --> B{token_budget = 2048?}
    B -->|"chunked_prefill=True"| C[片1: 2048 token]
    B -->|"enable_chunked_prefill=False"| D[直接 break<br/>等预算足够整条执行]
    C --> E[decode 请求插队]
    E --> C
    C --> C2[片2: 2048 token]
    C2 --> C3[片3: 1904 token]
    C3 --> F[进入 decode 阶段]
`}
      />
      <p>
        <strong>理解要点</strong>：chunked prefill 的本质是「<strong>token budget 切片</strong>」——把大 prefill 切成与 decode 同数量级的 token 片，让它们能在一轮 batch 里共存，降低长 prompt 对延迟波动的拖累。
      </p>

      {/* ===================== 7 抢占 ===================== */}
      <div className="section-divider"><span>抢占：V1 统一为 regenerate</span></div>

      <h3>7.1 触发条件与抢占对象选择</h3>
      <p>
        抢占发生在 running 阶段 <code>allocate_slots()</code> 返回 <code>None</code>（显存不足）时。抢占谁由 policy 决定（<SrcLink path="vllm/v1/core/sched/scheduler.py" />）：
      </p>
      <CodeBlock language="python" title="选择被抢占请求 (vllm/v1/core/sched/scheduler.py)" code={`if self.policy == SchedulingPolicy.PRIORITY:
    preempted_req = max(
        self.running,
        key=lambda r: (r.priority, r.arrival_time),  # 优先级最大（值最大）+ 最晚到达
    )
    self.running.remove(preempted_req)
else:
    preempted_req = self.running.pop()  # FCFS：弹最后进入的（LIFO）
`}
      />
      <p>
        <strong>注意优先级语义</strong>：vLLM 中「priority 值越小越优先调度」，而抢占选的是 <code>max(...)</code> —— 即<strong>抢优先级最差的（值最大）</strong> + 同优先级时最晚到达的。
      </p>

      <h3>7.2 抢占实现：_preempt_request</h3>
      <CodeBlock language="python" title="_preempt_request (vllm/v1/core/sched/scheduler.py)" code={`def _preempt_request(self, request: Request, timestamp: float) -> None:
    assert request.status == RequestStatus.RUNNING
    self.kv_cache_manager.free(request)       # ① 释放 KV blocks
    self.encoder_cache_manager.free(request)  # ② 释放 encoder cache
    self._inflight_prefills.discard(request)
    request.status = RequestStatus.PREEMPTED
    request.num_computed_tokens = 0           # ③ 重置计算位置 → regenerate
    if request.spec_token_ids:
        request.spec_token_ids = []
    request.num_preemptions += 1
    # ...
    self.waiting.prepend_request(request)     # ④ 放回 waiting 队首
`}
      />
      <p>
        <strong>理解要点</strong>：vLLM V1 只有 <strong>regenerate 模式</strong>（<code>num_computed_tokens = 0</code>），没有 V0 的 swap 模式。
        抢占释放的 KV blocks 会被前缀缓存接住——下次该请求被调度时，通过 <code>get_computed_blocks()</code> 快速恢复已算的部分，因此重算成本远低于从头开始。
      </p>

      <h3>7.3 重调度</h3>
      <p>
        被抢占请求通过 <code>prepend_request</code>（队首插入）回到 waiting，下一轮 <code>schedule()</code> 从 waiting 阶段重新调度。此时它的 <code>block_hashes</code> 未变，前缀缓存命中会把 <code>num_computed_tokens</code> 恢复，实现「抢占无痛恢复」。
      </p>

      <table>
        <thead>
          <tr>
            <th>特性</th>
            <th>vLLM V0</th>
            <th>vLLM V1</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>抢占模式</td>
            <td>swap（KV 搬到 CPU）+ recompute 混合</td>
            <td>统一 regenerate（<code>num_computed_tokens=0</code>）</td>
          </tr>
          <tr>
            <td>恢复方式</td>
            <td>swap 块搬回 / 重算</td>
            <td>前缀缓存命中快速恢复</td>
          </tr>
          <tr>
            <td>回队位置</td>
            <td>队首</td>
            <td>队首（<code>prepend_request</code>）</td>
          </tr>
        </tbody>
      </table>

      {/* ===================== 8 Policy 策略 ===================== */}
      <div className="section-divider"><span>Policy：FCFS 与 PRIORITY</span></div>

      <h3>8.1 策略枚举与队列抽象</h3>
      <p>
        vLLM V1 只有两种内置策略，都通过 <code>RequestQueue</code> 抽象实现（<SrcLink path="vllm/v1/core/sched/request_queue.py" />）：
      </p>
      <CodeBlock language="python" title="SchedulingPolicy 与 RequestQueue 抽象 (vllm/v1/core/sched/request_queue.py)" code={`class SchedulingPolicy(Enum):
    FCFS = "fcfs"
    PRIORITY = "priority"

class RequestQueue(ABC):
    @abstractmethod
    def add_request(self, request: Request) -> None: ...
    @abstractmethod
    def pop_request(self) -> Request: ...
    @abstractmethod
    def peek_request(self) -> Request: ...
    @abstractmethod
    def prepend_request(self, request: Request) -> None: ...
    @abstractmethod
    def prepend_requests(self, requests: "RequestQueue") -> None: ...
    @abstractmethod
    def remove_request(self, request: Request) -> None: ...
`}
      />

      <h3>8.2 FCFS 实现</h3>
      <CodeBlock language="python" title="FCFSRequestQueue: 双端队列 (vllm/v1/core/sched/request_queue.py)" code={`class FCFSRequestQueue(deque[Request], RequestQueue):
    def add_request(self, request: Request) -> None:
        self.append(request)        # 队尾加入

    def pop_request(self) -> Request:
        return self.popleft()       # 队首弹出

    def prepend_request(self, request: Request) -> None:
        self.appendleft(request)    # 队首加入（抢占恢复）
`}
      />

      <h3>8.3 PRIORITY 实现</h3>
      <CodeBlock language="python" title="PriorityRequestQueue: 优先队列 (vllm/v1/core/sched/request_queue.py)" code={`class PriorityRequestQueue(RequestQueue):
    """Respects the ordering defined in the Request class, where
    requests with a smaller value of 'priority' are processed first.
    If multiple requests have the same priority, the one with the earlier
    'arrival_time' is processed first."""

    def __init__(self) -> None:
        self._heap: list[Request] = []

    def add_request(self, request: Request) -> None:
        heapq.heappush(self._heap, request)   # 堆排序

    def pop_request(self) -> Request:
        return heapq.heappop(self._heap)
`}
      />
      <p>
        排序键是 <code>(priority, arrival_time)</code> 二元组——priority 小者优先，同优先级按到达先后。工厂函数：
      </p>
      <CodeBlock language="python" title="create_request_queue 工厂 (vllm/v1/core/sched/request_queue.py)" code={`def create_request_queue(policy: SchedulingPolicy) -> RequestQueue:
    if policy == SchedulingPolicy.PRIORITY:
        return PriorityRequestQueue()
    elif policy == SchedulingPolicy.FCFS:
        return FCFSRequestQueue()
    else:
        raise ValueError(f"Unknown scheduling policy: {policy}")
`}
      />

      <h3>8.4 双等待队列</h3>
      <p>
        Scheduler 持有两条等待队列（<SrcLink path="vllm/v1/core/sched/scheduler.py" />）：
      </p>
      <CodeBlock language="python" title="waiting + skipped_waiting (vllm/v1/core/sched/scheduler.py)" code={`self.waiting = create_request_queue(self.policy)
self.skipped_waiting = create_request_queue(self.policy)
`}
      />
      <p>
        <code>skipped_waiting</code> 存放被异步依赖阻塞的请求。调度时通过 <code>_select_waiting_queue_for_scheduling()</code> 合并选择：
      </p>
      <CodeBlock language="python" title="_select_waiting_queue_for_scheduling (vllm/v1/core/sched/scheduler.py)" code={`def _select_waiting_queue_for_scheduling(self) -> RequestQueue | None:
    if self.policy == SchedulingPolicy.FCFS:
        return self.skipped_waiting or self.waiting or None
    # PRIORITY mode: compare queue heads
    if self.waiting and self.skipped_waiting:
        waiting_req = self.waiting.peek_request()
        skipped_req = self.skipped_waiting.peek_request()
        return self.waiting if waiting_req < skipped_req else self.skipped_waiting
    return self.waiting or self.skipped_waiting or None
`}
      />
      <p>
        <strong>理解要点</strong>：FCFS 模式 `skipped_waiting` 恒优先于 `waiting`（避免阻塞请求被饿死）；PRIORITY 模式则比较两条队列头部，保证全局优先级序不被「跳过」破坏。
      </p>

      {/* ===================== 9 AsyncScheduler ===================== */}
      <div className="section-divider"><span>AsyncScheduler：流水线化调度</span></div>

      <p>
        <code>AsyncScheduler</code>（<SrcLink path="vllm/v1/core/sched/async_scheduler.py" />）继承 <code>Scheduler</code>，是 V1 默认启用的调度器。核心思想：<strong>调度完成后立即推进请求状态，不等模型执行</strong>，让 schedule 与 execute 在时间上重叠。
      </p>

      <h3>9.1 为什么分离</h3>
      <CodeBlock language="python" title="AsyncScheduler 构造 (vllm/v1/core/sched/async_scheduler.py)" code={`class AsyncScheduler(Scheduler):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._spec_token_placeholders: list[int] = [-1] * self.num_spec_tokens
        self.pp_size = self.parallel_config.pipeline_parallel_size
`}
      />

      <h3>9.2 placeholder 机制</h3>
      <p>
        普通 Scheduler 要等模型输出回填 <code>num_computed_tokens</code> 才能进入下一轮；AsyncScheduler 在调度时先用 <strong>placeholder</strong> 预占 token 数，让下一轮 schedule 立即可见新状态：
      </p>
      <CodeBlock language="python" title="_update_after_schedule (vllm/v1/core/sched/async_scheduler.py)" code={`def _update_after_schedule(self, scheduler_output: SchedulerOutput) -> None:
    super()._update_after_schedule(scheduler_output)
    spec_decode_tokens = scheduler_output.scheduled_spec_decode_tokens
    for req_id in scheduler_output.num_scheduled_tokens:
        request = self.requests[req_id]
        if request.is_prefill_chunk:
            continue
        # 请求将生成 1 + num_spec_tokens 个新 token
        cur_num_spec_tokens = len(spec_decode_tokens.get(req_id, ()))
        request.num_output_placeholders += 1 + cur_num_spec_tokens
        request.spec_token_ids = self._spec_token_placeholders

        if self.use_v2_model_runner:
            request.next_decode_eligible_step = self.current_step + self.pp_size
`}
      />
      <p>
        <strong>理解要点</strong>：placeholder 是「已承诺但未执行」的 token 数。<code>num_computed_tokens = num_tokens - num_output_placeholders</code> 隐含地被提前，下一轮 schedule 计算 <code>num_new_tokens</code> 时会把已承诺的部分减掉，从而不重复调度。
      </p>

      <h3>9.3 输出回填时的处理</h3>
      <CodeBlock language="python" title="_update_request_with_output (vllm/v1/core/sched/async_scheduler.py)" code={`def _update_request_with_output(self, request, new_token_ids):
    if request.async_tokens_to_discard > 0:
        # 丢弃 stale in-flight async output
        request.async_tokens_to_discard -= 1
        return [], False

    status_before_update = request.status
    new_token_ids, stopped = super()._update_request_with_output(
        request, new_token_ids)

    # 递减 placeholder，兑现承诺
    request.num_output_placeholders -= len(new_token_ids)
    assert request.num_output_placeholders >= 0

    # 缓存 blocks（增量）
    if status_before_update == RequestStatus.RUNNING:
        self.kv_cache_manager.cache_blocks(
            request, request.num_computed_tokens - request.num_output_placeholders
        )
    return new_token_ids, stopped
`}
      />

      <MermaidDiagram
        chart={`sequenceDiagram
    participant S as AsyncScheduler
    participant M as ModelExecutor
    Note over S,M: step N
    S->>S: schedule() → SchedulerOutput
    S->>M: execute_model(non_block=True)
    S->>S: 立即更新 placeholder<br/>(num_output_placeholders)
    Note over S: step N+1 无需等 GPU<br/>直接基于 placeholder 计算
    M-->>S: model_output 到达
    S->>S: 兑现 placeholder + cache_blocks
`}
      />
      <p>
        <strong>理解要点</strong>：普通调度是「调度 → 执行 → 更新 → 再调度」的串行；AsyncScheduler 把「更新」拆成「placeholder 预更新」和「输出兑现」两半，实现 schedule/execute 重叠，是 V1 高吞吐的关键之一。
      </p>

      {/* ===================== 10 SchedulerOutput 数据结构 ===================== */}
      <div className="section-divider"><span>SchedulerOutput：调度结果契约</span></div>

      <p>
        <code>SchedulerOutput</code>（<SrcLink path="vllm/v1/core/sched/output.py" />）是 Scheduler 与 ModelExecutor 之间的数据契约，也是 EngineCore 组装 GPU 输入的依据：
      </p>
      <CodeBlock language="python" title="SchedulerOutput dataclass (vllm/v1/core/sched/output.py)" code={`@dataclass
class SchedulerOutput:
    # 首次调度的请求数据（需要完整传输到 worker）
    scheduled_new_reqs: list[NewRequestData]
    # 已缓存请求的增量数据（只传输 diff）
    scheduled_cached_reqs: CachedRequestData
    # req_id -> num_scheduled_tokens
    num_scheduled_tokens: dict[str, int]
    # 总调度 token 数
    total_num_scheduled_tokens: int
    # req_id -> spec_token_ids（speculative decoding）
    scheduled_spec_decode_tokens: dict[str, list[int]]
    # req_id -> encoder input indices
    scheduled_encoder_inputs: dict[str, list[int]]
    # 公共前缀 block 数（cascade attention）
    num_common_prefix_blocks: list[int]
    # 完成的请求 ID（通知 worker 释放状态）
    finished_req_ids: set[str]
    # 要释放的 encoder mm_hash
    free_encoder_mm_hashes: list[str]
    # 被抢占的请求（v2 model runner）
    preempted_req_ids: set[str] | None = None
    # 是否有 structured output 请求
    has_structured_output_requests: bool = False
    # structured output tokens 是否就绪
    pending_structured_output_tokens: bool = False
    # 无效 spec token 计数
    num_invalid_spec_tokens: dict[str, int] | None = None
    # KV Connector 元数据
    kv_connector_metadata: KVConnectorMetadata | None = None
    # EC Connector 元数据
    ec_connector_metadata: ECConnectorMetadata | None = None
    # 需要清零的新 block IDs
    new_block_ids_to_zero: list[int] | None = None
`}
      />

      <h3>10.1 NewRequestData 与 CachedRequestData</h3>
      <p>
        新请求需要完整数据（<code>NewRequestData</code>），已调度过的请求只传增量（<code>CachedRequestData</code>）：
      </p>
      <CodeBlock language="python" title="NewRequestData (vllm/v1/core/sched/output.py)" code={`@dataclass
class NewRequestData:
    req_id: str
    prompt_token_ids: list[int] | None
    mm_features: list[MultiModalFeatureSpec]
    sampling_params: SamplingParams | None
    pooling_params: PoolingParams | None
    block_ids: tuple[list[int], ...]
    num_computed_tokens: int
    lora_request: LoRARequest | None
    prompt_embeds: "torch.Tensor | None" = None
    prefill_token_ids: list[int] | None = None   # v2 model runner 专用
`}
      />
      <CodeBlock language="python" title="CachedRequestData (vllm/v1/core/sched/output.py)" code={`@dataclass
class CachedRequestData:
    req_ids: list[str]
    resumed_req_ids: set[str]              # 被抢占后恢复的请求
    new_token_ids: list[list[int]]         # PP 模式用
    all_token_ids: dict[str, list[int]]    # 完整 token 序列（connector 用）
    new_block_ids: list[tuple[list[int], ...] | None]
    num_computed_tokens: list[int]
    num_output_tokens: list[int]
`}
      />
      <p>
        <strong>理解要点</strong>：<code>NewRequestData</code> vs <code>CachedRequestData</code> 的区分是性能设计——首调请求把完整 prompt + block 布局发给 worker，之后每步只发 token 增量，避免每步重复序列化整个上下文。
      </p>

      {/* ===================== 11 与 V0 / SGLang 对比 ===================== */}
      <div className="section-divider"><span>与 vLLM V0 / SGLang 的调度对比</span></div>

      <h3>11.1 vLLM V1 vs V0</h3>
      <table>
        <thead>
          <tr>
            <th>维度</th>
            <th>V0 Scheduler</th>
            <th>V1 Scheduler</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>调度循环</td>
            <td>多轮（<code>schedule_running</code> / <code>schedule_new</code> 分开）</td>
            <td>单轮 <code>schedule()</code>，running → waiting 一次遍历</td>
          </tr>
          <tr>
            <td>Token 预算</td>
            <td><code>max_num_batched_tokens</code> 单一</td>
            <td><code>max_num_scheduled_tokens</code> 独立可配</td>
          </tr>
          <tr>
            <td>抢占</td>
            <td>swap + recompute</td>
            <td>统一 regenerate</td>
          </tr>
          <tr>
            <td>异步调度</td>
            <td>无</td>
            <td><code>AsyncScheduler</code> placeholder 流水线化</td>
          </tr>
          <tr>
            <td>KV 管理层</td>
            <td>BlockManager</td>
            <td>KVCacheManager → Coordinator → BlockPool</td>
          </tr>
          <tr>
            <td>公共前缀</td>
            <td>无</td>
            <td><code>num_common_prefix_blocks</code>（cascade attention）</td>
          </tr>
        </tbody>
      </table>

      <h3>11.2 vLLM V1 vs SGLang</h3>
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
            <td>调度器位置</td>
            <td>EngineCore 进程内，每步与模型执行耦合</td>
            <td>独立 scheduler 线程/进程（零开销），与 tokenizer 异步解耦</td>
          </tr>
          <tr>
            <td>前缀缓存</td>
            <td>Block Hash 数组 + <code>find_longest_cache_hit</code></td>
            <td>Radix Tree（<code>RadixCache</code>），统一管理所有 KV 状态</td>
          </tr>
          <tr>
            <td>预填切片</td>
            <td>Chunked Prefill（token budget 截断）</td>
            <td>Chunked Prefill（按 chunk size 分批，含 continuous batch 合并）</td>
          </tr>
          <tr>
            <td>抢占</td>
            <td>regenerate（前缀缓存恢复）</td>
            <td>请求重算 + 缓存复用（更精细的缓存感知）</td>
          </tr>
          <tr>
            <td>策略</td>
            <td>FCFS / PRIORITY</td>
            <td>FCFS / SJF / LCF / cache-aware（CacheAwarePolicy）</td>
          </tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>共性与差异一句话：</strong>两者的共性是把「前缀缓存」与「调度决策」深度耦合（缓存命中决定 prefill 从哪开始）。
        差异在于组织方式——vLLM 把调度放进 EngineCore 单循环、用「token budget + block hash」管理；SGLang 把调度独立成 zero-overhead 循环、用「Radix Tree + cache-aware 策略」管理。
        详细 SGLang 侧分析见「<a href="/sglang-scheduler">SGLang 调度模块</a>」页面。
      </Callout>

      {/* ===================== 12 资源 ===================== */}
      <div className="section-divider"><span>源码索引</span></div>

      <ResourceTable
        resources={[
          { name: 'vLLM GitHub', url: 'https://github.com/vllm-project/vllm', desc: 'V1 Scheduler 源码仓库' },
          { name: 'vLLM 官方文档', url: 'https://docs.vllm.ai', desc: '调度 / KV Cache / 性能文档' },
          { name: 'PagedAttention 论文 (SOSP 2023)', url: 'https://arxiv.org/abs/2309.06180', desc: 'KV 分页与调度基础' },
        ]}
      />

      <Callout type="tip">
        <strong>下一步建议：</strong>读完本页的 vLLM 调度逻辑后，建议接着阅读「<a href="/sglang-scheduler">SGLang 调度模块</a>」页面对照学习；
        若关注上层路由，可前往「<a href="/serving-scheduler">服务调度概览</a>」了解 Continuous Batching / Chunked Prefill / 公平性的通用概念。
      </Callout>
    </div>
  );
}
