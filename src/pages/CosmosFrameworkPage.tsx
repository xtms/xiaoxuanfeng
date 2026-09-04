import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout } from '../components/CodeBlock';

const GH = 'https://github.com/NVIDIA/cosmos-framework/blob/main';

function SrcLink({ path }: { path: string }) {
  return (
    <a href={`${GH}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function CosmosFrameworkPage() {
  return (
    <div className="prose max-w-none">
      <h1>Cosmos-Framework — 训练框架实现架构分析</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">🏷️ NVIDIA · 世界模型 · 蒸馏 · FSDP · LoRA</span>
        <span className="page-meta-item">📖 源码分析</span>
      </div>
      <p>
        NVIDIA 开源的 <strong>Cosmos-Framework</strong>，是 Cosmos 世界模型（T2V/I2V/V2V）与
        推理世界模型的<strong>训练/微调基础设施</strong>，版本 <code>1.2.2</code>。本文基于{' '}
        <code>/data/sd/cosmos-framework</code>（main 分支）源码，按 Pi-0.5 页面粒度给出
        <strong>代码级逐步分析</strong>——每个关键点附真实源码 + 逐行解释 + 文件路径。
      </p>

      <Callout type="tip">
        <strong>核心结论：</strong>Cosmos-Framework 是自研的 <strong>ImaginaireTrainer</strong> 训练体系（同 Pi-0.5/Imaginaire
        血统，不是 megatron-native，但会 import megatron.core 初始化并行状态），区别于
        UniAD 的 mmdet Runner 复用。工程上最大特色有三：① <strong>三层配置流</strong>——
        pydantic 校验的 <code>.toml</code>（<code>--sft-toml</code>）→ Hydra override 列表 → LazyConfig
        LazyDict；② <strong>上下文并行数据窗口</strong>（<code>ContextParallelDataWindow</code>）——
        一份 batch 跨 <code>cp_size</code> 步被所有 CP rank 复用；③ <strong>可插拔回调</strong>体系
        （约 40 个 callback：grad_clip / skip_nan_step / MoE 稳定性 / wandb …）。训练范式是
        <strong>rectified-flow（flow-matching）</strong>，蒸馏路径用 <code>DistillationTrainer</code>（closures +
        PhaseOptimizer）。
      </Callout>

      {/* ==================== 1. 仓库整体布局 ==================== */}
      <div className="section-divider"><span>仓库整体布局</span></div>

      <h3>1.1 目录结构</h3>
      <MermaidDiagram chart={`
graph TD
    R["📦 cosmos-framework 仓库根目录"]
    R --> S["scripts/ 训练入口"]
    R --> TR["trainer/ 训练循环"]
    R --> MD["model/ 模型 + 并行包装"]
    R --> D["data/ 数据管道"]
    R --> CFG["configs/ 配置系统"]
    R --> CB["callbacks/ ~40 个回调"]
    R --> CK["checkpoint/ DCP ↔ HF"]
    R --> EX["examples/ TOML 配方"]
    R --> PK["packages/ transformers-cosmos3 · vllm-cosmos3"]

    S --> T1["train.py 新版 --sft-toml<br/>pydantic 校验 TOML"]
    S --> T2["_train.py 旧版 --config_file<br/>YAML + Hydra"]

    TR --> IT["ImaginaireTrainer<br/>train / training_step / validate"]
    TR --> DT["distillation.py<br/>DistillationTrainer 蒸馏"]

    MD --> OMN["generator/omni_mot_model.py<br/>OmniMoTModel"]
    MD --> BASE["_base.py ImaginaireModel"]

    CFG --> TOML1["toml_config/sft_config.py<br/>SFTExperimentConfig"]
    CFG --> HELPER["toml_config/toml_config_helper.py<br/>PATH_REMAPS"]
    CFG --> SKU["base/experiment/sft/vision_sft_super.py<br/>LazyCall SKU"]
      `} />

      <h3>1.2 技术选型特点</h3>
      <table>
        <thead><tr><th>维度</th><th>选型</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>训练入口</strong></td><td><code>scripts/train.py</code></td><td>唯一输入 <code>--sft-toml</code>，pydantic <code>SFTExperimentConfig</code> 校验，无 <code>--config</code></td></tr>
          <tr><td><strong>配置系统</strong></td><td>三层：TOML → Hydra override → LazyConfig</td><td>TOML 叶子经 <code>PATH_REMAPS</code> 重映射为 Hydra 点路径 override，再 compose 成 LazyConfig LazyDict</td></tr>
          <tr><td><strong>分布式</strong></td><td>DDP / FSDP</td><td><code>trainer.distributed_parallelism</code> 切换；FSDP 走自研 wrapper；megatron parallel_state 管 TP/PP/CP 并行状态</td></tr>
          <tr><td><strong>精度</strong></td><td>bf16 + <code>torch.amp.GradScaler</code></td><td><code>grad_scaler.scale(loss / grad_accum_iter)</code> 每个 micro-batch 缩放</td></tr>
          <tr><td><strong>训练范式</strong></td><td>rectified-flow（flow-matching）</td><td>训练时采样 <code>t</code>、构造噪声 <code>xt</code>，模型预测流场速度 <code>v</code></td></tr>
          <tr><td><strong>上下文并行</strong></td><td>CP data window</td><td>一份 batch 跨 <code>cp_size</code> 步复用，all_reduce stop 信号</td></tr>
          <tr><td><strong>扩展</strong></td><td>回调体系</td><td>grad_clip / skip_nan / MoE 稳定性 / compile_tokenizer / wandb …</td></tr>
        </tbody>
      </table>

      {/* ==================== 2. 三层配置系统 ==================== */}
      <div className="section-divider"><span>三层配置系统总览</span></div>

      <MermaidDiagram chart={`
graph LR
    TOML["📄 examples/toml/sft_config/<br/>vision_sft_super.toml"]
    TOML --> PYD["pydantic SFTExperimentConfig<br/>extra='forbid' 未知 key 报错"]
    PYD --> OVR["build_hydra_overrides()<br/>PATH_REMAPS 路径重映射"]
    OVR --> HY["Hydra compose<br/>experiment=vision_sft_super<br/>+ dotted.path=value"]
    HY --> LZ["LazyConfig LazyDict<br/>lazy_instantiate"]
    LZ --> CFG["Config<br/>validate() → freeze()"]
    CFG --> TR["config.trainer.type(config)<br/>ImaginaireTrainer"]
      `} />

      <h3>2.1 三层职责</h3>
      <table>
        <thead><tr><th>层</th><th>文件</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><strong>TOML</strong></td><td><code>examples/toml/sft_config/*.toml</code></td><td>用户手写配方：job / model / optimizer / scheduler / trainer / checkpoint / dataloader 各段</td></tr>
          <tr><td><strong>pydantic</strong></td><td><code>configs/toml_config/sft_config.py</code></td><td><code>model_validate(raw)</code> 结构校验，<code>extra="forbid"</code> 拦截拼写错误；再转成 Hydra override 列表</td></tr>
          <tr><td><strong>LazyConfig</strong></td><td><code>configs/base/*</code> + <code>utils/lazy_config.py</code></td><td>实验 SKU（<code>LazyDict</code>）+ base config 经 Hydra compose 合并；<code>instantiate()</code> 延迟构造对象</td></tr>
        </tbody>
      </table>

      {/* ==================== 3. 端到端训练流程 ==================== */}
      <div className="section-divider"><span>端到端训练流程</span></div>

      <MermaidDiagram chart={`
sequenceDiagram
    participant U as 启动脚本
    participant T as scripts/train.py
    participant P as SFTExperimentConfig (pydantic)
    participant H as Hydra overrides
    participant TR as ImaginaireTrainer
    participant M as OmniMoTModel
    participant D as dataloader_train
    participant C as callbacks ×N

    U->>T: torchrun ... -m cosmos_framework.scripts.train --sft-toml=...
    T->>T: _setup_deterministic_env_and_backends() (若 --deterministic)
    T->>P: tomllib 解析 + model_validate(raw)
    P-->>T: 校验通过
    T->>H: build_hydra_overrides(raw) → override 列表
    T->>T: load_config(base_config, overrides) → Config
    T->>TR: launch(): distributed_init → validate → freeze → config.trainer.type(config)
    TR->>M: instantiate(config.model) (model_init)
    TR->>D: instantiate(config.dataloader_train) (data_loader_init)
    TR->>TR: on_train_start + init_optimizer_scheduler + GradScaler + checkpointer.load
    loop max_iter 个优化器步
        TR->>D: _fetch_data_batch (CP window / next)
        D-->>TR: data_batch (cuda)
        TR->>C: on_training_step_start
        TR->>M: training_step(data, iteration) → (output, loss)
        M-->>TR: loss
        TR->>TR: grad_scaler.scale(loss / grad_accum_iter).backward()
        TR->>C: on_after_backward
        TR->>TR: grad_accum_iter==grad_accum → optimizer.step + zero_grad
        TR->>TR: iteration % save_iter==0 → checkpointer.save
        TR->>C: on_training_step_end
    end
    TR->>TR: validate() (ema_scope)
    TR->>TR: on_train_end + checkpointer.finalize + destroy_process_group
      `} />

      {/* ==================== 4. 核心代码逐步分析 ==================== */}
      <div className="section-divider"><span>核心代码逐步分析</span></div>

      <p>以下按「TOML 入口 → pydantic/Hydra 配置流 → 训练器初始化 → 训练循环 → 单步 → CP 数据窗口 → 蒸馏 → 模型基类 → 回调 → 配方 TOML → 旧版入口」逐文件给出真实源码与逐行解析。</p>

      <h2>4.1 scripts/train.py — 新版 TOML 训练入口</h2>
      <p>文件: <SrcLink path="cosmos_framework/scripts/train.py" /></p>
      <pre>{`# 命令行形态：TOML 是唯一配置输入
torchrun --nproc_per_node=<N> -m cosmos_framework.scripts.train \\
    --sft-toml=examples/toml/sft_config/<experiment>.toml \\
    -- optimizer.lr=1e-5 trainer.max_iter=200

parser.add_argument("--sft-toml", required=True,
    help="Path to an SFT structured-dataclass TOML ...")
parser.add_argument("opts", nargs=argparse.REMAINDER, default=[],
    help="Extra Hydra-style dotted-path overrides ...")
parser.add_argument("--deterministic", action="store_true", ...)

args = parser.parse_args()
if args.deterministic:
    _setup_deterministic_env_and_backends()   # 脚本入口，CUDA init 前
config = load_experiment_from_toml(args.sft_toml, extra_overrides=args.opts)`}</pre>
      <ul>
        <li><code>--sft-toml</code> 是<strong>唯一</strong>配置输入，TOML 内部 <code>[job].task</code> 决定走 vfm 还是 vlm 的 base config；<code>opts</code> 用 <code>argparse.REMAINDER</code> 吃掉尾部 <code>key.path=value</code>，<strong>后加覆盖 TOML</strong>。</li>
        <li><code>--deterministic</code> 在<strong>任何 CUDA 初始化之前</strong>执行（env var 必须在 cublas init 前生效）：<code>CUBLAS_WORKSPACE_CONFIG=:4096:8</code>、<code>FLASH_ATTENTION_DETERMINISTIC=1</code>、cudnn deterministic、<code>use_deterministic_algorithms(warn_only=True)</code>。注意 <code>PYTHONHASHSEED</code> 必须在解释器启动时外部设置，这里只能告警。</li>
      </ul>

      <h3>4.1.1 launch() 主流程</h3>
      <pre>{`def launch(config, args):
    # 必须先初始化分布式再 validate()：validate 会跨 rank 同步 buffer
    with distributed_init():
        distributed.init()

    if args.deterministic:
        _apply_deterministic_config_overrides(config)  # 配置级覆盖
    config.validate()   # 校验
    config.freeze()     # 冻结，训练中不可改
    trainer = config.trainer.type(config)   # LazyConfig 反序列化出训练器

    with model_init():
        model = instantiate(config.model)   # LazyDict -> 真实模型
    with data_loader_init():
        dataloader_train = instantiate(config.dataloader_train)
        dataloader_val = instantiate(config.dataloader_val)

    trainer.train(model, dataloader_train, dataloader_val)`}</pre>
      <ul>
        <li><code>distributed_init()</code> 必须在 <code>validate()</code> 之前：注释解释了 rank0 会先分配 buffer 导致浪费，且校验需要跨 rank 同步。</li>
        <li><code>_apply_deterministic_config_overrides</code> 在 <code>freeze()</code> 前改配置：<code>trainer.seed</code> 默认 0 → 42、每个 dataloader <code>num_workers=0</code>、所有 <code>compile.enabled=False</code>（Blackwell FMHA 无确定性 kernel，torch.compile 会冻结 kernel 选择）。</li>
        <li><code>config.trainer.type(config)</code> 是 LazyConfig 的经典用法——type 字段是类引用，直接在配置树里 <code>instantiate</code>。</li>
      </ul>

      <h2>4.2 configs/toml_config/sft_config.py — TOML → pydantic → Hydra</h2>
      <p>文件: <SrcLink path="cosmos_framework/configs/toml_config/sft_config.py" /></p>
      <pre>{`_PYDANTIC_MODEL_CONFIG = ConfigDict(extra="forbid", protected_namespaces=())

class SFTExperimentConfig(BaseModel):
    model_config = _PYDANTIC_MODEL_CONFIG
    job: JobConfig = Field(default_factory=JobConfig)
    model: ModelConfig = Field(default_factory=ModelConfig)
    optimizer: OptimizerConfig = Field(default_factory=OptimizerConfig)
    scheduler: SchedulerConfig = Field(default_factory=SchedulerConfig)
    trainer: TrainerConfig = Field(default_factory=TrainerConfig)
    checkpoint: CheckpointConfig = Field(default_factory=CheckpointConfig)
    dataloader_train: DataloaderTrainConfig = Field(default_factory=DataloaderTrainConfig)
    custom: dict[str, Any] = Field(default_factory=dict)

def load_experiment_from_toml(toml_path, extra_overrides=None):
    with open(toml_path, "rb") as fh:
        raw = tomllib.load(fh)
    cfg = SFTExperimentConfig.model_validate(raw)   # extra="forbid"
    task = raw.get("job", {}).get("task", "vfm")
    base_config_path = TASK_TO_BASE_CONFIG[task]
    overrides = build_hydra_overrides(raw)
    if extra_overrides:
        for o in extra_overrides:
            if not o or o == "--":
                continue
            overrides.append(o)
    config = load_config(base_config_path, overrides)
    config.custom = raw.get("custom", {})
    return config`}</pre>
      <ul>
        <li><code>extra="forbid"</code>：TOML 里任何 schema 没有的 key 都会抛 <code>ValidationError</code>——这是<strong>拼写错误拦截器</strong>（例如把 <code>grad_accum_iter</code> 写成 <code>grad_acum_iter</code> 会在启动时报错而不是悄悄忽略）。</li>
        <li><code>[job].task</code> 是 META 字段：<code>vfm</code> → <code>configs/base/config.py</code>（视频基础模型），<code>vlm</code> → <code>configs/base/reasoner/config.py</code>（视觉语言模型），它决定用哪棵 Hydra 配置树。</li>
        <li>每个叶子字段转成一条 Hydra override（<code>experiment=...</code> + <code>dotted.path=value</code>），<code>extra_overrides</code> 追加在<strong>最后</strong>，所以命令行赢过 TOML。</li>
        <li><code>[custom]</code> 是逃生舱：Hydra resolve <strong>之后</strong>原样注入 <code>config.custom</code>，框架不校验内容，但也不能用 <code>{'${...}'}</code> 插值。</li>
      </ul>

      <h2>4.3 toml_config_helper.py — PATH_REMAPS 路径重映射</h2>
      <p>文件: <SrcLink path="cosmos_framework/configs/toml_config/toml_config_helper.py" /></p>
      <p>TOML 里的扁平路径和 Hydra 树里的深度路径往往不一致（例如 <code>model.ema.enabled</code> 在 VLM 上要落在 <code>model.config.ema.enabled</code>），所以每片叶子先过最长前缀重映射：</p>
      <pre>{`PATH_REMAPS = {
    "vfm": {
        ("model", "attn_implementation"): None,          # VFM 无此 knob
        ("model",): ("model", "config"),                 # 统一前缀替换
    },
    "vlm": {
        ("model", "lora_enabled"): None,
        ("model", "ema"): ("model", "config", "ema"),
        ("model",): ("model", "config"),
    },
}

def _apply_remap(rules, path):
    # 贪婪最长前缀：路径越具体越优先
    for n in range(len(path), 0, -1):
        key = tuple(path[:n])
        if key in rules:
            replacement = rules[key]
            if replacement is None:
                return None             # 此叶子整个跳过
            return list(replacement) + path[n:]
    return path                          # 无规则则原样透传

def build_hydra_overrides(toml_dict):
    overrides = ["--"]
    job = dict(toml_dict.get("job", {}))
    task = job.pop("task", "vfm")
    experiment_name = job.pop("experiment", None)
    overrides.append(f"experiment={experiment_name}")
    ...
    for top_key, val in overlay.items():
        _emit_with_remap(overrides, [top_key], val, rules)
    return overrides`}</pre>
      <ul>
        <li><strong>最长前缀优先</strong>：<code>("model",)</code> 是兜底规则，把整个 <code>model.*</code> 前缀换成 <code>model.config.*</code>；而 <code>("model", "ema")</code> 更具体，VLM 上把 EMA 直接路由到 <code>model.config.ema</code>。</li>
        <li>映射值是 <code>None</code> 表示「该任务跳过此字段」——同一份 TOML 字段，VFM/VLM 各自决定要不要、落到哪。</li>
        <li><code>_emit_with_remap</code> 还把 <code>"???"</code>（OmegaConf MISSING 哨兵）过滤掉：TOML 写 <code>load_path="???"</code> 表示「用户运行时通过 env 或 CLI 提供」，不能真的发射一条 <code>load_path=???</code>。</li>
        <li><code>_hydra_format</code> 处理类型：bool → <code>true/false</code>、list → <code>[a,b]</code>、含逗号/空格的字符串加单引号（防止 <code>"480"</code> 被 Hydra 解析成 int）。</li>
      </ul>

      <h2>4.4 trainer/__init__.py — ImaginaireTrainer 构造</h2>
      <p>文件: <SrcLink path="cosmos_framework/trainer/__init__.py" /></p>
      <pre>{`try:
    from megatron.core import parallel_state
    USE_MEGATRON = True
except ImportError:
    USE_MEGATRON = False

def __init__(self, config):
    self.config = config
    with distributed_init():
        distributed.init()
        if USE_MEGATRON:
            parallel_state.initialize_model_parallel(
                pipeline_model_parallel_size=config.model_parallel.pipeline_model_parallel_size,
                tensor_model_parallel_size=config.model_parallel.tensor_model_parallel_size,
                context_parallel_size=config.model_parallel.context_parallel_size,
                create_gloo_process_groups=False)
            parallel_state.sequence_parallel = config.model_parallel.sequence_parallel
            if parallel_state.sequence_parallel:
                os.environ["CUDA_DEVICE_MAX_CONNECTIONS"] = "1"

    if distributed.is_rank0():
        os.makedirs(config.job.path_local, exist_ok=True)
        LazyConfig.save_pkl(config, f"{config.job.path_local}/config.pkl")
        LazyConfig.save_yaml(config, f"{config.job.path_local}/config.yaml")
    dist.barrier()

    misc.set_random_seed(seed=config.trainer.seed, by_rank=True)
    torch.backends.cudnn.deterministic = config.trainer.cudnn.deterministic
    self.callbacks = callback.CallBackGroup(config=config, trainer=self)
    self.checkpointer = Checkpointer(config.checkpoint, config.job, callbacks=self.callbacks)
    self.training_timer = misc.TrainingTimer()
    self.straggler_detector = StragglerDetectorV2(...)
    self._cp_data_window = ContextParallelDataWindow()
    signal.signal(signal.SIGALRM, functools.partial(misc.timeout_handler, config.trainer.timeout_period))`}</pre>
      <ul>
        <li>并行状态初始化委托给 <code>megatron.core.parallel_state.initialize_model_parallel</code>（TP/PP/CP），但<strong>数据并行不走 megatron</strong>——DDP/FSDP 由自研 <code>distributed.parallel_model_wrapper</code> 在 <code>train()</code> 里包。这是「Imaginaire 血统 + 借 megatron 的并行状态」的混合架构。</li>
        <li>rank0 把整个 config 同时存成 <code>config.pkl</code>（可反序列化回对象）和 <code>config.yaml</code>（可读超参），是复现的关键。</li>
        <li>回调组 <code>CallBackGroup</code>、checkpointer、训练计时器、<strong>StragglerDetectorV2</strong>（检测慢卡）、CP 数据窗口全部在构造期建好。</li>
        <li><code>signal.SIGALRM</code>：单个 training step 超过 <code>timeout_period</code> 秒就抛 <code>TimeoutError</code>——分布式下卡死的兜底。</li>
      </ul>

      <h2>4.5 train() — 主训练循环</h2>
      <p>文件: <SrcLink path="cosmos_framework/trainer/__init__.py" /></p>
      <pre>{`# 模型 + 优化器初始化
model = model.to("cuda", memory_format=self.config.trainer.memory_format)
model.on_train_start(self.config.trainer.memory_format)
optimizer, scheduler = model.init_optimizer_scheduler(self.config.optimizer, self.config.scheduler)
grad_scaler = torch.amp.GradScaler("cuda", **self.config.trainer.grad_scaler_args)
iteration = self.checkpointer.load(model, optimizer, scheduler, grad_scaler)

# 包装分布式模型
if self.config.trainer.distributed_parallelism == "ddp":
    model_ddp = distributed.parallel_model_wrapper(self.config.trainer.ddp, model)
elif self.config.trainer.distributed_parallelism == "fsdp":
    model_ddp = model    # FSDP 已在模型侧包装好

while True:
    if iteration >= self.config.trainer.max_iter:
        break
    dataloader_train_iter = iter(dataloader_train)
    while True:
        if iteration >= self.config.trainer.max_iter:
            _end_training = True
            break
        data_batch, stop_signal = self._fetch_data_batch(model, dataloader_train_iter)
        if stop_signal:
            raise StopIteration
        data_batch = misc.to(data_batch, device="cuda")
        self._cp_data_window.store_device_batch(data_batch)
        output_batch, loss, grad_accum_iter = self.training_step(
            model_ddp, optimizer, scheduler, grad_scaler,
            data_batch, iteration=iteration, grad_accum_iter=grad_accum_iter)
        if grad_accum_iter != 0:
            continue      # 梯度还在累积，继续取下一个 micro-batch
        iteration += 1
        if iteration % self.config.checkpoint.save_iter == 0:
            self.checkpointer.save(model, optimizer, scheduler, grad_scaler, iteration=iteration)
        if self.config.trainer.run_validation and iteration % self.config.trainer.validation_iter == 0:
            self.validate(model, dataloader_val, iteration=iteration)`}</pre>
      <ul>
        <li><code>iteration</code> 是<strong>优化器步数</strong>（不是 micro-batch 数）；<code>checkpointer.load</code> 返回起始迭代，支持续训。</li>
        <li><code>grad_accum_iter != 0 → continue</code> 是<strong>梯度累积闸门</strong>：只有累积满 <code>grad_accum_iter</code> 个 micro-batch 才 <code>iteration += 1</code> 并触发 checkpoint/validation。</li>
        <li>FSDP 下 <code>model_ddp = model</code>（包装发生在模型侧 <code>parallelize_vlm</code> 等），DDP 下现场包 <code>parallel_model_wrapper</code>。</li>
      </ul>

      <h2>4.6 training_step() — 单步：ddp_sync_grad + GradScaler</h2>
      <p>文件: <SrcLink path="cosmos_framework/trainer/__init__.py" /></p>
      <pre>{`def training_step(self, model_ddp, optimizer, scheduler, grad_scaler, data,
                  iteration=0, grad_accum_iter=0):
    # 只在累积窗口的最后一步让 DDP 同步梯度
    with distributed.ddp_sync_grad(model_ddp,
            grad_accum_iter == self.config.trainer.grad_accum_iter - 1):
        with self.training_timer("forward"):
            output_batch, loss = model_ddp.training_step(data, iteration)
        model = model_ddp.module if ... == "ddp" else model_ddp
        with self.training_timer("backward"):
            backward_loss = output_batch.get("_backward_loss", loss)
            loss_scaled = grad_scaler.scale(backward_loss / self.config.trainer.grad_accum_iter)
            loss_scaled.backward()
            model.on_after_backward()
    grad_accum_iter += 1
    if grad_accum_iter == self.config.trainer.grad_accum_iter:
        with self.training_timer("optimizer_step"):
            self.callbacks.on_before_optimizer_step(model, optimizer, scheduler, grad_scaler, iteration=iteration)
            model.on_before_optimizer_step(optimizer, scheduler, iteration=iteration)
            self._optimizer_step(model, optimizer, scheduler, grad_scaler, iteration=iteration)
            self._zero_grad(model, optimizer, iteration)
        grad_accum_iter = 0
    return output_batch, loss, grad_accum_iter`}</pre>
      <ul>
        <li><code>ddp_sync_grad</code> 是个 contextmanager：<strong>前 <code>grad_accum_iter-1</code> 步关闭梯度 all-reduce</strong>（每卡独立 backward），只在最后一步开同步——梯度累积 + DDP 的标准组合。</li>
        <li><code>grad_scaler.scale(backward_loss / grad_accum_iter)</code>：混合精度的 <strong>loss 缩放</strong>（bf16 下防下溢），同时每个 micro-batch 除以累积数，实现「等效大 batch」梯度。</li>
        <li><code>output_batch.get("_backward_loss", loss)</code>：模型可注入专用反传 loss（蒸馏时用教师/学生组合目标）。</li>
        <li><code>_optimizer_step</code> 默认就是 <code>grad_scaler.step(optimizer) + grad_scaler.update() + scheduler.step()</code>；蒸馏训练器会覆写它（见 4.8）。</li>
      </ul>

      <h2>4.7 _fetch_data_batch — 上下文并行数据窗口</h2>
      <p>文件: <SrcLink path="cosmos_framework/trainer/__init__.py" /></p>
      <pre>{`parallel_dims = getattr(model, "parallel_dims", None)
if parallel_dims is None or not parallel_dims.cp_enabled:
    try:
        return next(dataloader_iter), False   # 无 CP：每步取新 batch
    except StopIteration:
        return None, True

cp_size = parallel_dims.cp_mesh.size()
self._cp_data_window.assert_synced_with_model(model)   # 防槽位漂移
if not self._cp_data_window.active:
    try:
        self._cp_data_window.batch = next(dataloader_iter)
        local_stop = False
    except StopIteration:
        self._cp_data_window.clear()
        local_stop = True
    # 任何 rank 到底了 → all_reduce(MAX) 让全组一起停
    stop_tensor = torch.tensor([local_stop], dtype=torch.uint8, device=collective_device)
    dist.all_reduce(stop_tensor, op=dist.ReduceOp.MAX, group=cp_group)
    if bool(stop_tensor.item()):
        self._cp_data_window.clear()
        return None, True

data_batch = self._cp_data_window.batch   # 窗口内复用同一份 batch
self._cp_data_window.advance(cp_size)     # 槽位前进，满 cp_size 清空
return data_batch, False`}</pre>
      <ul>
        <li>上下文并行（CP）把<strong>序列维度</strong>切到 <code>cp_size</code> 个 rank 上。为了不让每个 rank 各取各的 batch 导致 token 数不一致，框架让 CP 组<strong>共享一份 batch</strong>：窗口开始 rank0 取一次，组内每个 rank 用自己的槽位（rank <code>s</code> 拥有 slot <code>s</code>）。</li>
        <li>循环内 <code>store_device_batch</code> 在窗口激活期间用 CUDA 副本替换缓存 batch，避免重复 <code>misc.to(cuda)</code>。</li>
        <li><code>all_reduce(MAX)</code> stop 信号：任一 rank 的 dataloader 耗尽，整组同时退出（防止 CP rank 间停在不同步数）。</li>
        <li><code>assert_synced_with_model</code> 检测训练器 offset 与模型内部 <code>_cp_window_slot</code> 漂移——若某步中途异常，二者会错位并立刻报错。</li>
      </ul>

      <h2>4.8 trainer/distillation.py — 蒸馏训练器</h2>
      <p>文件: <SrcLink path="cosmos_framework/trainer/distillation.py" /></p>
      <pre>{`class DistillationTrainer(ImaginaireTrainer):
    def training_step(self, model_ddp, optimizer, scheduler, grad_scaler, data, iteration=0, grad_accum_iter=0):
        model = model_ddp.module if ... == "ddp" else model_ddp
        closure_fn = getattr(model, "training_step_closures", None)
        if not inspect.ismethod(closure_fn):
            return super().training_step(...)   # 普通模型退化为基类逻辑

        closures = list(closure_fn(data, iteration))   # 模型给出若干 closure
        should_sync_grad = grad_accum_iter == self.config.trainer.grad_accum_iter - 1
        for _name, closure, is_last_closure in closures:
            with _sync_grad_for_closure(model_ddp, should_sync_grad and is_last_closure):
                closure_output, closure_loss = closure()
                self._merge_output_batches(output_batch, closure_output)
                loss_scaled = grad_scaler.scale(closure_loss / self.config.trainer.grad_accum_iter)
                loss_scaled.backward()
                model.on_after_backward()
        ...
        key = self._optimizer_key(model, iteration)   # "net"(student) / "fake_score"
        optimizer.step(key, grad_scaler)              # PhaseOptimizer：按相位只 step 某组
        scheduler.step(key)`}</pre>
      <ul>
        <li>蒸馏的关键是模型暴露 <code>training_step_closures</code>（生成器）：返回若干 <code>closure</code>，每个 closure 内部做一次 forward 拿 loss 并 backward。每次 closure 由 <code>_sync_grad_for_closure</code> 控制梯度同步（<code>set_requires_gradient_sync</code> 对 FSDP2/HSDP，<code>ddp_sync_grad</code> 对 DDP）。</li>
        <li><code>PhaseOptimizer</code> 按相位分组优化器：<code>_optimizer_key</code> 根据 <code>get_optimizer_key(iteration)</code> 返回 <code>"net"</code>（学生/生成器）或 <code>"fake_score"</code>（判别器），<code>optimizer.step(key)</code> 只 step 对应组——学生先训、判别器后训的分阶段训练。</li>
        <li><code>_merge_output_batches</code> 把多个 closure 的 tensor 输出<strong>累加</strong>（<code>base[key] + value.detach()</code>），非 tensor 直接覆盖。</li>
        <li><code>_eager_init_optimizer_state</code> 在迭代 0 就预分配 Adam 的 <code>exp_avg/exp_avg_sq</code>——否则学生组直到 <code>warmup_critic_steps</code> 后才首次 step，异步 checkpointer 的 state_dict 结构会中途变化导致 <code>CompanionMismatch</code>。</li>
      </ul>

      <h2>4.9 model/_base.py — ImaginaireModel 模型基类</h2>
      <p>文件: <SrcLink path="cosmos_framework/model/_base.py" />、<SrcLink path="cosmos_framework/model/generator/omni_mot_model.py" /></p>
      <pre>{`class ImaginaireModel(torch.nn.Module):
    """All models in Imaginaire should inherit ImaginaireModel."""
    def init_optimizer_scheduler(self, optimizer_config, scheduler_config):
        optimizer_config.params = self.parameters()   # 关键：把模型参数注入 LazyConfig
        optimizer = instantiate(optimizer_config)
        scheduler_config.optimizer = optimizer
        scheduler = instantiate(scheduler_config)
        return optimizer, scheduler

    # 子类必须实现：
    def training_step(self, data_batch, iteration): ...     # 训练步 + loss
    def validation_step(self, data_batch, iteration): ...   # 验证步 + loss
    def forward(self, *args, **kwargs): ...                 # 推理图

    # 可覆写钩子（默认 no-op）：
    def on_train_start(self, memory_format=torch.preserve_format): ...
    def on_before_optimizer_step(self, optimizer, scheduler, iteration): ...
    def on_after_backward(self, iteration=0): ...
    def on_before_zero_grad(self, optimizer, scheduler, iteration): ...`}</pre>
      <ul>
        <li>模型基类非常薄：只约定训练器要调用的方法签名。<code>init_optimizer_scheduler</code> 展示了 LazyConfig 的「参数注入」技巧——<code>optimizer_config.params</code> 是 LazyCall 的占位，实例化前用 <code>self.parameters()</code> 填上。</li>
        <li><code>OmniMoTModel</code> 是 vfm 的实际实现（4 千余行），<code>training_step</code> 的核心：从 batch 里 tokenize 视觉/动作/声音模态 → 采样噪声水平 <code>t</code> 和 <code>σ</code>（按分辨率 shift，见 <code>_get_train_noise_level_vision</code>）→ 构造噪声潜变量 <code>xt</code> → 打包文本 + 生成 token 过 MoT 网络预测流场速度 <code>v</code> → 算 flow-matching loss。</li>
      </ul>

      <h2>4.10 callbacks/grad_clip.py — 全局梯度裁剪（按 mesh 分组）</h2>
      <p>文件: <SrcLink path="cosmos_framework/callbacks/grad_clip.py" /></p>
      <pre>{`@torch.no_grad()
def _total_norm_by_mesh(parameters_by_mesh, norm_type=2.0, ...):
    per_mesh_norms = {}
    for mesh, params in parameters_by_mesh.items():
        grads = [p.grad for p in params]
        mesh_norm = torch.nn.utils.get_total_norm(grads, norm_type, ...)
        if isinstance(mesh_norm, DTensor):
            # DTensor 结果 reduce 成本地标量（跨并行维度收缩）
            mesh_norm = mesh_norm.full_tensor()
        per_mesh_norms[mesh] = mesh_norm
        per_mesh_norm_list.append(mesh_norm)
    total_norm = torch.sum(per_mesh_norm_tensor) ** (1.0 / norm_type)  # sqrt(sum norm^2)
    return total_norm, per_mesh_norms

class GradClip(Callback):
    def on_before_optimizer_step(self, model, optimizer, scheduler, grad_scaler, iteration=0):
        # 参数按 device_mesh 分组（mesh-dim-names 作 key），缓存一次
        grouped_params = self._mesh_groups(model_parts)
        # 每 mesh 算局部 L2 norm，合成一个全局 norm
        global_norm, per_mesh_norms = _total_norm_by_mesh(grouped_params)
        if self.force_finite and not bool(torch.isfinite(global_norm)):
            _fused_nan_to_num([p.grad for ...])   # NaN/Inf 归零后重测
            global_norm, per_mesh_norms = _total_norm_by_mesh(grouped_params)
        _clip_grads_with_global_norm(grouped_params, self.clip_norm, global_norm)
        # 记录 clip_grad_norm/{image|video}/{mesh_key} + .../global 到 wandb`}</pre>
      <ul>
        <li>关键动机：模型参数可以分布在<strong>多个 device mesh</strong>（dense FSDP-shard mesh + EP-shard MoE experts）。若用 stock <code>clip_grad_norm_</code> 分别 clip 各 mesh，会得到不同缩放因子、扭曲 dense 与 MoE 更新的相对幅度。所以这里先按 mesh 分组、每 mesh 局部 norm，再合成<strong>一个全局 norm</strong> 统一缩放所有 mesh。</li>
        <li>DTensor 结果用 <code>.full_tensor()</code> 收缩到 rank 复制的标量——跨 TP/CP 维度后的裁剪必须看到完整范数。</li>
        <li><code>force_finite</code> 与 <code>SkipNaNStep</code> 配合：norm 非有限时先 <code>_fused_nan_to_num</code> 归零再重测（用 eager <code>torch.nan_to_num</code> 而非 torch.compile 的 GPU Triton kernel，因为 CPU grad 会崩）。</li>
        <li><code>_mesh_groups</code> 缓存参数分组（mesh 成员关系固定），每步只重做 <code>grad is not None</code> 过滤——避免几万参数每次 step 重复纯 Python 遍历。</li>
      </ul>

      <h2>4.11 配方 TOML — vision_sft_super.toml 速查</h2>
      <p>文件: <SrcLink path="examples/toml/sft_config/vision_sft_super.toml" /></p>
      <pre>{`[job]
task         = "vfm"
experiment   = "vision_sft_super"
project      = "cosmos3"
name         = "vision_sft_super"
wandb_mode   = "disabled"

[model]
max_num_tokens_after_packing = 45056
joint_attn_implementation    = "two_way"
lora_enabled                 = true
lora_rank                    = 16
lora_alpha                   = 32
lora_target_modules          = "q_proj_moe_gen,k_proj_moe_gen,v_proj_moe_gen,o_proj_moe_gen"
precision                    = "bfloat16"

[model.parallelism]
data_parallel_shard_degree      = -1     # -1 = 按 WORLD_SIZE 自动
data_parallel_replicate_degree  = 1
context_parallel_shard_degree   = 2      # super 用 CP=2

[model.tokenizer]
vae_path = "\${oc.env:WAN_VAE_PATH}"       # OmegaConf env 插值

[optimizer]
betas          = [0.9, 0.95]
fused          = true
keys_to_select = ["lora_"]              # 只训练 LoRA adapter
lr             = 5.0e-4

[trainer]
distributed_parallelism = "fsdp"
grad_accum_iter         = 2
max_iter                = 500

[checkpoint]
keys_to_skip_loading = ["net_ema.", "lora_"]
load_path            = "\${oc.env:BASE_CHECKPOINT_PATH}"
save_iter            = 100`}</pre>
      <ul>
        <li><code>vision_sft_super</code> 是 <strong>LoRA-only</strong> 微调配方（Qwen3-VL-32B 背骨）：<code>optimizer.keys_to_select=["lora_"]</code> 只优化名字含 <code>lora_</code> 的参数；<code>checkpoint.keys_to_skip_loading=["net_ema.", "lora_"]</code> 加载基础 checkpoint 时跳过 LoRA/EMA 张量（它们要新初始化）。</li>
        <li><code>[job].experiment</code> 决定 Hydra 加载哪个 <code>LazyDict</code> SKU；<code>vae_path/load_path</code> 用 <code>{'${oc.env:...}'}</code> OmegaConf 插值在运行时读环境变量。</li>
        <li>对应的 Python SKU <SrcLink path="cosmos_framework/configs/base/experiment/sft/vision_sft_super.py" /> 才是「真正的配置树」：<code>defaults</code> 用 <code>override /model: mot_fsdp</code> 等切换组，模型配置深拷贝 <code>SUPER_MODEL_CONFIG</code>，dataloader 栈是 <code>PackingDataLoader + RankPartitionedDataLoader</code>（token 打包）。</li>
      </ul>

      <h2>4.12 scripts/_train.py — 旧版 YAML 入口（对比）</h2>
      <p>文件: <SrcLink path="cosmos_framework/scripts/_train.py" /></p>
      <pre>{`class Args(pydantic.BaseModel):
    output_dir: Annotated[ResolvedPath, tyro.conf.arg(aliases=("-o",))]
    config_file: ConfigFilePath          # Hydra config yaml
    config_overrides: list[str] = pydantic.Field(default_factory=list)

def train(args: Args) -> None:
    config_dict = deserialize_config_dict(args.config_file)
    overrides = _get_config_overrides(args, config_dict)   # SMOKE 注入 max_iter=2
    config_omegaconf = omegaconf.OmegaConf.merge(config_dict,
        omegaconf.OmegaConf.from_dotlist(overrides))
    config = structure_config(config_omegaconf)
    config.validate()
    config.freeze()
    trainer: "ImaginaireTrainer" = config.trainer.type(config)
    model: "OmniMoTModel" = hydra.utils.instantiate(config.model)
    dataloader_train = hydra.utils.instantiate(config.dataloader_train)
    trainer.train(model=model, dataloader_train=dataloader_train, dataloader_val=dataloader_val)`}</pre>
      <ul>
        <li>旧版入口用 <code>tyro</code> 生成 CLI，输入是 <strong>YAML</strong> + <code>config_overrides</code> 列表；配置用 <code>OmegaConf.merge(config_dict, from_dotlist(overrides))</code> 合并，再 <code>structure_config</code> 转成 Config。无 pydantic 校验——这就是新版 TOML 入口要解决的痛点。</li>
        <li><code>SMOKE</code> 标志（见 <code>utils/flags.py</code>）注入 <code>trainer.max_iter=2, logging_iter=1</code>，并给 Qwen VLM 压层数——CI 冒烟测试用，验证训练链路能跑通。</li>
        <li>输出目录按 <code>IMAGINAIRE_OUTPUT_ROOT/project/group/name</code> 组织，rank0 管理目录并建 <code>job</code> 符号链接；<code>--resume=false</code> 会先清目录。</li>
      </ul>

      {/* ==================== 5. 总结 ==================== */}
      <div className="section-divider"><span>总结</span></div>

      <h3>5.1 与同站其他框架的对比</h3>
      <table>
        <thead><tr><th>维度</th><th>Cosmos-Framework</th><th>UniAD</th><th>DriveVLA-W0</th><th>Pi-0.5</th></tr></thead>
        <tbody>
          <tr><td><strong>训练循环</strong></td><td>自研 ImaginaireTrainer</td><td>mmdet EpochBasedRunner</td><td>HuggingFace Trainer</td><td>自研 Imaginaire 体系</td></tr>
          <tr><td><strong>配置系统</strong></td><td>TOML→pydantic→Hydra→LazyConfig</td><td>mmcv.Config Python</td><td>HF TrainingArguments</td><td>Hydra LazyConfig</td></tr>
          <tr><td><strong>范式</strong></td><td>rectified-flow + 蒸馏</td><td>多任务端到端</td><td>flow-matching VLA</td><td>diT 扩散</td></tr>
          <tr><td><strong>分布式</strong></td><td>FSDP/DDP + CP 数据窗口 + megatron parallel_state</td><td>DDP</td><td>ZeRO-3</td><td>FSDP</td></tr>
          <tr><td><strong>精度</strong></td><td>bf16 + GradScaler（scale(loss/accum)）</td><td>FP32 + 局部 FP16</td><td>bf16 混合精度</td><td>bf16</td></tr>
          <tr><td><strong>扩展</strong></td><td>~40 回调 + 蒸馏/PhaseOptimizer</td><td>Hook 机制</td><td>callbacks</td><td>callback</td></tr>
        </tbody>
      </table>

      <h3>5.2 学习路径</h3>
      <ol>
        <li><strong>配置流</strong>：读 <code>vision_sft_super.toml</code> → <code>sft_config.py</code>（pydantic 校验）→ <code>toml_config_helper.py</code>（PATH_REMAPS 重映射）→ <code>vision_sft_super.py</code>（LazyDict SKU）。</li>
        <li><strong>训练器</strong>：<code>ImaginaireTrainer.__init__</code>（megatron parallel_state + callbacks + checkpointer）→ <code>train()</code>（max_iter 循环 + grad_accum）→ <code>training_step()</code>（ddp_sync_grad + GradScaler）。</li>
        <li><strong>上下文并行</strong>：<code>_fetch_data_batch</code> + <code>ContextParallelDataWindow</code>（一份 batch 跨 cp_size 步复用）。</li>
        <li><strong>蒸馏</strong>：<code>DistillationTrainer</code> + <code>training_step_closures</code> + <code>PhaseOptimizer</code>。</li>
        <li><strong>模型</strong>：<code>ImaginaireModel</code> 基类 → <code>OmniMoTModel.training_step</code>（flow-matching 训练步）。</li>
      </ol>
    </div>
  );
}
