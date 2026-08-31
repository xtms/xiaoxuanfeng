import { ExternalLink, ResourceTable } from '../components/CodeBlock';

export function InfraTechPage() {
  return (
    <div className="prose max-w-none">
      <h1>InfraTech</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 10 分钟</span>
        <span className="page-meta-item">🏷️ AI Infra · Notebook · 资料</span>
      </div>
      <p>
        本仓库主要介绍 AI Infra 领域相关知识，内容涵盖：<strong>训练/推理框架🧩、性能加速🚀、深度学习🧠、基础硬件🔧</strong>等。
      </p>
      <p>
        相关练习代码采用 Python 语言，以 notebook 形式呈现，帮助读者快速了解或掌握相关内容。
      </p>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://github.com/xtms/InfraTech" label="GitHub" />
        <ExternalLink href="https://www.zhihu.com/people/xky7" label="作者知乎" />
      </div>

      <div className="section-divider"><span>主要文件</span></div>
      <ul>
        <li><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>llm_infer</code></a> — 推理练习</li>
        <li><a href="https://github.com/xtms/InfraTech/tree/main/models" target="_blank" rel="noreferrer"><code>models</code></a> — 主流模型介绍</li>
        <li><a href="https://github.com/xtms/InfraTech/tree/main/docs" target="_blank" rel="noreferrer"><code>docs</code></a> — AI Infra 共享资料</li>
      </ul>

      {/* ==================== 练习 Notebook ==================== */}
      <div className="section-divider"><span>练习 Notebook</span></div>
      <table>
        <thead><tr><th>文件名</th><th>知识分类</th><th style={{ width: '50%' }}>说明</th><th>难度</th></tr></thead>
        <tbody>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/deepseek_v3" target="_blank" rel="noreferrer"><code>MLA_diff_mode_mfu_calculation.ipynb</code></a></td><td>Attention</td><td><a href="https://zhuanlan.zhihu.com/p/1948769945132470860" target="_blank" rel="noreferrer">超细图解MLA计算流&吸收矩阵对比分析</a></td><td>⚡️⚡️⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/blob/main/models/modules/rope_principle.ipynb" target="_blank" rel="noreferrer"><code>rope_principle.ipynb</code></a></td><td>Attention</td><td><a href="https://zhuanlan.zhihu.com/p/2023493768003724514" target="_blank" rel="noreferrer">彻底搞懂RoPE计算原理：从1D到3D</a></td><td>⚡️⚡️⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/deeplearning_framework" target="_blank" rel="noreferrer"><code>collective_operations.ipynb</code></a></td><td>分布式基础</td><td><a href="https://zhuanlan.zhihu.com/p/2006011081177457311" target="_blank" rel="noreferrer">分布式训练/推理基础：集合通信原理与实践</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>chunked_prefill_and_flash_decoding.ipynb</code></a></td><td>推理基础</td><td><a href="https://zhuanlan.zhihu.com/p/1988996116017086993" target="_blank" rel="noreferrer">ChunkedPrefill&FlashDecoding原理详解</a></td><td>⚡️⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>attention_mla_flops_with_prefix_cache.ipynb</code></a></td><td>推理基础</td><td><a href="https://zhuanlan.zhihu.com/p/1896927732027335111" target="_blank" rel="noreferrer">prefix cache为何零开销</a></td><td>⚡️⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>parallel_strategies.ipynb</code></a></td><td>并行推理</td><td><a href="https://zhuanlan.zhihu.com/p/2003423046342554380" target="_blank" rel="noreferrer">大模型推理并行策略(DP/TP/PP/SP/EP)原理简介</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>ulysses_mha_demo.ipynb</code></a></td><td>并行推理</td><td><a href="https://zhuanlan.zhihu.com/p/1995776941110878482" target="_blank" rel="noreferrer">推理Ulysses并行优化</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>LLM_sampling.ipynb</code></a></td><td>推理基础</td><td><a href="https://zhuanlan.zhihu.com/p/1981752176578667658" target="_blank" rel="noreferrer">LLM推理采样(Sampling)</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>speculative_decoding.ipynb</code></a></td><td>推理基础</td><td><a href="https://zhuanlan.zhihu.com/p/1978037808544370747" target="_blank" rel="noreferrer">投机推理的原理与常见方案</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>dflash_dspark_principle.ipynb</code></a></td><td>推理基础</td><td><a href="https://zhuanlan.zhihu.com/p/2069029506447417522" target="_blank" rel="noreferrer">快速理解并行投机解码(DFlash/DSpark)</a></td><td>⚡️⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>zmq_practice.ipynb</code></a></td><td>推理基础</td><td>—</td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/CalvinXKY/BasicCUDA/blob/master/triton/nondeterministic_reduction.ipynb" target="_blank" rel="noreferrer"><code>nondeterministic_reduction.ipynb</code></a></td><td>推理基础</td><td><a href="https://zhuanlan.zhihu.com/p/1997403964413608619" target="_blank" rel="noreferrer">推理的非确定性运算</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>kv_cache_transfer_vs_recomputation.ipynb</code></a></td><td>推理基础</td><td><a href="https://www.zhihu.com/question/1954115162412942829/answer/1964780161137381481" target="_blank" rel="noreferrer">KV cache用池化的数据会比重算更快吗？</a></td><td>⚡️⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>linear_attention_kv_cache_size.ipynb</code></a></td><td>推理基础</td><td><a href="https://www.zhihu.com/question/1974064489159730057/answer/1974067690864928547" target="_blank" rel="noreferrer">LinearAttention在KV cache的存储上有多大优势？</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>quantization.ipynb</code></a></td><td>推理基础</td><td><a href="https://zhuanlan.zhihu.com/p/2005335401469083798" target="_blank" rel="noreferrer">大模型推理量化(Quantization)基础速览</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>nano_vllm.ipynb</code></a></td><td>Nano-vLLM</td><td><a href="https://zhuanlan.zhihu.com/p/2008285806222132143" target="_blank" rel="noreferrer">推理框架极简入门：用Nano-vLLM搭建知识体系</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>vllm_basic_scheduler.ipynb</code></a></td><td>vLLM</td><td><a href="https://zhuanlan.zhihu.com/p/1988193790129902960" target="_blank" rel="noreferrer">手搓一个基础调度器</a></td><td>⚡️⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>sglang_radix_attention.ipynb</code></a></td><td>SGLang</td><td><a href="https://zhuanlan.zhihu.com/p/1994495318197305400" target="_blank" rel="noreferrer">手撕RadixAttention</a></td><td>⚡️⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>sglang_profiling_from_scratch.ipynb</code></a></td><td>SGLang</td><td><a href="https://zhuanlan.zhihu.com/p/2004605638760763526" target="_blank" rel="noreferrer">SGLang Profiling数据采集与分析入门</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>vllm_mem_snapshot.ipynb</code></a></td><td>vLLM</td><td><a href="https://zhuanlan.zhihu.com/p/1916529253169734444" target="_blank" rel="noreferrer">vLLM显存可视化与管理详解</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>switch_role_update_weights.ipynb</code></a></td><td>SGLang/vLLM</td><td><a href="https://zhuanlan.zhihu.com/p/2002748926185469778" target="_blank" rel="noreferrer">降低RL训推共卡开销：SGLang/vLLM的无缝切换实现与分析</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer"><code>cuda_graph.ipynb</code></a></td><td>扩展知识</td><td><a href="https://www.zhihu.com/question/7987565201/answer/2012589977544991690" target="_blank" rel="noreferrer">vLLM为什么没在prefill阶段支持cuda graph？</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/multi_lora" target="_blank" rel="noreferrer"><code>LoRA_to_Multi_LoRA.ipynb</code></a></td><td>训推基础</td><td><a href="https://zhuanlan.zhihu.com/p/1984729458444363168" target="_blank" rel="noreferrer">从LoRA到Multi-LoRA</a></td><td>⚡️⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/deeplearning_framework" target="_blank" rel="noreferrer"><code>mini_dl_framework.ipynb</code></a></td><td>训练框架</td><td><a href="https://zhuanlan.zhihu.com/p/1988895482320266895" target="_blank" rel="noreferrer">从零实现MLP训练全流程</a></td><td>⚡️⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/pytorch_vista" target="_blank" rel="noreferrer"><code>pytorch_vista_deepseekV3.ipynb</code></a></td><td>PyTorch</td><td><a href="https://zhuanlan.zhihu.com/p/1977414887736112704" target="_blank" rel="noreferrer">PyTorch结构可视化</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/blob/main/deeplearning_framework/torch_process_share_tensor.ipynb" target="_blank" rel="noreferrer"><code>torch_process_share_tensor.ipynb</code></a></td><td>PyTorch</td><td><a href="https://zhuanlan.zhihu.com/p/2019510762004050171" target="_blank" rel="noreferrer">PyTorch中基于CUDA IPC的进程间Tensor共享简介</a></td><td>⚡️</td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/rl" target="_blank" rel="noreferrer"><code>training_infer_colocate.ipynb</code></a></td><td>RL基础</td><td><a href="https://zhuanlan.zhihu.com/p/2028552054742763264" target="_blank" rel="noreferrer">RL训推调度与切换（Megatron⇄SGLang）机制解析</a></td><td>⚡️</td></tr>
        </tbody>
      </table>

      {/* ==================== 推理基础知识与框架 ==================== */}
      <div className="section-divider"><span>推理基础知识与框架</span></div>
      <table>
        <thead><tr><th>文章</th><th>知识分类</th><th>备注</th></tr></thead>
        <tbody>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1983137653336585901" target="_blank" rel="noreferrer">入门知识：大模型推理核心概念与术语总结</a></td><td>推理基础</td><td>🔥🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2003423046342554380" target="_blank" rel="noreferrer">大模型推理并行策略(DP/TP/PP/SP/EP)原理简介</a></td><td>推理基础</td><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1937449564509545940" target="_blank" rel="noreferrer">LLM推理并行优化的必备知识</a></td><td>推理基础</td><td>🔥🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1984729458444363168" target="_blank" rel="noreferrer">从LoRA到Multi-LoRA：原理&代码实践</a></td><td>推理基础</td><td><a href="https://github.com/xtms/InfraTech/tree/main/multi_lora" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1988996116017086993" target="_blank" rel="noreferrer">ChunkedPrefill&FlashDecoding原理详解</a></td><td>推理基础</td><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1981752176578667658" target="_blank" rel="noreferrer">LLM推理采样(Sampling)常见知识概览</a></td><td>推理基础</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1978037808544370747" target="_blank" rel="noreferrer">Speculative Decoding投机推理的原理与常见方案</a></td><td>推理基础</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1997403964413608619" target="_blank" rel="noreferrer">推理的非确定性运算</a></td><td>推理基础</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2005335401469083798" target="_blank" rel="noreferrer">大模型推理量化(Quantization)基础速览</a></td><td>推理基础</td><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2010638958783131701" target="_blank" rel="noreferrer">Nano-vLLM架构介绍</a></td><td>Nano-vLLM</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2008285806222132143" target="_blank" rel="noreferrer">推理框架极简入门：用Nano-vLLM搭建知识体系</a></td><td>Nano-vLLM</td><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1984742841528902530" target="_blank" rel="noreferrer">vLLM(一)：vLLM框架快速入门引导</a></td><td>vLLM</td><td>🔥🔥🔥🚀</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1988193790129902960" target="_blank" rel="noreferrer">vLLM(二)：手搓一个基础调度器</a></td><td>vLLM</td><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1986026310913528033" target="_blank" rel="noreferrer">SGLang(一)：看不懂SGLang?先试试miniSGLang！</a></td><td>SGLang</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1994495318197305400" target="_blank" rel="noreferrer">SGLang(二)：手撕RadixAttention</a></td><td>SGLang</td><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2004605638760763526" target="_blank" rel="noreferrer">SGLang(三)：Profiling数据采集与分析入门</a></td><td>SGLang</td><td><a href="https://github.com/xtms/InfraTech/tree/main/llm_infer" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1916529253169734444" target="_blank" rel="noreferrer">vLLM(三)：vLLM显存管理详解</a></td><td>vLLM</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1954128446398633139" target="_blank" rel="noreferrer">vLLM(四)：vLLM V1 KV cache 管理机制剖析</a></td><td>vLLM</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1900957007575511876" target="_blank" rel="noreferrer">vLLM(五)：vLLM V1 Scheduler的调度逻辑&优先级分析</a></td><td>vLLM</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1894423873145004335" target="_blank" rel="noreferrer">vLLM(六)：vLLM框架V1演进分析</a></td><td>vLLM</td><td>🔥🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1896927732027335111" target="_blank" rel="noreferrer">vLLM(七)：vLLM的prefix cache为何零开销</a></td><td>vLLM</td><td>🔥🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1909265969823580330" target="_blank" rel="noreferrer">vLLM(八)：vLLM DP特性与演进方案分析</a></td><td>vLLM</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1927317160889386326" target="_blank" rel="noreferrer">vLLM(九)：LLM推理数据并行负载均衡(DPLB)浅析</a></td><td>vLLM</td><td>🔥🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1889243870430201414" target="_blank" rel="noreferrer">PD分离（一）：vLLM PD分离方案浅析</a></td><td>特性</td><td>🔥🔥🔥🚀</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1906741007606878764" target="_blank" rel="noreferrer">PD分离（二）：vLLM PD分离KV cache传递机制详解与演进分析</a></td><td>特性</td><td>🔥🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1952393747112367273" target="_blank" rel="noreferrer">AF分离：Attention与FFN分离(AFD)方案解析</a></td><td>特性</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/29963005584" target="_blank" rel="noreferrer">关键特性EPLB：MoE并行负载均衡</a></td><td>特性</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/27976368445" target="_blank" rel="noreferrer">关键特性FlashMLA：深度解析</a></td><td>特性</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2002748926185469778" target="_blank" rel="noreferrer">降低RL训推共卡开销：SGLang/vLLM的无缝切换实现与分析</a></td><td>特性</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1971883340031328850" target="_blank" rel="noreferrer">推理框架适配Kimi/QwenNext线性注意力</a></td><td>扩展知识</td><td>🔥</td></tr>
          <tr><td><a href="https://www.zhihu.com/question/1974064489159730057/answer/1974067690864928547" target="_blank" rel="noreferrer">LinearAttention在KV cache的存储上有多大优势？</a></td><td>扩展知识</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://www.zhihu.com/question/15465759171/answer/129570965681" target="_blank" rel="noreferrer">如何评价NVIDIA发布的大模型推理PD分离架构Dynamo？</a></td><td>扩展知识</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://www.zhihu.com/question/1954115162412942829/answer/1964780161137381481" target="_blank" rel="noreferrer">KV cache用池化的数据会比重算更快吗？</a></td><td>扩展知识</td><td>🔥</td></tr>
          <tr><td><a href="https://www.zhihu.com/question/7987565201/answer/2012589977544991690" target="_blank" rel="noreferrer">vLLM为什么没在prefill阶段支持cuda graph？</a></td><td>扩展知识</td><td>🔥</td></tr>
        </tbody>
      </table>

      {/* ==================== 推理提速经验分享 ==================== */}
      <div className="section-divider"><span>推理提速经验分享</span></div>
      <table>
        <thead><tr><th>文章</th><th>知识分类</th></tr></thead>
        <tbody>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1981436859470074335" target="_blank" rel="noreferrer">推理性能优化：GPU/NPU Profiling阅读引导</a></td><td>基础知识</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1937556222371946860" target="_blank" rel="noreferrer">推理性能优化：分布式推理优化思路</a></td><td>基础知识</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1946608360259577576" target="_blank" rel="noreferrer">1.5x提升: PD分离KV cache传输的实践经验</a></td><td>vLLM</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1950677392017330369" target="_blank" rel="noreferrer">1.3x提升: LLM推理优化:MLA算力均衡实践</a></td><td>vLLM</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1995776941110878482" target="_blank" rel="noreferrer">3.0x提升: 推理Ulysses并行优化与DeepSeekV3/V3.2实践</a></td><td>vLLM</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1999536171961828862" target="_blank" rel="noreferrer">1.3x提升: vLLM推理的Swap特性实践</a></td><td>vLLM</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2026227681419600454" target="_blank" rel="noreferrer">PD分离+弹性伸缩/角色切换的实践笔记</a></td><td>vLLM</td></tr>
        </tbody>
      </table>

      {/* ==================== RL框架 ==================== */}
      <div className="section-divider"><span>RL 框架</span></div>
      <table>
        <thead><tr><th>文章</th><th>知识分类</th><th>备注</th></tr></thead>
        <tbody>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2047767807237141302" target="_blank" rel="noreferrer">vime：融合slime与vLLM的RL框架</a></td><td>vime</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2050254430709272722" target="_blank" rel="noreferrer">vime×Ascend：共卡模式适配与实践</a></td><td>vime</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2052417693177864733" target="_blank" rel="noreferrer">MoE-RL训推一致性：R3原理与性能验证</a></td><td>vime</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2052871664728380768" target="_blank" rel="noreferrer">vime+MemAgent：记忆智能体的RL后训练</a></td><td>vime</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2053877694224392348" target="_blank" rel="noreferrer">教你训一个会调用工具的Agent：RL τ-bench</a></td><td>vime</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2033132330064285846" target="_blank" rel="noreferrer">Slime适配vLLM后端的实践笔记</a></td><td>slime</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2044116178860298908" target="_blank" rel="noreferrer">RL共卡权重同步：vLLM与训练框架之间的IPC实践</a></td><td>权重同步</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2055241439756525802" target="_blank" rel="noreferrer">Slime非共卡下的权重同步优化：P2P分片</a></td><td>权重同步</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1986888818738086656" target="_blank" rel="noreferrer">图解Infra视角下的强化学习性能问题(浅析)</a></td><td>RL基础</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2028552054742763264" target="_blank" rel="noreferrer">RL训推调度与切换（Megatron⇄SGLang）机制解析</a></td><td>RL基础</td><td>🔥</td></tr>
        </tbody>
      </table>

      {/* ==================== 训练框架与基础知识 ==================== */}
      <div className="section-divider"><span>训练框架与基础知识</span></div>
      <table>
        <thead><tr><th>文章</th><th>知识分类</th><th>备注</th></tr></thead>
        <tbody>
          <tr><td><a href="https://www.zhihu.com/question/1981438452038922346/answer/1988169697171100179" target="_blank" rel="noreferrer">如何快速理解PyTorch自动梯度（Autograd）的原理？</a></td><td>训练框架</td><td><a href="https://github.com/xtms/InfraTech/tree/main/deeplearning_framework" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1988895482320266895" target="_blank" rel="noreferrer">不用PyTorch从零实现MLP训练全流程</a></td><td>训练框架</td><td><a href="https://github.com/xtms/InfraTech/tree/main/deeplearning_framework" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/680769942" target="_blank" rel="noreferrer">PyTorch显存管理介绍与源码解析（一）</a></td><td>训练框架</td><td><a href="https://github.com/CalvinXKY/BasicCUDA/tree/master/pytorch/torch1.13_mem_rationale" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/681651660" target="_blank" rel="noreferrer">PyTorch显存管理介绍与源码解析（二）</a></td><td>训练框架</td><td><a href="https://github.com/CalvinXKY/BasicCUDA/tree/master/pytorch/torch1.13_mem_rationale" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/692614846" target="_blank" rel="noreferrer">PyTorch显存管理介绍与源码解析（三）</a></td><td>训练框架</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/358974461" target="_blank" rel="noreferrer">PyTorch分布式训练基础--DDP使用</a></td><td>训练框架</td><td>🔥🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/698447429" target="_blank" rel="noreferrer">Context Parallelism的原理与代码浅析</a></td><td>并行训练</td><td>🔥🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/26825649731" target="_blank" rel="noreferrer">FP8计算在模型训练中的应用</a></td><td>量化训练</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2019510762004050171" target="_blank" rel="noreferrer">PyTorch中基于CUDA IPC的进程间Tensor共享简介</a></td><td>训练框架</td><td>🔥</td></tr>
        </tbody>
      </table>

      {/* ==================== 深度学习&大模型知识 ==================== */}
      <div className="section-divider"><span>深度学习 & 大模型知识</span></div>
      <table>
        <thead><tr><th>文章</th><th>知识分类</th><th>备注</th></tr></thead>
        <tbody>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2023493768003724514" target="_blank" rel="noreferrer">彻底搞懂RoPE计算原理：从1D到3D</a></td><td>Attention</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/modules/rope_principle.ipynb" target="_blank" rel="noreferrer">代码</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2029134107490132079" target="_blank" rel="noreferrer">DeepSeekV4中RoPE设计解析</a></td><td>Attention</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1948769945132470860" target="_blank" rel="noreferrer">超细图解MLA计算流&吸收矩阵对比分析</a></td><td>Attention</td><td><a href="https://github.com/xtms/InfraTech/tree/main/deepseek_v3" target="_blank" rel="noreferrer">高清图</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1963371483985319543" target="_blank" rel="noreferrer">超细图解DSA计算流&性能对比与优化分析</a></td><td>Attention</td><td><a href="https://github.com/xtms/InfraTech/tree/main/deepseek_v3" target="_blank" rel="noreferrer">高清图</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1962162900111172920" target="_blank" rel="noreferrer">用注意力知识分析DSA的设计逻辑</a></td><td>Attention</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1969419528065773811" target="_blank" rel="noreferrer">线性注意力(LinearAttention)的原理与细节解析</a></td><td>Linear</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2023058271653602626" target="_blank" rel="noreferrer">Qwen3 VL多模态解析</a></td><td>大模型</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2018404307385500510" target="_blank" rel="noreferrer">VLM视觉-语言融合流程解析（Kimi K2.5/VL）</a></td><td>大模型</td><td>🔥</td></tr>
          <tr><td><a href="https://www.zhihu.com/question/2030963929510310856/answer/2031734018199270833" target="_blank" rel="noreferrer">DeepSeek V4 哪些亮点值得关注？</a></td><td>大模型</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/2006011081177457311" target="_blank" rel="noreferrer">分布式训练/推理基础：集合通信原理与实践</a></td><td>分布式基础</td><td><a href="https://github.com/xtms/InfraTech/tree/main/deeplearning_framework" target="_blank" rel="noreferrer">练习</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/687327516" target="_blank" rel="noreferrer">手写最基础的训练过程</a></td><td>深度学习</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/687815257" target="_blank" rel="noreferrer">梯度近似运算与雅可比(Jacobian)矩阵</a></td><td>深度学习</td><td>—</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/691126108" target="_blank" rel="noreferrer">Transformer基础模型代码实现--极简版(One-Page)</a></td><td>Transformer</td><td><a href="https://github.com/CalvinXKY/transformer_one_page" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://www.zhihu.com/question/1934742507746464833/answer/1961698275406096016" target="_blank" rel="noreferrer">Query和Key在注意力机制中为什么还要分开?</a></td><td>Transformer</td><td>🔥</td></tr>
          <tr><td><a href="https://www.zhihu.com/question/665731716/answer/1965427268001183164" target="_blank" rel="noreferrer">为什么transformer的FFN需要先升维再降维？</a></td><td>Transformer</td><td>🔥🔥</td></tr>
          <tr><td><a href="https://www.zhihu.com/question/1978396956591141184/answer/1978404558473549228" target="_blank" rel="noreferrer">为什么线性注意力中K头数小于V头数？</a></td><td>Linear</td><td>🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1991878121566279093" target="_blank" rel="noreferrer">AI模型优化的必修课：参数搜索/自动调优</a></td><td>深度学习</td><td>🔥</td></tr>
        </tbody>
      </table>

      {/* ==================== 主流大模型框架 ==================== */}
      <div className="section-divider"><span>主流大模型框架介绍</span></div>
      <table>
        <thead><tr><th>模型卡片</th><th>架构关键词</th><th>介绍</th></tr></thead>
        <tbody>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/models/deepseek_v3" target="_blank" rel="noreferrer">DeepSeek V3</a></td><td>MLA+MoE</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/deepseek_v3/README.md" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/models/kimi_k_2" target="_blank" rel="noreferrer">Kimi K2</a></td><td>MLA+MoE</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/kimi_k_2/README.md" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/models/deepseek_v3_2" target="_blank" rel="noreferrer">DeepSeek V3.2</a></td><td>MLA+DSA</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/deepseek_v3_2/README.md" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/models/kimi_k_2_5" target="_blank" rel="noreferrer">Kimi K2.5</a></td><td>MLA+MoE+MoonViT</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/kimi_k_2_5/README.md" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/models/kimi_k_3" target="_blank" rel="noreferrer">Kimi K3</a></td><td>KDA+Gated MLA+AttnRes+Stable LatentMoE</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/kimi_k_3/README.md" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/models/glm_5" target="_blank" rel="noreferrer">GLM 5</a></td><td>MLA(DSA)+MoE</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/glm_5/README.md" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/models/minimax_m_2_5" target="_blank" rel="noreferrer">MiniMax M2.5</a></td><td>GQA+MoE</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/minimax_m_2_5/README.md" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/models/qwen3_vl" target="_blank" rel="noreferrer">Qwen3-VL</a></td><td>Dense+MoE+DeepStack+Interleaved-MRoPE</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/qwen3_vl/README.md" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/models/qwen3_5" target="_blank" rel="noreferrer">Qwen3.5</a></td><td>Gated DeltaNet+Gated Attention+MoE</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/qwen3_5/README.md" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://github.com/xtms/InfraTech/tree/main/models/step_3_5_flash" target="_blank" rel="noreferrer">Step 3.5 Flash</a></td><td>GQA+SWA+MoE+MTP</td><td><a href="https://github.com/xtms/InfraTech/blob/main/models/step_3_5_flash/README.md" target="_blank" rel="noreferrer">link</a></td></tr>
        </tbody>
      </table>

      {/* ==================== 辅助工具 ==================== */}
      <div className="section-divider"><span>辅助工具</span></div>
      <table>
        <thead><tr><th>文章</th><th>知识分类</th><th>链接</th></tr></thead>
        <tbody>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/687226668" target="_blank" rel="noreferrer">LLM大模型显存计算公式与优化</a></td><td>LLM</td><td>🔥🔥🔥</td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/20401860293" target="_blank" rel="noreferrer">LLM预训练模型MFU计算器</a></td><td>LLM</td><td><a href="https://calvinxky.github.io/mfu_calculation/" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/26107304514" target="_blank" rel="noreferrer">DeepSeekV3 MFU计算工具与算式</a></td><td>LLM</td><td><a href="https://calvinxky.github.io/mfu_calculation/deepseek3mfu.html" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/677203832" target="_blank" rel="noreferrer">PyTorch显存可视化与Snapshot数据分析</a></td><td>PyTorch</td><td><a href="https://github.com/CalvinXKY/BasicCUDA/tree/master/pytorch/torch_mem_snapshot" target="_blank" rel="noreferrer">link</a></td></tr>
          <tr><td><a href="https://zhuanlan.zhihu.com/p/1977414887736112704" target="_blank" rel="noreferrer">PyTorch结构可视化：交互式DeepSeekV3计算图</a></td><td>PyTorch</td><td><a href="https://github.com/xtms/InfraTech/tree/main/pytorch_vista" target="_blank" rel="noreferrer">link</a></td></tr>
        </tbody>
      </table>

      {/* ==================== GPU 基础知识 ==================== */}
      <div className="section-divider"><span>GPU 基础知识</span></div>
      <p>
        <strong>BasicCUDA:</strong>{' '}
        <a href="https://github.com/CalvinXKY/BasicCUDA" target="_blank" rel="noreferrer">https://github.com/CalvinXKY/BasicCUDA</a>
      </p>
      <p>🎉🎉🎉 <strong>20+ 知识分享，涵盖 CUDA、NCCL、PyTorch、GPU 硬件知识</strong></p>
      <p>
        <strong>作者知乎主页：</strong>{' '}
        <a href="https://www.zhihu.com/people/xky7" target="_blank" rel="noreferrer">https://www.zhihu.com/people/xky7</a>
      </p>

      <ResourceTable resources={[
        { name: 'InfraTech GitHub', url: 'https://github.com/xtms/InfraTech', desc: 'AI Infra 知识仓库，涵盖推理/训练/深度学习/硬件，含 20+ Notebook 练习' },
        { name: 'BasicCUDA', url: 'https://github.com/CalvinXKY/BasicCUDA', desc: 'CUDA/NCCL/PyTorch/GPU 硬件基础知识，20+ 知识分享' },
        { name: '作者知乎', url: 'https://www.zhihu.com/people/xky7', desc: 'kaiyuan 知乎主页，AI Infra 领域深度文章' },
        { name: '公众号: InfraTech', url: 'https://github.com/xtms/InfraTech', desc: '学习更多 AI Infra 知识，推荐关注公众号 InfraTech' },
      ]} />
    </div>
  );
}