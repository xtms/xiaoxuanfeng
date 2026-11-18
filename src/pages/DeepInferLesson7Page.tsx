import { Callout, CodeBlock } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

const DOC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/docs';
const SRC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/minideepinfer';

export function DeepInferLesson7Page() {
  const prev = 6;
  const next = 8;
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="第七课：结果回来后，再提交进度"
        date="更新于 2026-10"
        readingTime="阅读约 8 分钟"
        tags={['DeferredRunner', '延迟提交', '专用流', '在途结果']}
      />

      <p>
        前两课用整数把事件和回收顺序讲清楚了。这次换成项目自己的 Qwen3.5 forward，让模型计算、混合缓存和采样真正走一遍。
      </p>
      <p>
        过去调用 <code>run_batch()</code>，会等本轮计算完成，直接拿到 token。现在先拿到一份"这批结果"：里面保存本轮输入、输出张量和完成事件。等结果拷回 CPU，再读出 token、更新请求进度。代码在{' '}
        <a href={`${SRC}/deferred_runner.py`} target="_blank" rel="noreferrer"><code>deferred_runner.py</code></a>，原来的同步 Runner 继续作为对照。
      </p>

      {/* ==================== 先跑小模型，看进度在哪里变化 ==================== */}
      <div className="section-divider"><span>先跑小模型，看进度在哪里变化</span></div>

      <p>在仓库目录、有 PyTorch 的环境中执行：</p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.verify_deferred \\
  --device cpu --output outputs/deferred-tiny-cpu.json`}
      />
      <p>
        不传 <code>--model</code> 时，程序临时创建一个随机初始化的四层 Qwen3.5，包含线性注意力和完整注意力。无需下载权重；它用于检查执行与缓存，不是聊天模型。
      </p>
      <p>核心用法只有几步。下面是讲解片段，<code>steps</code> 沿用前几课的有序 Step 元组：</p>
      <CodeBlock
        language="python"
        code={`deferred = DeferredRunner(runner)
pending = deferred.launch(steps)
# 这里可以做不读取本批结果、不修改模型或缓存的 CPU 工作。
pending.wait()
tokens = pending.result()`}
      />
      <p>
        <code>launch()</code> 负责准备输入、执行模型、选 token 和提交结果拷贝。正常路径没有显式等待本批设备操作结束；调用返回时，小任务也可能已经完成。因此程序不能靠"它应该还没算完"判断资源是否可用，只能检查完成事件。
      </p>
      <p>
        <code>wait()</code> 等 CPU 结果缓冲区可读，<code>result()</code> 才读取并校验整批 token，再提交每个请求的已计算前缀。即使 CPU 路径早已算完，不调用 <code>result()</code>，主机进度也不会自动更新。
      </p>
      <p>
        这里更新的是 Runner 保存的前缀位置和"prompt 是否完成"。本课的验证程序直接构造 Step 来检查这层接口，不处理 Engine 中的{' '}
        <code>num_cached_tokens</code>、<code>output_ids</code> 和等待队列；它们在
        <a href="/deepinfer/lesson/8">第八课</a>接入同一份结果。
      </p>

      {/* ==================== 缓存写了，进度却没提交 ==================== */}
      <div className="section-divider"><span>缓存写了，进度却没提交，这会不会矛盾？</span></div>

      <p>
        它们描述的是不同的事。模型 forward 会直接写 K/V 和 DeltaNet 状态；这些设备写入已经发生，不能假装没有发生。主机保存的前缀记录则表示：这一批结果已经检查过，可以据此准备下一步了。
      </p>
      <p>
        所以本版只允许一批在途。在读取结果或放弃整批之前，第二次 <code>launch()</code> 会报错，<code>release()</code> 也拒绝清理这批请求。否则下一批可能根据旧进度继续输入，而设备缓存其实已经向前走了一段。
      </p>
      <p>
        包装后的 Runner 由 <code>DeferredRunner</code> 独占使用。不要同时绕过包装器调用原 Runner 的 forward、release，也不要修改模型权重或缓存。本例在专用 NPU 流开始前等待当前流已有的工作，保证权重和缓存初始化先完成；输入、logits、采样张量等引用保留到这批操作用完。
      </p>

      {/* ==================== prompt 还没算完 ==================== */}
      <div className="section-divider"><span>prompt 还没算完，就不要提前输出</span></div>

      <p>
        验证中的 A 有 5 个 prompt token，按 <code>[2, 2, 1]</code> 分块。第一轮 A、B 都只计算中间块，返回 <code>[None, None]</code>。这表示缓存向前推进了，但还没有用户可见的输出 token。
      </p>
      <p>
        设备结果缓冲区用 <code>-1</code> 标记中间块。只有 <code>is_last_prompt_chunk=True</code> 的行才进入 argmax；<code>result()</code> 检查中间块确实保留 <code>-1</code>，再转换为 <code>None</code>。中间块不消耗输出长度，也不能触发 EOS。即使整批都没有采样，完成事件仍然放在模型计算和结果拷贝之后，不能提前提交缓存进度。
      </p>
      <p>
        下一轮 B 先完成 prompt，A 继续算中间块；之后一轮同时执行 B 的 decode 和 A 的最后一个 prompt 块。这些计算复用原 Runner 的输入准备、模型和缓存，新增接口没有重新实现 attention 或 DeltaNet。
      </p>

      {/* ==================== 取消 A，B 还要继续 ==================== */}
      <div className="section-divider"><span>取消 A，B 还要继续</span></div>

      <p>在本例的第四轮，A、B 都已经提交了计算，此时调用：</p>
      <CodeBlock
        language="python"
        code={`pending.cancel("A")
pending.wait()
tokens = pending.result()`}
      />
      <p>
        A 的这次输出变成 <code>None</code>，B 仍拿到自己的 token。为了区分"中间块没有 token"和"取消后丢弃 token"，还可以检查这批的 <code>steps</code> 与 <code>cancelled</code>。取消不会中断已经发出去的设备操作。
      </p>
      <p>
        A 的设备状态可能已经推进，所以取消后不能直接用旧前缀恢复 A。包装器会拒绝再次提交 A，直到调用 <code>release("A")</code> 删除它的前缀和线性状态。逻辑槽位由前几课的 <code>DeferredRelease</code> / <code>SlotPool</code> 归还。
      </p>
      <p>
        这个取消接口只处理已经发出的本批结果。等待队列中的请求怎样取消、请求状态何时变成 cancelled，仍由上层引擎决定。
      </p>
      <p>
        验证程序在读取结果之前尝试回收 A，确实没有释放；读完后才归还 A 的槽位。C 随后使用其中的槽位做分块 prefill，B 同时继续 decode，两者仍与独立的同步 Runner 对齐。
      </p>

      {/* ==================== 发生错误时 ==================== */}
      <div className="section-divider"><span>发生错误时，先等设备，还是先清缓存？</span></div>

      <p>
        先等设备。主机代码抛错时，前面提交的设备操作可能仍在读写缓存。这里不能因为 Python 已经退出 forward，就马上删除状态。
      </p>
      <p>
        异常路径等待本包装器的专用流完成，再删除本批请求的前缀与线性状态。如果输入校验在模型执行前就失败，原有有效前缀会保留；如果已经进入可能写缓存的模型执行，本批请求的状态会清掉，其他请求不受这次清理影响。
      </p>
      <p>
        <code>pending.close()</code> 表示放弃整批结果，也走等待和清理这条路径。它会删除本批请求已经保存的状态，包含之前的前缀；后续需要从 prompt 重新开始。它不是把缓存回滚到调用 <code>launch()</code> 前。
      </p>
      <p>
        槽位里的旧 K/V 数值不必清零，但原请求的前缀记录不能继续使用。新请求获得槽位后，由自己的 prefill 覆盖相应位置。
      </p>
      <p>
        如果等待本身报错，就继续保留这批对象，拒绝发起新批次或复用资源。不能把"无法确认完成"改写成"已经安全释放"。这种失败处理用 CPU 注入错误检查了控制流程，真实设备故障恢复尚未验证。
      </p>

      {/* ==================== 在 Ascend 910C 上验证真实权重 ==================== */}
      <div className="section-divider"><span>在 Ascend 910C 上验证真实权重</span></div>

      <p>使用第四课已经准备好的 Qwen3.5-2B，本次执行命令为：</p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.verify_deferred \\
  --model weights/Qwen3.5-2B --device npu:0 \\
  --output outputs/qwen35-2b-deferred-fp32.json`}
      />
      <p>
        本次实际环境是 Python 3.12.13、PyTorch 2.10.0+cpu、torch_npu 2.10.0.post6、CANN 9.1.0，单逻辑设备、FP32，沿用已核验的
        <a href={`${DOC}/results/2026-10-24/weights.json`} target="_blank" rel="noreferrer">固定权重</a>。同步与新接口共享只读模型权重，各自使用独立缓存；输入和批次布局完全相同。
      </p>

      <table className="my-5">
        <thead>
          <tr><th>检查</th><th>本次结果</th></tr>
        </thead>
        <tbody>
          <tr><td>六轮分块 prefill / decode / 换序</td><td>logits 最大绝对差为 0，比较门槛为 <code>atol=1e-4, rtol=2e-4</code></td></tr>
          <tr><td>结果读取前的主机前缀</td><td>每轮都保持原值</td></tr>
          <tr><td>取消 A、C 复用其槽位</td><td>A 的输出丢弃，B、C 的计算继续与同步路径一致</td></tr>
          <tr><td>forward 已提交后注入主机异常</td><td>等待本流结束，再删除本批状态</td></tr>
          <tr><td>最后清理</td><td>32/32 槽位归还，前缀记录和线性状态均为 0</td></tr>
        </tbody>
      </table>

      <p>
        完整输入 token、每轮比较和源码 SHA 见
        <a href={`${DOC}/results/2026-10-24/qwen35-2b-deferred-npu-fp32.json`} target="_blank" rel="noreferrer">原始报告</a>。这次对照专门检查执行与提交方式的变化，参考方是本项目原有同步 Runner；模型数学对独立 Transformers 的验证沿用
        <a href={`${DOC}/VALIDATION.md`} target="_blank" rel="noreferrer">之前的记录</a>，两种检查回答不同的问题。
      </p>
      <p>
        主机异常是有意在真实 forward 提交后抛出的，不是 NPU 故障。当前只有一批在途，验证程序每轮等待并比较，没有测量调度重叠或性能收益。这份验证保留为 Runner 层实验；BatchEngine 与生成入口的接入见
        <a href="/deepinfer/lesson/8">第八课</a>。
      </p>

      {/* ==================== 回到 DeepInfer 的主线 ==================== */}
      <div className="section-divider"><span>回到 DeepInfer 的主线</span></div>

      <Callout type="tip" title="对照 DeepInfer">
        <p>
          DeepInfer 的{' '}
          <a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/model_runner.py" target="_blank" rel="noreferrer"><code>ModelRunner</code></a>
          区分输入准备、主模型执行与采样，
          <a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/zos_status.py" target="_blank" rel="noreferrer"><code>WorkerStepState</code></a>
          保存跨轮仍需使用的状态。本课把这些职责放进现有计算路径，让"设备已经执行"和"主机可以提交"在代码里分开。单批限制、Python 句柄和异常清理策略是本项目的教学选择，没有复现上游 ZOS。
        </p>
      </Callout>

      <p>
        接着读<a href="/deepinfer/lesson/8">第八课</a>，看调度器怎样保存这份结果，并处理计算途中到来的请求和取消。需要扩大并行范围时，还要重新检查张量使用者与释放事件，不能简单删掉单批限制。
      </p>

      <div className="flex gap-2 flex-wrap" style={{ marginTop: 24 }}>
        <a href="/deepinfer/mini" className="no-underline">← 十四课目录</a>
        <a href={`/deepinfer/lesson/${prev}`} className="no-underline">← 上一课</a>
        <a href={`/deepinfer/lesson/${next}`} className="no-underline">下一课 →</a>
      </div>
    </div>
  );
}
