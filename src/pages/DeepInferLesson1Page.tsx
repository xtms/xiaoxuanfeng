import { Callout, CodeBlock } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

const DOC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/docs';
const SRC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/minideepinfer';
const REPO = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main';

export function DeepInferLesson1Page() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="第一课：跟踪一个请求"
        date="更新于 2026-10"
        readingTime="阅读约 6 分钟"
        tags={['请求生命周期', 'prefill/decode', '槽位', '回收']}
      />

      <p>
        <a href="/deepinfer/mini">十四课目录</a> ·{' '}
        <a href={`${DOC}/ARCHITECTURE.md`} target="_blank" rel="noreferrer">架构设计</a> ·{' '}
        <a href={`${DOC}/ROADMAP.md`} target="_blank" rel="noreferrer">开发路线</a>
      </p>

      <Callout type="tip">
        先运行，再沿着一次请求读代码。Python 3.10+，无需 PyTorch 或模型权重：
        <CodeBlock code={`python -m minideepinfer`} language="bash" />
      </Callout>

      <p>
        当前是控制流程模拟。<code>CountingRunner</code> 把最后一个输入 token 加一，方便逐步跟踪；
        它没有模型、tokenizer 或张量 KV。Ascend 910C 是后续真实执行路径的目标平台。
      </p>

      {/* ==================== 1. 提交请求 ==================== */}
      <div className="section-divider"><span>1. 提交请求</span></div>

      <p>
        入口是{' '}
        <a href={`${SRC}/demo.py`} target="_blank" rel="noreferrer"><code>demo.py</code></a>：
      </p>

      <CodeBlock
        language="python"
        code={`from minideepinfer import Engine
from minideepinfer.demo import CountingRunner

engine = Engine(CountingRunner(), cache_capacity=8)
request = engine.submit([10, 11], max_new_tokens=3)
for output in engine.run():
    print(output)
print(request.output_ids)  # [12, 13, 14]`}
      />

      <p>
        提交时请求处于 <code>waiting</code>，只进入队列。<code>Engine.step()</code> 选择它后，
        预留最多需要的 4 个槽位，将状态改为 <code>running</code>。多个请求按 FIFO 顺序逐个运行；
        当前没有 batching。
      </p>

      <Callout type="info" title="为什么是 4 个槽位">
        <p>
          每次计算消费输入并预测下一个 token，最后一个预测结果直接返回，不再送进模型。
          因此最大计算输入数是 <code>{'len(prompt) + max_new_tokens - 1'}</code>。
        </p>
        <p>
          如果最大需求超过总容量，<code>submit()</code> 立即报错。
          排队请求不占用槽位，前一个请求退出后才为后一个分配。
        </p>
      </Callout>

      {/* ==================== 2. prefill 与 decode ==================== */}
      <div className="section-divider"><span>2. prefill 与 decode</span></div>

      <p>
        <a href={`${SRC}/engine.py`} target="_blank" rel="noreferrer"><code>Engine.step()</code></a>{' '}
        构造不可变的 <code>Step</code>，交给 Runner：
      </p>

      <table className="my-5">
        <thead>
          <tr>
            <th>步骤</th>
            <th>phase</th>
            <th>input_ids</th>
            <th>positions</th>
            <th>slot_mapping</th>
            <th>context_slots</th>
            <th>输出</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>prefill</td>
            <td><code>(10, 11)</code></td>
            <td><code>(0, 1)</code></td>
            <td><code>(0, 1)</code></td>
            <td><code>(0, 1)</code></td>
            <td><code>12</code></td>
          </tr>
          <tr>
            <td>2</td>
            <td>decode</td>
            <td><code>(12,)</code></td>
            <td><code>(2,)</code></td>
            <td><code>(2,)</code></td>
            <td><code>(0, 1, 2)</code></td>
            <td><code>13</code></td>
          </tr>
          <tr>
            <td>3</td>
            <td>decode</td>
            <td><code>(13,)</code></td>
            <td><code>(3,)</code></td>
            <td><code>(3,)</code></td>
            <td><code>(0, 1, 2, 3)</code></td>
            <td><code>14</code></td>
          </tr>
        </tbody>
      </table>

      <p>
        <code>positions</code> 是序列中的绝对位置；<code>slot_mapping</code> 是本轮输入对应的写入位置；
        <code>context_slots</code> 按序列顺序给出历史与本轮输入的缓存位置。
        未来真实 Runner 可以据此写入新 K/V，并读取当前因果范围内的历史。
      </p>

      <Callout type="info" title="输出进度与缓存进度">
        <p>
          第三步结束时，输出是 <code>[12, 13, 14]</code>，成功计算过的输入是 <code>[10, 11, 12, 13]</code>。
          <code>14</code> 尚未成为计算输入，所以没有它的 KV。Engine 用 <code>output_ids</code> 和{' '}
          <code>num_cached_tokens</code> 分别记录两种进度。
        </p>
      </Callout>

      {/* ==================== 3. 提交、停止与回收 ==================== */}
      <div className="section-divider"><span>3. 提交、停止与回收</span></div>

      <p>Runner 返回一个已经选出的 token，Engine 再推进计数并检查停止条件：</p>

      <ul>
        <li>
          命中 <code>eos_token_id</code>，原因是 <code>eos</code>。
          演示保留 EOS 在 <code>output_ids</code> 中。
        </li>
        <li>
          达到 <code>max_new_tokens</code>，原因是 <code>length</code>。
        </li>
        <li>
          调用 <code>cancel(request_id)</code>，状态改为 <code>cancelled</code>，
          支持排队时和两步计算之间取消。
        </li>
        <li>
          Runner 抛错，状态改为 <code>failed</code>，保存错误摘要并向调用者重新抛出；
          调用者处理后可以继续运行剩余请求。
        </li>
      </ul>

      <p>
        完成、取消和失败都会释放该运行请求的槽位。
        <a href={`${SRC}/kv_cache.py`} target="_blank" rel="noreferrer"><code>SlotPool</code></a>{' '}
        用空闲堆和归属表表达最基本的资源所有权。它没有张量，不是 paged attention；
        槽位位置也不保证在物理存储中连续。
      </p>

      <p>
        整个接口只在单线程顺序调用。Runner 返回或抛错前必须完成本轮工作；
        未来加入异步设备执行时，需要先加入事件与延迟释放协议。
        终止后的 <code>num_cached_tokens</code> 是历史进度，不代表仍占有对应缓存。
        请求记录保留在 Engine 内，当前用于小型教学运行。
      </p>

      {/* ==================== 4. 验证执行逻辑 ==================== */}
      <div className="section-divider"><span>4. 验证执行逻辑</span></div>

      <CodeBlock
        language="bash"
        code={`python -m unittest discover -s tests -v`}
      />

      <p>
        <a href={`${REPO}/tests/test_engine.py`} target="_blank" rel="noreferrer">
          <code>tests/test_engine.py</code>
        </a>{' '}
        检查停止、取消、失败、容量与槽位复用。另一个测试 Runner 用槽位保存前缀和，
        逐步消费输入，再与每步完整重算对照。这样可以发现位置偏移、漏消费 token，
        以及旧槽位污染后续请求等问题。
      </p>

      <p>
        这些检查验证元数据和生命周期逻辑。
        <a href="/deepinfer/lesson/2">第二课</a>接入 DeepSeek-R1-Distill-Qwen-1.5B 的真实 forward 与张量 KV，
        并对照参考模型检查 logits。
      </p>

      <div className="flex gap-2 flex-wrap" style={{ marginTop: 24 }}>
        <a href="/deepinfer/mini" className="no-underline">{'←'} 十四课目录</a>
        <a href="/deepinfer/lesson/2" className="no-underline">{'下一课 →'}</a>
      </div>
    </div>
  );
}
