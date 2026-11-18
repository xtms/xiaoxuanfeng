import { Callout, CodeBlock } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

const DOC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/docs';
const SRC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/minideepinfer';

export function DeepInferLesson6Page() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="第六课：NPU 算完了，CPU 就能读吗"
        date="更新于 2026-10"
        readingTime="阅读约 7 分钟"
        tags={['NPU', '事件', '流', '读取边界']}
      />

      <p>
        第五课由我们手动通知"结果准备好了"。现在换成 Ascend 910C 的真实事件。仍然跟着 A、B、C 看同一个问题：B 需要上一轮选出的 token，CPU 到底等到哪一步才能读？
      </p>

      <p>
        如果结果还在设备上，就要先拷回 CPU。采样完成和这次拷贝完成是两个时刻，等待前一个不够。这一课还会遇到一个容易误解的行为：刚创建、没有记录过任何操作的 NPU 事件，查询结果竟然是 <code>True</code>。
      </p>

      <div className="section-divider"><span>运行与输出</span></div>

      <p>
        在已经克隆的仓库目录、已有匹配 PyTorch / torch_npu / CANN 的 Ascend 环境中执行：
      </p>

      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.npu_step_demo \\
  --device npu:0 --output outputs/npu-events.json`}
      />

      <p>
        程序没有加载权重，用两行分数和几个整数检查事件、跨流读取和槽位复用。设备上的 <code>kv</code> 是 6 个整数组成的示意存储，不是模型产生的真实 K/V。该输入在实际 Ascend 910C 上得到：
      </p>

      <CodeBlock
        language="text"
        code={`事件未记录时：原生 query=True，保护后=False
[B, C] 接到的输入：[21, 30]；下一轮结果：[22, 31]
末次使用事件记录前回收：[]；完成后：['A']
D 复用槽位：[0, 1]；旧快照：[10, 11]；新值：[99, 99]
检查通过=True；槽位回收=6/6`}
      />

      <p>
        原始
        <a href={`${DOC}/../results/2026-10-24/npu-step-events.json`} target="_blank" rel="noreferrer">结果 JSON</a>
        {' '}记录了 Python 3.12.13、PyTorch 2.10.0+cpu、torch_npu 2.10.0.post6，以及执行代码和已安装事件实现的 SHA256。
      </p>

      <div className="section-divider"><span>一个还没记录过的事件，为什么返回 True？</span></div>

      <p>先看这两行：</p>

      <CodeBlock
        language="python"
        code={`event = torch.npu.Event()
event.query()`}
      />

      <p>
        在本次环境里，结果是 <code>True</code>。这里还没有把标记放到任何一串操作后面，也就没有正在等待的操作。固定 v2.10.0 的{' '}
        <a href="https://github.com/Ascend/pytorch/blob/v2.10.0/torch_npu/csrc/core/npu/NPUEvent.cpp#L77" target="_blank" rel="noreferrer"><code>NPUEvent::query()</code></a>
        {' '}在底层事件尚未创建时直接返回 <code>true</code>，与实测一致。
      </p>

      <Callout type="info" title="最容易误解的地方">
        <p>
          如果拿这种新事件给第五课的资源管理器，它可能以为"已经完成"，把仍要使用的空间交出去。
          <a href={`${SRC}/npu_events.py`} target="_blank" rel="noreferrer"><code>RecordedEvent</code></a>
          因此额外记住一件事：这次事件有没有成功记录过。只有记录成功后，<code>query()</code> 才会查询设备；在那之前始终返回 <code>False</code>。
        </p>
        <p>
          同一个包装对象只允许记录一次。一轮计算用一个新对象，避免后面又重新记录，把原本代表上一轮的完成条件换掉。记录失败时也不会把标记设成成功；等待一个没有记录过的事件会报错。
        </p>
      </Callout>

      <div className="section-divider"><span>三串操作，各自排队</span></div>

      <p>
        流（stream）可以先理解为一串按顺序执行的设备操作。本例使用三条流：
      </p>

      <table className="my-5">
        <thead>
          <tr>
            <th>流</th>
            <th>依次做什么</th>
            <th>完成标记</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>producer</td>
            <td>从两行分数选出 token，再加偏移得到 <code>{'[11, 21]'}</code></td>
            <td><code>sampled_ready</code></td>
          </tr>
          <tr>
            <td>readback</td>
            <td>等待 <code>sampled_ready</code>，再把 token 拷到 CPU</td>
            <td><code>ready</code></td>
          </tr>
          <tr>
            <td>consumer</td>
            <td>等待 <code>sampled_ready</code>，按请求映射下一批输入、保存旧存储快照，再算整数示例的下一轮结果并拷回 CPU</td>
            <td><code>last_use</code>，以及下一份状态的 <code>next_done</code></td>
          </tr>
        </tbody>
      </table>

      <p>
        <code>wait()</code> 把等待关系交给另一条设备流。例如 readback 要等采样结果，后面的拷贝就排在这个条件之后。CPU 调用这次等待，并不表示设备此刻已经完成。
      </p>

      <p>
        <code>synchronize()</code> 则让 CPU 停在这里，直到事件前面的操作完成。本例把 <code>ready</code> 放在设备到主机的拷贝之后，所以等到它完成，CPU 才能读主机缓冲区。
      </p>

      <p>
        接口行为对照{' '}
        <a href="https://www.hiascend.com/document/detail/en/Pytorch/2600/apiref/PyTorchNativeapi/docs/en/native_apis/pytorch_2-10-0/torch-cuda.md" target="_blank" rel="noreferrer">PyTorch 2.10.0 的昇腾支持表</a>
        {' '}和{' '}
        <a href="https://github.com/Ascend/pytorch/blob/v2.10.0/torch_npu/npu/streams.py" target="_blank" rel="noreferrer">v2.10.0 的 Stream / Event 实现</a>
        {' '}核查，并在本次安装版本上实测。支持表不替代具体软件与硬件组合的验证。
      </p>

      <div className="section-divider"><span>缓冲区要留下来，读它的人也要等对地方</span></div>

      <p>
        把数据正确拷回 CPU，需要同时满足两个条件：拷贝执行完了，而且这段内存还没有被释放或写成别的数据。
      </p>

      <p>
        <a href={`${SRC}/npu_events.py`} target="_blank" rel="noreferrer"><code>PendingTokens</code></a>
        {' '}保存主机缓冲区、完成事件和一组需要保留的对象引用。主机缓冲区使用 <code>pin_memory=True</code>，拷贝调用 <code>{'copy_(..., non_blocking=True)'}</code>。<code>inputs_for()</code> 在 <code>ready</code> 完成前拒绝读取，完成后才把缓冲区转成整数，并复用第五课的请求映射。
      </p>

      <p>
        本例 B 在旧批次的第 1 行，因此接上 21；C 是新请求，使用自己的 30。设备侧也根据同一个请求映射生成 <code>{'[21, 30]'}</code>，再加 1 得到 <code>{'[22, 31]'}</code>。加 1 只是下一次模型计算的替身，便于直接检查结果。
      </p>

      <p>
        前一次状态由 CPU 读完并关闭后，仍可能被后续设备操作使用。本例会读取 A 的旧槽位保存快照，这个消费者在整次实验中已规划好，并由 <code>last_use</code> 覆盖。取消 A 只停止需要交还给 A 的输出，不强制中断这些操作，也不允许再为 A 接纳新的模型步骤。
      </p>

      <p>
        在最后一次使用还没有记录到流里时，包装事件保持未完成，A 的槽位继续保留。等 <code>last_use</code> 真正完成，才允许 D 拿走 <code>{'(0, 1)'}</code>。D 写入 99 之前已经确认旧读取完成，所以旧快照是 <code>{'[10, 11]'}</code>，当前存储则成为 <code>{'[99, 99]'}</code>。
      </p>

      <p>
        B 同时被前后两份状态持有。即使旧状态已经用完，后一份状态的 CPU 读取没有关闭，B 仍不能回收。这里继续使用第五课的 <code>DeferredRelease</code>，只把它接收的状态接口提取出来，让整数状态和真实缓冲区状态遵守同一套回收规则。
      </p>

      <Callout type="tip" title="最容易混淆的一点">
        <p>
          Python 强引用保证对象还在，不负责安排设备上的先后顺序；事件安排顺序，不替你保存 Python 对象。本例同时保留引用和设置事件依赖，所有初始化在开始实验前完成，跨流访问结束后才允许复用。槽位归还表示逻辑归属结束，不表示设备缓存分配器已经把物理内存还给系统。
        </p>
      </Callout>

      <div className="section-divider"><span>这次确认了什么？</span></div>

      <p>
        本次真实运行确认：未记录事件得到保护；主机读取等待 D2H 完成；设备按请求映射输入；A 的旧数据读取完成后才被覆盖；所有逻辑槽位最终归还。测试中的 <code>copy_query_before_wait=false</code> 是这一次查询的观察值，程序不要求每次都必须看到 <code>False</code>，小操作也可能已经完成。
      </p>

      <p>
        程序有意先等 CPU 收到旧结果，再发起后续消费者，让几个边界便于检查。这里没有模型 forward，没有测量设备执行重叠，也没有吞吐或延迟结论。报告里的 <code>allocated_bytes</code> / <code>reserved_bytes</code> 是本进程 PyTorch 分配器的统计，不包括设备的全部上下文与其他进程占用。
      </p>

      <p>
        5 项新的零依赖测试还检查了失败分支：记录失败、同步抛错、提前读取、重复记录，以及没有记录的末次使用事件。保留对象引用的测试会先删掉调用方自己的引用，确认状态仍能保护对象；结束后丢弃状态，引用才释放。CPU 模拟异常不代表真实设备故障恢复已验证。
      </p>

      <CodeBlock
        language="bash"
        code="python -m unittest discover -s tests -p test_npu_events.py -v"
      />

      <p>
        <a href="/deepinfer/lesson/7">第七课</a>
        把模型输入、logits 和设备采样结果放进在途状态，接到真实 Runner，并对照同步执行检查分块 prompt、取消和失败清理。CPU 准备与 NPU 计算能重叠多少，仍需单独测量。
      </p>

      <div className="flex gap-2 flex-wrap" style={{ marginTop: 24 }}>
        <a href="/deepinfer/mini" className="no-underline">← 十四课目录</a>
        <a href="/deepinfer/lesson/5" className="no-underline">← 上一课</a>
        <a href="/deepinfer/lesson/7" className="no-underline">下一课 →</a>
      </div>
    </div>
  );
}
