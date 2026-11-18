import { Callout, CodeBlock } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

const DOC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/docs';
const SRC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/minideepinfer';

export function DeepInferLesson14Page() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="第十四课：发出去了，不等于已经提交了"
        date="更新于 2026-10"
        readingTime="阅读约 8 分钟"
        tags={['分块', '预算', 'IssuedProgress', '提交']}
      />

      <p>上一课让新 prompt 和旧请求的 decode 合批，但 prompt 仍一次算完。长一点的输入会占住整轮工作；要把它切开，先得回答一个问题：CPU 还在处理前一轮，下一块应该从哪个位置开始？</p>

      <p>这次沿用同一个 <a href={`${SRC}/stopping_pipeline.py`} target="_blank" rel="noreferrer"><code>StoppingDecodePipeline</code></a>，加入每轮输入 token 预算和分块 prefill。先给已有 decode 各一个 token，再计算已有请求的 prompt 块，最后按 FIFO 接纳新请求。没有再增加一个 pipeline 类。</p>

      {/* ==================== 一条请求，有三种进度 ==================== */}
      <div className="section-divider"><span>一条请求，有三种进度</span></div>

      <p>假设 A 的 prompt 有五个 token，每轮预算四个。第一轮发出前四个，第二轮发出最后一个。第二轮 forward 已经提交时，CPU 才开始处理第一轮结果：</p>

      <table className="my-5">
        <thead><tr><th>此刻看什么</th><th>A 的值</th><th>能用来做什么</th></tr></thead>
        <tbody>
          <tr><td><code>Request.num_cached_tokens</code> / <code>output_ids</code></td><td>0 / 空</td><td>CPU 已经确认并提交的请求历史</td></tr>
          <tr><td><code>IssuedProgress.cached_tokens</code> / <code>sampled_tokens</code></td><td>5 / 1</td><td>已发出的输入数、将产生采样结果的步骤数；规划后续位置与输出上限</td></tr>
          <tr><td><code>_last_use[A]</code></td><td>第二轮的完成事件</td><td>判断设备是否已用完 A 的状态，决定何时归还槽位</td></tr>
        </tbody>
      </table>

      <p>这就是实机回调中记录的值。<strong>已发出五个输入，不表示设备已经完成这五个输入。</strong>同样，<code>sampled_tokens=1</code> 表示已提交一轮需要采样的计算，此时还没向用户提交首 token，当前轮采样也可能尚未发出。</p>

      <p>如果拿 CPU 的 0 去规划第二轮，就会重新从 prompt 开头计算。若反过来把已发出的 5 当成完成状态，又可能提前归还设备还在访问的缓存。位置规划、输出提交和资源回收各自需要自己的依据。</p>

      <p><a href={`${SRC}/planning.py`} target="_blank" rel="noreferrer"><code>planning.py</code></a> 用不到张量。<code>IssuedProgress</code> 是不可变快照：每发出一个合法连续步骤，生成下一份计数。中间 prompt 块只增加输入数；最后一块和 decode 才增加采样步骤数。</p>

      {/* ==================== 先共用"这一步输入什么" ==================== */}
      <div className="section-divider"><span>先共用"这一步输入什么"</span></div>

      <p>同步 <a href={`${SRC}/batch_engine.py`} target="_blank" rel="noreferrer"><code>BatchEngine</code></a> 和跨轮实验现在共用一个小函数：</p>

      <CodeBlock code={`plan_step(request, slots, start, budget, decode_token=0)`} language="python" title="Step 构造共用函数" />

      <p>它根据明确的起点切 prompt，或构造一个 decode token，并返回位置、写入槽位、上下文和 <code>is_last_prompt_chunk</code>。同步引擎传入 CPU 已提交的位置与 token；跨轮循环传入已发出的位置，decode 的零占位随后用前轮设备 token 替换。</p>

      <p>这里共用的是 Step 构造。两边仍分别管理准入、停止和在途结果：BatchEngine 保留单批在途限制，跨轮实验保留两轮张量的有效期。分清这层接口后，才容易判断下一步该合并什么，而不是把两个循环硬塞到一起。</p>

      {/* ==================== 九轮里，四次没有新 token ==================== */}
      <div className="section-divider"><span>九轮里，四次没有新 token</span></div>

      <p>实机使用 A、B 两条原始文本，prompt 长度分别为 5、8，各输出四个 token。C 在第 0 轮结果回调中加入，prompt 与 A 相同，输出两个 token。槽位池容量 24，并发上限 2，每轮输入预算 4。</p>

      <p>A 预留 8 个槽位，B 预留 11 个，只剩 5 个；C 需要 6 个，所以先排队。实际提交轨迹如下：</p>

      <table className="my-5">
        <thead><tr><th>轮次</th><th>提交给模型的输入</th><th>本轮输入数</th></tr></thead>
        <tbody>
          <tr><td>0</td><td>A prompt 前 4 个，中间块</td><td>4</td></tr>
          <tr><td>1</td><td>A prompt 最后 1 个；B prompt 前 3 个，中间块</td><td>4</td></tr>
          <tr><td>2</td><td>A decode；B prompt 再 3 个，中间块</td><td>4</td></tr>
          <tr><td>3</td><td>A decode；B prompt 最后 2 个</td><td>3</td></tr>
          <tr><td>4</td><td>A decode；B decode</td><td>2</td></tr>
          <tr><td>5</td><td>B decode</td><td>1</td></tr>
          <tr><td>6</td><td>B decode；C prompt 前 3 个，中间块</td><td>4</td></tr>
          <tr><td>7</td><td>C prompt 最后 2 个</td><td>2</td></tr>
          <tr><td>8</td><td>C decode</td><td>1</td></tr>
        </tbody>
      </table>

      <p>当前轮 forward 发出后处理上一轮结果，再采样当前轮；收尾再处理最后一轮。A 结束后，C 最终复用 A 的 <code>[0,1,2,3,4,5]</code>，旧前缀和线性状态已清除。</p>

      <p>预算约束的是<strong>本轮输入 token 总数</strong>。它既不等于请求数，也不是四个 token 就耗时相同的保证：decode 读取的历史长度、模型状态和批次形状仍会影响计算。</p>

      {/* ==================== 中间块不能拿来继续 decode ==================== */}
      <div className="section-divider"><span>中间块不能拿来继续 decode</span></div>

      <p>中间 prompt 块会产生 logits，但不能把块尾预测当成回答。它后面还有用户原本输入的文本。这里保持每个请求一行结果，中间块用 <code>-1</code> 占位，回调看到 <code>None</code>，CPU 只提交缓存进度，不追加输出，也不判断 EOS 或输出长度。</p>

      <p>批次里可能有的行需要采样、有的行不用。混合时，需要采样的行号在 forward 前上传，由本轮对象保留；forward 后只对这些行做 argmax，再填入完整结果向量。所有行都需采样时，直接使用原路径；整批都是中间块时，不执行 argmax，仍记录拷贝完成事件。采样索引不留到 forward 后才准备，延续<a href="/deepinfer/lesson/10">第十课</a>的职责划分。</p>

      <p>下一轮只有 decode 行才能取前轮设备 token。若它的来源还是中间 prompt 块，输入准备立即拒绝，避免把占位 <code>-1</code> 送进 embedding。测试也检查无效占位不会推进 CPU 进度。</p>

      {/* ==================== 最后一次使用，单独记住 ==================== */}
      <div className="section-divider"><span>最后一次使用，单独记住</span></div>

      <p>分块和 token 预算会让请求的执行间隔变得不规则。不能只在当前保留的两轮里搜索"谁最后用过 A"：A 的最近一轮可能已经离开这两个对象，但它仍拥有缓存。</p>

      <p>因此每次成功发出步骤，都把该请求的 <code>_last_use</code> 更新到本轮事件。停止时保存这份引用，事件确认完成后再删除 Runner 前缀、线性状态和槽位。两轮对象负责持有计算所需张量，每请求事件负责确定最后使用边界，两者分工不同。</p>

      <p>取消发生在中间块时，也遵守同样的顺序。排空成功再清理；若排空失败，进度、事件、在途张量和槽位继续持有，不能把 Runner 当成空闲状态重用。</p>

      {/* ==================== 对照 DeepInfer ==================== */}
      <Callout type="tip" title="对照 DeepInfer">
        <p>固定参考仍为 <code>8b161497</code>。<a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py" target="_blank" rel="noreferrer"><code>Worker.execute_model_step()</code></a> 提供跨轮执行顺序，<a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/zos_status.py" target="_blank" rel="noreferrer"><code>WorkerStepState</code> / <code>MetadataZOS</code></a> 提供在途状态和行映射的参考。<a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/model_runner.py" target="_blank" rel="noreferrer"><code>prepare_sampler_inputs()</code></a> 则帮助区分 prompt 完成与采样。本课的两份进度、FIFO、整份缓存预留和 decode 优先，是教学版自己的具体表达，不是上游完整调度策略或 ZOS 的复现。</p>
      </Callout>

      {/* ==================== Ascend 910C 验证 ==================== */}
      <div className="section-divider"><span>Ascend 910C 验证</span></div>

      <p>2026-10-24，在单逻辑 Ascend 910C 上复用 Qwen3.5-2B 权重，以 FP32、关闭 HF32 检查。Python 3.12.13、PyTorch 2.10.0+cpu、torch_npu 2.10.0.post6、CANN 9.1.0；CPU 线程 1，tokenizer 并行关闭。</p>

      <p>同步参考直接构造整段 prompt 的 Step，不经过新增规划函数或分块路径：A/B 四轮，C 用独立冷缓存两轮。实验中的中间块 logits 对照整段参考的对应前缀位置。</p>

      <table className="my-5">
        <thead><tr><th>检查</th><th>结果</th></tr></thead>
        <tbody>
          <tr><td>九轮、十四组完整 logits</td><td>最大绝对差 <code>2.6702880859375e-5</code>，原 <code>atol=1e-4, rtol=2e-4</code> 通过</td></tr>
          <tr><td>四行中间 prompt 块</td><td>原始 token 为 -1，回调为 None，不追加输出</td></tr>
          <tr><td>A、B、C 输出</td><td>4、4、2 个，greedy、位置和槽位与参考一致</td></tr>
          <tr><td>采样行准备、C 复用 A 的槽位</td><td>九轮准备顺序通过；旧模型状态清除</td></tr>
          <tr><td>中间块取消后注入主机异常、再次复用 Runner</td><td>均通过，最终 24/24 槽位归还，前缀和线性状态为 0</td></tr>
        </tbody>
      </table>

      <p><a href={`${DOC}/results/2026-10-24/qwen35-2b-chunk-pipeline-npu-fp32.json`} target="_blank" rel="noreferrer">原始报告</a>保留轨迹、逐组误差、三种进度、回收事件及十五份相关源码 SHA。一次程序加载一次权重：同步参考 6 次 forward，主轨迹 9 次，取消异常 2 次，复用 1 次，共 18 次。没有下载权重、重新采集 trace 或测量性能。</p>

      <p>新增十一项 CPU 测试。Transformers 5.12.1 环境 134 项全部通过；4.46.3 环境 122 项通过、12 项参考跳过；无模型依赖时 54 项通过、80 项跳过。原到达检查与 BatchEngine 分步检查的 CPU 示例也通过。模型数学、缓存布局和 BF16 结论沿用已有边界。</p>

      {/* ==================== 自己运行 ==================== */}
      <div className="section-divider"><span>自己运行</span></div>

      <p>已有 PyTorch 时，无需权重先跑随机小模型：</p>

      <CodeBlock code={`python -m minideepinfer.verify_chunk_pipeline --device cpu \\
  --output outputs/chunk-pipeline-cpu.json`} language="bash" />

      <p>按<a href="/deepinfer/lesson/4">第四课</a>准备依赖和权重后，在匹配的 Ascend 环境中运行：</p>

      <CodeBlock code={`python -m minideepinfer.verify_chunk_pipeline \\
  --model weights/Qwen3.5-2B --device npu:0 \\
  --output outputs/chunk-pipeline-npu.json`} language="bash" />

      <p>新请求和取消仍从单线程结果回调进入。下一步先检查不同 prompt 长度与到达时刻下的执行轨迹，找到具体的等待，再决定哪些调度职责值得合并或测量。九轮顺序正确，并不能单独说明吞吐提高。</p>

      {/* ==================== 课程导航 ==================== */}
      <div className="flex gap-2 flex-wrap" style={{ marginTop: 24 }}>
        <a href="/deepinfer/mini" className="no-underline">{'←'} 十四课目录</a>
        <a href="/deepinfer/lesson/13" className="no-underline">{'←'} 上一课</a>
      </div>
    </div>
  );
}
