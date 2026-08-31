import { MermaidDiagram } from '../components/MermaidDiagram';
import { CodeBlock, Callout, ExternalLink, ResourceTable } from '../components/CodeBlock';

export function VLLMPage() {
  return (
    <div className="prose max-w-none">
      <h1>vLLM</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 基于 releases/v0.23.0</span>
        <span className="page-meta-item">⏱️ 阅读约 30 分钟</span>
        <span className="page-meta-item">🏷️ 引擎 · 架构 · 调度</span>
      </div>
      <p>
        vLLM 是 UC Berkeley Sky Computing Lab 开发的 LLM 推理引擎，以其 <strong>PagedAttention</strong> 创新闻名。
        它支持 200+ 模型架构，提供 OpenAI 兼容 API，是目前最流行的开源推理框架之一。
        以下分析基于 <strong>releases/v0.23.0</strong> 源码。
      </p>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://github.com/vllm-project/vllm" label="GitHub" />
        <ExternalLink href="https://docs.vllm.ai" label="官方文档" />
        <ExternalLink href="https://arxiv.org/abs/2309.06180" label="SOSP 2023 论文" />
        <ExternalLink href="https://github.com/xtms/vllm/blob/releases/v0.23.0/vllm_business_analysis.md" label="业务分析文档" />
      </div>

      {/* ==================== 1. 核心模块业务关系总览 ==================== */}
      <div className="section-divider"><span>核心模块业务关系总览</span></div>
      <p>
        vLLM 的系统架构遵循从请求入口到响应返回的<strong>管道式流程</strong>，按业务层次组织为以下子图：
      </p>

      <MermaidDiagram chart={`
flowchart TB
  subgraph ENTRY["入口层 entrypoints/"]
    LLM["LLM 离线推理"]
    API["OpenAI API Server"]
    CHAT["OpenAIServingChat"]
    COMP["OpenAIServingCompletion"]
  end

  subgraph ENGINE["引擎层 v1/engine/"]
    ASYNC["AsyncLLM / LLMEngine"]
    INP["InputProcessor"]
    OUT["OutputProcessor"]
    ECC["EngineCoreClient"]
    ECP["EngineCore / EngineCoreProc"]
  end

  subgraph SCHED["调度层 v1/core/"]
    SCHEDULER["Scheduler"]
    RQ["RequestQueue"]
    KV["KVCacheManager"]
    BP["BlockPool"]
    ECM["EncoderCacheManager"]
  end

  subgraph EXEC["执行层 v1/executor/ + v1/worker/"]
    EXECUTOR["Executor"]
    WORKER["Worker GPU/CPU/XPU"]
    GMR["GPUModelRunner"]
    IB["InputBatch"]
  end

  subgraph MODEL["模型层 model_executor/"]
    MODELS["models/ 295+ 架构"]
    LAYERS["layers/ 注意力/线性/RoPE/量化/MoE"]
    BACKENDS["backends/ FlashAttn/FlashInfer/MLA"]
  end

  subgraph SAMPLE["采样 v1/sample/"]
    SAMPLER["Sampler"]
    LP["LogitsProcessor"]
  end

  subgraph CONFIG["配置 config/"]
    VC["VllmConfig"]
  end

  ENTRY --> ENGINE
  ENGINE --> SCHED
  SCHED --> EXEC
  EXEC --> MODEL
  MODEL --> SAMPLE
  CONFIG -.-> ENGINE
  CONFIG -.-> SCHED
  CONFIG -.-> EXEC
  CONFIG -.-> MODEL
      `} />

      <table>
        <thead><tr><th>模块</th><th>目录</th><th>核心职责</th></tr></thead>
        <tbody>
          <tr><td><strong>入口层</strong></td><td><code>entrypoints/</code></td><td>LLM 离线推理、OpenAI 兼容 API 服务、Chat/Completion 处理</td></tr>
          <tr><td><strong>引擎层</strong></td><td><code>v1/engine/</code></td><td>前端引擎、输入预处理/Tokenization、输出后处理/Detokenization、EngineCore 繁忙循环、进程间通信客户端</td></tr>
          <tr><td><strong>调度层</strong></td><td><code>v1/core/</code></td><td>调度决策与抢占、等待/运行队列管理、分页 KV Cache 分配、物理块池与前缀缓存、多模态编码器缓存</td></tr>
          <tr><td><strong>执行层</strong></td><td><code>v1/executor/</code> + <code>v1/worker/</code></td><td>UniProc/Multiproc/Ray 执行器、GPU/CPU/XPU Worker、前向传播与 CUDA Graph 管理、持久化批状态</td></tr>
          <tr><td><strong>模型层</strong></td><td><code>model_executor/</code></td><td>295+ 模型实现、注意力/线性/RoPE/量化/融合 MoE 层、FlashAttn/FlashInfer/MLA 后端</td></tr>
          <tr><td><strong>采样</strong></td><td><code>v1/sample/</code></td><td>temperature/top-k/top-p 采样、logits 处理</td></tr>
          <tr><td><strong>配置</strong></td><td><code>config/</code></td><td>VllmConfig 聚合所有子配置，参数化所有层</td></tr>
        </tbody>
      </table>

      {/* ==================== 2. 请求生命周期 ==================== */}
      <div className="section-divider"><span>请求生命周期</span></div>

      <h3>在线服务流程 (OpenAI API → AsyncLLM)</h3>
      <p>完整的在线推理请求处理流程，从客户端 HTTP 请求到 SSE 流式响应：</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Client
    participant API as OpenAIServingChat
    participant AL as AsyncLLM
    participant IP as InputProcessor
    participant OP as OutputProcessor
    participant MC as AsyncMPClient/ZMQ
    participant EC as EngineCoreProc
    participant S as Scheduler
    participant E as Executor
    participant W as Worker
    participant MR as GPUModelRunner

    C->>API: POST /v1/chat/completions
    API->>API: render_chat_request 渲染模板
    API->>AL: engine_client.generate()
    AL->>IP: process_inputs 验证参数/Tokenize/多模态
    IP-->>AL: EngineCoreRequest
    AL->>AL: assign_request_id 映射ID
    AL->>OP: add_request 创建 RequestState
    OP->>OP: IncrementalDetokenizer + RequestOutputCollector
    AL->>MC: add_request_async (msgpack)
    MC->>EC: ZMQ ROUTER-DEALER
    EC->>EC: preprocess_add_request
    EC->>S: 放入 input_queue
    loop run_busy_loop 每个 step
        EC->>S: schedule()
        S->>S: Phase 1: 调度 RUNNING 请求
        S->>S: Phase 2: 调度 WAITING 请求
        S->>S: Phase 3: 终态化
        S-->>EC: SchedulerOutput
        EC->>E: execute_model
        E->>W: collective_rpc
        W->>MR: forward
        MR->>MR: _prepare_inputs / _model_forward
        MR->>MR: compute_logits
        MR-->>W: None (采样推迟)
        EC->>EC: get_grammar_bitmask
        EC->>E: sample_tokens
        E->>W: Sampler.forward
        W-->>EC: ModelRunnerOutput
        S->>S: update_from_output 更新状态/检查停止条件
        S->>S: free 已完成请求的 block
        EC->>EC: EngineCoreOutputs -> output_queue
    end
    EC->>MC: ZMQ PUSH-PULL
    MC-->>OP: process_outputs
    OP->>OP: detokenize + 构建 RequestOutput
    OP-->>AL: req_state.queue
    AL-->>API: yield RequestOutput
    API-->>C: SSE chunks (流式) / JSON (非流式)
      `} />

      <h3>离线推理流程 (LLM.generate)</h3>
      <CodeBlock language="python" title="LLM 离线推理示例" code={`from vllm import LLM, SamplingParams

llm = LLM(model="Qwen/Qwen2-7B-Instruct")
sampling_params = SamplingParams(temperature=0.8, max_tokens=256)
outputs = llm.generate(["Hello, how are you?"], sampling_params)
print(outputs[0].outputs[0].text)`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/vllm-project/vllm/blob/main/vllm/entrypoints/llm.py" target="_blank" rel="noreferrer">vllm/entrypoints/llm.py</a></div>

      <p>离线推理内部流程：</p>
      <ol>
        <li><code>LLM.generate(prompts)</code> 为每个 prompt 调用 <code>_add_completion_requests</code></li>
        <li><code>llm_engine.add_request</code>（同步 <code>LLMEngine</code>）处理输入</li>
        <li><code>engine_core.add_request</code> 通过 <code>InprocClient</code> 或 <code>SyncMPClient</code> 发送</li>
        <li>循环：<code>while has_unfinished_requests()</code>，调用 <code>llm_engine.step</code></li>
        <li><code>engine_core.get_output</code> 获取批次 <code>EngineCoreOutputs</code></li>
        <li><code>OutputProcessor.process_outputs</code> 产出 <code>request_outputs</code> 列表</li>
        <li>完成的输出按 <code>request_id</code> 排序后返回</li>
      </ol>

      <Callout type="tip">
        <strong>单进程 vs 多进程：</strong>离线推理使用 <code>InprocClient</code>（直接引用 EngineCore，无 ZMQ 开销），
        在线服务使用 <code>AsyncMPClient</code>（ZMQ ROUTER→DEALER 发请求，PUSH→PULL 收输出）。
        <code>SyncMPClient</code> 使用 <code>queue.Queue</code>，<code>AsyncMPClient</code> 使用 <code>asyncio.Queue</code>。
      </Callout>

      {/* ==================== 3. EngineCore.step 内部流程 ==================== */}
      <div className="section-divider"><span>EngineCore.step 内部流程</span></div>
      <p>这是 vLLM 最核心的繁忙循环，每次迭代经历调度 → 执行 → 采样 → 更新四个阶段：</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant EC as EngineCore
    participant S as Scheduler
    participant KV as KVCacheManager
    participant BP as BlockPool
    participant E as Executor
    participant MR as GPUModelRunner
    participant SMP as Sampler

    EC->>S: schedule()
    S->>S: new_step_starts() 重置每步状态

    rect rgb(238, 242, 255)
        Note over S,BP: Phase 1: 调度 RUNNING 请求
        loop 每个 running 请求
            S->>KV: allocate_slots(new_tokens)
            KV->>BP: get_new_blocks
            alt block 不足
                S->>S: _preempt_request 抢占
                S->>KV: free 被抢占请求的 block
                S->>KV: allocate_slots 重试
            end
        end
    end

    rect rgb(241, 245, 249)
        Note over S,BP: Phase 2: 调度 WAITING 请求
        loop 每个 waiting 请求 (受 token_budget 和 max_num_running_reqs 约束)
            S->>KV: get_computed_blocks 前缀缓存命中
            KV->>BP: find_longest_cache_hit
            S->>KV: allocate_slots(new_blocks)
            KV->>BP: get_new_blocks + cache_blocks
        end
    end

    rect rgb(248, 250, 252)
        Note over S: Phase 3: 终态化
        S->>S: 计算公共前缀 block (级联注意力)
        S->>S: 推进 num_computed_tokens
        S->>S: 构建 SchedulerOutput
    end

    S-->>EC: SchedulerOutput
    EC->>E: execute_model
    E->>MR: _prepare_inputs / _model_forward
    MR->>MR: compute_logits
    MR-->>EC: None
    EC->>EC: get_grammar_bitmask
    EC->>E: sample_tokens
    E->>SMP: Sampler.forward
    SMP-->>EC: ModelRunnerOutput
    EC->>S: update_from_output
    S->>S: 追加 token / 检查停止条件
    S->>KV: free 已完成请求的 block
    S-->>EC: EngineCoreOutputs
      `} />

      <h3>调度器三阶段详解</h3>
      <p>Scheduler 维护<strong>两个请求队列</strong>：<code>waiting</code>（等待中）和 <code>running</code>（已分配 KV block，每步产出 token）。<code>schedule()</code> 分三个阶段：</p>
      <ol>
        <li><strong>Phase 1 — 调度 RUNNING 请求</strong>：为每个运行中的请求分配新 token 的 KV slot；当 block 不足时，<strong>抢占</strong>低优先级请求（FCFS 弹出队尾 / PRIORITY 取最低优先级），释放其 block 后重试分配。被抢占请求回到 <code>waiting</code>，<code>num_computed_tokens=0</code></li>
        <li><strong>Phase 2 — 调度 WAITING 请求</strong>：先 <code>get_computed_blocks</code> 查前缀缓存命中，再 <code>allocate_slots</code> 分配新 block；受 <code>token_budget</code> 和 <code>max_num_running_reqs</code> 约束</li>
        <li><strong>Phase 3 — 终态化</strong>：计算公共前缀 block（级联注意力），推进 <code>num_computed_tokens</code>，构建 <code>SchedulerOutput</code></li>
      </ol>

      <Callout type="info">
        <strong>Continuous Batching：</strong>每步动态组合批处理，prefill 和 decode 混合调度（<code>chunked_prefill</code> 控制 prefill 分块大小）。
        没有 <code>can_schedule()</code> 方法 — 可调度性由 <code>allocate_slots</code> 返回 None 决定，触发抢占或循环退出。
      </Callout>

      {/* ==================== 4. KV Cache 分配与调度 ==================== */}
      <div className="section-divider"><span>KV Cache 分配与调度 (PagedAttention)</span></div>

      <MermaidDiagram chart={`
sequenceDiagram
    participant S as Scheduler
    participant KM as KVCacheManager
    participant KC as KVCacheCoordinator
    participant ST as SingleTypeKVCacheManager
    participant BP as BlockPool
    participant FH as BlockHashToBlockMap

    Note over S,FH: 新请求首次调度 (Prefill)
    S->>KM: get_computed_blocks(request)
    KM->>KC: find_longest_cache_hit
    KC->>ST: find_longest_cache_hit
    ST->>BP: get_cached_block(hash, group_ids)
    BP->>FH: 查找 hash
    FH-->>BP: KVCacheBlock (命中)
    BP-->>ST: cached blocks
    ST-->>KC: prefix cache hits
    KC-->>KM: computed_blocks
    KM-->>S: 已计算 block 数

    S->>KM: allocate_slots(request, num_new_tokens)
    KM->>KC: get_num_blocks_to_allocate
    KC->>BP: get_num_free_blocks
    alt 空闲 block 不足 (预留后)
        KM-->>S: None (触发抢占)
    else 空闲 block 充足
        KM->>KC: allocate_new_blocks
        KC->>BP: get_new_blocks(n)
        BP->>BP: 从 free_block_queue pop
        BP->>BP: ref_cnt++
        BP->>BP: 可能 evict 缓存 block (LRU)
        KM->>KM: cache_blocks 存储 hash 映射
        KM-->>S: 分配成功
    end

    Note over S,FH: 请求完成
    S->>KM: free(request_id)
    KM->>KC: free_blocks
    KC->>BP: free_blocks
    BP->>BP: ref_cnt--
    BP->>BP: ref_cnt==0 时归还 free_block_queue
      `} />

      <h3>KV Cache 三级管理架构</h3>
      <table>
        <thead><tr><th>层级</th><th>类</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><strong>顶层</strong></td><td><code>KVCacheManager</code></td><td>统筹分配/释放/查询，入口统一</td></tr>
          <tr><td><strong>协调层</strong></td><td><code>KVCacheCoordinator</code></td><td>跨注意力组协调；子类：<code>UnitaryKVCacheCoordinator</code> / <code>HybridKVCacheCoordinator</code> / <code>KVCacheCoordinatorNoPrefixCache</code></td></tr>
          <tr><td><strong>类型层</strong></td><td><code>SingleTypeKVCacheManager</code></td><td>按注意力类型管理；子类：<code>FullAttentionManager</code> / <code>SlidingWindowManager</code> / <code>ChunkedLocalAttentionManager</code> / <code>MambaManager</code></td></tr>
        </tbody>
      </table>

      <h3>核心数据结构</h3>
      <CodeBlock language="python" title="BlockPool 与 KVCacheBlock" code={`class KVCacheBlock:
    block_id: int          # 物理块 ID
    ref_cnt: int           # 引用计数，多请求共享前缀块时递增
    block_hash: int        # 块哈希，用于前缀缓存查找
    is_null: bool          # 空块标记

class FreeKVCacheBlockQueue:
    # 双向链表实现的空闲块队列
    popleft() -> KVCacheBlock
    popleft_n(n: int) -> list[KVCacheBlock]
    append(block: KVCacheBlock)
    remove(block: KVCacheBlock)

class BlockPool:
    blocks: list[KVCacheBlock]
    free_block_queue: FreeKVCacheBlockQueue
    cached_block_hash_to_block: BlockHashToBlockMap  # 哈希 → block 映射
    get_new_blocks(n: int) -> list[KVCacheBlock]     # 分配新块
    free_blocks(blocks)                                # 释放块
    get_cached_block(hash, group_ids) -> KVCacheBlock  # 前缀缓存查找
    get_num_free_blocks() -> int`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/block_pool.py" target="_blank" rel="noreferrer">vllm/v1/core/block_pool.py</a></div>

      <Callout type="tip">
        <strong>前缀缓存机制：</strong>通过 <code>BlockHashToBlockMap</code> 查找 block hash，命中 block 的 <code>ref_cnt++</code> 实现复用。
        当空闲 block 不足时，LRU 淘汰缓存 block（<code>_maybe_evict_cached_block</code>）。
        <code>ref_cnt == 0</code> 时 block 才归还到 <code>free_block_queue</code>。
      </Callout>

      {/* ==================== 5. Worker / GPUModelRunner 模型执行 ==================== */}
      <div className="section-divider"><span>Worker / GPUModelRunner 模型执行</span></div>

      <h3>两步执行设计 (异步调度优化)</h3>
      <p>vLLM V1 将模型执行拆分为两步，使调度和采样可以重叠执行：</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant EC as EngineCore
    participant E as Executor
    participant W as WorkerWrapperBase
    participant GMR as GPUModelRunner
    participant M as Model
    participant SMP as Sampler

    Note over EC,SMP: Step 1: execute_model (返回 None)
    EC->>E: execute_model(scheduler_output)
    E->>W: collective_rpc("execute_model")
    W->>W: _apply_mm_cache 多模态缓存
    W->>GMR: execute_model
    GMR->>GMR: _update_states 更新请求和 input_batch
    GMR->>GMR: _prepare_inputs req_indices/positions/seq_lens/slot_mappings
    GMR->>GMR: _prepare_input_ids 拷贝到 GPU
    GMR->>GMR: _determine_batch_execution_and_padding 选 CUDA Graph 模式
    GMR->>GMR: _build_attention_metadata
    GMR->>GMR: _preprocess 多模态编码/prompt embeds
    GMR->>M: _model_forward(input_ids, positions, attn_metadata, intermediate_tensors)
    M-->>GMR: hidden_states
    GMR->>GMR: compute_logits
    GMR->>GMR: 存储 execute_model_state (logits + metadata)
    GMR-->>W: None

    Note over EC,SMP: Step 2: sample_tokens (完成采样)
    EC->>EC: get_grammar_bitmask
    EC->>E: sample_tokens
    E->>W: collective_rpc("sample_tokens")
    W->>GMR: sample_tokens
    GMR->>GMR: 应用 grammar bitmask 到 logits
    GMR->>SMP: forward(logits, sampling_metadata)
    SMP->>SMP: compute_logprobs (log_softmax)
    SMP->>SMP: apply_logits_processors
    alt temperature < 1e-5 (Greedy)
        SMP->>SMP: argmax
    else Random
        SMP->>SMP: apply_temperature
        SMP->>SMP: min-p 过滤
        SMP->>SMP: TopKTopPSampler (top-k/top-p + multinomial)
    end
    SMP->>SMP: torch.where 合并 greedy/random
    SMP->>SMP: gather_logprobs 收集 top-k logprobs
    SMP-->>GMR: SamplerOutput
    GMR->>GMR: _update_states_after_model_execute
    opt 推测解码
        GMR->>GMR: propose_draft_token_ids
    end
    GMR-->>W: ModelRunnerOutput
      `} />

      <h3>CUDA Graph 模式选择</h3>
      <p><code>_determine_batch_execution_and_padding</code> 在运行时选择三种模式之一：</p>
      <table>
        <thead><tr><th>模式</th><th>触发条件</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>FULL</strong></td><td>包含 prefill 请求</td><td>完整 CUDA Graph，覆盖 prefill + decode</td></tr>
          <tr><td><strong>DECODE</strong></td><td>仅 decode 请求</td><td>仅 decode 阶段的 CUDA Graph</td></tr>
          <tr><td><strong>NONE</strong></td><td>不支持 CUDA Graph 时</td><td>直接 eager 执行，无图捕获</td></tr>
        </tbody>
      </table>

      <h3>InputBatch 持久化批状态</h3>
      <CodeBlock language="python" title="InputBatch 核心属性" code={`class InputBatch:
    _req_ids: list[str]                          # 当前批次请求 ID
    req_id_to_index: dict[str, int]              # 请求 ID → 批次索引
    token_ids_cpu_tensor: torch.Tensor           # 输入 token CPU 张量 (复用)
    block_table: MultiGroupBlockTable            # 多组 Block Table
    sampling_metadata: SamplingMetadata          # 采样元数据

    def add_request(self, request) -> None       # 添加请求到批次
    def remove_request(self, req_id) -> None     # 从批次移除请求
    def condense(self) -> None                   # 压缩批次 (移除空洞)
    def refresh_metadata(self) -> None           # 刷新元数据`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/worker/gpu_input_batch.py" target="_blank" rel="noreferrer">vllm/v1/worker/gpu_input_batch.py</a></div>

      <h3>Executor 类型选择</h3>
      <p><code>Executor.get_class()</code> 根据 <code>distributed_executor_backend</code> 选择：</p>
      <table>
        <thead><tr><th>类型</th><th>适用场景</th><th>特点</th></tr></thead>
        <tbody>
          <tr><td><code>UniProcExecutor</code></td><td>单 GPU</td><td>driver_worker 直接调用，无进程间通信</td></tr>
          <tr><td><code>MultiprocExecutor</code></td><td>多 GPU (TP/PP)</td><td>支持 PP，worker 进程列表，<code>collective_rpc</code> 广播</td></tr>
          <tr><td><code>RayDistributedExecutor</code></td><td>多节点</td><td>基于 Ray 的分布式执行</td></tr>
        </tbody>
      </table>

      {/* ==================== 6. 采样业务 ==================== */}
      <div className="section-divider"><span>采样业务 (Sampler)</span></div>
      <p><code>Sampler.forward</code> 内部采样严格按照以下顺序执行：</p>

      <ol>
        <li><strong><code>compute_logprobs</code></strong> — log_softmax 计算 log 概率</li>
        <li><strong><code>apply_logits_processors</code></strong> — 按顺序应用：
          <ul>
            <li>allowed-token-ids mask（约束合法 token）</li>
            <li>bad-words 过滤</li>
            <li>非 argmax 不变处理器（min-tokens / logit-bias）</li>
            <li>惩罚项（repetition / frequency / presence penalties）</li>
          </ul>
        </li>
        <li><strong>分支选择</strong>：
          <ul>
            <li><strong>Greedy 分支</strong>：<code>argmax</code> 直接取最大概率 token</li>
            <li><strong>Random 分支</strong>：<code>apply_temperature</code> → argmax 不变（min-p 过滤）→ <code>TopKTopPSampler</code>（top-k / top-p 截断 + multinomial 采样）</li>
          </ul>
        </li>
        <li><strong><code>torch.where</code></strong> — 合并 greedy/random 结果（temperature {'<'} 1e-5 视为 greedy）</li>
        <li><strong><code>gather_logprobs</code></strong> — 收集 top-k logprobs → <code>SamplerOutput</code></li>
      </ol>

      <Callout type="info">
        <strong>设计要点：</strong>temperature {'<'} 1e-5 时自动走 greedy 路径，避免不必要的随机采样开销。
      </Callout>

      {/* ==================== 7. 配置业务 ==================== */}
      <div className="section-divider"><span>配置业务 (VllmConfig)</span></div>
      <p>
        <code>VllmConfig</code> 聚合约 <strong>25 个子配置</strong>，所有层通过 <code>vllm_config</code> 读取参数化。
        <code>compute_hash()</code> 汇总所有子配置的哈希值用于缓存一致性校验。
      </p>

      <CodeBlock language="python" title="VllmConfig 子配置" code={`class VllmConfig:
    model_config: ModelConfig              # 模型定义
    cache_config: CacheConfig              # KV Cache 配置
    parallel_config: ParallelConfig        # 并行策略 (TP/PP/DP/EP)
    scheduler_config: SchedulerConfig      # 调度器参数
    device_config: DeviceConfig            # 设备类型
    load_config: LoadConfig                # 模型加载方式
    lora_config: Optional[LoRAConfig]      # LoRA 适配器
    speculative_config: Optional[SpeculativeConfig]  # 推测解码
    quantization_config: Optional[QuantizationConfig] # 量化
    compilation_config: CompilationConfig  # 编译参数
    kv_transfer_config: Optional[KVTransferConfig]    # KV 传输 (分离式)
    structured_outputs_config              # 结构化输出
    observability_config                   # 可观测性

    def compute_hash(self) -> str:         # 缓存一致性哈希
        ...`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/vllm-project/vllm/blob/main/vllm/config/vllm.py" target="_blank" rel="noreferrer">vllm/config/vllm.py</a></div>

      {/* ==================== 8. 类图 ==================== */}
      <div className="section-divider"><span>核心类图</span></div>

      <h3>引擎层 (v1/engine/)</h3>
      <MermaidDiagram chart={`
classDiagram
  class EngineClient {
    +generate()
    +encode()
    +abort()
    +errored()
  }
  class AsyncLLM {
    +VllmConfig vllm_config
    +InputProcessor input_processor
    +OutputProcessor output_processor
    +AsyncMPClient engine_core
    +generate() AsyncGenerator
    +add_request()
    +abort()
    +pause_generation()
    +resume_generation()
  }
  class LLMEngine {
    +add_request()
    +step()
    +abort_request()
    +has_unfinished_requests()
  }
  class InputProcessor {
    +process_inputs() EngineCoreRequest
    +assign_request_id() str
    +get_tokenizer()
  }
  class OutputProcessor {
    +Dict request_states
    +add_request()
    +process_outputs()
    +abort_requests()
  }
  class RequestState {
    +IncrementalDetokenizer detokenizer
    +LogprobsProcessor logprobs_processor
    +RequestOutputCollector queue
    +make_request_output()
  }
  class EngineCore {
    +Executor model_executor
    +Scheduler scheduler
    +step_fn
    +add_request()
    +abort_requests()
    +step()
  }
  class EngineCoreProc {
    +Queue input_queue
    +Queue output_queue
    +run_busy_loop()
    +_process_input_queue()
    +_process_engine_step()
  }
  class EngineCoreClient {
    +make_client() static
    +make_async_mp_client() static
  }
  class InprocClient {
    +EngineCore engine_core
  }
  class AsyncMPClient {
    +asyncio.Queue output_queue
    +get_output_async()
  }
  EngineClient <|-- AsyncLLM
  EngineClient <|-- LLMEngine
  AsyncLLM --> InputProcessor
  AsyncLLM --> OutputProcessor
  AsyncLLM --> AsyncMPClient
  OutputProcessor --> RequestState
  EngineCore --> EngineCoreProc
  EngineCoreClient <|-- InprocClient
  EngineCoreClient <|-- AsyncMPClient
      `} />

      <h3>调度层与 KV Cache (v1/core/)</h3>
      <MermaidDiagram chart={`
classDiagram
  class SchedulerInterface {
    +schedule()
    +get_grammar_bitmask()
    +update_from_output()
    +add_request()
    +finish_requests()
    +has_requests()
  }
  class Scheduler {
    +Dict requests
    +RequestQueue waiting
    +List running
    +KVCacheManager kv_cache_manager
    +SchedulingPolicy policy
    +schedule()
    +update_from_output()
    +_preempt_request()
  }
  class AsyncScheduler {
    +_update_after_schedule()
    +_update_request_with_output()
  }
  class SchedulerOutput {
    +List scheduled_new_reqs
    +CachedRequestData scheduled_cached_reqs
    +int total_num_scheduled_tokens
    +List finished_req_ids
    +List preempted_req_ids
  }
  class RequestQueue {
    +append()
    +pop()
    +preempt()
  }
  class FCFSRequestQueue
  class PriorityRequestQueue
  class KVCacheManager {
    +KVCacheCoordinator coordinator
    +BlockPool block_pool
    +allocate_slots()
    +free()
    +get_computed_blocks()
  }
  class KVCacheCoordinator {
    +BlockPool block_pool
    +allocate_new_blocks()
    +free()
    +find_longest_cache_hit()
  }
  class SingleTypeKVCacheManager {
    +BlockPool block_pool
    +Dict req_to_blocks
    +allocate_new_blocks()
    +free()
    +find_longest_cache_hit()
  }
  class BlockPool {
    +List blocks
    +FreeKVCacheBlockQueue free_block_queue
    +BlockHashToBlockMap cached_block_hash_to_block
    +get_new_blocks()
    +free_blocks()
    +get_cached_block()
  }
  SchedulerInterface <|-- Scheduler
  SchedulerInterface <|-- AsyncScheduler
  Scheduler --> SchedulerOutput
  Scheduler --> RequestQueue
  RequestQueue <|-- FCFSRequestQueue
  RequestQueue <|-- PriorityRequestQueue
  Scheduler --> KVCacheManager
  KVCacheManager --> KVCacheCoordinator
  KVCacheCoordinator --> SingleTypeKVCacheManager
  KVCacheManager --> BlockPool
      `} />

      <h3>执行层与 Worker (v1/executor/ + v1/worker/)</h3>
      <MermaidDiagram chart={`
classDiagram
  class Executor {
    +execute_model()
    +sample_tokens()
    +determine_available_memory()
    +get_kv_cache_specs()
    +collective_rpc()
    +initialize_from_config()
  }
  class UniProcExecutor {
    +WorkerWrapperBase driver_worker
    +_init_executor()
  }
  class MultiprocExecutor {
    +bool supports_pp
    +List worker_processes
  }
  class WorkerBase {
    +VllmConfig vllm_config
    +int local_rank
    +int rank
    +GPUModelRunner model_runner
    +init_device()
    +load_model()
    +execute_model()
  }
  class WorkerWrapperBase {
    +WorkerBase worker
    +init_worker()
    +execute_model()
  }
  class Worker {
    +torch.device device
    +GPUModelRunner model_runner
    +execute_model()
    +sample_tokens()
  }
  class GPUModelRunner {
    +nn.Module model
    +InputBatch input_batch
    +Dict requests
    +Sampler sampler
    +List kv_caches
    +execute_model()
    +sample_tokens()
    +load_model()
    +capture_model()
    +_prepare_inputs()
    +_model_forward()
  }
  class InputBatch {
    +List _req_ids
    +Dict req_id_to_index
    +Tensor token_ids_cpu_tensor
    +MultiGroupBlockTable block_table
    +add_request()
    +remove_request()
    +condense()
    +refresh_metadata()
  }
  class CachedRequestState {
    +str req_id
    +List prompt_token_ids
    +List block_ids
    +int num_computed_tokens
    +List output_token_ids
  }
  Executor <|-- UniProcExecutor
  Executor <|-- MultiprocExecutor
  WorkerBase <|-- Worker
  WorkerWrapperBase --> WorkerBase
  Worker --> GPUModelRunner
  GPUModelRunner --> InputBatch
  GPUModelRunner --> CachedRequestState
      `} />

      {/* ==================== 9. 进程间通信 ==================== */}
      <div className="section-divider"><span>进程间通信汇总</span></div>
      <table>
        <thead><tr><th>通信路径</th><th>机制</th><th>数据</th><th>相关文件</th></tr></thead>
        <tbody>
          <tr><td>AsyncLLM → EngineCore</td><td>ZMQ ROUTER → DEALER (msgpack)</td><td><code>EngineCoreRequest</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core_client.py" target="_blank" rel="noreferrer"><code>core_client.py</code></a></td></tr>
          <tr><td>EngineCore → AsyncLLM</td><td>ZMQ PUSH → PULL (msgpack)</td><td><code>EngineCoreOutputs</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core_client.py" target="_blank" rel="noreferrer"><code>core_client.py</code></a></td></tr>
          <tr><td>OutputProcessor → generate()</td><td>asyncio Event / RequestOutputCollector</td><td><code>RequestOutput</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/output_processor.py" target="_blank" rel="noreferrer"><code>output_processor.py</code></a></td></tr>
          <tr><td>EngineCore → Scheduler</td><td>函数调用</td><td><code>SchedulerOutput</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core.py" target="_blank" rel="noreferrer"><code>core.py</code></a> / <a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/sched/scheduler.py" target="_blank" rel="noreferrer"><code>scheduler.py</code></a></td></tr>
          <tr><td>EngineCore → Executor</td><td>函数调用 (Future)</td><td><code>SchedulerOutput</code> / <code>ModelRunnerOutput</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core.py" target="_blank" rel="noreferrer"><code>core.py</code></a></td></tr>
          <tr><td>Executor → Worker</td><td><code>collective_rpc</code> (函数调用/进程消息)</td><td>方法名 + 参数</td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/executor/abstract.py" target="_blank" rel="noreferrer"><code>executor/abstract.py</code></a></td></tr>
          <tr><td>EngineCoreProc 内部</td><td><code>queue.Queue</code></td><td>IO 线程 ↔ busy loop</td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core.py" target="_blank" rel="noreferrer"><code>core.py</code></a></td></tr>
          <tr><td>DP 协调 (可选)</td><td>ZMQ XPUB/XSUB + PULL</td><td>wave / stats</td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core.py" target="_blank" rel="noreferrer"><code>core.py</code></a></td></tr>
        </tbody>
      </table>

      {/* ==================== 10. 核心类清单 ==================== */}
      <div className="section-divider"><span>核心类清单 (按模块)</span></div>
      <table>
        <thead><tr><th>模块</th><th>核心类</th><th>文件</th></tr></thead>
        <tbody>
          <tr><td>入口 - 离线</td><td><code>LLM</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/entrypoints/llm.py" target="_blank" rel="noreferrer"><code>vllm/entrypoints/llm.py</code></a></td></tr>
          <tr><td>入口 - 在线</td><td><code>OpenAIServing</code> / <code>OpenAIServingChat</code> / <code>OpenAIServingCompletion</code></td><td><a href="https://github.com/vllm-project/vllm/tree/main/vllm/entrypoints/openai" target="_blank" rel="noreferrer"><code>vllm/entrypoints/openai/</code></a></td></tr>
          <tr><td>引擎 - 前端</td><td><code>AsyncLLM</code> / <code>LLMEngine</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/async_llm.py" target="_blank" rel="noreferrer"><code>vllm/v1/engine/async_llm.py</code></a> / <a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/llm_engine.py" target="_blank" rel="noreferrer"><code>llm_engine.py</code></a></td></tr>
          <tr><td>引擎 - 输入</td><td><code>InputProcessor</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/input_processor.py" target="_blank" rel="noreferrer"><code>vllm/v1/engine/input_processor.py</code></a></td></tr>
          <tr><td>引擎 - 输出</td><td><code>OutputProcessor</code> / <code>RequestState</code> / <code>RequestOutputCollector</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/output_processor.py" target="_blank" rel="noreferrer"><code>vllm/v1/engine/output_processor.py</code></a></td></tr>
          <tr><td>引擎 - Detokenize</td><td><code>IncrementalDetokenizer</code> / <code>FastIncrementalDetokenizer</code> / <code>SlowIncrementalDetokenizer</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/detokenizer.py" target="_blank" rel="noreferrer"><code>vllm/v1/engine/detokenizer.py</code></a></td></tr>
          <tr><td>引擎 - 核心</td><td><code>EngineCore</code> / <code>EngineCoreProc</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core.py" target="_blank" rel="noreferrer"><code>vllm/v1/engine/core.py</code></a></td></tr>
          <tr><td>引擎 - 客户端</td><td><code>EngineCoreClient</code> / <code>InprocClient</code> / <code>MPClient</code> / <code>AsyncMPClient</code> / <code>SyncMPClient</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/engine/core_client.py" target="_blank" rel="noreferrer"><code>vllm/v1/engine/core_client.py</code></a></td></tr>
          <tr><td>调度</td><td><code>Scheduler</code> / <code>AsyncScheduler</code> / <code>SchedulerInterface</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/sched/scheduler.py" target="_blank" rel="noreferrer"><code>vllm/v1/core/sched/scheduler.py</code></a></td></tr>
          <tr><td>调度 - 队列</td><td><code>RequestQueue</code> / <code>FCFSRequestQueue</code> / <code>PriorityRequestQueue</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/sched/request_queue.py" target="_blank" rel="noreferrer"><code>vllm/v1/core/sched/request_queue.py</code></a></td></tr>
          <tr><td>调度 - 输出</td><td><code>SchedulerOutput</code> / <code>NewRequestData</code> / <code>CachedRequestData</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/sched/output.py" target="_blank" rel="noreferrer"><code>vllm/v1/core/sched/output.py</code></a></td></tr>
          <tr><td>KV Cache</td><td><code>KVCacheManager</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/kv_cache_manager.py" target="_blank" rel="noreferrer"><code>vllm/v1/core/kv_cache_manager.py</code></a></td></tr>
          <tr><td>KV - 协调器</td><td><code>KVCacheCoordinator</code> / <code>UnitaryKVCacheCoordinator</code> / <code>HybridKVCacheCoordinator</code> / <code>KVCacheCoordinatorNoPrefixCache</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/kv_cache_coordinator.py" target="_blank" rel="noreferrer"><code>vllm/v1/core/kv_cache_coordinator.py</code></a></td></tr>
          <tr><td>KV - 类型管理</td><td><code>SingleTypeKVCacheManager</code> / <code>FullAttentionManager</code> / <code>SlidingWindowManager</code> / <code>MambaManager</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/single_type_kv_cache_manager.py" target="_blank" rel="noreferrer"><code>vllm/v1/core/single_type_kv_cache_manager.py</code></a></td></tr>
          <tr><td>Block Pool</td><td><code>BlockPool</code> / <code>FreeKVCacheBlockQueue</code> / <code>KVCacheBlock</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/block_pool.py" target="_blank" rel="noreferrer"><code>vllm/v1/core/block_pool.py</code></a> / <a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/kv_cache_utils.py" target="_blank" rel="noreferrer"><code>kv_cache_utils.py</code></a></td></tr>
          <tr><td>执行器</td><td><code>Executor</code> / <code>UniProcExecutor</code> / <code>MultiprocExecutor</code> / <code>RayDistributedExecutor</code></td><td><a href="https://github.com/vllm-project/vllm/tree/main/vllm/v1/executor" target="_blank" rel="noreferrer"><code>vllm/v1/executor/</code></a></td></tr>
          <tr><td>Worker</td><td><code>WorkerBase</code> / <code>Worker</code> / <code>WorkerWrapperBase</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/worker/worker_base.py" target="_blank" rel="noreferrer"><code>vllm/v1/worker/worker_base.py</code></a> / <a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/worker/gpu_worker.py" target="_blank" rel="noreferrer"><code>gpu_worker.py</code></a></td></tr>
          <tr><td>ModelRunner</td><td><code>GPUModelRunner</code> / <code>InputBatch</code> / <code>CachedRequestState</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/worker/gpu_model_runner.py" target="_blank" rel="noreferrer"><code>vllm/v1/worker/gpu_model_runner.py</code></a> / <a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/worker/gpu_input_batch.py" target="_blank" rel="noreferrer"><code>gpu_input_batch.py</code></a></td></tr>
          <tr><td>采样</td><td><code>Sampler</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/v1/sample/sampler.py" target="_blank" rel="noreferrer"><code>vllm/v1/sample/sampler.py</code></a></td></tr>
          <tr><td>配置</td><td><code>VllmConfig</code></td><td><a href="https://github.com/vllm-project/vllm/blob/main/vllm/config/vllm.py" target="_blank" rel="noreferrer"><code>vllm/config/vllm.py</code></a></td></tr>
        </tbody>
      </table>

      {/* ==================== 11. 关键特性 ==================== */}
      <div className="section-divider"><span>关键特性</span></div>
      <table>
        <thead><tr><th>特性</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td>PagedAttention</td><td>页面式 KV Cache 管理，消除内存碎片，内存利用率提升至 99%+</td></tr>
          <tr><td>Continuous Batching</td><td>动态批处理，prefill 和 decode 混合调度</td></tr>
          <tr><td>Chunked Prefill</td><td>将长 prefill 分块，与 decode 交替执行，降低首 token 延迟</td></tr>
          <tr><td>Prefix Caching</td><td>BlockHashToBlockMap 自动复用共享前缀的 KV Cache</td></tr>
          <tr><td>CUDA Graph</td><td>预捕获计算图（FULL/DECODE 模式），减少 kernel launch 开销</td></tr>
          <tr><td>Speculative Decoding</td><td>n-gram / EAGLE / DFlash 推测解码，提升 decode 吞吐</td></tr>
          <tr><td>Disaggregated Serving</td><td>Prefill / Decode 分离部署，独立 GPU 池</td></tr>
          <tr><td>Multi-LoRA</td><td>同时服务多个 LoRA 适配器</td></tr>
          <tr><td>Structured Output</td><td>JSON Schema / Tool Calling 约束生成</td></tr>
          <tr><td>异步调度优化</td><td>两步执行 (execute_model 返回 None + sample_tokens)，调度与采样重叠</td></tr>
        </tbody>
      </table>

      {/* ==================== 12. 设计原则 ==================== */}
      <div className="section-divider"><span>设计原则</span></div>
      <ul>
        <li><strong>VllmConfig 统一配置</strong>：所有类共享 VllmConfig（聚合 ~25 个子配置），新增功能只需添加配置项，<code>compute_hash()</code> 保证缓存一致性</li>
        <li><strong>统一模型构造器</strong>：所有模型使用相同的 <code>__init__(self, *, vllm_config, prefix="")</code> 签名</li>
        <li><strong>初始化时分片量化</strong>：权重在加载时即分片/量化，避免每个 GPU 加载完整权重</li>
        <li><strong>持久化批状态</strong>：<code>InputBatch</code> 跨 step 复用 GPU buffer，避免每步重建</li>
        <li><strong>无 can_schedule()</strong>：可调度性由 <code>allocate_slots</code> 返回 None 隐式决定，触发抢占或循环退出</li>
      </ul>

      <Callout type="warning">
        <strong>注意：</strong>vLLM V1 架构与 V0 有显著差异。V1 引入了多进程架构（API Server / Engine Core / GPU Worker 分离），
        使用 ZMQ 进行进程间通信（ROUTER→DEALER 发请求，PUSH→PULL 收输出）。如果查阅旧资料，请注意区分 V0 和 V1 的架构差异。
      </Callout>

      <ResourceTable resources={[
          { name: 'vLLM GitHub', url: 'https://github.com/vllm-project/vllm', desc: 'vLLM 官方仓库，PagedAttention 推理引擎的完整实现' },
          { name: 'vLLM 架构文档', url: 'https://docs.vllm.ai/en/latest/design/arch_overview.html', desc: 'vLLM V1 多进程架构、调度器、BlockManager 的详细设计文档' },
          { name: 'vLLM 业务分析文档', url: 'https://github.com/xtms/vllm/blob/releases/v0.23.0/vllm_business_analysis.md', desc: 'vLLM v0.23.0 业务逻辑分析，覆盖 Engine/Scheduler/Worker 模块' },
          { name: 'vLLM 技术博客', url: 'https://blog.vllm.ai/2023/06/20/vllm.html', desc: 'vLLM 团队官方博客，PagedAttention 与 Continuous Batching 详解' },
          { name: 'PagedAttention 论文 (SOSP 2023)', url: 'https://arxiv.org/abs/2309.06180', desc: 'PagedAttention 原始论文，KV Cache 分页管理的理论基础' },
          { name: 'Transformer 原始论文', url: 'https://arxiv.org/abs/1706.03762', desc: '"Attention Is All You Need"，Attention 机制的奠基之作' },
          { name: 'The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/', desc: 'Jay Alammar 经典可视化图解，直观理解 Q/K/V 与多头注意力' },
          { name: 'The Annotated Transformer', url: 'https://nlp.seas.harvard.edu/2018/04/03/attention.html', desc: 'Harvard NLP 逐行注释 PyTorch 实现，代码与公式一一对应' },
          { name: 'Attention? Attention!', url: 'https://lilianweng.github.io/posts/2018-06-24-attention/', desc: 'Lilian Weng 注意力机制综述，从 Seq2Seq 到 Self-Attention 的演进' },
          { name: 'nanoGPT', url: 'https://github.com/karpathy/nanoGPT', desc: 'Andrej Karpathy 极简 GPT 训练/推理实现，快速理解完整流程' },
          { name: 'HuggingFace Transformers', url: 'https://github.com/huggingface/transformers', desc: '最流行的生产级 Transformer 库，BERT/GPT/Llama 等完整实现' },
        ]} />
    </div>
  );
}