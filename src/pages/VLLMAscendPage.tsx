import { MermaidDiagram } from '../components/MermaidDiagram';
import { CodeBlock, Callout, ExternalLink, ResourceTable } from '../components/CodeBlock';

export function VLLMAscendPage() {
  return (
    <div className="prose max-w-none">
      <h1>vLLM-Ascend</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 10 分钟</span>
        <span className="page-meta-item">🏷️ 硬件插件 · Ascend NPU</span>
      </div>
      <p>
        vLLM-Ascend 是 vLLM 的<strong>社区维护硬件插件</strong>，通过 vLLM 的硬件可插拔接口（RFC: Hardware Pluggable），
        将 vLLM 的推理能力带到华为 Ascend NPU。它使用 CANN（Compute Architecture for Neural Networks）替代 CUDA 工具链。
      </p>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://github.com/vllm-project/vllm-ascend" label="GitHub" />
        <ExternalLink href="https://quay.io/ascend/vllm-ascend" label="Docker 镜像" />
      </div>

      <div className="section-divider"><span>架构设计</span></div>
      <p>核心设计理念：<strong>硬件可插拔（Hardware Pluggable）</strong>。Ascend 适配代码完全在独立仓库中，不与 vLLM 核心代码耦合。</p>

      <MermaidDiagram chart={`
flowchart TB
  subgraph VLLM["vLLM 核心 (vendor-agnostic)"]
    API["API Server"]
    ENGINE["LLMEngine"]
    SCHED["Scheduler"]
    BLOCK["BlockManager"]
    IFACE["Hardware Abstraction Interface"]
  end

  subgraph PLUGIN["vLLM-Ascend 插件"]
    ASCEND_IMPL["Ascend Platform Implementation"]
    ASCEND_EXEC["Ascend Executor"]
    ASCEND_WORKER["Ascend Worker"]
    ASCEND_MR["Ascend ModelRunner"]
  end

  subgraph STACK["Ascend 软件栈"]
    CANN["CANN 9.1.0<br/>(Compute Architecture)"]
    TORCHNPU["TorchNPU 2.10.0<br/>(PyTorch NPU 后端)"]
    HCCL["HCCL<br/>(集合通信)"]
  end

  subgraph HW["Ascend 硬件"]
    A2["Atlas 800I A2"]
    A3["Atlas 800I A3"]
    DUO["Atlas 300I Duo"]
  end

  API --> ENGINE --> SCHED --> BLOCK
  BLOCK --> IFACE
  IFACE --> ASCEND_IMPL
  ASCEND_IMPL --> ASCEND_EXEC --> ASCEND_WORKER --> ASCEND_MR
  ASCEND_MR --> TORCHNPU
  ASCEND_WORKER --> HCCL
  TORCHNPU --> CANN
  HCCL --> CANN
  CANN --> HW
      `} />

      <div className="section-divider"><span>软件栈对比</span></div>
      <table>
        <thead><tr><th>组件</th><th>CUDA vLLM</th><th>vLLM-Ascend</th></tr></thead>
        <tbody>
          <tr><td>计算平台</td><td>CUDA</td><td>CANN 9.1.0</td></tr>
          <tr><td>PyTorch 后端</td><td>torch.cuda</td><td>torch_npu (TorchNPU 2.10.0)</td></tr>
          <tr><td>集合通信</td><td>NCCL</td><td>HCCL</td></tr>
          <tr><td>融合算子</td><td>FlashAttention / CUTLASS</td><td>npu_fused_infer_attention_score_v2</td></tr>
          <tr><td>Python</td><td>3.8 - 3.12</td><td>3.10 - 3.12</td></tr>
        </tbody>
      </table>

      <div className="section-divider"><span>硬件可插拔接口</span></div>
      <p>vLLM 社区通过 RFC 提出了硬件可插拔接口，将硬件相关的实现抽象为接口。vLLM-Ascend 是实现这些接口的 Ascend 后端。</p>
      <CodeBlock language="python" title="插件结构" code={`vllm_ascend/
├── __init__.py          # 插件入口，注册 Ascend 平台
├── platform.py          # AscendPlatform 实现
├── attention/           # Ascend 融合注意力算子
├── quantization/        # Ascend 量化支持
├── models/              # Ascend 特定模型适配
├── ops/                 # Ascend 自定义算子
└── worker/              # Ascend Worker 实现
csrc/                    # C++/Ascend C 内核
cmake/                   # 构建配置
Dockerfile*              # 多硬件变体镜像`} />
      <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>📄 源码: <a href="https://github.com/vllm-project/vllm-ascend" target="_blank" rel="noreferrer">github.com/vllm-project/vllm-ascend</a></div>

      <div className="section-divider"><span>请求处理流程</span></div>
      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Client
    participant V as vLLM API Server
    participant E as LLMEngine
    participant S as Scheduler
    participant P as Ascend Platform
    participant W as Ascend Worker
    participant N as Ascend NPU

    C->>V: HTTP Request
    V->>E: add_request()
    E->>S: Enqueue
    S->>S: Schedule batch
    S->>P: Allocate KV blocks
    P->>P: NPU memory allocation
    S->>P: Dispatch to worker
    P->>W: Execute model
    W->>N: Forward pass (CANN kernels)
    N-->>W: Logits
    W-->>E: Results
    E-->>V: Tokens
    V-->>C: Stream response
      `} />

      <div className="section-divider"><span>仓库结构</span></div>
      <table>
        <thead><tr><th>目录</th><th>作用</th></tr></thead>
        <tbody>
          <tr><td><code>vllm_ascend/</code></td><td>Python 插件包，Ascend 特定的硬件抽象实现</td></tr>
          <tr><td><code>csrc/</code></td><td>C++ 内核和 Ascend 算子</td></tr>
          <tr><td><code>cmake/</code></td><td>构建系统集成</td></tr>
          <tr><td><code>Dockerfile*</code></td><td>多硬件变体 Docker 镜像（310p / A3 / A5 / openEuler）</td></tr>
          <tr><td><code>benchmarks/</code></td><td>性能基准测试</td></tr>
          <tr><td><code>tools/</code></td><td>工具脚本</td></tr>
        </tbody>
      </table>

      <div className="section-divider"><span>关键差异</span></div>
      <ol>
        <li><strong>解耦插件模型</strong>：Ascend 代码隔离在独立仓库，不侵入 vLLM 核心</li>
        <li><strong>CANN 替代 CUDA</strong>：所有计算内核使用华为 CANN 运行时</li>
        <li><strong>TorchNPU 替代 PyTorch CUDA</strong>：使用华为 TorchNPU 作为 PyTorch 后端</li>
        <li><strong>版本严格匹配</strong>：插件版本必须与 vLLM 版本完全相同</li>
        <li><strong>多硬件变体</strong>：不同 Dockerfile 对应不同 Ascend 硬件型号</li>
        <li><strong>社区维护</strong>：非 vLLM 核心团队维护，由 Ascend 社区贡献</li>
      </ol>

      <Callout type="info">
        <strong>分支策略：</strong><code>main</code> 分支跟踪 vLLM main 分支持续集成，<code>releases/vX.Y.Z</code> 分支对应 vLLM 各发布版本。
        使用时必须确保 vLLM 和 vLLM-Ascend 版本一致。
      </Callout>

      <ResourceTable resources={[
          { name: 'vLLM-Ascend GitHub', url: 'https://github.com/vllm-project/vllm-ascend', desc: 'vLLM-Ascend 官方仓库，华为昇腾 NPU 硬件可插拔插件' },
          { name: '昇腾社区', url: 'https://www.hiascend.com', desc: '华为昇腾 AI 官方社区，CANN 软件栈与 Ascend NPU 开发文档' },
          { name: 'Docker 镜像', url: 'https://quay.io/ascend/vllm-ascend', desc: 'vLLM-Ascend 官方 Docker 镜像，预装 CANN 与 vLLM 环境' },
          { name: 'Transformer 原始论文', url: 'https://arxiv.org/abs/1706.03762', desc: '"Attention Is All You Need"，Attention 机制的奠基之作' },
          { name: 'The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/', desc: 'Jay Alammar 经典可视化图解，直观理解 Q/K/V 与多头注意力' },
          { name: 'nanoGPT', url: 'https://github.com/karpathy/nanoGPT', desc: 'Andrej Karpathy 极简 GPT 训练/推理实现，快速理解完整流程' },
        ]} />
    </div>
  );
}