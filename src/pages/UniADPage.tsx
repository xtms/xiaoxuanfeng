import { MermaidDiagram } from '../components/MermaidDiagram';
import { CodeBlock, Callout, ResourceTable } from '../components/CodeBlock';

const GH = 'https://github.com/OpenDriveLab/UniAD/blob/v2.0';

function SrcLink({ path }: { path: string }) {
  return (
    <a href={`${GH}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function UniADPage() {
  return (
    <div className="prose max-w-none">
      <h1>UniAD — 训练框架实现架构分析</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">🏷️ 自动驾驶 · 端到端 · 六大任务 · BEVFormer · CVPR 2023</span>
        <span className="page-meta-item">📖 源码分析</span>
      </div>
      <p>
        OpenDriveLab 开源的 <strong>UniAD（Planning-oriented Autonomous Driving）</strong>，CVPR 2023 最佳论文。它是首个将<strong>跟踪、建图、运动预测、占据预测、规划</strong>五大任务统一进一个端到端 Transformer 框架的系统，靠一组<strong>贯穿全流程的 Query</strong> 串起感知→预测→规划。本文基于 <code>/data/sd/UniAD</code>（v2.0 分支）源码，按 Pi-0.5 页面粒度给出<strong>代码级逐步分析</strong>——每个关键点附真实源码 + 逐行解释 + 文件路径。
      </p>

      <Callout type="tip">
        <strong>核心结论：</strong>UniAD 建立在 <strong>mmdetection3d 1.0.0rc6</strong> 生态上（非自研训练循环），训练骨架全部复用 mmdet 的 <code>EpochBasedRunner</code> + Hook 体系。工程上最大特色是<strong>两阶段课程训练</strong>：Stage-1（track + map，6 epoch）→ Stage-2（全六任务，20 epoch），每阶段从上一阶段 checkpoint 续训；模型侧的最大特色是<strong>query 级联</strong>——track 输出的 900 个 object query 直接变成 motion head 的输入 query，运动预测结果再喂给 occ / planning head。
      </Callout>

      {/* ==================== 1. 仓库整体布局 ==================== */}
      <div className="section-divider"><span>仓库整体布局</span></div>

      <h3>1.1 目录结构</h3>
      <MermaidDiagram chart={`
graph TD
    R["📦 UniAD 仓库根目录 (v2.0)"]
    R --> T["tools/ 训练与评估"]
    R --> P["projects/ 插件化实现"]
    R --> D["data/ nuScenes 数据"]
    R --> DOC["docs/ · README.md"]

    T --> TR["train.py mmdet 风格入口"]
    T --> DT["uniad_dist_train.sh<br/>torchrun 分布式启动"]
    T --> TEST["test.py · 各 vis/eval 脚本"]

    P --> CFG["configs/ 两阶段配置"]
    P --> PLUGIN["mmdet3d_plugin/ 核心包"]

    CFG --> S1["stage1_track_map/<br/>base_track_map.py (6 ep)"]
    CFG --> S2["stage2_e2e/<br/>base_e2e.py (20 ep)"]

    PLUGIN --> DET["uniad/detectors/"]
    PLUGIN --> HEAD["uniad/dense_heads/"]
    PLUGIN --> LOSS["losses/"]
    PLUGIN --> DS["datasets/"]
    PLUGIN --> API["uniad/apis/ 训练封装"]

    DET --> E2E["uniad_e2e.py<br/>UniAD 主检测器（六任务串联）"]
    DET --> TRK["uniad_track.py<br/>UniADTrack 跟踪基类"]

    HEAD --> BH["bevformer_head.py<br/>BEVFormerTrackHead（BEV 编码+检测）"]
    HEAD --> SE["seg_head_plugin/<br/>PansegformerHead 建图"]
    HEAD --> MH["motion_head.py<br/>MotionHead 运动预测"]
    HEAD --> OC["occ_head_plugin/<br/>OccHead 占据预测"]
    HEAD --> PH["planning_head.py<br/>PlanningHead 规划"]

    LOSS --> TL["traj_loss.py TrajLoss"]
    LOSS --> PL["planning_loss.py<br/>PlanningLoss + CollisionLoss"]
    LOSS --> TRL["track_loss.py · occflow_loss.py · dice_loss.py · mtp_loss.py"]

    DS --> ND["nuscenes_e2e_dataset.py<br/>时间队列采样"]
    API --> MT["apis/mmdet_train.py<br/>custom_train_detector"]
      `} />

      <h3>1.2 技术选型特点</h3>
      <table>
        <thead><tr><th>维度</th><th>选型</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>框架生态</strong></td><td>mmdetection3d 1.0.0rc6</td><td>复用 mmcv Runner / mmdet DETECTORS / mmseg 插件，无自研训练循环</td></tr>
          <tr><td><strong>分布式</strong></td><td>torchrun + DDP</td><td>tools/uniad_dist_train.sh 启动，<code>find_unused_parameters=True</code></td></tr>
          <tr><td><strong>精度</strong></td><td>FP32 + 局部 FP16</td><td><code>auto_fp16(apply_to=('img', ...))</code> 仅对视觉特征开关</td></tr>
          <tr><td><strong>配置系统</strong></td><td>mmcv.Config</td><td>Python 配置文件 + DictAction 命令行覆盖</td></tr>
          <tr><td><strong>课程学习</strong></td><td>两阶段</td><td>Stage-1 只训 track+map，Stage-2 全任务，逐级 load_from 续训</td></tr>
          <tr><td><strong>训练核心</strong></td><td>Query 级联</td><td>track 的 object query → motion query → occ / planning query</td></tr>
        </tbody>
      </table>

      {/* ==================== 2. 模型架构实现（总览） ==================== */}
      <div className="section-divider"><span>模型架构实现（总览）</span></div>

      <h3>2.1 六大任务与 Head 对应</h3>
      <p>
        顶层 <code>UniAD</code> 继承 <code>UniADTrack</code>，在基类（track + BEV 编码 + 检测）之上挂 4 个可选 head。每个 head 都有 <code>with_*_head</code> 属性做开关——Stage-1 配置里没有 motion/occ/planning，对应 forward 分支自动跳过。
      </p>
      <table>
        <thead><tr><th>任务</th><th>Head</th><th>输入</th><th>输出</th><th>关键维度</th></tr></thead>
        <tbody>
          <tr><td><strong>跟踪</strong></td><td><code>BEVFormerTrackHead</code>（pts_bbox_head）</td><td>6 相机图像 → BEV</td><td>object query / 3D 框 / 过去轨迹 / track_id</td><td>num_query=900，BEV 200×200</td></tr>
          <tr><td><strong>建图</strong></td><td><code>PansegformerHead</code>（seg_head）</td><td>BEV</td><td>车道 / 可行驶区域 mask</td><td>num_query=300，thing 3 + stuff 1</td></tr>
          <tr><td><strong>运动预测</strong></td><td><code>MotionHead</code>（motion_head）</td><td>track query + lane query + BEV</td><td>多模态未来轨迹（6 模式 × 12 步）</td><td>anchor=6，predict_steps=12</td></tr>
          <tr><td><strong>占据预测</strong></td><td><code>OccHead</code>（occ_head）</td><td>track query + motion query + BEV</td><td>未来占据 mask / 实例流</td><td>5 层 transformer，未来 4 帧</td></tr>
          <tr><td><strong>规划</strong></td><td><code>PlanningHeadSingleMode</code>（planning_head）</td><td>sdc query + command + BEV</td><td>自车未来轨迹（6 步）</td><td>planning_steps=6</td></tr>
        </tbody>
      </table>

      <h3>2.2 Query 级联流水线（核心设计）</h3>
      <p><code>uniad_e2e.py</code> 的 <code>forward_train</code> 严格按任务依赖顺序执行：</p>
      <MermaidDiagram chart={`
graph LR
    IMG["6 相机图像<br/>queue_length=3 时间队列"]
    IMG --> BEV["BEVFormer<br/>TemporalSelfAttn + SpatialCrossAttn<br/>200×200 BEV"]
    BEV --> TRK["Tracking<br/>900 object query<br/>DETR 解码 + QIM + MemoryBank"]
    TRK --> MAP["Map (Pansegformer)<br/>300 lane query"]
    TRK --> MOT["Motion<br/>track_query + lane_query + BEV<br/>3 层 decoder → 6 模式轨迹"]
    MAP --> MOT
    MOT --> OCC["Occupancy<br/>track_query + traj_query<br/>未来占据/实例流"]
    MOT --> PLAN["Planning<br/>sdc_traj_query + command<br/>→ 自车 6 步轨迹"]
    OCC --> PLAN
      `} />
      <p>
        <strong>关键点：</strong>object query 不是每任务独立初始化——track 输出的 <code>track_query_embeddings</code>（含 sdc query）被 <code>motion_head.forward_train</code> 直接拿来当 motion query 的 content；motion 输出的 <code>traj_query</code> 又喂给 occ 与 planning。query 就像一条<strong>贯穿感知-预测-规划的信息总线</strong>。
      </p>

      {/* ==================== 3. 训练框架实现（总览） ==================== */}
      <div className="section-divider"><span>训练框架实现（总览）</span></div>

      <h3>3.1 两阶段课程训练</h3>
      <table>
        <thead><tr><th>阶段</th><th>配置</th><th>任务</th><th>epoch</th><th>load_from</th></tr></thead>
        <tbody>
          <tr><td><strong>Stage-1</strong></td><td><code>stage1_track_map/base_track_map.py</code></td><td>track + map</td><td>6</td><td><code>bevformer_r101_dcn_24ep.pth</code>（官方 BEVFormer 预训练）</td></tr>
          <tr><td><strong>Stage-2</strong></td><td><code>stage2_e2e/base_e2e.py</code></td><td>track + map + motion + occ + planning</td><td>20</td><td><code>uniad_base_track_map.pth</code>（Stage-1 产物）</td></tr>
        </tbody>
      </table>
      <Callout type="warning">
        <strong>阶段差异不仅是加 head：</strong>Stage-1 用 <code>queue_length=5</code> 的更长时间队列训稳定 BEV 与跟踪；Stage-2 降到 3 省显存；Stage-1 解冻 neck/BN（<code>freeze_img_neck=False</code>），Stage-2 全部冻结（<code>freeze_img_backbone=True + freeze_img_neck=True + freeze_bn=True</code>）——感知骨干在 Stage-2 完全不动，只学预测与规划。
      </Callout>

      <h3>3.2 优化器与学习率</h3>
      <table>
        <thead><tr><th>项目</th><th>配置</th></tr></thead>
        <tbody>
          <tr><td><strong>优化器</strong></td><td>AdamW，lr=2e-4，weight_decay=0.01</td></tr>
          <tr><td><strong>骨干学习率</strong></td><td>img_backbone <code>lr_mult=0.1</code>（paramwise_cfg）</td></tr>
          <tr><td><strong>调度</strong></td><td>CosineAnnealing，linear warmup 500 iters，warmup_ratio=1/3，min_lr_ratio=1e-3</td></tr>
          <tr><td><strong>梯度裁剪</strong></td><td>grad_clip max_norm=35（L2）</td></tr>
          <tr><td><strong>batch</strong></td><td>samples_per_gpu=1，workers_per_gpu=8</td></tr>
        </tbody>
      </table>

      {/* ==================== 4. 端到端训练流程 ==================== */}
      <div className="section-divider"><span>端到端训练流程</span></div>

      <MermaidDiagram chart={`
sequenceDiagram
    participant S as uniad_dist_train.sh
    participant T as tools/train.py
    participant D as NuScenesE2EDataset
    participant R as EpochBasedRunner
    participant M as UniAD
    participant H as Heads ×5
    participant O as AdamW

    S->>T: torchrun --nproc_per_node=8 tools/train.py<br/>configs/stage2_e2e/base_e2e.py --launcher pytorch
    T->>T: Config.fromfile + plugin 导入<br/>(projects.mmdet3d_plugin 注册 DETECTORS/HEADS)
    T->>T: init_dist + 读 checkpoint + 建模型/优化器
    T->>D: build_dataloader (batch=1/GPU, queue_length=3 时间队列)
    R->>M: runner.run(data_loaders)
    loop 20 epochs (Stage-2)
        R->>D: train step
        D-->>M: 3 帧图像 + 6 任务 GT（bbox/轨迹/车道/occ/规划/command）
        M->>M: UniADTrack: BEVFormer 时间自注意力 → 900 query DETR 检测 + QIM + MemoryBank
        M->>H: seg_head: BEV → lane/道路 mask
        M->>H: motion_head: track_query → 6 模式 × 12 步轨迹
        M->>H: occ_head: query + BEV → 未来占据
        M->>H: planning_head: sdc query + command → 自车轨迹
        H->>M: 各任务 loss（track/map/motion/occ/planning）
        M->>O: 加权求和 + nan_to_num + backward + grad_clip(35) + step
        R->>R: CosineAnnealing lr · 每 epoch 存 checkpoint
    end
    R->>R: eval (det/map/track/motion 指标) → best_model`} />

      {/* ==================== 5. 核心代码逐步分析 ==================== */}
      <div className="section-divider"><span>核心代码逐步分析</span></div>

      <p>以下按「训练入口 → 插件注册 → 主检测器 → 跟踪基类 → 各任务 head → 损失 → 数据管道」逐文件给出真实源码与逐行解析。</p>

      <h2>5.1 uniad_dist_train.sh — 分布式启动</h2>
      <p>文件: <code>tools/uniad_dist_train.sh</code></p>
      <pre>{`#!/usr/bin/env bash

T=\`date +%m%d%H%M\`

CFG=$1
GPUS=$2
GPUS_PER_NODE=\$(($GPUS<8?$GPUS:8))
NNODES=\`expr $GPUS / $GPUS_PER_NODE\`

MASTER_PORT=\${MASTER_PORT:-28596}
MASTER_ADDR=\${MASTER_ADDR:-"127.0.0.1"}
RANK=\${RANK:-0}

WORK_DIR=\$(echo \${CFG%.*} | sed -e "s/configs/work_dirs/g")/

PYTHONPATH="\$(dirname $0)/..":\$PYTHONPATH \\
torchrun \\
    --nproc_per_node=\${GPUS_PER_NODE} \\
    --master_addr=\${MASTER_ADDR} \\
    --master_port=\${MASTER_PORT} \\
    --nnodes=\${NNODES} \\
    --node_rank=\${RANK} \\
    \$(dirname "\$0")/train.py \\
    \$CFG \\
    --launcher pytorch \${@:3} \\
    --deterministic \\
    --work-dir \${WORK_DIR} \\
    2>&1 | tee \${WORK_DIR}logs/train.\$T`}</pre>
      <ul>
        <li><code>GPUS_PER_NODE=min(GPUS,8)</code>：按单机 8 卡划分 node 数；<code>--deterministic</code> 开启 CUDNN 确定性算法。</li>
        <li>工作目录由配置路径推导：<code>projects/configs/stage2_e2e/base_e2e.py</code> → <code>projects/work_dirs/stage2_e2e/base_e2e/</code>，日志存 <code>{'logs/train.{月日时分}.log'}</code>。</li>
        <li>最终落到 <code>tools/train.py $CFG --launcher pytorch</code>，是 mmdet3d 的标准启动方式。</li>
      </ul>

      <h2>5.2 tools/train.py — mmdet 风格入口</h2>
      <p>文件: <code>tools/train.py</code></p>
      <pre>{`def main():
    args = parse_args()
    cfg = Config.fromfile(args.config)
    if args.cfg_options is not None:
        cfg.merge_from_dict(args.cfg_options)

    # import modules from plguin/xx, registry will be updated
    if hasattr(cfg, 'plugin'):
        if cfg.plugin:
            import importlib
            if hasattr(cfg, 'plugin_dir'):
                plugin_dir = cfg.plugin_dir
                _module_dir = os.path.dirname(plugin_dir)
                _module_path = 'projects.mmdet3d_plugin'
                plg_lib = importlib.import_module(_module_path)
            ...
            from projects.mmdet3d_plugin.uniad.apis.train import custom_train_model

    # autoscale lr by linear scaling rule
    if args.autoscale_lr:
        cfg.optimizer['lr'] = cfg.optimizer['lr'] * len(cfg.gpu_ids) / 8

    if args.launcher == 'none':
        distributed = False
    else:
        distributed = True
        init_dist(args.launcher, **cfg.dist_params)
        _, world_size = get_dist_info()
        cfg.gpu_ids = range(world_size)
    ...
    model = build_model(cfg.model)
    dataset = custom_build_dataset(cfg.data.train)
    ...
    custom_train_model(
        model, dataset, cfg, distributed=distributed,
        validate=args.no_validate is not True, ...)`}</pre>
      <ul>
        <li><strong>plugin 机制是关键</strong>：配置里 <code>plugin=True, plugin_dir="projects/mmdet3d_plugin/"</code>，train.py 据此 <code>importlib.import_module("projects.mmdet3d_plugin")</code> 触发包 <code>__init__.py</code>，从而注册 <code>@DETECTORS.register_module()</code> 的 UniAD、<code>@HEADS.register_module()</code> 的各 head、<code>@LOSSES.register_module()</code> 的损失——这是 UniAD 能无缝融入 mmdet 注册表的原因。</li>
        <li><code>--autoscale_lr</code> 按线性缩放规则 <code>lr * gpus / 8</code> 调整学习率。</li>
        <li>训练实际委托给插件包的 <code>custom_train_model</code>（而非 mmdet 原生 <code>train_detector</code>），因为需要自定义 eval hook。</li>
      </ul>

      <h2>5.3 apis/mmdet_train.py — Runner 与 Hook 编排</h2>
      <p>文件: <code>projects/mmdet3d_plugin/uniad/apis/mmdet_train.py</code></p>
      <pre>{`# put model on gpus
if distributed:
    find_unused_parameters = cfg.get('find_unused_parameters', False)
    model = MMDistributedDataParallel(
        model.cuda(),
        device_ids=[torch.cuda.current_device()],
        broadcast_buffers=False,
        find_unused_parameters=find_unused_parameters)
else:
    model = MMDataParallel(model.cuda(cfg.gpu_ids[0]), device_ids=cfg.gpu_ids)

# build runner
optimizer = build_optimizer(model, cfg.optimizer)

runner = build_runner(
    cfg.runner,
    default_args=dict(
        model=model,
        optimizer=optimizer,
        work_dir=cfg.work_dir,
        logger=logger,
        meta=meta))

# fp16 setting
fp16_cfg = cfg.get('fp16', None)
if fp16_cfg is not None:
    optimizer_config = Fp16OptimizerHook(**cfg.optimizer_config, **fp16_cfg,
                                          distributed=distributed)
elif distributed and 'type' not in cfg.optimizer_config:
    optimizer_config = OptimizerHook(**cfg.optimizer_config)
else:
    optimizer_config = cfg.optimizer_config

# register hooks
runner.register_training_hooks(cfg.lr_config, optimizer_config,
                               cfg.checkpoint_config, cfg.log_config,
                               cfg.get('momentum_config', None))

# register eval hooks
if validate:
    val_dataloader = build_dataloader(val_dataset, ...)
    eval_hook = CustomDistEvalHook if distributed else EvalHook
    runner.register_hook(eval_hook(val_dataloader, **eval_cfg))
...
runner.run(data_loaders, cfg.workflow)`}</pre>
      <ul>
        <li>DDP 包装：<code>broadcast_buffers=False</code>（BN 缓冲不广播，配合 <code>SyncBN</code> 需求）、<code>find_unused_parameters</code> 从配置读取——UniAD 六任务分支有大量参数在特定前向不参与，必须开 True。</li>
        <li><code>cfg.runner = dict(type='EpochBasedRunner', max_epochs=20)</code>：训练循环由 mmcv Runner 驱动，<code>register_training_hooks</code> 一次性挂上 lr/optimizer/checkpoint/log 四类 Hook。</li>
        <li>grad_clip=35 由 <code>optimizer_config = dict(grad_clip=dict(max_norm=35, norm_type=2))</code> 生效（注意优化器配置里 <code>grad_clip</code> 就是梯度裁剪）。</li>
        <li>验证走 <code>CustomDistEvalHook</code>（插件自定义，支持规划/占据指标），<code>runner.run(data_loaders, cfg.workflow)</code> 开始 epoch 循环。</li>
      </ul>

      <h2>5.4 uniad_e2e.py — UniAD.forward_train 六任务串联</h2>
      <p>文件: <code>projects/mmdet3d_plugin/uniad/detectors/uniad_e2e.py</code></p>
      <pre>{`@auto_fp16(apply_to=('img', 'points'))
def forward_train(self, img=None, img_metas=None,
                  gt_bboxes_3d=None, gt_labels_3d=None,
                  gt_fut_traj=None, gt_fut_traj_mask=None,
                  gt_past_traj=None, gt_past_traj_mask=None,
                  gt_sdc_fut_traj=None, gt_sdc_fut_traj_mask=None,
                  gt_segmentation=None, gt_instance=None,
                  sdc_planning=None, sdc_planning_mask=None,
                  command=None, gt_future_boxes=None, **kwargs):
    losses = dict()
    len_queue = img.size(1)

    losses_track, outs_track = self.forward_track_train(...)
    losses_track = self.loss_weighted_and_prefixed(losses_track, prefix='track')
    losses.update(losses_track)

    outs_track = self.upsample_bev_if_tiny(outs_track)
    bev_embed = outs_track["bev_embed"]
    bev_pos   = outs_track["bev_pos"]

    outs_seg = dict()
    if self.with_seg_head:
        losses_seg, outs_seg = self.seg_head.forward_train(
            bev_embed, img_metas, gt_lane_labels, gt_lane_bboxes, gt_lane_masks)
        losses_seg = self.loss_weighted_and_prefixed(losses_seg, prefix='map')
        losses.update(losses_seg)

    outs_motion = dict()
    if self.with_motion_head:
        ret_dict_motion = self.motion_head.forward_train(
            bev_embed, gt_bboxes_3d, gt_labels_3d,
            gt_fut_traj, gt_fut_traj_mask,
            gt_sdc_fut_traj, gt_sdc_fut_traj_mask,
            outs_track=outs_track, outs_seg=outs_seg)
        losses_motion = ret_dict_motion["losses"]
        outs_motion = ret_dict_motion["outs_motion"]
        outs_motion['bev_pos'] = bev_pos
        losses_motion = self.loss_weighted_and_prefixed(losses_motion, prefix='motion')
        losses.update(losses_motion)

    if self.with_occ_head:
        if outs_motion['track_query'].shape[1] == 0:
            # TODO: rm hard code
            outs_motion['track_query'] = torch.zeros((1, 1, 256)).to(bev_embed)
            outs_motion['track_query_pos'] = torch.zeros((1, 1, 256)).to(bev_embed)
            outs_motion['traj_query'] = torch.zeros((3, 1, 1, 6, 256)).to(bev_embed)
        losses_occ = self.occ_head.forward_train(
            bev_embed, outs_motion, gt_inds_list=gt_inds,
            gt_segmentation=gt_segmentation, gt_instance=gt_instance, ...)
        losses_occ = self.loss_weighted_and_prefixed(losses_occ, prefix='occ')
        losses.update(losses_occ)

    if self.with_planning_head:
        outs_planning = self.planning_head.forward_train(
            bev_embed, outs_motion, sdc_planning, sdc_planning_mask,
            command, gt_future_boxes)
        losses_planning = outs_planning['losses']
        losses_planning = self.loss_weighted_and_prefixed(losses_planning, prefix='planning')
        losses.update(losses_planning)

    for k, v in losses.items():
        losses[k] = torch.nan_to_num(v)
    return losses

def loss_weighted_and_prefixed(self, loss_dict, prefix=''):
    loss_factor = self.task_loss_weight[prefix]
    loss_dict = {f"{prefix}.{k}": v * loss_factor for k, v in loss_dict.items()}
    return loss_dict`}</pre>
      <ul>
        <li><strong>顺序即依赖</strong>：track 先跑产出 <code>bev_embed</code> 与 <code>outs_track</code>（含 track_query）；seg 用 BEV；motion 同时消费 <code>outs_track</code> 与 <code>outs_seg</code>；occ 消费 <code>outs_motion</code>；planning 消费 motion 的 sdc query 与 BEV。</li>
        <li><strong>零 query 保护</strong>：当 batch 内没有匹配到任何可跟踪物体（<code>track_query</code> 为 0），用 <code>torch.zeros</code> 填充占位，避免 occ head 因空 query 崩溃。</li>
        <li><code>loss_weighted_and_prefixed</code>：每个任务的内部 loss 都加上 <code>track./map./motion./occ./planning.</code> 前缀，并乘 <code>task_loss_weight</code>（默认全 1.0）——日志里能清晰区分各任务贡献。</li>
        <li>最后统一 <code>torch.nan_to_num</code>：即使某个 head 前向异常产生 NaN，也不会污染整个 loss（稳健但会掩盖 bug）。</li>
        <li><code>@auto_fp16(apply_to=('img','points'))</code>：仅图像/点云输入走半精度，模型内部保持 FP32。</li>
      </ul>

      <h2>5.5 uniad_track.py — 跟踪基类与 Query 生命周期</h2>
      <p>文件: <code>projects/mmdet3d_plugin/uniad/detectors/uniad_track.py</code></p>
      <pre>{`# 第 900 号 query 恒为 ego（SDC）query
self.query_embedding = nn.Embedding(self.num_query + 1, self.embed_dims * 2)
self.reference_points = nn.Linear(self.embed_dims, 3)
self.mem_bank_len = mem_args["memory_bank_len"]
self.track_base = RuntimeTrackerBase(
    score_thresh=score_thresh,
    filter_score_thresh=filter_score_thresh,
    miss_tolerance=miss_tolerance)
self.query_interact = QueryInteractionModule(qim_args, dim_in=embed_dims, ...)
self.memory_bank = MemoryBank(mem_args, dim_in=embed_dims, ...)
self.criterion = build_loss(loss_cfg)   # ClipMatcher（clip 级匈牙利匹配）`}</pre>
      <ul>
        <li><code>query_embedding</code> 有 901 个：前 900 是 object query，<strong>最后一个恒为自车 query</strong>（代码里多处用 <code>track_instances[900]</code> 取 ego）。</li>
        <li><code>reference_points</code> 用 256 维 query content 回归 3 维参考点（BEVFormer 的 DETR3D 式 box refine）。</li>
        <li><code>QueryInteractionModule</code>（QIM）：把当前帧 query 与上一帧历史 query 交互，产出新 query 集合——跟踪 Query 跨帧的「更新器」。</li>
        <li><code>MemoryBank</code>：给每个 query 存 4 帧历史 embedding，track 丢失的物体可复用历史特征召回。</li>
        <li><code>criterion = ClipMatcher</code>：在整段 clip（训练时间队列）上做全局匈牙利匹配，而非单帧贪心匹配。</li>
      </ul>
      <pre>{`def _forward_single_frame_train(self, img, img_metas, track_instances,
                                 prev_img, prev_img_metas, ...):
    bev_embed, bev_pos = self.get_bevs(
        img, img_metas, prev_img=prev_img, prev_img_metas=prev_img_metas)
    det_output = self.pts_bbox_head.get_detections(
        bev_embed,
        object_query_embeds=track_instances.query,
        ref_points=track_instances.ref_pts,
        img_metas=img_metas)
    output_classes = det_output["all_cls_scores"]
    output_coords = det_output["all_bbox_preds"]
    ...
    track_instances.output_embedding = query_feats[-1][0]
    velo = output_coords[-1, 0, :, -2:]      # 末维速度
    if l2g_r2 is not None:
        ref_pts = self.velo_update(last_ref_pts[0], velo, l2g_r1, l2g_t1,
                                   l2g_r2, l2g_t2, time_delta=time_delta)
    else:
        ref_pts = last_ref_pts[0]
    ...
    active_index = (track_instances.obj_idxes >= 0) & \\
                   (track_instances.iou >= self.gt_iou_threshold) & \\
                   (track_instances.matched_gt_idxes >= 0)
    out.update(self.select_active_track_query(track_instances, active_index, img_metas))
    out.update(self.select_sdc_track_query(track_instances[900], img_metas))

    if self.memory_bank is not None:
        track_instances = self.memory_bank(track_instances)

    tmp = {}
    tmp["init_track_instances"] = self._generate_empty_tracks()
    tmp["track_instances"] = track_instances
    out_track_instances = self.query_interact(tmp)   # QIM 更新 query
    out["track_instances"] = out_track_instances
    return out`}</pre>
      <ul>
        <li><strong>多帧时间队列训练</strong>：<code>forward_track_train</code> 对 clip 内每一帧调用本函数，<code>prev_img = img[:, :i]</code> 把历史帧喂给 BEVFormer 时间自注意力；track_instances 逐帧传递形成「tracking 状态机」。</li>
        <li><code>velo_update</code>：利用预测速度把 ref_pts 从上一帧坐标系旋转/平移到当前帧（l2g 位姿变换 + inverse_sigmoid 还原），实现 query 参考点的时空对齐。</li>
        <li><code>active_index</code> 过滤出当前活跃 track，产出 <code>track_query_embeddings</code> + 匹配索引，供 motion head 使用；ego query（第 900）单独走 <code>select_sdc_track_query</code> 产出 <code>sdc_embedding</code>。</li>
        <li><strong>QIM 收尾</strong>：新初始化的空 track 与更新后的 track 经 query_interact 融合，输出给下一帧。</li>
      </ul>

      <h2>5.6 motion_head.py — 运动预测：Query 级联 + 多模态轨迹</h2>
      <p>文件: <code>projects/mmdet3d_plugin/uniad/dense_heads/motion_head.py</code></p>
      <pre>{`def forward_train(self, bev_embed, gt_bboxes_3d, gt_labels_3d,
                  gt_fut_traj, gt_fut_traj_mask, gt_sdc_fut_traj, ...,
                  outs_track={}, outs_seg={}):
    track_query = outs_track['track_query_embeddings'][None, None, ...]
    all_matched_idxes = [outs_track['track_query_matched_idxes']]
    track_boxes = outs_track['track_bbox_results']

    # 把 SDC（自车）query 追加到末尾，参与运动预测
    sdc_match_index = torch.zeros((1,), device=all_matched_idxes[0].device)
    sdc_match_index[0] = gt_fut_traj[0].shape[0]
    all_matched_idxes = [torch.cat([all_matched_idxes[0], sdc_match_index], dim=0)]
    gt_fut_traj[0] = torch.cat([gt_fut_traj[0], gt_sdc_fut_traj[0]], dim=0)
    track_query = torch.cat([track_query, outs_track['sdc_embedding'][None, None, None, :]], dim=2)
    ...
    memory, memory_mask, memory_pos, lane_query, _, lane_query_pos, hw_lvl = outs_seg['args_tuple']

    outs_motion = self(bev_embed, track_query, lane_query, lane_query_pos, track_boxes)
    loss_inputs = [gt_bboxes_3d, gt_fut_traj, gt_fut_traj_mask,
                   outs_motion, all_matched_idxes, track_boxes]
    losses = self.loss(*loss_inputs)

    # 只对车辆类 query 计算运动 loss（vehicle_id_list = [0,1,2,3,4,6,7]）
    outs_motion, all_matched_idxes = filter_vehicle_query(
        outs_motion, all_matched_idxes, gt_labels_3d, self.vehicle_id_list)
    outs_motion['all_matched_idxes'] = all_matched_idxes
    return dict(losses=losses, outs_motion=outs_motion, track_boxes=track_boxes)`}</pre>
      <ul>
        <li><strong>Query 级联的第一棒</strong>：motion head 不重新初始化 query，直接把 track 输出的 <code>track_query_embeddings</code>（已含语义/位置信息）当作自己的输入 content。</li>
        <li>SDC query 拼到末尾（<code>gt_fut_traj</code> 也同步拼接自车 GT），因此自车和障碍物在同一套 motion 模型里预测——规划所需的 sdc_traj 由此产生。</li>
        <li>seg head 的 <code>args_tuple</code> 解包出 <code>lane_query</code> / <code>lane_query_pos</code>（地图查询），作为运动预测的静态上下文。</li>
        <li><code>filter_vehicle_query</code>：只保留车辆类 query 的运动监督（行人/骑行者不参与轨迹回归，减少监督噪声）。</li>
      </ul>
      <pre>{`def forward(self, bev_embed, track_query, lane_query, lane_query_pos,
            track_bbox_results):
    track_query = track_query[:, -1]     # 只取 decoder 最后一层 query
    reference_points_track = self._extract_tracking_centers(
        track_bbox_results, self.pc_range)
    track_query_pos = self.boxes_query_embedding_layer(
        pos2posemb2d(reference_points_track))   # B, A, D 位置编码

    # 三类意图 embedding：agent 级锚点 / 场景级 ego 锚点 / 场景级 offset 锚点
    agent_level_anchors = self.kmeans_anchors.view(
        num_groups, self.num_anchor, self.predict_steps, 2).detach()
    scene_level_ego_anchors = anchor_coordinate_transform(
        agent_level_anchors, track_bbox_results, with_translation_transform=True)
    scene_level_offset_anchors = anchor_coordinate_transform(
        agent_level_anchors, track_bbox_results, with_translation_transform=False)

    agent_level_embedding = self.agent_level_embedding_layer(
        pos2posemb2d(agent_level_norm[..., -1, :]))
    scene_level_ego_embedding = self.scene_level_ego_embedding_layer(...)
    scene_level_offset_embedding = self.scene_level_offset_embedding_layer(...)
    learnable_embed = self.learnable_motion_query_embedding.weight.to(dtype)
    ...
    init_reference = scene_level_offset_anchors.detach()

    inter_states, inter_references = self.motionformer(
        track_query, lane_query,
        track_query_pos=track_query_pos, lane_query_pos=lane_query_pos,
        track_bbox_results=track_bbox_results, bev_embed=bev_embed,
        reference_trajs=init_reference,
        traj_reg_branches=self.traj_reg_branches,
        traj_cls_branches=self.traj_cls_branches,
        agent_level_embedding=agent_level_embedding, ...)

    for lvl in range(inter_states.shape[0]):
        outputs_class = self.traj_cls_branches[lvl](inter_states[lvl])
        tmp = self.traj_reg_branches[lvl](inter_states[lvl])
        tmp = self.unflatten_traj(tmp)              # -> (B,A,P,12,5)
        tmp[..., :2] = torch.cumsum(tmp[..., :2], dim=3)   # 逐时间步累加还原轨迹
        outputs_class = self.log_softmax(outputs_class.squeeze(3))
        for bs in range(tmp.shape[0]):
            tmp[bs] = bivariate_gaussian_activation(tmp[bs])   # (mu_x,mu_y,log_std,log_std,rho)
        outputs_trajs.append(tmp)`}</pre>
      <ul>
        <li><strong>三类意图锚点</strong>：agent_level（K-means 聚类的模式锚点，来自 <code>motion_anchor_infos_mode6.pkl</code>）、scene_level_ego（锚点变换到每个物体坐标系）、scene_level_offset（锚点相对物体中心的偏移量）——分别编码「世界坐标意图」「以物体为参照的意图」「相对偏移意图」。</li>
        <li><code>motionformer</code>（MotionTransformerDecoder）3 层：每层做 agent-agent 交互、agent-map 交互、agent-BEV 交互（deformable attention 沿参考轨迹采样），三者融合更新 query（详见 5.7）。</li>
        <li><strong>cumsum trick</strong>：回归头预测的是逐时间步位移增量，<code>cumsum(dim=3)</code> 还原出绝对轨迹——比直接回归绝对坐标更平滑稳定。</li>
        <li><code>bivariate_gaussian_activation</code>：把 5 维输出激活为二元高斯参数 <code>(μx, μy, σ, σ, ρ)</code>，供 NLL 损失使用。</li>
        <li><code>learnable_motion_query_embedding</code>：<code>num_anchor × num_anchor_group</code> 个可学习 query 与锚点 embedding 相加，提供可学习意图。</li>
      </ul>

      <h2>5.7 modules.py — MotionTransformerDecoder 三类交互</h2>
      <p>文件: <code>projects/mmdet3d_plugin/uniad/dense_heads/motion_head_plugin/modules.py</code></p>
      <pre>{`class MotionTransformerDecoder(BaseModule):
    def __init__(self, pc_range=None, embed_dims=256, transformerlayers=None,
                 num_layers=3, **kwargs):
        self.num_layers = num_layers
        self.intention_interaction_layers = IntentionInteraction()
        self.track_agent_interaction_layers = nn.ModuleList(
            [TrackAgentInteraction() for _ in range(self.num_layers)])
        self.map_interaction_layers = nn.ModuleList(
            [MapInteraction() for _ in range(self.num_layers)])
        self.bev_interaction_layers = nn.ModuleList(
            [build_transformer_layer(transformerlayers)
             for _ in range(self.num_layers)])
        self.static_dynamic_fuser = nn.Sequential(...)
        self.dynamic_embed_fuser = nn.Sequential(...)
        self.in_query_fuser = nn.Sequential(...)
        self.out_query_fuser = nn.Sequential(...)

    def forward(self, track_query, lane_query, track_query_pos, lane_query_pos,
                track_bbox_results, bev_embed, reference_trajs, ...):
        B, _, P, D = agent_level_embedding.shape
        track_query_bc = track_query.unsqueeze(2).expand(-1, -1, P, -1)
        track_query_pos_bc = track_query_pos.unsqueeze(2).expand(-1, -1, P, -1)

        # 静态意图：intention 交互 + 三类锚点 embedding 相加（各层共享）
        agent_level_embedding = self.intention_interaction_layers(agent_level_embedding)
        static_intention_embed = agent_level_embedding + scene_level_offset_embedding + learnable_embed
        reference_trajs_input = reference_trajs.unsqueeze(4).detach()

        query_embed = torch.zeros_like(static_intention_embed)
        for lid in range(self.num_layers):
            dynamic_query_embed = self.dynamic_embed_fuser(torch.cat(
                [agent_level_embedding, scene_level_offset_embedding,
                 scene_level_ego_embedding], dim=-1))
            query_embed_intention = self.static_dynamic_fuser(torch.cat(
                [static_intention_embed, dynamic_query_embed], dim=-1))
            query_embed = self.in_query_fuser(torch.cat(
                [query_embed, query_embed_intention], dim=-1))

            # ① agent-agent 交互
            track_query_embed = self.track_agent_interaction_layers[lid](
                query_embed, track_query, query_pos=track_query_pos_bc,
                key_pos=track_query_pos)
            # ② agent-map 交互
            map_query_embed = self.map_interaction_layers[lid](
                query_embed, lane_query, query_pos=track_query_pos_bc,
                key_pos=lane_query_pos)
            # ③ agent-BEV 交互（沿参考轨迹 deformable 采样）
            bev_query_embed = self.bev_interaction_layers[lid](
                query_embed, value=bev_embed, query_pos=track_query_pos_bc,
                bbox_results=track_bbox_results,
                reference_trajs=reference_trajs_input, **kwargs)

            query_embed = torch.cat(
                [track_query_embed, map_query_embed, bev_query_embed,
                 track_query_bc + track_query_pos_bc], dim=-1)
            query_embed = self.out_query_fuser(query_embed)   # (B,A,P,D)

            if traj_reg_branches is not None:
                tmp = traj_reg_branches[lid](query_embed)
                tmp = tmp.view(bs, n_agent, n_modes, n_steps, -1)
                tmp[..., :2] = torch.cumsum(tmp[..., :2], dim=3)
                new_reference_trajs = torch.zeros_like(reference_trajs)
                ...
                reference_trajs = new_reference_trajs.detach()  # 迭代更新参考轨迹
        return torch.stack(inter_states), torch.stack(intermediate_reference_trajs)`}</pre>
      <ul>
        <li><strong>模式（mode）扩张</strong>：track query 先 <code>expand</code> 成 P=6 份（num_anchor），一个物体同时预测 6 条候选轨迹。</li>
        <li><strong>静态意图 vs 动态意图</strong>：静态意图 embedding（锚点相加）各层共享不变；动态意图 embedding 由当前层 query 状态融合，随层迭代更新——「静态约束 + 动态精化」双通道。</li>
        <li><strong>三类交互各自独立模块</strong>：agent-agent 交互建模物体间避让；agent-map 交互让轨迹贴合车道/路沿；agent-BEV 交互沿参考轨迹做 deformable attention 采样场景特征。</li>
        <li>每次迭代用 <code>traj_reg_branches[lid]</code> 更新参考轨迹（<code>cumsum</code> 后 <code>detach</code>），下一层基于更准的参考轨迹再采样——从粗到细的多轮精化。</li>
      </ul>

      <h2>5.8 planning_head.py — 自车规划</h2>
      <p>文件: <code>projects/mmdet3d_plugin/uniad/dense_heads/planning_head.py</code></p>
      <pre>{`def forward(self, bev_embed, occ_mask, bev_pos, sdc_traj_query,
            sdc_track_query, command):
    sdc_track_query = sdc_track_query.detach()      # 不反传感知梯度到规划
    sdc_traj_query = sdc_traj_query[-1]             # 取 decoder 最后一层
    P = sdc_traj_query.shape[1]                     # 6 模式
    sdc_track_query = sdc_track_query[:, None].expand(-1, P, -1)

    navi_embed = self.navi_embed.weight[command]    # 导航命令 embedding（直行/左转/右转）
    navi_embed = navi_embed[None].expand(-1, P, -1)
    plan_query = torch.cat([sdc_traj_query, sdc_track_query, navi_embed], dim=-1)

    plan_query = self.mlp_fuser(plan_query).max(1, keepdim=True)[0]  # 取最可能模式
    plan_query = rearrange(plan_query, 'b p c -> p b c')

    bev_pos = rearrange(bev_pos, 'b c h w -> (h w) b c')
    bev_feat = bev_embed + bev_pos

    if self.with_adapter:
        bev_feat = rearrange(bev_feat, '(h w) b c -> b c h w', h=self.bev_h, w=self.bev_w)
        bev_feat = bev_feat + self.bev_adapter(bev_feat)    # 残差适配器
        bev_feat = rearrange(bev_feat, 'b c h w -> (h w) b c')

    pos_embed = self.pos_embed.weight
    plan_query = plan_query + pos_embed[None]
    plan_query = self.attn_module(plan_query, bev_feat)     # 与 BEV 全局注意力

    sdc_traj_all = self.reg_branch(plan_query).view((-1, self.planning_steps, 2))
    sdc_traj_all[..., :2] = torch.cumsum(sdc_traj_all[..., :2], dim=1)  # 位移累加
    sdc_traj_all[0] = bivariate_gaussian_activation(sdc_traj_all[0])
    if self.use_col_optim and not self.training:
        # 推理时用占据 mask 做碰撞优化（非线性规划）
        sdc_traj_all = self.collision_optimization(sdc_traj_all, occ_mask)
    return dict(sdc_traj=sdc_traj_all, sdc_traj_all=sdc_traj_all)`}</pre>
      <ul>
        <li><strong>规划 query 的三段拼接</strong>：<code>[sdc_traj_query(运动模式) ; sdc_track_query(自车检测) ; navi_embed(导航命令)]</code> → MLP 融合 → <code>max(dim=1)</code> 选最可能模式（单模态规划）。</li>
        <li><code>sdc_track_query.detach()</code>：规划不回传感知梯度——设计意图是规划从感知「读取」信息而非「反哺」感知（避免感知被规划带偏，这也是 UniAD 关键设计之一）。</li>
        <li><code>bev_adapter</code>：3 个残差卷积块把 BEV 特征投影到规划友好空间（<code>with_adapter=True</code> 时启用）。</li>
        <li><code>attn_module = nn.TransformerDecoder</code>：plan query 对 BEV token 做 3 层全局注意力，找到可行区域。</li>
        <li><code>use_col_optim</code>：推理阶段用 occ head 的占据 mask，把规划轨迹当作 NLP 问题求解（<code>CollisionNonlinearOptimizer</code>），撞到占据格子的点被优化推开——安全兜底。</li>
      </ul>

      <h2>5.9 损失函数 — TrajLoss 与 PlanningLoss/CollisionLoss</h2>
      <p>文件: <code>projects/mmdet3d_plugin/losses/traj_loss.py</code> / <code>losses/planning_loss.py</code></p>
      <pre>{`@LOSSES.register_module()
class TrajLoss(nn.Module):
    def forward(self, traj_prob, traj_preds, gt_future_traj,
                gt_future_traj_valid_mask):
        traj = traj_preds            # (b, nmodes, seq, 5)
        log_probs = traj_prob
        masks = 1 - gt_future_traj_valid_mask.to(traj.dtype)

        l_minfde, inds = min_fde(traj, traj_gt, masks)     # 最接近的模态索引
        l_minade, inds = min_ade(traj, traj_gt, masks)
        inds_rep = inds.repeat(sequence_length, pred_params, 1, 1).permute(3, 2, 0, 1)
        traj_best = traj.gather(1, inds_rep).squeeze(dim=1)

        if self.use_variance:
            l_reg = traj_nll(traj_best, traj_gt, masks)    # 二元高斯 NLL
        else:
            l_reg = l_minade

        # 分类损失：正确模态的负对数概率
        l_class = -torch.squeeze(log_probs.gather(1, inds.unsqueeze(1)))

        l_reg = torch.sum(l_reg) / (batch_size + 1e-5)
        l_class = torch.sum(l_class) / (batch_size + 1e-5)
        loss = (l_class * self.cls_loss_weight +
                l_reg * self.nll_loss_weight +
                l_minade * self.loss_weight_minade +
                l_minfde * self.loss_weight_minfde)
        return loss, l_class, l_reg, l_minade, l_minfde, l_mr`}</pre>
      <ul>
        <li><strong>min_ade/min_fde 选模</strong>：先在 6 个模式里用 GT 算平均/终点位移误差，选最近模态索引 <code>inds</code>（Winner-take-all 硬选模）。</li>
        <li>对选中模态计算回归损失：<code>use_variance=True</code> 时用 <code>traj_nll</code>（5 参数二元高斯 NLL），否则退化为 minADE 本身。</li>
        <li>分类损失是选中模态的负 log 概率；总损失 = 分类 + 回归 + minADE/minFDE（后两者默认权重 0/0.25，用于让距离更小）。</li>
      </ul>
      <pre>{`@LOSSES.register_module()
class PlanningLoss(nn.Module):
    def forward(self, sdc_traj, gt_sdc_fut_traj, mask):
        err = sdc_traj[..., :2] - gt_sdc_fut_traj[..., :2]
        err = torch.pow(err, exponent=2)
        err = torch.sum(err, dim=-1)
        err = torch.pow(err, exponent=0.5)      # L2 距离
        return torch.sum(err * mask) / (torch.sum(mask) + 1e-5)

@LOSSES.register_module()
class CollisionLoss(nn.Module):
    def forward(self, sdc_traj_all, sdc_planning_gt, sdc_planning_gt_mask,
                future_gt_bbox):
        n_futures = len(future_gt_bbox)
        inter_sum = sdc_traj_all.new_zeros(1, )
        for i in range(n_futures):
            if len(future_gt_bbox[i].tensor) > 0:
                # 自车未来位置与 GT 障碍物框做 BEV 角点矩形相交
                sdc_bev_box = self.to_corners([x, y, self.w, self.h, yaw])
                for j in range(future_gt_bbox_corners.shape[0]):
                    inter_sum += self.inter_bbox(sdc_bev_box,
                                                 future_gt_bbox_corners[j])
        return inter_sum * self.weight`}</pre>
      <ul>
        <li><strong>PlanningLoss</strong>：规划路径与 GT 自车未来轨迹的加权平均 L2（<code>sdc_planning_mask</code> 只对有效步计算），planning_eval_strategy 可选 "uniad"（瞬时 L2）或 "stp3"（累计平均）。</li>
        <li><strong>CollisionLoss 是可微的碰撞惩罚</strong>：用 GT 未来障碍物框（4 个 BEV 角点）与自车矩形逐帧算重叠面积，重叠越多 loss 越大——直接把「碰撞」写进训练目标。三段 <code>delta=0/0.5/1.0</code>（车宽长各扩 0/0.5/1m）保证安全余量。</li>
      </ul>

      <h2>5.10 数据管道 — 时间队列采样</h2>
      <p>文件: <code>projects/mmdet3d_plugin/datasets/nuscenes_e2e_dataset.py</code></p>
      <pre>{`def prepare_train_data(self, index):
    data_queue = []
    self.enbale_temporal_aug = False
    if self.enbale_temporal_aug:
        prev_indexs_list = list(range(index - self.queue_length, index))
        random.shuffle(prev_indexs_list)
        prev_indexs_list = sorted(prev_indexs_list[1:], reverse=True)
        input_dict = self.get_data_info(index)
    else:
        # 保证首帧与末帧在同一场景
        final_index = index
        first_index = index - self.queue_length + 1
        if first_index < 0:
            return None
        if self.data_infos[first_index]['scene_token'] != \\
           self.data_infos[final_index]['scene_token']:
            return None
        input_dict = self.get_data_info(final_index)
        prev_indexs_list = list(reversed(range(first_index, final_index)))
    ...
    example = self.pipeline(input_dict)
    data_queue.insert(0, example)

    for i in prev_indexs_list:
        input_dict = self.get_data_info(i)
        if input_dict['frame_idx'] < frame_idx and \\
           input_dict['scene_token'] == scene_token:
            example = self.pipeline(input_dict)
            frame_idx = input_dict['frame_idx']
        data_queue.insert(0, copy.deepcopy(example))

    data_queue = self.union2one(data_queue)   # 合并为 (queue_length, 6, 3, H, W)
    return data_queue`}</pre>
      <ul>
        <li><strong>时间队列</strong>：每个训练样本其实是 <code>queue_length</code>（Stage-1=5 / Stage-2=3）帧连续帧，<code>union2one</code> 在 batch 维度上拼接成 <code>(queue_length, num_cams, 3, H, W)</code>——BEVFormer 的时间自注意力需要它。</li>
        <li><strong>跨场景丢弃</strong>：若前推 <code>queue_length-1</code> 帧越过场景边界（<code>scene_token</code> 不同），整个样本返回 None（被 DataLoader 的 collate 过滤掉）——保证 clip 内帧同一场景。</li>
        <li>每帧都走完整 pipeline（加载 6 相机图像 + 归一化 + 各类 GT 标注），因此一个 batch 实际加载 3 帧 × 6 相机 = 18 张图。</li>
      </ul>

      <h2>5.11 关键配置对照（yaml 速查）</h2>
      <table>
        <thead><tr><th>区段</th><th>键</th><th>Stage-1 / Stage-2 值 · 含义</th></tr></thead>
        <tbody>
          <tr><td rowSpan={3}><strong>DATA_CONFIG</strong></td><td><code>queue_length</code></td><td>5 / 3（时间队列帧数）</td></tr>
          <tr><td><code>samples_per_gpu</code></td><td>1（每卡 1 个样本，含队列多帧）</td></tr>
          <tr><td><code>predict/past/fut_steps</code></td><td>12 / 4 / 4（未来轨迹/过去轨迹步数）</td></tr>
          <tr><td rowSpan={3}><strong>MODEL.heads</strong></td><td>motion / occ / planning</td><td>无 / 有（Stage-2 才装配）</td></tr>
          <tr><td>freeze_img_backbone/neck/bn</td><td>neck=False / True（Stage-2 全冻结）</td></tr>
          <tr><td>num_query / bev 尺寸</td><td>900 / 200×200（BEVFormer）</td></tr>
          <tr><td rowSpan={3}><strong>OPTIMIZATION</strong></td><td>optimizer / lr</td><td>AdamW / 2e-4（backbone ×0.1）</td></tr>
          <tr><td>lr_config</td><td>CosineAnnealing + warmup 500</td></tr>
          <tr><td>total_epochs</td><td>6 / 20</td></tr>
        </tbody>
      </table>

      {/* ==================== 6. 要点与易错点 ==================== */}
      <div className="section-divider"><span>要点与易错点</span></div>

      <ol>
        <li><strong>两阶段必须按序续训</strong>：Stage-2 的 <code>load_from</code> 必须指向 Stage-1 产物；直接用官方 BEVFormer 权重跑 Stage-2 会缺 motion/occ/planning 分支参数。</li>
        <li><strong>find_unused_parameters=True 必须</strong>：六任务分支参数严重部分参与前向，不开会 DDP 报错。</li>
        <li><strong>空 query 保护</strong>：occ head 前对 <code>track_query</code> 为 0 的情况做了 zeros 填充——Batch 小（samples_per_gpu=1）时很常见。</li>
        <li><strong>规划 detach</strong>：<code>sdc_track_query.detach()</code> 意味着规划任务不反传感知梯度，这是刻意设计，改掉会影响收敛稳定性。</li>
        <li><strong>clip 级匹配</strong>：track 的 <code>ClipMatcher</code> 是跨时间队列的匈牙利匹配，不是单帧；loss 汇总在 criterion.losses_dict。</li>
        <li><strong>轨迹用 cumsum</strong>：motion/planning 回归头输出位移增量再累加，训练初始阶段轨迹从原点出发逐渐积累。</li>
        <li><strong>车辆筛选</strong>：motion loss 只对 vehicle_id_list 内的类别计算，其他类别只参与 track。</li>
        <li><strong>占用投影</strong>：occ 标签用 <code>GenerateOccFlowLabels</code> 从 GT 框在线生成，<code>ignore_index=255</code> 处理无效区域。</li>
        <li><strong>时间队列内存</strong>：batch=1 + 队列 3 帧实际是 18 图/样本，GPU 显存主要耗在 BEVFormer 的时间自注意力。</li>
      </ol>

      <Callout type="tip">
        <strong>一句话总结 UniAD 训练：</strong>用 mmdetection3d 的 Runner 骨架，分两阶段课程学习——先用 6 epoch 训好 BEVFormer 感知 + 跟踪 + 建图，再在 20 epoch 里让 900 个 object query 一路级联到运动预测、占据预测和自车规划，每个任务 loss 加前缀权重后加权求和、梯度裁剪 35、余弦退火学习率联合训练。
      </Callout>

      <h3>关键源码路径</h3>
      <p style={{ color: 'var(--vp-c-text-3)', fontSize: '0.85rem', marginTop: 0 }}>
        📦 仓库：<a href="https://github.com/OpenDriveLab/UniAD" target="_blank" rel="noopener noreferrer">github.com/OpenDriveLab/UniAD</a>（分支 v2.0），点击路径跳转对应源码
      </p>
      <table>
        <thead><tr><th>文件</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><SrcLink path="tools/train.py" /></td><td>训练入口：配置 / 插件注册 / 分布式初始化</td></tr>
          <tr><td><SrcLink path="tools/uniad_dist_train.sh" /></td><td>torchrun 分布式启动脚本</td></tr>
          <tr><td><SrcLink path="projects/mmdet3d_plugin/uniad/apis/mmdet_train.py" /></td><td>Runner / Hook / 优化器编排</td></tr>
          <tr><td><SrcLink path="projects/configs/stage2_e2e/base_e2e.py" /></td><td>Stage-2 全任务端到端配置</td></tr>
          <tr><td><SrcLink path="projects/configs/stage1_track_map/base_track_map.py" /></td><td>Stage-1 跟踪+建图配置</td></tr>
          <tr><td><SrcLink path="projects/mmdet3d_plugin/uniad/detectors/uniad_e2e.py" /></td><td>UniAD 主检测器（六任务串联）</td></tr>
          <tr><td><SrcLink path="projects/mmdet3d_plugin/uniad/detectors/uniad_track.py" /></td><td>UniADTrack 跟踪基类 / Query 生命周期</td></tr>
          <tr><td><SrcLink path="projects/mmdet3d_plugin/uniad/dense_heads/motion_head.py" /></td><td>MotionHead 运动预测</td></tr>
          <tr><td><SrcLink path="projects/mmdet3d_plugin/uniad/dense_heads/motion_head_plugin/modules.py" /></td><td>MotionTransformerDecoder 三类交互</td></tr>
          <tr><td><SrcLink path="projects/mmdet3d_plugin/uniad/dense_heads/planning_head.py" /></td><td>PlanningHead 自车规划</td></tr>
          <tr><td><SrcLink path="projects/mmdet3d_plugin/losses/traj_loss.py" /></td><td>TrajLoss 运动损失</td></tr>
          <tr><td><SrcLink path="projects/mmdet3d_plugin/losses/planning_loss.py" /></td><td>PlanningLoss + CollisionLoss</td></tr>
          <tr><td><SrcLink path="projects/mmdet3d_plugin/datasets/nuscenes_e2e_dataset.py" /></td><td>时间队列采样数据集</td></tr>
        </tbody>
      </table>
    </div>
  );
}
