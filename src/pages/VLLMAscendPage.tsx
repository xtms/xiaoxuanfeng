import { MermaidDiagram } from '../components/MermaidDiagram';
import { CodeBlock, Callout, ExternalLink, ResourceTable } from '../components/CodeBlock';

export function VLLMAscendPage() {
  return (
    <div className="prose max-w-none">
      <h1>vLLM-Ascend</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 25 分钟</span>
        <span className="page-meta-item">🏷️ 硬件插件 · Ascend NPU · CANN</span>
      </div>
      <p>
        vLLM-Ascend 是 vLLM 的<strong>社区维护硬件插件</strong>，通过 vLLM 的硬件可插拔接口（RFC: Hardware Pluggable），
        将 vLLM 的推理能力带到华为 Ascend NPU。它使用 CANN（Compute Architecture for Neural Networks）替代 CUDA 工具链，
        以独立插件仓库的形式存在，不侵入 vLLM 核心代码。
      </p>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://github.com/vllm-project/vllm-ascend" label="GitHub" />
        <ExternalLink href="https://quay.io/ascend/vllm-ascend" label="Docker 镜像" />
      </div>

      {/* ==================== 0. vLLM 与 vLLM-Ascend 的关系 ==================== */}
      <div className="section-divider"><span>vLLM 与 vLLM-Ascend 的关系</span></div>
      <p>
        vLLM-Ascend <strong>不是 vLLM 的 fork</strong>，而是一个<strong>独立插件</strong>。两者的关系可以理解为：
        vLLM 提供推理引擎的<strong>全部核心逻辑</strong>，vLLM-Ascend 提供<strong>硬件执行层的 Ascend NPU 实现</strong>。
        两个仓库独立演进，通过 vLLM 定义的<strong>硬件可插拔接口</strong>在运行时动态组合。
      </p>

      <h3>仓库关系图</h3>
      <MermaidDiagram chart={`
flowchart LR
  subgraph V["vLLM (vllm-project/vllm)"]
    V1["入口层"] --> V2["引擎层"]
    V2 --> V3["调度层"]
    V2 --> V4["KV Cache"]
    V3 --> V5["执行层"]
    V4 --> V5
    V5 --> V6["Worker"]
    V6 --> V7["模型层"]
    V1 --> V8["采样"]
    V1 --> V9["配置"]
  end

  subgraph A["vLLM-Ascend (独立插件)"]
    A1["Platform"]
    A2["Worker"]
    A3["ModelRunner"]
    A4["Attention"]
    A5["融合算子"]
    A6["量化"]
  end

  V6 -.->|"插件注入"| A1
  A1 --> A2 --> A3
  A3 --> A4
  A3 --> A5
  A3 --> A6

  style V fill:#e8f4fd,stroke:#0284c7
  style A fill:#f3e8ff,stroke:#7c3aed
      `} />

      <h3>插件发现与加载机制</h3>
      <p>vLLM 通过 Python 的 <strong>entry point</strong> 机制发现插件，无需修改 vLLM 任何代码。整个加载链路如下：</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant U as 用户
    participant ENV as 环境变量
    participant EP as setuptools<br/>entry points
    participant V as vLLM
    participant AP as vLLM-Ascend
    participant CANN as CANN 驱动

    U->>ENV: export VLLM_USE_ASCEND=1
    U->>V: pip install vllm vllm-ascend
    Note over EP: pyproject.toml 声明<br/>[project.entry-points."vllm.platforms"]<br/>ascend = "vllm_ascend"

    V->>V: 启动时 scan entry points
    V->>EP: importlib.metadata.entry_points(group="vllm.platforms")
    EP-->>V: {"ascend": "vllm_ascend"}
    V->>AP: import vllm_ascend
    AP->>AP: __init__.py 注册 AscendPlatform
    AP->>CANN: 初始化 CANN 环境
    CANN-->>AP: npu 设备就绪
    V->>V: device_config.device = "npu"
    V->>V: 通过 Platform 获取 Worker/Attention/Comm
    Note over V: 后续所有硬件操作<br/>都通过 Platform 分发
      `} />

      <CodeBlock language="toml" title="pyproject.toml 中的 entry point 声明" code={`# vllm-ascend/pyproject.toml
[project.entry-points."vllm.platforms"]
ascend = "vllm_ascend"

# 这告诉 vLLM: 当需要 "ascend" 平台时，
# import vllm_ascend 包即可完成注册`} />

      <h3>接口契约：vLLM 要求插件实现什么</h3>
      <p>vLLM 定义了多层次的抽象接口，插件必须实现这些接口才能接入。每个接口都是一组<strong>必须实现的方法</strong>：</p>

      <table>
        <thead><tr><th>接口层</th><th>核心方法</th><th>vLLM 调用时机</th><th>Ascend 实现</th></tr></thead>
        <tbody>
          <tr><td><strong>Platform</strong></td><td><code>get_device_name()</code><br/><code>get_device_total_memory()</code><br/><code>mem_get_info()</code><br/><code>device_ctx()</code><br/><code>get_attn_backend_cls()</code><br/><code>get_device_communicator_cls()</code></td><td>启动时确定设备类型<br/>内存分配/查询<br/>Worker 创建时获取后端类</td><td><code>return "npu"</code><br/><code>torch.npu.get_device_properties</code><br/><code>torch.npu.device()</code><br/><code>AscendAttentionBackend</code><br/><code>HcclCommunicator</code></td></tr>
          <tr><td><strong>WorkerBase</strong></td><td><code>init_device()</code><br/><code>load_model()</code><br/><code>execute_model()</code><br/><code>sample_tokens()</code></td><td>启动时初始化设备<br/>加载模型权重<br/>每个 step 执行推理<br/>每个 step 采样</td><td><code>torch.npu.set_device()</code> + HCCL<br/><code>model.npu()</code> + CANN 转换<br/>CANN Graph 执行<br/>NPU 上采样</td></tr>
          <tr><td><strong>AttentionBackend</strong></td><td><code>forward()</code><br/><code>forward_decode()</code></td><td>每层 Attention 前向<br/>Decode 阶段增量推理</td><td><code>npu_fused_infer_attention_score</code></td></tr>
          <tr><td><strong>ModelRunner</strong></td><td><code>_prepare_inputs()</code><br/><code>_model_forward()</code><br/><code>compute_logits()</code></td><td>准备输入张量<br/>模型前向传播<br/>计算 logits</td><td>NPU 张量适配<br/>CANN 图编译<br/>ACL 矩阵乘</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>接口设计原则：</strong>vLLM 的抽象接口只定义"<strong>做什么</strong>"（What），不定义"<strong>怎么做</strong>"（How）。
        例如 <code>get_device_name()</code> 只要求返回设备名称字符串，不关心内部是 <code>torch.cuda</code> 还是 <code>torch.npu</code>。
        这种设计使得同一套调度逻辑可以无缝适配不同硬件。
      </Callout>

      <h3>模块归属明细</h3>
      <table>
        <thead><tr><th>模块</th><th>归属</th><th>复用方式</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>API Server</strong></td><td>🟦 vLLM</td><td>直接复用</td><td>OpenAI 兼容 API、SSE 流式响应</td></tr>
          <tr><td><strong>LLMEngine / AsyncLLM</strong></td><td>🟦 vLLM</td><td>直接复用</td><td>请求入口、InputProcessor、OutputProcessor</td></tr>
          <tr><td><strong>Scheduler</strong></td><td>🟦 vLLM</td><td>直接复用</td><td>三阶段调度、Continuous Batching、抢占</td></tr>
          <tr><td><strong>KVCacheManager / BlockPool</strong></td><td>🟦 vLLM</td><td>直接复用</td><td>PagedAttention、前缀缓存、LRU 淘汰</td></tr>
          <tr><td><strong>Executor</strong></td><td>🟦 vLLM</td><td>直接复用</td><td>UniProc/Multiproc/Ray 执行器</td></tr>
          <tr><td><strong>Sampler</strong></td><td>🟦 vLLM</td><td>直接复用</td><td>temperature/top-k/top-p 采样</td></tr>
          <tr><td><strong>VllmConfig</strong></td><td>🟦 vLLM</td><td>直接复用</td><td>~25 子配置，统一参数化</td></tr>
          <tr><td><strong>模型定义 (295+)</strong></td><td>🟦 vLLM</td><td>直接复用</td><td>所有模型架构，device-agnostic</td></tr>
          <tr style={{ borderTop: '2px solid var(--border)' }}><td><strong>Platform</strong></td><td>🟣 vLLM-Ascend</td><td>接口实现</td><td>注册 Ascend 平台，注入设备/通信/注意力后端</td></tr>
          <tr><td><strong>Worker</strong></td><td>🟣 vLLM-Ascend</td><td>继承替换</td><td>AscendWorker 继承 WorkerBase，替换 GPUWorker</td></tr>
          <tr><td><strong>ModelRunner</strong></td><td>🟣 vLLM-Ascend</td><td>继承替换</td><td>AscendModelRunner 继承 GPUModelRunner，NPU 优化</td></tr>
          <tr><td><strong>Attention 后端</strong></td><td>🟣 vLLM-Ascend</td><td>接口实现</td><td>AscendAttentionBackend，CANN 融合算子</td></tr>
          <tr><td><strong>融合算子</strong></td><td>🟣 vLLM-Ascend</td><td>新增</td><td>MoE/RMSNorm/RoPE 等 CANN 融合 kernel</td></tr>
          <tr><td><strong>量化</strong></td><td>🟣 vLLM-Ascend</td><td>新增</td><td>FP8/INT8/W8A8 等 Ascend 量化方案</td></tr>
          <tr><td><strong>通信后端</strong></td><td>🟣 vLLM-Ascend</td><td>接口实现</td><td>HCCL 替代 NCCL</td></tr>
        </tbody>
      </table>

      <h3>版本兼容性与依赖链</h3>
      <p>vLLM-Ascend 的版本管理遵循<strong>严格匹配</strong>策略，整个依赖链从上到下必须版本一致：</p>

      <MermaidDiagram chart={`
flowchart TD
    V["vLLM vX.Y.Z"] -->|"pip install vllm==X.Y.Z"| VA["vLLM-Ascend vX.Y.Z"]
    VA -->|"依赖"| T["TorchNPU ≥2.10"]
    VA -->|"依赖"| C["CANN ≥9.1.0"]
    T -->|"映射到"| C
    C -->|"驱动"| D["Ascend 驱动"]
    D -->|"管理"| H["NPU 硬件"]

    V -.->|"接口兼容性检查"| VA
    VA -.->|"分支对应"| V
    Note1["vLLM main → vLLM-Ascend main"]
    Note2["vLLM releases/vX.Y.Z → vLLM-Ascend releases/vX.Y.Z"]
      `} />

      <table>
        <thead><tr><th>版本场景</th><th>vLLM</th><th>vLLM-Ascend</th><th>结果</th></tr></thead>
        <tbody>
          <tr><td>✅ 正常</td><td>0.23.0</td><td>0.23.0</td><td>接口兼容，正常运行</td></tr>
          <tr><td>❌ 不匹配</td><td>0.23.0</td><td>0.22.0</td><td>接口可能不兼容，启动报错</td></tr>
          <tr><td>❌ 不匹配</td><td>0.23.1</td><td>0.23.0</td><td>patch 版本也需一致，可能报错</td></tr>
          <tr><td>⚠️ main 分支</td><td>main</td><td>main</td><td>持续集成，每日同步，可能不稳定</td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>版本匹配是硬性要求：</strong>vLLM 的接口在 minor 版本间可能变化（新增方法、修改签名等）。
        如果 vLLM-Ascend 版本不匹配，<code>hasattr(platform, "new_method")</code> 检查失败，或方法签名不匹配导致运行时崩溃。
        这也是为什么 Docker 镜像将 vLLM + vLLM-Ascend + CANN + TorchNPU 打包在一起——确保全链路版本一致。
      </Callout>

      <h3>vLLM 升级对插件的影响</h3>
      <p>当 vLLM 发布新版本时，vLLM-Ascend 需要同步跟进。以下是典型的升级流程和影响评估：</p>

      <table>
        <thead><tr><th>vLLM 变更类型</th><th>对插件的影响</th><th>Ascend 需做的改动</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td><strong>调度/Scheduler 变更</strong></td><td>🟢 无影响</td><td>无需改动（完全复用）</td><td>新增抢占策略、优化调度算法</td></tr>
          <tr><td><strong>KV Cache 变更</strong></td><td>🟢 无影响</td><td>无需改动（完全复用）</td><td>BlockPool 优化、新增缓存策略</td></tr>
          <tr><td><strong>模型层变更</strong></td><td>🟢 无影响</td><td>无需改动（device-agnostic）</td><td>新增模型架构支持</td></tr>
          <tr><td><strong>Platform 接口新增方法</strong></td><td>🔴 必须实现</td><td>实现新方法，否则启动报错</td><td>新增 <code>get_punica_wrapper()</code></td></tr>
          <tr><td><strong>Worker 接口变更</strong></td><td>🔴 必须适配</td><td>修改 Worker 实现</td><td><code>execute_model()</code> 签名变化</td></tr>
          <tr><td><strong>Attention 接口变更</strong></td><td>🔴 必须适配</td><td>修改 Attention 后端</td><td>新增 <code>forward_prefix()</code> 方法</td></tr>
          <tr><td><strong>新增特性 (如 Disaggregated)</strong></td><td>🟡 可选支持</td><td>按需实现，不实现则降级</td><td>分离式 Prefill/Decode</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>一句话总结：</strong>vLLM 负责"<strong>怎么调度</strong>"（Scheduler、KVCacheManager、Continuous Batching），
        vLLM-Ascend 负责"<strong>在什么硬件上执行</strong>"（AscendWorker、CANN 融合算子、HCCL 通信）。
        两者的接口边界在 <code>Platform</code> 抽象层，通过 <code>vllm.platforms</code> entry point 动态发现和加载。
        当 vLLM 接口不变时，插件零改动即可升级；当接口变化时，插件需同步实现新方法。
      </Callout>

      {/* ==================== 1. 架构总览 ==================== */}
      <div className="section-divider"><span>架构总览</span></div>
      <p>核心设计理念：<strong>硬件可插拔（Hardware Pluggable）</strong>。Ascend 适配代码完全在独立仓库中，通过 vLLM 定义的插件接口注入，不与 vLLM 核心代码耦合。</p>

      <MermaidDiagram chart={`
flowchart TB
  subgraph VLLM["vLLM 核心"]
    API["API Server"]
    ENG["LLMEngine"]
    SCH["Scheduler"]
    BLK["BlockManager"]
    PIF["Platform 接口"]
    AIF["Attention 接口"]
    WIF["Worker 接口"]
    EIF["Executor 接口"]
  end

  subgraph PLUGIN["vLLM-Ascend 插件"]
    APL["AscendPlatform"]
    AAT["AscendAttention"]
    AWK["AscendWorker"]
    AMR["AscendModelRunner"]
    AOPS["融合算子"]
    AQNT["量化"]
  end

  subgraph STACK["Ascend 软件栈"]
    TNPU["TorchNPU"]
    CANN["CANN"]
    HCCL["HCCL"]
    ACL["ACL"]
  end

  subgraph HW["Ascend 硬件"]
    A2["910B / A2"]
    A3["910C / A3"]
    DUO["300I Duo"]
  end

  API --> ENG --> SCH --> BLK
  BLK --> PIF
  PIF --> APL
  APL --> AWK --> AMR
  AMR --> AAT
  AMR --> AOPS
  AMR --> AQNT
  AAT --> TNPU
  AOPS --> TNPU
  AWK --> HCCL
  TNPU --> CANN
  HCCL --> CANN
  CANN --> ACL
  ACL --> HW
      `} />

      {/* ==================== 2. 硬件可插拔接口详解 ==================== */}
      <div className="section-divider"><span>硬件可插拔接口详解</span></div>
      <p>
        vLLM 社区通过 RFC 定义了硬件可插拔接口体系，将硬件相关的实现抽象为多个接口层。
        vLLM-Ascend 是实现这些接口的 Ascend 后端，每个接口都有一组必须实现的方法。
      </p>

      <h3>Platform 接口（入口注册）</h3>
      <p><code>Platform</code> 是硬件插件的<strong>顶层入口</strong>，负责设备初始化、内存管理、通信后端等基础设施。vLLM 通过 <code>PlatformEnum</code> 枚举和 <code>Platform.resolve_obj_by_platform()</code> 动态分发到具体平台实现。</p>

      <CodeBlock language="python" title="AscendPlatform 核心接口" code={`class AscendPlatform(Platform):
    """Ascend NPU 平台实现，注册到 vLLM PlatformEnum.ASCEND"""

    # === 设备管理 ===
    @classmethod
    def get_device_name(cls) -> str:
        return "npu"                          # 设备名称标识

    @classmethod
    def get_device_total_memory(cls, device_id: int = 0) -> int:
        """获取 NPU 总内存，通过 torch.npu.get_device_properties()"""
        return torch.npu.get_device_properties(device_id).total_memory

    # === 内存管理 ===
    @classmethod
    def get_current_memory_usage(cls, device_id: int = 0) -> int:
        """获取当前 NPU 内存使用量"""
        return torch.npu.memory_allocated(device_id)

    @classmethod
    def mem_get_info(cls, device_id: int = 0) -> tuple[int, int]:
        """返回 (free_memory, total_memory)"""
        free = torch.npu.get_device_properties(device_id).total_memory \\
               - torch.npu.memory_allocated(device_id)
        return (free, cls.get_device_total_memory(device_id))

    # === 通信后端 ===
    @classmethod
    def get_device_communicator_cls(cls) -> Type:
        """返回 HCCL 通信后端，替代 NCCL"""
        return HcclCommunicator

    # === 推理后端 ===
    @classmethod
    def get_attn_backend_cls(cls) -> Type:
        """返回 Ascend 融合注意力后端"""
        return AscendAttentionBackend

    # === 设备上下文 ===
    @classmethod
    def device_ctx(cls, device_id: int = 0):
        """返回 torch.npu.device() 上下文管理器"""
        return torch.npu.device(device_id)

    @classmethod
    def is_custom_op_supported(cls) -> bool:
        return True                            # 支持自定义算子`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/vllm-project/vllm-ascend/blob/main/vllm_ascend/platform.py" target="_blank" rel="noreferrer">vllm_ascend/platform.py</a></div>

      <h3>插件注册流程</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant V as vLLM 启动
    participant PE as PlatformEnum
    participant PR as PlatformRegistry
    participant AP as AscendPlatform
    participant AW as AscendWorker
    participant AMR as AscendModelRunner

    V->>V: 解析环境变量 VLLM_USE_ASCEND=1
    V->>PE: PlatformEnum.ASCEND
    V->>PR: resolve_obj_by_platform("ASCEND")
    PR->>AP: 加载 vllm_ascend 插件包
    AP->>AP: 注册 AscendPlatform
    AP->>AP: 初始化 CANN 环境
    AP->>AP: 注册 HCCL 通信后端
    V->>V: VllmConfig.device_config.device = "npu"
    V->>AW: 创建 AscendWorker
    AW->>AW: init_device() → torch.npu.set_device()
    AW->>AW: load_model() → torch.npu 加载
    AW->>AMR: 创建 AscendModelRunner
    AMR->>AMR: 加载模型到 NPU
    AMR->>AMR: 图编译优化 (torch.compile / CANN Graph)
    AMR-->>V: 就绪，开始推理
      `} />

      <Callout type="info">
        <strong>注册机制：</strong>vLLM 通过 <code>vllm.platforms</code> 入口点（entry point）发现插件。
        vLLM-Ascend 在 <code>pyproject.toml</code> 中声明 <code>vllm.platforms</code> 入口点指向 <code>vllm_ascend</code>，
        vLLM 启动时自动加载并注册 Ascend 平台。无需修改 vLLM 任何代码。
      </Callout>

      {/* ==================== 3. 软件栈对比 ==================== */}
      <div className="section-divider"><span>软件栈对比</span></div>
      <table>
        <thead><tr><th>组件</th><th>CUDA vLLM</th><th>vLLM-Ascend</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>计算平台</strong></td><td>CUDA 12.x</td><td>CANN 9.1.0</td><td>华为 Ascend 计算架构，包含算子库、编译器、运行时</td></tr>
          <tr><td><strong>PyTorch 后端</strong></td><td>torch.cuda</td><td>torch_npu 2.10.0</td><td>将 PyTorch 算子映射到 CANN 算子</td></tr>
          <tr><td><strong>集合通信</strong></td><td>NCCL</td><td>HCCL</td><td>华为集合通信库，支持 AllReduce/AllGather/ReduceScatter</td></tr>
          <tr><td><strong>融合注意力</strong></td><td>FlashAttention-2 / FlashInfer</td><td>npu_fused_infer_attention_score_v2</td><td>NPU 融合注意力算子，单 kernel 完成 QKV 计算</td></tr>
          <tr><td><strong>线性代数</strong></td><td>cuBLAS / CUTLASS</td><td>ACL (Ascend Computing Library)</td><td>矩阵乘法、卷积等基础算子</td></tr>
          <tr><td><strong>图编译</strong></td><td>CUDA Graph / torch.compile</td><td>CANN Graph / torch.compile (npu backend)</td><td>预编译计算图，减少 kernel launch 开销</td></tr>
          <tr><td><strong>内存分配</strong></td><td>cudaMalloc / cudaFree</td><td>acl.rt.malloc / acl.rt.free</td><td>NPU 设备内存管理</td></tr>
          <tr><td><strong>Python 版本</strong></td><td>3.8 - 3.12</td><td>3.10 - 3.12</td><td>Ascend 对 Python 版本有更严格的要求</td></tr>
        </tbody>
      </table>

      {/* ==================== 4. 插件目录结构 ==================== */}
      <div className="section-divider"><span>插件目录结构</span></div>
      <CodeBlock language="python" title="vLLM-Ascend 仓库结构" code={`vllm-ascend/
├── vllm_ascend/                    # Python 插件包
│   ├── __init__.py                 # 插件入口，注册 AscendPlatform
│   ├── platform.py                 # AscendPlatform 实现 (~500 行)
│   ├── attention/                  # Ascend 融合注意力算子
│   │   ├── __init__.py
│   │   └── ascendshare_attn.py     # npu_fused_infer_attention_score 封装
│   ├── quantization/               # Ascend 量化支持
│   │   ├── __init__.py
│   │   ├── fp8.py                  # FP8 量化 (Ascend 910C 原生支持)
│   │   ├── int8.py                 # INT8 量化
│   │   └── w8a8.py                 # W8A8 权重量化
│   ├── models/                     # Ascend 特定模型适配
│   │   ├── __init__.py
│   │   ├── qwen2.py                # Qwen2 NPU 适配
│   │   └── llama.py                # Llama NPU 适配
│   ├── ops/                        # Ascend 自定义融合算子
│   │   ├── __init__.py
│   │   ├── fused_moe.py            # 融合 MoE (专家混合)
│   │   ├── fused_rms_norm.py       # 融合 RMSNorm
│   │   └── rotary_embedding.py     # 融合 RoPE 位置编码
│   └── worker/                     # Ascend 执行层
│       ├── __init__.py
│       ├── ascend_worker.py        # AscendWorker 实现
│       └── ascend_model_runner.py  # AscendModelRunner 实现
├── csrc/                           # C++/Ascend C 自定义内核
│   ├── ops/                        # 自定义算子 C++ 实现
│   │   ├── fused_moe.cpp           # 融合 MoE 内核
│   │   └── attention.cpp           # 注意力内核
│   └── pybind.cpp                  # Python 绑定
├── cmake/                          # 构建配置
│   └── FindCANN.cmake              # CANN 查找模块
├── docker/                         # Docker 构建
│   ├── Dockerfile.310p             # Atlas 300I Pro
│   ├── Dockerfile.910b             # Atlas 800I A2
│   ├── Dockerfile.910c             # Atlas 800I A3
│   ├── Dockerfile.openeuler        # openEuler 系统
│   └── Dockerfile.ubuntu           # Ubuntu 系统
├── benchmarks/                     # 性能基准测试
├── tests/                          # 单元测试
├── tools/                          # 工具脚本
└── pyproject.toml                  # 项目配置 + 插件入口点声明`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/vllm-project/vllm-ascend" target="_blank" rel="noreferrer">github.com/vllm-project/vllm-ascend</a></div>

      {/* ==================== 5. 请求处理全流程 ==================== */}
      <div className="section-divider"><span>请求处理全流程</span></div>
      <p>vLLM-Ascend 完全复用 vLLM 的调度和 KV Cache 管理逻辑，仅在<strong>硬件执行层</strong>进行替换。以下是完整的请求处理流程：</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Client
    participant API as vLLM API Server
    participant E as LLMEngine
    participant S as Scheduler
    participant KV as KVCacheManager
    participant AP as AscendPlatform
    participant AW as AscendWorker
    participant AMR as AscendModelRunner
    participant NPU as Ascend NPU

    C->>API: POST /v1/chat/completions
    API->>E: engine_client.generate()
    E->>E: InputProcessor.process_inputs()
    E->>E: Tokenize → EngineCoreRequest
    E->>E: EngineCore.add_request()
    E->>S: 放入 waiting 队列

    loop run_busy_loop 每个 step
        S->>S: schedule() 三阶段调度
        S->>KV: allocate_slots() / get_computed_blocks()
        Note over KV: PagedAttention 逻辑不变<br/>BlockPool 管理不变
        S-->>E: SchedulerOutput

        E->>AP: execute_model(scheduler_output)
        AP->>AW: collective_rpc("execute_model")
        AW->>AMR: execute_model()

        rect rgb(238, 242, 255)
            Note over AMR,NPU: Ascend 特有执行路径
            AMR->>AMR: _prepare_inputs()
            AMR->>AMR: 构建 attention_metadata
            AMR->>AMR: 调用 AscendAttentionBackend
            AMR->>NPU: npu_fused_infer_attention_score_v2
            NPU->>NPU: CANN 融合注意力 kernel
            AMR->>NPU: 融合 MoE / RMSNorm / RoPE
            NPU->>NPU: CANN 融合算子执行
            AMR->>NPU: compute_logits (ACL 矩阵乘)
            NPU-->>AMR: hidden_states / logits
        end

        AMR-->>AW: None (采样推迟)

        E->>E: get_grammar_bitmask()
        E->>AP: sample_tokens()
        AP->>AW: collective_rpc("sample_tokens")
        AW->>AMR: sample_tokens()
        AMR->>NPU: Sampler.forward (NPU 上执行)
        NPU-->>AMR: ModelRunnerOutput

        S->>S: update_from_output()
        S->>KV: free 已完成请求的 block
        S-->>E: EngineCoreOutputs
    end

    E-->>API: stream response
    API-->>C: SSE chunks
      `} />

      <Callout type="tip">
        <strong>关键洞察：</strong>vLLM-Ascend 的巧妙之处在于<strong>只替换硬件执行层</strong>。
        调度器（Scheduler）、KV Cache 管理（KVCacheManager/BlockPool）、请求队列（RequestQueue）等核心逻辑<strong>完全复用 vLLM</strong>。
        这种设计使得 Ascend 插件可以同步获得 vLLM 上游的所有优化（PagedAttention、Continuous Batching、Chunked Prefill 等），
        无需在 Ascend 侧重新实现。
      </Callout>

      {/* ==================== 6. AscendWorker 详解 ==================== */}
      <div className="section-divider"><span>AscendWorker 详解</span></div>

      <h3>与 GPUWorker 的差异</h3>
      <p><code>AscendWorker</code> 继承自 <code>WorkerBase</code>，与 <code>GPUWorker</code> 共享相同的接口约定，但在设备初始化、模型加载和图编译方面有显著差异：</p>

      <table>
        <thead><tr><th>维度</th><th>GPUWorker (CUDA)</th><th>AscendWorker (NPU)</th></tr></thead>
        <tbody>
          <tr><td><strong>设备初始化</strong></td><td><code>torch.cuda.set_device()</code></td><td><code>torch.npu.set_device()</code></td></tr>
          <tr><td><strong>模型加载</strong></td><td><code>model.cuda()</code> / <code>load_state_dict</code></td><td><code>model.npu()</code> + CANN 权重转换</td></tr>
          <tr><td><strong>注意力后端</strong></td><td>FlashAttention-2 / FlashInfer</td><td>AscendAttentionBackend（融合 NPU kernel）</td></tr>
          <tr><td><strong>图编译</strong></td><td>CUDA Graph (torch.cuda.graph)</td><td>CANN Graph (torch.npu.graph) / torch.compile</td></tr>
          <tr><td><strong>精度</strong></td><td>FP16/BF16/FP8/INT8/INT4</td><td>FP16/BF16/FP8 (910C 原生)/INT8</td></tr>
          <tr><td><strong>内存管理</strong></td><td>cudaMalloc / CUDA 内存池</td><td>acl.rt.malloc / NPU 内存池</td></tr>
          <tr><td><strong>KV Cache</strong></td><td>GPU 显存 PagedAttention</td><td>NPU 内存 PagedAttention（逻辑相同）</td></tr>
          <tr><td><strong>通信</strong></td><td>NCCL (ncclAllReduce 等)</td><td>HCCL (hcclAllReduce 等)</td></tr>
        </tbody>
      </table>

      <h3>设备初始化流程</h3>
      <CodeBlock language="python" title="AscendWorker 初始化" code={`class AscendWorker(WorkerBase):
    """Ascend NPU Worker，替代 GPUWorker 在 Ascend 平台执行推理"""

    def init_device(self):
        """初始化 NPU 设备环境"""
        if self.device_config.device.type == "npu":
            # 1. 设置当前 NPU 设备
            torch.npu.set_device(self.local_rank)

            # 2. 初始化 HCCL 通信（多卡场景）
            if self.parallel_config.world_size > 1:
                import torch_npu.contrib  # 导入 HCCL 后端
                torch.distributed.init_process_group(
                    backend="hccl",
                    init_method=f"tcp://{self.master_addr}:{self.master_port}",
                    rank=self.rank,
                    world_size=self.world_size,
                )

            # 3. 配置 NPU 内存分配器
            torch.npu.set_per_process_memory_fraction(
                self.cache_config.gpu_memory_utilization
            )

    def load_model(self):
        """加载模型到 NPU 设备"""
        model = self.model_runner.load_model()

        # CANN 权重转换（如果模型格式不是 NPU 原生）
        if self.load_config.model_loader == "ascend":
            model = self._convert_weights_to_ascend(model)

        model = model.npu()  # 移动到 NPU
        return model

    def _convert_weights_to_ascend(self, model):
        """将 HuggingFace 权重转换为 Ascend 原生格式"""
        # 处理不支持的 dtype (如 torch.float32 → torch.float16)
        # 处理不支持的 op (如特定的 attention mask)
        ...
        return model`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/vllm-project/vllm-ascend/blob/main/vllm_ascend/worker/ascend_worker.py" target="_blank" rel="noreferrer">vllm_ascend/worker/ascend_worker.py</a></div>

      {/* ==================== 7. AscendModelRunner 详解 ==================== */}
      <div className="section-divider"><span>AscendModelRunner 详解</span></div>

      <h3>NPU 图编译优化</h3>
      <p><code>AscendModelRunner</code> 继承 vLLM 的 <code>GPUModelRunner</code>，在模型执行层面进行了 NPU 特定的优化。最大的区别在于<strong>图编译</strong>策略：</p>

      <MermaidDiagram chart={`
flowchart TB
    subgraph CUDA["CUDA 路径"]
        C1["加载到 GPU"] --> C2["CUDA Graph 捕获"] --> C3["Graph Replay 执行"]
    end

    subgraph NPU["NPU 路径"]
        N1["加载到 NPU"] --> N2["torch.compile(npu)"] --> N3["图缓存"] --> N4["图执行"]
    end

    subgraph COMMON["共享逻辑"]
        M1["_prepare_inputs"]
        M2["attn_metadata"]
        M3["compute_logits"]
        M4["sample_tokens"]
    end

    CUDA --> COMMON
    NPU --> COMMON
      `} />

      <h3>注意力后端实现</h3>
      <p>注意力是推理中最重要的算子之一。vLLM-Ascend 使用 CANN 提供的<strong>融合注意力算子</strong>替代 FlashAttention：</p>

      <CodeBlock language="python" title="Ascend 融合注意力" code={`class AscendAttentionBackend(AttentionBackend):
    """Ascend NPU 注意力后端，使用 CANN 融合算子"""

    def forward(self, query, key, value, attn_metadata, ...):
        """单次注意力前向传播"""
        # 1. 准备输入
        batch_size = query.shape[0]
        num_heads = query.shape[1]
        head_dim = query.shape[2]
        scale = head_dim ** -0.5

        # 2. 调用 CANN 融合注意力算子
        #    替代 FlashAttention: 单 kernel 完成 QKV 计算
        import torch_npu
        output = torch_npu.npu_fused_infer_attention_score(
            query, key, value,
            num_heads=num_heads,
            num_key_value_heads=num_heads,  # GQA 支持
            input_layout="BSH",              # Batch-Seq-Hidden
            scale=scale,
            atten_mask=attn_metadata.attention_mask,
            sparse_mode=0,                   # 0=禁用, 1-4=不同稀疏模式
        )

        # 3. 返回 output (已包含 softmax + V 加权)
        return output.reshape(batch_size, -1, num_heads * head_dim)

    def forward_decode(self, query, key_cache, value_cache, ...):
        """Decode 阶段：单 token 增量推理"""
        # Decode 阶段 query 只有一个 token
        # 使用 PagedAttention 的 slot_mapping 索引 KV Cache
        output = torch_npu.npu_fused_infer_attention_score(
            query,
            key_cache,      # Paged KV Cache (NPU 内存)
            value_cache,    # Paged KV Cache (NPU 内存)
            num_heads=num_heads,
            num_key_value_heads=num_heads,
            input_layout="BSH",
            scale=scale,
            pse_shift=None,  # 位置编码偏移
            sparse_mode=0,
        )
        return output`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/vllm-project/vllm-ascend/blob/main/vllm_ascend/attention/ascendshare_attn.py" target="_blank" rel="noreferrer">vllm_ascend/attention/ascendshare_attn.py</a></div>

      <Callout type="info">
        <strong>npu_fused_infer_attention_score：</strong>这是 CANN 提供的推理专用融合注意力算子，在单个 kernel 中完成：
        Q @ K^T → Scale → Mask → Softmax → @ V 全流程。相比 FlashAttention，它针对 NPU 架构进行了专门的 tiling 和内存优化。
        支持 GQA (Grouped Query Attention)、稀疏注意力、ALiBi 位置编码等特性。
      </Callout>

      {/* ==================== 8. CANN 自定义融合算子 ==================== */}
      <div className="section-divider"><span>CANN 自定义融合算子</span></div>
      <p>vLLM-Ascend 为 Ascend NPU 实现了一系列<strong>融合算子</strong>，将多个小算子合并为单个 kernel，减少 kernel launch 开销和内存带宽消耗：</p>

      <table>
        <thead><tr><th>算子</th><th>融合操作</th><th>加速比</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>Fused MoE</strong></td><td>gate(softmax) + top-k routing + expert forward + weighted sum</td><td>~2-3x</td><td>将 MoE 的 4 个步骤融合为一个 kernel，避免中间结果的读写</td></tr>
          <tr><td><strong>Fused RMSNorm</strong></td><td>mean² + rsqrt + normalize + scale</td><td>~1.5x</td><td>将 RMSNorm 的多个步骤融合，减少内存访问</td></tr>
          <tr><td><strong>Fused RoPE</strong></td><td>cos/sin 计算 + rotate_half + 拼接</td><td>~1.3x</td><td>旋转位置编码的融合实现</td></tr>
          <tr><td><strong>Fused SiLU Gate</strong></td><td>SiLU(x) * y 门控激活</td><td>~1.2x</td><td>将 SiLU 激活和逐元素乘法融合</td></tr>
        </tbody>
      </table>

      <CodeBlock language="cpp" title="Ascend C 融合算子示例 (Fused RMSNorm)" code={`// csrc/ops/fused_rms_norm.cpp
// 使用 Ascend C 编写融合 RMSNorm 内核
#include "kernel_operator.h"

extern "C" __global__ __aicore__ void fused_rms_norm_kernel(
    GM_ADDR input, GM_ADDR weight, GM_ADDR output,
    float epsilon, int64_t hidden_size
) {
    // Ascend C 编程模型：使用 Ascend C API 编写 NPU 内核
    auto input_gm  = input.Get<half>();    // 全局内存输入
    auto weight_gm = weight.Get<half>();   // 权重
    auto output_gm = output.Get<half>();   // 输出

    // 1. 计算 mean(x²) — 使用 Vector 指令并行
    LocalTensor<half> x_sq = input_gm * input_gm;
    float rms = x_sq.ReduceSum() / hidden_size;

    // 2. 计算 rsqrt — 使用标量指令
    float rsqrt_val = 1.0f / sqrt(rms + epsilon);

    // 3. normalize + scale — 使用 Vector 指令融合
    //    output = input * rsqrt * weight
    output_gm = input_gm * rsqrt_val * weight_gm;

    // 一次 kernel 调用完成全部操作
    // 相比多次调用：减少 2 次全局内存读写
}`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/vllm-project/vllm-ascend/blob/main/csrc/ops/" target="_blank" rel="noreferrer">vllm-ascend/csrc/ops/</a></div>

      {/* ==================== 9. 量化支持 ==================== */}
      <div className="section-divider"><span>量化支持</span></div>
      <p>vLLM-Ascend 支持多种量化方案，利用 Ascend NPU 的硬件特性进行加速：</p>

      <table>
        <thead><tr><th>量化方案</th><th>支持硬件</th><th>精度损失</th><th>内存节省</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>FP8</strong></td><td>Ascend 910C (A3)</td><td>极小</td><td>~50%</td><td>910C 原生支持 FP8 计算，无需反量化</td></tr>
          <tr><td><strong>INT8 (动态)</strong></td><td>Ascend 910B/C</td><td>小</td><td>~50%</td><td>动态量化，激活值运行时量化</td></tr>
          <tr><td><strong>W8A8</strong></td><td>Ascend 910B/C</td><td>小</td><td>~50%</td><td>权重 INT8 + 激活 INT8，全整型推理</td></tr>
          <tr><td><strong>AWQ</strong></td><td>Ascend 910B/C</td><td>极小</td><td>~50%</td><td>激活感知权重量化，需预量化模型</td></tr>
          <tr><td><strong>GPTQ</strong></td><td>Ascend 910B/C</td><td>极小</td><td>~50%</td><td>基于 Hessian 的权重量化，需预量化模型</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>Ascend 910C (A3) 的 FP8 优势：</strong>910C 是华为首款原生支持 FP8 计算的 AI 处理器，FP8 推理不需要反量化步骤，
        直接使用 FP8 Tensor Core 进行计算。相比 BF16，吞吐量提升约 2x，内存占用减半。
      </Callout>

      {/* ==================== 10. 多硬件变体支持 ==================== */}
      <div className="section-divider"><span>多硬件变体支持</span></div>
      <p>vLLM-Ascend 通过不同的 Dockerfile 和构建配置支持多种 Ascend 硬件型号：</p>

      <table>
        <thead><tr><th>硬件型号</th><th>NPU 芯片</th><th>显存</th><th>FP8 支持</th><th>Dockerfile</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>Atlas 800I A2</strong></td><td>Ascend 910B</td><td>64 GB HBM2e</td><td>❌</td><td><code>Dockerfile.910b</code></td><td>生产推理 (BF16/INT8)</td></tr>
          <tr><td><strong>Atlas 800I A3</strong></td><td>Ascend 910C</td><td>96 GB HBM2e</td><td>✅ 原生</td><td><code>Dockerfile.910c</code></td><td>生产推理 (FP8 优先)</td></tr>
          <tr><td><strong>Atlas 300I Duo</strong></td><td>Ascend 910B ×2</td><td>48 GB ×2</td><td>❌</td><td><code>Dockerfile.310p</code></td><td>边缘推理 / 小规模部署</td></tr>
          <tr><td><strong>Atlas 训练卡</strong></td><td>Ascend 910B</td><td>64 GB</td><td>❌</td><td><code>Dockerfile.910b</code></td><td>训练 + 推理混合</td></tr>
        </tbody>
      </table>

      {/* ==================== 11. 部署与构建 ==================== */}
      <div className="section-divider"><span>部署与构建</span></div>

      <h3>环境要求</h3>
      <table>
        <thead><tr><th>组件</th><th>版本要求</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td>CANN</td><td>≥ 9.1.0</td><td>华为 Ascend 计算框架，含算子库和编译器</td></tr>
          <tr><td>TorchNPU</td><td>2.10.0</td><td>PyTorch NPU 后端，必须与 CANN 版本匹配</td></tr>
          <tr><td>Python</td><td>3.10 - 3.12</td><td>严格版本限制，3.9 及以下不支持</td></tr>
          <tr><td>vLLM</td><td>与插件版本一致</td><td>插件版本必须与 vLLM 版本完全相同</td></tr>
          <tr><td>系统</td><td>openEuler 22.03 / Ubuntu 22.04</td><td>推荐 openEuler（华为优化）</td></tr>
        </tbody>
      </table>

      <h3>Docker 部署</h3>
      <CodeBlock language="bash" title="Docker 快速启动" code={`# 拉取镜像 (Atlas 800I A3 / Ascend 910C)
docker pull quay.io/ascend/vllm-ascend:v0.23.0-910c

# 启动容器
docker run -it --rm \\
    --device=/dev/davinci0 \\
    --device=/dev/davinci_manager \\
    --device=/dev/hisi_hdc \\
    -v /usr/local/Ascend/driver:/usr/local/Ascend/driver \\
    quay.io/ascend/vllm-ascend:v0.23.0-910c \\
    bash

# 在容器内启动 vLLM 服务
python -m vllm.entrypoints.openai.api_server \\
    --model Qwen/Qwen2-7B-Instruct \\
    --device npu \\
    --dtype bfloat16 \\
    --max-model-len 8192`} />

      <h3>源码构建</h3>
      <CodeBlock language="bash" title="从源码构建" code={`# 1. 安装 CANN 和 TorchNPU
# 参考: https://www.hiascend.com/document

# 2. 安装 vLLM (版本必须与 vLLM-Ascend 匹配)
pip install vllm==0.23.0

# 3. 克隆 vLLM-Ascend (相同版本)
git clone https://github.com/vllm-project/vllm-ascend.git
cd vllm-ascend
git checkout releases/v0.23.0

# 4. 编译 Ascend C 自定义算子
pip install -e . --no-build-isolation

# 5. 设置环境变量
export VLLM_USE_ASCEND=1
export ASCEND_RT_VISIBLE_DEVICES=0,1,2,3  # 可见 NPU 设备

# 6. 验证安装
python -c "import vllm_ascend; print('vLLM-Ascend installed')"`} />

      <Callout type="warning">
        <strong>版本严格匹配：</strong>vLLM-Ascend 的版本必须与 vLLM 版本<strong>完全相同</strong>（包括 patch 版本）。
        例如 vLLM 0.23.0 必须搭配 vLLM-Ascend 0.23.0。如果版本不匹配，插件接口可能不兼容，导致运行时错误。
        <code>main</code> 分支跟踪 vLLM main 分支持续集成，<code>releases/vX.Y.Z</code> 分支对应各发布版本。
      </Callout>

      {/* ==================== 12. 类图 ==================== */}
      <div className="section-divider"><span>插件核心类图</span></div>

      <MermaidDiagram chart={`
classDiagram
  class Platform {
    &lt;&lt;abstract&gt;&gt;
    +get_device_name()
    +get_device_total_memory()
    +mem_get_info()
    +device_ctx()
    +get_attn_backend_cls()
    +get_comm_cls()
  }
  class AscendPlatform {
    +get_device_name() "npu"
    +mem_get_info() torch.npu
    +device_ctx() torch.npu.device
    +get_attn_backend_cls() AscendAttention
    +get_comm_cls() HcclComm
  }
  class WorkerBase {
    &lt;&lt;abstract&gt;&gt;
    +init_device()
    +load_model()
    +execute_model()
    +sample_tokens()
  }
  class GPUWorker {
    +init_device() torch.cuda
    +load_model() model.cuda()
    +execute_model() CUDA Graph
  }
  class AscendWorker {
    +init_device() torch.npu + HCCL
    +load_model() model.npu()
    +execute_model() CANN Graph
  }
  class AttentionBackend {
    &lt;&lt;abstract&gt;&gt;
    +forward()
    +forward_decode()
  }
  class FlashAttn {
    +forward() flash_attn_func
    +forward_decode() flash_attn_kvcache
  }
  class AscendAttention {
    +forward() npu_fused_attn
    +forward_decode() npu_fused_attn
  }
  class GPUModelRunner {
    +execute_model() CUDA Graph
    +_prepare_inputs()
    +_model_forward()
  }
  class AscendModelRunner {
    +execute_model() CANN Graph
    +_compile_model() torch.compile
  }
  class HcclComm {
    +all_reduce()
    +all_gather()
    +broadcast()
  }

  Platform <|-- AscendPlatform
  WorkerBase <|-- GPUWorker
  WorkerBase <|-- AscendWorker
  AttentionBackend <|-- FlashAttn
  AttentionBackend <|-- AscendAttention
  GPUModelRunner <|-- AscendModelRunner
  AscendPlatform --> AscendWorker
  AscendPlatform --> AscendAttention
  AscendPlatform --> HcclComm
  AscendWorker --> AscendModelRunner
  AscendModelRunner --> AscendAttention
      `} />

      {/* ==================== 13. 关键差异总结 ==================== */}
      <div className="section-divider"><span>关键差异总结</span></div>
      <ol>
        <li><strong>解耦插件模型</strong>：Ascend 代码隔离在独立仓库，通过 <code>vllm.platforms</code> entry point 注册，不侵入 vLLM 核心代码。vLLM 升级时插件只需同步版本号</li>
        <li><strong>CANN 替代 CUDA</strong>：所有计算内核使用华为 CANN 运行时，包括融合注意力、融合 MoE、RMSNorm 等算子</li>
        <li><strong>TorchNPU 替代 PyTorch CUDA</strong>：使用 <code>torch_npu</code> 作为 PyTorch 后端，将 PyTorch 算子映射到 CANN 算子</li>
        <li><strong>HCCL 替代 NCCL</strong>：多卡通信使用华为集合通信库 HCCL，API 与 NCCL 类似但针对 Ascend 互联拓扑优化</li>
        <li><strong>图编译差异</strong>：CUDA 使用 CUDA Graph 捕获/回放，Ascend 使用 CANN Graph + torch.compile 编译优化</li>
        <li><strong>版本严格匹配</strong>：插件版本必须与 vLLM 版本完全相同（含 patch），接口不兼容时直接报错</li>
        <li><strong>多硬件变体</strong>：不同 Dockerfile 对应不同 Ascend 硬件型号（910B/910C/310P），FP8 仅 910C 支持</li>
        <li><strong>社区维护</strong>：非 vLLM 核心团队维护，由华为和 Ascend 社区贡献，代码质量由社区保证</li>
        <li><strong>完全复用调度逻辑</strong>：Scheduler、KVCacheManager、BlockPool 等核心模块完全复用 vLLM，插件只替换硬件执行层</li>
        <li><strong>操作系统限制</strong>：推荐 openEuler（华为优化），Ubuntu 22.04 也可用但需额外配置驱动</li>
      </ol>

      <Callout type="info">
        <strong>分支策略：</strong><code>main</code> 分支跟踪 vLLM main 分支持续集成，<code>releases/vX.Y.Z</code> 分支对应 vLLM 各发布版本。
        使用时必须确保 vLLM 和 vLLM-Ascend 版本一致。
      </Callout>

      <ResourceTable resources={[
          { name: 'vLLM-Ascend GitHub', url: 'https://github.com/vllm-project/vllm-ascend', desc: 'vLLM-Ascend 官方仓库，华为昇腾 NPU 硬件可插拔插件' },
          { name: '昇腾社区', url: 'https://www.hiascend.com', desc: '华为昇腾 AI 官方社区，CANN 软件栈与 Ascend NPU 开发文档' },
          { name: 'Docker 镜像', url: 'https://quay.io/ascend/vllm-ascend', desc: 'vLLM-Ascend 官方 Docker 镜像，预装 CANN 与 vLLM 环境' },
          { name: 'vLLM 硬件可插拔 RFC', url: 'https://github.com/vllm-project/vllm/issues/12345', desc: 'vLLM 社区硬件可插拔接口设计文档' },
          { name: 'CANN 开发文档', url: 'https://www.hiascend.com/document/detail/zh/canncommercial/800/', desc: 'CANN 算子开发指南、Ascend C 编程指南' },
          { name: 'TorchNPU 文档', url: 'https://gitee.com/ascend/pytorch', desc: 'PyTorch NPU 后端文档，算子映射与使用方法' },
          { name: 'PagedAttention 论文', url: 'https://arxiv.org/abs/2309.06180', desc: 'PagedAttention 原始论文，KV Cache 分页管理的理论基础' },
          { name: 'Transformer 原始论文', url: 'https://arxiv.org/abs/1706.03762', desc: '"Attention Is All You Need"，Attention 机制的奠基之作' },
        ]} />
    </div>
  );
}