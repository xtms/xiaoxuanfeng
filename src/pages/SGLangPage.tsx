import { MermaidDiagram } from '../components/MermaidDiagram';
import { CodeBlock, Callout, ExternalLink, ResourceTable } from '../components/CodeBlock';

export function SGLangPage() {
  return (
    <div className="prose max-w-none">
      <h1>🚀 SGLang</h1>
      <p>
        SGLang 是 LMSYS Org 开发的高性能 LLM 推理框架，以 <strong>RadixAttention</strong>（前缀缓存）和
        <strong>零开销 CPU 调度器</strong> 闻名。源码规模约 20 万行（1718 个 Python 文件 + 3 个 Rust crate），
        在全球 40 万+ GPU 上为生产环境提供服务。
      </p>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://github.com/sgl-project/sglang" label="GitHub" />
        <ExternalLink href="https://docs.sglang.io" label="官方文档" />
      </div>

      <h2>1. 整体架构</h2>

      <h3>1.1 进程架构</h3>
      <p>
        SGLang 采用 <strong>多进程架构</strong>，进程间通过 <strong>ZMQ IPC</strong> 通信。
        主进程运行 HTTP Server + TokenizerManager，Scheduler 和 DetokenizerManager 作为独立子进程运行。
      </p>

      <MermaidDiagram chart={`
flowchart TB
  subgraph MAIN["主进程 (Main Process)"]
    HTTP["HTTP Server (FastAPI)<br/>OpenAI/Anthropic/Ollama 兼容 API<br/>106KB"]
    TOKEN["TokenizerManager<br/>tokenize + future 管理<br/>158KB"]
    TEMPLATE["TemplateManager<br/>chat 模板"]
  end

  subgraph SUB["子进程"]
    SCHED["Scheduler<br/>核心调度引擎<br/>237KB · 子进程"]
    DETOK["DetokenizerManager<br/>增量 detokenize<br/>23KB · 子进程"]
  end

  subgraph GPU["GPU 推理"]
    WORKER["TpModelWorker<br/>ModelRunner<br/>模型 forward · CUDA Graph"]
    KV["KV Cache<br/>Radix Tree 管理<br/>+ 内存池"]
  end

  HTTP --> TOKEN
  TOKEN -->|"ZMQ"| SCHED
  SCHED --> WORKER
  WORKER --> KV
  SCHED -->|"BatchTokenIDOutput"| DETOK
  DETOK -->|"BatchStrOutput"| TOKEN
  TOKEN --> HTTP
      `} />

      <table>
        <thead><tr><th>组件</th><th>文件</th><th>大小</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td>HTTP Server</td><td><code>entrypoints/http_server.py</code></td><td>106KB</td><td>FastAPI 服务，OpenAI/Anthropic/Ollama 兼容 API</td></tr>
          <tr><td>Engine</td><td><code>entrypoints/engine.py</code></td><td>75KB</td><td>Python API 入口，启动所有子进程</td></tr>
          <tr><td>TokenizerManager</td><td><code>managers/tokenizer_manager.py</code></td><td>158KB</td><td>主进程中运行，tokenize 请求，管理 future</td></tr>
          <tr><td>Scheduler</td><td><code>managers/scheduler.py</code></td><td>237KB</td><td>核心调度引擎，子进程运行</td></tr>
          <tr><td>DetokenizerManager</td><td><code>managers/detokenizer_manager.py</code></td><td>23KB</td><td>子进程，增量 detokenize</td></tr>
          <tr><td>TpModelWorker</td><td><code>managers/tp_worker.py</code></td><td>730行</td><td>封装 ModelRunner，执行 forward</td></tr>
          <tr><td>ModelRunner</td><td><code>model_executor/model_runner.py</code></td><td>2191行</td><td>模型加载、forward、采样、CUDA Graph</td></tr>
        </tbody>
      </table>

      <h3>1.2 两种服务模式</h3>
      <ul>
        <li><strong>Python HTTP 模式</strong>：FastAPI 在主进程中运行（默认）</li>
        <li><strong>Rust Server 模式</strong>（<code>SGLANG_RUST_SERVER</code>）：Rust 编写的 HTTP 服务器嵌入到 rank-0 Scheduler 进程中，使用 <code>axum</code> 框架 + <code>dynamo-tokenizers</code> 原生 tokenization，列式 IPC 减少序列化开销</li>
      </ul>

      <Callout type="tip">
        <strong>列式 IPC 设计：</strong>Rust Server 使用 <code>RequestBatch</code>（msgpack 标头 + 原始 int64 字节拼接），
        避免逐请求序列化，减少 Python GIL 竞争。多模态特征通过 POSIX shm 零拷贝传输。
      </Callout>

      <h2>2. 请求处理全生命周期</h2>

      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Client
    participant API as HTTP Server
    participant TM as TokenizerManager
    participant S as Scheduler
    participant MR as ModelRunner
    participant DM as DetokenizerManager

    C->>API: POST /v1/chat/completions
    API->>TM: tokenize(text + multimodal)
    TM->>S: ZMQ: TokenizedGenerateReqInput
    S->>S: recv_requests() → process_input_requests()
    S->>S: get_next_batch_to_run()<br/>调度策略: LPM/DFS_WEIGHT/FCFS
    S->>MR: run_batch(batch)
    MR->>MR: ForwardBatch.init_new()
    MR->>MR: ModelRunner.forward() → GPU
    MR->>MR: ModelRunner.sample() → tokens
    MR-->>S: GenerationBatchResult
    S->>DM: BatchTokenIDOutput
    DM->>DM: 增量 decode (DecodeStatus)
    DM-->>TM: BatchStrOutput
    TM->>TM: rid_to_future 解析
    API-->>C: SSE 流式响应
      `} />

      <h2>3. 调度器</h2>

      <h3>3.1 Scheduler 类结构</h3>
      <p>
        Scheduler 通过 <strong>Mixin 组合</strong> 而非深层继承来解耦关注点：
      </p>

      <CodeBlock code={`class Scheduler(
    SchedulerDisaggregationDecodeMixin,   # 分离式 decode 端
    SchedulerDisaggregationPrefillMixin,  # 分离式 prefill 端
    SchedulerMultiplexMixin,              # 多路复用
    SchedulerPPMixin,                     # Pipeline Parallel
    SchedulerDllmMixin,                   # dLLM 支持
    SchedulerMlxOverlapMixin,             # MLX 硬件重叠
):
    # ~40 个 init_* / maybe_init_* 方法按序调用
    # init_memory_pools() → init_schedule_policy() → init_overlap() ...`} language="python" title="Scheduler Mixin 架构" />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/managers/scheduler.py" target="_blank" rel="noreferrer">python/sglang/srt/managers/scheduler.py</a></div>

      <h3>3.2 三类事件循环</h3>
      <table>
        <thead><tr><th>循环</th><th>方法</th><th>描述</th></tr></thead>
        <tbody>
          <tr><td><strong>普通循环</strong></td><td><code>event_loop_normal()</code></td><td>顺序：接收请求 → 调度 → 执行 → 处理结果</td></tr>
          <tr><td><strong>重叠循环</strong></td><td><code>event_loop_overlap()</code></td><td>双 CUDA Stream 流水线，CPU 处理与 GPU 计算重叠</td></tr>
          <tr><td><strong>PP 流水线</strong></td><td><code>event_loop_pp()</code></td><td>微批次化 Pipeline Parallel，pp_loop_size = pp_size + pp_async_batch_depth</td></tr>
        </tbody>
      </table>

      <CodeBlock code={`# 重叠循环核心逻辑
result_queue = deque()
while True:
    recv_reqs = recv_requests()
    process_input_requests(recv_reqs)
    plan = get_next_batch_to_run()
    batch = plan.batch_to_run
    if batch:
        if len(result_queue) > 1:
            pop_and_process()        # 处理上一个 batch 的结果
        result = run_batch(batch)   # forward_stream 上启动 GPU 计算
        result_queue.append((batch.copy(), result))`} language="python" title="Overlap 事件循环" />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/managers/scheduler.py" target="_blank" rel="noreferrer">python/sglang/srt/managers/scheduler.py</a></div>

      <h3>3.3 调度策略</h3>
      <table>
        <thead><tr><th>类别</th><th>策略</th><th>描述</th></tr></thead>
        <tbody>
          <tr><td rowSpan={2}><strong>Cache-Aware</strong></td><td>LPM</td><td>Longest Prefix Match，优先调度与缓存前缀匹配最长的请求</td></tr>
          <tr><td>DFS_WEIGHT</td><td>基于 Radix Tree 深度的带权调度</td></tr>
          <tr><td rowSpan={4}><strong>Cache-Agnostic</strong></td><td>FCFS</td><td>先到先服务（默认）</td></tr>
          <tr><td>LOF</td><td>Longest Output First</td></tr>
          <tr><td>RANDOM</td><td>随机调度</td></tr>
          <tr><td>ROUTING_KEY</td><td>基于路由键的调度</td></tr>
        </tbody>
      </table>

      <h3>3.4 优先级与延迟器</h3>
      <ul>
        <li><strong>优先级机制</strong>：排序（按 priority + wait_time）→ 队列溢出驱逐 → 抢占（<code>enable_priority_preemption</code>）</li>
        <li><strong>PrefillDelayer</strong>：延迟 prefill 准入以批量处理，跨 rank 协商 via all-gather，5s 超时</li>
        <li><strong>MinFreeSlotsDelayer</strong>：直到 ≥ min_free_slots 运行槽位释放才允许新 prefill</li>
        <li><strong>SchedulerInputBlocker</strong>：权重更新期间阻止新输入（UNBLOCKED → BLOCKED → GLOBAL_UNBLOCK_BARRIER）</li>
      </ul>

      <h3>3.5 Batch Overlap（三种重叠机制）</h3>
      <table>
        <thead><tr><th>机制</th><th>文件</th><th>描述</th></tr></thead>
        <tbody>
          <tr><td>SBO</td><td><code>single_batch_overlap.py</code></td><td>单 batch 内 MoE all-to-all 通信与计算重叠，双 CUDA Stream + SM 分区</td></tr>
          <tr><td>TBO</td><td><code>two_batch_overlap.py</code></td><td>拆分 ForwardBatch 为两个子 batch，偏移执行使通信/计算阶段并发</td></tr>
          <tr><td>跨迭代</td><td><code>overlap_utils.py</code></td><td>FutureMap pool-indexed relay 解耦下次 GPU forward 与当前 CPU 处理</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>Batch-Invariant Ops：</strong>批次不变的 Triton 内核 (matmul, addmm, bmm, log_softmax)，
        无论 batch 组成如何产生相同 per-token 结果，使 TBO 数值安全。
      </Callout>

      <h2>4. RadixAttention — 核心创新</h2>

      <h3>4.1 Radix Tree 原理</h3>
      <p>
        RadixAttention 使用 <strong>Radix Tree（基数树）</strong>结构管理 KV Cache，
        自动检测和复用请求之间的共享前缀。支持 <code>extra_key</code> 命名空间隔离（LoRA、路由键）和
        <code>cache_salt</code> 隔离。
      </p>

      <MermaidDiagram chart={`
flowchart TB
  subgraph RADIX["Radix Tree 结构"]
    ROOT["Root"]
    N1["你"]
    N2["好"]
    N3["，请"]
    N4["帮我翻译<br/>(lock_ref=1)"]
    N5["帮我写代码<br/>(lock_ref=1)"]
    N6["I"]
    N7["love"]
    N8["AI<br/>(lock_ref=1)"]

    ROOT --> N1
    ROOT --> N6
    N1 --> N2
    N2 --> N3
    N3 --> N4
    N3 --> N5
    N6 --> N7
    N7 --> N8
  end

  subgraph HIT["前缀匹配结果"]
    H1["请求: 你好，请帮我翻译<br/>匹配: 你好，请帮我 (3个节点)"]
    H2["请求: 你好，请帮我写代码<br/>匹配: 你好，请帮我 (3个节点，共享)"]
    H3["请求: I love AI<br/>匹配: I love AI (独立分支)"]
  end
      `} />

      <h3>4.2 RadixCache 核心实现</h3>

      <CodeBlock code={`class RadixKey:
    token_ids: array('q')       # token ID 序列
    extra_key: Optional[str]     # 缓存命名空间 (LoRA/routing key)
    cache_salt: Optional[str]    # 缓存盐值
    is_bigram: bool              # Eagle 推测解码的 bigram 模式

class TreeNode:
    children: defaultdict(TreeNode)  # 子节点
    parent: TreeNode                 # 父节点
    key: RadixKey                    # 节点键
    value: Tensor                    # KV cache indices
    lock_ref: int                    # 引用计数 (防止 eviction)
    last_access_time: float          # LRU 驱逐
    hash_value: List[str]            # 每页 SHA256 hash
    host_value: Tensor               # CPU 端 KV 备份 (HiCache)
    priority: int                    # 优先级驱逐

class RadixCache(BasePrefixCache):
    match_prefix(key) → MatchResult   # 指数搜索+二分查找
    insert(key, value) → InsertResult # 节点分裂
    evict(num_tokens) → EvictResult   # 叶子优先 + LRU/priority
    cache_finished_req(req)           # 缓存完成的请求
    cache_unfinished_req(req)         # 缓存未完成请求`} language="python" title="RadixCache 核心数据结构" />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/managers/schedule_batch.py" target="_blank" rel="noreferrer">python/sglang/srt/managers/schedule_batch.py</a></div>

      <h3>4.3 内存池三级架构</h3>
      <table>
        <thead><tr><th>层级</th><th>组件</th><th>描述</th></tr></thead>
        <tbody>
          <tr><td>Level 1</td><td><code>ReqToTokenPool</code></td><td>[num_requests+1, max_context_len] int32 矩阵，映射请求到 KV 索引</td></tr>
          <tr><td>Level 2</td><td><code>TokenToKVPoolAllocator</code></td><td>槽位/页管理，支持 5 种分配器（Token/Paged/SWA/Mamba/HiSparse）</td></tr>
          <tr><td>Level 3</td><td><code>KVCache</code></td><td>物理 K/V tensor 存储，9 种子类（MHA/MLA/FP4/MXFP8/PageMajor/HybridLinear/DSA/MiniMax/NoOp）</td></tr>
        </tbody>
      </table>

      <h3>4.4 缓存类型全景</h3>
      <table>
        <thead><tr><th>缓存类型</th><th>文件</th><th>用途</th></tr></thead>
        <tbody>
          <tr><td>RadixCache</td><td><code>radix_cache.py</code></td><td>标准 Radix Tree 缓存（Python 实现）</td></tr>
          <tr><td>RadixCacheCpp</td><td><code>radix_cache_cpp.py</code></td><td>C++ 加速版（C++20, -O3，PyBind11 绑定）</td></tr>
          <tr><td>UnifiedRadixCache</td><td><code>unified_radix_cache.py</code></td><td>统一缓存架构（默认），多组件：TreeComponent/SWAComponent/MambaComponent</td></tr>
          <tr><td>HiCache</td><td><code>hiradix_cache.py</code></td><td>分层缓存：GPU → CPU → SSD 三层</td></tr>
          <tr><td>SWARadixCache</td><td><code>swa_radix_cache.py</code></td><td>滑动窗口注意力缓存</td></tr>
          <tr><td>MambaRadixCache</td><td><code>mamba_radix_cache.py</code></td><td>Mamba 状态空间模型缓存</td></tr>
          <tr><td>ChunkCache</td><td><code>chunk_cache.py</code></td><td>分块缓存</td></tr>
          <tr><td>MultimodalCache</td><td><code>multimodal_cache.py</code></td><td>多模态缓存</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>缓存类型选择链：</strong>disable_radix_cache → C++ 加速 → Pure SWA → LMCache → FlexKV → UnifiedRadixCache（默认）。
        通过 <code>registry.py</code> 中的 <code>default_radix_cache_factory</code> 按优先级选择。
      </Callout>

      <h2>5. 注意力后端</h2>
      <p>
        SGLang 拥有 <strong>40+ 注意力后端</strong>，通过 <code>attention_registry.py</code> 的装饰器模式注册：
      </p>

      <table>
        <thead><tr><th>类别</th><th>后端</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td rowSpan={4}><strong>通用 Softmax</strong></td><td>flashinfer</td><td>默认，MLA 模型自动切换</td></tr>
          <tr><td>fa3 / fa4</td><td>FlashAttention v3/v4</td></tr>
          <tr><td>triton</td><td>Triton 内核</td></tr>
          <tr><td>trtllm_mha</td><td>TensorRT-LLM MHA</td></tr>
          <tr><td rowSpan={5}><strong>MLA (DeepSeek)</strong></td><td>flashinfer_mla</td><td>FlashInfer MLA</td></tr>
          <tr><td>trtllm_mla</td><td>TensorRT-LLM MLA</td></tr>
          <tr><td>cutlass_mla</td><td>CUTLASS MLA 内核</td></tr>
          <tr><td>flashmla</td><td>FlashMLA 内核</td></tr>
          <tr><td>cutedsl_mla</td><td>CUTE DSL 实现</td></tr>
          <tr><td rowSpan={3}><strong>稀疏注意力</strong></td><td>dsa / nsa</td><td>DeepSeek 稀疏注意力 / Native Sparse Attention</td></tr>
          <tr><td>dsv4</td><td>DeepSeek V4 专用 (CUDA/HIP/NPU)</td></tr>
          <tr><td>minimax_sparse</td><td>MiniMax 稀疏注意力</td></tr>
          <tr><td rowSpan={4}><strong>硬件特定</strong></td><td>aiter</td><td>AMD ROCm (AI Tensor)</td></tr>
          <tr><td>ascend</td><td>华为昇腾 NPU</td></tr>
          <tr><td>intel_amx</td><td>Intel CPU AMX</td></tr>
          <tr><td>intel_xpu</td><td>Intel GPU XPU</td></tr>
          <tr><td rowSpan={3}><strong>混合/线性</strong></td><td>hybrid_attn</td><td>混合 SSM/线性模型包装器</td></tr>
          <tr><td>gdn</td><td>Gated DeltaNet</td></tr>
          <tr><td>kda</td><td>Kimi Delta Attention</td></tr>
        </tbody>
      </table>

      <h2>6. 分布式并行策略</h2>

      <h3>6.1 并行策略组合</h3>
      <p>SGLang 支持 <strong>7 种并行策略</strong>的组合，约束公式为：</p>
      <CodeBlock code={`tp_size = attn_tp_size * attn_cp_size * attn_dp_size
       = moe_tp_size * moe_ep_size * moe_dp_size
world_size = tp_size * pp_size`} language="python" title="并行策略约束公式" />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/server_args.py" target="_blank" rel="noreferrer">python/sglang/srt/server_args.py</a></div>

      <MermaidDiagram chart={`
flowchart LR
  subgraph TP["Tensor Parallel (基础组)"]
    T1["GPU 0"]
    T2["GPU 1"]
    T3["GPU 2"]
    T4["GPU 3"]
    T5["GPU 4"]
    T6["GPU 5"]
    T7["GPU 6"]
    T8["GPU 7"]
  end

  subgraph ATTN["Attention 子组<br/>attn_cp=2, attn_dp=4"]
    CP1["CP: [g0,g4]"]
    CP2["CP: [g1,g5]"]
    CP3["CP: [g2,g6]"]
    CP4["CP: [g3,g7]"]
    ATP1["ATTN_TP: [g0..g3]"]
    ATP2["ATTN_TP: [g4..g7]"]
  end

  subgraph MOE["MoE 子组<br/>moe_ep=4, moe_dp=2"]
    EP1["MOE_EP: [g0..g3]"]
    EP2["MOE_EP: [g4..g7]"]
    DP1["MOE_DP: [g0,g4]"]
    DP2["MOE_DP: [g1,g5]"]
    DP3["MOE_DP: [g2,g6]"]
    DP4["MOE_DP: [g3,g7]"]
  end

  TP --> ATTN
  TP --> MOE
      `} />

      <table>
        <thead><tr><th>策略</th><th>缩写</th><th>描述</th></tr></thead>
        <tbody>
          <tr><td>Tensor Parallel</td><td>TP</td><td>基础并行组，所有其他组都是其子组</td></tr>
          <tr><td>Pipeline Parallel</td><td>PP</td><td>正交于 TP，跨 rank 跨步，P2P send/recv</td></tr>
          <tr><td>Data Parallel</td><td>DP</td><td>隐式，分为 attn_dp 和 moe_dp</td></tr>
          <tr><td>Expert Parallel</td><td>EP</td><td>TP 的子组，弹性 EP 支持运行时扩展</td></tr>
          <tr><td>Context Parallel</td><td>CP</td><td>沿上下文维度切分注意力</td></tr>
          <tr><td>Decode Context Parallel</td><td>DCP</td><td>解码时跨 GPU 切分 KV 缓存</td></tr>
          <tr><td>Attention DP</td><td>AttnDP</td><td>注意力数据并行</td></tr>
        </tbody>
      </table>

      <h3>6.2 通信后端</h3>
      <table>
        <thead><tr><th>通信器</th><th>描述</th></tr></thead>
        <tbody>
          <tr><td>PyNcclCommunicator</td><td>NCCL via ctypes，CUDA Graph 捕获安全</td></tr>
          <tr><td>CustomAllreduce</td><td>NVLink GPU all-reduce，小 tensor 优化 (≤8MB)</td></tr>
          <tr><td>QuickAllReduce</td><td>ROCm 专用，FP/INT8/INT6/INT4 量化 reduce</td></tr>
          <tr><td>PyMscclppCommunicator</td><td>MSCCL++ 库，8/16/32 GPU 优化</td></tr>
          <tr><td>TorchSymmMemCommunicator</td><td>对称内存（multimem/two-shot）</td></tr>
          <tr><td>ShmRingBuf</td><td>共享内存环形缓冲区，节点内广播</td></tr>
          <tr><td>MooncakeTransferEngine</td><td>RDMA 跨节点专家权重传输</td></tr>
        </tbody>
      </table>

      <h3>6.3 EPLB (Expert Parallel Load Balancing)</h3>
      <p>
        <code>EPLBManager</code> 驱动定期专家重平衡，使用 <strong>DeepSeek 三步层次化算法</strong>：
        balanced_packing（贪心）→ replicate_experts（最小化最大负载）→ rebalance_experts_hierarchical（组→节点→GPU）。
        <strong>LP-Based Dispatch</strong>（<code>lplb_solver.py</code>）：每个 EP rank 独立求解相同 LP 问题，
        无需广播，返回概率性 token 分发。
      </p>

      <h2>7. 分离式架构</h2>

      <h3>7.1 Prefill-Decode 分离</h3>
      <MermaidDiagram chart={`
flowchart LR
  CLIENT["Client"] --> ROUTER["Router"]
  ROUTER --> PREFILL["Prefill Server<br/>计算密集型 · 高吞吐 GPU"]
  ROUTER --> DECODE["Decode Server<br/>内存密集型 · 低延迟 GPU"]

  subgraph TRANSFER["KV 传输协议"]
    B1["1. Bootstrap 握手<br/>aiohttp HTTP"]
    B2["2. 元数据交换<br/>decode→prefill: 预分配槽位"]
    B3["3. KV 传输<br/>send_kv_chunk: 页索引+状态索引"]
    B4["4. 完成轮询<br/>KVPoll MIN-reduce"]
  end

  PREFILL --> TRANSFER
  TRANSFER --> DECODE
  DECODE --> CLIENT
      `} />

      <h3>7.2 传输后端 (5 种)</h3>
      <table>
        <thead><tr><th>后端</th><th>传输</th><th>关键特性</th></tr></thead>
        <tbody>
          <tr><td><strong>NIXL</strong></td><td>NVIDIA NIXL agent</td><td>仅异步句柄轮询；预构建描述符列表</td></tr>
          <tr><td><strong>Mooncake</strong></td><td>基于会话的 RDMA</td><td>最稳健故障恢复：会话黑名单+后台探测</td></tr>
          <tr><td><strong>Ascend</strong></td><td>Mooncake 子类 + memfabric_hybrid</td><td>处理 NPU MLA C4/C128 压缩布局</td></tr>
          <tr><td><strong>Mori</strong></td><td>Mori IOEngine + MemoryDesc</td><td>连续索引分组，无 staging</td></tr>
          <tr><td><strong>Fake</strong></td><td>无操作</td><td>预热用，跳过整个传输机制</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>KV Events 系统：</strong>独立于 PD 传输路径的可选系统。通过 ZMQ 发布 KV 缓存占用事件
        （BlockStored/BlockRemoved/AllBlocksCleared），支持 GPU/CPU/DISK/EXTERNAL 四层存储介质，
        使外部路由器可实现前缀感知负载均衡。
      </Callout>

      <h2>8. 推测解码</h2>

      <table>
        <thead><tr><th>算法</th><th>文件</th><th>描述</th></tr></thead>
        <tbody>
          <tr><td><strong>EAGLE/EAGLE3</strong></td><td><code>eagle_worker_v2.py</code> (66KB)</td><td>单层 draft 模型，topk 分支树</td></tr>
          <tr><td><strong>Multi-Layer EAGLE</strong></td><td>-</td><td>并发多层 draft</td></tr>
          <tr><td><strong>STANDALONE</strong></td><td><code>standalone_worker_v2.py</code></td><td>非共享 draft 模型</td></tr>
          <tr><td><strong>N-gram</strong></td><td><code>ngram_worker.py</code> (24KB)</td><td>CPU trie，无需 draft 模型</td></tr>
          <tr><td><strong>DFlash</strong></td><td><code>dflash_worker_v2.py</code> (94KB)</td><td>基于块，借用 target lm_head</td></tr>
          <tr><td><strong>DSPark</strong></td><td><code>dspark_components/</code></td><td>Markov 链块 drafting + 置信度头</td></tr>
          <tr><td><strong>FrozenKV-MTP</strong></td><td><code>frozen_kv_mtp_worker_v2.py</code> (32KB)</td><td>只读 target KV 多 Token 预测</td></tr>
        </tbody>
      </table>

      <p>
        <strong>Draft/Verify 工作流</strong>：draft（构建树）→ verify（target forward + eagle_sample 接受）→ draft-extend（预热下一轮）。
        通过 <code>spec_registry.py</code> 插件化注册，<code>adaptive_runtime_state.py</code> 实现 EMA 接受率跟踪自适应调整。
      </p>

      <h2>9. Rust 服务端</h2>

      <table>
        <thead><tr><th>Crate</th><th>描述</th><th>技术栈</th></tr></thead>
        <tbody>
          <tr><td><strong>sglang-server</strong></td><td>Rust 原生 HTTP 前端，完全替代 Python TokenizerManager + HTTP 循环</td><td>Axum 0.8.9, dynamo-tokenizers, flume channels, POSIX shm</td></tr>
          <tr><td><strong>sglang-mm</strong></td><td>多模态预处理加速，纯 Rust 图像解码</td><td>image crate (JPEG/PNG/WebP/GIF/BMP), BLAKE3 哈希</td></tr>
          <tr><td><strong>sglang-grpc</strong></td><td>进程内 gRPC 服务</td><td>tonic 0.12, prost, tokenizers</td></tr>
        </tbody>
      </table>

      <CodeBlock code={`// Rust Server 核心架构
#[pyclass]
struct Server {
    // Python ↔ Rust 边界
}

impl Server {
    fn start(args: ServerArgs) -> Self    // 启动 HTTP 服务
    fn recv_requests() -> RequestBatch    // 列式接收请求批次
    fn push_decode_result_batch()         // 推送解码结果
    fn take_mm() -> Vec<MmEncodeResult>   // 取回多模态结果 (零拷贝)
    fn start_mm_workers(pool_size)        // 启动 MM 工作池
    fn shutdown()                         // 关闭
}

// 列式 IPC: headers(msgpack) + data(raw int64 LE) + lengths
#[pyclass(frozen, get_all)]
struct RequestBatch {
    headers: Vec<Py<PyBytes>>,
    data: Py<PyBytes>,
    lengths: Vec<u32>,
}

// 多模态: POSIX shm 零拷贝，TP 广播 ~100 字节 ShmPointerMMData
// Detokenizer: 按 Rid 分片 HashMap，无锁，增量 UTF-8
// CPU 核心绑定: A组(API) | B组(tokenizer) | C组(detokenizer) | TM核心(intake)`} language="rust" title="Rust Server 架构" />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/sgl-project/sglang/tree/main/rust" target="_blank" rel="noreferrer">rust/</a></div>

      <h2>10. 模型加载与权重管理</h2>

      <h3>10.1 14 种加载器</h3>
      <table>
        <thead><tr><th>加载器</th><th>描述</th></tr></thead>
        <tbody>
          <tr><td>DefaultModelLoader</td><td>本地/HF/ModelScope，多线程加载，GDS fastsafetensors</td></tr>
          <tr><td>LayeredModelLoader</td><td>逐层 meta device 加载，每层量化后释放，减少峰值内存</td></tr>
          <tr><td>QuantizedRLModelLoader</td><td>无 profile FP8 用于 RL 训练</td></tr>
          <tr><td>PreshardedModelLoader</td><td>转储/重载后量化 TP 分片状态，消除重启时重新量化</td></tr>
          <tr><td>BitsAndBytesModelLoader</td><td>NF4/8-bit 量化</td></tr>
          <tr><td>GGUFModelLoader</td><td>GGUF 文件，tensor 名称映射</td></tr>
          <tr><td>ExpertPackModelLoader</td><td>SSD 常驻专家打包 (deepseek-v4-flash, kimi-k3)</td></tr>
          <tr><td>RemoteModelLoader</td><td>从远程 KV 存储/文件系统 via connectors</td></tr>
          <tr><td>RemoteInstanceModelLoader</td><td>从另一个 live SGLang 实例 (NCCL broadcast/RDMA)</td></tr>
          <tr><td>RunaiModelStreamerLoader</td><td>从 SSD/共享 FS/S3/GCS/Azure 流式加载</td></tr>
          <tr><td>IpcModelLoader</td><td>从 Weight Cache Daemon via CUDA IPC（零拷贝）</td></tr>
        </tbody>
      </table>

      <h3>10.2 权重缓存守护进程</h3>
      <p>
        <code>WeightCacheDaemon</code>：每 GPU/TP rank 一个，持久化 GPU 常驻权重缓存。
        管线：磁盘加载 → TP 分片 → 量化 → 导出 IPC 句柄 → 通过 Unix socket 服务。
        <code>IpcModelLoader</code> 将每个参数直接映射到 IPC 映射的 GPU tensor（零拷贝），
        daemon 死亡时 SIGKILL engine。
      </p>

      <h2>11. 硬件后端与多模态</h2>

      <h3>11.1 硬件后端</h3>
      <table>
        <thead><tr><th>后端</th><th>路径</th><th>关键特性</th></tr></thead>
        <tbody>
          <tr><td><strong>GPU</strong></td><td><code>gpu/</code></td><td>CUDA/ROCm AWQ + GPTQ 内核</td></tr>
          <tr><td><strong>NPU</strong></td><td><code>npu/</code></td><td>华为昇腾。多个注意力后端，FRACTAL_NZ 格式，DSv4 子系统，EAGLE draft graph runner，FUSEEP MoE ops，zbal 内存管理，芯片特定默认值 (910B4 vs 910B1/2/3)</td></tr>
          <tr><td><strong>CPU</strong></td><td><code>cpu/</code></td><td>Intel AMX INT4 量化推理</td></tr>
          <tr><td><strong>XPU</strong></td><td><code>xpu/</code></td><td>Intel GPU (SYCL)，GDN 线性注意力</td></tr>
          <tr><td><strong>MLX</strong></td><td><code>mlx/</code></td><td>Apple Silicon (MPS)，MLX 原生模型运行器，融合 SwiGLU MoE</td></tr>
          <tr><td><strong>MUSA</strong></td><td><code>musa/</code></td><td>摩尔线程 GPU，Flash attention via MATE</td></tr>
        </tbody>
      </table>

      <h3>11.2 多模态处理</h3>
      <MermaidDiagram chart={`
flowchart LR
  MEDIA["请求媒体<br/>Image/Video/Audio"] --> LOAD["load_mm_data<br/>并行 IO"]
  LOAD --> PROCESS["process_and_combine_mm_data<br/>HF AutoProcessor<br/>GPU 解码 (nvJPEG)<br/>token 扩展"]
  PROCESS --> IPC["CUDA-IPC 传输<br/>零拷贝特征传递<br/>MmItemMemoryPool"]
  IPC --> ENCODER["视觉编码器<br/>50+ 模型处理器<br/>CLIP/LLaVA/Qwen-VL/GLM4V/..."]
  ENCODER --> LM["Embedding 融合到 LM 输入"]
      `} />

      <h2>12. 采样系统</h2>

      <h3>12.1 SamplingParams</h3>
      <p><code>msgspec.Struct</code>（IPC 高性能）：</p>
      <ul>
        <li><strong>标准</strong>：max_new_tokens, temperature, top_p, top_k, min_p, stop/stop_token_ids/stop_regex, min_new_tokens, n, beam_width</li>
        <li><strong>惩罚</strong>：frequency_penalty [-2,2], presence_penalty [-2,2], repetition_penalty (0,2]</li>
        <li><strong>结构化输出</strong>：json_schema, regex, ebnf, structural_tag（互斥）</li>
        <li><strong>高级</strong>：ignore_eos, skip_special_tokens, logit_bias, sampling_seed, custom_params</li>
      </ul>

      <h3>12.2 惩罚器库</h3>
      <table>
        <thead><tr><th>惩罚器</th><th>类型</th><th>实现</th></tr></thead>
        <tbody>
          <tr><td>BatchedRepetitionPenalizer</td><td>乘法</td><td>scatter_ 累积，logits * scaling / logits / scaling，@torch.compile</td></tr>
          <tr><td>BatchedFrequencyPenalizer</td><td>加法</td><td>scatter_add_ 累积每次出现，logits.sub_()</td></tr>
          <tr><td>BatchedPresencePenalizer</td><td>加法</td><td>scatter_ 每个 token 设置一次，logits.sub_()</td></tr>
          <tr><td>BatchedMinNewTokensPenalizer</td><td>加法</td><td>当 len_output_tokens &lt; min_new_tokens 时禁止 stop/eos</td></tr>
        </tbody>
      </table>

      <h2>13. 约束解码与 Function Calling</h2>

      <h3>13.1 约束解码后端</h3>
      <table>
        <thead><tr><th>后端</th><th>格式</th><th>Mask 类型</th><th>Jump Forward</th></tr></thead>
        <tbody>
          <tr><td><strong>xgrammar</strong></td><td>全部 (regex, JSON, EBNF)</td><td>Bitmask</td><td>find_jump_forward_string</td></tr>
          <tr><td><strong>outlines</strong></td><td>Regex, JSON-schema FSM</td><td>Boolean mask</td><td>当前禁用</td></tr>
          <tr><td><strong>llguidance</strong></td><td>全部</td><td>原生批量 mask 填充</td><td>支持 draft-chain 推测解码</td></tr>
          <tr><td><strong>reasoner</strong></td><td>装饰器包装器</td><td>thinking 阶段结束后启用</td><td>TokenSequenceMatcher think-end 检测</td></tr>
        </tbody>
      </table>

      <h3>13.2 Function Calling</h3>
      <p>
        <code>FunctionCallParser</code> 从 <code>ToolCallParserEnum</code>（~40 种格式）选择检测器：
      </p>
      <ul>
        <li><strong>Hermes</strong>：标记分隔块中的 JSON</li>
        <li><strong>Llama 3.2</strong>：python-tag + JSON，Python-dict 转换</li>
        <li><strong>Qwen3 Coder</strong>：嵌套 XML 标签，带游标的流式解析和类型强制转换</li>
        <li><strong>DeepSeek V4</strong>：DSML 标签，两种参数风格（XML 参数标签 / 直接 JSON）</li>
        <li>~35 种其他模型特定检测器</li>
      </ul>
      <p>流式解析先发出工具名称，然后增量发出参数差异。</p>

      <h2>14. dLLM 与会话管理</h2>

      <h3>14.1 dLLM (Diffusion LLMs)</h3>
      <p>
        通过迭代 <strong>去噪</strong>而非自回归预测生成 token 的模型（LLaDA2, SDAR）：
      </p>
      <ul>
        <li><code>DllmConfig</code>：algorithm, block_size (SDAR=4, LLaDA2=32), mask_id, first_done_first_out_mode</li>
        <li><strong>算法</strong>：LowConfidence（高于置信度阈值 0.95 的 unmask），JointThreshold（Mask-to-Token + Token-to-Token 编辑）</li>
      </ul>

      <h3>14.2 会话管理</h3>
      <p>两种模式：</p>
      <ul>
        <li><strong>经典/分支</strong>（streaming=False）：支持 replace, offset, drop_previous_output。每个 turn 重新 prefill+decode，利用 radix 缓存复用</li>
        <li><strong>流式</strong>（streaming=True）：仅追加，锁定 KV 池状态在 SessionSlot 中跨 turn 持久化。消除对话历史的完整重新 prefill</li>
      </ul>

      <h2>15. LoRA 支持</h2>
      <ul>
        <li><strong>LoRAManager</strong>：per-worker 协调器，4 阶段初始化。可插拔驱逐策略（LRU/FIFO），LoRADrainer 防止适配器饥饿</li>
        <li><strong>LoRAOverlapLoader</strong>：独立 CUDA stream 上重叠 H2D 权重拷贝与计算</li>
        <li><strong>Multi-LoRA 批量</strong>：分段 GEMM via LoRABatchInfo（CSR 风格段边界）</li>
        <li><strong>DeepSeek MLA 校正</strong>：注入被吸收 MLA 路径丢弃的 LoRA delta，Triton 内核</li>
        <li><strong>LoRA MoE</strong>：基于 hook 的架构，在 gate_up 和 down 投影后注入 delta。Marlin 变体用于 int4/int8 量化</li>
      </ul>

      <h2>16. 可观测性</h2>
      <table>
        <thead><tr><th>支柱</th><th>组件</th><th>描述</th></tr></thead>
        <tbody>
          <tr><td><strong>Prometheus 指标</strong></td><td><code>metrics_collector.py</code> (~2400行)</td><td>SchedulerMetricsCollector（运行/排队请求、吞吐量、缓存命中、KV/SWA/Mamba 内存、推测解码、PD 分离、EPLB 平衡度、FLOPs），TokenizerMetricsCollector（TTFT、token 间延迟、E2E 延迟），StorageMetricsCollector，RadixCacheMetricsCollector</td></tr>
          <tr><td><strong>分布式追踪</strong></td><td><code>trace.py</code></td><td>OpenTelemetry (OTLP gRPC/HTTP)，GenAI 语义约定，Mooncake KV 传输追踪</td></tr>
          <tr><td><strong>Per-iteration 遥测</strong></td><td><code>forward_pass_metrics.py</code></td><td>ForwardPassMetrics (msgspec structs)，每次 scheduler forward 通过 ZMQ PUB 发送</td></tr>
        </tbody>
      </table>

      <h2>17. 关键特性汇总</h2>
      <table>
        <thead><tr><th>特性</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td>RadixAttention</td><td>Radix Tree 前缀缓存，自动复用共享前缀，最高 5x 加速。C++ 加速可选</td></tr>
          <tr><td>Overlap Scheduling</td><td>双 CUDA Stream CPU/GPU 流水线，最大化 GPU 利用率</td></tr>
          <tr><td>Unified Radix Cache</td><td>统一管理标准/SWA/Mamba 多种 KV 类型，组件化设计</td></tr>
          <tr><td>HiCache 分层缓存</td><td>GPU → CPU → SSD 三层缓存，写入穿透策略</td></tr>
          <tr><td>分离式架构</td><td>Prefill/Decode 分离部署，5 种传输后端 (NIXL/Mooncake/Ascend/Mori/Fake)</td></tr>
          <tr><td>40+ 注意力后端</td><td>覆盖 FlashAttention/FlashInfer/FlashMLA/CUTLASS/TensorRT-LLM/Triton 等</td></tr>
          <tr><td>7 种并行策略</td><td>TP/PP/DP/EP/CP/DCP/AttentionDP 可组合，弹性 EP + EPLB LP 求解器</td></tr>
          <tr><td>8 种推测解码</td><td>EAGLE/N-gram/DFlash/DSPark/FrozenKV-MTP 等，插件化注册</td></tr>
          <tr><td>Rust 原生服务</td><td>3 个 Rust crate，列式 IPC + 零拷贝多模态，CPU 核心绑定</td></tr>
          <tr><td>14 种模型加载器</td><td>从本地/HF/远程/SSD/实例/缓存 多种来源，FP8/FP4/INT4/NF4/GGUF 量化</td></tr>
          <tr><td>80+ 模型支持</td><td>DeepSeek/LLaMA/Gemma/GLM/Qwen/GPT/Baichuan 等全系列</td></tr>
          <tr><td>6 种硬件后端</td><td>GPU/NPU/CPU/XPU/MLX/MUSA，平台发现机制</td></tr>
          <tr><td>4 种约束解码</td><td>XGrammar/Outlines/LLGuidance/Reasoner，Jump Forward 优化</td></tr>
          <tr><td>~40 种 FC 格式</td><td>Hermes/Llama3/Qwen3/DeepSeekV4 等 function calling 格式</td></tr>
          <tr><td>多模态</td><td>50+ 模型处理器，EVS 视频采样，Rust 图像解码加速</td></tr>
          <tr><td>dLLM 支持</td><td>Diffusion LLM (LLaDA2/SDAR)，迭代去噪生成</td></tr>
          <tr><td>可观测性</td><td>Prometheus 指标 + OTEL 分布式追踪 + Per-iteration 遥测</td></tr>
        </tbody>
      </table>

      <h2>18. SGLang vs vLLM 对比</h2>
      <table>
        <thead><tr><th>维度</th><th>SGLang</th><th>vLLM</th></tr></thead>
        <tbody>
          <tr><td><strong>KV Cache</strong></td><td>Radix Tree 自动前缀共享</td><td>PagedAttention + 显式前缀缓存</td></tr>
          <tr><td><strong>调度器</strong></td><td>Rust 零开销调度器，Overlap 流水线</td><td>Python 调度器，vLLM V1 多进程架构</td></tr>
          <tr><td><strong>注意力后端</strong></td><td>40+ 后端，装饰器注册</td><td>~10 后端，FlashAttention/FlashInfer 为主</td></tr>
          <tr><td><strong>分离式</strong></td><td>5 种传输后端 (NIXL/Mooncake/Ascend/Mori/Fake)</td><td>Pipeline Parallel 分离（实验性）</td></tr>
          <tr><td><strong>推测解码</strong></td><td>8 种算法，插件化</td><td>EAGLE/Medusa</td></tr>
          <tr><td><strong>并行策略</strong></td><td>7 种组合，弹性 EP + EPLB LP 求解器</td><td>TP/PP/DP/EP</td></tr>
          <tr><td><strong>前端语言</strong></td><td>SGLang DSL (IR/解释器/追踪器/7 后端)</td><td>无 DSL</td></tr>
          <tr><td><strong>Rust 组件</strong></td><td>3 个 crate（HTTP 服务/多模态/gRPC）</td><td>无</td></tr>
          <tr><td><strong>模型加载</strong></td><td>14 种加载器 + 权重缓存守护进程</td><td>HuggingFace 为主</td></tr>
          <tr><td><strong>约束解码</strong></td><td>4 种后端，Jump Forward 优化</td><td>XGrammar/Outlines</td></tr>
          <tr><td><strong>硬件</strong></td><td>6 种 (GPU/NPU/CPU/XPU/MLX/MUSA)</td><td>4 种 (NVIDIA/AMD/Intel/TPU)</td></tr>
          <tr><td><strong>代码规模</strong></td><td>~20 万行 (1718 py + 3 Rust crates)</td><td>~15 万行</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>SGLang 的核心优势：</strong>Radix Tree 自动前缀共享无需手动配置、40+ 注意力后端覆盖所有场景、
        5 种分离式传输后端、Rust 原生服务端实现列式 IPC 零拷贝、SGLang DSL 提供完整的 LLM 编程前端。
      </Callout>

      <ResourceTable resources={[
          { name: 'SGLang GitHub', url: 'https://github.com/sgl-project/sglang', desc: 'SGLang 官方仓库，RadixAttention 与零开销调度器的完整实现' },
          { name: 'SGLang 官方文档', url: 'https://docs.sglang.io', desc: 'RadixAttention、分离式架构、SGLang DSL 的详细文档' },
          { name: 'LMSYS Org', url: 'https://lmsys.org', desc: 'SGLang 背后的研究组织，大模型系统领域的顶级研究团队' },
          { name: 'Transformer 原始论文', url: 'https://arxiv.org/abs/1706.03762', desc: '"Attention Is All You Need"，Attention 机制的奠基之作' },
          { name: 'The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/', desc: 'Jay Alammar 经典可视化图解，直观理解 Q/K/V 与多头注意力' },
          { name: 'Attention? Attention!', url: 'https://lilianweng.github.io/posts/2018-06-24-attention/', desc: 'Lilian Weng 注意力机制综述，从 Seq2Seq 到 Self-Attention 的演进' },
          { name: 'nanoGPT', url: 'https://github.com/karpathy/nanoGPT', desc: 'Andrej Karpathy 极简 GPT 训练/推理实现，快速理解完整流程' },
          { name: 'HuggingFace Transformers', url: 'https://github.com/huggingface/transformers', desc: '最流行的生产级 Transformer 库，BERT/GPT/Llama 等完整实现' },
        ]} />
    </div>
  );
}