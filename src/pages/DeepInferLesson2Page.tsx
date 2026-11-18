import { Callout, CodeBlock } from '../components/CodeBlock';
import { PageHeader } from '../components/PageHeader';

const DOC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/docs';
const SRC = 'https://github.com/AkiYangDev/mini-deepinfer/blob/main/minideepinfer';

export function DeepInferLesson2Page() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="第二课：真实权重与 KV Cache"
        date="更新于 2026-10"
        readingTime="阅读约 6 分钟"
        tags={['真实权重', 'KV Cache', '张量缓存', 'logits 对照']}
      />

      <p>
        <a href="/deepinfer/mini">十四课目录</a> ·{' '}
        <a href={`${DOC}/ARCHITECTURE.md`} target="_blank" rel="noreferrer">架构设计</a> ·{' '}
        <a href={`${DOC}/VALIDATION.md`} target="_blank" rel="noreferrer">验证方法</a>
      </p>

      <p>
        <a href="/deepinfer/lesson/1">第一课</a>用整数 Runner 解释请求如何推进。
        这一课把 Runner 换成真实模型，Engine 的同步执行流程可以继续使用。
      </p>

      <p>
        入门模型是 <strong>DeepSeek-R1-Distill-Qwen-1.5B</strong>，采用 Qwen2 架构。
        当前实现包含普通全因果 attention、GQA、默认 RoPE、SiLU MLP 和独立的 embedding / LM head。
        配置不符合这些条件时会报错，避免把不支持的模型当成已经兼容。
      </p>

      {/* ==================== 准备环境与权重 ==================== */}
      <div className="section-divider"><span>准备环境与权重</span></div>

      <p>
        真实模型需要 PyTorch、Transformers 和 safetensors；NPU 还需要与 PyTorch、CANN 匹配的{' '}
        <code>torch_npu</code>。在已有匹配环境中执行：
      </p>

      <CodeBlock
        language="bash"
        code={`python -m pip install -e ".[model]"`}
      />

      <p>
        安装不会自动选择 <code>torch_npu</code> 或安装 CANN。先按实际设备准备好环境，再安装项目。
        单纯阅读第一课不需要这些依赖。
      </p>

      <p>
        权重版本固定为 <code>ad9f0ae0864d7fbcd1cd905e3c6c5b069cc8b562</code>。
        在能访问 Hugging Face 的环境中下载：
      </p>

      <CodeBlock
        language="bash"
        code={`python -c "from huggingface_hub import snapshot_download; snapshot_download('deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B', revision='ad9f0ae0864d7fbcd1cd905e3c6c5b069cc8b562', local_dir='weights/DeepSeek-R1-Distill-Qwen-1.5B', allow_patterns=['*.json', '*.safetensors', '*.model', 'LICENSE', 'README.md'])"`}
      />

      <p>
        模型执行只读取本地文件，支持单文件或带索引的分片 safetensors。
        加载器检查权重名、形状和缺失参数；不执行远端模型代码。
      </p>

      {/* ==================== 生成一段文本 ==================== */}
      <div className="section-divider"><span>生成一段文本</span></div>

      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.generate \\
  --model weights/DeepSeek-R1-Distill-Qwen-1.5B \\
  --device npu:0 --dtype bfloat16 \\
  --prompt "What is 1 plus 1? Answer in one short sentence." \\
  --max-new-tokens 48 --cache-capacity 512`}
      />

      <p>
        默认使用权重附带的 chat template。<code>--raw</code> 可以直接编码原始文本。
        生成采用 greedy，命中 EOS 或输出长度上限时结束。
        短输出可能仍处于该模型的思考过程，长度上限表示本次计算结束，不保证回答已写完。
      </p>

      <p>
        <code>cache-capacity</code> 是最多存储的输入 token 数，必须容纳 prompt 和最多{' '}
        <code>max_new_tokens - 1</code> 个后续计算输入。
        普通 attention 会显式构造分数矩阵；先用短输入学习执行流程，
        不把模型配置中的最大位置长度当成本实现已经验证的上下文容量。
      </p>

      {/* ==================== 沿着 Runner 读计算 ==================== */}
      <div className="section-divider"><span>沿着 Runner 读计算</span></div>

      <p>
        <a href={`${SRC}/model_runner.py`} target="_blank" rel="noreferrer"><code>model_runner.py</code></a>{' '}
        分成三个可直接跟踪的步骤：
      </p>

      <ol>
        <li>
          <code>prepare_input()</code> 检查请求、绝对位置和槽位映射，并创建设备张量。
        </li>
        <li>
          <code>execute_main_model()</code> 调用项目自己的{' '}
          <a href={`${SRC}/models/qwen2.py`} target="_blank" rel="noreferrer"><code>qwen2.py</code></a>，
          返回 logits。
        </li>
        <li>
          <code>execute_sample()</code> 选择最后一个输入位置对应的下一个 token。
          返回 Engine 后，再提交输出与请求状态。
        </li>
      </ol>

      <Callout type="tip" title="对照 DeepInfer">
        <p>
          这样的职责划分对照 DeepInfer 的输入准备、主模型与采样执行。
          当前 Runner 在返回前等待设备完成，因此仍是同步版本。
          后续学习跨轮状态时，才会改变结果提交与资源回收的时机，
          具体来源见{' '}
          <a href={`${DOC}/SOURCE_MAP.md`} target="_blank" rel="noreferrer">源码映射</a>。
        </p>
      </Callout>

      <p>
        <a href={`${SRC}/tensor_cache.py`} target="_blank" rel="noreferrer"><code>TensorKVCache</code></a>{' '}
        按 <code>{'[layer, slot, kv_head, head_dim]'}</code> 保存 K/V。
        每层先把本轮 K/V 写入 <code>slot_mapping</code>，再按 <code>context_slots</code> 读取有序上下文。
        K 已应用 RoPE，V 保持原值。GQA 在参考路径中展开 KV heads 后计算 attention；
        这里采用可读的 gather，没有融合 paged attention。
      </p>

      {/* ==================== 检查 logits ==================== */}
      <div className="section-divider"><span>检查 logits</span></div>

      <CodeBlock
        language="bash"
        code={`python -m minideepinfer.verify \\
  --model weights/DeepSeek-R1-Distill-Qwen-1.5B \\
  --device npu:0 --dtype bfloat16 \\
  --output outputs/qwen2-verification.json`}
      />

      <p>
        脚本使用固定输入和四步固定后续 token，分别比较项目实现与 Transformers 的完整重算、
        两者的缓存执行，以及各自的缓存与重算。每步记录最大绝对误差、RMS 误差和 top-1 一致比例。
        prefill 比较全部输入位置，decode 比较最后一个位置。它验证数值与缓存行为，不评估模型回答质量。
      </p>

      <p>
        默认 BF16 容差是 <code>atol=0.125, rtol=0.01</code>，FP32 是 <code>atol=1e-4, rtol=2e-4</code>。
        真实权重的 CPU FP32 检查中，参考模型自身的缓存与重算也产生约 <code>7.56e-5</code> 的最大差异，
        因此 FP32 阈值按这个对照设置。它不代表所有模型、长度和算子都适用，误差与测试输入需要一起报告。
      </p>

      <p>无需下载权重的 CPU 测试使用两层、小维度、固定随机权重的 Qwen2，检查非连续槽位、因果遮罩、缓存复用和 checkpoint 加载：</p>

      <CodeBlock
        language="bash"
        code={`python -m unittest discover -s tests -v`}
      />

      <p>
        安装模型依赖后共执行 36 项测试；未安装时运行 19 项引擎测试，另外 17 项明确标为跳过。
        同步动态批处理与分块 prefill 见<a href="/deepinfer/lesson/3">第三课</a>，
        包含重复 <code>--prompt</code> 的真实运行命令；
        当前没有融合 attention、调度重叠或性能基准。
        真机记录与适用环境见{' '}
        <a href={`${DOC}/VALIDATION.md`} target="_blank" rel="noreferrer">验证记录</a>。
      </p>

      <div className="flex gap-2 flex-wrap" style={{ marginTop: 24 }}>
        <a href="/deepinfer/mini" className="no-underline">{'←'} 十四课目录</a>
        <a href="/deepinfer/lesson/1" className="no-underline">{'←'} 上一课</a>
        <a href="/deepinfer/lesson/3" className="no-underline">{'下一课 →'}</a>
      </div>
    </div>
  );
}
