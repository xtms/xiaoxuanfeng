import { MermaidDiagram } from '../components/MermaidDiagram';
import { CodeBlock, Callout, ExternalLink, ResourceTable } from '../components/CodeBlock';

export function NanoVLLMPage() {
  return (
    <div className="prose max-w-none">
      <h1>🧪 nano-vLLM-NPU</h1>
      <p>
        nano-vLLM-NPU 是一个<strong>独立精简重实现</strong>（非 fork）的 LLM 推理引擎，约 <strong>1,915 行</strong>、<strong>23 个 Python 文件</strong>。
        它独立重实现了 vLLM 的核心概念（分页 KV Cache、前缀缓存、张量并行、CUDA Graph、Chunked Prefill、Continuous Batching），
        并在此基础上添加了<strong>华为 Ascend NPU</strong> 支持。代码量小、逻辑清晰，是学习推理引擎原理的最佳入口。
      </p>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://github.com/xtms/nano-vllm-npu" label="GitHub" />
      </div>

      {/* ==================== 1. 文件结构 ==================== */}
      <h2>📁 文件结构</h2>
      <table>
        <thead><tr><th>模块</th><th>文件</th><th>行数</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td rowSpan={5}><strong>引擎层</strong></td><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/llm_engine.py" target="_blank" rel="noreferrer"><code>engine/llm_engine.py</code></a></td><td>~150</td><td>主引擎：add_request / step / generate，同步阻塞循环</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/scheduler.py" target="_blank" rel="noreferrer"><code>engine/scheduler.py</code></a></td><td>~180</td><td>两阶段调度：prefill 优先 + 头部队列 Chunked Prefill + LIFO 抢占</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/block_manager.py" target="_blank" rel="noreferrer"><code>engine/block_manager.py</code></a></td><td>~120</td><td>HashChain 前缀缓存：xxhash 链式哈希 + token 二次验证</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/sequence.py" target="_blank" rel="noreferrer"><code>engine/sequence.py</code></a></td><td>~80</td><td>序列状态机：WAITING / RUNNING / FINISHED，双游标计数</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/model_runner.py" target="_blank" rel="noreferrer"><code>engine/model_runner.py</code></a></td><td>~280</td><td>模型执行器：TP 多进程 + SharedMemory IPC + CUDA Graph 捕获</td></tr>
          <tr><td rowSpan={7}><strong>层</strong></td><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/layers/attention.py" target="_blank" rel="noreferrer"><code>layers/attention.py</code></a></td><td>~200</td><td>注意力：flash-attn 优先，SDPA fallback（纯 PyTorch，NPU 友好）</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/layers/linear.py" target="_blank" rel="noreferrer"><code>layers/linear.py</code></a></td><td>~156</td><td>Megatron 风格 TP 线性层：Column/Row/QKV/MergedColumn/Replicated</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/layers/sampler.py" target="_blank" rel="noreferrer"><code>layers/sampler.py</code></a></td><td>~13</td><td>Gumbel-max 采样：仅 temperature，禁用 greedy</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/layers/rotary_embedding.py" target="_blank" rel="noreferrer"><code>layers/rotary_embedding.py</code></a></td><td>~60</td><td>RoPE 位置编码：仅 NeoX 风格，断言 rotary_dim==head_size</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/layers/layernorm.py" target="_blank" rel="noreferrer"><code>layers/layernorm.py</code></a></td><td>~51</td><td>RMSNorm + 融合残差 add_rms_forward</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/layers/activation.py" target="_blank" rel="noreferrer"><code>layers/activation.py</code></a></td><td>~12</td><td>SiluAndMul：SiLU 门控激活</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/layers/embed_head.py" target="_blank" rel="noreferrer"><code>layers/embed_head.py</code></a></td><td>~66</td><td>VocabParallelEmbedding + ParallelLMHead</td></tr>
          <tr><td rowSpan={1}><strong>模型</strong></td><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/models/qwen3.py" target="_blank" rel="noreferrer"><code>models/qwen3.py</code></a></td><td>~216</td><td>Qwen3ForCausalLM：仅支持 Qwen3 稠密模型</td></tr>
          <tr><td rowSpan={4}><strong>工具</strong></td><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/utils/device.py" target="_blank" rel="noreferrer"><code>utils/device.py</code></a></td><td>~98</td><td>设备抽象：cuda/npu 自由函数分发，无类/插件体系</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/utils/compile.py" target="_blank" rel="noreferrer"><code>utils/compile.py</code></a></td><td>~32</td><td>optional_compile：NPU 降级为 no-op，CUDA 使用 torch.compile</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/utils/context.py" target="_blank" rel="noreferrer"><code>utils/context.py</code></a></td><td>~20</td><td>Context 全局单例：传递 attention metadata</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/utils/loader.py" target="_blank" rel="noreferrer"><code>utils/loader.py</code></a></td><td>~28</td><td>权重加载器：仅本地 safetensors，packed_modules_mapping 融合</td></tr>
          <tr><td rowSpan={2}><strong>入口</strong></td><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/llm.py" target="_blank" rel="noreferrer"><code>llm.py</code></a></td><td>~20</td><td>LLM 类：LLMEngine 别名</td></tr>
          <tr><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/config.py" target="_blank" rel="noreferrer"><code>config.py</code></a></td><td>~40</td><td>Config dataclass：13 个扁平字段，device_id 支持 int|list</td></tr>
          <tr><td><strong>API</strong></td><td><a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/v1/run_api_server.py" target="_blank" rel="noreferrer"><code>v1/run_api_server.py</code></a></td><td>~211</td><td>FastAPI 4 路由：同步阻塞，无流式，无跨请求 batching</td></tr>
        </tbody>
      </table>

      {/* ==================== 2. 整体架构 ==================== */}
      <h2>🏗️ 整体架构</h2>
      <p>
        nano-vLLM-NPU 将 vLLM V1 的五层管道（Frontend → EngineCore → Executor → Worker → ModelRunner）
        <strong>压缩为单进程</strong>。<code>LLMEngine</code> 承担全部角色：
        rank 0 持有 Scheduler 和 ModelRunner 在进程内，rank 1..N-1 通过 <code>mp.Process</code> 派生，
        使用 SharedMemory (1 MiB) 和 per-worker Event 进行锁步同步。
      </p>

      <MermaidDiagram chart={`
flowchart TB
  subgraph ENTRY["入口"]
    LLM["LLM = LLMEngine 别名"]
    CONFIG["Config 13 字段"]
    API["FastAPI 4 路由"]
  end

  subgraph ENGINE["引擎层 engine/"]
    direction TB
    ENG["LLMEngine<br/>add_request / step / generate"]
    SCHED["Scheduler<br/>两阶段调度 · LIFO 抢占"]
    BM["BlockManager<br/>HashChain 前缀缓存"]
    SEQ["Sequence<br/>3 状态 · 双游标"]
  end

  subgraph EXEC["执行层"]
    MR0["ModelRunner rank 0<br/>进程内执行"]
    MR1["ModelRunner rank 1..N<br/>mp.Process + SharedMemory"]
    TP["Tensor Parallelism<br/>Megatron Column/Row"]
    CG["CUDA Graph<br/>Decode-only · NPU 禁用"]
  end

  subgraph LAYERS["层 layers/"]
    ATT["Attention<br/>flash-attn / SDPA fallback"]
    LIN["Linear TP<br/>QKV/MergedColumn/Row"]
    SMP["Sampler<br/>Gumbel-max"]
    RMS["RMSNorm<br/>融合残差"]
    ACT["SiluAndMul"]
    ROE["RotaryEmbedding"]
  end

  subgraph MODEL["模型 models/"]
    QWEN["Qwen3ForCausalLM<br/>28 × DecoderLayer"]
  end

  subgraph HW["硬件抽象 utils/device.py"]
    CUDA["CUDA<br/>nccl · CUDA Graph"]
    NPU["Ascend NPU<br/>hccl · eager only"]
  end

  ENTRY --> ENGINE
  ENG --> SCHED --> BM --> SEQ
  ENG --> MR0
  MR0 --> MR1
  MR0 --> TP
  MR0 --> CG
  MR0 --> LAYERS
  LAYERS --> MODEL
  MR0 --> HW
      `} />

      <Callout type="info">
        <strong>架构对比：</strong>vLLM V1 是五层多进程异步架构（ZMQ + EngineCore 后台进程 + 独立 Worker），
        nano 压缩为单进程同步架构。rank 0 集调度和执行于一身，其他 rank 仅做纯计算。无 ZMQ、无 async、无 streaming。
      </Callout>

      {/* ==================== 3. 请求生命周期 ==================== */}
      <h2>🔄 请求生命周期</h2>
      <MermaidDiagram chart={`
sequenceDiagram
    participant U as User
    participant E as LLMEngine
    participant S as Scheduler
    participant B as BlockManager
    participant M as ModelRunner
    participant W as TP Workers

    U->>E: generate(prompts)
    loop 每个 prompt
        E->>E: add_request: tokenize + 创建 Sequence
        E->>S: waiting.append(seq)
    end

    loop while has_unfinished
        E->>S: schedule()
        alt waiting[0] 可调度 (prefill step)
            S->>B: can_allocate(seq)
            B->>B: HashChain: 遍历完整 block 计算链式哈希
            B->>B: 查 hash_to_block_id + token 二次验证
            B-->>S: num_cached_blocks
            S->>B: allocate(seq)
            B->>B: 缓存命中 block ref_count++
            B->>B: 新 block 从 free_block_ids 分配
            S->>S: waiting -> running
        else running 队尾可追加 (decode step)
            S->>B: may_append(seq)
            alt block 不足
                S->>S: LIFO 抢占: running.pop()
                S->>B: deallocate(seq): 所有 block ref_count--
                S->>S: seq 回到 waiting[0] (全量重算)
            end
        end
        S-->>E: (scheduled_seqs, is_prefill)

        E->>M: call("run", seqs, is_prefill)
        M->>M: rank 0: pickle seqs -> SharedMemory
        M->>W: Event.set() 唤醒所有 Worker
        par 并行执行
            M->>M: rank 0: execute_model + sample
            W->>W: rank 1..N: execute_model (仅 TP 分片)
        end
        W-->>M: Event.wait() 同步完成
        M-->>E: output_tokens

        E->>E: postprocess: hash_blocks + append tokens
        E->>E: judge finish (max_tokens / EOS)
        E->>B: deallocate 已完成 seq
    end
    E-->>U: 返回所有 outputs
      `} />

      {/* ==================== 4. 调度器 ==================== */}
      <h2>⚙️ 调度器 — 两阶段 Prefill 优先</h2>
      <p>
        nano 使用<strong>严格两阶段、prefill 优先</strong>调度策略。每个 step 要么全 prefill 要么全 decode，从不混合。
        Chunked Prefill 仅对<strong>队首</strong>长 prompt 生效。
      </p>

      <MermaidDiagram chart={`
flowchart TB
    START["schedule() 开始"] --> CHECK{"waiting 非空?"}
    CHECK -->|是| PREFILL["尝试 Prefill Step"]
    CHECK -->|否| DECODE["尝试 Decode Step"]

    PREFILL --> WF["取 waiting[0]"]
    WF --> CAN{"can_allocate(seq)?"}
    CAN -->|可分配| ALLOC["allocate(seq)<br/>waiting -> running"]
    CAN -->|不可分配| STAY["留在 waiting[0]<br/>下轮再试"]
    ALLOC --> PREFILL_DONE["返回 (scheduled_seqs, is_prefill=True)"]

    DECODE --> RUN{"running 非空?"}
    RUN -->|是| APPEND{"may_append(running[-1])?"}
    RUN -->|否| IDLE["返回 ([], False)"]
    APPEND -->|可追加| DECODE_DONE["返回 (scheduled_seqs, is_prefill=False)"]
    APPEND -->|不可追加| PREEMPT["LIFO 抢占<br/>running.pop()<br/>deallocate 全部 block<br/>回到 waiting[0]"]
    PREEMPT --> IDLE

    PREFILL_DONE --> END["Engine 执行 step"]
    DECODE_DONE --> END
    IDLE --> END
      `} />

      <h3>调度策略对比</h3>
      <table>
        <thead><tr><th>维度</th><th>nano-vLLM-NPU</th><th>Upstream vLLM V1</th></tr></thead>
        <tbody>
          <tr><td><strong>调度阶段</strong></td><td>严格两阶段（prefill 或 decode）</td><td>统一单阶段（prefill/decode 自由混合）</td></tr>
          <tr><td><strong>Chunked Prefill</strong></td><td>仅队首（waiting[0]）</td><td>任意请求均可分块</td></tr>
          <tr><td><strong>抢占策略</strong></td><td>LIFO（running.pop()，全量重算）</td><td>PRIORITY / FCFS + step 回滚</td></tr>
          <tr><td><strong>请求队列</strong></td><td>plain deque</td><td>FCFSRequestQueue / PriorityRequestQueue (heapq)</td></tr>
          <tr><td><strong>序列状态</strong></td><td>3 种（WAITING/RUNNING/FINISHED）</td><td>12 种 + 多个 WAITING_FOR_* 阻塞态</td></tr>
          <tr><td><strong>返回值</strong></td><td><code>(list[Sequence], is_prefill: bool)</code></td><td>丰富 <code>SchedulerOutput</code> 结构体</td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>LIFO 抢占代价：</strong>decode 阶段 block 不足时，nano 直接 <code>running.pop()</code> 弹出队尾请求，
        释放其全部 block（num_cached_tokens 归零），请求回到 waiting 队首等待全量重算。这比 vLLM 的 step 回滚更粗暴，
        但在 batch 规模较小时影响可控。
      </Callout>

      {/* ==================== 5. HashChain 前缀缓存 ==================== */}
      <h2>🔗 HashChain 前缀缓存 — 核心创新</h2>
      <p>
        nano 使用 <strong>xxhash 链式哈希</strong>实现前缀缓存，是 vLLM sha256 前缀缓存的精简替代方案。
        核心思路：block i 的哈希 = <code>xxh64(prev_block_hash || block_i_tokens)</code>，形成链式依赖。
      </p>

      <MermaidDiagram chart={`
flowchart LR
  subgraph SEQ["Sequence: Hello, how are you today"]
    B0["Block 0: Hello, how"]
    B1["Block 1:  are you "]
    B2["Block 2: today"]
  end

  subgraph CHAIN["HashChain 计算"]
    H0["hash_0 = xxh64(token_ids[0:4])"]
    H1["hash_1 = xxh64(hash_0 || token_ids[4:8])"]
    H2["hash_2 = xxh64(hash_1 || token_ids[8:12])"]
    H0 --> H1 --> H2
  end

  subgraph MAP["hash_to_block_id 映射"]
    M0["hash_0 -> block_id=3"]
    M1["hash_1 -> block_id=7"]
    M2["hash_2 -> block_id=-1 (未缓存)"]
  end

  subgraph VERIFY["Token 二次验证"]
    V["blocks[3].token_ids == token_ids[0:4]?<br/>防止哈希碰撞"]
  end

  CHAIN --> MAP
  MAP --> VERIFY
      `} />

      <CodeBlock language="python" title="HashChain 前缀缓存核心实现" code={`class BlockManager:
    def __init__(self, num_blocks, block_size=256):
        self.blocks = [Block(i) for i in range(num_blocks)]
        self.hash_to_block_id: dict[int, int] = {}  # hash -> block_id
        self.free_block_ids: deque = deque(range(num_blocks))
        self.used_block_ids: set = set()
        self.block_size = block_size

    def can_allocate(self, seq: Sequence) -> int:
        """遍历完整 block，计算链式哈希，检查缓存命中"""
        num_new_blocks = 0
        prefix_hash = -1  # 第一个 block 无前缀哈希
        for i in range(seq.num_scheduled_tokens // self.block_size):
            # 链式哈希: xxh64(prev_hash || block_tokens)
            token_ids = seq.token_ids[i*bs : (i+1)*bs]
            block_hash = xxhash.xxh64(
                (prefix_hash.to_bytes(8) if prefix_hash != -1 else b"") +
                np.array(token_ids).tobytes()
            ).intdigest()
            prefix_hash = block_hash

            block_id = self.hash_to_block_id.get(block_hash, -1)
            if block_id != -1:
                # Token 二次验证: 防止哈希碰撞
                if self.blocks[block_id].token_ids == token_ids:
                    continue  # 缓存命中
            num_new_blocks += 1
        return num_new_blocks  # 返回 -1 表示 block 不足

    def allocate(self, seq: Sequence):
        """分配 block: 缓存命中 ref_count++，新 block 从 free 队列取"""
        ...
    def deallocate(self, seq: Sequence):
        """逆序遍历 block_table，ref_count-- 到 0 时归还 free 队列"""
        ...`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/block_manager.py" target="_blank" rel="noreferrer">engine/block_manager.py</a></div>

      <h3>前缀缓存对比</h3>
      <table>
        <thead><tr><th>维度</th><th>nano-vLLM-NPU</th><th>Upstream vLLM V1</th></tr></thead>
        <tbody>
          <tr><td><strong>哈希算法</strong></td><td>xxhash.xxh64 (int)</td><td>sha256 可配置 (bytes)</td></tr>
          <tr><td><strong>链式哈希</strong></td><td>prev_hash 拼入当前 block 输入</td><td>parent_block_hash 传入 hash_fn</td></tr>
          <tr><td><strong>Key 类型</strong></td><td>int → block_id</td><td>BlockHashWithGroupId (hash + group_id)</td></tr>
          <tr><td><strong>碰撞防护</strong></td><td>Token 二次验证（逐 token 比对）</td><td>sha256 + extra_keys + group_id 隔离</td></tr>
          <tr><td><strong>LRU 淘汰</strong></td><td>无（释放 block 的 hash 保留直到被重新分配）</td><td>完整 LRU 队列 + touch/evict</td></tr>
          <tr><td><strong>Block 大小</strong></td><td>256 (NPU 友好)</td><td>默认 16（可配置）</td></tr>
          <tr><td><strong>分配粒度</strong></td><td>整 prompt 一次性分配</td><td>逐 chunk 分配</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>设计取舍：</strong>nano 的 token 二次验证是一个廉价的正确性后盾（防止哈希碰撞），
        vLLM 则用更强的 sha256 + 更丰富的 keying 来换取无验证开销。nano 无 LRU 在离线批量场景可接受，
        但在线服务场景有内存膨胀风险。block_size=256 在 NPU 上减少 block table 条目，简化索引，但粒度更粗。
      </Callout>

      {/* ==================== 6. ModelRunner 与 TP ==================== */}
      <h2>🚀 ModelRunner — 多进程 TP 执行</h2>
      <p>
        <code>ModelRunner</code> (280 行) 集 Executor + Worker + ModelRunner 于一身。
        rank 0 在进程内运行，rank 1..N-1 通过 <code>mp.Process</code> 派生，使用 SharedMemory + Event 锁步同步。
      </p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant E as LLMEngine
    participant MR0 as ModelRunner rank 0
    participant SM as SharedMemory 1 MiB
    participant W1 as Worker rank 1
    participant WN as Worker rank N

    E->>MR0: call("run", seqs, is_prefill)
    MR0->>MR0: pickle seqs (prefill: 全量 token_ids, decode: 仅 last_token)
    MR0->>SM: 写入 SharedMemory
    MR0->>W1: Event.set()
    MR0->>WN: Event.set()

    par 并行执行
        MR0->>MR0: execute_model (forward)
        MR0->>MR0: sample (仅 rank 0)
        W1->>W1: execute_model (TP 分片 forward)
        WN->>WN: execute_model (TP 分片 forward)
    end

    W1->>MR0: Event.wait() 同步
    WN->>MR0: Event.wait() 同步
    MR0-->>E: output_tokens
      `} />

      <h3>KV Cache 布局</h3>
      <CodeBlock language="python" title="KV Cache 张量布局" code={`# 单一大型张量: K 在 [0], V 在 [1], layers 在 dim=1
kv_cache = torch.empty(
    2,           # 0=K, 1=V
    num_layers,  # 28 for Qwen3-0.6B
    num_blocks,  # 物理 block 数
    block_size,  # 256
    num_kv_heads,
    head_dim
)

# 每个 Attention 模块绑定自己的层
module.k_cache = kv_cache[0, layer_id]  # K cache
module.v_cache = kv_cache[1, layer_id]  # V cache

# Slot mapping: block_idx * block_size + offset, -1 表示无效
slot_mapping = block_table * block_size + offset`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/model_runner.py" target="_blank" rel="noreferrer">engine/model_runner.py</a></div>

      <h3>CUDA Graph 捕获</h3>
      <p>
        <code>capture_graph</code> 仅支持 decode 阶段，固定 batch size 列表：
        <code>[1, 2, 4, 8] + range(16, max_bs+1, 16)</code>，按逆序捕获（大 batch 优先）。
        重放时选择 <code>min(bs {'>='} actual_bs)</code> 的图，填充 slot_mapping 为 -1。
        <strong>NPU 上完全禁用</strong>（<code>is_graph_available</code> 返回 False），所有执行走 eager 模式。
      </p>

      {/* ==================== 7. Attention ==================== */}
      <h2>💡 Attention — 双后端 Fallback</h2>
      <p>
        nano 仅有一个 <code>Attention(nn.Module)</code> 类，无后端抽象、无 metadata builder、无选择器。
        构造函数尝试 <code>import flash_attn</code>，失败则回退到 <code>F.scaled_dot_product_attention</code> (SDPA)。
      </p>

      <table>
        <thead><tr><th>后端</th><th>触发条件</th><th>Prefill</th><th>Decode</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Flash Attention</strong></td>
            <td><code>flash_attn</code> 可导入</td>
            <td><code>flash_attn_varlen_func</code></td>
            <td><code>flash_attn_with_kvcache</code></td>
          </tr>
          <tr>
            <td><strong>SDPA Fallback</strong></td>
            <td><code>flash_attn</code> 不可用</td>
            <td><code>_sdpa_prefill</code>: Python <code>for</code> 循环遍历序列</td>
            <td><code>_sdpa_decode</code>: Python <code>for</code> 循环遍历 batch + <code>repeat_interleave</code> GQA</td>
          </tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>SDPA fallback 是 NPU 兼容性的代价：</strong>Python 双循环在大 batch 下是性能瓶颈。
        KV 写入使用纯 PyTorch 索引（<code>k_flat[valid_slots] = key[mask]</code>），无自定义 CUDA/Triton 算子，
        在 NPU 上可直接运行但效率不如融合算子。
      </Callout>

      {/* ==================== 8. NPU 适配 ==================== */}
      <h2>🔧 Ascend NPU 适配 — 8 项具体改动</h2>
      <p>
        nano 通过 <code>utils/device.py</code>（98 行自由函数）实现了 CUDA/NPU 双平台支持，
        无类/插件/枚举体系，仅通过 <code>device_type: str</code> 分发。
      </p>

      <table>
        <thead><tr><th>#</th><th>适配点</th><th>CUDA</th><th>NPU</th></tr></thead>
        <tbody>
          <tr><td>1</td><td><strong>设备模块</strong></td><td><code>torch.cuda</code></td><td><code>torch.npu</code></td></tr>
          <tr><td>2</td><td><strong>通信后端</strong></td><td><code>nccl</code></td><td><code>hccl</code>（华为集合通信库）</td></tr>
          <tr><td>3</td><td><strong>CUDA Graph</strong></td><td>decode 阶段可用</td><td>完全禁用（<code>is_graph_available=False</code>）</td></tr>
          <tr><td>4</td><td><strong>torch.compile</strong></td><td>装饰 Sampler + RoPE</td><td>降级为 no-op（Triton inductor 在 NPU 上不稳定）</td></tr>
          <tr><td>5</td><td><strong>KV 写入</strong></td><td>纯 PyTorch 索引</td><td>同 CUDA（无 Triton 依赖）</td></tr>
          <tr><td>6</td><td><strong>Attention</strong></td><td>flash_attn 优先</td><td>SDPA fallback（Python 循环）</td></tr>
          <tr><td>7</td><td><strong>device_id</strong></td><td><code>int</code> 偏移</td><td><code>int|list[int]</code> 支持显式多卡映射</td></tr>
          <tr><td>8</td><td><strong>依赖</strong></td><td><code>triton</code> + <code>flash-attn</code></td><td><code>torch-npu</code></td></tr>
        </tbody>
      </table>

      <CodeBlock language="python" title="设备抽象核心实现" code={`# utils/device.py — 98 行自由函数，无类/插件/枚举
def get_device_module(device_type: str):
    if device_type == "cuda": return torch.cuda
    if device_type == "npu":  return torch.npu
    raise ValueError(f"Unknown device_type: {device_type}")

def get_dist_backend(device_type: str):
    if device_type == "cuda": return "nccl"
    if device_type == "npu":  return "hccl"

def is_graph_available(device_type: str) -> bool:
    if device_type == "cuda": return True
    if device_type == "npu":  return False  # NPU 禁用 CUDA Graph

def optional_compile(fn):
    """NPU 降级为 no-op，CUDA 使用 torch.compile"""
    if torch_npu_available: return fn  # Triton inductor 在 NPU 上不稳定
    return torch.compile(fn)`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/utils/device.py" target="_blank" rel="noreferrer">utils/device.py</a></div>

      <Callout type="info">
        <strong>对比上游 vLLM：</strong>vLLM 有 8 个模块的平台抽象（Platform 基类 + PlatformEnum + 具体平台类 + 插件自动检测），
        暴露 ~40 个方法。<strong>vLLM 在此 checkout 中无 NPU 平台</strong>。
        若要在上游 vLLM 中添加 NPU，需要新建 Platform 子类 + HCCL 通信器 + Attention 后端 + IR 内核，
        工程量远超 nano 的 98 行 device.py。
      </Callout>

      {/* ==================== 9. 采样 ==================== */}
      <h2>🎲 采样 — Gumbel-max 极简实现</h2>
      <p>nano 的 <code>Sampler</code> 仅 13 行，实现 Gumbel-max 采样。仅 rank 0 执行采样，greedy 被显式禁用。</p>

      <CodeBlock language="python" title="Sampler 实现 (13 行)" code={`class Sampler(nn.Module):
    @optional_compile  # NPU 降级为 no-op
    def forward(self, logits, temperatures):
        # Gumbel-max: argmax(logits/T + Gumbel(0,1))
        # 等价于 argmax(softmax(logits/T) / Exp(1))
        return torch.argmax(
            logits.div(temperatures.unsqueeze(1)).softmax(dim=-1)
            .div(torch.empty_like(logits).exponential_()),  # Gumbel 噪声
            dim=-1
        )`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/layers/sampler.py" target="_blank" rel="noreferrer">layers/sampler.py</a></div>

      <Callout type="info">
        <strong>数学等价性：</strong>nano 的 Gumbel-max 与 vLLM 的 <code>forward_native</code> 随机路径核心数学等价
        （<code>argmax(logits/T + Gumbel(0,1))</code>），但 nano 缺少 top-k/top-p/min-p/penalty/logprobs/greedy 等全部附加功能。
      </Callout>

      {/* ==================== 10. API 服务 ==================== */}
      <h2>🌐 API 服务 — 同步阻塞 FastAPI</h2>
      <p>
        <code>v1/run_api_server.py</code>（211 行）提供 4 个路由。Handler 声明为 <code>async def</code> 但<strong>阻塞调用</strong>
        <code>llm.generate</code>，单个请求独占引擎直到完成，无跨请求 Continuous Batching。
      </p>

      <table>
        <thead><tr><th>路由</th><th>方法</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>/health</code></td><td>GET</td><td>健康检查</td></tr>
          <tr><td><code>/v1/models</code></td><td>GET</td><td>模型列表</td></tr>
          <tr><td><code>/v1/completions</code></td><td>POST</td><td>文本补全（同步阻塞，JSON 返回）</td></tr>
          <tr><td><code>/v1/chat/completions</code></td><td>POST</td><td>对话补全（同步阻塞，JSON 返回）</td></tr>
        </tbody>
      </table>

      <p>请求 schema 极简：<code>ChatCompletionRequest</code> 仅含 <code>messages</code> + <code>sampling_params</code>，
      无 stream/n/logprobs/tools/response_format/seed/stop/top_p。<code>finish_reason: "stop"</code> 硬编码。</p>

      <Callout type="warning">
        <strong>限制：</strong>无流式 SSE、无跨请求 batching、无 tool calling、无 structured output。
        仅适合离线批量推理和学习场景，不适合生产级在线服务。
      </Callout>

      {/* ==================== 11. 已知问题 ==================== */}
      <h2>⚠️ 已知问题与风险</h2>
      <ol>
        <li>
          <strong>q/k norm 门控 Bug（最高优先级）</strong>：nano 仅在 <code>not qkv_bias</code> 时构建 <code>q_norm</code>/<code>k_norm</code>，
          但 <code>qkv_bias</code> 默认值来自 <code>getattr(config, 'attention_bias', True)</code> — 若 config 缺少显式 <code>attention_bias=False</code>，
          nano 会跳过 q/k norm。真实 Qwen3 始终有 q/k norm。vLLM 无条件构建。
        </li>
        <li>
          <strong>KV head TP 限制</strong>：nano 断言 <code>kv_heads % tp_size == 0</code>，当 <code>tp_size {'>'} kv_heads</code> 时无法运行。
          vLLM 通过 KV head 复制处理此情况。
        </li>
        <li>
          <strong>RoPE 仅支持 NeoX 默认</strong>：仅读取 <code>rope_theta</code>，忽略 <code>rope_type</code>/<code>factor</code>，
          无法处理 YaRN/NTK/longrope 等变体。
        </li>
        <li>
          <strong>无 LRU 淘汰</strong>：释放 block 的 hash 保留直到被重新分配，长期运行可能导致缓存膨胀。
        </li>
        <li>
          <strong>SDPA Python 循环</strong>：大 batch 下 SDPA fallback 的 Python 双循环是性能瓶颈。
        </li>
      </ol>

      {/* ==================== 12. Chunked Prefill 六类边界分析 ==================== */}
      <h2>🔬 Chunked Prefill — 六类边界分析</h2>
      <p>
        Chunked Prefill 的"边界"不是单一概念，而是正确性所依赖的<strong>六类边界条件</strong>。
        每一类边界都对应一段不变式（invariant），破坏不变式即触发 bug。该模块的演进史（5 个提交）几乎全是边界 bug 的修复。
      </p>

      <h3>坐标系问题</h3>
      <p>Chunked Prefill 涉及<strong>四套坐标系</strong>，它们几乎从不对齐：</p>
      <table>
        <thead><tr><th>坐标系</th><th>定义</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td><strong>token 坐标系</strong></td><td>prompt 的 token 序号</td><td><code>[0, num_tokens)</code></td></tr>
          <tr><td><strong>chunk 坐标系</strong></td><td>本轮调度区间</td><td><code>[start, end) = [num_cached_tokens, start+scheduled)</code></td></tr>
          <tr><td><strong>block 坐标系</strong></td><td>KV cache 以 block_size=256 分页</td><td><code>block i = token_ids[i*256:(i+1)*256]</code></td></tr>
          <tr><td><strong>slot 坐标系</strong></td><td>扁平物理槽位</td><td><code>slot = block_id * block_size + offset</code></td></tr>
        </tbody>
      </table>

      <h3>六类边界不变式</h3>

      <h4>1. 预算边界 (Budget Boundary)</h4>
      <p>单步 prefill 的 token 总数不得超过 <code>max_num_batched_tokens</code>（默认 16384）。</p>
      <CodeBlock language="python" title="仅队首可分块不变式" code={`# scheduler.py:42
remaining = self.max_num_batched_tokens - num_batched_tokens
if remaining < num_tokens and scheduled_seqs:
    break  # 仅队首(long prompt)可分块，后续序列必须整批放入`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/scheduler.py" target="_blank" rel="noreferrer">engine/scheduler.py</a></div>
      <Callout type="info">
        <strong>推论：</strong>batch 的组成只能是"队首(可能分块) + 若干整批放得下的短序列"，绝不允许两个分块序列共存于同一 batch。
        这是性能与实现简洁性的取舍——避免多序列同时跨步带来的复杂 KV 对齐。
      </Callout>

      <h4>2. 分块边界 (Chunk Boundary)</h4>
      <p>每步处理的 token 区间 <code>[start, end)</code>：</p>
      <CodeBlock language="python" title="分块边界核心代码" code={`# model_runner.py:162-165
start = seq.num_cached_tokens        # 已"落账"的 token 数
seqlen_q = seq.num_scheduled_tokens  # 本步要算的 token 数
end = start + seqlen_q
seqlen_k = end  # 注意力的 K/V 长度 = end（最核心不变式！）`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/model_runner.py" target="_blank" rel="noreferrer">engine/model_runner.py</a></div>

      <Callout type="warning">
        <strong>seqlen_k = end 是生死线：</strong>注意力只能覆盖 <code>[0, end)</code>——即已写入 cache 的全部 token。
        旧代码 <code>seqlen_k = len(seq)</code>（历史 bug <code>25794a1</code>）导致注意力读到未调度 token 的<strong>未初始化脏数据</strong>，
        表现为输出错乱/数值异常。修复即把 <code>seqlen_k</code> 置为 <code>end</code>。
      </Callout>

      <h4>3. 块/页边界 (Block/Page Boundary)</h4>
      <p>chunk <code>[start, end)</code> 几乎从不在块边界上起止，必须映射到<strong>首尾可能各残缺一块</strong>的 slot 序列：</p>
      <CodeBlock language="python" title="slot_mapping 块边界对齐" code={`# model_runner.py:174-184
start_block = start // self.block_size
end_block = (end + self.block_size - 1) // self.block_size
for i in range(start_block, end_block):
    slot_start = seq.block_table[i] * self.block_size
    if i == start_block:
        slot_start += start % self.block_size    # 首块: 从 chunk 起点偏移
    if i != end_block - 1:
        slot_end = slot_start + self.block_size  # 中间块: 整块
    else:
        slot_end = ... + end - i * self.block_size  # 末块: 到 chunk 终点
    slot_mapping.extend(range(slot_start, slot_end))`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/model_runner.py" target="_blank" rel="noreferrer">engine/model_runner.py</a></div>
      <p><strong>不变式：</strong><code>slot_mapping</code> 长度恰为 <code>seqlen_q</code>，与 <code>input_ids</code> 逐 token 对齐。</p>

      <h4>4. 前缀缓存边界 (Prefix-Cache Boundary)</h4>
      <p><strong>"末块永不被缓存命中"不变式：</strong><code>can_allocate</code> 遍历时<strong>刻意排除最后一块</strong>：</p>
      <CodeBlock language="python" title="末块不命中设计" code={`# block_manager.py:62
for i in range(seq.num_blocks - 1):  # 注意: num_blocks - 1, 不含末块!
    token_ids = seq.block(i)
    h = self.compute_hash(token_ids, h)
    if block_id == -1 or blocks[block_id].token_ids != token_ids:
        break  # 链式哈希断裂 → 停止探测`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/block_manager.py" target="_blank" rel="noreferrer">engine/block_manager.py</a></div>
      <p><strong>两个连锁不变式：</strong></p>
      <ol>
        <li><strong>num_cached_blocks ≤ num_blocks - 1</strong>：无论 prefix cache 多充分，末块永远不命中</li>
        <li><strong>fresh 序列的待 prefill token 数恒 ≥ 1</strong>：因为 <code>num_tokens = num_tokens - num_cached_blocks * block_size</code>，且末块至少 1 token</li>
      </ol>
      <p>这直接支撑了重构 <code>f64d821</code> 中<strong>移除旧 <code>max(..., 1)</code> 兜底</strong>的安全性——避免了"prompt 恰为 block_size 整数倍且全量命中 → 待算 0 token → 空 prefill"的死循环。</p>

      <MermaidDiagram chart={`
flowchart TD
  Q["seqlen_q = 本步 token 数"] --> END["end = start + seqlen_q"]
  END --> SK["seqlen_k = end"]
  SK --> GATE{"cu_seqlens_k[-1] > cu_seqlens_q[-1]?"}
  GATE -->|"是 (start>0)"| BT["block_tables 启用<br/>注意力读 paged cache [0,end)"]
  GATE -->|"否 (start=0)"| NB["block_tables=None<br/>注意力用当步 k/v,同chunk causal"]
  BT --> CHK["store_kvcache 已写 [start,end)<br/>cache[0,end) 完整"]
      `} />

      <h4>5. 哈希链边界 (Hash-Chain Boundary)</h4>
      <p><strong>"只有被完全填满的整块"才被哈希</strong>写入 <code>hash_to_block_id</code>：</p>
      <CodeBlock language="python" title="整块哈希不变式" code={`# block_manager.py:110-120
def hash_blocks(self, seq):
    start = seq.num_cached_tokens // self.block_size
    end = (seq.num_cached_tokens + seq.num_scheduled_tokens) // self.block_size
    if start == end: return  # 本步未跨过任何整块边界 → 不哈希
    h = blocks[block_table[start-1]].hash if start > 0 else -1  # 链前缀
    for i in range(start, end):
        # 仅对 [start, end) 内的完整块哈希
        ...`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/block_manager.py" target="_blank" rel="noreferrer">engine/block_manager.py</a></div>
      <p><strong>decode 块填满时刻的"一步滞后"：</strong>块 k 在步骤 S 写入 KV 并 append 进 token_ids，<strong>同一步骤 S 的 hash_blocks 中被哈希</strong>——"写 KV"与"登记哈希"在同一 postprocess 内完成，无窗口期不一致。</p>

      <h4>6. 状态边界 (State Boundary)</h4>
      <MermaidDiagram chart={`
stateDiagram-v2
  [*] --> WAITING: 创建 Sequence
  WAITING --> RUNNING: num_cached + scheduled == num_tokens
  RUNNING --> FINISHED: eos 或 max_tokens
  RUNNING --> WAITING: preempt: KV 不足
  FINISHED --> [*]
  note right of WAITING: chunked 续算也在 WAITING
  note right of RUNNING: preempt 时 deallocate + is_prefill=True + appendleft
      `} />

      <h3>边界不变式速查总表</h3>
      <table>
        <thead><tr><th>#</th><th>边界类型</th><th>不变式</th><th>代码位置</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>预算</td><td>单步 token ≤ max_num_batched_tokens；仅队首可分块</td><td><code>scheduler.py:32,42</code></td></tr>
          <tr><td>2</td><td>分块</td><td>start=num_cached_tokens, end=start+scheduled, seqlen_k=end</td><td><code>model_runner.py:162-165</code></td></tr>
          <tr><td>3</td><td>块/页</td><td>slot_mapping 长度 == seqlen_q，首尾残块按偏移对齐</td><td><code>model_runner.py:174-184</code></td></tr>
          <tr><td>4</td><td>末块不命中</td><td>can_allocate 遍历 range(num_blocks-1)；fresh 序列待算 ≥1</td><td><code>block_manager.py:62</code></td></tr>
          <tr><td>5</td><td>前缀缓存</td><td>seqlen_k=end 严格限制注意力到已写入区间</td><td><code>model_runner.py:165</code></td></tr>
          <tr><td>6</td><td>block_tables 门控</td><td>cu_seqlens_k {'>'} cu_seqlens_q ⇔ start {'>'}0 ⇔ 启用 block_tables</td><td><code>model_runner.py:185</code></td></tr>
          <tr><td>7</td><td>哈希链</td><td>仅整块(被填满)才哈希；start==end 时跳过</td><td><code>block_manager.py:111-113</code></td></tr>
          <tr><td>8</td><td>状态转换</td><td>num_cached+scheduled==num_tokens ⇔ prefill→decode</td><td><code>scheduler.py:48</code></td></tr>
          <tr><td>9</td><td>IPC</td><td>is_prefill 决定 pickle 传全 token 或仅 last_token</td><td><code>sequence.py:73</code></td></tr>
          <tr><td>10</td><td>抢占</td><td>preempt 必置 is_prefill=True + appendleft 重算</td><td><code>scheduler.py:76-79</code></td></tr>
          <tr><td>11</td><td>decode 块申请</td><td>len%block_size==1 ⇔ 需新块</td><td><code>block_manager.py:103,107</code></td></tr>
        </tbody>
      </table>

      {/* ==================== 13. HashChain 正确性分析 ==================== */}
      <h2>🔐 HashChain 前缀缓存 — 正确性分析</h2>
      <p>
        基于 <code>verify_hashchain.py</code> 实测脚本（block_size 缩为 4 以覆盖边界），
        链式哈希正确性依赖 <strong>6 条核心不变式</strong>，7 类边界用例实测全部通过。
      </p>

      <h3>6 条核心不变式</h3>
      <table>
        <thead><tr><th>#</th><th>不变式</th><th>成立位置</th></tr></thead>
        <tbody>
          <tr><td><strong>I1</strong></td><td><code>hash_to_block_id[h]</code> 指向的 block，其 <code>.token_ids</code> 与生成 <code>h</code> 的内容一致</td><td><code>hash_blocks</code> 写入时</td></tr>
          <tr><td><strong>I2</strong></td><td>只有满块（token 数 == block_size）才进 <code>hash_to_block_id</code></td><td><code>can_allocate</code>/<code>hash_blocks</code> 的整除边界</td></tr>
          <tr><td><strong>I3</strong></td><td><code>block_table[i]</code> 恒对应 <code>seq.block(i)</code>（token 切片 <code>[i*bs:(i+1)*bs]</code>）</td><td><code>allocate</code>/<code>may_append</code> 顺序追加</td></tr>
          <tr><td><strong>I4</strong></td><td><code>hash_blocks</code> 写回某块时，该块的 KV 已被模型写入物理缓存</td><td><code>postprocess</code> 在 <code>run</code> 之后调用</td></tr>
          <tr><td><strong>I5</strong></td><td>链前缀 <code>blocks[block_table[start-1]].hash</code> 在 <code>start {'>'} 0</code> 时必已设定（≠-1）</td><td>块填满即哈希，链序单调</td></tr>
          <tr><td><strong>I6</strong></td><td><code>compute_hash</code> 在同一进程内对相同输入确定性一致</td><td>numpy 同 dtype、xxh64 确定</td></tr>
        </tbody>
      </table>

      <h3>关键流程正确性证明</h3>

      <h4>can_allocate — 链式探测 + 末块跳过</h4>
      <ol>
        <li><strong>链序单调</strong>：<code>h</code> 从 -1 起，逐块 <code>compute_hash(token_ids, h)</code>，与 <code>hash_blocks</code> 写入时的链完全同构 → 查询键与存储键一致（I5/I6）</li>
        <li><strong>内容兜底</strong>：<code>blocks[block_id].token_ids != token_ids</code> 防御哈希碰撞/陈旧项 —— 实测人为篡改 token_ids 后 <code>can_allocate</code> 返回 0（拒绝假命中）</li>
        <li><strong>配额核算</strong>：<code>num_new_blocks</code> 初值 <code>num_blocks</code>；每命中一个在用块减 1（共享免新块）；命中自由块不减（它在 free_block_ids 里，需重新占用）→ 自由缓存块代数自抵消</li>
      </ol>

      <h4>hash_blocks — 写回时机与链前缀</h4>
      <p>调用时序（scheduler postprocess）：</p>
      <CodeBlock language="python" title="hash_blocks 调用时序" code={`# scheduler.py:81-87
for seq, token_id in zip(seqs, token_ids):
    self.block_manager.hash_blocks(seq)          # 1. 先哈希 (用旧 num_cached_tokens)
    seq.num_cached_tokens += seq.num_scheduled_tokens  # 2. 再推进
    ...
    seq.append_token(token_id)                   # 3. 最后追加 token`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/xtms/nano-vllm-npu/blob/main/nanovllm/engine/scheduler.py" target="_blank" rel="noreferrer">engine/scheduler.py</a></div>
      <ul>
        <li><strong>start/end</strong> 用追加前的 num_cached_tokens，整除意味着只哈希满块（I2），partial 尾块被排除</li>
        <li><strong>链前缀</strong>取 <code>blocks[block_table[start-1]].hash</code>：该块是已完成的满块，其 hash 必已设定（I5）</li>
        <li><strong>block.update</strong> 在模型 run 之后执行 → KV 已写入 → 哈希键与物理 KV 内容一致（I4）</li>
      </ul>

      <h4>decode 块填满时刻 — 一步滞后正确性</h4>
      <p>decode 每步 num_scheduled_tokens=1，且 hash_blocks 在 append_token 之前运行。但 decode 步的 input token 是上一步的输出，已在上一轮 postprocess 的 append_token 中加入 token_ids。故 decode 的 hash_blocks 时 token_ids 已含该 token，同时该 token 的 KV 在 decode run 中已写入 → 哈希内容与 KV 一致（I4）。</p>

      <h4>抢占与恢复</h4>
      <p>preempt → deallocate 逐块 ref_count--，归零则 _deallocate_block（移入 free_block_ids）。<strong>_deallocate_block 不删 hash_to_block_id 项，也不清 token_ids/hash</strong> —— 自由块仍是有效缓存条目。重调度时 can_allocate 命中这些自由块（判定为"自由缓存"，重新占用）。真正清除发生在 _allocate_block 复用自由块时：reset() 清空，并 del hash_to_block_id[block.hash]。<strong>实测：preempt 后 hash_to_block_id 大小不变，等价新 prompt can_allocate 返回相同命中数。</strong></p>

      <h3>实测等价类 (verify_hashchain.py, block_size=4)</h3>
      <table>
        <thead><tr><th>用例</th><th>期望</th><th>实测</th></tr></thead>
        <tbody>
          <tr><td>R1 相同 prompt 命中</td><td>命中 2 块、共享 block0</td><td>✅ can_allocate=2, block0 共享</td></tr>
          <tr><td>R2 长度=block_size 整数倍</td><td>末满块<strong>不</strong>复用</td><td>✅ can_allocate=1 (非 2)</td></tr>
          <tr><td>R3 chunked 跨块链连续</td><td>续算后等价 prompt 命中 2</td><td>✅ can_allocate=2</td></tr>
          <tr><td>R4 decode 填满哈希满内容</td><td>content==token_ids[0:4]</td><td>✅ 一致</td></tr>
          <tr><td>R5 抢占恢复重命中</td><td>哈希表项保留、重命中 2</td><td>✅ 大小不变, can_allocate=2</td></tr>
          <tr><td>R6 内容兜底防假命中</td><td>碰撞/陈旧→返回 0</td><td>✅ can_allocate=0</td></tr>
          <tr><td>R7 numpy dtype 进程内一致</td><td>同输入同哈希</td><td>✅ 一致</td></tr>
        </tbody>
      </table>

      <h3>发现的问题</h3>
      <ol>
        <li><strong>末块跳过 ⇒ 边界对齐 prompt 丢失最后一个满块缓存【效率，非正确性】</strong>：prompt 长度恰为 block_size 整数倍时，最后一块是满的且稳定，本可缓存却被跳过。实测 R2：8 token / bs=4，hash_blocks 把 block0、block1 都哈希入表，但新等价 prompt can_allocate 只返回 1（只命中 block0）。每次重算该块 KV（多余一次满块前向），不产生错误输出。</li>
        <li><strong>np.array(token_ids).tobytes() 隐式 dtype【健壮性气味】</strong>：未指定 dtype，64 位 Linux 推断 int64，若未来某路径传入 int32 数组，同内容得不同字节、不同哈希 → 静默漏命中。建议显式 <code>np.asarray(token_ids, dtype=np.int32).tobytes()</code>。</li>
        <li><strong>哈希碰撞</strong>：xxh64 为非加密哈希，理论上存在碰撞。content 校验（I1）保证碰撞只导致漏命中，绝不假命中。无需修改。</li>
      </ol>

      {/* ==================== 14. 边界 bug 演进史 ==================== */}
      <h2>📜 Chunked Prefill 边界 Bug 演进史</h2>
      <p>该模块的 5 个关键提交几乎全是边界 bug 修复，清晰展现了"哪条不变式曾被违反"：</p>

      <table>
        <thead><tr><th>提交</th><th>破坏的边界</th><th>症状</th><th>修复</th></tr></thead>
        <tbody>
          <tr>
            <td><code>8d63a98</code></td>
            <td>—（引入功能）</td>
            <td>引入 Chunked Prefill，带 <code>max(...,1)</code> 兜底与 <code>seqlen_k=len(seq)</code> 隐患</td>
            <td>建立基础分块调度框架</td>
          </tr>
          <tr>
            <td><code>77dd709</code></td>
            <td>块/缓存边界</td>
            <td><code>allocate()</code> 改了 num_cached_tokens 但调度器用<strong>旧值</strong>算 num_scheduled_tokens → end 越过序列长 → <code>prepare_prefill</code> 访问 block_table[i] <strong>越界 IndexError</strong></td>
            <td>allocate 后重算 num_tokens</td>
          </tr>
          <tr>
            <td><code>25794a1</code></td>
            <td>前缀缓存边界</td>
            <td><code>seqlen_k = len(seq)</code>，注意力读到未调度 token 的<strong>未初始化 KV 槽</strong> → 输出错乱/数值异常</td>
            <td><code>seqlen_k = end</code>（最核心不变式）</td>
          </tr>
          <tr>
            <td><code>f64d821</code></td>
            <td>多边界耦合</td>
            <td>can_allocate 返回 bool 无法表达"命中块数"；num_cached_tokens 在 allocate/postprocess 双写易错；may_append 三分支带脆弱断言</td>
            <td>can_allocate 返回 num_cached_blocks；新增 hash_blocks 集中哈希；is_prefill 显式标志；移除 max(...,1) 兜底</td>
          </tr>
          <tr>
            <td><code>9fa256a</code></td>
            <td>块分配边界</td>
            <td><code>_allocate_block(block_id)</code> 用 <code>free_block_ids.remove</code> 是 O(n) 且若 block_id 来自 used（命中块）会 KeyError</td>
            <td>改为 <code>_allocate_block()</code> 从队首 popleft，命中块单独走 ref_count=1 + free/used 迁移</td>
          </tr>
        </tbody>
      </table>

      <MermaidDiagram chart={`
sequenceDiagram
    participant S as Scheduler
    participant BM as BlockManager
    Note over S,BM: 旧: allocate 内部改 num_cached_tokens (双写易错)
    S->>BM: allocate(seq)
    BM->>BM: 边分配边改 seq.num_cached_tokens
    S->>S: 用旧 num_cached_tokens 算 num_scheduled_tokens (越界!)
    Note over S,BM: 新 (f64d821): 查询/分配解耦
    S->>BM: can_allocate(seq) → num_cached_blocks (纯查询)
    S->>S: num_tokens = num_tokens - num_cached_blocks*block_size
    S->>BM: allocate(seq, num_cached_blocks)
    BM->>BM: seq.num_cached_tokens = num_cached_blocks * block_size
    S->>S: num_scheduled_tokens = min(num_tokens, remaining) ✓
      `} />

      <Callout type="tip">
        <strong>重构哲学：</strong><code>f64d821</code> 是"用更强的不变式替代补丁"的典型重构。
        旧代码 <code>max(..., 1)</code> 是防 num_tokens=0 导致空 prefill 的临时补丁；
        重构后通过"末块不命中"不变式保证 fresh 序列恒有 ≥1 token 待算，从而安全移除兜底。
      </Callout>

      {/* ==================== 15. 特性矩阵 ==================== */}
      <h2>📊 特性支持矩阵</h2>
      <table>
        <thead><tr><th>特性</th><th>nano-vLLM-NPU</th><th>Upstream vLLM V1</th></tr></thead>
        <tbody>
          <tr><td>前缀缓存</td><td>✅ xxhash + token 验证</td><td>✅ sha256 + extra_keys</td></tr>
          <tr><td>Chunked Prefill</td><td>⚠️ 仅队首</td><td>✅ 任意请求</td></tr>
          <tr><td>Continuous Batching</td><td>⚠️ 单 generate() 内</td><td>✅ 跨 HTTP 请求</td></tr>
          <tr><td>CUDA Graph</td><td>⚠️ CUDA only / decode / NPU 禁用</td><td>✅ FULL/PIECEWISE</td></tr>
          <tr><td>torch.compile</td><td>⚠️ Sampler 仅 / NPU no-op</td><td>✅ Inductor + passes + AOT</td></tr>
          <tr><td>Tensor Parallelism</td><td>✅ Megatron, TP 1-8</td><td>✅ TP + 全部通信器</td></tr>
          <tr><td>Pipeline Parallelism</td><td>❌</td><td>✅</td></tr>
          <tr><td>Data Parallelism</td><td>❌</td><td>✅ + DP Coordinator</td></tr>
          <tr><td>MoE / Expert Parallelism</td><td>❌</td><td>✅ + EPLB</td></tr>
          <tr><td>推测解码</td><td>❌</td><td>✅ Eagle/n-gram/DFlash/MTP</td></tr>
          <tr><td>量化</td><td>❌ (仅 BF16/FP16)</td><td>✅ awq/gptq/fp8/bitsandbytes</td></tr>
          <tr><td>LoRA</td><td>❌</td><td>✅</td></tr>
          <tr><td>多模态</td><td>❌</td><td>✅ vision/audio</td></tr>
          <tr><td>结构化输出</td><td>❌</td><td>✅ Grammar backends</td></tr>
          <tr><td>流式 SSE</td><td>❌ (仅 JSON)</td><td>✅</td></tr>
          <tr><td>支持模型</td><td>1 (Qwen3 dense)</td><td>数百</td></tr>
          <tr><td>支持平台</td><td>2 (CUDA + NPU)</td><td>6+ (CUDA/ROCm/TPU/XPU/CPU/Zen)</td></tr>
        </tbody>
      </table>

      <h2>📈 性能基准</h2>
      <p>Qwen3-0.6B，133,966 输出 tokens，Atlas A3 910C NPU：</p>
      <table>
        <thead><tr><th>引擎</th><th>耗时 (s)</th><th>吞吐量 (tokens/s)</th></tr></thead>
        <tbody>
          <tr><td>vLLM (GPU)</td><td>98.37</td><td>1,361.84</td></tr>
          <tr><td>nano-vLLM (GPU)</td><td>93.41</td><td>1,434.13</td></tr>
          <tr><td>nano-vLLM-Ascend (torch native)</td><td>257.49</td><td>18.66</td></tr>
          <tr><td><strong>nano-vLLM-Ascend (图编译 + 融合算子, bs=256)</strong></td><td><strong>33.88</strong></td><td><strong>3,954.20</strong></td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>注意：</strong>Python torch native 模式性能极低（18.66 tokens/s），必须启用图编译和融合算子才能达到生产级性能（3,954 tokens/s）。
        NPU 上的算子融合和图编译对性能至关重要。
      </Callout>

      <ResourceTable resources={[
          { name: 'nano-vLLM-NPU GitHub', url: 'https://github.com/xtms/nano-vllm-npu', desc: '精简教育推理引擎源码，约 2,428 行，适合学习推理引擎核心原理' },
          { name: '昇腾社区', url: 'https://www.hiascend.com', desc: '华为昇腾 AI 官方社区，CANN 软件栈与 Ascend NPU 开发文档' },
          { name: 'Transformer 原始论文', url: 'https://arxiv.org/abs/1706.03762', desc: '"Attention Is All You Need"，Attention 机制的奠基之作' },
          { name: 'The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/', desc: 'Jay Alammar 经典可视化图解，直观理解 Q/K/V 与多头注意力' },
          { name: 'The Annotated Transformer', url: 'https://nlp.seas.harvard.edu/2018/04/03/attention.html', desc: 'Harvard NLP 逐行注释 PyTorch 实现，代码与公式一一对应' },
          { name: 'minGPT', url: 'https://github.com/karpathy/minGPT', desc: 'Andrej Karpathy 精简 GPT 教学实现，约 300 行，适合逐行精读' },
          { name: 'nanoGPT', url: 'https://github.com/karpathy/nanoGPT', desc: '极简训练+推理一体实现，与 nano-vLLM 同为精简教学项目' },
          { name: 'HuggingFace Transformers', url: 'https://github.com/huggingface/transformers', desc: '最流行的生产级 Transformer 库，BERT/GPT/Llama 等完整实现' },
        ]} />
    </div>
  );
}