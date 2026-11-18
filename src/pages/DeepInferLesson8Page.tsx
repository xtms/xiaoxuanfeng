import { Callout, CodeBlock } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

const DOC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/docs';
const SRC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/minideepinfer';

export function DeepInferLesson8Page() {
  const prev = 7;
  const next = 9;
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="第八课：BatchEngine 分步执行"
        date="更新于 2026-10"
        readingTime="阅读约 8 分钟"
        tags={['分步执行', 'launch/finish', '取消', 'abort']}
      />

      <p>
        可以。但"取消请求"和"设备停止计算"是两回事。
      </p>
      <p>
        假设 A、B 已经一起送进 NPU。A 的用户这时断开连接，B 还在等待回答。引擎应该丢弃 A 这一轮的输出，让 B 继续；A 占用的缓存则要等本批计算结束后再归还。否则新来的 C 可能拿到相同槽位，而 NPU 还在往里面写 A 的数据。
      </p>
      <p>
        第七课已经让模型返回一份待收取的结果。这一课把它接进现有{' '}
        <a href={`${SRC}/batch_engine.py`} target="_blank" rel="noreferrer"><code>BatchEngine</code></a>，由同一个调度器管理等待队列、请求进度和槽位。原同步路径继续保留。
      </p>

      {/* ==================== 先看一次完整运行 ==================== */}
      <div className="section-divider"><span>先看一次完整运行</span></div>

      <p>在仓库目录、已经安装 PyTorch 的环境中执行：</p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.verify_deferred_engine \\
  --device cpu --output outputs/deferred-engine-cpu.json`}
      />
      <p>
        无需下载权重。程序创建一个随机初始化的小 Qwen3.5，用真实模型计算和混合缓存检查执行顺序。它不能用于聊天。
      </p>
      <p>
        程序会打印六轮结果：A 先分块读取 prompt，B 随后加入；A、B 一起 decode 时取消 A，再让 C 使用归还的槽位；最后单独检查 EOS。同步与分步执行共享只读权重，各自使用独立缓存，每轮比较 logits 和请求进度。
      </p>

      {/* ==================== 把原来的 step 拆在哪里 ==================== */}
      <div className="section-divider"><span>把原来的 step 拆在哪里？</span></div>

      <p>
        原来的 <code>step()</code> 一次完成调度、计算和结果提交。新模式把这次调用拆成两段：
      </p>
      <CodeBlock
        language="python"
        code={`# 讲解片段：runner 是已经加载好模型的 ModelRunner。
engine = BatchEngine(DeferredRunner(runner), cache_capacity=32,
                     max_num_seqs=2, max_num_batched_tokens=4,
                     chunked_prefill=True, deferred=True)
request = engine.submit([2, 3, 4, 5, 6], max_new_tokens=4)

plans = engine.launch_step()
# 此处可以接收新请求，或取消已有请求。
outputs = engine.finish_step()`}
      />
      <p>
        <code>launch_step()</code> 仍调用原来的 <code>_schedule()</code>，选择请求、预留槽位并提交模型计算。它返回本轮 Step 元组，方便观察调度结果；没有工作时返回空元组，不需要再收取结果。
      </p>
      <p>
        新准入的请求此时已经是 <code>RUNNING</code>，但 <code>num_cached_tokens</code> 和 <code>output_ids</code> 仍表示上一次成功提交的进度。即使模型已经算完，这两个字段也不会自己变化。
      </p>
      <p>
        <code>finish_step()</code> 等待结果可读，校验整批 token，再更新这些字段。中间 prompt 块只推进缓存计数，最后一块才产生首个输出；decode 消费上一轮 token，再追加新 token。EOS 和长度上限也在这里判断。
      </p>
      <p>
        这两段之间，仍然由同一个 CPU 线程调用引擎。可以 <code>submit()</code> 和 <code>cancel()</code>，不能再 <code>launch_step()</code>。下一轮 decode 依赖本轮结果，当前版本没有为它猜一个输入。
      </p>
      <p>
        需要原有的逐轮用法时，继续调用 <code>step()</code> 或 <code>run()</code>。在分步模式下，<code>step()</code> 会连续调用发起与收取，中间立即等待，因此这条便利路径本身不提供调度重叠。
      </p>

      {/* ==================== 取消 A 时，到底改什么 ==================== */}
      <div className="section-divider"><span>取消 A 时，到底改什么？</span></div>

      <CodeBlock
        language="python"
        code={`# 讲解片段：这一批已经发出，request 是其中的请求。
engine.cancel(request.request_id)
outputs = engine.finish_step()`}
      />
      <p>
        <code>cancel()</code> 先把 A 标记为 <code>CANCELLED</code>，并通知本批结果丢弃 A 的采样。已经发出的设备计算照常完成，A 的槽位和线性状态继续保留。
      </p>
      <p>
        收取整批结果后，A 对应的 <code>StepOutput</code> 包含 <code>token_id=None</code>、<code>finish_reason="cancelled"</code>。A 的输出列表和已提交缓存计数保持原值，随后删除它的 Runner 状态并归还槽位。B 正常提交自己的输出。C 只能在下一次调度时取得空闲槽位。
      </p>
      <p>
        等待中的请求还没有设备状态，可以直接取消。在一批在途期间，引擎会把运行请求的清理统一留到该批安全结束后，代码因此不需要再维护一套并行回收队列。
      </p>

      <Callout type="info" title="这里最容易混淆的是">
        <p>
          <code>None</code> 不能单独说明发生了什么：中间 prompt 块也没有输出。要结合 <code>phase</code>、请求状态和 <code>finish_reason</code> 判断。把取消当成非法采样，会连带误杀同批的 B；把中间块当成生成结束，又会提前截断 prompt。
        </p>
      </Callout>

      {/* ==================== 等待报错 ==================== */}
      <div className="section-divider"><span>等待报错，不能当作已经结束</span></div>

      <p>普通主机异常与"无法确认设备完成"需要分开处理。</p>
      <p>
        如果模型提交后主机代码抛错，Runner 会先等待自己的流，再清理本批模型状态。确认完成后，引擎把本批未取消的请求标成 <code>FAILED</code>，归还槽位；等待队列中的其他请求仍可继续。
      </p>
      <p>
        如果等待或排空设备工作本身失败，引擎继续持有本批句柄、张量和槽位，拒绝下一次发起。此时 <code>FAILED</code> 表示请求不能继续生成，并不表示设备资源已经空闲。
      </p>
      <p>
        <code>abort_step()</code> 用于明确放弃整批：再次等待设备工作结束，成功后清理本批状态和槽位；等待仍失败就继续保留。它会删除本批已有的前缀，不能恢复到发起前接着生成。失败请求需要从 prompt 重新提交。
      </p>
      <p>
        等待失败、排空失败和恢复清理用受控 CPU 错误测试；真实 Ascend 910C 上只验证了 forward 提交后的主机异常，没有验证设备故障恢复。
      </p>

      {/* ==================== 在 Ascend 910C 上的结果 ==================== */}
      <div className="section-divider"><span>在 Ascend 910C 上的结果</span></div>

      <p>复用第四课的固定 Qwen3.5-2B 权重，执行：</p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.verify_deferred_engine \\
  --model weights/Qwen3.5-2B --device npu:0 \\
  --output outputs/qwen35-2b-deferred-engine-fp32.json`}
      />
      <p>
        本次环境为 Python 3.12.13、PyTorch 2.10.0+cpu、torch_npu 2.10.0.post6、CANN 9.1.0，单逻辑设备、FP32。六轮共比较十组 logits，最大绝对差为 <strong>0</strong>，沿用 <code>atol=1e-4, rtol=2e-4</code>。
      </p>

      <table className="my-5">
        <thead>
          <tr><th>检查</th><th>本次观察</th></tr>
        </thead>
        <tbody>
          <tr><td>分块 prompt、动态加入、混合 decode</td><td>两条路径每轮使用相同 Step；提交前请求进度和主机前缀不变</td></tr>
          <tr><td>A 在第三轮取消</td><td>本轮输出丢弃，原已提交进度不变；收取前槽位没有归还</td></tr>
          <tr><td>C 加入、B 继续</td><td>C 在第四轮复用 A 的槽位，B、C 的输出和进度逐轮一致</td></tr>
          <tr><td>长度与 EOS</td><td>B、C 按长度结束；另一个相同 prompt 请求在首个采样处遇 EOS</td></tr>
          <tr><td>forward 后注入主机异常</td><td>本批请求失败，流完成后清理；32/32 槽位归还，前缀和线性状态均为 0</td></tr>
        </tbody>
      </table>

      <p>
        EOS 示例使用 B 已观测的首个输出 token 作为停止符，专门检查停止与回收，不代表模型遇到了自然的文本结束符。同步对照在第三轮先完成 A 再取消；分步路径在收取前取消，所以必须丢弃 A 本轮多算出的 token。后续只比较仍在继续的请求，不把这项预期差别写成精度问题。
      </p>
      <p>
        实际 token IDs、六轮 Step、每个请求的停止原因及执行源码 SHA 见
        <a href={`${DOC}/results/2026-10-24/qwen35-2b-deferred-engine-npu-fp32.json`} target="_blank" rel="noreferrer">原始报告</a>。同步 Runner 是本轮接口变更的对照，模型数学对独立 Transformers 的验证沿用
        <a href={`${DOC}/VALIDATION.md`} target="_blank" rel="noreferrer">已有记录</a>。
      </p>
      <p>离线生成也可以加上 <code>--deferred</code> 使用这条路径，例如：</p>
      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.generate \\
  --model weights/Qwen3.5-2B --device npu:0 --dtype float32 \\
  --prompt "What is a KV cache?" --max-new-tokens 32 \\
  --cache-capacity 128 --max-num-seqs 2 --max-batched-tokens 4 \\
  --chunked-prefill --deferred`}
      />

      {/* ==================== 这一课借鉴 DeepInfer 的哪一部分 ==================== */}
      <div className="section-divider"><span>这一课借鉴 DeepInfer 的哪一部分？</span></div>

      <Callout type="tip" title="对照 DeepInfer">
        <p>
          固定版本 DeepInfer 的{' '}
          <a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py" target="_blank" rel="noreferrer"><code>LLMEngine.post_process()</code></a>
          {' '}通过 <code>WorkerStepState</code> 取得本轮元数据和采样输出，处理请求结果后收集待释放资源。源码明确注明，worker 在调用它前已经同步本轮采样完成事件。
          <a href="https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py#L64" target="_blank" rel="noreferrer"><code>DeferredRelease</code></a>
          {' '}还要照顾调用方继续读取输出的生命周期。
        </p>
        <p>
          本课沿用"执行结果需要由引擎提交、资源要等使用结束才能释放"这条主线。Python FIFO、一次预留最大槽位、单批在途和显式 <code>finish_step()</code> 是教学简化，尚未复现上游 ZOS、跨轮执行重叠或资源池。
        </p>
      </Callout>

      <p>
        本课先验证接口和生命周期，没有吞吐或延迟结论。
        <a href="/deepinfer/lesson/9">第九课</a>接着在两段之间准备下一条文本，并用同负载计时与实际时间线检查重叠。
      </p>

      <div className="flex gap-2 flex-wrap" style={{ marginTop: 24 }}>
        <a href="/deepinfer/mini" className="no-underline">← 十四课目录</a>
        <a href={`/deepinfer/lesson/${prev}`} className="no-underline">← 上一课</a>
        <a href={`/deepinfer/lesson/${next}`} className="no-underline">下一课 →</a>
      </div>
    </div>
  );
}
