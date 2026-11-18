import { Callout, CodeBlock } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

const DOC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/docs';
const SRC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/minideepinfer';
const REPO = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main';

export function DeepInferLesson9Page() {
  const prev = 8;
  const next = 10;
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="第九课：等待期间准备新文本"
        date="更新于 2026-10"
        readingTime="阅读约 8 分钟"
        tags={['分词', '重叠', 'text_loop', '短负载']}
      />

      <p>
        上一课把发起计算和收取结果拆开了。现在两个调用之间有了一段位置，但它能放什么工作？放进去以后，会不会更快？
      </p>
      <p>
        这次选择新请求的分词。它只读取新文本和 tokenizer，不需要当前请求刚生成的 token，也不修改模型或设备缓存。相比之下，当前请求的下一次 decode 必须等结果，不能提前准备成一次完整的执行。
      </p>
      <p>
        我们实现了一个小循环，并在 Ascend 910C 上做了对照：新顺序的批次、输出与回收都一致，<strong>这组短请求没有显示提速</strong>。三步时间线也只有一步观察到分词与设备 kernel 活动重叠。下面沿着代码看原因。
      </p>

      {/* ==================== 每轮只准备一条新请求 ==================== */}
      <div className="section-divider"><span>每轮只准备一条新请求</span></div>

      <p>
        入口在 <a href={`${SRC}/text_loop.py`} target="_blank" rel="noreferrer"><code>text_loop.py</code></a>。它接收一个文本迭代器，先准备第一条请求，后续每轮再取一条。不会在模型开始前把整个迭代器读完，也没有增加线程或另一套调度器。
      </p>
      <p>核心顺序是：</p>
      <CodeBlock
        language="python"
        code={`# 讲解片段：省略迭代器结束判断和错误处理。
engine.launch_step()
tokens = tokenizer.encode(next_text)
engine.submit(tokens, max_new_tokens=4)
engine.finish_step()`}
      />
      <p>
        新请求只是进入等待队列。等当前结果处理完，下一轮仍由原来的 <code>_schedule()</code> 决定它能否进入批次。decode 优先、token 预算和最大槽位预留都沿用旧规则。
      </p>
      <p>
        这很适合检查第八课的接口是否真的有用：CPU 可以准备 B，同时保留 A 的在途状态；B 无须知道 A 的回答。但调用顺序允许并行，不代表这次执行一定发生了并行，还要看设备时间线。
      </p>

      {/* ==================== 先在 CPU 上检查两种顺序 ==================== */}
      <div className="section-divider"><span>先在 CPU 上检查两种顺序</span></div>

      <p>在仓库目录、有 PyTorch 的环境中运行：</p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.benchmark_prepare \\
  --device cpu --repeats 1 --output outputs/prepare-cpu.json`}
      />
      <p>
        不传 <code>--model</code> 时，使用随机初始化的小 Qwen3.5 和示例 tokenizer，不下载权重。它用于检查流程，CPU 的计时不能说明 NPU 重叠。
      </p>
      <p>对照只改变准备新文本的位置：</p>
      <table className="my-5">
        <thead>
          <tr><th>顺序</th><th>每轮做什么</th></tr>
        </thead>
        <tbody>
          <tr><td><code>after_finish</code></td><td>发起当前批次 → 收取结果 → 为一条新请求分词并入队</td></tr>
          <tr><td><code>before_finish</code></td><td>发起当前批次 → 为一条新请求分词并入队 → 收取结果</td></tr>
        </tbody>
      </table>
      <p>
        两种顺序都使用 DeferredRunner，最多一批在途；新请求都在下一轮才参与调度。这样比较的是 CPU 工作放置的位置，不会混入同步 Runner 与新 Runner 的实现差别。
      </p>
      <p>
        自动检查还覆盖了一种容易忽略的情况：B 的文本非法或超出容量，A 已经在算了。这里用 <code>finally</code> 先收取 A 的本轮结果，再把 B 的错误交还调用方。A 保留有效进度，调用方可以继续完成它。如果收取本身也失败，则按第八课的规则保留资源，不能因为前端报错就释放设备仍在使用的缓存。
      </p>

      {/* ==================== Ascend 910C 上测到了什么 ==================== */}
      <div className="section-divider"><span>Ascend 910C 上测到了什么？</span></div>

      <p>
        本次使用固定版本的 Qwen3.5-2B 文本权重、单逻辑设备、FP32。软件为 Python 3.12.13、PyTorch 2.10.0+cpu、torch_npu 2.10.0.post6、CANN 9.1.0，CPU 计算线程数为 1，关闭 tokenizer 并行。
      </p>
      <p>
        四条 raw prompt 的长度分别是 5、3、8、8 token。每条固定输出 4 token，关闭 EOS 提前停止；并发上限为 2，单轮输入预算为 4 token，缓存容量为 128。没有共享前缀复用或投机解码，也没有 HTTP 请求。命令为：
      </p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.benchmark_prepare \\
  --model weights/Qwen3.5-2B --device npu:0 --repeats 3 \\
  --output outputs/qwen35-2b-prepare.json`}
      />
      <p>
        每种顺序先完整预热一次，再按先后、后先、先后的顺序交替测量，共六次正式运行。每次都从独立的空请求缓存开始，使用相同权重、输入和调度计划，结束后归还 128/128 槽位，前缀与线性状态均为 0。
      </p>

      <table className="my-5">
        <thead>
          <tr><th>指标</th><th>收取后再准备</th><th>收取前准备</th></tr>
        </thead>
        <tbody>
          <tr><td>四请求总耗时，ms</td><td>636.574</td><td>639.394</td></tr>
          <tr><td>输出吞吐，token/s</td><td>25.135</td><td>25.024</td></tr>
          <tr><td>四请求分词合计，ms</td><td>0.412</td><td>0.421</td></tr>
          <tr><td>请求平均 TTFT，ms</td><td>193.585</td><td>195.160</td></tr>
          <tr><td>请求平均 TPOT，ms/token</td><td>48.982</td><td>49.272</td></tr>
          <tr><td>请求平均 E2E，ms</td><td>340.529</td><td>342.977</td></tr>
          <tr><td>每次输出 / 失败请求</td><td>16 token / 0</td><td>16 token / 0</td></tr>
        </tbody>
      </table>

      <p>
        表中每项取该顺序三次运行的中位数；延迟项先在一次运行内对四个请求求均值，再取三次中位数。TTFT/E2E 从该文本开始分词计起，到 CPU 提交首个/最后一个输出 token；TPOT 为 <code>(E2E-TTFT)/3</code>。逐请求 ITL、全部原始测量值和输出保存在
        <a href={`${DOC}/results/2026-10-24/qwen35-2b-prepare-npu-fp32.json`} target="_blank" rel="noreferrer">结构化结果</a>，重复的批次计划只存一份。
      </p>
      <p>
        计时包含分词、排队、生成和请求状态回收，不含权重加载、模型预热与缓存分配。两种顺序各有一次预热，计时程序与后面的 profiling 分进程运行，因此也不包含 trace 采集和解析成本。实机程序完成后均退出，没有保留计算进程。
      </p>
      <p>
        这里没有可报告的加速。三次样本不足以把约 0.44% 的耗时差异归因为某项机制，但能看出这四条短文本的分词只占约 0.4 ms，远小于约 640 ms 的整轮工作。即使它们都被设备计算覆盖，这一项本身也没有多少可节省的时间。长文本或其他前端工作需要各自测量，不能套用本例。
      </p>

      {/* ==================== 调用顺序变了，设备真的同时在算吗 ==================== */}
      <div className="section-divider"><span>调用顺序变了，设备真的同时在算吗？</span></div>

      <p>
        另外采了预热后的前三步，CPU/NPU 同时记录，Level0、关闭 shape 和堆栈。采集使用独立的{' '}
        <a href={`${REPO}/examples/profile_prepare.py`} target="_blank" rel="noreferrer"><code>examples/profile_prepare.py</code></a>，没有改写原计时程序：
      </p>
      <CodeBlock
        language="bash"
        code={`python -m examples.profile_prepare \\
  --model weights/Qwen3.5-2B --device npu:0 \\
  --output outputs/prepare-profile`}
      />
      <p>
        在导出的 <code>ASCEND_PROFILER_OUTPUT</code> 目录中找到 <code>trace_view.json</code> 和 <code>kernel_details.csv</code>，将该目录记为 <code>TRACE_DIR</code>。在仓库目录的 Bash 中执行：
      </p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.analyze_prepare_trace \\
  --trace "$TRACE_DIR/trace_view.json" \\
  --kernels "$TRACE_DIR/kernel_details.csv" \\
  --output outputs/prepare-timeline.json`}
      />
      <p>
        分析器将 <code>mini.tokenize</code> 的 CPU 区间与设备 kernel 区间求交。多个 kernel 并行或重复出现时先做区间合并，不把时长重复相加。本次 8,609 个 CSV kernel 的起始时间均能在同一 trace 时钟找到；两个导出的 duration 最大相差 0.001 µs，分析器按这一导出精度核对，计算仍使用 CSV 原值。
      </p>

      <table className="my-5">
        <thead>
          <tr><th>采集步骤</th><th>分词区间，µs</th><th>与设备 kernel 区间相交，µs</th></tr>
        </thead>
        <tbody>
          <tr><td>0</td><td>191.59</td><td>191.59</td></tr>
          <tr><td>1</td><td>190.57</td><td>0</td></tr>
          <tr><td>2</td><td>186.19</td><td>0</td></tr>
        </tbody>
      </table>

      <p>
        第一步确实有重叠，后两步没有。本次导出的设备事件缺少 <code>cat="kernel"</code>，不能只按这个字段过滤，否则会把设备活动误算成零；分析器使用 kernel 表，并交叉核对 trace 的 <code>Computing</code> 事件。精简后的
        <a href={`${DOC}/results/2026-10-24/qwen35-2b-prepare-timeline.json`} target="_blank" rel="noreferrer">时间线证据</a>
        保留步骤区间、分词附近的设备区间、原始文件 SHA 和采集配置。
      </p>
      <p>
        在这份 trace 中，<code>launch_step()</code> 的 CPU 调用本身约为 63–72 ms，而新文本分词只有约 0.19 ms。模型计算是调用期间逐项提交的，等函数返回时，设备可能已经完成了其中的大部分工作。正常 launch 路径没有显式等待整批完成，但其中的具体运算仍可能同步，也无法保证下一个 CPU 操作总有足够的设备工作可以重叠。
      </p>
      <p>
        这些区间受 profiler 影响，只用于判断本次捕获中是否相交，不能拿来替代上表的不采集计时。它们也没有独立证明 <code>launch</code> 较长的具体根因；下一步应检查其算子提交和同步点，而不是直接增加并行层数。
      </p>

      {/* ==================== 在生成入口使用 ==================== */}
      <div className="section-divider"><span>在生成入口使用</span></div>

      <p>
        <code>--prepare-during-step</code> 会自动启用分步 BatchEngine。默认生成方式保持不变：
      </p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.generate \\
  --model weights/Qwen3.5-2B --device npu:0 --dtype float32 \\
  --prompt "Explain what a KV cache does." \\
  --prompt "What is 1 plus 1?" --max-new-tokens 32 \\
  --cache-capacity 256 --max-num-seqs 2 --max-batched-tokens 4 \\
  --chunked-prefill --prepare-during-step`}
      />
      <p>
        这个模式从第一条请求开始执行，后续 prompt 逐条加入，因此和默认的"先把所有文本准备好再开始"可能形成不同批次。不要拿这两条命令的耗时直接当成本文的位置对照；上面的 benchmark 专门对齐了到达轮次和批次计划。
      </p>

      {/* ==================== 回到 DeepInfer 的设计 ==================== */}
      <div className="section-divider"><span>回到 DeepInfer 的设计</span></div>

      <Callout type="tip" title="对照 DeepInfer">
        <p>
          固定版本 DeepInfer 的{' '}
          <a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/model_runner.py" target="_blank" rel="noreferrer"><code>ModelRunner</code></a>
          {' '}区分输入准备、主模型执行与采样，
          <a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/zos_status.py" target="_blank" rel="noreferrer"><code>WorkerStepState</code></a>
          {' '}保留跨轮仍要使用的信息。拆分职责后，才能讨论哪些工作依赖新 token、哪些可以提前做。
        </p>
      </Callout>

      <p>
        本课的文本入口是教学选择，没有复现上游 ZOS。它验证了一个具体的独立 CPU 工作可以放在哪里，也记录了收益很小、重叠不连续的实测结果。
        <a href="/deepinfer/lesson/10">第十课</a>接着检查 <code>launch</code> 尾部的采样索引复制，做一个只移动准备位置的对照。本课报告继续对应当时的旧实现。
      </p>

      <div className="flex gap-2 flex-wrap" style={{ marginTop: 24 }}>
        <a href="/deepinfer/mini" className="no-underline">← 十四课目录</a>
        <a href={`/deepinfer/lesson/${prev}`} className="no-underline">← 上一课</a>
        <a href={`/deepinfer/lesson/${next}`} className="no-underline">下一课 →</a>
      </div>
    </div>
  );
}
