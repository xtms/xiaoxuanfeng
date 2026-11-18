import { Callout, CodeBlock } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

const DOC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/docs';
const SRC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/minideepinfer';

export function DeepInferLesson4Page() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="第四课：Qwen3.5 的两种缓存"
        date="更新于 2026-10"
        readingTime="阅读约 7 分钟"
        tags={['Qwen3.5', 'HybridCache', 'DeltaNet', '混合注意力']}
      />

      <p>
        这一课使用 2026 年发布的 Qwen3.5 小模型。0.8B 用于开发验证，2B 作为主要运行示例。先只处理文本，使用项目自己的前向计算和状态缓存；视觉编码器、MTP、量化与专用融合算子不在本课范围内。
      </p>

      <div className="section-divider"><span>为什么 KV Cache 不够用</span></div>

      <p>
        Qwen3.5-0.8B 和 2B 都有 24 层，每组三层 Gated DeltaNet 后接一层完整注意力。两种层记住历史的方式不同：
      </p>

      <table className="my-5">
        <thead>
          <tr>
            <th>层</th>
            <th>保留什么</th>
            <th>怎样找到它</th>
            <th>随什么增长</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>完整注意力</td>
            <td>每个历史 token 的 K、V</td>
            <td>层号与逻辑 token 槽位</td>
            <td>已计算 token 数</td>
          </tr>
          <tr>
            <td>Gated DeltaNet</td>
            <td>卷积窗口与递推矩阵</td>
            <td>请求 ID 与层号</td>
            <td>活跃请求数；单请求状态大小固定</td>
          </tr>
        </tbody>
      </table>

      <p>
        <a href={`${SRC}/hybrid_cache.py`} target="_blank" rel="noreferrer"><code>HybridCache</code></a>
        {' '}只为六层完整注意力分配 KV 张量。线性层状态首次使用时创建，请求完成、取消或失败后删除。<code>max_num_seqs</code> 限制活跃请求数；逻辑 token 槽位预算仍控制准入和最大上下文。它还不是按设备空闲内存自动计算容量的管理器。
      </p>

      <p>
        在这两个型号中，每个请求仅 FP32 递推矩阵就约占 18 MiB，另有卷积窗口。状态不随上下文长度增长，但多个并发请求仍各自需要一份。
      </p>

      <div className="section-divider"><span>沿一层 DeltaNet 读计算</span></div>

      <p>
        实现位于{' '}
        <a href={`${SRC}/models/qwen3_5.py`} target="_blank" rel="noreferrer"><code>GatedDeltaNet.forward()</code></a>
        。先对合并后的 token 做投影，再按请求边界分别计算卷积和递推。令 <code>S</code> 为上一 token 的状态，<code>k</code>、<code>v</code> 为当前输入：
      </p>

      <CodeBlock
        language="text"
        code={`衰减历史：S = exp(g) * S
预测当前值：prediction = kᵀ S
计算修正：delta = beta * (v - prediction)
写入状态：S = S + k deltaᵀ
读出结果：output = qᵀ S`}
      />

      <p>
        <code>q</code>、<code>k</code> 先归一化，<code>q</code> 再按 head dimension 缩放；递推保持 FP32。读出后做带 SiLU gate 的归一化与输出投影。完整注意力另有 Q/K 归一化、部分 RoPE 和输出 gate，不能直接复用 Qwen2 attention。
      </p>

      <Callout type="info" title="最容易看混的地方">
        <p>
          这里逐 token 展开递推，便于观察状态如何改变。它没有采用上游的分块并行 DeltaNet 内核，也不承诺与成熟框架相同的吞吐。
        </p>
      </Callout>

      <div className="section-divider"><span>两个请求为什么不会串状态</span></div>

      <p>
        Runner 把每个 <code>Step</code> 的请求 ID 和 token 边界传给模型。线性层分别读取 <code>{'(request_id, layer)'}</code> 对应的状态，不能把 <code>{'[A 的 token, B 的 token]'}</code> 当成一段连续历史扫描。完整注意力仍通过隔离 mask 阻止跨请求读取 KV。
      </p>

      <p>
        prompt 分块时，中间块更新两类缓存，但不采样；最后一块才产生第一个输出 token。取消一个尚未完成 prompt 的请求，也必须同时删除递推状态和归还逻辑槽位。相关对照见{' '}
        <a href={`${DOC}/../tests/test_qwen3_5.py`} target="_blank" rel="noreferrer"><code>test_qwen3_5.py</code></a>
        。
      </p>

      <div className="section-divider"><span>准备权重</span></div>

      <p>
        CPU 环境可以安装本课固定的参考依赖。Ascend 环境先保留已经匹配的 PyTorch、torch_npu 与 CANN，再安装本项目；不要为了模型接口直接替换现有设备环境。
      </p>

      <CodeBlock
        language="bash"
        code={`python -m pip install -e ".[qwen35]"

hf download Qwen/Qwen3.5-0.8B \\
  --revision 2fc06364715b967f1860aea9cf38778875588b17 \\
  --local-dir weights/Qwen3.5-0.8B

hf download Qwen/Qwen3.5-2B \\
  --revision 15852e8c16360a2fea060d615a32b45270f8a8fc \\
  --local-dir weights/Qwen3.5-2B`}
      />

      <p>
        官方 checkpoint 同时包含文本、视觉和 MTP 参数。加载器读取原始 safetensors 索引，只加载文本部分，并恢复共享 embedding / LM head；不需要先转换权重。
      </p>

      <div className="section-divider"><span>运行与对照</span></div>

      <p>
        两个 <code>--prompt</code> 会进入同一个同步批处理引擎。默认关闭思考模板并采用 greedy：
      </p>

      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.generate \\
  --model weights/Qwen3.5-2B --device cpu --dtype float32 \\
  --prompt "用两句话解释 KV Cache 的作用。" \\
  --prompt "What is 1 plus 1? Answer in one short sentence." \\
  --max-new-tokens 128 --cache-capacity 512 \\
  --max-num-seqs 2 --max-batched-tokens 16 --chunked-prefill`}
      />

      <p>
        可先将模型改为 0.8B，减少加载和调试成本。NPU 的 dtype 与实际验证范围见{' '}
        <a href={`${DOC}/VALIDATION.md`} target="_blank" rel="noreferrer">验证记录</a>
        ；CPU 也需要加载完整文本模型。
      </p>

      <p>
        固定 token 对照比较项目缓存、项目完整重算，以及 Transformers 的缓存与重算：
      </p>

      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.verify \\
  --model weights/Qwen3.5-0.8B --device cpu --dtype float32 \\
  --prefill-chunk-size 2 --output qwen35-cpu.json

python -m minideepinfer.verify_batch \\
  --model weights/Qwen3.5-0.8B --device cpu --dtype float32 \\
  --output qwen35-batch-cpu.json`}
      />

      <p>
        Qwen3.5 的批次对照使用独立的 Transformers 请求，各自保存状态。普通 attention mask 无法隔离线性层递推，不能直接套用 Qwen2 的 packed 参考方法。
      </p>

      <p>
        BF16 需要另外说明扫描方式与状态存储精度。固定轨迹已在逐 token / FP32 状态参考下零容差通过，原生分块差异保留；命令与边界见{' '}
        <a href={`${DOC}/BF16_REFERENCE.md`} target="_blank" rel="noreferrer">BF16 对照说明</a>
        。
      </p>

      <div className="section-divider"><span>与 DeepInfer 的关系</span></div>

      <p>
        模型计算对照 Qwen / Transformers；引擎的输入准备、执行、采样、结果提交和资源归属继续按照{' '}
        <a href={`${DOC}/SOURCE_MAP.md`} target="_blank" rel="noreferrer">DeepInfer 职责映射</a>
        {' '}展开。本课展示同一请求生命周期怎样管理不同模型状态，不把 Qwen3.5 的 DeltaNet 称为 DeepInfer 特有机制。
      </p>

      <div className="flex gap-2 flex-wrap" style={{ marginTop: 24 }}>
        <a href="/deepinfer/mini" className="no-underline">← 十四课目录</a>
        <a href="/deepinfer/lesson/3" className="no-underline">← 上一课</a>
        <a href="/deepinfer/lesson/5" className="no-underline">下一课 →</a>
      </div>
    </div>
  );
}
