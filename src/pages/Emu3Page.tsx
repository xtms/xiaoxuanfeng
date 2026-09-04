import { MermaidDiagram } from '../components/MermaidDiagram';
import { CodeBlock, Callout, ResourceTable } from '../components/CodeBlock';

const GH = 'https://github.com/baaivision/Emu3/blob/main';

function SrcLink({ path }: { path: string }) {
  return (
    <a href={`${GH}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function Emu3Page() {
  return (
    <div className="prose max-w-none">
      <h1>Emu3 — 训练框架实现架构分析</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">🏷️ 自动驾驶 · 多模态 · 智源 · 大一统</span>
        <span className="page-meta-item">📖 源码分析</span>
      </div>
      <p>
        北京智源人工智能研究院（BAAI）开源的<strong>多模态大一统模型</strong> Emu3，核心思想是把<strong>图像 / 视频 / 文本全部离散化为 token</strong>，在一个 LLaMA 风格的 decoder-only transformer 上<strong>仅用 next-token prediction</strong> 做统一训练。本文基于 <code>/data/sd/Emu3</code> 源码，从模型实现到训练框架逐层拆解，重点对齐 Pi-0.5 页面的<strong>代码级逐步分析粒度</strong>——每个关键点都给出真实源码片段 + 逐行解释 + 文件路径。
      </p>

      <Callout type="tip">
        <strong>核心结论：</strong>Emu3 与 LLaVA / Qwen-VL 范式的本质区别在于——<strong>视觉 token 直接作为额外 vocabulary ID 嵌入 LLM 的同一个 embed_tokens</strong>，没有 Q-Former / MLP 投影器。「视觉即语言」：图像由 32768 词表的 VQ-VAE 变成 <code>&lt;|visual token NNNNNN|&gt;</code> 文本 token，文本与视觉共享同一个 184622 词表的 next-token 预测。
      </Callout>

      {/* ==================== 1. 仓库整体布局 ==================== */}
      <div className="section-divider"><span>仓库整体布局</span></div>

      <h3>1.1 目录结构</h3>
      <MermaidDiagram chart={`
graph TD
    R["📦 Emu3 仓库根目录"]
    R --> TOP["📄 顶层 demo：image_generation /<br/>multimodal_understanding /<br/>autoencode / gradio_demo"]
    R --> PKG["emu3/ 核心 Python 包"]
    R --> SCR["scripts/ 训练脚本 + DeepSpeed 配置"]
    R --> REP["replicate_demo/ · assets/"]

    PKG --> MLLM["mllm/ 多模态 LLM 主体"]
    PKG --> TK["tokenizer/ 视觉 VQ tokenizer"]
    PKG --> TR["train/ 训练框架"]

    MLLM --> MC["configuration_emu3.py<br/>Emu3Config"]
    MLLM --> MM["modeling_emu3.py<br/>Emu3Model / Emu3ForCausalLM"]
    MLLM --> MT["tokenization_emu3.py<br/>Emu3Tokenizer (tiktoken BPE)"]
    MLLM --> MP["processing_emu3.py<br/>Emu3Processor 统一处理器"]

    TK --> VC["configuration_emu3visionvq.py"]
    TK --> VM["modeling_emu3visionvq.py<br/>Emu3VisionVQModel (MoVQGAN)"]
    TK --> VI["image_processing_emu3visionvq.py"]

    TR --> TT["train.py 主训练入口"]
    TR --> TD["datasets.py Emu3FeatureDataset"]
    TR --> TP["prepare_data.py 离线预处理"]

    SCR --> S1["t2i_sft.sh / t2i_sft_offload.sh"]
    SCR --> Z1["zero3.json / zero3_offload.json"]
      `} />

      <Callout type="warning">
        <strong>注意：</strong>仓库内<strong>没有</strong> <code>emu3/configs/</code> 目录，没有 YAML/JSON 模型配置。所有模型配置以 Python <code>PretrainedConfig</code> 默认值硬编码，运行时从 HuggingFace Hub checkpoint 加载。发布的是 <strong>SFT 训练代码</strong>，预训练与 DPO 训练脚本（README TODO 未勾选）及 VQ tokenizer 自身的训练代码<strong>均未发布</strong>。
      </Callout>

      {/* ==================== 2. 模型架构实现 ==================== */}
      <div className="section-divider"><span>模型架构实现</span></div>

      <h3>2.1 LLM Backbone（Emu3-8B）</h3>
      <p>
        <code>emu3/mllm/modeling_emu3.py</code> 顶部注明改编自 <code>transformers/models/llama/modeling_llama.py</code>，但<strong>完整重写了一份 LLaMA 架构</strong>而非直接使用 <code>LlamaForCausalLM</code>。关键类层次：<code>Emu3PreTrainedModel</code> → <code>Emu3Model</code>（bare decoder）/ <code>Emu3ForCausalLM</code>（带 LM head）。
      </p>
      <table>
        <thead><tr><th>参数</th><th>值（Emu3-8B）</th></tr></thead>
        <tbody>
          <tr><td><code>vocab_size</code></td><td><strong>184622</strong>（含 32768 视觉 token）</td></tr>
          <tr><td><code>hidden_size</code></td><td>4096</td></tr>
          <tr><td><code>intermediate_size</code></td><td>14336</td></tr>
          <tr><td><code>num_hidden_layers</code></td><td>32</td></tr>
          <tr><td><code>num_attention_heads / num_key_value_heads</code></td><td>32 / 8（GQA 4:1）</td></tr>
          <tr><td><code>hidden_act</code></td><td>silu（SwiGLU：gate/up/down_proj）</td></tr>
          <tr><td><code>max_position_embeddings</code></td><td>9216（训练覆盖为 10240）</td></tr>
          <tr><td><code>rope_theta</code></td><td>1_000_000.0</td></tr>
          <tr><td><code>image_area</code></td><td>720×720 = 518400</td></tr>
          <tr><td><code>attention 实现</code></td><td>eager / FlashAttention2 / SDPA 可切</td></tr>
        </tbody>
      </table>
      <p>
        内部组件：<code>Emu3RMSNorm</code> → N × <code>Emu3DecoderLayer</code>，每层含 <code>Emu3Attention</code>（由 <code>EMU3_ATTENTION_CLASSES</code> 路由到 Flash/Sdpa）+ <code>Emu3MLP</code>；RoPE 支持 <code>LinearScaling</code> / <code>DynamicNTKScaling</code> 两种扩展。仓库发布的所有 LLM checkpoint（Emu3-Stage1 / Chat / Gen）都是同一个 8B 结构，仅权重不同。
      </p>

      <Callout type="info">
        <strong>最本质的设计：</strong>图像 token 直接作为额外 vocabulary ID 嵌入到 LLM 的<strong>同一个</strong> <code>nn.Embedding[184622, 4096]</code> 中——没有单独的视觉投影器。这是 Emu3「真统一 token 化」与 LLaVA「LLM + 外部视觉编码器」范式的核心分野。
      </Callout>

      <h3>2.2 VQ Tokenizer（MoVQGAN 风格）</h3>
      <p><code>emu3/tokenizer/modeling_emu3visionvq.py:749</code> → <code>Emu3VisionVQModel</code>：</p>
      <table>
        <thead><tr><th>参数</th><th>值</th></tr></thead>
        <tbody>
          <tr><td><code>codebook_size</code></td><td><strong>32768</strong></td></tr>
          <tr><td><code>embed_dim / z_channels</code></td><td>4 / 4</td></tr>
          <tr><td><code>temporal_downsample_factor</code></td><td>4</td></tr>
          <tr><td><code>ch / ch_mult</code></td><td>256 / [1, 2, 2, 4]</td></tr>
          <tr><td><code>num_res_blocks</code></td><td>2</td></tr>
          <tr><td>空间下采样</td><td>2^(len(ch_mult)−1) = <strong>8</strong></td></tr>
        </tbody>
      </table>
      <p>
        <code>Emu3VisionVQVectorQuantizer</code>（line 447）：<code>nn.Embedding(32768, 4)</code> + L2 距离 + <code>torch.argmin</code> 最近邻查找。编码器是 4 级 ResNet 块 + 中间 attention + 时间维因果 Conv3d 下采样；解码器用 <code>SpatialNorm</code>（以量化嵌入 zq 为条件的空间归一化）。单张图像先复制到 T=4 再编码、编码后 squeeze 回单帧。1:1 的 720×720 图像 → 90×90 = <strong>8100 个 VQ token</strong>。
      </p>

      <h3>2.3 文本 Tokenizer</h3>
      <p>
        <code>Emu3Tokenizer(PreTrainedTokenizer)</code> 基于 <strong>tiktoken</strong>（OpenAI BPE）而非 SentencePiece。词表 = <code>mergeable_ranks + 3 + 205 + 32768</code>。关键特殊 token：
      </p>
      <table>
        <thead><tr><th>Token</th><th>含义 / ID</th></tr></thead>
        <tbody>
          <tr><td><code>&lt;|image start|&gt; / &lt;|image end|&gt;</code></td><td>boi=151852 / eoi=151853</td></tr>
          <tr><td><code>&lt;|image token|&gt;</code></td><td>img_token=151851</td></tr>
          <tr><td><code>&lt;|extra_200|&gt; / &lt;|extra_201|&gt;</code></td><td>eol=151846（行尾）/ eof=151847（图尾）</td></tr>
          <tr><td><code>&lt;|visual token NNNNNN|&gt;</code></td><td>151854 起，32768 个视觉 token</td></tr>
        </tbody>
      </table>

      {/* ==================== 3. 训练框架实现（总览） ==================== */}
      <div className="section-divider"><span>训练框架实现（总览）</span></div>

      <h3>3.1 数据流水线（两阶段）</h3>
      <MermaidDiagram chart={`
flowchart LR
    subgraph Offline["离线 prepare_data.py"]
        O1["JSON 样本<br/>{name, text, image_path}"]
        O2["smart_resize(image_area=720*720)"]
        O3["Emu3VisionVQImageProcessor"]
        O4["Emu3VisionVQModel.encode() → VQ codes"]
        O5["每样本一个 .pth + train.json 清单"]
        O1 --> O2 --> O3 --> O4 --> O5
    end
    subgraph Online["在线 train.py"]
        N1["Emu3FeatureDataset 读 .pth"]
        N2["5% 概率 null prompt（CFG 训练）"]
        N3["构造序列:<br/>bos + prompt + boi + {h}*{w} + img<br/>+ visual_tokens + eol + eof + eoi"]
        N4["Emu3Tokenizer tokenize"]
        N5["Loss masking: 非视觉 token → -100"]
        N1 --> N2 --> N3 --> N4 --> N5
    end
    Offline -->|"tokenized .pth"| Online
    Online --> T["Trainer + ZeRO-3<br/>CrossEntropyLoss next-token"]`} />

      <Callout type="tip">
        <strong>设计动机：</strong>先把所有图像离线 tokenize 成 <code>.pth</code>，训练时只读 token ID——避免训练时反复跑 VQ encoder，把昂贵的大规模 tokenize 前置到离线阶段。
      </Callout>

      <h3>3.2 损失函数（一句话）</h3>
      <CodeBlock language="python" title="Emu3ForCausalLM.forward()（line 1255）" code={`loss_fct = CrossEntropyLoss()
shift_logits  = logits[..., :-1, :].contiguous().view(-1, vocab_size)
shift_labels  = labels[..., 1:].contiguous().view(-1)
loss = loss_fct(shift_logits, shift_labels)`} />
      <p>
        唯一损失是 <strong>next-token prediction 的 CrossEntropyLoss</strong>。默认 <code>apply_loss_on_only_vision=True</code>：labels 中所有非视觉 token 置为 −100，只有 ID 在 <code>[bov, eov]</code> 区间的 32768 个视觉 token 位置参与 loss —— SFT 阶段只学「文本 prompt → 图像 token」。VQ tokenizer 的重建损失不在此仓库（VQ 模型假设已单独预训练完成）。
      </p>

      <h3>3.3 优化器 / 精度 / 分布式（速查）</h3>
      <table>
        <thead><tr><th>项</th><th>值（scripts/t2i_sft.sh）</th></tr></thead>
        <tbody>
          <tr><td><strong>分布式</strong></td><td>DeepSpeed ZeRO-3（overlap_comm, contiguous_gradients）；可选 CPU offload</td></tr>
          <tr><td><strong>混合精度</strong></td><td>BF16 + TF32</td></tr>
          <tr><td><strong>优化器</strong></td><td>AdamW（β₁=0.9, β₂=0.95, ε=1e-6）</td></tr>
          <tr><td><strong>学习率</strong></td><td>1e-5，min_lr=1e-6</td></tr>
          <tr><td><strong>调度器</strong></td><td>cosine_with_min_lr（lr_scheduler_kwargs 注入 min_lr）</td></tr>
          <tr><td><strong>正则</strong></td><td>weight_decay=0.1, max_grad_norm=5.0, warmup=30</td></tr>
          <tr><td><strong>Batch</strong></td><td>per_device 2 × grad_accum 4，4 epochs，4 dataloader workers</td></tr>
          <tr><td><strong>省显存</strong></td><td>gradient_checkpointing，每 500 步保存保留 10 个</td></tr>
        </tbody>
      </table>

      {/* ==================== 4. 端到端流水线 ==================== */}
      <div className="section-divider"><span>端到端流水线</span></div>

      <MermaidDiagram chart={`
sequenceDiagram
    participant P as Emu3Processor
    participant L as Emu3ForCausalLM
    participant PC as PrefixConstrained
    participant V as Emu3VisionVQModel

    Note over P,L: 文生图 (mode='G')
    P->>P: calculate_generate_size → h×w 网格
    P->>P: bos + text + boi + "{h}*{w}" + img_token
    P->>L: input_ids
    loop 每步生成
        L->>L: embed_tokens → 32×DecoderLayer → lm_head
        PC-->>L: 强制网格: 每 width+1 出 eol，<br/>末尾 eof→eoi→eos，其它只出 32768 视觉 token
    end
    P->>V: 提取 [h,w] codes → VQ decode → 像素

    Note over P,L: 图文理解 (mode='U')
    P->>V: image → VQ encode → codes
    P->>P: to_imgstr() → "<|visual token NNNNNN|>" 字符串
    P->>L: "USER: {boi+h*w+img+visual+eol+eof+eoi}{text}. ASSISTANT:"
    L-->>P: 标准自回归文本生成 → batch_decode`} />

      {/* ==================== 5. 核心代码逐步分析 ==================== */}
      <div className="section-divider"><span>核心代码逐步分析</span></div>

      <p>以下按训练数据流（离线 VQ 化 → 在线样本构造 → 模型前向 → 损失计算 → 分布式训练）逐文件给出<strong>真实源码片段</strong>与逐行解析，粒度对齐 Pi-0.5 页面。</p>

      <h2>5.1 训练入口 train.py — 三大 dataclass + 主流程</h2>
      <p>文件: <code>emu3/train/train.py</code></p>
      <pre>{`@dataclass
class ModelArguments:
    model_name_or_path: Optional[str] = field(default="BAAI/Emu3-Gen")

@dataclass
class DataArguments:
    data_path: Optional[str] = field(default=None)
    null_prompt_prob: float = field(default=0.05)
    apply_loss_on_only_vision: bool = field(default=True)
    apply_loss_on_only_text: bool = field(default=False)
    ignore_index: int = field(default=-100)
    visual_token_pattern: str = field(default="<|visual token {token_id:06d}|>")
    codebook_size: Optional[int] = field(default=32768)

@dataclass
class TrainingArguments(tf.TrainingArguments):
    report_to: List[str] = field(default_factory=list)
    remove_unused_columns: bool = field(default=False)
    min_learning_rate: Optional[float] = None
    attn_type: Optional[str] = field(default="fa2")
    image_area: Optional[int] = None
    max_position_embeddings: Optional[int] = None

def update_configs(model_config, args, fields):
    cross_update = lambda a, b, field_name: (
        setattr(b, field_name, getattr(a, field_name))
        if getattr(b, field_name, None) is None else
        setattr(a, field_name, getattr(b, field_name))
    )
    for f in fields:
        cross_update(model_config, args, f)`}</pre>
      <p><strong>逐行解析：</strong></p>
      <ul>
        <li><code>DataArguments.null_prompt_prob=0.05</code>：以 5% 概率把文本 prompt 替换为空串，让模型学会无条件生成分支，推理时即可做 classifier-free guidance（CFG）。</li>
        <li><code>apply_loss_on_only_vision=True</code>：训练的关键开关——loss 只在视觉 token 位置计算（见 5.2 的 mask 实现）。</li>
        <li><code>visual_token_pattern="{'<|visual token {token_id:06d}|>'}"</code>：视觉 token 的字符串模板，6 位零填充（<code>000042</code>）。</li>
        <li><code>TrainingArguments</code> 继承 HF 的 <code>TrainingArguments</code>，额外加 <code>attn_type</code>（默认 "fa2" 即 FlashAttention2）、<code>image_area</code>、<code>max_position_embeddings</code>、<code>min_learning_rate</code>；<code>remove_unused_columns=False</code> 保证 dataset 返回的自定义字段不被 Trainer 丢弃。</li>
        <li><code>update_configs</code>：双向同步——若 model_config 侧字段为 None 就从 CLI 拷贝，反之亦然。例如把 <code>--image_area 518400</code> 注入 <code>model_config.image_area</code>，模型才知道生成目标面积。</li>
      </ul>
      <pre>{`def train():
    parser = tf.HfArgumentParser((ModelArguments, DataArguments, TrainingArguments))
    model_args, data_args, training_args = parser.parse_args_into_dataclasses()

    model_config = Emu3Config.from_pretrained(model_args.model_name_or_path)
    update_configs(model_config, training_args, ["image_area", "max_position_embeddings"])
    if training_args.min_learning_rate is not None:
        training_args.lr_scheduler_kwargs["min_lr"] = training_args.min_learning_rate

    os.environ["WANDB_DIR"] = osp.join(training_args.output_dir, "wandb")

    model = Emu3ForCausalLM.from_pretrained(
        model_args.model_name_or_path,
        config=model_config,
        attn_implementation="flash_attention_2" if training_args.attn_type == "fa2" else None,
        torch_dtype=torch.bfloat16 if training_args.bf16 else None,
    )

    tokenizer = Emu3Tokenizer.from_pretrained(
        model_args.model_name_or_path,
        model_max_length=training_args.max_position_embeddings,
        padding_side="right",
        use_fast=False,
    )

    train_dataset = Emu3FeatureDataset(data_args, tokenizer=tokenizer)
    trainer = tf.Trainer(model=model, args=training_args, train_dataset=train_dataset)

    if list(pathlib.Path(training_args.output_dir).glob("checkpoint-*")):
        trainer.train(resume_from_checkpoint=True)
    else:
        trainer.train()
    trainer.save_state()

    torch.cuda.synchronize()
    trainer.save_model(training_args.output_dir)`}</pre>
      <ul>
        <li><code>HfArgumentParser</code>：把 CLI 参数自动分桶到三个 dataclass，免去手写 argparse。</li>
        <li><code>attn_implementation="flash_attention_2"</code>：<code>attn_type=="fa2"</code> 时启用 FA2，要求 bf16 + Ampere 以上 GPU；<code>torch_dtype=torch.bfloat16</code> 让所有权重以 bf16 载入，省显存且与 FA2 兼容。</li>
        <li><code>Emu3Tokenizer... use_fast=False</code>：Emu3 tokenizer 基于 <code>tiktoken</code>，没有 HF fast 实现；<code>padding_side="right"</code> 让 padding 在序列末尾，与 causal attention mask 一致。</li>
        <li><strong>断点续训</strong>：检测 output_dir 里已有 <code>checkpoint-*</code> 就 <code>resume_from_checkpoint=True</code>。</li>
        <li>末尾 <code>torch.cuda.synchronize()</code>：等所有异步 CUDA 操作结束再保存，防止 checkpoint 写坏。</li>
      </ul>

      <h2>5.2 Emu3FeatureDataset — 样本构造与 loss mask（训练核心）</h2>
      <p>文件: <code>emu3/train/datasets.py</code></p>
      <pre>{`class Emu3FeatureDataset(Dataset):
    def __init__(self, args, tokenizer):
        super().__init__()
        self.args = args
        with open(args.data_path) as f:
            d = json.load(f)
        self.path_prefix = d["prefix"]
        self.filelist = d["path_list"]
        self.tokenizer = tokenizer
        self.bov = tokenizer.encode(args.visual_token_pattern.format(token_id=0))[0]
        self.eov = tokenizer.encode(args.visual_token_pattern.format(token_id=args.codebook_size - 1))[0]

    def __getitem__(self, index: int):
        path = osp.join(self.path_prefix, self.filelist[index])
        data = torch.load(path)

        image_tokens = data["images"]             # shape: (h, w), numpy int array
        image_prompt = self.format_image_prompt(image_tokens)

        p_prob = random.random()
        if p_prob < self.args.null_prompt_prob:   # 5% CFG 空提示
            prompt = ""
        else:
            prompt = data["texts"]

        input = self.tokenizer.bos_token + prompt + image_prompt
        sample = self.tokenizer(
            input,
            padding="max_length",
            return_token_type_ids=False,
            return_tensors="pt",
        )

        labels = sample["input_ids"]
        if self.args.apply_loss_on_only_vision:
            labels = torch.where(
                torch.logical_and(labels >= self.bov, labels <= self.eov),
                labels,
                self.args.ignore_index,           # -100
            )

        sample["labels"] = labels
        for k, v in sample.items():
            sample[k] = v.squeeze(0)              # 去掉 batch 维度
        return sample`}</pre>
      <ul>
        <li><code>bov / eov</code>：视觉 token id 的上下界。用模板 tokenize <code>token_id=0</code> 与 <code>token_id=32767</code> 得到 —— 因为视觉 token 在词表中是<strong>连续区间</strong>（<code>[151854, 184621]</code>），loss mask 只需一次区间判断。</li>
        <li><code>__getitem__</code> 直接 <code>torch.load</code> 离线好的 <code>.pth</code>：里面是 <code>{'{"images": (h,w) int 矩阵, "texts": str}'}</code>——<strong>不含像素</strong>。</li>
        <li><strong>CFG 空提示</strong>：<code>p_prob &lt; 0.05</code> 时 prompt 置空串，等价于无条件分支；推理 CFG 时做 <code>uncond + cfg_scale·(cond − uncond)</code>。</li>
        <li><code>input = bos + prompt + image_prompt</code>：完整序列 = 起始符 + 文本 + 图像 prompt。</li>
        <li><code>tokenizer(..., padding="max_length")</code>：编码为 id 并 padding 到 <code>max_position_embeddings</code>（训练 10240）。</li>
        <li><strong>Loss mask（训练核心技巧）</strong>：<code>torch.where(bov &lt;= id &lt;= eov, id, -100)</code>——只有落在视觉 token 区间的 label 保留，其余全置 <code>-100</code>。CrossEntropyLoss 遇 <code>-100</code> 跳过。因此模型<strong>只对视觉 token 算 loss</strong>，等价于「给定文本，自回归生成整张图的 VQ token」。</li>
        <li><code>squeeze(0)</code>：tokenize 后 shape 是 <code>(1, seq_len)</code>，去掉 batch 维让 HF 的 <code>default_data_collator</code> 在 batch 维重新堆叠。</li>
      </ul>
      <pre>{`    def format_image_prompt(self, image_tokens):
        h, w = image_tokens.shape
        imgstr = self.to_imgstr(image_tokens)
        image_prompt = (
            self.tokenizer.boi_token +
            f"{h}*{w}" +
            self.tokenizer.img_token +
            imgstr +
            self.tokenizer.eol_token +
            self.tokenizer.eof_token +
            self.tokenizer.eoi_token
        )
        return image_prompt

    def to_imgstr(self, image_tokens):
        image_token_str = [
            [self.args.visual_token_pattern.format(token_id=token_id)
             for token_id in token_row]
            for token_row in image_tokens
        ]
        image_row_str = ["".join(token_row) for token_row in image_token_str]
        imgstr = self.tokenizer.eol_token.join(image_row_str)
        return imgstr`}</pre>
      <ul>
        <li><code>format_image_prompt</code> 拼出固定格式：<code>&lt;|image start|&gt; h*w &lt;|image token|&gt; &lt;|visual token 000012|&gt;…&lt;|eol|&gt;…&lt;|eof|&gt;&lt;|image end|&gt;</code>——LLM 用自回归方式「读写」图像的字符串表示。</li>
        <li><code>to_imgstr</code> 把 <code>(h, w)</code> token 矩阵逐行展开：同行 token 无分隔符拼接，行间用 <code>eol</code>（=extra_200）连接，构成 2D 网格的 1D 线性化。</li>
        <li>该字符串化格式在 <code>datasets.py</code>（训练）与 <code>processing_emu3.py</code>（推理）<strong>必须完全一致</strong>，否则序列对不上。</li>
      </ul>

      <h2>5.3 prepare_data.py — 离线图像 VQ 量化</h2>
      <p>文件: <code>emu3/train/prepare_data.py</code></p>
      <pre>{`def smart_resize(image, image_area: int = 720 * 720):
    w, h = image.size
    current_area = h * w
    target_ratio = (image_area / current_area) ** 0.5
    th = int(round(h * target_ratio))
    tw = int(round(w * target_ratio))
    image = image.resize((tw, th))
    return image`}</pre>
      <ul>
        <li><strong>面积守恒缩放</strong>：<code>target_ratio = sqrt(target_area / current_area)</code>，宽高同乘该比并四舍五入——<strong>宽高比保持不变</strong>，避免形变。默认目标面积 <code>720×720=518400</code>。</li>
        <li>VQ 模型空间下采样 <code>spatial_scale_factor = 2^(len(ch_mult)-1) = 2^(5-1) = 16</code>。所以 720×720 图 → <code>45×45 = 2025</code> 个视觉 token（<code>518400</code> 开根 720，再 ÷16 = 45）。</li>
      </ul>
      <pre>{`    for inp in input_data:
        name = inp["name"]
        prompt = inp["text"]

        image = Image.open(inp["image"]).convert("RGB")
        image = smart_resize(image, args.image_area)

        image = image_processor(image, return_tensors="pt")["pixel_values"]
        with torch.no_grad():
            image = image.cuda()
            token_ids = image_tokenizer.encode(image)      # VQ encode

        token_ids = token_ids.squeeze(0).cpu().numpy()     # shape: (h', w')
        data = {"name": name, "images": token_ids, "texts": prompt}

        torch.save(data, f"{args.output_path}/feature/{name}.pth")
        datalist["path_list"].append(f"{name}.pth")`}</pre>
      <ul>
        <li><code>image_processor</code> 做像素标准化；<code>image_tokenizer.encode</code> 把 <code>(B,3,H,W)</code> 像素经 VQ encoder → quantize，返回 <code>(B, H/16, W/16)</code> 整型码本索引。</li>
        <li><strong>离线动机</strong>：训练时 LLM 只吃视觉 token 的整型 id、不需要像素。提前把全量图像 VQ 化存盘，训练每个 step 免跑 VQ encoder（encoder 计算量大、模型数百 MB）。</li>
        <li>输出结构：<code>feature/xxx.pth</code>（每图一个 tensor）+ <code>list/train.json</code>（索引 <code>{'{"prefix", "path_list"}'}</code>），Dataset 用 <code>path_prefix + filelist[i]</code> 拼回路径。</li>
      </ul>

      <h2>5.4 Emu3ForCausalLM.forward — 主干前向与 loss</h2>
      <p>文件: <code>emu3/mllm/modeling_emu3.py</code></p>
      <pre>{`class Emu3ForCausalLM(Emu3PreTrainedModel):
    _tied_weights_keys = ["lm_head.weight"]

    def __init__(self, config):
        super().__init__(config)
        self.model = Emu3Model(config)
        self.vocab_size = config.vocab_size
        self.lm_head = nn.Linear(config.hidden_size, config.vocab_size, bias=False)
        self.post_init()

    # ---- Emu3Model.__init__ ----
    # self.embed_tokens = nn.Embedding(config.vocab_size, config.hidden_size, self.padding_idx)
    #   # vocab_size = 184622, hidden_size = 4096

    def forward(self, input_ids, attention_mask=None, position_ids=None,
                past_key_values=None, inputs_embeds=None, labels=None, ...):
        outputs = self.model(input_ids=input_ids, ...)
        hidden_states = outputs[0]                          # (B, L, 4096)
        if self.config.pretraining_tp > 1:
            lm_head_slices = self.lm_head.weight.split(self.vocab_size // self.config.pretraining_tp, dim=0)
            logits = [F.linear(hidden_states, lm_head_slices[i]) for i in range(self.config.pretraining_tp)]
            logits = torch.cat(logits, dim=-1)
        else:
            logits = self.lm_head(hidden_states)            # (B, L, 184622)
        logits = logits.float()

        loss = None
        if labels is not None:
            shift_logits = logits[..., :-1, :].contiguous()
            shift_labels = labels[..., 1:].contiguous()
            loss_fct = CrossEntropyLoss()
            shift_logits = shift_logits.view(-1, self.config.vocab_size)  # (B*(L-1), 184622)
            shift_labels = shift_labels.view(-1)                            # (B*(L-1),)
            shift_labels = shift_labels.to(shift_logits.device)
            loss = loss_fct(shift_logits, shift_labels)

        return CausalLMOutputWithPast(loss=loss, logits=logits,
                                      past_key_values=outputs.past_key_values, ...)`}</pre>
      <ul>
        <li><code>embed_tokens = nn.Embedding(184622, 4096)</code>：<strong>视觉 token 与文本 token 共享同一张 embedding 表</strong>——输入 id 查表即可，无需手工构造 <code>inputs_embeds</code>，因为视觉 token id 已经并列在文本序列里。</li>
        <li><code>lm_head = nn.Linear(4096, 184622, bias=False)</code>：输出 logits 覆盖整个词表，既预测文本 token 也预测视觉 token。<code>_tied_weights_keys</code> 表明可权重绑定，但配置 <code>tie_word_embeddings=False</code> 默认不绑。</li>
        <li><code>pretraining_tp &gt; 1</code>：张量并行切片——lm_head 在 vocab 维切 tp 片分别 matmul 再 concat，降单卡显存峰值（默认 1 走普通路径）。</li>
        <li><strong>Loss</strong>：<code>shift_logits = logits[..., :-1, :]</code>、<code>shift_labels = labels[..., 1:]</code> 是经典 causal 移位——位置 i 的 logit 预测位置 i+1 的 label；<code>.view(-1, vocab_size)</code> 展平 batch×seq。</li>
        <li><code>CrossEntropyLoss()</code> 默认 <code>ignore_index=-100</code>，配合 5.2 的 loss mask，<strong>只对视觉 token 位置计算 cross-entropy</strong>。训练目标 = 最大化 <code>p(visual_tokens | text_prompt)</code>。</li>
      </ul>

      <h2>5.5 VQ 视觉分词器 — 码本 argmin 与空间/时间下采样</h2>
      <p>文件: <code>emu3/tokenizer/modeling_emu3visionvq.py</code></p>
      <pre>{`class Emu3VisionVQVectorQuantizer(nn.Module):
    def __init__(self, config: Emu3VisionVQConfig):
        super().__init__()
        self.embedding = nn.Embedding(config.codebook_size, config.embed_dim)  # (32768, 4)
        self.embedding.weight.data.uniform_(-1.0 / config.codebook_size, 1.0 / config.codebook_size)

    def forward(self, x: torch.Tensor):
        # x: (b, t, c, h, w) -> (b, t, h, w, c)
        b, t, c, h, w = x.shape
        x = x.permute(0, 1, 3, 4, 2).contiguous()
        x_flattened = x.view(-1, c)                      # (b*t*h*w, c)

        codebook = self.embedding.weight                   # (32768, c)
        d = torch.sum(x_flattened ** 2, dim=1, keepdim=True) + \\
            torch.sum(codebook ** 2, dim=1) - 2 * \\
            torch.einsum('bd,dn->bn', x_flattened, codebook.permute(1, 0))
        indices = torch.argmin(d, dim=1)                   # 每个空间位置选最近码字
        indices = indices.view(b, t, h, w)
        return indices`}</pre>
      <ul>
        <li><code>embedding</code> 就是码本：32768 个 4 维向量，初始化在窄区间 <code>[-1/32768, 1/32768]</code>，避免初始某个码字主导。</li>
        <li>标准 VQ-VAE 量化：L2 距离展开 <code>||x−e||² = ||x||² + ||e||² − 2⟨x,e⟩</code>，最后一项用一次 <code>einsum</code> 算完避免广播爆内存。<code>d</code> shape <code>(b*t*h*w, 32768)</code>，<code>argmin(dim=1)</code> 取最近码字 id。</li>
        <li>注意：这里<strong>只做 argmin 查表、不更新码本</strong>——Emu3 训练流程里 VQ 模型是冻结的预训练权重，只做离线 tokenize。</li>
      </ul>
      <pre>{`def encode(self, x: torch.Tensor):
    ndim = x.ndim
    if ndim == 4:                                     # 单帧图像
        t = self.config.temporal_downsample_factor
        b, c, h, w = x.shape
        x = x.unsqueeze(1).repeat(1, t, 1, 1, 1)      # 复制 t 帧凑成视频
    h = self.encoder(x)                               # 空间 conv + 4×Downsample
    h = self.quant_conv(h)                            # z_channels -> embed_dim
    codes = self.quantize(h)                          # (b, t, h/16, w/16) argmin
    if ndim == 4:
        codes = codes.squeeze(1)                      # 单帧 -> (b, h/16, w/16)
    return codes`}</pre>
      <ul>
        <li><strong>空间下采样 16×</strong>：encoder 内 4 个 <code>Downsample</code> 各把 H/W 减半（<code>ch_mult=[1,2,2,4]</code> → 共 5 级，factor=16）。</li>
        <li><strong>时间下采样 4×</strong>：<code>temporal_downsample_factor=4</code> 对应 <code>log2(4)=2</code> 个 <code>TemporalDownsample</code>——kernel <code>(4,3,3)</code> stride <code>(2,1,1)</code> 的 3D<strong>因果</strong>卷积，只在时间维 2×，空间不变。「因果」= 当前帧只能看到当前及过去的帧。</li>
        <li><strong>单帧图像 trick</strong>：4D 输入在时间维复制 t 次凑成 <code>(B,t,C,H,W)</code>，过完 3D 卷积再 <code>squeeze(1)</code> 压掉时间维，返回 2D token 图。</li>
        <li>Decoder 用 <code>SpatialNorm</code>：所有 ResNet/Attn 块接收量化嵌入 zq 作为条件，调制 norm 的 scale/bias（<code>x·conv_y(zq) + conv_b(zq)</code>）——VQGAN 系关键设计。</li>
      </ul>

      <h2>5.6 Emu3Processor.__call__ — 推理 prompt 构造（训练/推理格式对齐）</h2>
      <p>文件: <code>emu3/mllm/processing_emu3.py</code></p>
      <pre>{`@torch.no_grad()
def __call__(self, text, image=None, *, mode='G', ratio='1:1',
             image_area=518400, padding_image=False, **kwargs):
    if mode == 'G':                       # 生成模式：text 只读，image 必须为 None
        if image is not None:
            raise ValueError("You have to specify only \`text\` in generation mode")
        ...
    else:                                 # 理解模式：image 经 VQ encode
        image_tokens = self.tokenize_image(image, padding_image=padding_image)

    for idx, text_prompt in enumerate(text):
        if mode == 'U':                   # 理解：完整 image_prompt + 对话模板
            h, w = image_tokens[idx].shape
            imgstr = self.to_imgstr(image_tokens[idx])
            image_prompt = (boi_token + "{H}*{W}" + img_token + imgstr +
                            eol_token + eof_token + eoi_token)
            prompt += self.chat_template.format(image_prompt=image_prompt,
                                                text_prompt=text_prompt)
        else:                             # 生成：序列停在 img_token 前，等模型自回归补全
            h, w = self.calculate_generate_size(ratio[idx], image_area,
                                                spatial_scale_factor)
            image_prompt = boi_token + "{H}*{W}" + img_token
            prompt += (text_prompt + image_prompt)
        size_list.append([h, w])`}</pre>
      <ul>
        <li><strong>mode='G'（文生图）</strong>：序列 = <code>bos + text + boi + {'"{H}*{W}"'} + img_token</code>，到 <code>img_token</code> 就停——后面 H×W 个视觉 token 全靠模型自回归生成。这个 prompt 与训练格式同构，只是视觉 token 部分留给推理补全。</li>
        <li><strong>mode='U'（图像理解）</strong>：把图像 VQ 编码成 token 矩阵后，按与训练<strong>完全相同的格式</strong>拼出完整 image_prompt，再套 <code>chat_template</code> 构成对话输入。</li>
        <li><code>calculate_generate_size</code>：给宽高比（如 "4:3"）和目标面积算出 VQ token 网格高宽（像素尺寸 ÷ spatial_scale_factor=16），决定要生成多少个视觉 token，也是 <code>PrefixConstrainedLogitsProcessor</code> 生成约束的依据。</li>
        <li><code>size_list</code> 随 <code>BatchFeature</code> 返回，推理时用于 constrained decoding：每行 w 个视觉 token 后强制出 eol，共 h 行后出 eof+eoi。</li>
      </ul>

      <h2>5.7 Emu3Tokenizer — 184622 词表的构造</h2>
      <p>文件: <code>emu3/mllm/tokenization_emu3.py</code></p>
      <pre>{`PAT_STR = r"""(?i:'s|'t|'re|'ve|'m|'ll|'d)|[^\\r\\n\\p{L}\\p{N}]?\\p{L}+|\\p{N}| ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+"""
ENDOFTEXT = "<|endoftext|>"
IMSTART = "<|im_start|>"
IMEND = "<|im_end|>"
EXTRAS = tuple((f"<|extra_{i}|>" for i in range(205)))
SPECIAL_START_ID = 151643

def __init__(self, vocab_file, special_tokens_file, errors="replace",
             bos_token="<|extra_203|>", eos_token="<|extra_204|>",
             pad_token="<|endoftext|>", img_token="<|image token|>",
             boi_token="<|image start|>", eoi_token="<|image end|>",
             eol_token="<|extra_200|>", eof_token="<|extra_201|>", **kwargs):
    self.mergeable_ranks = _load_tiktoken_bpe(vocab_file)     # 基础 BPE 词表
    vision_tokens = [t.strip() for t in open(special_tokens_file).readlines()
                     if len(t.strip()) > 0]                    # 32768 个视觉 token 字符串
    SPECIAL_TOKENS = tuple(enumerate(
        (ENDOFTEXT, IMSTART, IMEND) + EXTRAS + tuple(vision_tokens),
        start=SPECIAL_START_ID,
    ))
    self.special_tokens = {token: index for index, token in SPECIAL_TOKENS}
    enc = tiktoken.Encoding("Emu3", pat_str=PAT_STR,
                            mergeable_ranks=self.mergeable_ranks,
                            special_tokens=self.special_tokens)
    assert len(self.mergeable_ranks) + len(self.special_tokens) == enc.n_vocab`}</pre>
      <ul>
        <li><strong>词表三来源</strong>：① <code>emu3.tiktoken</code> 基础 BPE（约 151646 个 mergeable_ranks，沿用 Qwen 系）；② 固定特殊 token（<code>&lt;|endoftext|&gt;</code>、<code>&lt;|im_start|&gt;</code>、<code>&lt;|im_end|&gt;</code>）+ 205 个 <code>&lt;|extra_i|&gt;</code> 占位；③ <code>emu3_vision_tokens.txt</code> 里 32768 行视觉 token 字符串。</li>
        <li><strong>id 分配</strong>：从 <code>SPECIAL_START_ID=151643</code> 起枚举——<code>endoftext=151643</code>，<code>extra_0..204 = 151646..151850</code>，图像 token <code>&lt;|image token|&gt;</code>=151851 / <code>&lt;|image start|&gt;</code>=151852 / <code>&lt;|image end|&gt;</code>=151853，32768 个视觉 token = <code>151854..184621</code>。总词表 <code>151646 + 3 + 205 + 32768 = 184622</code>。</li>
        <li><strong>设计意义</strong>：视觉 token 注册为 special token（而非普通 BPE token）——编码时整体当作一个 id 不会被拆成子词；且 id 在词表里是<strong>连续区间</strong>，loss mask 只需判断 <code>bov &lt;= id &lt;= eov</code>。</li>
        <li><code>assert</code> 校验 mergeable 与 special 数量之和等于 <code>enc.n_vocab</code>，确保 id 无冲突、无空洞。</li>
        <li>注意 <code>bos_token = "&lt;|extra_203|&gt;"</code> 而非 <code>&lt;|im_start|&gt;</code>——Emu3 训练约定的序列起始符。</li>
      </ul>

      <h2>5.8 scripts/t2i_sft.sh — 训练启动脚本</h2>
      <p>文件: <code>scripts/t2i_sft.sh</code></p>
      <pre>{`WORLD_SIZE=\${WORLD_SIZE:-1}
RANK=\${RANK:-0}
MASTER_ADDR=\${MASTER_ADDR:-127.0.0.1}
MASTER_PORT=\${MASTER_PORT:-23456}
NGPUS=$(python -c "import torch; print(torch.cuda.device_count())")
export PYTHONPATH=$(pwd)

torchrun --nproc_per_node=\${NGPUS} --nnodes=\${WORLD_SIZE} --node_rank=\${RANK} \\
    --master_addr=\${MASTER_ADDR} --master_port=\${MASTER_PORT} \\
    emu3/train/train.py \\
    --model_name_or_path BAAI/Emu3-Gen \\
    --deepspeed scripts/zero3.json \\
    --null_prompt_prob 0.05 \\
    --apply_loss_on_only_vision True \\
    --image_area 518400 \\
    --max_position_embeddings 10240 \\
    --bf16 True --tf32 True \\
    --num_train_epochs 4 \\
    --per_device_train_batch_size 2 \\
    --gradient_accumulation_steps 4 \\
    --learning_rate 1e-5 --min_learning_rate 1e-6 \\
    --weight_decay 0.1 --max_grad_norm 5.0 \\
    --adam_beta1 0.9 --adam_beta2 0.95 --adam_epsilon 1e-6 \\
    --warmup_steps 30 \\
    --lr_scheduler_type "cosine_with_min_lr" \\
    --gradient_checkpointing True \\
    --dataloader_num_workers 4 \\
    --save_steps 500 --save_total_limit 10 \\
    --report_to wandb tensorboard --run_name \${EXP_NAME}`}</pre>
      <ul>
        <li><code>--image_area 518400</code> = 720×720 像素，对应 VQ token 图 45×45=2025 token。</li>
        <li><code>--max_position_embeddings 10240</code>：一个样本 ≈ bos(1) + text(几十~上百) + boi+h*w+img(≈10) + visual_tokens(2025) + eol×h+eof+eoi ≈ 2100~3000 token，10240 足够容纳 batch 内 padding。</li>
        <li><code>--learning_rate 1e-5 / min_lr 1e-6 / cosine_with_min_lr</code>：微调幅度小，避免灾难性遗忘；<code>min_lr</code> 经 5.1 的 <code>lr_scheduler_kwargs["min_lr"]</code> 注入调度器。</li>
        <li><code>--weight_decay 0.1</code> + β₂=0.95 是现代 LLM 微调标准配置；<code>--max_grad_norm 5.0</code> 裁剪梯度。</li>
        <li><code>--gradient_checkpointing True</code>：以计算换显存——前向不存中间激活、反向重算，省显存约 40%+（代价约 +20% 计算时间）。</li>
        <li><code>--num_train_epochs 4</code>：SFT 阶段只跑几个 epoch；<code>--save_steps 500</code> 每 500 步存 checkpoint。</li>
      </ul>

      <h2>5.9 scripts/zero3.json — DeepSpeed ZeRO Stage 3 配置</h2>
      <p>文件: <code>scripts/zero3.json</code></p>
      <pre>{`{
    "fp16": { "enabled": "auto", "loss_scale": 0, "loss_scale_window": 1000,
              "initial_scale_power": 16, "hysteresis": 2, "min_loss_scale": 1 },
    "bf16": { "enabled": "auto" },
    "train_micro_batch_size_per_gpu": "auto",
    "train_batch_size": "auto",
    "gradient_accumulation_steps": "auto",
    "zero_optimization": {
        "stage": 3,
        "overlap_comm": true,
        "contiguous_gradients": true,
        "sub_group_size": 1e9,
        "reduce_bucket_size": "auto",
        "stage3_prefetch_bucket_size": "auto",
        "stage3_param_persistence_threshold": "auto",
        "stage3_max_live_parameters": 1e9,
        "stage3_max_reuse_distance": 1e9,
        "stage3_gather_16bit_weights_on_model_save": true
    }
}`}</pre>
      <ul>
        <li><code>fp16/bf16: enabled: "auto"</code>：让 DeepSpeed 按 HF TrainingArguments 的 <code>--bf16</code> 自动决定启用哪个；<code>loss_scale=0</code> 是动态 loss scaling（bf16 不需要）。</li>
        <li>批大小相关全部 <code>"auto"</code>：交给 HF Trainer（脚本里 <code>per_device_train_batch_size=2</code>）。</li>
        <li><strong>ZeRO-3 核心</strong>：optimizer states + gradients + model parameters 三者全部分片到所有 rank。Emu3-Gen 约 7B 参数、bf16 约 14GB，用 ZeRO-3 每卡只持 <code>14GB / num_gpus</code> 的权重分片。</li>
        <li><code>overlap_comm / contiguous_gradients</code>：通信与计算重叠、梯度连续 buffer 减少，提升 NCCL 效率。</li>
        <li><code>stage3_max_live_parameters / max_reuse_distance = 1e9</code>：控制同时驻留显存的参数缓存，超限即 offload/重算。</li>
        <li><code>stage3_gather_16bit_weights_on_model_save=true</code>：保存时把 16-bit 权重收集到 rank 0——checkpoint 是完整权重，无需 ZeRO 恢复流程即可直接 <code>from_pretrained</code>。</li>
      </ul>

      <h2>5.10 全流程串讲（数据流视角）</h2>
      <ol>
        <li><strong>离线</strong>（prepare_data.py）：图像 → <code>smart_resize</code> 等比缩放到目标面积 → VQ encoder（空间 16× + 时间 4× 下采样）→ <code>argmin</code> L2 查表 → <code>(45,45)</code> 整型矩阵 → 与文本一起存 <code>.pth</code>。</li>
        <li><strong>在线样本</strong>（datasets.py）：读 <code>.pth</code>，5% 概率 CFG 空 prompt，拼 <code>bos + text + boi + h*w + img + visual_tokens + eol + eof + eoi</code>，tokenize 后把非视觉位置 label 置 <code>-100</code>。</li>
        <li><strong>前向</strong>（modeling_emu3.py）：<code>embed_tokens(184622×4096)</code> 查表 → 32 层 decoder（GQA + RMSNorm + SwiGLU）→ <code>lm_head</code> 出 184622 维 logits。</li>
        <li><strong>损失</strong>：<code>shift</code> 后 <code>CrossEntropyLoss(ignore_index=-100)</code>——loss 只来自「给定文本 prefix 自回归预测每个视觉 token」。</li>
        <li><strong>分布式</strong>：ZeRO-3 分片权重/优化器，gradient checkpointing 省激活，FlashAttention-2 加速，BF16 全精度。</li>
      </ol>
      <Callout type="tip">
        <strong>一句话总结 Emu3 训练：</strong>图像经 MoVQGAN VQ-VAE（32768 词表）变成视觉 token 文本，与文本共享同一 LLaMA 架构的 next-token 预测；训练 = HF Trainer + DeepSpeed ZeRO-3 + BF16，用带视觉 token loss masking 的 CrossEntropy 做 SFT，5% null prompt 对齐 CFG 推理。这是 DriveVLA-W0 的 VLM 基座。
      </Callout>

      {/* ==================== 6. 关键文件索引 ==================== */}
      <div className="section-divider"><span>关键文件索引</span></div>

      <table>
        <thead><tr><th>作用</th><th>路径（点击跳转 GitHub 源码）</th></tr></thead>
        <tbody>
          <tr><td>训练入口</td><td><SrcLink path="emu3/train/train.py" /></td></tr>
          <tr><td>在线数据集</td><td><SrcLink path="emu3/train/datasets.py" />（Emu3FeatureDataset）</td></tr>
          <tr><td>离线预处理</td><td><SrcLink path="emu3/train/prepare_data.py" /></td></tr>
          <tr><td>LLM 模型实现</td><td><SrcLink path="emu3/mllm/modeling_emu3.py" /></td></tr>
          <tr><td>LLM 配置</td><td><SrcLink path="emu3/mllm/configuration_emu3.py" /></td></tr>
          <tr><td>文本 tokenizer</td><td><SrcLink path="emu3/mllm/tokenization_emu3.py" />（tiktoken）</td></tr>
          <tr><td>统一处理器</td><td><SrcLink path="emu3/mllm/processing_emu3.py" />（Emu3Processor）</td></tr>
          <tr><td>VQ 视觉 tokenizer</td><td><SrcLink path="emu3/tokenizer/modeling_emu3visionvq.py" /></td></tr>
          <tr><td>DeepSpeed 配置</td><td><SrcLink path="scripts/zero3.json" /> / <SrcLink path="scripts/zero3_offload.json" /></td></tr>
          <tr><td>SFT 训练脚本</td><td><SrcLink path="scripts/t2i_sft.sh" /> / <SrcLink path="scripts/t2i_sft_offload.sh" /></td></tr>
        </tbody>
      </table>
    </div>
  );
}
