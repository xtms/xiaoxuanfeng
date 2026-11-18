import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

const GH = 'https://github.com/sgl-project/sglang/blob/main';

function SrcLink({ path }: { path: string }) {
  return (
    <a href={`${GH}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function SGLangSchedulerPage() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="SGLang 调度模块 — Scheduler 源码分析"
        date="更新于 2026-09"
        readingTime="阅读约 50 分钟"
        tags={['专题', '服务调度']}
      />
      <p>
        深入分析 SGLang 的调度模块：单线程 polling 事件循环 + 跨 GPU stream overlap、<code>get_next_batch_to_run</code> 的 prefill/decode 决策、
        <code>PrefillAdder</code> 的 token 预算管家、Radix Cache 前缀匹配与 LRU/LFU 驱逐、cache-aware 调度策略（LPM / DFS-Weight / FCFS / LOF）、
        decode 抢占（retract_decode）与 mixed chunk（prefill + decode 同一次 forward）。本节按 <strong>Pi-0.5 粒度</strong>逐步分析——每个关键点附真实源码 + 逐行解释 + 可点击跳转 GitHub 的文件路径。
      </p>

      <Callout type="info">
        源码位置：<code>/data/sd/sglang</code>（本地克隆）。核心文件：<SrcLink path="python/sglang/srt/managers/scheduler.py" />（237KB）、<SrcLink path="python/sglang/srt/managers/schedule_batch.py" />、<SrcLink path="python/sglang/srt/managers/schedule_policy.py" />、<SrcLink path="python/sglang/srt/mem_cache/radix_cache.py" />、<SrcLink path="python/sglang/srt/mem_cache/unified_radix_cache.py" />，以及 <code>scheduler_components/</code> 下 20+ 子组件。页面内所有 <code>SrcLink</code> 均指向 <code>{'{'}GH{'}'}/&lt;path&gt;</code>（GH = <code>https://github.com/sgl-project/sglang/blob/main</code>）。
      </Callout>

      {/* ===================== 1 Scheduler 在 SGLang 架构中的位置 ===================== */}
      <div className="section-divider"><span>Scheduler 在 SGLang 架构中的位置</span></div>

      <p>
        SGLang 采用 <strong>TokenizerManager → Scheduler → ModelWorker</strong> 三段式进程结构。调度器是独立进程，通过 ZMQ 与上游 tokenizer 和下游 GPU worker 通信。
        与 vLLM 把调度放进 EngineCore 单循环不同，SGLang 的 Scheduler 是<strong>独立的 CPU 调度循环</strong>——它不阻塞 GPU，而是持续决策下一批该跑什么。
      </p>

      <MermaidDiagram
        chart={`flowchart LR
    subgraph 进程1
        TM[TokenizerManager<br/>http server + tokenize]
    end
    subgraph 进程2 [Scheduler 进程 · CPU]
        S[<b>Scheduler</b><br/>event loop<br/>get_next_batch_to_run]
        RC[RadixCache<br/>mem_cache/radix_cache.py]
        COMP[scheduler_components/<br/>20+ 子组件]
        S --> RC
    end
    subgraph 进程3 [GPU Worker]
        MW[ModelWorker<br/>forward_batch_generation]
    end
    TM -->|"ZMQ: TokenizedGenerateReqInput"| S
    S -->|"ScheduleBatch / ForwardBatch"| MW
    MW -->|"BatchTokenIDOutput"| TM
`}
      />

      <h3>1.1 事件驱动方式：ZMQ 非阻塞轮询</h3>
      <p>
        调度循环是 <strong>while True + zmq.NOBLOCK 轮询</strong>，不是 epoll 事件回调。每次循环把所有可用的请求拉完（受 <code>max_recv_per_poll</code> 限制），然后立刻进入调度决策：
      </p>
      <CodeBlock language="python" title="_pull_raw_reqs: 非阻塞拉取 (scheduler_components/request_receiver.py)" code={`def _pull_raw_reqs(self) -> Optional[List]:
    if self.ps.pp_rank == 0:
        if self.ps.attn_tp_rank == 0 and self.ps.attn_cp_rank == 0:
            recv_reqs = []
            # RustServer 模式：从 ring buffer 一次性 drain
            if envs.SGLANG_RUST_SERVER.get():
                recv_reqs.extend(
                    self.recv_from_tokenizer.drain(self.max_recv_per_poll)
                )
                return recv_reqs
            # Python 模式：非阻塞 recv，直到 socket 空或达到上限
            while True:
                try:
                    if self.recv_limit_reached(len(recv_reqs)):
                        break
                    recv_req = sock_recv(self.recv_from_tokenizer, zmq.NOBLOCK)
                except zmq.ZMQError:
                    break
                recv_reqs.append(recv_req)
            # RPC 通道同理
            ...
            return recv_reqs
`}
      />
      <p>
        Idle 时通过 <code>IdleSleeper</code>（<SrcLink path="python/sglang/srt/managers/scheduler_components/idle_sleeper.py" />）让 CPU 睡 1 秒省电：
      </p>
      <CodeBlock language="python" title="IdleSleeper: 省电轮询 (scheduler_components/idle_sleeper.py)" code={`class IdleSleeper:
    def __init__(self, sockets):
        self.poller = zmq.Poller()
        self.last_empty_time = real_time()
        for s in sockets:
            self.poller.register(s, zmq.POLLIN)
        self.empty_cache_interval = envs.SGLANG_EMPTY_CACHE_INTERVAL.get()

    def maybe_sleep(self):
        self.poller.poll(1000)   # 阻塞最多 1s，有请求立即唤醒
        if (self.empty_cache_interval > 0
            and real_time() - self.last_empty_time > self.empty_cache_interval):
            self.last_empty_time = real_time()
            current_platform.empty_cache()
`}
      />

      <h3>1.2 请求分发：TypeBasedDispatcher</h3>
      <p>
        Scheduler 收到的消息类型繁多（生成/嵌入/批量/flush/abort/session/权重热更新/shutdown），通过类型分派器按请求类型路由到对应 handler（<SrcLink path="python/sglang/srt/managers/scheduler.py" />）：
      </p>
      <CodeBlock language="python" title="TypeBasedDispatcher 分发表 (scheduler.py)" code={`self._request_dispatcher = TypeBasedDispatcher([
    (TokenizedGenerateReqInput,   self.handle_generate_request),
    (TokenizedEmbeddingReqInput,  self.handle_embedding_request),
    (BatchTokenizedGenerateReqInput, self.handle_batch_generate_request),
    (BatchTokenizedEmbeddingReqInput, self.handle_batch_embedding_request),
    (FlushCacheReqInput,          self.flush_wrapper.handle),
    (ClearHiCacheReqInput,        self.clear_hicache_storage_wrapped),
    (AbortReq,                    self.abort_request),
    (OpenSessionReqInput,         self.open_session),
    (CloseSessionReqInput,        self.close_session),
    (UpdateWeightFromDiskReqInput, self.weight_updater.update_weights_from_disk),
    ...
    (ShutdownReq, self.handle_shutdown),
    ...
])
`}
      />
      <p>
        <strong>理解要点</strong>：SGLang 把「收请求」和「调度」解耦——tokenizer 已把文本转成 token id，Scheduler 拿到的就是可直接调度的 <code>Req</code> 对象。
        这是「零开销调度」的第一步：调度器本身不做 tokenization。
      </p>

      {/* ===================== 2 Scheduler 类结构与初始化 ===================== */}
      <div className="section-divider"><span>Scheduler 类结构：mixin 组合 + 编排器初始化</span></div>

      <h3>2.1 多 mixin 组合</h3>
      <p>
        <code>Scheduler</code>（<SrcLink path="python/sglang/srt/managers/scheduler.py" />）通过多个 mixin 组合不同调度路径（PP / Disaggregation / PD-Multiplex / DLLM / MLX overlap）：
      </p>
      <CodeBlock language="python" title="Scheduler 类定义 (scheduler.py)" code={`class Scheduler(
    SchedulerDisaggregationDecodeMixin,
    SchedulerDisaggregationPrefillMixin,
    SchedulerMultiplexMixin,
    SchedulerPPMixin,
    SchedulerDllmMixin,
    SchedulerMlxOverlapMixin,
):
    """A scheduler that manages a tensor parallel GPU worker."""
`}
      />
      <p>
        <code>__init__</code> 被刻意设计成「编排器」——只做 <code>init_*</code> 子方法调用，不堆业务逻辑。初始化顺序（行 428-617）：
      </p>
      <CodeBlock language="python" title="__init__ 编排器骨架 (scheduler.py)" code={`self.init_startup_timing_begin()
self.is_initializing = True
self.forward_ct: int = 0
self.init_soft_watchdog()
...
self.init_model_config()                      # 模型配置
self.init_ipc_channels(port_args)             # 建 zmq socket
self.init_idle_sleeper()                      # 省电
self.init_tokenizer()
self.init_model_worker()
result = kv_cache_builder.build_kv_cache(...) # 建 KV cache + radix tree
self.req_to_token_pool = result.req_to_token_pool
self.token_to_kv_pool_allocator = result.token_to_kv_pool_allocator
self.disable_radix_cache = result.disable_radix_cache
self.tree_cache = result.tree_cache           # RadixCache 或 UnifiedRadixCache
`}
      />
      <p>
        关键结构说明：<code>tree_cache</code> 由 <code>kv_cache_builder</code> 创建——禁用时是 <code>ChunkCache</code>（不做前缀共享），否则是 <code>RadixCache</code> 或 <code>UnifiedRadixCache</code>（开启分层 cache 时）。
      </p>

      <h3>2.2 运行状态初始化</h3>
      <CodeBlock language="python" title="init_running_status (scheduler.py)" code={`def init_running_status(self):
    self.gracefully_exit = False
    self.waiting_queue: List[Req] = []              # 等待队列
    self.running_batch: ScheduleBatch = ScheduleBatch(reqs=[], batch_is_full=False)
    self.cur_batch_for_debug: Optional[ScheduleBatch] = None
    self.last_batch: Optional[ScheduleBatch] = None
    self.forward_ct = 0
    self.flush_wrapper = SchedulerFlushWrapper(...)
    self._engine_paused = False
`}
      />
      <p>
        与 vLLM 不同，SGLang 没有 <code>skipped_waiting</code>——阻塞（grammar 未就绪）的请求由 <code>grammar_manager</code> 单独持有，就绪后再放回 <code>waiting_queue</code>。
      </p>

      {/* ===================== 3 主事件循环 ===================== */}
      <div className="section-divider"><span>主事件循环：一次 iter 的完整旅程</span></div>

      <h3>3.1 五种循环模式</h3>
      <p>
        <code>dispatch_event_loop</code>（<SrcLink path="python/sglang/srt/managers/scheduler.py" />）按 P/D 分离模式与并行配置分派：
      </p>
      <CodeBlock language="python" title="dispatch_event_loop (scheduler.py)" code={`def dispatch_event_loop(scheduler: Scheduler):
    disaggregation_mode = scheduler.disaggregation_mode
    if disaggregation_mode == DisaggregationMode.NULL:
        if scheduler.enable_pdmux:            scheduler.event_loop_pdmux()
        elif get_parallel().pp_size > 1:      scheduler.event_loop_pp()
        elif scheduler.enable_overlap_mlx:    scheduler.event_loop_overlap_mlx()
        elif scheduler.enable_overlap:        scheduler.event_loop_overlap()
        else:                                 scheduler.event_loop_normal()
    elif disaggregation_mode == DisaggregationMode.PREFILL:
        ...   # pp / overlap / normal 三种 disagg prefill 循环
    elif disaggregation_mode == DisaggregationMode.DECODE:
        ...   # pp / overlap / normal 三种 disagg decode 循环
`}
      />

      <h3>3.2 event_loop_normal：基础循环</h3>
      <CodeBlock language="python" title="event_loop_normal (scheduler.py)" code={`def event_loop_normal(self):
    """A normal scheduler loop."""
    while True:
        if self.gracefully_exit:
            break
        # ① 从 ZMQ socket 收请求
        recv_reqs = self.request_receiver.recv_requests()
        self.process_input_requests(recv_reqs)
        if self._engine_paused:
            continue
        # ② 决策下一批（prefill 优先，fallback decode）
        plan = self.get_next_batch_to_run(
            running_batch=self.running_batch, last_batch=self.last_batch
        )
        self.running_batch = plan.running_batch
        batch = plan.batch_to_run
        # ③ 执行前向或 idle
        if batch:
            result = self.run_batch(batch)
            self.process_batch_result(batch, result)
        else:
            self._sched_idled = True
            self.on_idle()
        self.last_batch = batch
`}
      />

      <h3>3.3 event_loop_overlap：GPU/CPU 重叠</h3>
      <p>
        overlap 模式把 <code>process_batch_result</code> 延迟一个 iter——当前 batch 的 GPU forward 与上一个 batch 的结果处理并行（<SrcLink path="python/sglang/srt/managers/scheduler.py" />）：
      </p>
      <CodeBlock language="python" title="event_loop_overlap (scheduler.py)" code={`def event_loop_overlap(self):
    self.result_queue: Deque[Tuple[ScheduleBatch, ...]] = deque()
    def pop_and_process():
        tmp_batch, tmp_result = self.result_queue.popleft()
        self.process_batch_result(tmp_batch, tmp_result)

    while True:
        ...
        recv_reqs = self.request_receiver.recv_requests()
        self.process_input_requests(recv_reqs)
        plan = self.get_next_batch_to_run(...)
        batch = plan.batch_to_run
        if batch:
            batch_result = self.run_batch(batch)      # 当前 GPU forward
            self._apply_war_barrier()
            self.result_queue.append((batch.copy(), batch_result))
        # 与当前 forward 重叠处理上一个 batch 的结果
        if self.last_batch:
            if not disable_overlap_for_batch:
                pop_and_process()
        elif batch is None:
            self.on_idle()
        # grammar 采样依赖 last batch 结果，必须在其后
        if self.is_generation:
            self.launch_batch_sample_if_needed(batch_result, batch)
        self.last_batch = batch
`}
      />

      <MermaidDiagram
        chart={`flowchart LR
    A[收请求<br/>zmq.NOBLOCK] --> B[get_next_batch_to_run]
    B --> C{有 prefill batch?}
    C -->|是| D[run_batch prefill]
    C -->|否| E[update_running_batch decode]
    D --> F["process_batch_result<br/>(overlap 模式延迟一 iter)"]
    E --> F
    F --> A
`}
      />
      <p>
        <strong>理解要点</strong>：SGLang 的「零开销调度」体现在三个层面——①调度器不碰 tokenizer；②GPU forward 与 CPU 结果处理重叠（overlap loop）；③调度决策每步都基于最新 batch 状态（continuous batching）。
      </p>

      {/* ===================== 4 get_next_batch_to_run ===================== */}
      <div className="section-divider"><span>get_next_batch_to_run：prefill vs decode 决策</span></div>

      <h3>4.1 决策骨架</h3>
      <p>
        <code>get_next_batch_to_run</code>（<SrcLink path="python/sglang/srt/managers/scheduler.py" />）决定本 iter 跑 prefill 还是 decode。<strong>prefill 优先</strong>（保 TTFT），拿不到 prefill 才跑 decode：
      </p>
      <CodeBlock language="python" title="get_next_batch_to_run (scheduler.py)" code={`def get_next_batch_to_run(self, running_batch, last_batch):
    self.process_pending_chunked_abort()
    self._abort_on_waiting_timeout()
    self._abort_on_running_timeout(running_batch)

    # 把上一 iter 的 prefill batch 合并进 running_batch
    if (not self.enable_hisparse and last_batch
        and last_batch.forward_mode.is_extend()):
        last_batch.filter_batch(chunked_req_to_exclude=...)
        if not last_batch.is_empty():
            if running_batch.is_empty():
                running_batch = last_batch
            else:
                running_batch.merge_batch(last_batch)

    if self.dllm_config is not None:
        new_batch = self.get_new_batch_dllm(running_batch)
    elif self._should_defer_prefill():
        new_batch = None
    else:
        prefill_plan = self.get_new_batch_prefill(running_batch)
        new_batch = prefill_plan.batch_to_run
        running_batch = prefill_plan.running_batch

    if new_batch is not None:
        ret = new_batch                      # 优先跑 prefill
    else:
        if not running_batch.is_empty() and not running_batch.is_prefill_only:
            running_batch = self.update_running_batch(running_batch)
            ret = running_batch if not running_batch.is_empty() else None
        else:
            ret = None
    return NextBatchPlan(batch_to_run=ret, running_batch=running_batch)
`}
      />

      <h3>4.2 update_running_batch：decode 前的检查与抢占</h3>
      <p>
        decode 阶段先过滤已完成的请求，再检查 KV 是否够下一轮 decode；不够就 <strong>retract（撤回抢占）</strong>（<SrcLink path="python/sglang/srt/managers/scheduler.py" />）：
      </p>
      <CodeBlock language="python" title="update_running_batch (scheduler.py)" code={`def update_running_batch(self, batch: ScheduleBatch):
    batch.filter_batch()
    if batch.is_empty():
        batch.batch_is_full = False
        return batch

    # KV 不够 → 抢占（retract）
    if (kv_full_retract_flag := not batch.check_decode_mem()) or (...):
        old_available_tokens = self.token_to_kv_pool_allocator.available_size()
        retracted_reqs, new_token_ratio, reqs_to_abort = batch.retract_decode()
        self.new_token_ratio_tracker.current = new_token_ratio
        for req in reqs_to_abort:
            ...  # 无法撤回的 beam 组 → abort
        for req in retracted_reqs:
            self._add_request_to_queue(req, is_retracted=True)  # 放回 waiting 重 prefill
    else:
        self.new_token_ratio_tracker.decay_step()

    batch.prepare_for_decode()
    return batch
`}
      />
      <p>
        <code>check_decode_mem</code>（<SrcLink path="python/sglang/srt/managers/schedule_batch.py" />）先尝试从 radix tree 驱逐 token，再看 KV pool 是否够：
      </p>
      <CodeBlock language="python" title="check_decode_mem (schedule_batch.py)" code={`def check_decode_mem(self, selected_indices=None):
    num_tokens = self.new_tokens_required_next_decode(selected_indices)
    evict_from_tree_cache(self.tree_cache, num_tokens)   # 先驱逐缓存
    return self.token_to_kv_pool_allocator.available_size() >= num_tokens
`}
      />

      <h3>4.3 retract_decode：decode 抢占实现</h3>
      <p>
        <code>retract_decode</code>（<SrcLink path="python/sglang/srt/managers/schedule_batch.py" />）按撤回顺序挑最不值得保留的请求，释放其 KV 放回 waiting：
      </p>
      <CodeBlock language="python" title="retract_decode (schedule_batch.py)" code={`def retract_decode(self):
    sorted_indices = self._get_decode_retraction_order(self.reqs)
    sorted_indices = beam_retraction_order(sorted_indices, self.reqs)
    retracted_reqs = []
    reqs_to_abort = []
    first_iter = True
    while first_iter or (not self.check_decode_mem(selected_indices=sorted_indices)):
        if len(sorted_indices) == 1:
            break   # 至少保留一个
        first_iter = False
        idx = sorted_indices.pop()
        req = self.reqs[idx]
        if req.beam_group is not None:
            # beam 组无法部分撤回 → 整体 abort
            req.to_finish = FINISH_ABORT("Beam search group aborted: ...")
            reqs_to_abort.append(req)
            ...
            continue
        if self.release_req(idx, len(sorted_indices)):
            retracted_reqs.append(req)
        else:
            req.to_finish = FINISH_ABORT("Retraction host KV pool exhausted. ...")
            reqs_to_abort.append(req)
    ...
`}
      />
      <p>
        <strong>理解要点</strong>：被 retract 的请求不是丢弃，而是回到 <code>waiting_queue</code> 重新走 prefill 流程。由于 radix cache 的存在，它的已算 prefix 已在树里，重 prefill 时前缀命中、只补算尾部——与 vLLM V1 的 regenerate 抢占殊途同归。
      </p>

      {/* ===================== 5 调度策略 ===================== */}
      <div className="section-divider"><span>调度策略：cache-aware 与 cache-agnostic</span></div>

      <h3>5.1 策略枚举</h3>
      <p>
        SGLang 把策略分成两类（<SrcLink path="python/sglang/srt/managers/schedule_policy.py" />）：<strong>cache-aware</strong>（需要 radix cache 前缀信息）与 <strong>cache-agnostic</strong>：
      </p>
      <CodeBlock language="python" title="SchedulePolicy 枚举 (schedule_policy.py)" code={`class CacheAwarePolicy(Enum):
    LPM = "lpm"            # longest prefix match：前缀最长者优先
    DFS_WEIGHT = "dfs-weight"   # 深度优先按权重

class CacheAgnosticPolicy(Enum):
    FCFS = "fcfs"          # first come first serve
    LOF = "lof"            # longest output first
    RANDOM = "random"
    ROUTING_KEY = "routing-key"  # 优先调度与 running 同路由键的请求
`}
      />

      <h3>5.2 calc_priority：策略灵魂</h3>
      <CodeBlock language="python" title="calc_priority (schedule_policy.py)" code={`def calc_priority(self, waiting_queue, running_batch=None):
    policy = self._determine_active_policy(waiting_queue)

    # cache-agnostic 也要填 num_matched_prefix_tokens（用于 load snapshot）
    if (not isinstance(policy, CacheAwarePolicy)
        and self.tree_cache.supports_fast_match_prefix()
        and get_disagg().disaggregation_mode != "decode"):
        for r in waiting_queue:
            match_prefix_for_req(self.tree_cache, r, include_req=True)

    if self.policy == CacheAgnosticPolicy.FCFS:
        if self.enable_priority_scheduling:
            SchedulePolicy._sort_by_priority_and_fcfs(waiting_queue, self.priority_sign)
        return

    if isinstance(policy, CacheAwarePolicy):
        temporary_deprioritized = self._compute_prefix_matches(waiting_queue, policy)
        if policy == CacheAwarePolicy.LPM:
            SchedulePolicy._sort_by_longest_prefix(waiting_queue, temporary_deprioritized)
        elif policy == CacheAwarePolicy.DFS_WEIGHT:
            SchedulePolicy._sort_by_dfs_weight(waiting_queue, self.tree_cache)
    else:
        if policy == CacheAgnosticPolicy.LOF:
            SchedulePolicy._sort_by_longest_output(waiting_queue, ...)
        elif policy == CacheAgnosticPolicy.RANDOM:
            SchedulePolicy._sort_randomly(waiting_queue)
        elif policy == CacheAgnosticPolicy.ROUTING_KEY:
            if running_batch is not None:
                SchedulePolicy._sort_by_routing_key(waiting_queue, running_batch)
`}
      />
      <p>
        <code>_determine_active_policy</code> 有个重要优化：<strong>等待队列长度超过 128 时 LPM 自动降级为 FCFS</strong>，避免 O(N²) 的前缀匹配拖慢调度。
      </p>

      <h3>5.3 LPM：最长前缀优先</h3>
      <CodeBlock language="python" title="_sort_by_longest_prefix (schedule_policy.py)" code={`@staticmethod
def _sort_by_longest_prefix(waiting_queue, temporary_deprioritized):
    waiting_queue.sort(key=lambda r: (
        -r.num_matched_prefix_tokens
        if r.rid not in temporary_deprioritized
        else float("inf")   # 临时降权：下 iter 再调度
    ))
`}
      />

      <h3>5.4 DFS-Weight：子树权重优先</h3>
      <p>
        从根节点做 DFS，优先选择「命中请求数多」的子树——让同一前缀下的请求连续调度，最大化 batch 内前缀复用（<SrcLink path="python/sglang/srt/managers/schedule_policy.py" />）：
      </p>
      <CodeBlock language="python" title="_sort_by_dfs_weight (schedule_policy.py)" code={`@staticmethod
def _sort_by_dfs_weight(waiting_queue, tree_cache):
    last_node_to_reqs = defaultdict(list)
    for req in waiting_queue:
        last_node = tree_cache.resolve_node_handle(req.last_node)
        last_node_to_reqs[last_node].append(req)

    node_to_weight = defaultdict(int)
    for node in last_node_to_reqs:
        node_to_weight[node] = len(last_node_to_reqs[node])
    SchedulePolicy._calc_weight(tree_cache.root_node, node_to_weight)

    waiting_queue.clear()
    SchedulePolicy._get_dfs_priority(
        tree_cache.root_node, node_to_weight, last_node_to_reqs, waiting_queue)
`}
      />

      <h3>5.5 batch 内前缀共用启发式</h3>
      <p>
        <code>_compute_prefix_matches</code> 维护一个 batch-内 radix tree。当多个请求互相共享前缀、但全局 cache 命中都很短时，<strong>优先只调度其中一个</strong>——它的 KV 进树后，下个 iter 其他请求即可命中（<SrcLink path="python/sglang/srt/managers/schedule_policy.py" />）：
      </p>
      <CodeBlock language="python" title="_compute_prefix_matches (schedule_policy.py)" code={`for r in waiting_queue:
    prefix_ids = r.origin_input_ids + r.output_ids
    match_result = match_prefix_for_req(self.tree_cache, r, prefix_ids, ...)

    # in-batch prefix caching 启发式：
    if len(r.prefix_indices) <= IN_BATCH_PREFIX_CACHING_CHECK_THRESHOLD:
        match_result = self.waiting_queue_radix_tree.match_prefix(...)
        in_batch_matching_prefixes = match_result.device_indices
        if len(in_batch_matching_prefixes) >= IN_BATCH_PREFIX_CACHING_DEPRIORITIZE_THRESHOLD:
            temporary_deprioritized.add(r.rid)   # 本 iter 降权
        else:
            self.waiting_queue_radix_tree.insert(
                InsertParams(key=RadixKey(token_ids=prefix_ids, ...), value=...))
`}
      />

      <h3>5.6 ROUTING_KEY：batch 内复用</h3>
      <p>
        <code>ROUTING_KEY</code> 策略（<SrcLink path="python/sglang/srt/managers/schedule_policy.py" />）优先调度与 running_batch 高频路由键相同的请求：
      </p>
      <CodeBlock language="python" title="_sort_by_routing_key (schedule_policy.py)" code={`@staticmethod
def _sort_by_routing_key(waiting_queue, running_batch):
    routing_key_counts = Counter(
        r.routing_key for r in running_batch.reqs if r.routing_key
    )
    if not routing_key_counts:
        return
    def sort_key(req):
        key = req.routing_key
        if key and key in routing_key_counts:
            count = routing_key_counts[key]
            return (0, -count, key)      # 已在跑的高频键优先
        else:
            return (1, 0, key or "")
    waiting_queue.sort(key=sort_key)
`}
      />

      {/* ===================== 6 PrefillAdder ===================== */}
      <div className="section-divider"><span>PrefillAdder：token 预算管家</span></div>

      <p>
        <code>PrefillAdder</code>（<SrcLink path="python/sglang/srt/managers/schedule_policy.py" />）是 prefill 决策的核心执行者。它维护两块预算：<code>rem_total_tokens</code>（总 token 预算）与 <code>rem_chunk_tokens</code>（chunk 预算），在预算内把 waiting 请求逐个加入 <code>can_run_list</code>。
      </p>

      <h3>6.1 构造与预算计算</h3>
      <CodeBlock language="python" title="PrefillAdder 构造 (scheduler.py)" code={`adder = PrefillAdder(
    self.page_size,
    self.tree_cache,
    self.token_to_kv_pool_allocator,
    running_batch,
    self.new_token_ratio_tracker.current,
    self.max_prefill_tokens,             # rem_input_tokens
    chunked_prefill_size,                 # rem_chunk_tokens
    running_bs if self.is_mixed_chunk else 0,
    self.priority_scheduling_preemption_threshold,
    max_prefill_bs=int(self.max_prefill_bs),
    max_running_requests=self.max_running_requests,
    prefill_max_requests=get_schedule().prefill_max_requests,
    ...
)
`}
      />
      <p>
        总预算 <code>rem_total_tokens</code> 的关键设计——先扣除 running batch 里 decode 请求的预计 token 占用，防止 prefill 把 decode 内存吃光：
      </p>
      <CodeBlock language="python" title="rem_total_tokens (schedule_policy.py)" code={`@property
def rem_total_tokens(self):
    if self.is_all_swa:
        available_and_evictable = (
            self.token_to_kv_pool_allocator.swa_available_size()
            + self.tree_cache.swa_evictable_size()
        )
    elif self.is_hybrid_swa:
        available_and_evictable = (
            self.token_to_kv_pool_allocator.full_available_size()
            + self.tree_cache.full_evictable_size()
        )
    ...
    return available_and_evictable - self.rem_total_token_offset
`}
      />
      <p>
        <code>rem_total_token_offset</code> 预先扣除每个 running 请求的 <code>min(max_new_tokens, CLIP) * new_token_ratio</code>，估算其 decode 阶段的 token 占用。<code>new_token_ratio</code> 由 <code>NewTokenRatioTracker</code> 动态调整（decode OOM 时衰减，idle 时 reset）。
      </p>

      <h3>6.2 add_one_req：单个请求加入决策</h3>
      <CodeBlock language="python" title="add_one_req (schedule_policy.py)" code={`def add_one_req(self, req, has_chunked_req, truncation_align_size):
    max_new = min(
        max(req.sampling_params.max_new_tokens - len(req.output_ids), 0),
        CLIP_MAX_NEW_TOKENS,
    )
    cand_extend_input_len = len(req.full_untruncated_fill_ids) - len(req.prefix_indices)
    total_tokens = cand_extend_input_len + max_new + self.page_size
    total_tokens += self._mamba_gap_budget_for_req(req)

    if total_tokens >= self.rem_total_tokens:
        return AddReqResult.NO_TOKEN      # 预算不够 → 整批停止

    with self._lock_node(req.last_node):  # 锁定命中的前缀节点防 evict
        if chunk_tokens_limit is None or input_tokens <= chunk_tokens_limit:
            # 非 chunked：整段提交
            req.set_extend_range(len(req.prefix_indices), len(req.full_untruncated_fill_ids))
            self.can_run_list.append(req)
            self._req_inc_lock_ref(req)
            self._update_prefill_budget(prefix_len, input_tokens, ...)
        else:
            # chunked prefill：截断到 chunk 大小
            ...
`}
      />
      <p>
        <code>_lock_node</code> 对命中的前缀路径加 <code>lock_ref</code>——在 adder 决策过程中这些节点不会被驱逐，保证「决策时锁定的 KV」在真正 forward 时还在。
      </p>

      <h3>6.3 决策主循环</h3>
      <CodeBlock language="python" title="waiting_queue 遍历主循环 (scheduler.py)" code={`for req in self.waiting_queue:
    if self.enable_lora and not self._can_schedule_lora_req(req, running_loras):
        continue
    ...
    if len(adder.can_run_list) >= self.get_num_allocatable_reqs(...):
        running_batch.batch_is_full = True
    if running_batch.batch_is_full:
        if (not self.enable_priority_preemption
            or not adder.preempt_to_schedule(req, self.server_args)):
            break
    # ★ 关键：init_next_round_input 触发 radix cache 前缀匹配
    req.init_next_round_input(self.tree_cache)
    res = adder.add_one_req(req, has_chunked_req=(self.chunked_req is not None), ...)
    if res != AddReqResult.CONTINUE:
        if res == AddReqResult.NO_TOKEN:
            running_batch.batch_is_full = True
        break
`}
      />
      <p>
        <strong>理解要点</strong>：<code>req.init_next_round_input(self.tree_cache)</code> 在<strong>调度循环内</strong>完成 radix cache 前缀匹配（<code>req.prefix_indices</code> 直接指向 KV pool 中已有 cache 的位置）——这是「零开销调度」的第二个关键：前缀匹配被集成进调度决策，而非独立步骤。
      </p>

      <MermaidDiagram
        chart={`flowchart TD
    A[waiting_queue] --> B{预算够?<br/>add_one_req}
    B -->|NO_TOKEN| X[break 整批停止]
    B -->|CONTINUE| C{input > chunk?}
    C -->|否| D[整段加入 can_run_list]
    C -->|是| E[截断到 chunk_size<br/>存 chunked_req 下 iter 续跑]
    D --> F{还有请求?}
    E --> F
    F -->|是| B
    F -->|否| G[构造 ScheduleBatch<br/>prepare_for_extend]
`}
      />

      {/* ===================== 7 Chunked Prefill ===================== */}
      <div className="section-divider"><span>Chunked Prefill 与 Mixed Chunk</span></div>

      <h3>7.1 chunk 预算</h3>
      <p>
        <code>chunked_prefill_size</code> 是每 iter 允许 prefill 的最大 token 数（来自 <code>--chunked-prefill-size</code>）。<code>None</code> 表示不 chunk。配置与动态调整（<SrcLink path="python/sglang/srt/managers/scheduler.py" />）：
      </p>
      <CodeBlock language="python" title="init_chunked_prefill (scheduler.py)" code={`def init_chunked_prefill(self):
    self.chunked_prefill_size = get_schedule().chunked_prefill_size
    self.prefill_decode_interval = get_schedule().prefill_decode_interval
    ...
    self.chunked_req = None               # 正在 chunk 中的请求
    self.is_mixed_chunk = (
        self.chunked_prefill_size is not None and get_schedule().enable_mixed_chunk
    )
    self.enable_dynamic_chunking = (
        get_schedule().enable_dynamic_chunking and self.ps.pp_size > 1
    )
`}
      />

      <h3>7.2 动态 chunk 大小（PP 模式）</h3>
      <CodeBlock language="python" title="动态调整 chunk (scheduler.py)" code={`chunked_prefill_size = self.chunked_prefill_size
if self.chunked_req is not None and self.enable_dynamic_chunking:
    history_len = len(self.chunked_req.prefix_indices)
    dynamic_size = self.predict_next_chunk_size(history_len)
    if dynamic_size is not None:
        chunked_prefill_size = dynamic_size
`}
      />

      <h3>7.3 Mixed Chunk：prefill + decode 同一次 forward</h3>
      <p>
        SGLang 的 mixed chunk 通过 <code>mix_with_running</code>（<SrcLink path="python/sglang/srt/managers/schedule_batch.py" />）把 running 的 decode 请求当成「1-token extend」拼进 prefill batch：
      </p>
      <CodeBlock language="python" title="mix_with_running (schedule_batch.py)" code={`def mix_with_running(self, running_batch: ScheduleBatch):
    self.forward_mode = ForwardMode.MIXED
    running_bs = running_batch.batch_size()
    for req in running_batch.reqs:
        req._refresh_fill_ids()
        full_len = len(req.full_untruncated_fill_ids)
        req.set_extend_range(full_len - 1, full_len)   # 只 extend 1 token
    self.input_ids = None
    self.mix_running_indices = running_batch.req_pool_indices
    out_cache_loc = torch.cat([self.out_cache_loc, running_batch.out_cache_loc])
    self.merge_batch(running_batch)
    self.out_cache_loc = out_cache_loc
    delta = 0 if self.enable_overlap else -1
    self.prefix_lens = self.prefix_lens + [
        len(r.origin_input_ids) + len(r.output_ids) + delta
        for r in running_batch.reqs
    ]
    self.extend_lens = self.extend_lens + [1] * running_bs
    self.extend_num_tokens = self.extend_num_tokens + running_bs
    self.is_prefill_only = False
`}
      />
      <p>
        触发条件（<SrcLink path="python/sglang/srt/managers/scheduler.py" />）：
      </p>
      <CodeBlock language="python" title="mixed chunk 触发 (scheduler.py)" code={`if (self.is_mixed_chunk and not running_batch.is_empty()
    and not (new_batch.return_logprob or running_batch.return_logprob)
    and new_batch.input_embeds is None
    and all(r.beam_group is None for r in running_batch.reqs)):
    running_batch.filter_batch()
    if not running_batch.is_empty():
        running_batch.prepare_for_decode()
        new_batch.mix_with_running(running_batch)   # decode 拼进 prefill batch
        new_batch.decoding_reqs = running_batch.reqs
    running_batch = ScheduleBatch(reqs=[], batch_is_full=running_batch.batch_is_full)
`}
      />
      <p>
        <strong>理解要点</strong>：mixed chunk 让 prefill 和 decode 在一次 forward 里共存，避免 prefill iter 里 GPU 只做 prefill、decode 资源空转。forward mode 变成 <code>MIXED</code>，attention 后端按 extend+decode 混合处理。
      </p>

      {/* ===================== 8 Batch 结构 ===================== */}
      <div className="section-divider"><span>Batch 结构：ScheduleBatch 与 ForwardBatch</span></div>

      <h3>8.1 ScheduleBatch 关键字段</h3>
      <p>
        <code>ScheduleBatch</code>（<SrcLink path="python/sglang/srt/managers/schedule_batch.py" />）是调度层面的 batch 容器，承载所有 GPU 前向所需 tensor：
      </p>
      <CodeBlock language="python" title="ScheduleBatch 字段 (schedule_batch.py)" code={`class ScheduleBatch(ScheduleBatchDisaggregationDecodeMixin):
    reqs: List[Req]
    req_to_token_pool: ReqToTokenPool
    token_to_kv_pool_allocator: BaseTokenToKVPoolAllocator
    tree_cache: BasePrefixCache
    ...
    forward_mode: ForwardMode = None        # EXTEND / DECODE / MIXED
    req_pool_indices: torch.Tensor = None   # 请求在 req pool 的行号
    seq_lens: torch.Tensor = None
    out_cache_loc: torch.Tensor = None      # 本次前向写入的 KV 位置
    input_ids: Optional[torch.Tensor] = None
    prefix_lens: List[int] = None           # 每个请求已缓存的前缀长度
    extend_lens: List[int] = None
    extend_num_tokens: int = 0
    batch_is_full: bool = False
    decoding_reqs: Optional[List[Req]] = None   # mixed chunk 的 decode 部分
    ...
`}
      />

      <h3>8.2 prepare_for_extend：分配 KV 与构造 tensor</h3>
      <CodeBlock language="python" title="prepare_for_extend (schedule_batch.py)" code={`def prepare_for_extend(self):
    self.forward_mode = ForwardMode.EXTEND
    reqs = self.reqs
    input_ids = [r.get_fill_ids()[len(r.prefix_indices):] for r in reqs]  # 只取未算的尾部
    extend_num_tokens = sum(len(ids) for ids in input_ids)
    seq_lens = [r.extend_range.end for r in reqs]
    prefix_lens = [len(r.prefix_indices) for r in reqs]
    extend_lens = [r.extend_range.length for r in reqs]
    ...
    # 分配 KV cache（out_cache_loc 即本次前向写入的位置）
    out_cache_loc, req_pool_indices_tensor, req_pool_indices_cpu = alloc_for_extend(self)
    ...
    self.input_ids = None                   # defer H2D 到 forward stream
    self.prefill_input_ids_cpu = pinned_input_ids
    self.orig_seq_lens = orig_seq_lens_tensor
    self.out_cache_loc = out_cache_loc
`}
      />
      <p>
        <strong>理解要点</strong>：<code>input_ids</code> 只含<strong>未计算的后缀</strong>（<code>get_fill_ids()[len(prefix_indices):]</code>）——前缀部分通过 <code>prefix_lens</code> 指示 attention 从缓存读，不需要重新前向。这是 Radix Cache 能省算力的落地形态。
      </p>

      <h3>8.3 prepare_for_decode</h3>
      <CodeBlock language="python" title="prepare_for_decode (schedule_batch.py)" code={`def prepare_for_decode(self):
    self.forward_mode = ForwardMode.DECODE
    self.input_embeds = None
    ...
    if not self.spec_algorithm.is_none():
        spec_prepare_for_decode(self)
        return
    strip_beam_tail(self)
    append_beam_tail(self)
    self.out_cache_loc = alloc_for_decode(self, token_per_req=1)  # 每请求 1 个输出槽
    for req in self.reqs:
        req.decode_batch_idx += 1
        req.kv_committed_len += 1
    self.seq_lens = self.seq_lens + 1
    self.seq_lens_cpu = self.seq_lens_cpu + 1
`}
      />

      {/* ===================== 9 Radix Cache ===================== */}
      <div className="section-divider"><span>Radix Cache：前缀树的工程实现</span></div>

      <h3>9.1 TreeNode</h3>
      <p>
        Radix Cache（<SrcLink path="python/sglang/srt/mem_cache/radix_cache.py" />）以「token id 序列为 key、KV pool indices 为 value」的前缀树组织：
      </p>
      <CodeBlock language="python" title="TreeNode (radix_cache.py)" code={`class TreeNode:
    def __init__(self, id=None, priority: int = 0):
        self.children = defaultdict(TreeNode)
        self.parent: TreeNode = None
        self.key: RadixKey = None                 # token id 段
        self.value: Optional[torch.Tensor] = None # 对应的 KV pool indices
        self.lock_ref = 0                         # 正在执行的请求引用计数
        self.last_access_time = time.monotonic()
        self.creation_time = time.monotonic()
        self.hit_count = 0                        # LRU/LFU 驱逐依据
        self.host_ref_counter = 0                 # hierarchical cache 引用计数
        self.priority = priority                  # 优先级驱逐依据
        ...
    @property
    def evicted(self):
        return self.value is None
    def __lt__(self, other: TreeNode):            # 用于 LRU 堆
        return self.last_access_time < other.last_access_time
`}
      />

      <h3>9.2 lock_ref 保护机制</h3>
      <p>
        <code>lock_ref</code> 把节点从「可驱逐」变为「受保护」。正在运行的请求会锁住它用到的前缀路径，驱逐只碰 <code>evictable_leaves</code>（<code>lock_ref == 0</code> 的叶子）：
      </p>
      <CodeBlock language="python" title="RadixCache 初始化 (radix_cache.py)" code={`class RadixCache(BasePrefixCache):
    def __init__(self, params: CacheInitParams):
        self.disable = params.disable
        self.eviction_policy = params.eviction_policy.lower()
        self.evictable_leaves = set()
        self.eviction_strategy = get_eviction_strategy(self.eviction_policy)
        self.reset()

    def reset(self):
        self.root_node = TreeNode(priority=-sys.maxsize)
        self.root_node.key = RadixKey(token_ids=array("q"), extra_key=None)
        self.root_node.value = []
        self.root_node.lock_ref = 1     # 根节点永远受保护
        self.evictable_size_ = 0
        self.evictable_leaves.clear()
`}
      />

      <h3>9.3 match_prefix：前缀匹配</h3>
      <CodeBlock language="python" title="match_prefix (radix_cache.py)" code={`def match_prefix(self, params: MatchPrefixParams) -> MatchResult:
    key = params.key
    key, _ = key.maybe_to_bigram_view(self.is_eagle)
    if self.disable or len(key) == 0:
        return self._empty_match_result
    key = key.page_aligned(self.page_size)   # 按 page 对齐
    if len(key) == 0:
        return self._empty_match_result
    value, last_node = self._match_prefix_helper(self.root_node, key)
    if value:
        value = torch.cat(value)
    else:
        value = self._empty_match_result.device_indices
    return MatchResult(
        device_indices=value,
        last_device_node=last_node,
        ...
    )
`}
      />
      <p>
        <code>_match_prefix_helper</code> 沿树向下，遇到 partial match 就用 <code>_split_node</code> 把节点切成两截。
      </p>

      <h3>9.4 cache_finished_req：请求结束时入树</h3>
      <CodeBlock language="python" title="cache_finished_req (radix_cache.py)" code={`def cache_finished_req(self, req: Req, is_insert: bool = True, *, kv_len_to_handle: int):
    """Cache request when it finishes."""
    if self.disable:
        kv_indices = self.req_to_token_pool.req_to_token[
            req.req_pool_idx, req.cache_protected_len : kv_len_to_handle
        ]
        self.token_to_kv_pool_allocator.free_segment(kv_indices, ...)
        return

    token_ids = (req.origin_input_ids + req.output_ids)[:kv_len_to_handle]
    kv_indices = self.req_to_token_pool.req_to_token[req.req_pool_idx, : len(token_ids)]
    radix_key = RadixKey(token_ids, req.extra_key, ...).page_aligned(self.page_size)
    values = kv_indices[:len(radix_key)].to(dtype=torch.int64, copy=True)

    if is_insert:
        priority = getattr(req, "priority", 0) or 0
        result = self.insert(InsertParams(key=radix_key, value=values, priority=priority))
        freed_end = result.prefix_len   # 已存在于树中的前缀段直接复用
    else:
        freed_end = key_len
    # 释放重复段 + 未对齐尾巴
    self.token_to_kv_pool_allocator.free_segments([...])
    # 释放该请求持有的引用锁
    if req.last_node is not None:
        self.dec_lock_ref(req.last_node)
`}
      />
      <p>
        <strong>理解要点</strong>：请求结束时把它「prompt + 输出」的完整 token 序列作为 key、对应的 KV indices 作为 value 写入树。<strong>已存在的前缀段不重复占 KV pool</strong>——这是 SGLang 前缀共享的内存收益来源。
      </p>

      <h3>9.5 cache_unfinished_req：chunk 中间态入树</h3>
      <p>
        chunked prefill 的中间 chunk 用 <code>cache_unfinished_req(chunked=True)</code> 把已算的前缀进树，让下一 chunk 能接上：
      </p>
      <CodeBlock language="python" title="cache_unfinished_req (radix_cache.py)" code={`def cache_unfinished_req(self, req: Req, chunked=False):
    if self.disable:
        return
    token_ids = req.get_fill_ids()
    kv_indices = self.req_to_token_pool.req_to_token[req.req_pool_idx, : len(token_ids)]
    radix_key = RadixKey(token_ids, req.extra_key, ...).page_aligned(self.page_size)
    values = kv_indices[:len(radix_key)].to(dtype=torch.int64, copy=True)
    result = self.insert(InsertParams(key=radix_key, value=values, chunked=chunked, ...))
    new_prefix_len = result.prefix_len
    self.token_to_kv_pool_allocator.free_segment(
        kv_indices[req.cache_protected_len : new_prefix_len], ...)
    # 重新查一次拿到新的 prefix_indices（可能因 split 变化）
    match_result = self.match_prefix(MatchPrefixParams(key=radix_key))
    new_indices, new_last_node = match_result.device_indices, match_result.last_device_node
    ...
    req.prefix_indices = torch.cat([new_indices, kv_indices[len(new_indices):]])
    req.last_node = new_last_node
`}
      />

      <h3>9.6 LRU/LFU 驱逐</h3>
      <CodeBlock language="python" title="evict (radix_cache.py)" code={`def evict(self, params: EvictParams) -> EvictResult:
    if self.disable:
        return EvictResult()
    num_tokens = params.num_tokens
    leaves = list(self.evictable_leaves)
    eviction_heap = [
        (self.eviction_strategy.get_priority(node), node) for node in leaves
    ]
    heapq.heapify(eviction_heap)

    num_evicted = 0
    while num_evicted < num_tokens and len(eviction_heap):
        _priority, x = heapq.heappop(eviction_heap)
        self.token_to_kv_pool_allocator.free_segment(x.value, start_pos=0)
        num_evicted += len(x.value)
        self._delete_leaf(x)
        # 父节点变空且未锁 → 可继续驱逐
        if len(x.parent.children) == 0 and x.parent.lock_ref == 0:
            heapq.heappush(eviction_heap, (self.eviction_strategy.get_priority(x.parent), x.parent))
        self.kv_events.record_remove(x)
    return EvictResult(num_tokens_evicted=num_evicted)
`}
      />
      <p>
        驱逐策略由 <code>eviction_strategy</code> 决定（<code>lpm</code>/<code>lru</code>/<code>lfu</code>）。<code>TreeNode.__lt__</code> 用 <code>last_access_time</code> 比较（LRU），<code>hit_count</code> 用于 LFU，<code>priority</code> 用于优先级感知驱逐（节点 priority 沿路径取 max）。
      </p>

      <h3>9.7 UnifiedRadixCache：三层分层 cache</h3>
      <p>
        <code>UnifiedRadixCache</code>（<SrcLink path="python/sglang/srt/mem_cache/unified_radix_cache.py" />）提供 device + host + storage 三层结构，<code>_evict_components</code> 支持 load-balanced 驱逐（按各层压力协同）：
      </p>
      <CodeBlock language="python" title="UnifiedRadixCache API (unified_radix_cache.py)" code={`class UnifiedRadixCache(BasePrefixCache):
    def cache_finished_req(self, ...):      # 行 816
    def cache_unfinished_req(self, ...):    # 行 909
    def evict(self, params):                # 行 541
    def evict_for_alloc(self, params):      # 行 544
    def _evict(self, ...):                  # 行 588
    def _evict_device_next_node(self, ...): # 行 640
    def _evict_device_leaf(self, ...):      # 行 649
    def _evict_components(self, ...):       # 行 674  load-balanced 驱逐
    def evict_host(self, ...):              # 行 1086
`}
      />

      <MermaidDiagram
        chart={`flowchart TD
    A[请求完成/ chunk 结束] --> B[cache_finished_req / cache_unfinished_req]
    B --> C[以 token_ids 为 key<br/>KV indices 为 value 插入树]
    C --> D{前缀已存在?}
    D -->|是| E[复用, 不重复占 KV pool]
    D -->|否| F[插入新节点, 加入 evictable_leaves]
    E --> G[释放重复段]
    F --> H{显存不足?}
    H -->|是| I[evict: 按策略弹出<br/>LRU/LFU/优先级]
    I --> J[free_segment + _delete_leaf<br/>父节点空且未锁继续驱逐]
    H -->|否| K[完成]
`}
      />

      {/* ===================== 10 优先级调度 ===================== */}
      <div className="section-divider"><span>优先级调度与抢占式优先级</span></div>

      <h3>10.1 priority 默认值</h3>
      <CodeBlock language="python" title="_set_or_validate_priority (scheduler.py)" code={`def _set_or_validate_priority(self, req):
    if self.enable_priority_scheduling and req.priority is None:
        if self.schedule_low_priority_values_first:
            req.priority = sys.maxsize      # 值大 → 排后
        else:
            req.priority = -sys.maxsize - 1
    elif (not self.enable_priority_scheduling
          and req.priority is not None
          and self.abort_on_priority_when_disabled):
        abort_req = _make_abort_req(req, finished_reason={...})
        ...   # 配置禁止 priority 时直接 abort 带 priority 的请求
        return False
    return True
`}
      />

      <h3>10.2 队列溢出时按优先级踢人</h3>
      <CodeBlock language="python" title="_abort_on_queued_limit (scheduler.py)" code={`def _abort_on_queued_limit(self, recv_req):
    if self.max_queued_requests is None or len(self.waiting_queue) + 1 <= self.max_queued_requests:
        return False
    req_to_abort = recv_req
    if self.enable_priority_scheduling:
        direction = 1 if self.schedule_low_priority_values_first else -1
        key_fn = lambda item: (
            direction * item[1].priority,
            item[1].time_stats.wait_queue_entry_time,
        )
        idx, candidate_req = max(enumerate(self.waiting_queue), key=key_fn)
        abort_existing_req = (
            direction * recv_req.priority < direction * candidate_req.priority
        )
        if abort_existing_req:
            self.waiting_queue.pop(idx)
            req_to_abort = candidate_req
            message = "The request is aborted by a higher priority request."
    ...
`}
      />

      <h3>10.3 preempt_to_schedule：抢占 running 请求</h3>
      <p>
        <code>PrefillAdder.preempt_to_schedule</code>（<SrcLink path="python/sglang/srt/managers/schedule_policy.py" />）在 <code>enable_priority_preemption</code> 开启时，允许高优先级 waiting 请求抢占低优先级 running 请求。
        启用条件：<code>enable_priority_scheduling and not disable_priority_preemption</code>。
      </p>

      {/* ===================== 11 超时与 abort ===================== */}
      <div className="section-divider"><span>Abort 语义：从边界安全到超时</span></div>

      <h3>11.1 等待超时</h3>
      <CodeBlock language="python" title="_abort_on_waiting_timeout (scheduler.py)" code={`def _abort_on_waiting_timeout(self):
    if (timeout_s := envs.SGLANG_REQ_WAITING_TIMEOUT.get()) <= 0:
        return
    deadline = time.perf_counter() - timeout_s
    for req in self.waiting_queue:
        entry_time = req.time_stats.wait_queue_entry_time
        if 0 < entry_time < deadline:
            self.ipc_channels.send_to_tokenizer.send_output(
                _make_abort_req(req, ...), req)
            deleted_reqs.add(req)
    if deleted_reqs:
        self.waiting_queue = [r for r in self.waiting_queue if r not in deleted_reqs]
`}
      />

      <h3>11.2 chunk 边界的 abort</h3>
      <p>
        正在 chunked prefill 的请求不立即 abort——延迟到 chunk 边界才释放资源，避免 forward 中途破坏状态（<SrcLink path="python/sglang/srt/managers/scheduler.py" />）：
      </p>
      <CodeBlock language="python" title="abort_request 中的 chunk 延迟 (scheduler.py)" code={`def abort_request(self, recv_req: AbortReq):
    # 1) 命中正在 chunked prefill 的请求 → 延迟到 chunk 边界
    if (chunked_req := self.chunked_req) is not None:
        if recv_req.abort_all or chunked_req.rid.startswith(recv_req.rid):
            self._pending_chunked_abort_req = chunked_req
    # 2) waiting_queue 直接删除
    ...
    # 3) running 请求：set_finish_with_abort 标记，下次 filter_batch 剔除
    self.grammar_manager.abort_requests(recv_req)
    ...
`}
      />
      <p>
        <code>process_pending_chunked_abort</code>（行 3107）在 <code>get_next_batch_to_run</code> 开头检查，chunk 边界才真正 <code>release_kv_cache</code> 并回包。
      </p>

      {/* ===================== 12 scheduler_components ===================== */}
      <div className="section-divider"><span>scheduler_components：20+ 子组件</span></div>

      <p>
        SGLang 把调度器的外围职责全部拆到 <code>scheduler_components/</code>（<SrcLink path="python/sglang/srt/managers/scheduler_components" />），Scheduler 只做编排。目录清单：
      </p>
      <table>
        <thead>
          <tr>
            <th>组件</th>
            <th>职责</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>request_receiver.py</code></td>
            <td>从 ZMQ/Rust ring 拉请求；跨 TP/PP/DP/CP 广播；<code>recv_requests()</code> 主入口</td>
          </tr>
          <tr>
            <td><code>output_streamer.py</code></td>
            <td>把 batch 输出打包成 <code>BatchTokenIDOutput</code> 发给 detokenizer；处理流式/beam 输出</td>
          </tr>
          <tr>
            <td><code>flush_wrapper.py</code></td>
            <td>封装 <code>flush_cache</code>：立即 / 延迟 / 超时失败三种语义</td>
          </tr>
          <tr>
            <td><code>idle_sleeper.py</code></td>
            <td><code>zmq.Poller().poll(1000)</code> 让调度器 idle 时睡 1s 省电</td>
          </tr>
          <tr>
            <td><code>invariant_checker.py</code></td>
            <td>内存不变量校验（req pool / tree cache / kv allocator 一致）</td>
          </tr>
          <tr>
            <td><code>load_publisher.py</code></td>
            <td>把 <code>LoadStat</code> gauge 周期发到 ZMQ PUB，供 router 做 cache-aware 路由</td>
          </tr>
          <tr>
            <td><code>load_inquirer.py</code></td>
            <td>聚合内存/队列/prefix match/disagg 状态形成 <code>LoadSnapshot</code></td>
          </tr>
          <tr>
            <td><code>kv_events_publisher.py</code></td>
            <td>把 radix tree 的 store/remove 事件以 KVEventBatch 推到 zmq（外部 KV 观测器）</td>
          </tr>
          <tr>
            <td><code>metrics_reporter.py</code></td>
            <td>周期性上报 SchedulerStats / 队列长度 / cache 命中率</td>
          </tr>
          <tr>
            <td><code>new_token_ratio_tracker.py</code></td>
            <td>跟踪 <code>new_token_ratio</code>（max_new_tokens 估算系数），decode OOM 时衰减</td>
          </tr>
          <tr>
            <td><code>recv_skipper.py</code></td>
            <td>DP 场景下按 forward_mode 跳过某些 iter 的 recv（省跨 rank 广播）</td>
          </tr>
          <tr>
            <td><code>weight_updater.py</code></td>
            <td>处理 UpdateWeight* 请求：热更新、分布式加载、IPC 加载</td>
          </tr>
          <tr>
            <td><code>batch_result_processor.py</code></td>
            <td>处理 forward 结果：decode/prefill 分支；调用 <code>tree_cache.cache_finished_req</code> 等</td>
          </tr>
          <tr>
            <td><code>logprob_result_processor.py</code></td>
            <td>处理 input/output token logprobs，构造 flat arrays 发给 tokenizer</td>
          </tr>
          <tr>
            <td><code>memory_usage.py</code></td>
            <td>拼装 <code>/get_memory_usage</code> 返回：weight/kv_cache/graph_memory_usage</td>
          </tr>
          <tr>
            <td><code>pool_stats_observer.py</code></td>
            <td>把 req_to_token_pool / token_to_kv_pool / tree_cache 水位封装成 <code>PoolStats</code></td>
          </tr>
          <tr>
            <td><code>profiler_manager.py</code></td>
            <td>处理 ProfileReq（torch profiler / chrome trace），按 <code>profile_batch_predicate</code> 采样</td>
          </tr>
          <tr>
            <td><code>ipc_channels.py</code></td>
            <td><code>SchedulerIpcChannels</code> 数据类：集中管理所有 zmq socket</td>
          </tr>
          <tr>
            <td><code>output_sender.py</code></td>
            <td><code>SenderWrapper</code>：zmq socket 的 http_worker_ipc 透传封装</td>
          </tr>
          <tr>
            <td><code>dp_attn.py</code></td>
            <td>DP attention 的 batch 适配：maybe_prepare_mlp_sync_batch / maybe_convert_decode_to_extend</td>
          </tr>
        </tbody>
      </table>

      <h3>12.1 request_receiver：请求进入的第一站</h3>
      <CodeBlock language="python" title="recv_requests (request_receiver.py)" code={`def recv_requests(self):
    if self.recv_skipper is not None:
        if not self.recv_skipper.handle(self.get_last_batch()):
            return []                       # 本轮跳过 recv
    recv_reqs = self._pull_raw_reqs()       # zmq.NOBLOCK 拉取
    if self.input_blocker is not None:
        recv_reqs = self.input_blocker.handle(recv_reqs)
    recv_reqs = self._broadcast_reqs_across_ranks(recv_reqs)  # TP/DP/CP 广播
    if self.ps.pp_rank == 0:
        self.unwrap_pickle_wrapper(recv_reqs)
    recv_reqs = self._apply_mm_receiver(recv_reqs)
    self._finalize_shm_features(recv_reqs)
    return recv_reqs
`}
      />

      <h3>12.2 load_publisher：cache-aware 路由的数据源</h3>
      <p>
        每个 Scheduler 在独立的 ZMQ PUB socket 上周期发布 <code>LoadStat</code> gauge，供 sgl-router 的 <code>cache_aware_zmq</code> 策略路由（<SrcLink path="python/sglang/srt/managers/scheduler_components/load_publisher.py" />）：
      </p>
      <Callout type="tip">
        <strong>与 vLLM Router / SGLang Model Gateway 的连接：</strong>load_publisher 发布的是<strong>真实队列深度 + 前缀命中统计</strong>，而不是 router 侧的 in-flight 计数器。
        这正是「<a href="/sglang-gateway">SGLang Model Gateway</a>」中 cache-aware 负载均衡策略（LPM/DFS-Weight/LCF）能拿到「谁命中了最多前缀」数据的原因——数据源头在这里。
      </Callout>

      {/* ===================== 13 关键配置 ===================== */}
      <div className="section-divider"><span>关键配置速查</span></div>

      <table>
        <thead>
          <tr>
            <th>配置</th>
            <th>作用</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>--chunked-prefill-size</code></td>
            <td>每 iter 允许 prefill 的 token 总数；<code>None</code> 不 chunk</td>
          </tr>
          <tr>
            <td><code>--enable-mixed-chunk</code></td>
            <td>mixed chunk：prefill + decode 同一次 forward</td>
          </tr>
          <tr>
            <td><code>--enable-dynamic-chunking</code></td>
            <td>PP 模式下根据 profiling 动态调整 chunk 大小</td>
          </tr>
          <tr>
            <td><code>--schedule-policy</code></td>
            <td><code>lpm</code> / <code>dfs-weight</code> / <code>fcfs</code> / <code>lof</code> / <code>random</code> / <code>routing-key</code></td>
          </tr>
          <tr>
            <td><code>--enable-priority-scheduling</code></td>
            <td>开启优先级调度（含抢占式优先级）</td>
          </tr>
          <tr>
            <td><code>--prefill-decode-interval</code></td>
            <td>跑完一次 prefill 后连续跑 N 次 decode 再 prefill（TTFT vs 吞吐权衡）</td>
          </tr>
          <tr>
            <td><code>--page-size</code></td>
            <td>radix tree 节点按 page 对齐</td>
          </tr>
          <tr>
            <td><code>SGLANG_REQ_WAITING_TIMEOUT</code></td>
            <td>等待超时 abort（秒）</td>
          </tr>
          <tr>
            <td><code>SGLANG_REQ_RUNNING_TIMEOUT</code></td>
            <td>运行超时 abort（秒）</td>
          </tr>
          <tr>
            <td><code>SGLANG_SCHEDULER_MAX_RECV_PER_POLL</code></td>
            <td>单次 recv 上限</td>
          </tr>
          <tr>
            <td><code>SGLANG_MAX_NEW_TOKENS_LIMIT</code></td>
            <td>全局 max_new_tokens 硬上限</td>
          </tr>
        </tbody>
      </table>

      {/* ===================== 14 与 vLLM 对比 ===================== */}
      <div className="section-divider"><span>SGLang vs vLLM：调度模块横评</span></div>

      <table>
        <thead>
          <tr>
            <th>维度</th>
            <th>SGLang</th>
            <th>vLLM V1</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>进程结构</td>
            <td>独立 Scheduler 进程（TokenizerManager 解耦）</td>
            <td>EngineCore 单进程（调度 + 执行耦合）</td>
          </tr>
          <tr>
            <td>事件驱动</td>
            <td>while True + zmq.NOBLOCK 轮询；idle 睡 1s</td>
            <td>busy loop + ZMQ；每步 schedule→execute 原子</td>
          </tr>
          <tr>
            <td>前缀缓存</td>
            <td>Radix Tree（RadixCache / UnifiedRadixCache）</td>
            <td>Block Hash + find_longest_cache_hit</td>
          </tr>
          <tr>
            <td>调度策略</td>
            <td>LPM / DFS-Weight / FCFS / LOF / RANDOM / ROUTING_KEY</td>
            <td>FCFS / PRIORITY</td>
          </tr>
          <tr>
            <td>token 预算</td>
            <td>PrefillAdder：rem_total_tokens + rem_chunk_tokens + new_token_ratio 估算</td>
            <td>token_budget = max_num_scheduled_tokens</td>
          </tr>
          <tr>
            <td>chunked prefill</td>
            <td>chunked_prefill_size + mixed chunk（prefill/decode 同批）</td>
            <td>long_prefill_token_threshold + enable_chunked_prefill</td>
          </tr>
          <tr>
            <td>抢占</td>
            <td>retract_decode（放回 waiting 重 prefill）+ 优先级抢占</td>
            <td>regenerate（num_computed_tokens=0 + 前缀缓存恢复）</td>
          </tr>
          <tr>
            <td>overlap</td>
            <td>event_loop_overlap：result 处理延迟一 iter 与 GPU 重叠</td>
            <td>AsyncScheduler placeholder：调度后立即推进状态</td>
          </tr>
          <tr>
            <td>可观测</td>
            <td>kv_events_publisher + load_publisher（router 数据源）</td>
            <td>metrics collector + KV cache events</td>
          </tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>一句话总结差异：</strong>SGLang 把调度器做成<strong>独立 CPU 进程 + 树状缓存 + 缓存感知策略</strong>的组合，追求「调度决策本身尽量不花 GPU 时间」；
        vLLM V1 把调度器<strong>融入 EngineCore 单循环 + token budget + block hash</strong>，追求「每步决策精确可控」。两者都把「前缀缓存」作为吞吐的第一杠杆，但一个靠树、一个靠哈希。
        详细 vLLM 侧分析见「<a href="/vllm-scheduler">vLLM V1 调度模块</a>」页面。
      </Callout>

      {/* ===================== 15 资源 ===================== */}
      <div className="section-divider"><span>源码索引</span></div>

      <ResourceTable
        resources={[
          { name: 'SGLang GitHub', url: 'https://github.com/sgl-project/sglang', desc: 'Scheduler / Radix Cache 源码仓库' },
          { name: 'SGLang 官方文档', url: 'https://docs.sglang.io', desc: 'Serving / 调度 / 性能文档' },
          { name: 'Efficiently Scaling LLM Inference (SGLang 论文)', url: 'https://arxiv.org/abs/2312.07104', desc: 'RadixAttention 与零开销调度' },
        ]}
      />

      <Callout type="tip">
        <strong>下一步建议：</strong>读完本页的 SGLang 调度逻辑后，建议对照阅读「<a href="/vllm-scheduler">vLLM V1 调度模块</a>」；
        若关注上层路由，可前往「<a href="/serving-scheduler">服务调度概览</a>」了解 Continuous Batching / Chunked Prefill / 公平性的通用概念。
      </Callout>
    </div>
  );
}
