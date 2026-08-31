import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, ResourceTable } from '../components/CodeBlock';

export function OverviewPage() {
  return (
    <div className="prose max-w-none">
      {/* Page Header */}
      <h1>总体架构概览</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 15 分钟</span>
        <span className="page-meta-item">🏷️ 架构 · 对比</span>
      </div>
      <p>LLM 推理框架遵循相似的分层架构，但在关键模块的设计上各有创新。以下按框架逐一分析，再从整体维度横向对比。</p>

      {/* ==================== 1. 通用推理架构 ==================== */}
      <div className="section-divider"><span>通用推理架构</span></div>
      <p>所有 LLM 推理框架都遵循以下分层架构。请求从客户端经过 API 服务层进入调度器，经过 KV Cache 管理后被分发到硬件后端执行模型推理。</p>
      <MermaidDiagram chart={`
flowchart TB
  subgraph CLIENT["客户端"]
    HTTP["HTTP/gRPC 请求"]
  end

  subgraph FRONT["前端接入层"]
    API["OpenAI 兼容 API Server"]
    TOKEN["Tokenization / 多模态加载"]
  end

  subgraph ENGINE["推理引擎核心"]
    SCHED["Scheduler 请求调度"]
    BLOCK["KV Cache 页面管理"]
    EXEC["ModelRunner 模型执行"]
  end

  subgraph BACKEND["硬件后端"]
    CUDA["CUDA/HIP NVIDIA/AMD"]
    CANN["CANN/TorchNPU Ascend NPU"]
    CPU["CPU/x86 通用推理"]
  end

  subgraph MODEL["模型层"]
    ATT["Attention FlashAttention/Paged"]
    MLP["MLP/MoE 前馈/专家混合"]
    QUANT["Quantization FP8/INT8/INT4"]
  end

  HTTP --> API --> TOKEN --> SCHED --> BLOCK --> EXEC --> BACKEND --> MODEL
  MODEL --> EXEC --> API --> HTTP
      `} />

      {/* ==================== 2. 框架总览 ==================== */}
      <div className="section-divider"><span>框架总览</span></div>
      <table>
        <thead><tr><th>维度</th><th>vLLM</th><th>vLLM-Ascend</th><th>nano-vLLM-NPU</th><th>SGLang</th></tr></thead>
        <tbody>
          <tr><td><strong>开发组织</strong></td><td>UC Berkeley / 社区</td><td>华为 / 社区</td><td>社区</td><td>LMSYS Org</td></tr>
          <tr><td><strong>核心创新</strong></td><td>PagedAttention</td><td>硬件可插拔插件</td><td>HashChain 前缀缓存</td><td>RadixAttention</td></tr>
          <tr><td><strong>主要语言</strong></td><td>Python + C++/CUDA</td><td>Python + C++/Ascend C</td><td>Python + Ascend C</td><td>Python + Rust</td></tr>
          <tr><td><strong>支持硬件</strong></td><td>NVIDIA / AMD / Intel</td><td>华为 Ascend NPU</td><td>CUDA + Ascend NPU</td><td>NVIDIA / AMD / TPU / Ascend</td></tr>
          <tr><td><strong>模型支持</strong></td><td>200+ 架构</td><td>主流 Transformer / MoE</td><td>Qwen3 稠密模型</td><td>广泛模型 + 多模态</td></tr>
          <tr><td><strong>并行策略</strong></td><td>TP / PP / DP / EP / CP</td><td>TP / EP</td><td>TP (Megatron)</td><td>TP / PP / DP / EP / SP</td></tr>
          <tr><td><strong>进程架构</strong></td><td>多进程 (API + Core + Worker)</td><td>继承 vLLM 多进程</td><td>单进程同步</td><td>多进程 + 分离式</td></tr>
          <tr><td><strong>代码规模</strong></td><td>大型 (~10 万行+)</td><td>中型 (~5 万行+)</td><td>小型 (~1,915 行)</td><td>大型 (~10 万行+)</td></tr>
          <tr><td><strong>学习门槛</strong></td><td>高</td><td>中</td><td>低</td><td>中高</td></tr>
        </tbody>
      </table>

      {/* ==================== 3. 各框架详解 ==================== */}
      <div className="section-divider"><span>vLLM</span></div>

      <h3>核心架构</h3>
      <p>vLLM V1 采用<strong>多进程三层架构</strong>：Frontend（API/LLM 进程）通过 ZMQ 与 Engine Core（调度 + KV Cache 管理）通信，Engine Core 驱动 GPU Worker 执行模型推理。</p>

      <h3>关键创新</h3>
      <ul>
        <li><strong>PagedAttention</strong>：KV Cache 分页管理，消除内存碎片，内存利用率从 ~25% 提升至 99%+</li>
        <li><strong>Continuous Batching</strong>：动态批处理，prefill 和 decode 自由混合调度</li>
        <li><strong>前缀缓存</strong>：sha256 链式哈希 + BlockHashToBlockMap + 完整 LRU 淘汰</li>
        <li><strong>三步调度</strong>：Phase 1 调度 RUNNING → Phase 2 调度 WAITING → Phase 3 终态化</li>
        <li><strong>两步执行</strong>：execute_model 返回 None（采样推迟）+ sample_tokens 完成采样</li>
      </ul>

      <h3>核心模块</h3>
      <table>
        <thead><tr><th>模块</th><th>核心类</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td>引擎层</td><td><code>AsyncLLM</code> / <code>LLMEngine</code> + <code>InputProcessor</code> + <code>OutputProcessor</code></td><td>请求接收、Tokenization、Detokenization、流式输出</td></tr>
          <tr><td>调度层</td><td><code>Scheduler</code> + <code>KVCacheManager</code> + <code>BlockPool</code></td><td>调度决策、KV Cache 三级管理、物理块池</td></tr>
          <tr><td>执行层</td><td><code>Executor</code> + <code>Worker</code> + <code>GPUModelRunner</code></td><td>模型加载、前向传播、采样、CUDA Graph</td></tr>
          <tr><td>配置层</td><td><code>VllmConfig</code>（~25 子配置）</td><td>统一参数化，compute_hash() 缓存一致性</td></tr>
        </tbody>
      </table>

      <h3>适用场景</h3>
      <ul>
        <li>✅ NVIDIA GPU 生产部署（首选）</li>
        <li>✅ 200+ 模型架构，多模态支持完善</li>
        <li>✅ 在线服务 + 离线批量推理</li>
        <li>✅ 量化部署（FP8/INT8/INT4/AWQ/GPTQ）</li>
      </ul>

      <div className="section-divider"><span>vLLM-Ascend</span></div>

      <h3>核心架构</h3>
      <p>vLLM-Ascend 是 vLLM 的<strong>硬件可插拔插件</strong>，通过 RFC 定义的插件接口将华为 Ascend NPU 适配到 vLLM 推理框架。核心代码与 vLLM 主仓库解耦，运行时通过插件接口加载。</p>

      <h3>关键创新</h3>
      <ul>
        <li><strong>硬件可插拔插件</strong>：不侵入 vLLM 核心代码，通过标准接口注入 NPU 平台实现</li>
        <li><strong>CANN 软件栈</strong>：基于华为 CANN 9.1.0 + TorchNPU 2.10.0，提供融合算子</li>
        <li><strong>继承 vLLM 全部特性</strong>：PagedAttention、Continuous Batching、Chunked Prefill 等全部继承</li>
      </ul>

      <h3>核心模块</h3>
      <table>
        <thead><tr><th>模块</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><strong>Platform 插件</strong></td><td>注册 Ascend 平台，注入设备管理、通信后端（HCCL）、内存分配</td></tr>
          <tr><td><strong>Attention 后端</strong></td><td>NPU 融合注意力算子，替代 CUDA FlashAttention</td></tr>
          <tr><td><strong>Worker 适配</strong></td><td>Ascend Worker 替代 GPU Worker，NPU 模型加载与执行</td></tr>
          <tr><td><strong>ModelRunner</strong></td><td>继承 vLLM GPUModelRunner，适配 NPU 图编译</td></tr>
        </tbody>
      </table>

      <h3>适用场景</h3>
      <ul>
        <li>✅ 华为 Ascend NPU 生产部署</li>
        <li>✅ 需要 vLLM 完整生态的场景</li>
        <li>✅ 主流 Transformer / MoE 模型推理</li>
      </ul>

      <div className="section-divider"><span>nano-vLLM-NPU</span></div>

      <h3>核心架构</h3>
      <p>nano-vLLM-NPU 是 vLLM 核心概念的<strong>独立精简重实现</strong>（非 fork），约 1,915 行、23 个文件。<strong>单进程同步架构</strong>：rank 0 集调度和执行于一身，其他 rank 通过 mp.Process + SharedMemory + Event 锁步并行。</p>

      <h3>关键创新</h3>
      <ul>
        <li><strong>HashChain 前缀缓存</strong>：xxhash 链式哈希 + token 二次验证，极简但正确性完备</li>
        <li><strong>两阶段 Prefill 优先调度</strong>：严格 prefill/decode 分离，仅队首可分块</li>
        <li><strong>CUDA + NPU 双平台</strong>：98 行 device.py 自由函数分发，8 项 NPU 适配改动</li>
        <li><strong>Chunked Prefill 边界完备</strong>：6 类边界不变式 + 11 条不变式速查 + 5 提交 bug 演进史</li>
        <li><strong>SDPA Fallback</strong>：纯 PyTorch 实现，NPU 不依赖 flash-attn</li>
      </ul>

      <h3>核心模块</h3>
      <table>
        <thead><tr><th>模块</th><th>核心类</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td>引擎</td><td><code>LLMEngine</code></td><td>add_request / step / generate 同步阻塞循环</td></tr>
          <tr><td>调度器</td><td><code>Scheduler</code></td><td>两阶段调度 + LIFO 抢占 + postprocess 写回</td></tr>
          <tr><td>KV Cache</td><td><code>BlockManager</code></td><td>HashChain 前缀缓存 + Block 引用计数</td></tr>
          <tr><td>执行器</td><td><code>ModelRunner</code></td><td>多进程 TP + SharedMemory IPC + CUDA Graph 捕获</td></tr>
          <tr><td>设备抽象</td><td><code>device.py</code></td><td>cuda/npu 自由函数分发，无类/插件体系</td></tr>
        </tbody>
      </table>

      <h3>适用场景</h3>
      <ul>
        <li>✅ 学习推理引擎原理（最佳入口）</li>
        <li>✅ Ascend NPU 离线批量推理</li>
        <li>✅ 快速原型验证</li>
        <li>⚠️ 不适合生产级在线服务（无流式、无跨请求 batching）</li>
      </ul>

      <div className="section-divider"><span>SGLang</span></div>

      <h3>核心架构</h3>
      <p>SGLang 采用<strong>前端接入 → 推理引擎 → 执行层</strong>三层架构，最大的特色是 RadixAttention 前缀缓存和 Rust 零开销调度器。支持 Prefill-Decode 分离部署，允许为两个阶段使用不同配置的 GPU 池。</p>

      <h3>关键创新</h3>
      <ul>
        <li><strong>RadixAttention</strong>：Radix Tree 前缀缓存，自动检测和复用共享前缀，最高 5x 加速</li>
        <li><strong>零开销 CPU 调度器</strong>：Rust 实现，调度开销近乎为零，Radix 感知优先调度</li>
        <li><strong>分离式架构</strong>：Prefill Pool + Decode Pool 独立 GPU 集群，最大化资源利用率</li>
        <li><strong>多硬件统一支持</strong>：NVIDIA / AMD / TPU / Ascend / Intel Xeon</li>
      </ul>

      <h3>核心模块</h3>
      <table>
        <thead><tr><th>模块</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><strong>前端接入</strong></td><td>HTTP Server (OpenAI 兼容) + Tokenization + sgl-router 请求路由</td></tr>
          <tr><td><strong>推理引擎</strong></td><td>零开销 CPU Scheduler + RadixAttention + Continuous Batching</td></tr>
          <tr><td><strong>执行层</strong></td><td>Prefill Pool + Decode Pool + TP/EP 并行</td></tr>
          <tr><td><strong>硬件支持</strong></td><td>NVIDIA / AMD / TPU / Ascend / Intel Xeon 统一抽象</td></tr>
        </tbody>
      </table>

      <h3>适用场景</h3>
      <ul>
        <li>✅ 多轮对话 / Agent 工作负载（前缀复用率高）</li>
        <li>✅ 结构化生成（JSON Schema / Tool Calling）</li>
        <li>✅ RL 训练推理集成</li>
        <li>✅ 大规模生产部署（40 万+ GPU）</li>
      </ul>

      {/* ==================== 请求生命周期 ==================== */}
      <div className="section-divider"><span>请求生命周期对比</span></div>
      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Client
    participant A as API Server
    participant S as Scheduler
    participant B as KV Cache
    participant W as Worker/GPU

    C->>A: POST /v1/completions
    A->>A: Tokenize input
    A->>S: Add request to queue
    loop Continuous Batching
        S->>S: Select requests for step
        S->>B: Allocate/evict KV blocks
        B->>B: vLLM: PagedAttention / SGLang: RadixAttention
        S->>W: Dispatch batch to GPU
        W->>W: Forward pass (Attention + MLP)
        W-->>S: Output tokens
        S->>S: Update sequences
    end
    S-->>A: Generated tokens
    A-->>C: Stream response
      `} />

      {/* ==================== 核心模块横向对比 ==================== */}
      <div className="section-divider"><span>核心模块横向对比</span></div>

      <h3>KV Cache 管理</h3>
      <table>
        <thead><tr><th>框架</th><th>机制</th><th>哈希算法</th><th>碰撞防护</th><th>LRU 淘汰</th><th>Block 大小</th></tr></thead>
        <tbody>
          <tr><td><strong>vLLM</strong></td><td>PagedAttention + 自动前缀缓存</td><td>sha256 可配置</td><td>sha256 + extra_keys + group_id</td><td>✅ 完整 LRU</td><td>16（可配置）</td></tr>
          <tr><td><strong>vLLM-Ascend</strong></td><td>继承 vLLM PagedAttention</td><td>继承 vLLM</td><td>继承 vLLM</td><td>✅ 继承 vLLM</td><td>16</td></tr>
          <tr><td><strong>nano-vLLM</strong></td><td>Paged KV + HashChain 前缀缓存</td><td>xxhash.xxh64 链式</td><td>Token 二次验证</td><td>❌ 无（自由块保留 hash）</td><td>256</td></tr>
          <tr><td><strong>SGLang</strong></td><td>RadixAttention (Radix Tree)</td><td>—（树结构，非哈希）</td><td>树结构天然唯一</td><td>✅ LRU 淘汰</td><td>—（Token 级）</td></tr>
        </tbody>
      </table>

      <h3>调度策略</h3>
      <table>
        <thead><tr><th>框架</th><th>调度算法</th><th>实现语言</th><th>阶段</th><th>抢占策略</th></tr></thead>
        <tbody>
          <tr><td><strong>vLLM</strong></td><td>Continuous Batching + Chunked Prefill</td><td>Python</td><td>统一单阶段（prefill/decode 自由混合）</td><td>PRIORITY / FCFS + step 回滚</td></tr>
          <tr><td><strong>vLLM-Ascend</strong></td><td>继承 vLLM 调度器</td><td>Python</td><td>继承 vLLM</td><td>继承 vLLM</td></tr>
          <tr><td><strong>nano-vLLM</strong></td><td>两阶段 Prefill 优先 + 仅队首分块</td><td>Python</td><td>严格两阶段（prefill 或 decode）</td><td>LIFO（全量重算）</td></tr>
          <tr><td><strong>SGLang</strong></td><td>Radix 感知 + 零开销调度</td><td>Rust</td><td>Radix 感知 + Continuous Batching</td><td>前缀感知抢占</td></tr>
        </tbody>
      </table>

      <h3>硬件抽象</h3>
      <table>
        <thead><tr><th>框架</th><th>抽象方式</th><th>代码量</th><th>扩展方式</th><th>支持平台</th></tr></thead>
        <tbody>
          <tr><td><strong>vLLM</strong></td><td>内置 CUDA/HIP 支持</td><td>8 个模块</td><td>Platform 类 + PlatformEnum + 插件</td><td>CUDA/ROCm/TPU/XPU/CPU</td></tr>
          <tr><td><strong>vLLM-Ascend</strong></td><td>硬件可插拔插件 (RFC)</td><td>独立插件仓库</td><td>Platform 子类注入</td><td>Ascend NPU</td></tr>
          <tr><td><strong>nano-vLLM</strong></td><td>自由函数分发 (device.py)</td><td>98 行</td><td>if/else 分支（cuda/npu）</td><td>CUDA + NPU</td></tr>
          <tr><td><strong>SGLang</strong></td><td>多硬件原生支持</td><td>统一抽象层</td><td>统一多硬件接口</td><td>NVIDIA/AMD/TPU/Ascend/Intel</td></tr>
        </tbody>
      </table>

      <h3>进程架构</h3>
      <table>
        <thead><tr><th>框架</th><th>架构模式</th><th>进程间通信</th><th>特点</th></tr></thead>
        <tbody>
          <tr><td><strong>vLLM</strong></td><td>多进程：API + EngineCore + Worker</td><td>ZMQ ROUTER→DEALER + PUSH→PULL</td><td>控制面与数据面完全解耦</td></tr>
          <tr><td><strong>vLLM-Ascend</strong></td><td>继承 vLLM 多进程</td><td>继承 vLLM ZMQ</td><td>Worker 替换为 Ascend 实现</td></tr>
          <tr><td><strong>nano-vLLM</strong></td><td>单进程同步</td><td>SharedMemory + Event（仅 TP）</td><td>rank 0 集调度和执行于一身</td></tr>
          <tr><td><strong>SGLang</strong></td><td>多进程 + 分离式 Prefill/Decode</td><td>NCCL / RDMA</td><td>Prefill 和 Decode 独立 GPU 池</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>学习路径建议：</strong>先阅读 <strong>vLLM</strong> 理解 PagedAttention 和 Continuous Batching 的核心概念（所有推理框架的基石），
        再阅读 <strong>nano-vLLM</strong> 通过精简代码深入理解 Chunked Prefill 边界和 HashChain 前缀缓存，
        然后阅读 <strong>SGLang</strong> 了解 RadixAttention 的创新，最后对比 <strong>vLLM-Ascend</strong> 理解 NPU 适配的插件化思路。
      </Callout>

      <ResourceTable resources={[
          { name: 'PagedAttention 论文 (SOSP 2023)', url: 'https://arxiv.org/abs/2309.06180', desc: 'PagedAttention 原始论文，KV Cache 分页管理的理论基础' },
          { name: 'vLLM 文档', url: 'https://docs.vllm.ai', desc: 'vLLM 官方文档，PagedAttention 与 Continuous Batching 的完整讲解' },
          { name: 'SGLang 文档', url: 'https://docs.sglang.io', desc: 'SGLang 官方文档，RadixAttention 与零开销调度器的详细说明' },
          { name: 'Transformer 原始论文', url: 'https://arxiv.org/abs/1706.03762', desc: '"Attention Is All You Need"，Attention 机制的奠基之作' },
          { name: 'The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/', desc: 'Jay Alammar 经典可视化图解，直观理解 Q/K/V 与多头注意力' },
          { name: 'Attention? Attention!', url: 'https://lilianweng.github.io/posts/2018-06-24-attention/', desc: 'Lilian Weng 注意力机制综述，从 Seq2Seq 到 Self-Attention 的演进' },
          { name: 'nanoGPT', url: 'https://github.com/karpathy/nanoGPT', desc: 'Andrej Karpathy 极简 GPT 训练/推理实现，快速理解完整流程' },
          { name: 'HuggingFace Transformers', url: 'https://github.com/huggingface/transformers', desc: '最流行的生产级 Transformer 库，BERT/GPT/Llama 等完整实现' },
        ]} />
    </div>
  );
}