import { MermaidDiagram } from '../components/MermaidDiagram';
import { CodeBlock, Callout, ResourceTable } from '../components/CodeBlock';

const GH = 'https://github.com/BraveGroup/DriveVLA-W0/blob/main';

function SrcLink({ path }: { path: string }) {
  return (
    <a href={`${GH}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function DriveVLAW0Page() {
  return (
    <div className="prose max-w-none">
      <h1>DriveVLA-W0 — 训练框架实现架构分析</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">🏷️ 自动驾驶 · VLA · 华为 · 端到端</span>
        <span className="page-meta-item">📖 源码分析</span>
      </div>
      <p>
        华为开源的 <strong>视觉-语言-行动（VLA）</strong>端到端自动驾驶大模型（论文：<em>World Models Amplify Data Scaling Law in Autonomous Driving</em>）。基于 BAAI <strong>Emu3-8B</strong> 作为 VLM 基座，通过<strong>世界模型预训练 + 动作专家微调</strong>两阶段范式实现从感知到控制的统一建模。本文基于 <code>/data/sd/DriveVLA-W0</code> 源码，重点对齐 Pi-0.5 页面的<strong>代码级逐步分析粒度</strong>——每个关键点给出真实源码片段 + 逐行解释 + 文件路径。
      </p>

      <Callout type="tip">
        <strong>核心结论：</strong>DriveVLA-W0 围绕 Emu3-8B 基座构建了<strong>模块化的 VLA 训练框架</strong>——同一个 VLM、同一套数据管线、同一套训练脚本模板，通过 <code>utils/train_{"{moe,pi0,ar,qformer}"}.py</code> 切换四种动作专家（MoE / Flow-Matching / AutoRegressive / Query-based）。数据端用 <strong>FAST</strong>（DCT + BPE）动作分词器与 VQ-VAE 视觉码形成「双离散化」，训练统一走 HF Trainer + <strong>DeepSpeed ZeRO-3 + CPU offload</strong> + BF16。主模型 <strong>Emu3Pi0</strong> 用 Pi0 风格的「VLM + Action Expert 共享注意力层」，Flow-Matching 速度场 MSE 损失达到 PDMS 87.2。
      </Callout>

      {/* ==================== 1. 仓库整体布局 ==================== */}
      <div className="section-divider"><span>仓库整体布局</span></div>

      <h3>1.1 目录结构</h3>
      <MermaidDiagram chart={`
graph TD
    R["📦 DriveVLA-W0 仓库根目录"]
    R --> C["configs/ JSON 超参 + FAST 动作 tokenizer"]
    R --> M["models/ 动作表征与视觉 tokenizer"]
    R --> U["utils/ 数据集 + 5 个训练入口"]
    R --> S["scripts/ 两阶段训练脚本 + DeepSpeed 配置"]
    R --> INF["inference/ 四类推理入口"]
    R --> REF["reference/ 上游 Emu3 / Qwen2.5-VL 源码"]

    C --> CF["moe_fast_video.json<br/>moe_fast_video_pretrain.json"]
    C --> FAST["fast/processing_action_tokenizer.py<br/>UniversalActionProcessor (DCT+BPE)"]

    M --> TK["tokenizer/action_tokenizer.py<br/>OpenVLA 风格 uniform-binning"]
    M --> VQ["tokenizer/emu3_tokenizer_navsim.py<br/>Emu3 VQ 视觉码离线抽取"]
    M --> PH["policy_head/diffusion_policy.py<br/>PolicyHead / Emu3ActionEncoder"]
    M --> ME["policy_head/moe_experts.py<br/>Emu3Experts (DiT-Llama)"]
    M --> FM["policy_head/flow_matching.py<br/>FlowMatching 原语"]
    M --> NS["policy_head/noise_schedulers.py<br/>FlowMatchingScheduler"]

    U --> DS["datasets.py<br/>Emu3Driving*Dataset 系列"]
    U --> TMOE["train_moe.py (Stage1/Stage2 基线)"]
    U --> TPI0["train_pi0.py (Flow-Matching, 主模型)"]
    U --> TAR["train_ar.py (自回归)"]
    U --> TQF["train_qformer.py (Query-based)"]

    S --> P1["pretrain/train_nuplan_6va_multi_v0.2_*.sh<br/>Stage1 NuPlan 预训练"]
    S --> P2["scripts_train/train_navsim_*.sh<br/>Stage2 Navsim 微调"]
    S --> DS3["sft/zero3_offload.json<br/>DeepSpeed ZeRO-3 + CPU offload"]
      `} />

      <h3>1.2 技术选型特点</h3>
      <table>
        <thead><tr><th>维度</th><th>选型</th></tr></thead>
        <tbody>
          <tr><td><strong>VLM 基座</strong></td><td>Emu3-8B（hidden=4096, 32 层, GQA kv_heads=8）</td></tr>
          <tr><td><strong>训练框架</strong></td><td>HuggingFace Trainer + DeepSpeed ZeRO-3 + CPU offload</td></tr>
          <tr><td><strong>混合精度</strong></td><td>BF16 + TF32 + FlashAttention2</td></tr>
          <tr><td><strong>动作表征</strong></td><td>FAST (DCT+BPE) / OpenVLA uniform-binning</td></tr>
          <tr><td><strong>动作预测</strong></td><td>Flow Matching（主）/ AutoRegressive / Query-based / MoE</td></tr>
          <tr><td><strong>训练资源</strong></td><td>3 节点 × 8×L20 40GB（Stage1）</td></tr>
        </tbody>
      </table>

      {/* ==================== 2. 模型架构实现 ==================== */}
      <div className="section-divider"><span>模型架构实现</span></div>

      <h3>2.1 三段式整体结构</h3>
      <p>
        VLA 模型 = <strong>视觉 Tokenizer（VQ）+ VLM Backbone（Emu3）+ Action Head/Expert</strong> 三部分组成。核心类在 <code>reference/Emu3/emu3/mllm/modeling_emu3.py</code> 与 <code>configuration_emu3.py</code>。
      </p>

      <h3>2.2 视觉 Tokenizer（VQ）</h3>
      <ul>
        <li>采用 BAAI <code>Emu3-VisionTokenizer</code>（独立 VQ-VAE），离线把每帧 <code>CAM_F0</code> 编码为 <code>(1, 18, 32)</code> 的 VQ code 存 <code>*.npy</code>（<code>models/tokenizer/emu3_tokenizer_navsim.py</code>，分辨率 256×144）。</li>
        <li>特殊 token：<code>bov=151854</code>、<code>eov=184621</code>、<code>boi=151852</code>、<code>eoi=151853</code>、<code>img=151851</code>、<code>eof=151847</code>、<code>eol=151846</code>。</li>
      </ul>

      <h3>2.3 VLM Backbone（Emu3-8B）</h3>
      <table>
        <thead><tr><th>配置项</th><th>值</th></tr></thead>
        <tbody>
          <tr><td><code>vocab_size</code></td><td>184622</td></tr>
          <tr><td><code>hidden_size</code></td><td>4096</td></tr>
          <tr><td><code>intermediate_size</code></td><td>14336</td></tr>
          <tr><td><code>num_hidden_layers</code></td><td>32</td></tr>
          <tr><td><code>num_attention_heads / num_key_value_heads</code></td><td>32 / 8（GQA）</td></tr>
          <tr><td><code>hidden_act</code></td><td>silu（SwiGLU）</td></tr>
          <tr><td><code>rope_theta</code></td><td>1_000_000.0</td></tr>
          <tr><td><code>rms_norm_eps</code></td><td>1e-5</td></tr>
          <tr><td><code>attention 实现</code></td><td>flash_attention_2 / sdpa / eager 可切</td></tr>
        </tbody>
      </table>

      <h3>2.4 动作专家：四种表征路径</h3>
      <table>
        <thead><tr><th>路径</th><th>模型类</th><th>损失</th><th>用途</th></tr></thead>
        <tbody>
          <tr><td><strong>MoE</strong></td><td><code>Emu3MoE</code>（内嵌 ActionProjector + 2 层 action_layers + FinalLayer）</td><td>加权 CE（vision token）+ Flow-Matching MSE</td><td>Stage1 预训练 / Stage2 基线</td></tr>
          <tr><td><strong>Pi0 / Flow-Matching</strong></td><td><code>Emu3Pi0</code>（独立 action_expert + state_projector）</td><td><code>MSE(noise−action, velo_pred)</code>，action_loss_weight=1.0</td><td><strong>PDMS 87.2 主模型</strong></td></tr>
          <tr><td><strong>AutoRegressive</strong></td><td><code>Emu3AutoRegressive</code>（action expert <strong>共享 embed_tokens</strong>）</td><td>&lt;boa&gt;…&lt;eoa&gt; 上的 next-token CE</td><td>自回归动作生成</td></tr>
          <tr><td><strong>Query-based</strong></td><td><code>Emu3QFormer</code>（可学习 query + cross-attention）</td><td>trajectory MSE</td><td>查询式轨迹输出</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>Flow-Matching 训练目标：</strong>前向中采样时间 <code>tau</code>，对动作 <code>action</code> 加噪得到 <code>noise</code>，模型预测速度场 <code>velo_pred</code>，损失 = <code>F.mse_loss(noise - action, velo_pred)</code>。调度器用 <code>FlowMatchingScheduler(sample_method='beta', s=1.0)</code>，时间嵌入用 <code>SinusoidalPosEmb</code>。详细逐行解析见第 5 节。
      </Callout>

      <h3>2.5 动作分词器</h3>
      <table>
        <thead><tr><th>方案</th><th>实现</th><th>要点</th></tr></thead>
        <tbody>
          <tr><td><strong>FAST</strong>（主力）</td><td><code>UniversalActionProcessor</code>（configs/fast/processing_action_tokenizer.py）</td><td>沿时间轴做 DCT → <code>round(coeff·scale=10)</code> → 字符映射 → BPE（vocab=2048, min_token=−354）</td></tr>
          <tr><td><strong>OpenVLA 风格</strong></td><td><code>ActionTokenizer</code>（models/tokenizer/action_tokenizer.py）</td><td>[−1,1] 均匀切 256 bins → 词表末尾 token</td></tr>
        </tbody>
      </table>

      {/* ==================== 3. 训练框架实现（总览） ==================== */}
      <div className="section-divider"><span>训练框架实现（总览）</span></div>

      <h3>3.1 五个训练入口</h3>
      <table>
        <thead><tr><th>入口</th><th>模型</th><th>阶段</th></tr></thead>
        <tbody>
          <tr><td><code>utils/train.py</code></td><td>Emu3ForCausalLM</td><td>纯 VLM SFT</td></tr>
          <tr><td><code>utils/train_moe.py</code></td><td>Emu3MoE</td><td><strong>Stage1 NuPlan 预训练 / Stage2 MoE 微调</strong></td></tr>
          <tr><td><code>utils/train_pi0.py</code></td><td>Emu3Pi0</td><td>Flow-matching 动作专家（PDMS 87.2）</td></tr>
          <tr><td><code>utils/train_ar.py</code></td><td>Emu3AutoRegressive</td><td>自回归动作专家</td></tr>
          <tr><td><code>utils/train_qformer.py</code></td><td>Emu3QFormer</td><td>Query-based 动作专家</td></tr>
        </tbody>
      </table>

      <p>每个入口结构一致（详见 5.1 代码级拆解）：</p>
      <CodeBlock language="python" title="统一训练入口流程" code={`1. HfArgumentParser((ModelArguments, DataArguments, TrainingArguments))
2. Emu3Pi0Config.from_pretrained(...)
   # update_configs(): 注入 image_area / max_position_embeddings
   #                  / action_loss_weight / freeze_vlm
3. load_model()  # from_scratch 或 from_pretrained，可选 model.freeze_vlm()
4. get_dataset_split()  # train_test_split(test_size=0.05, seed=42)
5. transformers.Trainer（或 WeightedSamplerTrainer / MemoryEfficientTrainer / LoggingTrainer）
6. trainer.train(resume_from_checkpoint=True)`} />

      <h3>3.2 分布式与混合精度</h3>
      <table>
        <thead><tr><th>维度</th><th>配置</th></tr></thead>
        <tbody>
          <tr><td><strong>启动器</strong></td><td>torchrun --nproc_per_node=8 --nnodes=1|3</td></tr>
          <tr><td><strong>DeepSpeed</strong></td><td>ZeRO-3 + CPU offload（optimizer + param）：<code>stage=3, overlap_comm, contiguous_gradients, stage3_gather_16bit_weights_on_model_save</code></td></tr>
          <tr><td><strong>精度</strong></td><td>--bf16 True --tf32 True</td></tr>
          <tr><td><strong>多节点</strong></td><td>WORLD_SIZE=3，NCCL over Ethernet（NCCL_IB_DISABLE=1, NCCL_P2P_DISABLE=1, BUFFSIZE=32MB, TIMEOUT=3600）</td></tr>
          <tr><td><strong>省显存</strong></td><td>gradient_checkpointing=True</td></tr>
        </tbody>
      </table>

      <h3>3.3 优化器与学习率</h3>
      <table>
        <thead><tr><th>项目</th><th>配置</th></tr></thead>
        <tbody>
          <tr><td><strong>优化器</strong></td><td>AdamW（β₁=0.9, β₂=0.95, ε=1e-6）</td></tr>
          <tr><td><strong>正则</strong></td><td>weight_decay=0.1, max_grad_norm=5.0</td></tr>
          <tr><td><strong>调度器</strong></td><td>cosine_with_min_lr（min_lr=1e-6 注入 lr_scheduler_kwargs）</td></tr>
          <tr><td><strong>Warmup</strong></td><td>warmup_steps=50（预训练 400）</td></tr>
          <tr><td><strong>学习率</strong></td><td>Stage1 2e-4 / Stage2 AR·Flow·QFormer 5e-5 / Stage2 MoE 8e-5</td></tr>
        </tbody>
      </table>

      {/* ==================== 4. 端到端流水线 ==================== */}
      <div className="section-divider"><span>两阶段训练流程</span></div>

      <MermaidDiagram chart={`
flowchart LR
    subgraph Stage1["Stage1 · NuPlan 世界模型预训练"]
        A1["NuPlan pickle 生成"] --> A2["train_moe.py<br/>moe_fast_video_pretrain.json"]
        A2 --> A3["3节点×8×L20 40GB<br/>max_steps=8000, lr=2e-4<br/>max_pos=4000, va_pair=6"]
        A3 --> A4["Emu3_NuPlan_Pretrain_Cktps"]
    end

    subgraph Stage2["Stage2 · Navsim 微调（四选一）"]
        B1["train_base_ar_withou_moe.sh<br/>Emu3MoE · lr=8e-5 · 4000步"]
        B2["train_navsim_ar.sh<br/>Emu3AutoRegressive · next-token CE"]
        B3["train_navsim_flow_matching.sh<br/>Emu3Pi0 · lr=5e-5 · 10000步<br/>action_sample_steps=10 ⭐PDMS 87.2"]
        B4["train_navsim_query_based.sh<br/>Emu3QFormer · 4000步"]
    end

    A4 -->|"加载预训练权重"| Stage2
    Stage2 --> C["DeepSpeed ZeRO-3 + CPU offload<br/>BF16 · cosine_with_min_lr · grad_ckpt"]
      `} />

      <Callout type="warning">
        <strong>两阶段动机：</strong>Stage1 在 NuPlan 大数据上让 VLM 学会「视觉→未来轨迹」的世界模型先验（自监督视觉预测）；Stage2 在 Navsim 上冻结/微调 VLM，叠加动作专家学习控制。这是「世界模型放大数据规模法则」的核心设计。
      </Callout>

      {/* ==================== 5. 核心代码逐步分析 ==================== */}
      <div className="section-divider"><span>核心代码逐步分析</span></div>

      <p>以下按训练数据流（训练入口 → 模型前向 → 损失组合 → 数据构造 → 动作分词 → 训练脚本）逐文件给出<strong>真实源码片段</strong>与逐行解析，粒度对齐 Pi-0.5 页面。</p>

      <h2>5.1 训练入口 train_pi0.py — 加载 / 冻结 VLM + Trainer</h2>
      <p>文件: <code>utils/train_pi0.py</code></p>
      <pre>{`def load_model(model_args, model_config, training_args):
    with open(osp.join(model_args.model_name_or_path, "config.json"), "r") as f:
        config = json.load(f)
    if config.get("model_type") == "Emu3Pi0":
        # 已经是 Pi0 格式的 checkpoint，直接续训
        model, loading_info = Emu3Pi0.from_pretrained(
            model_args.model_name_or_path,
            config=model_config,
            attn_implementation="sdpa",
            torch_dtype=torch.bfloat16,
            output_loading_info=True
        )
        print("Missing keys:", loading_info["missing_keys"])
    else:
        # 从头构造：加载预训练 VLM 作为基座，随机初始化 action expert
        model = Emu3Pi0(config=model_config,
                        pretrain_vlm_path=model_args.model_name_or_path)
        if training_args.freeze_vlm:
            print("Freezing VLM parameters...")
            model.freeze_vlm()
    return model`}</pre>
      <ul>
        <li>先读 <code>config.json</code> 判断 <code>model_type</code>：若是 <code>"Emu3Pi0"</code> 说明已有 Pi0 checkpoint，直接 <code>from_pretrained</code> 续训；否则 <code>Emu3Pi0(config, pretrain_vlm_path=...)</code> 从头构造——VLM 加载预训练权重、action expert 全新初始化。</li>
        <li><code>attn_implementation="sdpa"</code>：训练用 PyTorch 原生 Scaled Dot-Product Attention（而非 FA2），便于 DeepSpeed 优化器路径；<code>torch_dtype=torch.bfloat16</code> 全权重 bf16 载入。</li>
        <li><code>output_loading_info=True</code>：返回 missing / unexpected / mismatched key，用于调试权重对齐。</li>
        <li><strong>冻结策略</strong>：<code>freeze_vlm=True</code> 时只训练 action expert 及其 head——这是 Stage2 可选的「冻结 VLM 微调动作」模式。</li>
      </ul>
      <pre>{`def train():
    parser = tf.HfArgumentParser((ModelArguments, DataArguments, TrainingArguments))
    model_args, data_args, training_args = parser.parse_args_into_dataclasses()

    pi0_config = Emu3Pi0Config.from_pretrained(model_args.model_config_path)
    update_configs(pi0_config, training_args,
                   ["image_area", "max_position_embeddings",
                    "action_loss_weight", "action_sample_steps", "freeze_vlm"])
    if training_args.bf16:
        pi0_config.torch_dtype = torch.bfloat16
        pi0_config.vlm_config.torch_dtype = torch.bfloat16
        pi0_config.action_config.torch_dtype = torch.bfloat16

    model = load_model(model_args, pi0_config, training_args)
    if training_args.min_learning_rate is not None:
        training_args.lr_scheduler_kwargs["min_lr"] = training_args.min_learning_rate

    tokenizer = Emu3Tokenizer.from_pretrained(
        model_args.model_name_or_path,
        model_max_length=training_args.max_position_embeddings,
        padding_side="right", use_fast=False)

    train_dataset, eval_dataset = get_dataset_split(data_args, tokenizer)
    trainer = tf.Trainer(model=model, args=training_args,
                         train_dataset=train_dataset,
                         eval_dataset=eval_dataset, tokenizer=tokenizer)
    if list(pathlib.Path(training_args.output_dir).glob("checkpoint-*")):
        trainer.train(resume_from_checkpoint=True)
    else:
        trainer.train()
    trainer.save_state()
    torch.cuda.synchronize()
    trainer.save_model(training_args.output_dir)`}</pre>
      <ul>
        <li><code>Emu3Pi0Config</code> 是<strong>嵌套结构</strong>：顶层含 <code>vlm_config</code> 与 <code>action_config</code> 两个子 config；bf16 时三层 <code>torch_dtype</code> 全部置 bf16。</li>
        <li><code>update_configs</code>：config 中为 None 的字段用 CLI 值覆盖，否则 config 优先——保证 JSON 配置文件的优先级。</li>
        <li><code>get_dataset_split</code>：按 <code>train_test_split(test_size=0.05, seed=42)</code> 划分 95/5。</li>
        <li>Trainer 可切换为 <code>WeightedSamplerTrainer</code>（多数据集按 <code>sample_weights</code> 加权采样）、<code>MemoryEfficientTrainer</code>（eval 前后清显存）、<code>LoggingTrainer</code>（all_gather 样本 index 后台写日志）。</li>
        <li>自动检测 <code>checkpoint-*</code> 断点续训。</li>
      </ul>
      <p><strong>Pi0 专属训练参数</strong>（TrainingArguments 扩展）：</p>
      <pre>{`train_action_only: bool = False
action_loss_weight: float = field(default=10.0)   # 脚本里显式传 1.0
action_sample_steps: int = field(default=10)      # 推理 Euler 采样步数
freeze_vlm: bool = field(default=False)`}</pre>
      <ul>
        <li><code>remove_unused_columns=False</code>（父类基类）：dataset 返回的 <code>action / pre_action / cmd</code> 等额外 key 不被 Trainer 丢弃。</li>
        <li><code>action_sample_steps=10</code>：推理时 flow matching 的 Euler 积分步数；<code>freeze_vlm</code> 控制是否只微调动作专家。</li>
      </ul>

      <h2>5.2 Emu3Pi0 — Flow-Matching 动作专家（核心前向）</h2>
      <p>文件: <code>reference/Emu3/emu3/mllm/modeling_emu3.py</code>（lines 1926-2204）</p>
      <pre>{`class Emu3Pi0(Emu3PreTrainedModel):
    def __init__(self, config, pretrain_vlm_path):
        self.vlm, loading_info = Emu3MoE.from_pretrained(
            pretrain_vlm_path, attn_implementation="sdpa",
            torch_dtype=self.config.torch_dtype, output_loading_info=True)
        self.action_expert = Emu3Model(self.action_config)   # 独立 decoder，全新初始化

        action_dim = getattr(config, 'action_dim', 3)         # (x, y, yaw)
        state_input_dim = self.pre_action_frames * action_dim + 4   # 3*3 + 4 = 13
        self.state_projector = nn.Sequential(
            nn.Linear(state_input_dim, action_hidden_size),
            nn.SiLU(),
            nn.Linear(action_hidden_size, action_hidden_size),
        )
        self.action_projector = ActionProjector(action_dim, action_hidden_size,
                                                action_frames=self.action_frames)
        self.action_decoder = FinalLayer(action_hidden_size, action_dim)
        self.rf = FlowMatchingScheduler(sample_method="beta", s=1.0)
        self.tau_emb = SinusoidalPosEmb(action_hidden_size)

        # Pi0 核心：VLM 第 i 层 与 Action Expert 第 i 层 配对成共享注意力层
        self.shared_layers = [
            Emu3Pi0SharedLayer(vlm_layer, action_layer)
            for vlm_layer, action_layer in zip(self.vlm.model.layers,
                                               self.action_expert.layers)
        ]
        self.post_init()`}</pre>
      <ul>
        <li><strong>双解码器</strong>：<code>self.vlm</code>（从预训练加载的 Emu3MoE backbone）与 <code>self.action_expert</code>（结构相同但权重全新初始化的 <code>Emu3Model</code>）。</li>
        <li><code>action_dim=3</code>：SE2 驾驶动作 (x, y, yaw)。<code>state_input_dim = pre_action_frames(3) × 3 + 4 = 13</code>：3 帧历史动作 + 4 维 one-hot 驾驶指令（go left / straight / right / unknown）。</li>
        <li><code>state_projector</code> 把 13 维条件编码成 1 个 <code>action_hidden_size</code> 的「state token」；<code>action_projector</code> 编码带噪动作帧；<code>action_decoder</code>（FinalLayer，adaLN 调制）解码回 action_dim。</li>
        <li><code>shared_layers</code> 是 <strong>Pi0 架构的灵魂</strong>：VLM 与 Action Expert 的第 i 层逐对绑定，组成共享注意力层——VLM 层做因果注意力，Action Expert 层能看到 VLM 的文本/图像表征并与之双向交互。</li>
      </ul>
      <pre>{`def forward(self, action, pre_action, cmd, input_ids=None, attention_mask=None, labels=None, ...):
    # Step 1: VLM 初始 embeddings
    vlm_initial_hidden_states = self.vlm.model.embed_tokens(input_ids)   # (B, L, 4096)

    # Step 2: Flow Matching - 采样噪声与时间步
    noise = torch.randn_like(action)                                     # (B, 8, 3)
    tau_values = self.rf.sample_t(noise.shape[0])                       # (B,) ~ Beta(1.5,1.0)
    noisy_action = self.rf.add_noise(action, noise, tau_values)          # (1-tau)*x + tau*noise

    # Step 3: 时间步嵌入（整个 sample 共享同一个 tau）
    tau_emb = self.tau_emb(tau_values).unsqueeze(1).expand(-1, action_frames_len, -1)
    #   (B, 8, 4096)

    # Step 4: 带噪动作 -> action hidden states
    action_hidden_states = self.action_projector(noisy_action, tau_emb_expanded)  # (B, 8, 4096)

    # Step 5: state token = [pre_action; cmd] 编码为 1 个 token
    state_input = torch.cat([pre_action.view(batch_size, -1), cmd], dim=1)  # (B, 13)
    state_token_embedding = self.state_projector(state_input).unsqueeze(1)   # (B, 1, 4096)

    # Step 6: 拼接 -> (B, 9, 4096) = 1 state + 8 action frames
    action_initial_hidden_states = torch.cat(
        [state_token_embedding, action_hidden_states], dim=1)

    # Step 7: 4D 因果风格 attention mask（VLM 因果 / Action 双向）
    combined_attention_mask_4d = self.create_causal_style_attention_mask(
        vlm_seq_len, action_seq_len, attention_mask, input_ids, ...)

    # Step 8: 逐层 shared attention（32 层）
    for layer_idx in range(num_layers):
        current_vlm_h, current_action_h = self.shared_layers[layer_idx](...)

    # Step 9: 最终 norm + 去 state token -> 解码速度场
    final_action_hidden_for_decode = self.action_expert.norm(current_action_h)
    velo_t_pred = self.action_decoder(final_action_hidden_for_decode[:, 1:, :],
                                      tau_emb_expanded)                  # (B, 8, 3)

    # Step 10: Flow matching loss = MSE(目标速度场, 预测速度场)
    action_loss = F.mse_loss(noise - action, velo_t_pred)

    # Step 11: 损失组合（Pi0 主模型默认只算 action loss）
    self.action_loss_weight = 1.0
    self.vlm_loss_weight = 0.0
    total_loss = self.action_loss_weight * action_loss + self.vlm_loss_weight * vlm_loss
    return CausalLMOutputWithPast(loss=total_loss, ...)`}</pre>
      <ul>
        <li><strong>Flow-Matching 目标</strong>：线性插值 <code>z_t = (1−t)·x + t·noise</code>（OT 路径），模型要预测速度场 <code>v(z_t, t)</code>，目标方向是 <code>noise − x</code>（从真实动作指向噪声）。MSE 训练网络逼近这个速度场。</li>
        <li><strong>state token 设计</strong>：历史动作 + 驾驶指令被编码为 1 个 token 插在动作序列开头，为去噪过程提供车辆状态条件。</li>
        <li><code>tau_emb</code> 整 batch 内所有 action frame 共享同一个 tau 值（flow matching 的时间步对整个样本统一）。</li>
        <li><strong>注意力掩码</strong>：VLM 部分 causal，Action 部分 bidirectional（能看到 VLM 中第二个 <code>&lt;boa&gt;</code> 之前的 token，但看不到未来动作帧）。</li>
        <li>Pi0 主模型默认 <code>vlm_loss_weight=0</code>：只算 flow-matching 的 action loss——VLM 已经在 Stage1 预训练好，Stage2 专心学动作。</li>
      </ul>

      <h2>5.3 ActionProjector / FinalLayer / SinusoidalPosEmb — DiT 风格条件化</h2>
      <p>文件: <code>reference/Emu3/emu3/mllm/modeling_emu3.py</code>（lines 1358-1437）</p>
      <pre>{`class ActionProjector(nn.Module):
    def __init__(self, in_channels, dim, action_frames: Optional[int] = None):
        self.W1 = nn.Linear(in_channels, dim)
        self.W2 = nn.Linear(dim + dim, dim)     # 拼接 2 个编码 (dim + dim)
        self.W3 = nn.Linear(dim, dim)
        self.nonlinearity = nn.SiLU()
        self.pos_embed = nn.Embedding(action_frames, dim) if action_frames is not None else None

    def forward(self, x, tau):
        out1 = self.W1(x)                        # (B, seq_len, dim) 动作投影
        if self.pos_embed is not None:
            out1 = out1 + self.pos_embed(torch.arange(x.shape[1], device=x.device))
        out2 = self.W2(torch.cat([out1, tau], dim=-1))    # cat 动作编码 + tau 嵌入
        out3 = self.W3(self.nonlinearity(out2))
        return out3`}</pre>
      <ul>
        <li><code>W1</code> 把 action_dim=3 投影到 hidden=4096；可学习 <code>pos_embed</code>（<code>nn.Embedding(8, 4096)</code>）给每个动作帧独立位置编码。</li>
        <li><code>W2</code> 输入是 <code>[动作编码; tau嵌入]</code> 的拼接（8192 维）——让网络同时融合「哪个动作帧」与「哪个时间步」；<code>W3</code> 接 SiLU。类似 DiT 的调制设计。</li>
      </ul>
      <pre>{`class FinalLayer(nn.Module):
    def __init__(self, hidden_size, out_channels):
        self.norm_final = nn.LayerNorm(hidden_size, elementwise_affine=False, eps=1e-6)
        self.linear = nn.Linear(hidden_size, out_channels, bias=True)
        self.adaLN_modulation = nn.Sequential(nn.SiLU(), nn.Linear(hidden_size, 2 * hidden_size))
        nn.init.constant_(self.linear.weight, 0)   # zero-init 输出层
        nn.init.constant_(self.linear.bias, 0)

    def forward(self, x, c):
        shift, scale = self.adaLN_modulation(c).chunk(2, dim=2)
        x = self.modulate(self.norm_final(x), shift, scale)   # x*(1+scale)+shift
        return self.linear(x)`}</pre>
      <ul>
        <li>DiT 论文经典 FinalLayer：<code>adaLN_modulation</code> 从 tau 嵌入 c 产生 <code>(shift, scale)</code>，对 LayerNorm 输出做仿射调制 <code>x·(1+scale)+shift</code>，让网络按时间步动态调整解码。</li>
        <li><strong>Zero-init</strong>：输出层初始化为 0，训练初期模型输出全零速度场（「什么都不做」）——flow matching 标准技巧，保证初始 loss 稳定（MSE = ‖noise−action‖² 为常数）。</li>
        <li><code>elementwise_affine=False</code>：LayerNorm 不自学 scale/shift，全部由 adaLN 提供。</li>
      </ul>

      <h2>5.4 FlowMatchingScheduler — Beta 时间采样与 OT 插值</h2>
      <p>文件: <code>models/policy_head/noise_schedulers.py</code></p>
      <pre>{`class FlowMatchingScheduler:
    def __init__(self, sample_method="beta", s=0.999):
        self.s = s
        if self.sample_method == "beta":
            self.distribution = Beta(torch.tensor([1.5]), torch.tensor([1.0]))
        elif self.sample_method == "uniform":
            self.distribution = Uniform(torch.tensor([0.0]), torch.tensor([1.0]))

    def sample_t(self, num_samples):
        samples = self.distribution.sample((num_samples,))
        return self.s * (1 - samples).squeeze(1)     # Beta(1.5,1.0) -> t 偏向 0

    def add_noise(self, original_samples, noise, timesteps):
        while len(timesteps.shape) < len(noise.shape):
            timesteps = timesteps.unsqueeze(-1)      # (B,) -> (B,1,1)
        timesteps = timesteps.expand_as(noise)
        return (1 - timesteps) * original_samples + timesteps * noise`}</pre>
      <ul>
        <li><strong>Beta 采样</strong>：<code>Beta(1.5, 1.0)</code> 的 PDF ∝ x^0.5 偏向 x=1，再经 <code>t = s·(1−x)</code> 使 t 偏向 0——更多样本集中在「噪声少」的近真实动作区，让模型精细学习去噪（flow matching 论文推荐分布）。</li>
        <li><strong>add_noise</strong> 即 OT 路径插值 <code>z_t = (1−t)·x + t·noise</code>：t=0 是真实动作，t=1 是纯噪声。</li>
        <li>训练用 <code>s=1.0</code>（Pi0 实例）让 t 覆盖全区间；<code>s=0.999</code> 是默认阈值。</li>
      </ul>

      <h2>5.5 Emu3MoE.forward — 加权 CE + action loss 组合（Stage1）</h2>
      <p>文件: <code>reference/Emu3/emu3/mllm/modeling_emu3.py</code>（lines 1496-1600）</p>
      <pre>{`class Emu3MoE(Emu3PreTrainedModel):
    def __init__(self, config):
        self.model = Emu3Model(config)
        if hasattr(config, "vision_loss_weight"):
            self.use_weight = True
            self.vision_loss_weight = config.vision_loss_weight   # 0.5
            self.eov_token_id = config.eov_token_id
            self.bov_token_id = config.bov_token_id
        self.action_experts = ...
        if self.action_experts:
            self.action_projector = ActionProjector(config.action_dim, action_config.hidden_size)
            self.action_layers = nn.ModuleList(
                [Emu3DecoderLayer(action_config, layer_idx)
                 for layer_idx in range(action_config.num_hidden_layers)])   # 2 层
            self.action_decoder = FinalLayer(action_config.hidden_size, config.action_dim)
            self.rf = FlowMatchingScheduler(sample_method="beta", s=1.0)
        self.lm_head = nn.Linear(config.hidden_size, config.vocab_size, bias=False)

    def forward(self, input_ids, ..., action=None, labels=None):
        hidden_states = self.model(input_ids=input_ids, ...)[0]     # (B, L, 4096)

        # 训练时动作分支
        if action is not None and self.action_experts and self.training:
            noise = torch.randn_like(action)
            tau = self.rf.sample_t(noise.shape[0])
            noise_action = self.rf.add_noise(action, noise, tau)
            velo_pred, _ = self.forward_action(noise_action, tau, hidden_states)
            loss_action = F.mse_loss(noise - action, velo_pred)

        logits = self.lm_head(hidden_states).float()                # (B, L, 184622)
        if labels is not None:
            shift_logits = logits[..., :-1, :].contiguous()
            shift_labels = labels[..., 1:].contiguous()
            if self.use_weight:
                weights = torch.ones(self.config.vocab_size)
                weights[self.bov_token_id : self.eov_token_id + 1] = self.vision_loss_weight
                loss_fct = CrossEntropyLoss(weight=weights.to(logits.device))
            else:
                loss_fct = CrossEntropyLoss()
            loss = loss_fct(shift_logits.view(-1, self.config.vocab_size),
                            shift_labels.view(-1))
            if action is not None and self.action_experts:
                loss += loss_action * self.vision_loss_weight       # action loss 加权
        return CausalLMOutputWithPast(loss=loss, logits=logits, ...)`}</pre>
      <ul>
        <li><strong>Emu3MoE 是串联式</strong>：先过 VLM 全部 32 层拿 hidden_states，再在 <code>forward_action</code> 里把 action hidden states 拼在后面一起过 <code>action_layers</code>（仅 2 层，远少于 Pi0 的 32 层共享注意力——更轻量的 MoE 设计）。</li>
        <li><strong>Vision-token 加权 CE</strong>：<code>weights[bov:eov]=0.5</code>——视觉 token 的 CE 梯度权重是普通 token 的一半，平衡文本与视觉学习（MoE 顶层 <code>vision_loss_weight=0.5</code>）。</li>
        <li><strong>Loss 组合</strong>：<code>total = CE + loss_action × vision_loss_weight(5.0)</code>——action flow-matching loss 权重是 CE 的 5 倍（<code>moe_fast_video.json</code> action_config 里）。</li>
        <li>MoE 版本的动作分支只在 <code>training</code> 时激活（推理走 lm_head 文本/动作 token 生成）。</li>
      </ul>

      <h2>5.6 Emu3DrivingVAVADataset — VAVA 双段序列 + FAST 动作 token</h2>
      <p>文件: <code>utils/datasets.py</code>（lines 602-805）</p>
      <pre>{`class Emu3DrivingVAVADataset(Emu3SFTDataset):
    def __init__(self, args, tokenizer):
        self.cur_idx = args.cur_frame_idx        # 默认 3
        self.text_name_list = ["go left", "go straight", "go right", "unknown"]
        self.prompt2vec = {name: F.one_hot(torch.tensor(i), 4).float()
                           for i, name in enumerate(self.text_name_list)}

    def __getitem__(self, index: int):
        scene = self.data[index]
        prompt = scene["text"][self.cur_idx]           # 当前帧指令
        action = scene["action"]                       # (T, 3) 未来动作
        pre_action = scene["pre_1s_action"]            # (T_pre, 3) 前 1 秒动作

        do_flip = self.use_flip and self.rng.random() < 0.5
        if do_flip:
            action = action.copy()
            action[:, 1:] *= -1                        # 水平翻转: y/yaw 取反

        # VQ 图像码 + 采样 action 帧
        image_tokens, action_tokens = self.random_frames_to_tensor(
            image_tokens_path, frames_num, self.T, action_prompt=action, do_flip=do_flip)
        pre_image_tokens, pre_action_tokens = self.random_frames_to_tensor(
            pre_image_tokens_path, 2, self.T, action_prompt=pre_action, do_flip=do_flip)

        # FAST 动作分词：连续动作 -> 词表尾部 token id
        self.last_vocab_idx = self.tokenizer.pad_token_id - 1
        action_ids = self.action_tokenizer(action_tokens)[0]
        action_ids = [self.last_vocab_idx - id for id in action_ids]   # 翻转映射到 vocab 尾
        pre_action_ids = self.action_tokenizer(pre_action_tokens)[0]
        pre_action_ids = [self.last_vocab_idx - id for id in pre_action_ids]

        # VLM 序列：前 1 秒(带 bos) + 当前帧(不带 bos)
        input = prompt + self.format_video_prompt(image_tokens)
        pre_input = self.tokenizer.bos_token + pre_prompt + self.format_video_prompt(pre_image_tokens)

        # Loss mask: 只在视觉 token 上算 CE
        labels = sample["input_ids"]
        if self.args.apply_loss_on_only_vision:
            labels = torch.where(
                torch.logical_and(labels >= self.bov, labels <= self.eov),
                labels, self.args.ignore_index)
        sample["labels"] = labels

        # 拼接前 1 秒 + 当前帧，追加 <boa> action <eoa>
        for k in sample:
            sample[k] = torch.cat([pre_sample[k], sample[k]], dim=-1)
        sample = self.append_action_to_sample(sample, action_ids)

        # 给 Emu3Pi0 的连续动作字段
        sample["action"] = torch.tensor(action_tokens, dtype=torch.float)          # (8, 3)
        sample["pre_action"] = torch.tensor(action[0:self.cur_idx], dtype=torch.float)  # (3, 3)
        sample["cmd"] = self.prompt2vec[prompt]                                     # (4,)
        return sample`}</pre>
      <ul>
        <li><strong>VAVA 双段序列</strong>：Video-Action × 2——前 1 秒的 (text+image+action) 拼当前秒的 (text+image+action)，让模型看到「过去动作 + 未来动作」的对齐关系。</li>
        <li>图像已离线 VQ 化为 <code>(1, 18, 32)=576 token/帧</code> 的 <code>.npy</code>；<code>random_frames_to_tensor</code> 加载并按需翻转。</li>
        <li><strong>FAST 动作 token</strong>：连续动作经 <code>UniversalActionProcessor</code> 编成离散 id，再 <code>last_vocab_idx − id</code> 翻转映射到词表尾部（紧挨 pad_token 之前），避免与文本/视觉 token 冲突。</li>
        <li><strong>双 loss mask 开关</strong>：<code>apply_loss_on_only_vision=True</code> 只在视觉 token 上算 CE；<code>apply_loss_on_only_action=True</code> 则只让 <code>&lt;boa&gt;…&lt;eoa&gt;</code> 参与 CE（AR 路径）。历史动作的 label 恒为 −100。</li>
        <li>输出 <code>action (8,3)</code> / <code>pre_action (3,3)</code> / <code>cmd (4,)</code> 三个连续字段给 Emu3Pi0 的 flow-matching 分支。</li>
      </ul>

      <h2>5.7 FAST UniversalActionProcessor — DCT+BPE 动作分词</h2>
      <p>文件: <code>configs/fast/processing_action_tokenizer.py</code></p>
      <pre>{`def __call__(self, action_chunk: np.array) -> np.array:
    # action_chunk: (T, D) 或 (batch, T, D)
    # Step 1: DCT（对时间轴做正交离散余弦变换）
    dct_coeff = dct(action_chunk, axis=1, norm="ortho")
    # Step 2: 缩放 + 量化取整
    dct_coeff = np.around(dct_coeff * self.scale)          # scale=10
    # Step 3: 转字符 + BPE 分词
    tokens = []
    for elem in dct_coeff:
        token_str = "".join(map(
            chr, np.maximum(elem.flatten() - self.min_token, 0).astype(int)))
        tokens.append(self.bpe_tokenizer(token_str)["input_ids"])
    return tokens

def decode(self, tokens, *, time_horizon=None, action_dim=None):
    # BPE 解码回字符串 -> ord() 转回整数 -> 加回 min_token
    coeff_flat = np.array(list(map(ord, decoded_tokens)), dtype=np.int64) + self.min_token
    # 长度对齐: pad / truncate 到 time_horizon * action_dim
    # reshape + IDCT 逆变换回连续动作
    decoded_dct_coeff = coeff_flat.reshape(time_horizon, action_dim)
    decoded_actions.append(idct(decoded_dct_coeff / self.scale, axis=0, norm="ortho"))
    return np.stack(decoded_actions)`}</pre>
      <ul>
        <li><strong>编码链路</strong>：连续动作 (T,D) → 时间轴 DCT（能量压缩，信息集中在前几阶系数）→ <code>×10</code> 量化取整 → 逐系数 <code>chr()</code> 字符化 → ByteLevel BPE 分词。</li>
        <li><strong>解码链路</strong>：BPE decode → <code>ord()</code> 还原整数 → 加回 <code>min_token</code> → pad/截断到 <code>T×D</code> → reshape → IDCT 还原连续动作。</li>
        <li><strong>设计动机</strong>：DCT 的频率压缩让 BPE 高效编码（低频系数变化小、高频接近零），且把连续动作空间压成离散 token 序列——与文本/视觉 token 在<strong>同一个词表</strong>处理，是 FAST（Action Tokenizer）的核心。</li>
      </ul>

      <h2>5.8 训练脚本与配置文件 — 超参对照</h2>
      <p>文件: <code>scripts/scripts_train/train_navsim_flow_matching.sh</code></p>
      <pre>{`torchrun --nproc_per_node=8 --nnodes=1 \\
    train/train_pi0.py \\
    --model_config_path configs/pi0_fast_video.json \\
    --actions_format fast \\
    --deepspeed scripts/sft/zero3_offload.json \\
    --learning_rate 5e-5 \\
    --null_prompt_prob 0.15 \\
    --weight_decay 0.1 --min_learning_rate 1e-6 --max_grad_norm 5.0 \\
    --bf16 True --tf32 True \\
    --freeze_vlm False \\
    --max_steps 10000 \\
    --per_device_train_batch_size 12 \\
    --frames 1 --action_frames 8 \\
    --max_position_embeddings 1400 \\
    --lr_scheduler_type cosine_with_min_lr --warmup_steps 50 \\
    --gradient_checkpointing True \\
    --apply_loss_on_only_vision True --apply_loss_on_only_action False \\
    --use_previous_actions True --cur_frame_idx 3 --use_flip True \\
    --action_dim 3 --train_action_only False \\
    --action_loss_weight 1.0 --action_sample_steps 10`}</pre>
      <ul>
        <li><code>action_frames=8 / action_dim=3</code>：预测未来 8 帧 SE2 动作；<code>frames=1</code> 当前只看 1 帧图像。</li>
        <li><code>null_prompt_prob=0.15</code>：15% 概率丢弃文本指令——训练 CFG 无条件分支，推理可做 classifier-free guidance（比 Emu3 基座的 5% 更高，动作任务对指令敏感）。</li>
        <li><code>action_loss_weight=1.0</code>、<code>action_sample_steps=10</code>：flow-matching loss 权重 1.0，推理 Euler 积分 10 步。</li>
        <li><code>freeze_vlm=False</code>：主模型全参微调（VLM + action expert 一起训练）。</li>
        <li><code>max_position_embeddings=1400</code>：序列 1 帧图（576 视觉 token）+ 双段文本 + 动作 token，1400 足够。</li>
      </ul>
      <p>配置文件 <code>configs/moe_fast_video.json</code> 的 action_config 块：</p>
      <pre>{`{
  "architectures": ["Emu3MoE"],
  "hidden_size": 4096,
  "num_hidden_layers": 32,
  "num_key_value_heads": 8,
  "vocab_size": 184622,
  "vision_loss_weight": 0.5,
  "action_config": {
    "hidden_size": 4096,
    "intermediate_size": 2048,
    "num_hidden_layers": 2,
    "num_key_value_heads": 8,
    "action_dim": 7,
    "vision_loss_weight": 5.0,
    "_attn_implementation": "flash_attention_2"
  }
}`}</pre>
      <ul>
        <li>顶层描述 VLM backbone（32 层 / 4096 / GQA 8 KV head），<code>action_experts=false</code> 由训练脚本的 <code>Emu3Pi0Config</code> 覆盖。</li>
        <li><strong>action_config</strong>：动作专家仅 2 层、FFN 2048（轻量）；<code>action_dim=7</code> 是机械臂默认（x,y,z,roll,pitch,yaw,gripper），驾驶场景用 <code>--action_dim 3</code> 覆盖。</li>
        <li><code>vision_loss_weight</code>：顶层 0.5（视觉 token CE 加权）vs action_config 内 5.0（action loss 在总 loss 中的加权系数）——两处含义不同。</li>
      </ul>

      <h2>5.9 全流程串讲（数据流视角）</h2>
      <ol>
        <li><strong>离线</strong>：视觉 VQ-VAE 把每帧图像量化成 <code>(18,32)</code> 码存 <code>.npy</code>；动作保持连续 float 存 pickle。</li>
        <li><strong>在线样本</strong>（datasets.py）：拼 <code>前1秒(bos+text+VQ)+当前帧(text+VQ)</code> 双段序列，FAST 把动作离散化并映射到词表尾，输出 <code>action / pre_action / cmd</code> 连续字段。</li>
        <li><strong>前向</strong>（Emu3Pi0.forward）：VLM 编码文本+图像 → flow matching 采样 <code>(tau, noise)</code> 加噪动作 → <code>state_projector</code> 编历史+指令 → 32 层共享注意力 → <code>FinalLayer</code> 解码速度场。</li>
        <li><strong>损失</strong>：<code>MSE(noise−action, velo_pred)</code>（主模型只算 action loss）；MoE 阶段叠加加权 CE（视觉 token ×0.5）。</li>
        <li><strong>分布式</strong>：DeepSpeed ZeRO-3 + CPU offload 支撑 8B VLM + 独立 action expert 双解码器，BF16 + gradient checkpointing。</li>
      </ol>

      <Callout type="tip">
        <strong>一句话总结 DriveVLA-W0 训练：</strong>Emu3-8B 基座先在 NuPlan 上做世界模型预训练，再在 Navsim 上叠加动作专家，用 Flow-Matching（速度场 MSE）+ 加权 CE（视觉 token 更高权重）双损失联合训练；DeepSpeed ZeRO-3 + CPU offload + BF16 支撑 8B 级模型，FAST 分词器把连续动作离散化成 BPE token 供自回归路径使用。
      </Callout>

      {/* ==================== 6. 关键配置与文件速查 ==================== */}
      <div className="section-divider"><span>关键配置与文件速查</span></div>

      <table>
        <thead><tr><th>作用</th><th>路径（点击跳转 GitHub 源码）</th></tr></thead>
        <tbody>
          <tr><td>训练入口（MoE）</td><td><SrcLink path="utils/train_moe.py" /></td></tr>
          <tr><td>训练入口（Flow-Matching 主模型）</td><td><SrcLink path="utils/train_pi0.py" /></td></tr>
          <tr><td>训练入口（AR / QFormer）</td><td><SrcLink path="utils/train_ar.py" /> / <SrcLink path="utils/train_qformer.py" /></td></tr>
          <tr><td>数据集类</td><td><SrcLink path="utils/datasets.py" /></td></tr>
          <tr><td>模型实现（Emu3MoE/Pi0/AR/QFormer）</td><td><SrcLink path="reference/Emu3/emu3/mllm/modeling_emu3.py" /></td></tr>
          <tr><td>Config 类</td><td><SrcLink path="reference/Emu3/emu3/mllm/configuration_emu3.py" /></td></tr>
          <tr><td>FAST 动作分词器</td><td><SrcLink path="configs/fast/processing_action_tokenizer.py" /></td></tr>
          <tr><td>OpenVLA 风格 ActionTokenizer</td><td><SrcLink path="models/tokenizer/action_tokenizer.py" /></td></tr>
          <tr><td>VQ 视觉 tokenizer 离线抽取</td><td><SrcLink path="models/tokenizer/emu3_tokenizer_navsim.py" /></td></tr>
          <tr><td>Policy Head / DiT expert</td><td><SrcLink path="models/policy_head/diffusion_policy.py" /> · <SrcLink path="models/policy_head/moe_experts.py" /> · <SrcLink path="models/policy_head/flow_matching.py" /> · <SrcLink path="models/policy_head/noise_schedulers.py" /></td></tr>
          <tr><td>DeepSpeed ZeRO-3 + CPU offload</td><td><SrcLink path="scripts/sft/zero3_offload.json" /></td></tr>
          <tr><td>Stage1 预训练脚本</td><td><SrcLink path="scripts/pretrain/train_nuplan_6va_multi_v0.2_master.sh" /> · <SrcLink path="scripts/pretrain/train_nuplan_6va_multi_v0.2_worker.sh" /></td></tr>
          <tr><td>Stage2 微调脚本</td><td><SrcLink path="scripts/scripts_train/train_navsim_ar.sh" /> · <SrcLink path="scripts/scripts_train/train_navsim_flow_matching.sh" /> · <SrcLink path="scripts/scripts_train/train_navsim_query_based.sh" /></td></tr>
        </tbody>
      </table>
    </div>
  );
}
