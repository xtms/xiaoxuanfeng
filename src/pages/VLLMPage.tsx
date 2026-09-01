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

      {/* ==================== 2.5. 启动流程 ==================== */}
      <div className="section-divider"><span>启动流程</span></div>
      <p>vLLM 的启动从命令行参数解析到模型就绪，经历<strong>配置构建 → 设备初始化 → 模型加载 → 引擎启动</strong>四个阶段：</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant CLI as 命令行
    participant ARGS as ArgParser
    participant EC as EngineArgs
    participant VC as VllmConfig
    participant PLAT as Platform
    participant DEV as 设备初始化
    participant EXEC as Executor
    participant W as Worker
    participant MR as ModelRunner
    participant M as Model
    participant KV as KV Cache
    participant S as Scheduler

    CLI->>ARGS: python -m vllm serve model --port 8000
    ARGS->>EC: EngineArgs.from_cli_args()
    EC->>VC: EngineArgs.create_engine_config()
    VC->>VC: 构建 25 个子配置
    VC->>VC: compute_hash() 缓存一致性

    VC->>PLAT: resolve_obj_by_platform()
    PLAT->>PLAT: 确定设备类型 (cuda/rocm/npu/...)
    PLAT->>PLAT: 注册平台实现

    VC->>DEV: 设置 CUDA_VISIBLE_DEVICES
    DEV->>DEV: torch.cuda.set_device()
    DEV->>DEV: 初始化 NCCL 进程组 (多卡)

    VC->>EXEC: Executor.get_class(vllm_config)
    EXEC->>EXEC: 选择 UniProc/Multiproc/Ray
    EXEC->>W: 创建 Worker 进程
    W->>W: init_device() 设置 GPU
    W->>MR: 创建 GPUModelRunner
    MR->>M: load_model()
    M->>M: 加载权重 (按 TP 分片)
    M->>M: 应用量化 (FP8/INT8/...)
    MR->>MR: capture_model() CUDA Graph
    MR->>MR: 预分配 KV Cache
    W-->>EXEC: 模型就绪

    EXEC->>KV: determine_available_memory()
    KV->>KV: 计算可用显存
    KV->>KV: 初始化 BlockPool
    KV->>KV: 创建 free_block_queue

    VC->>S: 创建 Scheduler
    S->>S: 初始化 waiting/running 队列
    S->>S: 设置 token_budget / max_reqs

    Note over CLI,S: 启动完成，开始接受请求
      `} />

      <h3>启动参数详解</h3>
      <CodeBlock language="bash" title="vLLM 启动命令" code={`# 在线服务
python -m vllm.entrypoints.openai.api_server \\
    --model Qwen/Qwen2-7B-Instruct \\
    --tensor-parallel-size 2 \\
    --gpu-memory-utilization 0.90 \\
    --max-model-len 8192 \\
    --max-num-seqs 256 \\
    --enable-prefix-caching \\
    --enable-chunked-prefill \\
    --max-num-batched-tokens 8192`} />

      <table>
        <thead><tr><th>参数</th><th>默认值</th><th>作用</th></tr></thead>
        <tbody>
          <tr><td><code>--tensor-parallel-size</code></td><td>1</td><td>张量并行度，每层权重切分到 N 张 GPU</td></tr>
          <tr><td><code>--gpu-memory-utilization</code></td><td>0.90</td><td>GPU 显存利用率上限，剩余留给 CUDA context</td></tr>
          <tr><td><code>--max-model-len</code></td><td>模型配置</td><td>最大序列长度，超过则截断</td></tr>
          <tr><td><code>--max-num-seqs</code></td><td>256</td><td>最大并发请求数，影响 KV Cache 分配</td></tr>
          <tr><td><code>--enable-prefix-caching</code></td><td>False</td><td>启用前缀缓存，多轮对话显著加速</td></tr>
          <tr><td><code>--enable-chunked-prefill</code></td><td>True</td><td>启用分块 prefill，降低首 token 延迟</td></tr>
          <tr><td><code>--max-num-batched-tokens</code></td><td>8192</td><td>每步最大 token 数，控制 prefill 分块大小</td></tr>
          <tr><td><code>--dtype</code></td><td>auto</td><td>模型精度：auto/float16/bfloat16/float32</td></tr>
          <tr><td><code>--quantization</code></td><td>None</td><td>量化方法：fp8/gptq/awq/marlin/...</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>显存计算：</strong>KV Cache 占用 = <code>2 × num_layers × num_kv_heads × head_dim × max_model_len × max_num_seqs × dtype_size</code>。
        例如 Qwen2-7B (28层, 4 KV heads, 128 head_dim, BF16, 8192 tokens, 256 seqs)：
        <code>2 × 28 × 4 × 128 × 8192 × 256 × 2</code> ≈ <strong>114 GB</strong>，远超单卡 80GB，
        因此需要 TP=2 或降低 max_model_len。
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

      {/* ==================== 3.5. 抢占机制详解 ==================== */}
      <div className="section-divider"><span>抢占机制详解</span></div>
      <p>当 KV Cache block 不足时，vLLM 需要<strong>抢占</strong>部分正在运行的请求以释放显存。vLLM V1 支持两种抢占策略：</p>

      <h3>PRIORITY 策略（默认）</h3>
      <p>按优先级排序，<strong>抢占优先级最低的请求</strong>。优先级通过 <code>request.priority</code> 设置，值越小优先级越高（0 最高）。</p>

      <CodeBlock language="python" title="PRIORITY 抢占逻辑" code={`def _preempt_request(self) -> Optional[Request]:
    """抢占优先级最低的请求"""
    if self.policy == PreemptionPolicy.PRIORITY:
        # 按优先级排序，取最低的
        self.running.sort(key=lambda r: r.priority, reverse=True)
        # 跳过无法被抢占的请求（如已完成 prefill 但未进入 decode 的）
        for req in self.running:
            if req.num_computed_tokens > 0:  # 至少完成了一些 token
                return req
    return None

# 被抢占请求的处理:
# 1. num_computed_tokens = 0  (全量重算，不保留任何 KV Cache)
# 2. 释放所有 KV blocks
# 3. 回到 waiting 队列
# 4. 下次重新从 token 0 开始 prefill`} />

      <h3>FCFS 策略</h3>
      <p><strong>后进先出（LIFO）</strong>：按请求到达时间排序，<strong>抢占最后到达的请求</strong>。类似栈弹出，后入队的先被抢占。</p>

      <CodeBlock language="python" title="FCFS 抢占逻辑" code={`def _preempt_request(self) -> Optional[Request]:
    """FCFS 抢占最后到达的请求"""
    if self.policy == PreemptionPolicy.FCFS:
        # 按到达时间排序，取最新的
        self.running.sort(key=lambda r: r.arrival_time, reverse=True)
        for req in self.running:
            if req.num_computed_tokens > 0:
                return req
    return None`} />

      <h3>抢占流程</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant S as Scheduler
    participant R1 as Req A (running)
    participant R2 as Req B (running)
    participant BP as BlockPool

    Note over S,BP: Step 1: 分配失败，触发抢占
    S->>S: allocate_slots(req) 返回 None
    S->>S: 选择抢占目标 (PRIORITY/FCFS)
    S->>R2: 标记 Req B 为被抢占
    S->>BP: 释放 Req B 的 KV blocks
    BP->>BP: ref_cnt-- 每个 block
    BP->>BP: ref_cnt==0 → free_block_queue

    Note over S,BP: Step 2: 重试分配
    S->>BP: 重新为 Req A 分配 blocks
    BP-->>S: 分配成功

    Note over S,BP: Step 3: 被抢占请求回到 waiting
    S->>R2: num_computed_tokens=0
    S->>R2: 回到 waiting 队列
    Note over R2: 下次重新 prefill (全量重算)
      `} />

      <h3>抢占 vs 交换策略对比</h3>
      <table>
        <thead><tr><th>策略</th><th>核心思想</th><th>KV Cache 处理</th><th>恢复成本</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>PRIORITY</strong></td><td>抢占低优先级请求</td><td>直接释放 KV blocks</td><td>全量重算（高）</td><td>在线服务，有优先级区分</td></tr>
          <tr><td><strong>FCFS</strong></td><td>抢占最新到达的请求</td><td>直接释放 KV blocks</td><td>全量重算（高）</td><td>批处理，公平性优先</td></tr>
          <tr><td><strong>Swap (V0)</strong></td><td>KV Cache 换出到 CPU</td><td>GPU→CPU 拷贝，保留内容</td><td>CPU→GPU 拷贝（低）</td><td>V0 遗留，V1 已移除</td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>注意：</strong>vLLM V1 <strong>不支持 SWAP 抢占</strong>（KV Cache 换出到 CPU 内存），仅支持 <strong>全量重算</strong>。
        这意味着被抢占的请求需要从头开始 prefill，在长 prompt 场景下恢复成本较高。
        选择 PRIORITY 策略时，确保重要请求设置较高优先级（值更小），不要被频繁抢占。
      </Callout>

      {/* ==================== 4. KV Cache 分配与调度 ==================== */}
      <div className="section-divider"><span>KV Cache 分配与调度 (PagedAttention)</span></div>

      <MermaidDiagram maxWidth={480} chart={`
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

      {/* ==================== 4.5. Chunked Prefill 与 Prefix Caching 详解 ==================== */}
      <div className="section-divider"><span>Chunked Prefill 详解</span></div>
      <p>Chunked Prefill 是 vLLM 降低<strong>首 token 延迟（TTFT）</strong>的关键优化。它将长 prefill 请求拆分为多个小块，与 decode 请求交替执行，避免长 prefill 阻塞 decode。</p>

      <h3>工作原理</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant S as Scheduler
    participant R1 as Req A (prefill, 4096 tokens)
    participant R2 as Req B (decode)
    participant R3 as Req C (decode)

    Note over S,R3: Step 1: Chunk 1 of Req A (2048 tokens) + Req B + Req C
    S->>R1: prefill chunk 1 (tokens 0-2047)
    S->>R2: decode 1 token
    S->>R3: decode 1 token

    Note over S,R3: Step 2: Chunk 2 of Req A (2048 tokens) + Req B + Req C
    S->>R1: prefill chunk 2 (tokens 2048-4095)
    S->>R2: decode 1 token
    S->>R3: decode 1 token

    Note over S,R3: Step 3: Req A enters decode phase
    S->>R1: decode 1 token
    S->>R2: decode 1 token
    S->>R3: decode 1 token
      `} />

      <h3>Token Budget 控制</h3>
      <p><code>max_num_batched_tokens</code> 控制每步处理的总 token 数上限。调度器根据此值决定每个 prefill 请求的分块大小：</p>
      <CodeBlock language="python" title="Chunked Prefill 调度逻辑" code={`def schedule(self) -> SchedulerOutput:
    # token_budget 决定每步能处理多少 token
    token_budget = self.scheduler_config.max_num_batched_tokens

    # Phase 1: 先调度 RUNNING (decode) 请求
    for req in self.running:
        num_new_tokens = 1  # decode 阶段每步只产 1 token
        if self._allocate_slots(req, num_new_tokens):
            token_budget -= num_new_tokens
            scheduled.append(req)

    # Phase 2: 调度 WAITING (prefill) 请求
    for req in self.waiting:
        remaining_tokens = len(req.prompt_token_ids) - req.num_computed_tokens
        # 分块大小 = min(剩余 tokens, token_budget)
        chunk_size = min(remaining_tokens, token_budget)
        if self._allocate_slots(req, chunk_size):
            token_budget -= chunk_size
            scheduled.append(req)
            if token_budget <= 0:
                break  # budget 耗尽，剩余 prefill 下次再调度`} />

      <table>
        <thead><tr><th>参数</th><th>作用</th><th>建议值</th></tr></thead>
        <tbody>
          <tr><td><code>max_num_batched_tokens</code></td><td>每步最大 token 处理量</td><td>8192 (A100) / 4096 (A10)</td></tr>
          <tr><td><code>--enable-chunked-prefill</code></td><td>启用分块 prefill</td><td>True（在线服务推荐）</td></tr>
          <tr><td><code>--max-num-seqs</code></td><td>最大并发请求数</td><td>256</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>不启用 Chunked Prefill 的后果：</strong>一个 32K token 的 prefill 请求会占用 GPU 数秒，期间所有 decode 请求都被阻塞，
        导致 TTFT 从毫秒级飙升到秒级。启用后，prefill 被分成 ~4 个 8K 块，与 decode 交替执行，TTFT 显著降低。
      </Callout>

      {/* ==================== 4.6. Prefix Caching 详细机制 ==================== */}
      <div className="section-divider"><span>Prefix Caching 详细机制</span></div>
      <p>前缀缓存是 vLLM 在多轮对话和批处理场景下的<strong>核心加速</strong>手段。相同的 prompt 前缀只需计算一次 KV Cache，后续请求直接复用。</p>

      <h3>哈希计算</h3>
      <CodeBlock language="python" title="Block Hash 计算" code={`def hash_block_tokens(parent_hash: int,
                        curr_tokens: list[int],
                        extra_keys: Any = None) -> int:
    """计算 block 的哈希值

    使用链式哈希: hash_n = SHA256(hash_{n-1} + tokens_n + extra_keys)
    链式设计确保: 相同前缀的 block 哈希相同
    """
    hasher = hashlib.sha256()
    hasher.update(parent_hash.to_bytes(32, 'little'))
    for token in curr_tokens:
        hasher.update(token.to_bytes(4, 'little'))
    if extra_keys is not None:
        hasher.update(str(extra_keys).encode())
    # 取前 8 字节作为 64-bit hash (碰撞概率极低)
    return int.from_bytes(hasher.digest()[:8], 'little')`} />

      <h3>三级查找流程</h3>
      <ol>
        <li><strong>BlockHashToBlockMap 查找</strong>：O(1) 哈希表查找，key = block_hash</li>
        <li><strong>Token 二次验证</strong>：哈希匹配后，逐 token 比对确认（防止哈希碰撞）</li>
        <li><strong>最长前缀匹配</strong>：从第一个 block 开始链式查找，直到第一个不匹配的 block</li>
      </ol>

      <h3>碰撞处理</h3>
      <table>
        <thead><tr><th>场景</th><th>处理方式</th></tr></thead>
        <tbody>
          <tr><td>哈希碰撞（不同内容相同 hash）</td><td>Token 二次验证失败 → 视为未命中，分配新 block</td></tr>
          <tr><td>多 LoRA 前缀冲突</td><td><code>extra_keys</code> 包含 LoRA ID，区分不同适配器</td></tr>
          <tr><td>多模态输入</td><td><code>extra_keys</code> 包含 <code>multi_modal_hash</code>，区分不同图像</td></tr>
        </tbody>
      </table>

      <h3>缓存命中率影响因素</h3>
      <table>
        <thead><tr><th>因素</th><th>影响</th><th>优化建议</th></tr></thead>
        <tbody>
          <tr><td>Block 大小</td><td>越小命中率越高，但管理开销更大</td><td>默认 16 tokens，通常无需调整</td></tr>
          <tr><td>System Prompt</td><td>固定 system prompt 可完全命中</td><td>使用相同 system prompt 提升命中率</td></tr>
          <tr><td>多轮对话</td><td>每轮命中前一整轮的 KV Cache</td><td>天然适合多轮对话场景</td></tr>
          <tr><td>KV Cache 容量</td><td>容量不足时 LRU 淘汰旧缓存</td><td>增大 gpu_memory_utilization</td></tr>
        </tbody>
      </table>

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

      {/* ==================== 5.5. 并行策略详解 ==================== */}
      <div className="section-divider"><span>并行策略详解 (TP/PP/DP/EP/CP)</span></div>
      <p>vLLM 支持五种并行策略，通过 <code>ParallelConfig</code> 配置。以下逐一分析每种策略的原理、实现和适用场景。</p>

      <h3>1. Tensor Parallelism (TP) — 张量并行</h3>
      <p><strong>最核心的并行策略</strong>，将每层权重矩阵沿行/列切分到多张 GPU 上，通过集合通信完成前向传播。vLLM 默认使用 Megatron-LM 风格的 TP。</p>

      <MermaidDiagram chart={`
graph LR
    subgraph GPU0["GPU 0"]
        A0["Column Linear 列切分"]
        B0["All-Reduce 求和"]
    end
    subgraph GPU1["GPU 1"]
        A1["Column Linear 列切分"]
        B1["All-Reduce 求和"]
    end
    IN["Input f: D → D/h"] --> A0
    IN --> A1
    A0 --> B0
    A1 --> B1
    B0 --> OUT["Output 拼接"]
    B1 --> OUT
      `} />

      <CodeBlock language="python" title="TP 核心通信原语" code={`# ColumnParallelLinear: 列切分 + All-Reduce
class ColumnParallelLinear(nn.Module):
    def forward(self, input_):
        # gather_dim=0: 每张 GPU 处理一部分列
        output = F.linear(input_, self.weight)  # weight: [out//tp, in]
        # All-Reduce 求和，将多 GPU 的部分结果合并
        output = tensor_model_parallel_all_reduce(output)
        return output

# RowParallelLinear: 行切分 + All-Reduce (后置)
class RowParallelLinear(nn.Module):
    def forward(self, input_):
        # input 已经按列切分，每张 GPU 独立计算
        output = F.linear(input_, self.weight)  # weight: [out, in//tp]
        output = tensor_model_parallel_all_reduce(output)
        return output

# 通信开销: 每个 Transformer 层 2 次 All-Reduce
# - Attention: 1 次 (output projection)
# - MLP: 1 次 (down projection)`} />

      <h3>2. Pipeline Parallelism (PP) — 流水线并行</h3>
      <p>将模型按层切分到多组 GPU，每组 GPU 负责若干连续层。通过 <strong>Micro-Batch</strong> 流水线实现 GPU 利用率最大化。</p>

      <table>
        <thead><tr><th>参数</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>--pipeline-parallel-size</code></td><td>PP 组大小，模型分成几段</td></tr>
          <tr><td><code>--max-pipeline-stage-size</code></td><td>每段最多多少层</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>PP 的 Bubble 问题：</strong>流水线启动和排空阶段，部分 GPU 空闲（"bubble"）。
        Micro-batch 数量越多，bubble 占比越小，但内存占用越大。公式：bubble_ratio ≈ (pp_size - 1) / num_microbatches。
      </Callout>

      <h3>3. Data Parallelism (DP) — 数据并行</h3>
      <p>vLLM <strong>在线服务场景</strong>下不使用传统 DP（不切分数据）。但 <strong>离线批处理</strong>（LLM class）下支持 DP：</p>
      <ul>
        <li>每张 GPU 持有完整模型权重</li>
        <li>不同请求分发到不同 GPU 独立推理</li>
        <li>适合吞吐优先的离线场景</li>
      </ul>

      <h3>4. Expert Parallelism (EP) — 专家并行</h3>
      <p>MoE（Mixture of Experts）模型专用，将不同 Expert 分布到不同 GPU：</p>

      <CodeBlock language="python" title="EP 实现" code={`# MoE 层: 每个 expert 可能在不同 GPU
class MoELayer(nn.Module):
    def forward(self, hidden_states):
        # Router 决定每个 token 激活哪些 experts
        router_logits = self.gate(hidden_states)
        # top-k 选择
        top_k_weights, top_k_indices = torch.topk(router_logits, self.top_k)

        # 按 expert 分组，跨 GPU 通信
        # 使用 all-to-all 将 token 分发到对应 expert 的 GPU
        dispatched = all_to_all(hidden_states, top_k_indices)

        # 每张 GPU 计算自己持有的 experts
        output = self.experts(dispatched)

        # all-to-all 将结果返回原 GPU
        output = all_to_all(output, reverse=True)
        return output

# 通信开销: 2 次 All-to-All (分发 + 回收)`} />

      <h3>5. Context Parallelism (CP) — 上下文并行</h3>
      <p>将长序列的 token 切分到多张 GPU，每张 GPU 计算一部分上下文：</p>

      <MermaidDiagram chart={`
graph TB
    subgraph Tokens["输入序列 (8192 tokens)"]
        T0["GPU 0: tokens 0-4095"]
        T1["GPU 1: tokens 4096-8191"]
    end
    subgraph Compute["计算"]
        C0["Attention (local)"]
        C1["Attention (local)"]
    end
    T0 --> C0
    T1 --> C1
    C0 --> R0["Ring Attention: P2P 传递 KV"]
    C1 --> R0
    R0 --> O["合并输出"]
      `} />

      <h3>并行策略组合矩阵</h3>
      <table>
        <thead><tr><th>组合</th><th>总 GPU 数</th><th>通信模式</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>纯 TP</strong></td><td>tp_size</td><td>All-Reduce (每层 2 次)</td><td>单机多卡，GPU 间 NVLink 高带宽</td></tr>
          <tr><td><strong>TP + PP</strong></td><td>tp_size × pp_size</td><td>All-Reduce + P2P Send/Recv</td><td>超大模型，单机放不下</td></tr>
          <tr><td><strong>TP + EP</strong></td><td>tp_size × ep_size</td><td>All-Reduce + All-to-All</td><td>MoE 模型 (如 Mixtral 8x7B)</td></tr>
          <tr><td><strong>TP + CP</strong></td><td>tp_size × cp_size</td><td>All-Reduce + Ring P2P</td><td>超长上下文 (128K+ tokens)</td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>TP 通信开销：</strong>TP 每层产生 2 次 All-Reduce 通信。TP 超过 8 时，通信开销可能超过计算收益。
        对于 70B+ 模型，推荐 TP=8 + PP=2 而非 TP=16，以降低跨节点通信开销。
      </Callout>

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

      {/* ==================== 11.5. 内存管理详解 ==================== */}
      <div className="section-divider"><span>内存管理详解</span></div>
      <p>vLLM 的内存管理分为<strong>启动时静态分配</strong>和<strong>运行时动态管理</strong>两个阶段。理解内存布局和 KV Cache 计算是调优推理性能的关键。</p>

      <h3>GPU 显存布局</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph MEM["GPU 显存总容量"]
        W["模型权重 ~30%<br/>Qwen2-7B: ~14GB (FP16)"]
        KV["KV Cache ~60%<br/>可配置, 动态管理"]
        O["其他 ~10%<br/>激活值/临时buffer/CUDA Graph"]
    end
    W --> KV --> O
      `} />

      <h3>启动时内存分配</h3>
      <CodeBlock language="python" title="GPU 内存初始化" code={`def determine_num_available_blocks(self) -> int:
    """计算可用于 KV Cache 的 block 数量"""
    # 1. 获取 GPU 总显存
    total_gpu_memory = torch.cuda.get_device_properties(0).total_memory

    # 2. 计算不可用显存（模型权重 + 激活值 + CUDA Graph）
    peak_memory = self.profile_run()  # 跑一次 dummy 推理，记录峰值显存
    # peak_memory 包含:
    #   - 模型权重 (model.parameters)
    #   - 优化器状态 (推理时为空)
    #   - 激活值 (前向传播中间结果)
    #   - CUDA Graph 显存

    # 3. 计算可用于 KV Cache 的显存
    available_memory = int(
        total_gpu_memory * self.cache_config.gpu_memory_utilization
    ) - peak_memory

    # 4. 计算 block 数量
    cache_block_size = self.get_cache_block_size_bytes()
    # cache_block_size = block_size × num_layers × 2(KV) × num_kv_heads × head_size × dtype_size
    num_blocks = available_memory // cache_block_size
    return num_blocks`} />

      <h3>KV Cache 大小计算</h3>
      <Callout type="tip">
        <strong>KV Cache 显存公式：</strong><br/>
        <code>KV_Cache_Size = 2 × num_layers × num_kv_heads × head_dim × max_model_len × dtype_size × (1 / gqa_ratio)</code><br/><br/>
        <strong>Qwen2-7B 示例 (FP16)：</strong><br/>
        <code>2 × 28 × 4 × 128 × 32768 × 2 = ~1.8 GB</code> (单请求，32768 tokens)<br/>
        实际分配考虑 <code>gpu_memory_utilization=0.9</code> 和 <strong>block 粒度</strong>（默认 16 token/block）
      </Callout>

      <h3>Qwen2-7B 单卡 A100 80G 显存计算示例</h3>
      <table>
        <thead><tr><th>显存项</th><th>大小</th><th>占比</th></tr></thead>
        <tbody>
          <tr><td>模型权重 (FP16)</td><td>~14 GB</td><td>17.5%</td></tr>
          <tr><td>KV Cache (max_model_len=32768, block_size=16)</td><td>~48 GB</td><td>60%</td></tr>
          <tr><td>激活值 + CUDA Graph + 临时 buffer</td><td>~8 GB</td><td>10%</td></tr>
          <tr><td><strong>预留余量</strong></td><td>~10 GB</td><td>12.5%</td></tr>
          <tr><td><strong>总计</strong></td><td><strong>~80 GB</strong></td><td><strong>100%</strong></td></tr>
        </tbody>
      </table>

      <h3>运行时内存管理</h3>
      <p>运行时通过 <strong>BlockPool</strong> 动态管理 KV Cache block：</p>

      <CodeBlock language="python" title="BlockPool 运行时管理" code={`class BlockPool:
    """KV Cache 块池，管理 block 的分配与回收"""

    def __init__(self, num_blocks: int):
        self.free_blocks = list(range(num_blocks))  # 空闲 block 队列
        self.ref_counts = [0] * num_blocks          # 每个 block 的引用计数

    def allocate(self, num_blocks: int) -> list[int]:
        """分配 num_blocks 个 block"""
        if len(self.free_blocks) < num_blocks:
            raise OutOfMemoryError("No free blocks")
        allocated = []
        for _ in range(num_blocks):
            block_id = self.free_blocks.pop(0)
            self.ref_counts[block_id] = 1
            allocated.append(block_id)
        return allocated

    def free(self, block_ids: list[int]):
        """释放 block (ref_cnt-- → 0 时归还)"""
        for bid in block_ids:
            self.ref_counts[bid] -= 1
            if self.ref_counts[bid] == 0:
                self.free_blocks.append(bid)

    def add_ref(self, block_id: int):
        """增加引用 (前缀缓存命中时)"""
        self.ref_counts[block_id] += 1`} />

      <h3>内存碎片与利用率</h3>
      <table>
        <thead><tr><th>场景</th><th>无 PagedAttention</th><th>PagedAttention</th></tr></thead>
        <tbody>
          <tr><td>内存利用率</td><td>~25% (大量内部碎片)</td><td>~99% (block 粒度管理)</td></tr>
          <tr><td>碎片来源</td><td>每请求预分配 max_model_len 连续内存</td><td>按需分配 block，无连续性要求</td></tr>
          <tr><td>最大并发</td><td>受限于每请求的最大内存</td><td>受限于总 block 数 × block_size</td></tr>
          <tr><td>共享能力</td><td>无共享</td><td>前缀缓存共享，ref_cnt 管理</td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>内存溢出排查：</strong>
        <ol>
          <li>检查 <code>gpu_memory_utilization</code>：默认 0.9，如果 OOM 可降低到 0.8</li>
          <li>检查 <code>max_model_len</code>：过大会预分配过多 KV Cache block</li>
          <li>检查 <code>max_num_seqs</code>：并发请求过多导致 block 耗尽</li>
          <li>使用 <code>--enforce-eager</code> 禁用 CUDA Graph 节省显存（但会降低吞吐）</li>
        </ol>
      </Callout>

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