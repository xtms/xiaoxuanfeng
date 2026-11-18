import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, ExternalLink, ResourceTable } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

/**
 * nanovllm2deepinfer — 从 nano-vllm 一个 PR 一个 PR 搓成 DeepInfer 的学习路线整合页。
 * 内容依据仓库 doc/ 下 34 节文档与路线图整理，每节链接到原文，可对照学习。
 */
const DOC = 'https://github.com/justkyriecai/nanovllm2deepinfer/blob/main';

export function Nanovllm2DeepinferPage() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="nanovllm2deepinfer — 从 nano-vLLM 到 DeepInfer 的学习路线"
        date="更新于 2026-10"
        readingTime="阅读约 20 分钟"
        tags={['DeepInfer', '学习路线', '推理引擎', '源码分析']}
      />

      <p>
        <a href="https://github.com/justkyriecai/nanovllm2deepinfer" target="_blank" rel="noreferrer">
          <strong>nanovllm2deepinfer</strong>
        </a>
        是个人学习项目（与 DeepSeek 官方无关联）：从 <strong>nano-vllm</strong>（1.4k 行 Python）出发，
        一个 PR 一个 PR 把它改成 <strong>DeepInfer</strong>（DeepSeek 生产推理引擎开源版，约 46k 行 Python
        + 6k 行 C++ + 2 万多行 kernel），<strong>边学边做</strong>，弄清推理引擎的 why 和 how。
      </p>
      <p>
        两端的差距被拆成 <strong>34 节增量 PR</strong>（第 1–5 章，文档已完成 34/34；第 6 章系统层可选）。
        每一节：先用实验把瓶颈在当前代码上<strong>复现</strong> → 追问本质 → 对照 DeepInfer 的做法自己动手解决
        → 用同一个实验<strong>验收</strong>。做完一节，下一个瓶颈自己浮出来。
      </p>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://github.com/justkyriecai/nanovllm2deepinfer" label="仓库" />
        <ExternalLink href={`${DOC}/doc/README.md`} label="完整路线图" />
        <ExternalLink href={`${DOC}/doc/deepinfer-map.md`} label="DeepInfer 架构地图" />
        <ExternalLink href="https://github.com/GeeeekExplorer/nano-vllm" label="nano-vLLM" />
        <ExternalLink href="https://github.com/deepseek-ai/DeepInfer" label="DeepInfer" />
      </div>

      <Callout type="info" title="它会带你学到什么">
        引擎控制面（请求状态机、P/D 交替、抢占、fork/COW、对象池、C++ 调度器、ZOS 零开销异步调度）· 解码加速
        （投机解码、变长验证、CUDA graph 分桶、batch-invariant）· KV 与显存（paged block + state 槽位、7 种 cache
        共存、FP4/FP8 布局）· DeepSeek-V4.1-Flash 每个组件（MLA 压缩 KV、稀疏 indexer、SWA 环、YoCo、mHC、
        engram、Mega MoE、DFlash）· 分布式（DP attention + EP MoE、DeepEP、EPLB、zigzag CP、P/D 引擎拆分）。
      </Callout>

      {/* ==================== 学习路径依赖图 ==================== */}
      <div className="section-divider"><span>学习路径依赖图</span></div>
      <p>34 节按依赖组织；第 4 章（B200）与第 5 章（8×H100）可交错进行，谁先租到卡先做谁。</p>
      <MermaidDiagram chart={`
flowchart LR
  subgraph C1["1 地基"]
    S11["1.1 观测与正确性"]
  end
  subgraph C2["2 引擎控制面"]
    S21["2.1 请求状态机"] --> S22["2.2 prefill/decode 交替"]
    S22 --> S23["2.3 抢占"]
    S23 --> S25["2.5 CPU 开销与对象池"]
    S25 --> S26["2.6 调度器下沉 C++"]
    S26 --> S27["2.7 ZOS"]
    S27 --> S28["2.8 投机解码"]
    S28 --> S29["2.9 变长验证"]
    S27 --> S210["2.10 采样器"]
    S210 --> S211["2.11 结构化输出"]
    S210 --> S212["2.12 batch-invariant"]
    S21 -.-> S24["2.4 fork 与 COW"]
  end
  subgraph C3["3 MLA + MoE"]
    S31["3.1 MLA"] --> S32["3.2 MoE"] --> S33["3.3 FP8"]
  end
  subgraph C4["4 V4.1-Flash 逐层"]
    S41["4.1 多 cache 共存"] --> S42["4.2 SWA 环"] --> S43["4.3 压缩 KV"] --> S44["4.4 稀疏 indexer"] --> S45["4.5 YoCo"]
    S44 --> S46["4.6 跨层共享"] --> S47["4.7 mHC"] --> S48["4.8 engram"]
    S44 --> S49["4.9 Mega MoE"] --> S410["4.10 DFlash"] --> S411["4.11 自己写 kernel"]
  end
  subgraph C5["5 分布式"]
    S51["5.1 DP + EP"] --> S52["5.2 DeepEP"] --> S53["5.3 DP 步型一致"] --> S54["5.4 EPLB"]
    S53 --> S55["5.5 CP"]
    S54 --> S55
    S55 --> S56["5.6 引擎类型与 PD 接缝"]
    S411 --> S57["5.7 V4.1-Flash 全模型"]
    S56 --> S57
  end
  S11 --> S21
  S25 --> S31
  S33 --> S41
  S33 --> S51
  S48 --> S57
  S57 --> S61["6 系统层(可选)"]
  style S57 fill:#ffe08a
  style S61 fill:#c8d6e5,stroke-dasharray: 4 3
      `} />

      {/* ==================== 七条差距轴 ==================== */}
      <div className="section-divider"><span>七条差距轴：nano-vllm 与 DeepInfer 差在哪</span></div>
      <p>仓库先把两个代码库逐文件对照，把差距归成七条轴，路线上的每一步都落在其中一条轴上。</p>
      <table className="my-5">
        <thead><tr><th>轴</th><th>nano-vllm</th><th>DeepInfer</th><th>背后的瓶颈</th></tr></thead>
        <tbody>
          <tr><td>1 调度与请求状态机</td><td>3 状态、2 队列；waiting 非空先 prefill；victim 取队尾</td><td>10 种结束原因；waiting/prompted/running 三队列；NEVER/LATER；decode 每 70 步才投票插 prefill；fork+COW</td><td>生产流量的请求形态</td></tr>
          <tr><td>2 每步执行模型</td><td>schedule→run→.tolist()→postprocess 全同步</td><td>每步只同步一次（sample_end_evt），post-process 延后一步；CPU 乐观调度+GPU 修正；C++ 调度器、对象池、forbid_cuda_sync</td><td>GPU 每步只剩几毫秒，CPU 成瓶颈</td></tr>
          <tr><td>3 解码加速</td><td>每步 1 token</td><td>DFlash 5 个 draft token、融合拒绝采样、置信度变长验证、按 total_q 分桶的 CUDA graph</td><td>访存瓶颈下算力有富余</td></tr>
          <tr><td>4 KV 与显存</td><td>一个 bf16 大张量；refcount block；hash 链前缀缓存</td><td>两种分配器（paged block + 每序列 state 槽位）；7 种 cache 共存；FP4/FP8 字节布局；跨层别名零开销</td><td>长上下文下的 HBM 容量</td></tr>
          <tr><td>5 模型</td><td>Qwen3 dense、GQA、flash-attn</td><td>V4.1：MLA 单 KV 头、压缩比 1/2 + fp32 状态环、FP4 稀疏 indexer、SWA 环、YoCo、mHC、engram、Mega MoE</td><td>每个组件回应一个具体瓶颈</td></tr>
          <tr><td>6 分布式</td><td>TP + shm pickle RPC</td><td>无 TP；DP attention + EP MoE；zigzag CP；gloo 默认、NCCL 只在子组；DP 投票保持步型一致；EPLB；SM 分区</td><td>Wide-EP 要求所有 rank 每步同型</td></tr>
          <tr><td>7 采样与确定性</td><td>temperature + gumbel argmax</td><td>fp32 logits GEMM、强制 top-k、融合采样、按 (seq_seed, position) 的哈希 RNG、SO 位掩码、batch-invariant</td><td>训推一致、可回放</td></tr>
        </tbody>
      </table>

      {/* ==================== 章节路线图 ==================== */}
      <div className="section-divider"><span>34 节路线图</span></div>
      <p>每节的格式：<strong>现象</strong>（怎么发现）→ 本质 → DeepInfer 的解法 → 验收。以下每节可点击直达原文。</p>

      <h3>第 1 章 地基（任意 GPU，Modal L4）</h3>
      <table className="my-5">
        <thead><tr><th>节</th><th>主题</th><th>解决的核心问题</th></tr></thead>
        <tbody>
          <tr><td><a href={`${DOC}/doc/1.1-观测与正确性.md`} target="_blank" rel="noreferrer">1.1</a></td><td>观测与正确性</td><td>看不见就发现不了问题；判不了对错就不敢改——建立固定负载场景、TTFT/TBT 分布、每步耗时拆分与 HF 裁判的黄金文件</td></tr>
        </tbody>
      </table>

      <h3>第 2 章 引擎控制面（1×H100，Qwen3-8B）→ P1 引擎对齐</h3>
      <table className="my-5">
        <thead><tr><th>节</th><th>主题</th><th>解决的核心问题</th></tr></thead>
        <tbody>
          <tr><td><a href={`${DOC}/doc/2.1-请求状态机.md`} target="_blank" rel="noreferrer">2.1</a></td><td>请求状态机</td><td>资源判断没有"永远放不下"；NEVER/LATER、10 种 SequenceStatus、abort 延迟清理</td></tr>
          <tr><td><a href={`${DOC}/doc/2.2-prefill-decode交替.md`} target="_blank" rel="noreferrer">2.2</a></td><td>prefill/decode 交替</td><td>长短混合负载下 TBT p99 周期性尖刺（generation stall）；decode 每 70 步一个 prefill 投票点</td></tr>
          <tr><td><a href={`${DOC}/doc/2.3-抢占.md`} target="_blank" rel="noreferrer">2.3</a></td><td>抢占</td><td>victim 选择与抢占方式没考虑重算代价；按输出长度踢最长的</td></tr>
          <tr><td><a href={`${DOC}/doc/2.4-fork与COW.md`} target="_blank" rel="noreferrer">2.4</a></td><td>fork 与 COW</td><td>n=4 采样同一 prompt 被 prefill 4 次；子序列共享父 block_table，只克隆尾部半块</td></tr>
          <tr><td><a href={`${DOC}/doc/2.5-CPU开销与对象池.md`} target="_blank" rel="noreferrer">2.5</a></td><td>CPU 开销与对象池</td><td>每步 Python 建对象开销和 GPU 时间同量级；pinned buffer、SequenceMetadataPool、DeferredRelease</td></tr>
          <tr><td><a href={`${DOC}/doc/2.6-调度器下沉C%2B%2B.md`} target="_blank" rel="noreferrer">2.6</a></td><td>调度器下沉 C++</td><td>解释器开销随 batch 线性涨；scheduler.hpp + pybind，持锁时释放 GIL</td></tr>
          <tr><td><a href={`${DOC}/doc/2.7-ZOS.md`} target="_blank" rel="noreferrer">2.7</a></td><td>ZOS 零开销异步调度</td><td>schedule(N+1) 在 process_outputs(N) 前跑，Sequence 滞后一步；每步唯一一次 CPU-GPU 同步</td></tr>
          <tr><td><a href={`${DOC}/doc/2.8-投机解码.md`} target="_blank" rel="noreferrer">2.8</a></td><td>投机解码（EAGLE-3）</td><td>每步只产 1 token；MTP 槽位 + 融合拒绝采样，draft 走独立 CUDA graph</td></tr>
          <tr><td><a href={`${DOC}/doc/2.9-变长验证.md`} target="_blank" rel="noreferrer">2.9</a></td><td>变长验证</td><td>按接受率分配 seqlens_q，最大化期望 token/步耗时；GPU 再按置信度重分</td></tr>
          <tr><td><a href={`${DOC}/doc/2.10-采样器.md`} target="_blank" rel="noreferrer">2.10</a></td><td>采样器</td><td>counter-based RNG 按 (seq_seed, position, tag) 取数，确定性可回放</td></tr>
          <tr><td><a href={`${DOC}/doc/2.11-结构化输出.md`} target="_blank" rel="noreferrer">2.11</a></td><td>结构化输出</td><td>SO 请求先异步编译 grammar；位掩码在 CPU 按 draft 步填、kernel 内应用</td></tr>
          <tr><td><a href={`${DOC}/doc/2.12-batch-invariant.md`} target="_blank" rel="noreferrer">2.12</a></td><td>batch-invariant</td><td>逐位相等黄金文件的必要条件；deep_gemm / FlashMLA 确定性算法开关</td></tr>
        </tbody>
      </table>

      <h3>第 3 章 MLA + MoE（1×H100，DeepSeek-V2-Lite）</h3>
      <table className="my-5">
        <thead><tr><th>节</th><th>主题</th><th>解决的核心问题</th></tr></thead>
        <tbody>
          <tr><td><a href={`${DOC}/doc/3.1-MLA.md`} target="_blank" rel="noreferrer">3.1</a></td><td>MLA</td><td>KV 按 MHA 展开每 token 332 KB，batch 开不起来；KV cache 只存 latent（576 个数），decode 不展开——10.7 倍压缩</td></tr>
          <tr><td><a href={`${DOC}/doc/3.2-MoE.md`} target="_blank" rel="noreferrer">3.2</a></td><td>MoE</td><td>dense MLP 每 token 全算；专家并行、gate 路由、负载不均</td></tr>
          <tr><td><a href={`${DOC}/doc/3.3-FP8.md`} target="_blank" rel="noreferrer">3.3</a></td><td>FP8</td><td>权重大小与带宽；DeepGEMM FP8 GEMM 与精度管理</td></tr>
        </tbody>
      </table>

      <h3>第 4 章 V4.1-Flash 逐层（1×B200）→ P2 模型对齐</h3>
      <table className="my-5">
        <thead><tr><th>节</th><th>主题</th><th>解决的核心问题</th></tr></thead>
        <tbody>
          <tr><td><a href={`${DOC}/doc/4.1-多cache共存.md`} target="_blank" rel="noreferrer">4.1</a></td><td>多 cache 共存</td><td>主压缩 KV / indexer K / SWA 环 / 压缩状态等 7 种 cache 的字节布局；paged block + state 槽位两种分配器</td></tr>
          <tr><td><a href={`${DOC}/doc/4.2-SWA环与sink.md`} target="_blank" rel="noreferrer">4.2</a></td><td>SWA 环 + sink</td><td>滑窗注意力 + per-head sink 的环形 buffer（134 = 128 窗口 + 6 回滚）</td></tr>
          <tr><td><a href={`${DOC}/doc/4.3-压缩KV.md`} target="_blank" rel="noreferrer">4.3</a></td><td>MLA 压缩 KV</td><td>压缩比 2 的门控累加进 ca_state 环，跨 chunk 和回滚都能续</td></tr>
          <tr><td><a href={`${DOC}/doc/4.4-稀疏indexer.md`} target="_blank" rel="noreferrer">4.4</a></td><td>稀疏 indexer</td><td>index-K FP4 + DeepSelect topk，candidate block 两级稀疏</td></tr>
          <tr><td><a href={`${DOC}/doc/4.5-YoCo.md`} target="_blank" rel="noreferrer">4.5</a></td><td>YoCo + bounded replay</td><td>consumer 层 KV 从第一个 consumer 层 hidden 投影；prefill 只保留最后 keep_tokens 行</td></tr>
          <tr><td><a href={`${DOC}/doc/4.6-跨层共享.md`} target="_blank" rel="noreferrer">4.6</a></td><td>跨层共享</td><td>三张映射 KV/topk/index-K 别名源层 cache，零额外显存</td></tr>
          <tr><td><a href={`${DOC}/doc/4.7-mHC.md`} target="_blank" rel="noreferrer">4.7</a></td><td>mHC</td><td>4 路残差 + Sinkhorn 混合系数；hc_lazy 融合进一次 mega_mhc</td></tr>
          <tr><td><a href={`${DOC}/doc/4.8-engram.md`} target="_blank" rel="noreferrer">4.8</a></td><td>engram</td><td>n-gram 哈希表记忆模块；DeepEP RDMA 异步 fetch，第 i 层 fetch 与前 i 层重叠</td></tr>
          <tr><td><a href={`${DOC}/doc/4.9-MegaMoE与FP4.md`} target="_blank" rel="noreferrer">4.9</a></td><td>Mega MoE + FP4 专家</td><td>一个 kernel 做 dispatch/GEMM/SwiGLU/combine；MXFP4 专家打包</td></tr>
          <tr><td><a href={`${DOC}/doc/4.10-DFlash.md`} target="_blank" rel="noreferrer">4.10</a></td><td>DFlash + 置信度头</td><td>draft 层吃 target 特征，Markov 头 + 置信度头，每步 nextn 个 draft</td></tr>
          <tr><td><a href={`${DOC}/doc/4.11-自己写kernel.md`} target="_blank" rel="noreferrer">4.11</a></td><td>自己写 kernel</td><td>把依赖的外部 kernel 逐个换成自己实现的，理解 TileLang/CUDA 层</td></tr>
        </tbody>
      </table>

      <h3>第 5 章 分布式（8×H100；5.7 用 8×B200）→ P3 系统对齐</h3>
      <table className="my-5">
        <thead><tr><th>节</th><th>主题</th><th>解决的核心问题</th></tr></thead>
        <tbody>
          <tr><td><a href={`${DOC}/doc/5.1-DP与EP.md`} target="_blank" rel="noreferrer">5.1</a></td><td>DP + EP</td><td>去掉 TP：DP attention + EP MoE，一卡一进程</td></tr>
          <tr><td><a href={`${DOC}/doc/5.2-DeepEP.md`} target="_blank" rel="noreferrer">5.2</a></td><td>DeepEP</td><td>SM 在计算和通信之间分区；userbuffer 进程级单例</td></tr>
          <tr><td><a href={`${DOC}/doc/5.3-DP步型一致.md`} target="_blank" rel="noreferrer">5.3</a></td><td>DP 步型一致</td><td>Wide-EP 要求所有 rank 每步同型；DP 投票 + 第二轮确认 + placeholder 步</td></tr>
          <tr><td><a href={`${DOC}/doc/5.4-EPLB.md`} target="_blank" rel="noreferrer">5.4</a></td><td>EPLB</td><td>专家负载不均；两阶段贪心，目标是每步峰值不是均值</td></tr>
          <tr><td><a href={`${DOC}/doc/5.5-CP.md`} target="_blank" rel="noreferrer">5.5</a></td><td>CP（zigzag）</td><td>zigzag 镜像 + 拷贝引擎 all-gather，不用 TP 的每层 allreduce</td></tr>
          <tr><td><a href={`${DOC}/doc/5.6-引擎类型与PD接缝.md`} target="_blank" rel="noreferrer">5.6</a></td><td>引擎类型与 PD 接缝</td><td>NORMAL / PROMPT / COMPLETION 三种引擎；state 拷贝为 P/D 拆分铺路</td></tr>
          <tr><td><a href={`${DOC}/doc/5.7-V4.1-Flash全模型.md`} target="_blank" rel="noreferrer">5.7</a></td><td>V4.1-Flash 全模型</td><td>期末考试：8 卡对拍 DeepInfer 自带 PPL 黄金基线</td></tr>
        </tbody>
      </table>

      <p>
        第 6 章（可选，未写）：KV 分层存储、E/P/D 服务、负载均衡、自动扩缩容、Recipe —— 面向系统层，
        <a href={`${DOC}/doc/README.md`} target="_blank" rel="noreferrer">路线图</a> 中有概要。
      </p>

      {/* ==================== 三个对齐检查点 ==================== */}
      <div className="section-divider"><span>三个对齐检查点</span></div>
      <table className="my-5">
        <thead><tr><th>检查点</th><th>时机</th><th>验收标准</th><th>硬件</th></tr></thead>
        <tbody>
          <tr><td><strong>P1 引擎对齐</strong></td><td>第 2 章结束</td><td>调度语义测试集（NEVER/LATER、70 步间隔、按输出长度抢占、inflight 计数）全过；nsys 时间线上每步只有一次 CPU-GPU 同步</td><td>1×H100</td></tr>
          <tr><td><strong>P2 模型对齐</strong></td><td>第 4 章结束</td><td>V4.1-Flash 前 N 层逐层输出与 DeepInfer 容差内一致；开 batch-invariant 时 logprob 按位一致</td><td>1×B200</td></tr>
          <tr><td><strong>P3 系统对齐</strong></td><td>第 5 章结束</td><td>8 卡逐样本 decode PPL 对上 DeepInfer 黄金基线，吞吐达到目标比例——整条路线的期末考试</td><td>8×B200</td></tr>
        </tbody>
      </table>

      {/* ==================== DeepInfer 架构地图要点 ==================== */}
      <div className="section-divider"><span>DeepInfer 架构要点（读源码前的地图）</span></div>
      <p>
        摘自 <a href={`${DOC}/doc/deepinfer-map.md`} target="_blank" rel="noreferrer">deepinfer-map.md</a>
        —— 热路径上每请求 CPU 工作全在 C++（调度、序列状态、输出构造、采样输入准备、ZOS 准备），Python 只按步编排。
      </p>
      <ul>
        <li><strong>规模</strong>：C++ 引擎 ~5.2k 行、Python 引擎 ~2.0k 行、worker ~2.8k 行、V4 模型 ~6.2k 行、TileLang kernel ~23k 行。</li>
        <li><strong>每步只同步一次</strong>：`sample_end_evt.synchronize()`，放在下一步 forward 发射之后——CPU 乐观调度 + GPU 侧修正。</li>
        <li><strong>无 TP</strong>：attention 纯 DP，#DP = #EP；CP 用 zigzag 镜像 + 拷贝引擎 all-gather。</li>
        <li><strong>gloo 默认通信组</strong>，NCCL 只在子组懒初始化——控制面集合通信不能碰 CUDA stream，否则 ZOS 重叠被破坏。</li>
        <li><strong>两种分配器</strong>：paged block（128 token/块）管容量可变的 KV；每序列 state 槽位（1.2×max_num_seqs）管有界状态。</li>
        <li><strong>延迟释放到处都是</strong>：`DeferredRelease` 把释放放到 GPU 忙的时候，正确性靠流序和事件。</li>
        <li><strong>`forbid_cuda_sync` 守卫</strong>：把"forward 里不许同步"从约定变成可执行的不变量。</li>
        <li><strong>DP 投票</strong>：ALL 点每 70 步（全员有活才 prefill）、ANY 点每 100 步（兜底防饿死）、第二轮确认、placeholder 步。</li>
      </ul>

      {/* ==================== 上手 ==================== */}
      <div className="section-divider"><span>如何上手</span></div>
      <p>前置：能读几百行 Python / 会用 pytest / 知道 tensor 与 CUDA graph 大概是什么 / 读过 vLLM 论文或 nano-vllm 代码（第 1 章会补）。没有本地 GPU 也可在 Modal 上跑（按秒计费，Starter 免费额度约 $30 够做到 2.5）。</p>
      <ResourceTable resources={[
        { name: '仓库 README', url: 'https://github.com/justkyriecai/nanovllm2deepinfer', desc: '快速开始 + fork 流程；教学方式：agent 当导师、你写代码' },
        { name: '路线图 doc/README.md', url: `${DOC}/doc/README.md`, desc: '七条差距轴、设计原则、每节现象/本质/解法/验收、依赖图、架构种子' },
        { name: 'DeepInfer 架构地图', url: `${DOC}/doc/deepinfer-map.md`, desc: '读路线前的底图：进程分层、状态机、ZOS、对象池、KV 布局、V4 模型组件' },
        { name: 'LEARNERS.md', url: 'https://github.com/justkyriecai/nanovllm2deepinfer/blob/main/LEARNERS.md', desc: '一起学的人和各自进度；实现进度在 kyrie-main 分支' },
        { name: '可运行代码 nanovllm/', url: 'https://github.com/justkyriecai/nanovllm2deepinfer/tree/main/nanovllm', desc: '起点代码：sampling_params / config / llm' },
        { name: '基准与示例', url: 'https://github.com/justkyriecai/nanovllm2deepinfer/tree/main', desc: 'bench.py、example.py、scripts/modal_run.py（Modal 实验入口）' },
      ]} />

      <Callout type="tip" title="与本站内容的联动">
        本路线与本站 <a href="/vllm">vLLM</a>、<a href="/sglang">SGLang</a>、
        <a href="/nano-vllm">nano-vLLM-NPU</a>、<a href="/llm-learning">推理框架学习资料</a>、
        <a href="/deepinfer/index">DeepInfer 剖面</a>等页面互为补充：站点页面讲"现成框架是什么"，
        本路线讲"怎么一步步做出来"；<strong>DeepInfer 剖面</strong>则把现成引擎的
        调度/运行时/模型/生产逐页剖开，是本路线做题时的"参考答案地图"。
      </Callout>
    </div>
  );
}
