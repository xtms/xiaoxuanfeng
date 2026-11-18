import { CodeBlock } from '../components/CodeBlock';
import { MermaidDiagram } from '../components/MermaidDiagram';
import { PageHeader } from '../components/PageHeader';

const DOC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/docs';
const SRC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/minideepinfer';

export function DeepInferLesson11Page() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="第十一课：下一轮先发出去"
        date="更新于 2026-10"
        readingTime="阅读约 8 分钟"
        tags={['跨轮', '设备 token', '流水线', '重叠']}
      />

      <p>
        前面把计算发起和结果收取拆开了，但 BatchEngine 仍要读到上一轮 token，才能填写下一轮的 <code>Step.input_ids</code>。这条依赖没有改变：只要下一轮输入还从 CPU 取，结果处理就始终挡在 forward 前面。
      </p>
      <p>
        这次增加一个独立的固定批次实验。两条请求各生成四个 token，成员和长度提前确定，不检查 EOS。上一轮采样结果留在设备上，下一轮按请求 ID 找回自己的那一行，直接作为模型输入。这样，CPU 可以先提交下一轮 forward，再读取上一轮结果。
      </p>
      <p>
        代码在 <a href={`${SRC}/decode_pipeline.py`} target="_blank" rel="noreferrer"><code>decode_pipeline.py</code></a>。本课保留固定批次入口，后续章节复用其执行和状态持有方法。现有 BatchEngine 和默认生成入口保持原来的执行方式。
      </p>

      <div className="section-divider"><span>DeepInfer 的顺序是什么</span></div>

      <p>
        固定参考版本仍为 <code>8b161497</code>。它的 <a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py" target="_blank" rel="noreferrer"><code>Worker.execute_model_step()</code></a> 明确分成四步：
      </p>
      <ol>
        <li>执行本轮主模型。</li>
        <li>等上一轮采样完成，处理上一轮结果。</li>
        <li>采样本轮结果。</li>
        <li>prompt 或关闭 ZOS 时当轮处理结果；开启 ZOS 的 decode 留到下一轮。</li>
      </ol>
      <p>
        因此，上一轮 token 并没有消失。它保存在设备上，经 <a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/zos_status.py" target="_blank" rel="noreferrer"><code>MetadataZOS</code></a> 传给本轮输入准备。<code>remap[i] = j</code> 表示本轮第 i 行对应上一轮第 j 行；前后批次成员不完全相同时，还要区别新请求和已有请求，并处理长度修正。
      </p>
      <p>
        本课只保留最基本的设备 token 接续和 forward / post-process / sample 顺序。没有接入上游 C++ 调度器、MTP、长度修正、图执行或资源池；实验也将首轮 prefill 的结果延后到下一轮收取，这一点与原版 prompt 当轮处理不同。
      </p>

      <div className="section-divider"><span>用两条请求走一遍</span></div>

      <p>
        假设上一轮行顺序是 <code>[A, B]</code>，设备采样结果是 <code>[11751, 369]</code>。下一轮变成 <code>[B, A]</code>，映射就是 <code>[1, 0]</code>：
      </p>
      <CodeBlock
        language="python"
        code={`rows = torch.tensor([1, 0], dtype=torch.long, device=device)
device_input_ids = previous.tokens.index_select(0, rows)
# 得到 [369, 11751]，不需要先把两个 token 读回 CPU。`}
      />
      <p>
        本次真实 2B 检查的首轮恰好产生了这两个 token。行号由 CPU 已知的请求 ID 计算，token 值来自设备上的 <code>argmax</code>。每轮都可以换序，但这一版不能增加或删除成员。
      </p>
      <p>
        <code>ModelRunner.prepare_batch()</code> 新增实验用的 <code>device_input_ids</code> 参数。只接受 decode 批次，每条请求恰好一个 long token，shape 和设备必须匹配。使用这条路径时，主机 <code>Step.input_ids</code> 固定为 <code>(0,)</code> 占位；它只用于检查长度和元数据，embedding 实际读取的是设备张量。占位值没有进入模型计算。
      </p>
      <p>
        这份张量必须来自本实验上一轮的采样。这里没有为了检查 token 值再做一次 CPU 读取。普通同步路径继续按原方法检查主机 token 并构建设备输入，已有调用不受影响。位置、槽位、隔离 mask 和 remap 行号仍要准备、上传，尚未消除这些开销。
      </p>
      <p>核心循环如下，省略了资源持有和错误处理：</p>
      <CodeBlock
        language="python"
        code={`current = forward(previous.tokens)
finish(previous)       # 等上一轮的结果拷贝，然后处理 CPU 输出
sample(current)       # 产生本轮设备 token，异步拷贝到主机
previous = current`}
      />
      <p>下面画的是提交和读取的依赖，<strong>不是测量得到的时间线</strong>：</p>
      <MermaidDiagram
        chart={`sequenceDiagram
    participant CPU
    participant NPU as 同一条 NPU stream
    CPU->>NPU: 提交第 0 轮 forward / sample / D2H
    CPU->>NPU: 按请求映射设备 token，提交第 1 轮 forward
    CPU->>NPU: 等第 0 轮 D2H 事件
    CPU->>CPU: 处理第 0 轮输出
    CPU->>NPU: 提交第 1 轮 sample / D2H
    CPU->>NPU: 提交第 2 轮 forward
    CPU->>CPU: 收取第 1 轮结果`}
      />
      <p>
        同一条 stream 保证“上一轮采样 → 本轮读取 token → 本轮 forward”的设备顺序。CPU 只等上一轮的事件，不必为了读取上一轮输出而等待本轮 forward 完成。模型 forward 之间仍串行执行；改变的是 CPU 处理结果的位置。
      </p>

      <div className="section-divider"><span>结果收取了，引用也不能随便丢</span></div>

      <p>
        上一轮事件完成，说明它自己的计算和 D2H 已经结束。但是本轮还会使用它的设备 token。代码在提交前保留本轮状态，并把上一轮 token 张量放进本轮的 <code>buffers</code>。收取上一轮后，可以移除上一轮状态；下一位使用者持有的那份 token 引用继续有效。
      </p>
      <p>
        运行期间最多保留两轮状态。每条请求的完整槽位从开始保留到整批结束，不做中途回收。Runner 的前缀元数据在 forward 提交后推进，代表已经提交的缓存写入；CPU 的输出列表在结果事件结束后推进。这两个进度不能混为一谈，因此该实验必须独占一份空闲 Runner。
      </p>
      <p>
        最后一轮没有后继 forward，需要单独收取。任何主机异常都走同一个收尾：先等待本实验 stream，再清理请求前缀、DeltaNet 状态和槽位。如果等待本身失败，就保留状态、张量引用和槽位，禁止开始新一轮。CPU 测试注入了这个分支；它不等于已经验证真实设备故障恢复。
      </p>

      <div className="section-divider"><span>实际检查到了什么</span></div>

      <p>
        2026-10-24，在单逻辑 Ascend 910C 上复用已有 Qwen3.5-2B 权重，以 FP32 运行。Python 3.12.13、PyTorch 2.10.0+cpu、torch_npu 2.10.0.post6、CANN 9.1.0。两条 raw prompt 长度为 5、3，各固定生成 4 个 token，EOS 关闭，缓存容量 32，CPU 线程 1。
      </p>
      <p>
        同步基线先完整执行，随后实验使用同一份只读权重和独立缓存。对照脚本不把基线 forward 插入实验的两轮之间。每次收取检查请求顺序、位置、槽位、greedy token 和完整 logits。
      </p>

      <table className="my-5">
        <thead>
          <tr>
            <th>检查</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>四轮、八组完整 logits</td><td>最大绝对差为 0，沿用 <code>atol=1e-4, rtol=2e-4</code></td></tr>
          <tr><td><code>[A,B] → [B,A] → [A,B] → [B,A]</code></td><td>输出与同步 greedy 逐轮一致</td></tr>
          <tr><td>主机调用顺序</td><td>下一轮 forward 在上一轮结果回调之前；尾轮单独收取</td></tr>
          <tr><td>上一轮结果回调抛异常</td><td>此时下一轮 forward 已提交；排空后缓存状态清空</td></tr>
          <tr><td>正常结束、异常清理、同 Runner 再运行</td><td>均归还 32/32 槽位，前缀与线性状态为 0</td></tr>
        </tbody>
      </table>

      <p>
        <a href={`${DOC}/results/2026-10-24/qwen35-2b-decode-pipeline-npu-fp32.json`} target="_blank" rel="noreferrer">原始报告</a> 保留输入、输出、调用顺序、误差与 12 份执行源码 SHA。本次只启动一次验证程序、加载一次已有权重，没有下载或新采集 trace。正常路径 4 轮、异常路径提交 2 轮、复用检查 1 轮，加上同步基线 4 轮，共 11 次 forward。进程退出后，本项目容器只剩原有保活进程。
      </p>
      <p>
        本地新增 9 项 CPU 测试，覆盖 Qwen2 和 Qwen3.5 的换序数值对照、设备输入直传、单轮尾部、异常后复用、排空失败时持有资源、非法输入拒绝。Transformers 5.12.1 环境共 103 项全部通过；4.46.3 环境 91 项通过、12 项独立参考跳过；无模型依赖时 51 项通过、52 项跳过。
      </p>
      <p>
        这次没有性能计时或重叠 trace。eager 算子提交、元数据复制和结果诊断仍可能等待设备，不能凭调用顺序宣称提速，也不能把这个固定实验称为完整 ZOS。
      </p>

      <div className="section-divider"><span>自己运行</span></div>

      <p>在仓库目录、已安装 PyTorch 的环境中，无需下载权重即可先跑小模型：</p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.verify_decode_pipeline --device cpu \\
  --output outputs/decode-pipeline-cpu.json`}
      />
      <p>
        真实模型沿用 <a href="/deepinfer/lesson/4">第四课</a> 的依赖和权重准备，在匹配的 Ascend 环境执行：
      </p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.verify_decode_pipeline \\
  --model weights/Qwen3.5-2B --device npu:0 \\
  --output outputs/decode-pipeline-npu.json`}
      />
      <p>
        <a href="/deepinfer/lesson/12">第十二课</a> 在这个循环上增加 EOS、回调取消和成员退出：多算的结果丢弃，缓存等最后使用事件完成后归还。本课仍保留固定成员、固定长度的原始对照；现有 BatchEngine 的单批限制继续保留。
      </p>

      <div className="flex gap-2 flex-wrap" style={{ marginTop: 24 }}>
        <a href="/deepinfer/mini" className="no-underline">← 十四课目录</a>
        <a href="/deepinfer/lesson/10" className="no-underline">← 上一课</a>
        <a href="/deepinfer/lesson/12" className="no-underline">下一课 →</a>
      </div>
    </div>
  );
}
