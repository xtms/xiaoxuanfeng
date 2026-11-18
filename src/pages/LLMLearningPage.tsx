import { Callout, ExternalLink, ResourceTable } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

/**
 * LLM 推理框架学习资料 — 分门别类整理 GitHub 上的权威仓库与论文。
 * 所有链接均经过 GitHub API 核实（2026-10），star 数为核实时的数据。
 */
export function LLMLearningPage() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="LLM 推理框架学习资料"
        date="更新于 2026-10"
        readingTime="阅读约 15 分钟"
        tags={['资料', '学习路线', 'GitHub', '论文']}
      />

      <p>
        本文分门别类整理 <strong>LLM 推理框架</strong>相关的 GitHub 学习资料与必读论文，覆盖：官方框架仓库、
        架构与源码学习笔记、KV Cache 与调度专题、推理 Kernel 与加速库、量化压缩、DeepSeek 推理生态，
        以及前沿论文。每条链接均通过 GitHub API 核实，可按需跳转学习。
      </p>

      <Callout type="tip" title="学习路线建议">
        先读 <strong>官方框架</strong>（vLLM / SGLang）源码，再结合本项目的 <strong>源码分析页面</strong>
        （vLLM 调度、SGLang 调度、KV Cache 机制等）对照理解；动手能力强的可以跟做
        <strong> nano-vLLM</strong> 手写一个最小推理引擎。最后用 <strong>论文列表</strong> 补足理论深度。
        DeepSeek 的推理栈（DeepInfer / FlashMLA / DeepGEMM / EPLB）是理解 <strong>MoE + MLA</strong> 落地的最佳范本。
      </Callout>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://github.com/xtms/InfraTech" label="作者 InfraTech 仓库" />
        <ExternalLink href="https://github.com/vllm-project/vllm" label="vLLM" />
        <ExternalLink href="https://github.com/sgl-project/sglang" label="SGLang" />
      </div>

      {/* ==================== 一、官方框架与仓库 ==================== */}
      <div className="section-divider"><span>一、官方框架与仓库</span></div>
      <p>主流 LLM 推理引擎的官方仓库。先看 README 与 docs，建立整体认知。</p>
      <ResourceTable resources={[
        { name: 'vLLM', url: 'https://github.com/vllm-project/vllm', desc: '高吞吐、显存高效的推理引擎（PagedAttention 发明者），支持 200+ 模型与 OpenAI 兼容 API' },
        { name: 'SGLang', url: 'https://github.com/sgl-project/sglang', desc: '高性能 LLM 服务框架，RadixAttention 前缀缓存 + Rust 调度器，面向结构化生成的编译器' },
        { name: 'llama.cpp', url: 'https://github.com/ggml-org/llama.cpp', desc: 'C/C++ 推理，GGUF 格式量化，本地/边缘部署首选，单仓库理解推理全流程' },
        { name: 'TensorRT-LLM', url: 'https://github.com/NVIDIA/TensorRT-LLM', desc: 'NVIDIA 官方 TensorRT 推理栈，图优化 + kernel 融合，追求极致 GPU 吞吐' },
        { name: 'Hugging Face TGI', url: 'https://github.com/huggingface/text-generation-inference', desc: 'Text Generation Inference，与 HF 生态深度集成，生产级服务方案' },
        { name: 'MLC-LLM', url: 'https://github.com/mlc-ai/mlc-llm', desc: '机器学习编译 + LLM 部署，一套代码部署到 CPU/GPU/手机/浏览器，理解推理编译优化' },
        { name: 'LMDeploy', url: 'https://github.com/InternLM/lmdeploy', desc: '书生浦语官方部署工具箱：TurboMind 高性能推理、4bit/8bit 量化、KV Cache 管理' },
        { name: 'MLX', url: 'https://github.com/ml-explore/mlx', desc: 'Apple Silicon 数组框架，含 MLX-LM 推理栈，了解统一内存下的推理设计' },
        { name: 'vLLM-Ascend', url: 'https://github.com/vllm-project/vllm-ascend', desc: 'vLLM 华为昇腾 NPU 硬件插件（CANN + TorchNPU），本项目已做源码分析' },
        { name: 'ONNX Runtime', url: 'https://github.com/microsoft/onnxruntime', desc: '跨平台高性能推理加速器，广泛用于生产部署与异构设备' },
      ]} />

      {/* ==================== 二、架构与源码学习笔记 ==================== */}
      <div className="section-divider"><span>二、架构与源码学习笔记</span></div>
      <p>从"读官方源码"到"手写一个最小推理引擎"的学习资源，是深入理解框架内部的最佳入口。</p>
      <ResourceTable resources={[
        { name: 'AIInfra 学习笔记', url: 'https://github.com/Infrasys-AI/AIInfra', desc: 'AI 基础设施系统学习笔记（李沐/李世明社区），含大模型推理、分布式训练、算子优化等章节' },
        { name: 'nano-vLLM', url: 'https://github.com/GeeeekExplorer/nano-vllm', desc: '从零手写的最小 vLLM 推理引擎，精简易读，逐步搭起调度/显存/KV Cache 知识体系' },
        { name: 'learn-nano-vllm', url: 'https://github.com/bcefghj/learn-nano-vllm', desc: 'nano-vllm 面试导向学习指南：20 节课程 + 72 道面试八股文，适合求职冲刺' },
        { name: 'nano-vllm (ovshake)', url: 'https://github.com/ovshake/nano-vllm', desc: '教育版 vLLM，带逐步解释，侧重可读性' },
        { name: 'nano-vllm-ascend', url: 'https://github.com/linzm1007/nano-vllm-ascend', desc: 'nano-vllm 的昇腾 NPU 版本，本项目 nano-vLLM-NPU 分析的参考上游' },
        { name: 'mini-deepinfer', url: 'https://github.com/AkiYangDev/mini-deepinfer', desc: '通过一个小型可运行推理引擎学习 DeepInfer：先读代码再跑真实模型，入门 DeepSeek 推理框架' },
        { name: 'deepinfer-unpacked', url: 'https://github.com/ZiyuanDu/deepinfer-unpacked', desc: '社区逐模块拆解 DeepInfer 的笔记仓库，peer-reviewed 讲解 + 文档' },
        { name: 'nanovllm2deepinfer', url: 'https://github.com/justkyriecai/nanovllm2deepinfer', desc: '从 nano-vllm 出发、一个 PR 一个 PR 搓出 DeepInfer：边学边做推理引擎的 why 和 how（本站 /nanovllm2deepinfer 有整合页）' },
        { name: 'Awesome-LLM', url: 'https://github.com/Hannibal046/Awesome-LLM', desc: '大模型资源大全（2.7w star），LLM 综述、课程、论文、推理相关链接一站汇总' },
      ]} />

      {/* ==================== 三、KV Cache 与调度专题 ==================== */}
      <div className="section-divider"><span>三、KV Cache 与调度专题</span></div>
      <p>KV Cache 池化、P/D 分离、服务调度是推理性能的关键，与本站 KV Cache / 服务调度专题互为补充。</p>
      <ResourceTable resources={[
        { name: 'Mooncake', url: 'https://github.com/kvcache-ai/Mooncake', desc: 'Kimi 的 KVCache-Centric 分离式推理平台：以 KV 为中心池化，支持 P/D 分离与弹性调度' },
        { name: 'AIBrix', url: 'https://github.com/vllm-project/aibrix', desc: 'GenAI 推理基础设施组件：KV Cache 感知的运行时路由、异构负载调度，开源企业级方案' },
        { name: 'DeepSpeed-MII', url: 'https://github.com/deepspeedai/DeepSpeed-MII', desc: 'DeepSpeed 生态低延迟高吞吐推理，Blending-Inference 引擎，快速接入主流模型' },
        { name: 'Awesome-Large-Scale-LLM-Serving', url: 'https://github.com/Ketonmi/Awesome-Large-Scale-LLM-Serving', desc: 'LLM serving 集群效率必读论文清单：连续批处理、KV 缓存、P/D 分离等经典论文合集' },
      ]} />

      {/* ==================== 四、推理 Kernel 与加速库 ==================== */}
      <div className="section-divider"><span>四、推理 Kernel 与加速库</span></div>
      <p>Attention / 集合通信等底层算子库，是理解框架性能差异的关键一层。</p>
      <ResourceTable resources={[
        { name: 'FlashAttention', url: 'https://github.com/Dao-AILab/flash-attention', desc: 'FlashAttention 系列（flash-attn 2/3），IO 感知的精确注意力，推理/训练通用加速' },
        { name: 'FlashInfer', url: 'https://github.com/flashinfer-ai/flashinfer', desc: '专为 LLM Serving 设计的 Kernel 库，paged KV cache + 注意力模板，vLLM/SGLang 核心依赖之一' },
        { name: 'Triton', url: 'https://github.com/triton-lang/triton', desc: 'Triton 语言与编译器，用 Python 写高性能 GPU kernel，FlashInfer 等的实现基础' },
        { name: 'CUTLASS', url: 'https://github.com/NVIDIA/cutlass', desc: 'CUDA 高性能线性代数模板库，理解矩阵乘法/注意力 kernel 的底层模板' },
      ]} />

      {/* ==================== 五、量化与模型压缩 ==================== */}
      <div className="section-divider"><span>五、量化与模型压缩</span></div>
      <p>推理显存与带宽瓶颈的常规解法，配合本站量化相关的推理优化内容一起看。</p>
      <ResourceTable resources={[
        { name: 'bitsandbytes', url: 'https://github.com/bitsandbytes-foundation/bitsandbytes', desc: 'k-bit 量化（8bit/4bit）训练与推理，社区使用最广的量化工具之一' },
        { name: 'AWQ (llm-awq)', url: 'https://github.com/mit-han-lab/llm-awq', desc: '激活感知权重量化，MLSys 2024 最佳论文，低成本高精度 4bit 方案' },
        { name: 'GPTQ', url: 'https://github.com/IST-DASLab/gptq', desc: '后训练量化经典方法（ICLR 2023），二阶近似最优精度' },
        { name: 'LightCompress (LLMC)', url: 'https://github.com/ModelTC/LightCompress', desc: '大模型压缩一体化工具包：量化/剪枝/蒸馏，支持 LLM/VLM/视频生成模型' },
      ]} />

      {/* ==================== 六、必读论文 ==================== */}
      <div className="section-divider"><span>六、必读论文（Papers）</span></div>
      <p>
        推理框架的技术都源自这些论文。按 <strong>渲染时序</strong>阅读：连续批处理 → PagedAttention →
        RadixAttention → P/D 分离 → 分离式池化。
      </p>
      <table className="my-5">
        <thead>
          <tr><th>论文</th><th>arXiv</th><th>核心内容</th></tr>
        </thead>
        <tbody>
          <tr><td>Orca: A Distributed Serving System for Transformer-Based Generative Models</td><td><a href="https://arxiv.org/abs/2209.15071" target="_blank" rel="noreferrer">2209.15071</a></td><td>连续批处理（iteration-level scheduling）奠基之作，OSDI 2022</td></tr>
          <tr><td>Efficient Memory Management for LLM Serving with PagedAttention</td><td><a href="https://arxiv.org/abs/2309.06180" target="_blank" rel="noreferrer">2309.06180</a></td><td>vLLM / PagedAttention，按页管理 KV 显存，SOSP 2023</td></tr>
          <tr><td>SGLang: Efficient Execution of Structured Language Model Programs</td><td><a href="https://arxiv.org/abs/2412.13189" target="_blank" rel="noreferrer">2412.13189</a></td><td>SGLang / RadixAttention，前缀树复用 + 结构化生成前端</td></tr>
          <tr><td>Splitwise: Efficient Generative LLM Inference Using Phase Splitting</td><td><a href="https://arxiv.org/abs/2311.18677" target="_blank" rel="noreferrer">2311.18677</a></td><td>Prefill/Decode 分阶段分离部署的经典方案（P/D 分离）</td></tr>
          <tr><td>DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving</td><td><a href="https://arxiv.org/abs/2401.09670" target="_blank" rel="noreferrer">2401.09670</a></td><td>SOSP 2024，按 GPU 数量粒度切分 P/D，兼顾吞吐与延迟</td></tr>
          <tr><td>Mooncake: A KVCache-centric Disaggregated Architecture for LLM Serving</td><td><a href="https://arxiv.org/abs/2407.00079" target="_blank" rel="noreferrer">2407.00079</a></td><td>以 KV Cache 为中心的分离式架构 + 池化/弹性，本站 Mooncake 分析对应</td></tr>
          <tr><td>NVIDIA Dynamo: Fused Scaling of Distributed Inference</td><td><a href="https://arxiv.org/abs/2504.19430" target="_blank" rel="noreferrer">2504.19430</a></td><td>NVIDIA 推理编排框架，融合调度实现大规模 P/D 分离与动态批处理</td></tr>
          <tr><td>DeepSeek-V3 Technical Report</td><td><a href="https://arxiv.org/abs/2412.19437" target="_blank" rel="noreferrer">2412.19437</a></td><td>MoE + 专家并行推理实践、MLA、多 token 预测，了解前沿模型的推理设计</td></tr>
          <tr><td>FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness</td><td><a href="https://arxiv.org/abs/2205.14135" target="_blank" rel="noreferrer">2205.14135</a></td><td>FlashAttention 原理，IO 感知注意力的理论源头</td></tr>
          <tr><td>FlashInfer: Efficient and Customizable Attention Engine for LLM Inference Serving</td><td><a href="https://arxiv.org/abs/2501.01082" target="_blank" rel="noreferrer">2501.01082</a></td><td>FlashInfer Kernel 库设计，paged attention 引擎的工程实现</td></tr>
        </tbody>
      </table>

      {/* ==================== 七、DeepSeek 推理生态专题 ==================== */}
      <div className="section-divider"><span>七、DeepSeek 推理生态专题</span></div>
      <p>
        DeepSeek 官方开源了<strong>高性能大规模推理框架 DeepInfer</strong>（支撑 DeepSeek 模型生产推理），
        并配套开源了 <strong>FlashMLA</strong>（MLA 解码 Kernel）、<strong>DeepGEMM</strong>（FP8 GEMM）、
        <strong>EPLB</strong>（专家并行负载均衡）等算子与调度组件，以及包含自研 FP8 推理引擎的模型仓库。
        这些是理解 <strong>MLA 解码 + MoE 专家并行</strong>落地细节的最佳源码。
      </p>
      <ResourceTable resources={[
        { name: 'DeepInfer', url: 'https://github.com/deepseek-ai/DeepInfer', desc: 'DeepSeek 官方高性能大规模推理框架（serving 引擎），支撑 DeepSeek 模型生产推理，推理框架学习首选' },
        { name: 'DeepSeek-V3', url: 'https://github.com/deepseek-ai/DeepSeek-V3', desc: '官方仓库，含 FP8 推理引擎（inference/ 目录）与训练流水，生产环境 V3 推理吞吐 545K tokens/s 的实现' },
        { name: 'FlashMLA', url: 'https://github.com/deepseek-ai/FlashMLA', desc: 'MLA 解码 Kernel（Hopper GPU），DeepSeek V3/R1 推理加速核心，理解 MLA 推理算子的首选' },
        { name: 'DeepGEMM', url: 'https://github.com/deepseek-ai/DeepGEMM', desc: 'FP8 GEMM 内核库，简洁高效的 BLAS 实现，训练/推理通用，配合 FP8 推理流程阅读' },
        { name: 'EPLB', url: 'https://github.com/deepseek-ai/EPLB', desc: '专家并行负载均衡器，处理 MoE 推理的 token 负载不均，与本站调度/EP 内容呼应' },
        { name: 'DeepSeek-R1', url: 'https://github.com/deepseek-ai/DeepSeek-R1', desc: 'R1 推理模型仓库，含推理示例与蒸馏脚本，了解推理时上下文工程与采样配置' },
        { name: 'DeepSeek-V2', url: 'https://github.com/deepseek-ai/DeepSeek-V2', desc: '最早引入 MLA + MoE 的高效模型，解读 MLA 演进历史与推理代码的起点' },
      ]} />

      <Callout type="info" title="获取最新资源">
        GitHub 仓库与 star 数据会随时间变化，建议关注官方 <code>README</code> 与
        <strong> Awesome-LLM</strong> 等清单类仓库获取持续更新的链接。
      </Callout>
    </div>
  );
}
