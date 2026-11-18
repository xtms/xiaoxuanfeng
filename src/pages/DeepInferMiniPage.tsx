import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, ExternalLink, ResourceTable } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

/**
 * mini-DeepInfer — 一个以 DeepInfer 执行设计为主线的教学推理引擎（Python + PyTorch，
 * Ascend 910C + Qwen3.5 实机验证）。本站整合页：整理十四课学习路径、核心对象、
 * 三种执行方式、DeepInfer 源码映射与实机验证记录，每节可点击直达原文档。
 */
const DOC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/docs';
const SRC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/minideepinfer';

export function DeepInferMiniPage() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="mini-DeepInfer — 读懂 DeepInfer，从一条请求开始"
        date="更新于 2026-10"
        readingTime="阅读约 15 分钟"
        tags={['DeepInfer', '教学引擎', 'Ascend 910C', '十四课']}
      />

      <p>
        <a href="https://github.com/AkiYangDev/mini-deepinfer" target="_blank" rel="noreferrer">
          <strong>mini-DeepInfer</strong>
        </a>
        是一个面向 <strong>Ascend 910C</strong> 的<strong>精简教学推理引擎</strong>：用清晰的 Python + PyTorch
        把请求调度、模型执行、采样和结果提交串起来，让你能顺着<strong>一条请求</strong>读懂
        <a href="https://github.com/deepseek-ai/DeepInfer" target="_blank" rel="noreferrer">DeepInfer</a>
        的源码。它不用真实权重也能跑（整数 Runner / 随机小模型演示调度与缓存），
        在 Ascend 910C 上则用 <strong>Qwen3.5-0.8B / 2B</strong> 真实权重做投机解码验证。
      </p>
      <p>
        与 <a href="/deepinfer/index">DeepInfer 剖面</a>（静态剖面图，讲"现成引擎内部长什么样"）和
        <a href="/nanovllm2deepinfer">nano-vLLM → DeepInfer</a>（增量改写出路线）不同，
        这里是一条<strong>可运行的 Python 代码路径</strong>：亲自跑、亲眼看到调度与缓存每一步的变化。
      </p>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://github.com/AkiYangDev/mini-deepinfer" label="仓库" />
        <ExternalLink href={`${DOC}/LEARNING_PATH.md`} label="十四课目录" />
        <ExternalLink href={`${DOC}/START_HERE.md`} label="运行指南" />
        <ExternalLink href={`${DOC}/SOURCE_MAP.md`} label="DeepInfer 源码映射" />
        <ExternalLink href={`${DOC}/ARCHITECTURE.md`} label="架构设计" />
      </div>

      <Callout type="info" title="先跑起来，再读代码">
        第一课不需要任何依赖或权重：<code>git clone</code> 后在仓库目录运行
        <code> python -m minideepinfer</code>，用数字运算模拟模型，打印每一步的输入、输出与槽位分配。
        然后打开 <code>demo.py</code>，从 <code>engine.submit()</code> 顺着读到
        <code>Engine.step()</code>，再对照 <a href={`${DOC}/FIRST_REQUEST.md`} target="_blank" rel="noreferrer">第一课</a>。
      </Callout>

      {/* ==================== 最小执行循环 ==================== */}
      <div className="section-divider"><span>最小执行循环</span></div>
      <p>这是整条主线的骨架（摘自 <a href={`${DOC}/ARCHITECTURE.md`} target="_blank" rel="noreferrer">架构设计</a>）——每一课都在往这条循环里加一个真实约束。</p>
      <MermaidDiagram chart={`
flowchart LR
  A["接收请求"] --> B["调度"]
  B --> C["预留缓存"]
  C --> D["准备元数据"]
  D --> E["模型计算"]
  E --> F["采样"]
  F --> G["提交进度"]
  G --> H["判断停止条件"]
  H --> I["回收资源"]
  I --> B
      `} />

      {/* ==================== 十四课学习路径 ==================== */}
      <div className="section-divider"><span>十四课学习路径</span></div>
      <p>
        主线：从<strong>单请求</strong>到<strong>批次调度</strong>，从<strong>函数返回</strong>到<strong>设备完成</strong>，
        再到<strong>跨轮分块</strong>。每课有一个要回答的问题与可运行入口；<code>verify_*</code> 默认用随机小模型，无需权重。
        十四课已转为<strong>本站原生页面</strong>（侧边栏 DeepInfer → 十四课学习路径），点课号直接在站内阅读。
      </p>
      <table className="my-5">
        <thead><tr><th>课</th><th>主题</th><th>要回答的问题</th><th>可运行入口</th></tr></thead>
        <tbody>
          <tr><td><a href="/deepinfer/lesson/1">一</a></td><td>跟踪一个请求</td><td>调度、prefill、decode、停止和回收怎样连起来？</td><td><code>python -m minideepinfer</code>（无依赖）</td></tr>
          <tr><td><a href="/deepinfer/lesson/2">二</a></td><td>真实权重与 KV Cache</td><td>整数 Runner 换成真实模型后，多了哪些状态？</td><td><code>python -m minideepinfer.generate --help</code>（需权重）</td></tr>
          <tr><td><a href="/deepinfer/lesson/3">三</a></td><td>同步批处理</td><td>多请求怎样共享一轮计算，又互不串缓存？</td><td><code>python -m minideepinfer.batch_demo</code>（无依赖）</td></tr>
          <tr><td><a href="/deepinfer/lesson/4">四</a></td><td>Qwen3.5 的两种缓存</td><td>完整注意力与 DeltaNet 分别记住什么？</td><td>Qwen3.5-2B 生成；0.8B 对照</td></tr>
          <tr><td><a href="/deepinfer/lesson/5">五</a></td><td>缓存为什么还不能还？</td><td>行号改变和取消怎样影响在途使用者？</td><td><code>python -m minideepinfer.step_demo</code></td></tr>
          <tr><td><a href="/deepinfer/lesson/6">六</a></td><td>NPU 算完 CPU 就能读吗？</td><td>流、拷贝与完成事件怎样形成读取边界？</td><td><code>python -m minideepinfer.npu_step_demo</code></td></tr>
          <tr><td><a href="/deepinfer/lesson/7">七</a></td><td>结果回来后，再提交进度</td><td>如何把执行与主机提交分开？</td><td><code>python -m minideepinfer.verify_deferred --device cpu</code></td></tr>
          <tr><td><a href="/deepinfer/lesson/8">八</a></td><td>BatchEngine 分步执行</td><td>计算途中取消，怎样接回原引擎？</td><td><code>python -m minideepinfer.verify_deferred_engine --device cpu</code></td></tr>
          <tr><td><a href="/deepinfer/lesson/9">九</a></td><td>等待期间准备新文本</td><td>分词移到等待前，设备有没有同时工作？</td><td>相同负载计时 + 三步 trace（短负载未提速）</td></tr>
          <tr><td><a href="/deepinfer/lesson/10">十</a></td><td>先准备采样索引，再计算</td><td>哪些准备依赖 logits，哪些不依赖？</td><td>旧/新数值对照与时间线（无稳定提速结论）</td></tr>
          <tr><td><a href="/deepinfer/lesson/11">十一</a></td><td>下一轮先发出去</td><td>CPU 未读取 token，设备怎样继续计算？</td><td><code>python -m minideepinfer.verify_decode_pipeline --device cpu</code></td></tr>
          <tr><td><a href="/deepinfer/lesson/12">十二</a></td><td>请求结束，下一轮已发出</td><td>EOS 或取消后，多算的一轮怎样收尾？</td><td><code>python -m minideepinfer.verify_stopping_pipeline --device cpu</code></td></tr>
          <tr><td><a href="/deepinfer/lesson/13">十三</a></td><td>新请求放进哪一轮？</td><td>新 prompt 怎样与旧设备 token 合批并复用槽位？</td><td><code>python -m minideepinfer.verify_arrivals --device cpu</code></td></tr>
          <tr><td><a href="/deepinfer/lesson/14">十四</a></td><td>发出去了，不等于已提交</td><td>token 预算怎样切 prompt，位置按哪份进度规划？</td><td><code>python -m minideepinfer.verify_chunk_pipeline --device cpu</code></td></tr>
        </tbody>
      </table>

      {/* ==================== 三种执行方式 ==================== */}
      <div className="section-divider"><span>三种执行方式</span></div>
      <p>共用模型计算与 Step 构造，区别在"本轮结果何时提交、下一轮何时发出"——这是理解异步重叠的关键。</p>
      <table className="my-5">
        <thead><tr><th>入口</th><th>行为</th><th>结果与资源</th></tr></thead>
        <tbody>
          <tr><td>默认 <code>generate</code></td><td>Engine 单请求或 BatchEngine 同步合批</td><td>本轮完成并提交后，再安排下一轮</td></tr>
          <tr><td><code>generate --deferred</code></td><td>BatchEngine 分开发起与收取，最多一批在途</td><td>可在中间提交或取消请求，等待完成后提交结果</td></tr>
          <tr><td><code>generate --pipeline</code></td><td>StoppingDecodePipeline 跨轮接续，最多持有两轮状态</td><td>下一轮 forward 先提交，再处理上一轮结果；缓存等最后使用完成后归还</td></tr>
        </tbody>
      </table>

      {/* ==================== 核心对象 ==================== */}
      <div className="section-divider"><span>核心对象</span></div>
      <p>每个对象只做一件事，名称即职责（详见<a href={`${DOC}/ARCHITECTURE.md`} target="_blank" rel="noreferrer">架构设计</a>）。</p>
      <table className="my-5">
        <thead><tr><th>对象</th><th>职责</th><th>主要状态</th></tr></thead>
        <tbody>
          <tr><td><code>Request</code></td><td>维护请求生命周期与输出</td><td>prompt、已输出 token、已计算输入数、停止原因、错误</td></tr>
          <tr><td><code>Step</code></td><td>描述一次执行，不承载模型计算</td><td>输入 token、绝对位置、本轮写入槽位、有序上下文槽位</td></tr>
          <tr><td><code>SlotPool</code></td><td>管理逻辑槽位归属，不存储张量</td><td>空闲槽位、请求独占槽位</td></tr>
          <tr><td><code>ModelRunner</code></td><td>准备输入、执行 forward、选择 token</td><td>模型权重、设备输入、各请求已计算前缀</td></tr>
          <tr><td><code>TensorKVCache</code></td><td>存放真实 K/V 张量</td><td>按 layer / slot / KV head / head dim 分配</td></tr>
          <tr><td><code>HybridCache</code></td><td>管理 Qwen3.5 两类设备缓存</td><td>完整注意力 KV；每请求每线性层的卷积窗口与 FP32 递推矩阵</td></tr>
          <tr><td><code>Engine</code></td><td>FIFO 调度、准备元数据、提交结果与终止</td><td>等待队列、一个运行请求、预留槽位</td></tr>
          <tr><td><code>BatchEngine</code></td><td>按轮准入与整批结果提交；可选分步执行</td><td>等待队列、运行请求及槽位、token 预算、本批计划与结果句柄</td></tr>
          <tr><td><code>DeferredRunner</code></td><td>提交真实模型计算，读取后再更新主机前缀</td><td>独占 ModelRunner、专用流、最多一批在途结果、取消记录</td></tr>
          <tr><td><code>PendingBatch</code></td><td>持有本批张量与结果拷贝事件</td><td>Step 元组、CPU token 缓冲区、logits、完成与清理状态</td></tr>
          <tr><td><code>StoppingDecodePipeline</code></td><td>跨轮输入预算、动态准入与退出</td><td>两轮状态、设备 token、已发出进度与最后使用事件</td></tr>
        </tbody>
      </table>

      {/* ==================== 对照 DeepInfer 读代码 ==================== */}
      <div className="section-divider"><span>对照 DeepInfer 读代码</span></div>
      <p>从自己关心的问题进入，再回到 DeepInfer 的对应职责；<a href={`${DOC}/SOURCE_MAP.md`} target="_blank" rel="noreferrer">源码映射</a>逐项列出保留的机制、对应入口与教学简化。</p>
      <table className="my-5">
        <thead><tr><th>想读懂的机制</th><th>教学实现</th><th>教程</th></tr></thead>
        <tbody>
          <tr><td>一次请求的 prefill、decode 与输出提交</td><td><a href={`${SRC}/engine.py`} target="_blank" rel="noreferrer">Engine.step()</a></td><td><a href={`${DOC}/FIRST_REQUEST.md`} target="_blank" rel="noreferrer">第一课</a></td></tr>
          <tr><td>合批、token 预算与分块 prefill</td><td><a href={`${SRC}/batch_engine.py`} target="_blank" rel="noreferrer">BatchEngine</a></td><td><a href={`${DOC}/BATCHING.md`} target="_blank" rel="noreferrer">第三课</a></td></tr>
          <tr><td>KV、卷积窗口与递推状态</td><td><a href={`${SRC}/hybrid_cache.py`} target="_blank" rel="noreferrer">HybridCache</a></td><td><a href={`${DOC}/QWEN35.md`} target="_blank" rel="noreferrer">Qwen3.5 模型</a></td></tr>
          <tr><td>CPU 未读到 token，下一轮怎样接着算</td><td><a href={`${SRC}/stopping_pipeline.py`} target="_blank" rel="noreferrer">StoppingDecodePipeline</a></td><td><a href={`${DOC}/CHUNK_PIPELINE.md`} target="_blank" rel="noreferrer">跨轮与分块</a></td></tr>
          <tr><td>候选拒绝后，两份缓存怎样恢复</td><td><a href={`${SRC}/model_draft.py`} target="_blank" rel="noreferrer">ModelDraft</a></td><td><a href={`${DOC}/MODEL_DRAFT_WALKTHROUGH.md`} target="_blank" rel="noreferrer">双模型演示</a></td></tr>
          <tr><td>概率接受与拒绝后的补采样</td><td><a href={`${SRC}/sampling.py`} target="_blank" rel="noreferrer">verify_sampled()</a></td><td><a href={`${DOC}/SAMPLING.md`} target="_blank" rel="noreferrer">采样实验</a></td></tr>
        </tbody>
      </table>

      {/* ==================== Ascend 910C 实机验证 ==================== */}
      <div className="section-divider"><span>Ascend 910C 上已跑通什么</span></div>
      <p>所有记录保留输入、配置、原始输出与源码 SHA，可<a href={`${DOC}/EVIDENCE.md`} target="_blank" rel="noreferrer">按对应 commit 复核</a>。</p>
      <table className="my-5">
        <thead><tr><th>已有记录</th><th>验证了什么</th></tr></thead>
        <tbody>
          <tr><td><a href={`${DOC}/VALIDATION.md`} target="_blank" rel="noreferrer">Qwen3.5-2B 实机</a></td><td>Ascend 910C FP32 的模型计算、单请求与批处理</td></tr>
          <tr><td><a href={`${DOC}/PIPELINE_TEXT.md`} target="_blank" rel="noreferrer">跨轮文本</a></td><td>同步、跨轮和逐条到达输出一致；43 组完整 logits 对照通过</td></tr>
          <tr><td><a href={`${DOC}/SAMPLING.md`} target="_blank" rel="noreferrer">投机采样</a></td><td>28 组概率、6 组冷缓存对照通过，真实覆盖 draft 拒绝恢复</td></tr>
          <tr><td><a href={`${DOC}/SPECULATIVE_TEXT.md`} target="_blank" rel="noreferrer">流式取消</a></td><td>已交付的 4 个 token 匹配独立 greedy 前缀，两份缓存均归还</td></tr>
        </tbody>
      </table>

      {/* ==================== 进阶实验与周边 ==================== */}
      <div className="section-divider"><span>进阶实验与周边</span></div>
      <p>主线之外的教学入口：投机解码、随机采样、性能测量与后续方向。</p>
      <ResourceTable resources={[
        { name: '双模型逐轮演示', url: `${DOC}/MODEL_DRAFT_WALKTHROUGH.md`, desc: '跟着一次候选拒绝，检查输出提交和缓存恢复怎样接上下一轮（无需权重或 NPU）' },
        { name: '投机解码', url: `${DOC}/SPECULATIVE.md`, desc: '独立同步单请求路径：verify_greedy 决定输出、CachedTarget 管理 KV 前缀与线性状态快照' },
        { name: '随机采样', url: `${DOC}/SAMPLING.md`, desc: '小词表看概率接受与回退；两个随机模型检查同一套缓存回退' },
        { name: 'top-k / top-p', url: `${DOC}/SAMPLING_FILTERS.md`, desc: '候选范围改变以后，验证必须使用哪份概率' },
        { name: '单模型生成（v0.6）', url: `${DOC}/SINGLE_MODEL.md`, desc: '一份 Qwen3.5 权重的采样、流式输出和取消；用候选宽度零复用同一循环' },
        { name: '同步 vs 跨轮测量', url: `${DOC}/PIPELINE_BENCHMARK.md`, desc: '为什么"下一轮提前发出"不一定更快；等待请求的准入对照' },
        { name: '首轮结果实验', url: `${DOC}/FIRST_RESULT.md`, desc: '只改第 0 轮的收取位置，观察首 token 与整批耗时变化' },
        { name: 'BF16 对照', url: `${DOC}/BF16_REFERENCE.md`, desc: '跨轮文本入口的 FP32/eager 范围与 BF16 参考检查差异' },
        { name: '路线图', url: `${DOC}/ROADMAP.md`, desc: 'DeepSeek-V4.1 架构、MLA/MoE、MTP、图执行与分布式等尚未实现的方向' },
        { name: '参考与来源', url: `${DOC}/REFERENCES.md`, desc: 'DeepInfer / mini-sglang / Ascend SGLang 的参考来源与许可证逐项记录' },
      ]} />

      {/* ==================== 上手 ==================== */}
      <div className="section-divider"><span>如何上手</span></div>
      <p>前置：Python 3.10+；没有 NPU 也能跑 CPU 调度与随机小模型。真实权重（Qwen3.5-0.8B/2B）需在 Ascend 910C 上准备 torch_npu、CANN 与本地权重。</p>
      <ResourceTable resources={[
        { name: 'README', url: 'https://github.com/AkiYangDev/mini-deepinfer', desc: '快速开始 + 阅读路线；独立社区项目，与 DeepSeek/SGLang/华为无官方隶属关系' },
        { name: '运行指南 START_HERE', url: `${DOC}/START_HERE.md`, desc: 'CPU 小模型入门 / Ascend 910C 真实权重两种准备路径（固定 v0.5.0）' },
        { name: 'A/B/C 调度演示', url: `${DOC}/WALKTHROUGH.md`, desc: '长 prompt 分块计算、B 先结束、C 复用 B 释放的缓存槽位' },
        { name: '第一课', url: `${DOC}/FIRST_REQUEST.md`, desc: '对照无依赖 demo 输出，逐步解释提交请求、执行一步、处理输出、停止回收' },
        { name: '双模型文本生成', url: `${DOC}/SPECULATIVE_TEXT.md`, desc: '流式输出与取消命令；cancel 不截断已提交的接受组' },
        { name: '示例代码 minideepinfer/', url: `${SRC}/__init__.py`, desc: 'engine.py / batch_engine.py / hybrid_cache.py / model_draft.py / sampling.py 等教学源码' },
      ]} />

      <Callout type="tip" title="与本站 DeepInfer 内容的分工">
        本站三个 DeepInfer 入口互为补充：<strong><a href="/deepinfer/index">DeepInfer 剖面</a></strong>是静态剖面图，
        讲现成引擎内部"长什么样"；<strong><a href="/nanovllm2deepinfer">nano-vLLM → DeepInfer</a></strong>是按 PR 增量把引擎
        "做出来"；<strong>mini-DeepInfer</strong>则给出一条<strong>可运行的最小代码路径</strong>，
        顺着一条请求亲手验证调度、缓存与异步重叠的每一步。
      </Callout>
    </div>
  );
}
