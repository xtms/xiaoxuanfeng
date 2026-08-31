import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, ResourceTable } from '../components/CodeBlock';

export function ComparisonPage() {
  return (
    <div className="prose max-w-none">
      <h1>🔍 框架对比</h1>
      <p>从架构设计、KV Cache 管理、调度策略、硬件支持等多个维度进行横向对比。</p>

      <h2>📊 综合对比</h2>
      <table>
        <thead><tr><th>维度</th><th>vLLM</th><th>vLLM-Ascend</th><th>nano-vLLM-NPU</th><th>SGLang</th></tr></thead>
        <tbody>
          <tr><td><strong>KV Cache</strong></td><td>PagedAttention</td><td>继承 PagedAttention</td><td>PagedAttention (block_size=16)</td><td>RadixAttention (Radix Tree)</td></tr>
          <tr><td><strong>前缀缓存</strong></td><td>自动前缀缓存 (APC)</td><td>继承 APC</td><td>基础支持</td><td>Radix Tree 自动复用</td></tr>
          <tr><td><strong>调度器</strong></td><td>Python 实现</td><td>继承 vLLM</td><td>Python (FCFS/SJF/优先级)</td><td>Rust 零开销调度器</td></tr>
          <tr><td><strong>进程架构</strong></td><td>多进程 (API + Core + Worker)</td><td>继承 vLLM</td><td>单进程</td><td>多进程 + 分离式</td></tr>
          <tr><td><strong>并行策略</strong></td><td>TP/PP/DP/EP/CP</td><td>TP/EP</td><td>TP</td><td>TP/PP/DP/EP/SP</td></tr>
          <tr><td><strong>硬件支持</strong></td><td>NVIDIA/AMD/Intel</td><td>Ascend NPU</td><td>Ascend NPU</td><td>NVIDIA/AMD/TPU/Ascend/Intel</td></tr>
          <tr><td><strong>模型支持</strong></td><td>200+ 架构</td><td>主流 Transformer/MoE</td><td>Qwen/LLaMA/MoE/VL</td><td>广泛 + 多模态</td></tr>
          <tr><td><strong>代码规模</strong></td><td>大型 (10 万行+)</td><td>中型 (5 万行+)</td><td>小型 (5 千行)</td><td>大型 (10 万行+)</td></tr>
          <tr><td><strong>学习门槛</strong></td><td>高</td><td>中</td><td>低</td><td>中高</td></tr>
          <tr><td><strong>生产部署</strong></td><td>广泛使用</td><td>华为生态</td><td>教育/实验</td><td>40 万+ GPU</td></tr>
        </tbody>
      </table>

      <h2>🧠 KV Cache 管理对比</h2>
      <MermaidDiagram chart={`
flowchart LR
  subgraph PAGE["PagedAttention (vLLM / nano-vLLM)"]
    direction TB
    P1["KV Cache 划分为固定大小 block"]
    P2["Block Table 映射逻辑→物理"]
    P3["减少碎片，支持 prefix caching"]
    P4["实现：显式调用"]
  end

  subgraph RADIX["RadixAttention (SGLang)"]
    direction TB
    R1["KV Cache 组织为 Radix Tree"]
    R2["自动检测共享前缀"]
    R3["自动复用，无需显式调用"]
    R4["实现：系统级自动"]
  end

  PAGE --- RADIX
      `} />

      <Callout type="tip">
        <strong>核心区别：</strong>PagedAttention 解决了 KV Cache 的<strong>内存碎片</strong>问题，
        RadixAttention 进一步解决了<strong>前缀共享</strong>问题。两者可以结合使用。
      </Callout>

      <h2>⚙️ 调度策略对比</h2>
      <table>
        <thead><tr><th>框架</th><th>调度算法</th><th>实现语言</th><th>特点</th></tr></thead>
        <tbody>
          <tr><td>vLLM</td><td>Continuous Batching + Chunked Prefill</td><td>Python</td><td>prefill 和 decode 混合调度</td></tr>
          <tr><td>nano-vLLM</td><td>FCFS / SJF / 优先级 / 抢占</td><td>Python</td><td>支持多种策略，适合学习对比</td></tr>
          <tr><td>SGLang</td><td>Radix 感知 + 零开销调度</td><td>Rust</td><td>前缀感知，调度开销近乎为零</td></tr>
        </tbody>
      </table>

      <h2>🔧 硬件抽象方式对比</h2>
      <table>
        <thead><tr><th>框架</th><th>抽象方式</th><th>优点</th><th>缺点</th></tr></thead>
        <tbody>
          <tr><td>vLLM</td><td>内置 CUDA/HIP 支持</td><td>代码集中，实现简单</td><td>硬件代码耦合在核心中</td></tr>
          <tr><td>vLLM-Ascend</td><td>硬件可插拔插件</td><td>解耦，不侵入核心代码</td><td>需要维护版本匹配</td></tr>
          <tr><td>nano-vLLM</td><td>直接集成 Ascend C</td><td>实现简单，易于理解</td><td>不支持多硬件</td></tr>
          <tr><td>SGLang</td><td>统一多硬件抽象</td><td>广泛硬件支持</td><td>抽象层复杂度高</td></tr>
        </tbody>
      </table>

      <h2>🎯 适用场景</h2>
      <table>
        <thead><tr><th>场景</th><th>推荐框架</th><th>原因</th></tr></thead>
        <tbody>
          <tr><td>NVIDIA GPU 生产部署</td><td>vLLM / SGLang</td><td>成熟稳定，性能优异</td></tr>
          <tr><td>华为 Ascend NPU 部署</td><td>vLLM-Ascend</td><td>官方插件，生产级支持</td></tr>
          <tr><td>学习推理框架原理</td><td>nano-vLLM</td><td>代码量小，文档完善，每模块有流程图</td></tr>
          <tr><td>多轮对话 / Agent</td><td>SGLang</td><td>RadixAttention 自动复用前缀</td></tr>
          <tr><td>MoE 大模型</td><td>vLLM / SGLang</td><td>EP 支持完善</td></tr>
          <tr><td>RL 训练推理</td><td>SGLang</td><td>原生 RL 框架集成</td></tr>
          <tr><td>结构化输出</td><td>SGLang / vLLM</td><td>JSON Schema 约束生成</td></tr>
          <tr><td>多模态模型</td><td>vLLM</td><td>200+ 架构，多模态支持完善</td></tr>
        </tbody>
      </table>

      <h2>📈 性能对比</h2>
      <p>基于 nano-vLLM 的 Qwen3-0.6B 基准测试（133,966 输出 tokens）：</p>
      <table>
        <thead><tr><th>引擎</th><th>硬件</th><th>吞吐量 (tokens/s)</th></tr></thead>
        <tbody>
          <tr><td>vLLM</td><td>GPU</td><td>1,361.84</td></tr>
          <tr><td>nano-vLLM</td><td>GPU</td><td>1,434.13</td></tr>
          <tr><td>nano-vLLM-Ascend (torch native)</td><td>Atlas A3 910C</td><td>18.66</td></tr>
          <tr><td>nano-vLLM-Ascend (图编译 + 融合算子)</td><td>Atlas A3 910C</td><td>3,954.20</td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>注意：</strong>NPU 上必须启用图编译和融合算子。Python torch native 模式性能极低（18.66 tokens/s），
        而启用优化后可达 3,954 tokens/s，说明 NPU 的算子融合和图编译对性能至关重要。
      </Callout>

      <h2>🧩 技术栈对比</h2>
      <MermaidDiagram chart={`
flowchart TB
  subgraph VLLM_STACK["vLLM 技术栈"]
    V1["Python"] --> V2["CUDA / HIP Kernels"]
    V2 --> V3["NVIDIA / AMD GPU"]
  end

  subgraph ASCEND_STACK["vLLM-Ascend 技术栈"]
    A1["Python"] --> A2["CANN Kernels"]
    A2 --> A3["TorchNPU"]
    A3 --> A4["Ascend NPU"]
  end

  subgraph NANO_STACK["nano-vLLM 技术栈"]
    N1["Python"] --> N2["torch_npu"]
    N1 --> N3["torchair 图编译"]
    N1 --> N4["Ascend C 自定义算子"]
    N2 --> N5["Ascend NPU"]
    N3 --> N5
    N4 --> N5
  end

  subgraph SGLANG_STACK["SGLang 技术栈"]
    S1["Python"] --> S2["Rust 调度器"]
    S1 --> S3["CUDA / ROCm / CANN"]
    S2 --> S4["NVIDIA / AMD / Ascend / TPU"]
    S3 --> S4
  end
      `} />

      <ResourceTable resources={[
          { name: 'PagedAttention 论文 (SOSP 2023)', url: 'https://arxiv.org/abs/2309.06180', desc: 'PagedAttention 原始论文，KV Cache 分页管理的理论基础' },
          { name: 'vLLM 文档', url: 'https://docs.vllm.ai', desc: 'vLLM 官方文档，PagedAttention 与 Continuous Batching 的完整讲解' },
          { name: 'SGLang 文档', url: 'https://docs.sglang.io', desc: 'SGLang 官方文档，RadixAttention 与零开销调度器的详细说明' },
          { name: 'Transformer 原始论文', url: 'https://arxiv.org/abs/1706.03762', desc: '"Attention Is All You Need"，Attention 机制的奠基之作' },
          { name: 'The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/', desc: 'Jay Alammar 经典可视化图解，直观理解 Q/K/V 与多头注意力' },
          { name: 'nanoGPT', url: 'https://github.com/karpathy/nanoGPT', desc: 'Andrej Karpathy 极简 GPT 训练/推理实现，快速理解完整流程' },
          { name: 'HuggingFace Transformers', url: 'https://github.com/huggingface/transformers', desc: '最流行的生产级 Transformer 库，BERT/GPT/Llama 等完整实现' },
        ]} />
    </div>
  );
}