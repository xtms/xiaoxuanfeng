import { MermaidDiagram } from '../components/MermaidDiagram';
import { CodeBlock, Callout, ResourceTable } from '../components/CodeBlock';

const GH = 'https://github.com/sshaoshuai/MTR/blob/master';

function SrcLink({ path }: { path: string }) {
  return (
    <a href={`${GH}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function MTRPage() {
  return (
    <div className="prose max-w-none">
      <h1>MTR — 训练框架实现架构分析</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">🏷️ 自动驾驶 · 轨迹预测 · Waymo · Transformer</span>
        <span className="page-meta-item">📖 源码分析</span>
      </div>
      <p>
        Waymo 开源的 <strong>Motion Transformer（MTR）</strong>，基于 Transformer 架构的多模态轨迹预测框架，在 Waymo Open Motion Dataset 上取得 SOTA 性能。本文基于 <code>/data/sd/MTR</code> 源码，重点对齐 Pi-0.5 页面的<strong>代码级逐步分析粒度</strong>——每个关键点给出真实源码片段 + 逐行解释 + 文件路径。
      </p>

      <Callout type="tip">
        <strong>核心结论：</strong>MTR 是一个<strong>纯裸 PyTorch</strong> 训练工程（无 Lightning/Accelerate），训练循环完全手写。训练区别于普通模型的两大特色：① <strong>Deep Supervision</strong> —— 6 层 motion decoder <strong>每一层</strong>都计算损失再取平均；② <strong>GMM 负对数似然回归损失</strong> —— 每帧轨迹输出 5 维高斯参数 (x, y, σ₁, σ₂, ρ)，速度用额外 L1 损失监督。
      </Callout>

      {/* ==================== 1. 仓库整体布局 ==================== */}
      <div className="section-divider"><span>仓库整体布局</span></div>

      <h3>1.1 目录结构</h3>
      <MermaidDiagram chart={`
graph TD
    R["📦 MTR 仓库根目录"]
    R --> PKG["mtr/ 核心 Python 包"]
    R --> T["tools/ 训练与评估"]
    R --> D["data/ 离线处理后的 Waymo 数据"]
    R --> DOC["docs/ · README.md"]

    PKG --> CFG["config.py<br/>EasyDict 配置系统"]
    PKG --> DS["datasets/ 数据加载"]
    PKG --> MD["models/ 模型"]
    PKG --> OPS["ops/ CUDA Kernel"]
    PKG --> UT["utils/ 损失与工具"]

    DS --> WDS["waymo/waymo_dataset.py<br/>WaymoDataset"]
    DS --> BDS["__init__.py<br/>build_dataloader"]

    MD --> M["model.py<br/>MotionTransformer"]
    MD --> CE["context_encoder/mtr_encoder.py<br/>MTREncoder"]
    MD --> MDE["motion_decoder/mtr_decoder.py<br/>MTRDecoder（含全部 Loss）"]
    MD --> PE["utils/polyline_encoder.py<br/>PointNetPolylineEncoder"]

    OPS --> AT["attention/ 局部注意力 CUDA"]
    OPS --> KNN["knn/knn_utils.py<br/>knn_batch_mlogk"]

    UT --> LU["loss_utils.py<br/>nll_loss_gmm_direct"]
    UT --> MU["motion_utils.py<br/>batch_nms / ADE"]

    T --> TR["train.py 训练入口"]
    T --> TE["test.py 评估入口"]
    T --> TU["train_utils/train_utils.py<br/>训练循环/断点续训"]
    T --> CG["cfgs/waymo/*.yaml 配置"]
      `} />

      <h3>1.2 技术选型特点</h3>
      <table>
        <thead><tr><th>维度</th><th>选型</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>训练框架</strong></td><td>裸 PyTorch</td><td>无 Lightning/Accelerate，手写训练循环（tools/train_utils/train_utils.py）</td></tr>
          <tr><td><strong>分布式</strong></td><td>torch.distributed (NCCL)</td><td>DDP + SyncBatchNorm，支持 pytorch / slurm 两种 launcher</td></tr>
          <tr><td><strong>精度</strong></td><td>纯 FP32</td><td>无 AMP / 无 GradScaler</td></tr>
          <tr><td><strong>配置系统</strong></td><td>EasyDict + YAML</td><td>yaml 文件 + 命令行 cfg_from_list 覆盖</td></tr>
          <tr><td><strong>自定义算子</strong></td><td>局部注意力 + KNN</td><td>ops/attention + ops/knn 的 CUDA kernel</td></tr>
        </tbody>
      </table>

      {/* ==================== 2. 模型架构实现（总览） ==================== */}
      <div className="section-divider"><span>模型架构实现（总览）</span></div>

      <h3>2.1 顶层：MotionTransformer</h3>
      <p>
        顶层模型在 <code>mtr/models/model.py:16</code>（注意不是 <code>mtr.py</code>）。<code>forward()</code> 串行执行 <code>context_encoder → motion_decoder</code>；训练时返回 <code>(loss, tb_dict, disp_dict)</code>，推理时返回包含 <code>pred_scores</code>、<code>pred_trajs</code> 的 <code>batch_dict</code>。<strong>全部损失下沉到 motion_decoder.get_loss()</strong>。
      </p>

      <h3>2.2 上下文编码器：MTREncoder</h3>
      <p>
        <code>mtr/models/context_encoder/mtr_encoder.py:18</code>，由两个 <strong>PointNet Polyline Encoder</strong> 加 6 层全局/局部自注意力构成（详见 5.4 代码级拆解）：
      </p>
      <table>
        <thead><tr><th>组件</th><th>输入维度</th><th>结构</th><th>输出</th></tr></thead>
        <tbody>
          <tr><td><strong>agent_polyline_encoder</strong></td><td>29 维属性 + 1 mask</td><td>hidden=256，3 层 MLP</td><td>256</td></tr>
          <tr><td><strong>map_polyline_encoder</strong></td><td>9 维（x/y/z/方向/类别/pre_x/pre_y）</td><td>hidden=64，5 层（前 3 层 pre_layers）</td><td>256</td></tr>
          <tr><td><strong>自注意力层</strong></td><td>d_model=256</td><td>6 层 × 8 head，FFN=1024</td><td>256</td></tr>
        </tbody>
      </table>
      <p>
        开启 <code>USE_LOCAL_ATTN=True</code> 时，<code>apply_local_attn()</code> 调用 <code>knn_utils.knn_batch_mlogk</code>，每个 token 只与 <code>NUM_OF_ATTN_NEIGHBORS=16</code> 个最近邻做注意力。
      </p>

      <h3>2.3 运动解码器：MTRDecoder —— 训练核心</h3>
      <p>
        <code>mtr/models/motion_decoder/mtr_decoder.py:20</code>，<strong>损失全部在此定义</strong>。关键成员：
      </p>
      <table>
        <thead><tr><th>成员</th><th>作用</th><th>维度</th></tr></thead>
        <tbody>
          <tr><td><code>in_proj_center_obj</code></td><td>中心物体特征投影</td><td>256 → 512</td></tr>
          <tr><td><code>obj_decoder_layers</code></td><td>物体 cross-attention 分支（全局）</td><td>d_model=512，6 层</td></tr>
          <tr><td><code>map_decoder_layers</code></td><td>地图 cross-attention 分支（局部）</td><td>MAP_D_MODEL=256，6 层</td></tr>
          <tr><td><code>dense_future_head</code></td><td>密集未来预测（所有物体）</td><td>hidden×2 → 80×7=560</td></tr>
          <tr><td><code>intention_points</code></td><td>从 <code>cluster_64_center_dict.pkl</code> 加载的 64 个聚类中心</td><td>(64, 2)</td></tr>
          <tr><td><code>motion_reg_heads</code> (ModuleList)</td><td>每层解码器回归头</td><td>512 → 80×7=560</td></tr>
          <tr><td><code>motion_cls_heads</code> (ModuleList)</td><td>每层解码器分类头</td><td>512 → 1</td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>intention points 不是可学习参数：</strong>64 个 motion query 的初始锚点来自离线 K-means 聚类结果 <code>cluster_64_center_dict.pkl</code>（终点聚类中心）。它们本身固定，但会通过 <code>intention_query_mlps</code>（正弦位置编码 + MLP）映射为<strong>可学习</strong>的 query content。
      </Callout>

      {/* ==================== 3. 训练框架实现（总览） ==================== */}
      <div className="section-divider"><span>训练框架实现（总览）</span></div>

      <h3>3.1 训练入口：tools/train.py</h3>
      <p><code>main()</code> 的核心流程（详见 5.1 代码级拆解）：</p>
      <CodeBlock language="python" title="train.py main() 初始化流程" code={`1. parse_config()
2. 分布式初始化 (init_dist_pytorch / init_dist_slurm, backend='nccl')
3. build_dataloader(cfg.DATA_CONFIG, training=True)
4. model = MotionTransformer(config=cfg.MODEL)
5. SyncBatchNorm.convert_sync_batchnorm(model)   # 除非 --without_sync_bn
6. model.cuda()
7. build_optimizer(model, cfg.OPTIMIZATION)       # 默认 AdamW
8. 加载 pretrained / 断点续训 (load_params_from_file / load_params_with_optimizer)
9. build_scheduler(optimizer, train_loader, cfg.OPTIMIZATION)
10. model.train()
11. DDP: DistributedDataParallel(model, find_unused_parameters=True)
12. train_utils.train_model(...)`} />

      <Callout type="warning">
        <strong>find_unused_parameters=True 是必需的：</strong>6 个 decoder 层共享 KV 特征但每层都产生 loss，存在部分参数在特定前向分支未被使用的情况，PyTorch DDP 默认会报错，因此必须显式开启。
      </Callout>

      <h3>3.2 优化器与学习率调度</h3>
      <table>
        <thead><tr><th>项目</th><th>配置</th></tr></thead>
        <tbody>
          <tr><td><strong>优化器</strong></td><td>AdamW（可选 Adam）</td></tr>
          <tr><td><strong>学习率</strong></td><td>1e-4，weight_decay=0.01</td></tr>
          <tr><td><strong>默认调度器</strong></td><td>LambdaLR：衰减步 [22, 24, 26, 28]（iteration），每步 ×0.5，下限 LR_CLIP/LR=0.01</td></tr>
          <tr><td><strong>可选调度器</strong></td><td>CosineAnnealingWarmRestarts / LinearLR</td></tr>
          <tr><td><strong>梯度裁剪</strong></td><td>clip_grad_norm_(1000.0) —— 非常宽松，相当于不 clip</td></tr>
        </tbody>
      </table>

      {/* ==================== 4. 端到端训练流程 ==================== */}
      <div className="section-divider"><span>端到端训练流程</span></div>

      <MermaidDiagram chart={`
sequenceDiagram
    participant S as dist_train.sh
    participant T as train.py
    participant D as DataLoader
    participant M as MotionTransformer
    participant L as get_loss()
    participant O as Optimizer

    S->>T: bash --cfg_file mtr+100_percent_data.yaml<br/>--batch_size 80
    T->>T: parse_config → EasyDict cfg
    T->>T: init_dist_pytorch (NCCL) + SyncBatchNorm
    T->>D: build_dataloader (batch=10/GPU, 8 workers)
    T->>M: build + .cuda() + DDP
    T->>O: AdamW(lr=1e-4, wd=0.01) + lambdaLR

    loop 30 epochs
        T->>D: next(batch)
        D-->>M: obj_trajs / map_polylines / GT
        M->>M: MTREncoder (polyline + 6层局部attn)
        M->>M: MTRDecoder (6层 cross-attn + 64 queries)
        M->>L: loss, tb_dict, disp_dict
        L-->>M: loss_decoder (6层deep supervision)<br/>+ loss_dense_prediction
        M->>O: loss.backward() + clip + step
        T->>T: save_checkpoint (latest/epoch_N/best)
    end
    T->>T: eval_one_epoch (mAP) → best_model.pth`} />

      {/* ==================== 5. 核心代码逐步分析 ==================== */}
      <div className="section-divider"><span>核心代码逐步分析</span></div>

      <p>以下按训练数据流（训练入口 → 训练循环 → 模型前向 → 损失函数 → 数据管道）逐文件给出<strong>真实源码片段</strong>与逐行解析，粒度对齐 Pi-0.5 页面。</p>

      <h2>5.1 train.py — main() 完整启动流程</h2>
      <p>文件: <code>tools/train.py</code></p>
      <pre>{`def build_optimizer(model, opt_cfg):
    if opt_cfg.OPTIMIZER == 'Adam':
        optimizer = torch.optim.Adam(
            [each[1] for each in model.named_parameters()],
            lr=opt_cfg.LR, weight_decay=opt_cfg.get('WEIGHT_DECAY', 0))
    elif opt_cfg.OPTIMIZER == 'AdamW':
        optimizer = torch.optim.AdamW(model.parameters(), lr=opt_cfg.LR,
                                      weight_decay=opt_cfg.get('WEIGHT_DECAY', 0))
    else:
        assert False
    return optimizer`}</pre>
      <ul>
        <li>根据 yaml 中 <code>OPTIMIZER: AdamW</code> 进入 AdamW 分支（MTR 默认）。<code>lr=1e-4</code>、<code>weight_decay=0.01</code> 来自 <code>OPTIMIZATION</code> 节。</li>
        <li>AdamW 将 L2 正则与参数更新解耦，适合 transformer 类模型。</li>
      </ul>
      <pre>{`def build_scheduler(optimizer, dataloader, opt_cfg, total_epochs,
                    total_iters_each_epoch, last_epoch):
    decay_steps = [x * total_iters_each_epoch
                   for x in opt_cfg.get('DECAY_STEP_LIST', [5, 10, 15, 20])]
    def lr_lbmd(cur_epoch):
        cur_decay = 1
        for decay_step in decay_steps:
            if cur_epoch >= decay_step:
                cur_decay = cur_decay * opt_cfg.LR_DECAY
        return max(cur_decay, opt_cfg.LR_CLIP / opt_cfg.LR)

    if opt_cfg.get('SCHEDULER', None) == 'lambdaLR':
        scheduler = lr_sched.LambdaLR(optimizer, lr_lbmd, last_epoch=last_epoch)`}</pre>
      <ul>
        <li><code>decay_steps = [22, 24, 26, 28] × total_iters_each_epoch</code>——注意 <code>lr_lbmd</code> 的形参名叫 <code>cur_epoch</code>，但 <code>LambdaLR</code> 传入的其实是 step 计数（见 5.2 的 <code>scheduler.step(accumulated_iter)</code>），所以这里实际是<strong>每个 iteration 都查一次</strong>。</li>
        <li>每跨过一个 decay_step（以 iteration 计），lr 乘以 <code>LR_DECAY=0.5</code>；最终 lr 不会低于 <code>LR_CLIP=1e-6</code>。</li>
      </ul>
      <pre>{`def main():
    args, cfg = parse_config()
    if args.launcher == 'none':
        dist_train = False
        total_gpus = 1
        args.without_sync_bn = True
    else:
        total_gpus, cfg.LOCAL_RANK = getattr(common_utils, 'init_dist_%s' % args.launcher)(
            args.tcp_port, args.local_rank, backend='nccl')
        dist_train = True
    ...
    train_set, train_loader, train_sampler = build_dataloader(
        dataset_cfg=cfg.DATA_CONFIG, batch_size=args.batch_size,
        dist=dist_train, workers=args.workers, logger=logger, training=True,
        merge_all_iters_to_one_epoch=args.merge_all_iters_to_one_epoch,
        total_epochs=args.epochs, add_worker_init_fn=args.add_worker_init_fn)
    model = model_utils.MotionTransformer(config=cfg.MODEL)
    if not args.without_sync_bn:
        model = torch.nn.SyncBatchNorm.convert_sync_batchnorm(model)
    model.cuda()
    optimizer = build_optimizer(model, cfg.OPTIMIZATION)
    scheduler = build_scheduler(optimizer, train_loader, cfg.OPTIMIZATION,
        total_epochs=args.epochs, total_iters_each_epoch=len(train_loader),
        last_epoch=last_epoch)
    model.train()
    if dist_train:
        model = nn.parallel.DistributedDataParallel(
            model, device_ids=[cfg.LOCAL_RANK % torch.cuda.device_count()],
            find_unused_parameters=True)
    ...
    train_model(model, optimizer, train_loader,
                optim_cfg=cfg.OPTIMIZATION, ...)`}</pre>
      <ul>
        <li><code>parse_config()</code> 读取 yaml，设置 <code>cfg.TAG = "mtr+100_percent_data"</code>。</li>
        <li>单卡模式直接 <code>dist_train=False</code> 且强制关闭 SyncBN；多卡走 <code>init_dist_pytorch</code> / <code>init_dist_slurm</code>，backend=nccl。</li>
        <li><code>batch_size</code>：命令行未指定则取 yaml 的 <code>BATCH_SIZE_PER_GPU=10</code>；指定了全局 batch 则按 GPU 数均分。</li>
        <li>scheduler 在 optimizer 之后构建，因为需要 <code>len(train_loader)</code> 作为 <code>total_iters_each_epoch</code>。</li>
        <li><strong>关键细节</strong>：<code>model.train()</code> 在 DDP 包装<strong>之前</strong>调用，保证后续 <code>fix some parameters</code> 的灵活性。</li>
        <li><strong>find_unused_parameters=True</strong>：decoder 多层输出导致部分参数在特定前向分支未被使用，必须显式开启。</li>
      </ul>

      <h2>5.2 train_utils.py — train_one_epoch 训练循环</h2>
      <p>文件: <code>tools/train_utils/train_utils.py</code></p>
      <pre>{`for cur_it in range(start_it, total_it_each_epoch):
    try:
        batch = next(dataloader_iter)
    except StopIteration:
        dataloader_iter = iter(train_loader)
        batch = next(dataloader_iter)

    if scheduler is not None:
        try:
            scheduler.step(accumulated_iter)     # 传入全局 iteration 数
        except:
            scheduler.step()

    cur_lr = optimizer.param_groups[0]['lr']
    model.train()
    optimizer.zero_grad()

    loss, tb_dict, disp_dict = model(batch)      # 内部调 get_loss()

    loss.backward()
    total_norm = clip_grad_norm_(model.parameters(), optim_cfg.GRAD_NORM_CLIP)
    optimizer.step()

    accumulated_iter += 1
    disp_dict.update({'loss': loss.item(), 'lr': cur_lr})

    if rank == 0:
        if tb_log is not None:
            tb_log.add_scalar('meta_data/learning_rate', cur_lr, accumulated_iter)
            for key, val in tb_dict.items():
                tb_log.add_scalar('train/' + key, val, accumulated_iter)
            tb_log.add_scalar('train/total_norm', total_norm, accumulated_iter)`}</pre>
      <ul>
        <li><strong>dataloader_iter 设计</strong>：<code>merge_all_iters_to_one_epoch=True</code> 时用外部传入的 iter 跨 epoch 持续迭代；StopIteration 时重新 iter——实现「多个 epoch 的 iter 合并成一个大 epoch」。</li>
        <li><strong>scheduler.step(accumulated_iter)</strong>：LambdaLR 接收全局 iter 数；<code>cur_epoch</code> 形参名有误导性，实际传的是 <code>accumulated_iter</code>（全局 step 数）。try/except 兼容不接受参数的 scheduler。</li>
        <li><code>model(batch)</code> 返回 loss 三元组：<code>MotionTransformer.forward()</code> 在训练态直接返回 <code>(loss, tb_dict, disp_dict)</code>（OpenPCDet 风格，loss 中间变量存在 <code>forward_ret_dict</code>）。</li>
        <li><code>clip_grad_norm_(1000.0)</code>：阈值 1000 几乎是「不裁剪」——transformer 梯度偶发 burst，但设太紧影响收敛。</li>
        <li><strong>细粒度日志</strong>：<code>train/loss_layer0_reg_gmm</code>、<code>train/loss_layer0_reg_vel</code>、<code>train/loss_layer0_cls</code> 等每层损失指标 + 梯度总范数。</li>
      </ul>
      <p><strong>checkpoint 策略</strong>（train_model 中）：第 1/2/4 个 epoch 必存，之后按 <code>ckpt_save_interval=2</code> 存，最后 10 个 epoch 全存；超过 <code>max_ckpt_save_num=5</code> 删除最旧；每 <code>ckpt_save_time_interval=300</code> 秒存 <code>latest_model.pth</code>；边训练边评估，mAP 刷新则存 <code>best_model.pth</code>。</p>

      <h2>5.3 model.py — MotionTransformer forward + get_loss</h2>
      <p>文件: <code>mtr/models/model.py</code></p>
      <pre>{`class MotionTransformer(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.model_cfg = config
        self.context_encoder = build_context_encoder(self.model_cfg.CONTEXT_ENCODER)
        self.motion_decoder = build_motion_decoder(
            in_channels=self.context_encoder.num_out_channels,
            config=self.model_cfg.MOTION_DECODER)

    def forward(self, batch_dict):
        batch_dict = self.context_encoder(batch_dict)
        batch_dict = self.motion_decoder(batch_dict)

        if self.training:
            loss, tb_dict, disp_dict = self.get_loss()
            tb_dict.update({'loss': loss.item()})
            disp_dict.update({'loss': loss.item()})
            return loss, tb_dict, disp_dict
        return batch_dict

    def get_loss(self):
        loss, tb_dict, disp_dict = self.motion_decoder.get_loss()
        return loss, tb_dict, disp_dict`}</pre>
      <ul>
        <li><code>__init__</code> 先建 <code>MTREncoder</code>（输出 <code>num_out_channels = D_MODEL = 256</code>），再把 256 作为 <code>in_channels</code> 建 <code>MTRDecoder</code>。</li>
        <li><code>forward</code> 是典型两阶段 pipeline：encoder 处理原始轨迹和地图 polyline，decoder 做多模态预测。</li>
        <li><strong>训练态返回 loss 三元组</strong>：loss 中间变量全存在 decoder 的 <code>self.forward_ret_dict</code>，<code>get_loss()</code> 读取后计算——OpenPCDet 经典设计。</li>
        <li>推理态返回 <code>batch_dict</code>（含 <code>pred_scores</code>、<code>pred_trajs</code>）。</li>
      </ul>

      <h2>5.4 mtr_encoder.py — polyline 编码 + 局部注意力</h2>
      <p>文件: <code>mtr/models/context_encoder/mtr_encoder.py</code></p>
      <pre>{`def forward(self, batch_dict):
    obj_trajs = input_dict['obj_trajs'].cuda()              # (num_co, num_obj, T, 29)
    obj_trajs_mask = input_dict['obj_trajs_mask'].cuda()    # (num_co, num_obj, T)
    map_polylines = input_dict['map_polylines'].cuda()      # (num_co, num_poly, 20, 9)
    track_index_to_predict = input_dict['track_index_to_predict']

    # 把 valid mask 拼进特征尾部 -> 30 维，让 polyline encoder 感知有效时间步
    obj_trajs_in = torch.cat(
        (obj_trajs, obj_trajs_mask[:, :, :, None].type_as(obj_trajs)), dim=-1)
    obj_polylines_feature = self.agent_polyline_encoder(obj_trajs_in, obj_trajs_mask)
    map_polylines_feature = self.map_polyline_encoder(map_polylines, map_polylines_mask)

    obj_valid_mask = (obj_trajs_mask.sum(dim=-1) > 0)       # 任一时刻有观测即 valid
    map_valid_mask = (map_polylines_mask.sum(dim=-1) > 0)

    global_token_feature = torch.cat((obj_polylines_feature, map_polylines_feature), dim=1)
    global_token_mask = torch.cat((obj_valid_mask, map_valid_mask), dim=1)
    global_token_pos = torch.cat((obj_trajs_last_pos, map_polylines_center), dim=1)

    if self.use_local_attn:
        global_token_feature = self.apply_local_attn(
            x=global_token_feature, x_mask=global_token_mask,
            x_pos=global_token_pos,
            num_of_neighbors=self.model_cfg.NUM_OF_ATTN_NEIGHBORS)
    else:
        global_token_feature = self.apply_global_attn(...)

    center_objects_feature = global_token_feature[
        torch.arange(num_center_objects), track_index_to_predict]
    batch_dict['center_objects_feature'] = center_objects_feature`}</pre>
      <ul>
        <li><strong>关键技巧：把 mask 拼到特征里</strong>——<code>obj_trajs_in = cat((trajs, mask))</code> 把 bool mask 变 0/1 拼到 29 维后成 <strong>30 维</strong>，PointNet polyline encoder 因此「感知」哪些时间步有效。</li>
        <li>Polyline Encoder 对时间维做 MLP + MaxPool，把 <code>(N, T, C)</code> 压成 <code>(N, C)</code>；agent 30 维 → 256，map 9 维 → 256。</li>
        <li>所有 agent tokens 与 map polyline tokens 在 dim=1 拼接成全局 token 集合；位置用 <code>obj_trajs_last_pos</code>（最后观测坐标）与 <code>map_polylines_center</code>（polyline 质心）。</li>
        <li><code>center_objects_feature</code> 用 <code>track_index_to_predict</code> 取出每个 center object 自身的编码特征 <code>(num_co, 256)</code>。</li>
      </ul>
      <pre>{`def apply_local_attn(self, x, x_mask, x_pos, num_of_neighbors):
    batch_size, N, d_model = x.shape
    x_stack_full = x.view(-1, d_model)                 # (B*N, C)
    x_mask_stack = x_mask.view(-1)
    x_pos_stack_full = x_pos.view(-1, 3)
    batch_idxs_full = torch.arange(batch_size)[:, None].repeat(1, N).view(-1)

    # 过滤无效元素（padding 剔除）
    x_stack = x_stack_full[x_mask_stack]
    x_pos_stack = x_pos_stack_full[x_mask_stack]
    batch_idxs = batch_idxs_full[x_mask_stack]

    batch_offsets = common_utils.get_batch_offsets(batch_idxs=batch_idxs, bs=batch_size)
    index_pair = knn_utils.knn_batch_mlogk(
        x_pos_stack, x_pos_stack, batch_idxs, batch_offsets, num_of_neighbors)
    #   (num_valid_elems, K=16)

    pos_embedding = position_encoding_utils.gen_sineembed_for_position(
        x_pos_stack[None, :, 0:2], hidden_dim=d_model)[0]

    output = x_stack
    for k in range(len(self.self_attn_layers)):
        output = self.self_attn_layers[k](
            src=output, pos=pos_embedding, index_pair=index_pair,
            query_batch_cnt=batch_cnt, key_batch_cnt=batch_cnt,
            index_pair_batch=batch_idxs)

    ret_full_feature = torch.zeros_like(x_stack_full)
    ret_full_feature[x_mask_stack] = output
    return ret_full_feature.view(batch_size, N, d_model)`}</pre>
      <ul>
        <li><strong>展平 + 过滤</strong>：<code>(B, N, C)</code> 展平为 <code>(B*N, C)</code>，用 mask 剔除 padding 无效 token。</li>
        <li><strong>KNN 查找</strong>：<code>knn_batch_mlogk</code> 是 CUDA 实现的多对数 KNN，在有效 token 中按 3D 空间坐标找 K=16 最近邻；<code>batch_offsets</code> 保证 KNN 不跨 batch 元素。</li>
        <li><strong>正弦位置编码</strong>：<code>gen_sineembed_for_position</code> 把 2D 坐标编码为 256 维正弦嵌入。</li>
        <li>每层 <code>TransformerEncoderLayer</code> 只让每个 token 与其 16 个最近邻做 attention（<code>index_pair</code> 指定），把 O(N²) 降为 O(N·K)——处理数百~上千 token 的关键工程决策。</li>
        <li>最后把有效 token 特征放回原位，padding 位置保持零。</li>
      </ul>
      <pre>{`def gen_sineembed_for_position(pos_tensor, hidden_dim=256):
    half_hidden_dim = hidden_dim // 2
    scale = 2 * math.pi
    dim_t = torch.arange(half_hidden_dim, dtype=torch.float32, device=pos_tensor.device)
    dim_t = 10000 ** (2 * (dim_t // 2) / half_hidden_dim)
    x_embed = pos_tensor[:, :, 0] * scale
    y_embed = pos_tensor[:, :, 1] * scale
    pos_x = x_embed[:, :, None] / dim_t
    pos_y = y_embed[:, :, None] / dim_t
    pos_x = torch.stack((pos_x[:, :, 0::2].sin(), pos_x[:, :, 1::2].cos()), dim=3).flatten(2)
    pos_y = torch.stack((pos_y[:, :, 0::2].sin(), pos_y[:, :, 1::2].cos()), dim=3).flatten(2)
    pos = torch.cat((pos_y, pos_x), dim=2)
    return pos`}</pre>
      <ul>
        <li>经典 Transformer 正弦位置编码：<code>dim_t = 10000^(2i/d)</code> 产生多频率基底。</li>
        <li>对 x、y 分别做 sin/cos 交错（偶维 sin、奇维 cos），各得 <code>hidden_dim/2</code> 维，最后 <code>(pos_y, pos_x)</code> 拼接为 256 维。</li>
        <li>输入 <code>(1, N, 2)</code>，输出 <code>(1, N, 256)</code>。</li>
      </ul>

      <h2>5.5 mtr_decoder.py — 6 层迭代解码 + Deep Supervision</h2>
      <p>文件: <code>mtr/models/motion_decoder/mtr_decoder.py</code></p>
      <pre>{`def apply_transformer_decoder(self, center_objects_feature, center_objects_type,
                               obj_feature, obj_mask, obj_pos,
                               map_feature, map_mask, map_pos):
    intention_query, intention_points = self.get_motion_query(center_objects_type)
    query_content = torch.zeros_like(intention_query)     # DETR 风格：content 初始为零
    num_query = query_content.shape[0]                    # 64
    center_objects_feature = center_objects_feature[None, :, :].repeat(num_query, 1, 1)

    dynamic_query_center = intention_points
    pred_list = []
    for layer_idx in range(self.num_decoder_layers):      # 6 层
        # 1) 对所有 agent 做全局 cross-attention
        obj_query_feature = self.apply_cross_attention(
            kv_feature=obj_feature, kv_mask=obj_mask, kv_pos=obj_pos,
            query_content=query_content, query_embed=intention_query,
            attention_layer=self.obj_decoder_layers[layer_idx],
            dynamic_query_center=dynamic_query_center, layer_idx=layer_idx)

        # 2) 动态收集地图 polyline + 局部 cross-attention
        collected_idxs, base_map_idxs = self.apply_dynamic_map_collection(
            map_pos=map_pos, map_mask=map_mask,
            pred_waypoints=pred_waypoints, base_map_idxs=base_map_idxs,
            num_waypoint_polylines=128, num_base_polylines=256, ...)
        map_query_feature = self.apply_cross_attention(
            kv_feature=map_feature, kv_mask=map_mask, kv_pos=map_pos,
            attention_layer=self.map_decoder_layers[layer_idx],
            use_local_attn=True, query_index_pair=collected_idxs, ...)

        # 3) 特征融合 [center, obj_attn, map_attn] -> 新 query_content
        query_feature = torch.cat(
            [center_objects_feature, obj_query_feature, map_query_feature], dim=-1)
        query_content = self.query_feature_fusion_layers[layer_idx](
            query_feature.flatten(start_dim=0, end_dim=1)
        ).view(num_query, num_center_objects, -1)

        # 4) 每层独立出回归 + 分类头（deep supervision 基础）
        pred_scores = self.motion_cls_heads[layer_idx](query_content_t)
        pred_trajs = self.motion_reg_heads[layer_idx](query_content_t).view(
            num_center_objects, num_query, self.num_future_frames, 7)
        pred_list.append([pred_scores, pred_trajs])

        # 5) 用当前层预测更新下一层的 query 中心
        dynamic_query_center = pred_trajs[:, :, -1, 0:2].permute(1, 0, 2)
    return pred_list`}</pre>
      <ul>
        <li><strong>intention query</strong>：从预聚类文件加载，每类 agent（vehicle/pedestrian/cyclist）各有 64 个聚类中心。<code>query_content</code>（content）初始为零、<code>intention_query</code>（position）用正弦编码的聚类坐标——DETR 风格的 content/position 分离。</li>
        <li><code>center_objects_feature</code> 复制 <code>num_query</code> 份与所有 query 拼接。</li>
        <li><strong>6 层迭代解码</strong>：每层做 ① 对所有 agent 全局 cross-attention；② <code>apply_dynamic_map_collection</code> 按当前预测轨迹动态收集最近 128 条 waypoint polyline + 固定 256 条 base polyline（共 384），仅与这些做局部 cross-attention；③ <code>[center(512)+obj(512)+map(256)]</code> 拼接 1280 维过融合 MLP。</li>
        <li><strong>每层都独立产出 <code>pred_scores / pred_trajs</code></strong>——这是 deep supervision 的模型端基础。</li>
        <li><strong>迭代更新</strong>：下一层 cross-attention 的位置编码基于当前层预测的轨迹末端，query 中心随预测移动。</li>
      </ul>
      <pre>{`def get_motion_query(self, center_objects_type):
    intention_points = torch.stack([
        self.intention_points[center_objects_type[obj_idx]]
        for obj_idx in range(num_center_objects)], dim=0)
    intention_points = intention_points.permute(1, 0, 2)   # (64, num_co, 2)

    intention_query = position_encoding_utils.gen_sineembed_for_position(
        intention_points, hidden_dim=self.d_model)
    intention_query = self.intention_query_mlps(
        intention_query.view(-1, self.d_model)
    ).view(-1, num_center_objects, self.d_model)           # 可学习 query content
    return intention_query, intention_points`}</pre>
      <ul>
        <li><code>cluster_64_center_dict.pkl</code> 是预先对 Waymo 训练集 GT 终点做 K-Means 聚类的 64 个中心，每种 agent 类型一组。</li>
        <li>按 batch 中每个 center object 的类型取出对应聚类中心，正弦编码到 512 维再经 2 层 MLP（<code>ret_before_act=True</code> 末层不激活）映射成可学习 query。</li>
      </ul>

      <h2>5.6 get_loss — 总损失组装 + Deep Supervision</h2>
      <p>文件: <code>mtr/models/motion_decoder/mtr_decoder.py</code></p>
      <pre>{`def get_loss(self, tb_pre_tag=''):
    loss_decoder, tb_dict, disp_dict = self.get_decoder_loss(tb_pre_tag=tb_pre_tag)
    loss_dense_prediction, tb_dict, disp_dict = self.get_dense_future_prediction_loss(...)
    total_loss = loss_decoder + loss_dense_prediction
    return total_loss, tb_dict, disp_dict

def get_decoder_loss(self, tb_pre_tag=''):
    center_gt_trajs = self.forward_ret_dict['center_gt_trajs']       # (num_co, 80, 4)
    center_gt_trajs_mask = self.forward_ret_dict['center_gt_trajs_mask']
    intention_points = self.forward_ret_dict['intention_points']     # (num_co, 64, 2)

    # 终点 = 最后一个有效位置，找最近 intention point 作为正样本
    center_gt_goals = center_gt_trajs[torch.arange(num_co), final_valid_idx, 0:2]
    dist = (center_gt_goals[:, None, :] - intention_points).norm(dim=-1)
    center_gt_positive_idx = dist.argmin(dim=-1)                     # single positive

    total_loss = 0
    for layer_idx in range(self.num_decoder_layers):                 # 6 层全部算 loss
        pred_scores, pred_trajs = pred_list[layer_idx]
        pred_trajs_gmm, pred_vel = pred_trajs[:, :, :, 0:5], pred_trajs[:, :, :, 5:7]

        loss_reg_gmm, _ = loss_utils.nll_loss_gmm_direct(
            pred_scores=pred_scores, pred_trajs=pred_trajs_gmm,
            gt_trajs=center_gt_trajs[:, :, 0:2],
            gt_valid_mask=center_gt_trajs_mask,
            pre_nearest_mode_idxs=center_gt_positive_idx,
            use_square_gmm=False)

        pred_vel = pred_vel[torch.arange(num_co), center_gt_positive_idx]
        loss_reg_vel = F.l1_loss(pred_vel, center_gt_trajs[:, :, 2:4], reduction='none')
        loss_reg_vel = (loss_reg_vel * center_gt_trajs_mask[:, :, None]).sum(dim=-1).sum(dim=-1)

        loss_cls = F.cross_entropy(input=pred_scores, target=center_gt_positive_idx,
                                   reduction='none')

        layer_loss = (loss_reg_gmm * 1.0 + loss_reg_vel * 0.5
                      + loss_cls.sum(dim=-1) * 1.0).mean()
        total_loss += layer_loss
    total_loss = total_loss / self.num_decoder_layers
    return total_loss, tb_dict, disp_dict`}</pre>
      <ul>
        <li><strong>正样本分配</strong>：取 center object GT 轨迹<strong>最后一个有效位置</strong>（终点），在所有 intention points 中找欧氏距离最近者作为唯一正例 query——single positive assignment。</li>
        <li><strong>Deep Supervision</strong>：对 6 层 decoder <strong>每一层</strong>都计算 loss 再取平均，不只监督最后一层。</li>
        <li><strong>7 维输出拆分</strong>：<code>0:5</code> 是 GMM 参数 <code>(x, y, log_σ₁, log_σ₂, ρ)</code>，<code>5:7</code> 是速度 <code>(vx, vy)</code>。</li>
        <li>速度 L1 只对正样本 query 计算，按 mask 加权后对时空维求和；分类 CE 是 64 分类的 softmax。</li>
        <li><strong>加权求和</strong>：<code>reg×1.0 + vel×0.5 + cls×1.0</code>（yaml 的 <code>LOSS_WEIGHTS</code>），对 batch 取 mean。</li>
      </ul>

      <h2>5.7 loss_utils.py — nll_loss_gmm_direct 完整推导</h2>
      <p>文件: <code>mtr/utils/loss_utils.py</code></p>
      <pre>{`def nll_loss_gmm_direct(pred_scores, pred_trajs, gt_trajs, gt_valid_mask,
                        pre_nearest_mode_idxs=None, use_square_gmm=False,
                        log_std_range=(-1.609, 5.0), rho_limit=0.5):
    # 最近模态选择：预分配或按累计距离 argmin
    if pre_nearest_mode_idxs is not None:
        nearest_mode_idxs = pre_nearest_mode_idxs
    else:
        distance = (pred_trajs[:, :, :, 0:2] - gt_trajs[:, None, :, :]).norm(dim=-1)
        distance = (distance * gt_valid_mask[:, None, :]).sum(dim=-1)
        nearest_mode_idxs = distance.argmin(dim=-1)

    nearest_trajs = pred_trajs[torch.arange(bs), nearest_mode_idxs]  # (bs, T, 5)
    res_trajs = gt_trajs - nearest_trajs[:, :, 0:2]
    dx, dy = res_trajs[:, :, 0], res_trajs[:, :, 1]

    log_std1 = torch.clip(nearest_trajs[:, :, 2], min=-1.609, max=5.0)   # σ ∈ [0.2, 150] m
    log_std2 = torch.clip(nearest_trajs[:, :, 3], min=-1.609, max=5.0)
    rho = torch.clip(nearest_trajs[:, :, 4], min=-0.5, max=0.5)          # 防协方差奇异

    gt_valid_mask = gt_valid_mask.type_as(pred_scores)

    # NLL = log(σ1) + log(σ2) + 0.5·log(1-ρ²) + 0.5/(1-ρ²)·(dx²/σ1² + dy²/σ2² - 2ρ·dx·dy/(σ1σ2))
    reg_gmm_log_coefficient = log_std1 + log_std2 + 0.5 * torch.log(1 - rho**2)
    reg_gmm_exp = (0.5 * 1 / (1 - rho**2)) * (
        (dx**2) / (std1**2) + (dy**2) / (std2**2) - 2 * rho * dx * dy / (std1 * std2))

    reg_loss = ((reg_gmm_log_coefficient + reg_gmm_exp) * gt_valid_mask).sum(dim=-1)
    return reg_loss, nearest_mode_idxs`}</pre>
      <ul>
        <li><strong>最近模态</strong>：若传入 <code>pre_nearest_mode_idxs</code> 直接复用（来自上一层 loss）；否则对每个样本算所有 mode 与 GT 的累积距离，取最小者。</li>
        <li><strong>参数裁剪</strong>：网络直接预测 <code>log σ</code>，裁剪到 <code>[-1.609, 5.0]</code>（σ ∈ 0.2m~150m）；ρ 裁剪到 <code>[-0.5, 0.5]</code> 防协方差奇异。</li>
        <li><strong>数学本质</strong>：二元高斯 PDF 的负对数似然。<code>reg_gmm_log_coefficient</code> 对应归一化系数的对数，<code>reg_gmm_exp</code> 对应指数部分，去掉常数 <code>log(2π)</code> 不影响优化。</li>
        <li><code>use_square_gmm=False</code>：使用<strong>完整带 ρ 相关项的 2D 高斯</strong>，而非独立 x/y 高斯。</li>
        <li>该 loss 鼓励预测的 GMM 分布覆盖 GT——预测均值接近 GT 且标准差适中时 loss 最小。</li>
      </ul>

      <h2>5.8 waymo_dataset.py — 29 维特征构建与中心坐标变换</h2>
      <p>文件: <code>mtr/datasets/waymo/waymo_dataset.py</code></p>
      <pre>{`def generate_centered_trajs_for_agents(self, center_objects, obj_trajs_past, obj_types, ...):
    # 所有 agent 轨迹变换到 center object 局部坐标系
    obj_trajs = self.transform_trajs_to_center_coords(
        obj_trajs=obj_trajs_past,
        center_xyz=center_objects[:, 0:3],
        center_heading=center_objects[:, 6],
        heading_index=6, rot_vel_index=[7, 8])

    # type one-hot (5 维): vehicle/ped/cyc + is_center_object + is_sdc
    object_onehot_mask[:, obj_types == 'TYPE_VEHICLE', :, 0] = 1
    object_onehot_mask[:, obj_types == 'TYPE_PEDESTRAIN', :, 1] = 1
    object_onehot_mask[:, obj_types == 'TYPE_CYCLIST', :, 2] = 1
    object_onehot_mask[torch.arange(num_co), center_indices, :, 3] = 1
    object_onehot_mask[:, sdc_index, :, 4] = 1

    # time one-hot (11 维): 10 步 one-hot + 绝对时间戳
    object_time_embedding[:, :, torch.arange(T), torch.arange(T)] = 1
    object_time_embedding[:, :, torch.arange(T), -1] = timestamps

    # heading (2 维 sin/cos) + velocity (2 维) + acceleration (2 维)
    object_heading_embedding[:, :, :, 0] = np.sin(obj_trajs[:, :, :, 6])
    object_heading_embedding[:, :, :, 1] = np.cos(obj_trajs[:, :, :, 6])
    vel = obj_trajs[:, :, :, 7:9]
    vel_pre = torch.roll(vel, shifts=1, dims=2)
    acce = (vel - vel_pre) / 0.1                          # 相邻帧速度差 / 0.1s
    acce[:, :, 0, :] = acce[:, :, 1, :]                   # 首帧加速度 = 次帧

    ret_obj_trajs = torch.cat((
        obj_trajs[:, :, :, 0:6],    # 6: x,y,z,dx,dy,dz
        object_onehot_mask,          # 5
        object_time_embedding,       # 11
        object_heading_embedding,    # 2
        obj_trajs[:, :, :, 7:9],    # 2: vx,vy
        acce,                        # 2: ax,ay
    ), dim=-1)                       # 6+5+11+2+2+2 = 28 维，+mask 1 维 = 29`}</pre>
      <ul>
        <li><strong>29 维特征拆分</strong>：6（位置尺寸）+ 5（类型 one-hot + is_center + is_sdc）+ 11（时间 one-hot + 时间戳）+ 2（sin/cos heading）+ 2（速度）+ 2（加速度）= 28 维，polyline encoder 里再拼 1 维 valid mask = 29。</li>
        <li><strong>坐标归一化</strong>：所有 agent 轨迹先变换到中心物体局部系（平移 −center_xyz、旋转 −center_heading），让模型学相对运动模式（空间不变性）——Waymo 类模型标准做法。</li>
        <li><strong>加速度</strong>：<code>(vel − vel_prev) / 0.1s</code>，首帧加速度取次帧值填充。</li>
      </ul>
      <pre>{`@staticmethod
def transform_trajs_to_center_coords(obj_trajs, center_xyz, center_heading,
                                     heading_index, rot_vel_index=None):
    obj_trajs = obj_trajs.view(1, num_objects, num_timestamps, num_attrs) \\
                       .repeat(num_center_objects, 1, 1, 1)
    obj_trajs[:, :, :, 0:center_xyz.shape[1]] -= center_xyz[:, None, None, :]  # 平移
    obj_trajs[:, :, :, 0:2] = rotate_points_along_z(                            # 旋转 xy
        obj_trajs[:, :, :, 0:2].view(num_co, -1, 2), angle=-center_heading)
    obj_trajs[:, :, :, heading_index] -= center_heading[:, None, None]          # 旋转 heading
    if rot_vel_index is not None:
        obj_trajs[:, :, :, rot_vel_index] = rotate_points_along_z(              # 旋转速度
            obj_trajs[:, :, :, rot_vel_index].view(num_co, -1, 2),
            angle=-center_heading)
    return obj_trajs`}</pre>
      <ul>
        <li><strong>repeat 广播</strong>：<code>(num_obj, T, attr)</code> repeat 成 <code>(num_co, num_obj, T, attr)</code>——每个 center object 各有自己的完整场景，但各自变换到不同局部系。</li>
        <li><strong>四步变换</strong>：平移（减 center_xyz）→ 绕 Z 轴旋转 xy（−center_heading）→ heading 角偏移 → 速度向量同步旋转。</li>
      </ul>

      <h2>5.9 dataset.py — collate_batch 特殊批处理</h2>
      <p>文件: <code>mtr/datasets/dataset.py</code></p>
      <pre>{`def collate_batch(self, batch_list):
    for key, val_list in key_to_list.items():
        if key in ['obj_trajs', 'obj_trajs_mask', 'map_polylines',
                   'map_polylines_center', 'obj_trajs_future_state', ...]:
            input_dict[key] = common_utils.merge_batch_by_padding_2nd_dim(val_list)
        elif key in ['scenario_id', 'obj_types', 'center_objects_type']:
            input_dict[key] = np.concatenate(val_list, axis=0)
        else:
            input_dict[key] = torch.cat(val_list, dim=0)
    batch_sample_count = [len(x['track_index_to_predict']) for x in batch_list]
    return batch_dict

def merge_batch_by_padding_2nd_dim(tensor_list, return_pad_mask=False):
    maxt_feat0 = max([x.shape[1] for x in tensor_list])    # dim=1 (object) 取最大
    ret_tensor_list = []
    for k in range(len(tensor_list)):
        new_tensor = cur_tensor.new_zeros(
            cur_tensor.shape[0], maxt_feat0, num_feat1, num_feat2)
        new_tensor[:, :cur_tensor.shape[1], :, :] = cur_tensor   # 尾部补零
        ret_tensor_list.append(new_tensor)
    return torch.cat(ret_tensor_list, dim=0)              # dim=0 (sample) 拼接`}</pre>
      <ul>
        <li><strong>设计核心</strong>：每个 sample 的 <code>num_objects</code> 不同（Waymo 各场景 agent 数不同），collate 时在 <strong>dim=1（object 维度）</strong> padding 到 batch 内最大值，再在 dim=0（sample 维度）拼接。</li>
        <li>因此模型内部看到的 "batch_size" 实际是 <code>Σ num_center_objects</code>。</li>
        <li>字符串/类别字段（<code>scenario_id</code> 等）直接 <code>np.concatenate</code>；其余 <code>num_center_objects</code> 维度字段直接 <code>torch.cat(dim=0)</code>。</li>
        <li><code>batch_sample_count</code> 记录每个 batch 元素贡献的 center object 数，推理时用于把结果拆回各场景。</li>
      </ul>

      <h2>5.10 关键配置对照（yaml 速查）</h2>
      <p>文件: <code>tools/cfgs/waymo/mtr+100_percent_data.yaml</code></p>
      <table>
        <thead><tr><th>区段</th><th>键</th><th>值 / 含义</th></tr></thead>
        <tbody>
          <tr><td rowSpan={3}><strong>DATA_CONFIG</strong></td><td><code>NUM_OF_SRC_POLYLINES</code></td><td>768 条（以前方 30m 为圆心选最近）</td></tr>
          <tr><td><code>NUM_POINTS_EACH_POLYLINE</code></td><td>20 点 / 条</td></tr>
          <tr><td><code>CENTER_OFFSET_OF_MAP</code></td><td>[30.0, 0]（前方 30m 前视）</td></tr>
          <tr><td rowSpan={5}><strong>CONTEXT_ENCODER</strong></td><td><code>NUM_INPUT_ATTR_AGENT / MAP</code></td><td>29 / 9</td></tr>
          <tr><td><code>D_MODEL</code></td><td>256</td></tr>
          <tr><td><code>NUM_ATTN_LAYERS / HEAD</code></td><td>6 / 8</td></tr>
          <tr><td><code>USE_LOCAL_ATTN</code></td><td>True（K=16）</td></tr>
          <tr><td><code>NUM_CHANNEL_IN_MLP_MAP</code></td><td>64</td></tr>
          <tr><td rowSpan={6}><strong>MOTION_DECODER</strong></td><td><code>NUM_FUTURE_FRAMES</code></td><td>80（8 秒 @10Hz）</td></tr>
          <tr><td><code>NUM_MOTION_MODES</code></td><td>6</td></tr>
          <tr><td><code>INTENTION_POINTS_FILE</code></td><td>cluster_64_center_dict.pkl（K=64）</td></tr>
          <tr><td><code>D_MODEL / MAP_D_MODEL</code></td><td>512 / 256</td></tr>
          <tr><td><code>NUM_DECODER_LAYERS</code></td><td>6</td></tr>
          <tr><td><code>LOSS_WEIGHTS</code></td><td>cls=1.0, reg=1.0, vel=0.5</td></tr>
          <tr><td rowSpan={4}><strong>OPTIMIZATION</strong></td><td><code>OPTIMIZER / LR</code></td><td>AdamW / 1e-4</td></tr>
          <tr><td><code>SCHEDULER</code></td><td>lambdaLR（DECAY_STEP_LIST=[22,24,26,28] ×0.5）</td></tr>
          <tr><td><code>BATCH_SIZE_PER_GPU</code></td><td>10</td></tr>
          <tr><td><code>NUM_EPOCHS</code></td><td>30</td></tr>
        </tbody>
      </table>

      {/* ==================== 6. 要点与易错点 ==================== */}
      <div className="section-divider"><span>要点与易错点</span></div>

      <ol>
        <li><strong>无混合精度</strong>：全程 FP32，没有 <code>torch.cuda.amp</code> 相关代码。</li>
        <li><strong>Deep supervision</strong>：decoder 6 层全部算 loss 再平均，不是只监督最后一层。</li>
        <li><strong>intention points 固定锚点</strong>：来自离线 K-means 聚类，但经 <code>intention_query_mlps</code> 映射成可学习 query。</li>
        <li><strong>motion_vel_heads = None</strong>：回归头一次输出 80×7 维，把 GMM 5 维 + 速度 2 维一起回归，无独立速度头。</li>
        <li><strong>find_unused_parameters=True 必须</strong>：6 个 decoder 层共享 KV 特征但每层都产生 loss。</li>
        <li><strong>batch 维度特殊</strong>：collate 把多个 center object 集合在物体维度 padding 拼接，模型内 "batch_size" = Σ num_center_objects。</li>
        <li><strong>use_square_gmm=False</strong>：完整 2D 高斯（含 ρ 相关项），非独立 x/y 高斯。</li>
        <li><strong>评估指标</strong>：训练期监控 per-category ADE（5/9/15 步），最终 ckpt 选择用 Waymo 官方 mAP。</li>
      </ol>

      <Callout type="tip">
        <strong>一句话总结 MTR 训练：</strong>AdamW + lambdaLR + FP32 + DDP，模型是 polyline 编码器堆 6 层局部自注意力，解码器用 64 个聚类 query 做 6 层 cross-attention，对每层用 GMM 负对数似然做回归、cross-entropy 做模态分类、L1 做速度监督，六层损失取平均后联合训练。
      </Callout>

      <h3>关键源码路径</h3>
      <p style={{ color: 'var(--vp-c-text-3)', fontSize: '0.85rem', marginTop: 0 }}>
        📦 仓库：<a href="https://github.com/sshaoshuai/MTR" target="_blank" rel="noopener noreferrer">github.com/sshaoshuai/MTR</a>（分支 master），点击路径跳转对应源码
      </p>
      <table>
        <thead><tr><th>文件</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><SrcLink path="tools/train.py" /></td><td>训练入口：配置解析 / DDP / optimizer / scheduler</td></tr>
          <tr><td><SrcLink path="tools/train_utils/train_utils.py" /></td><td>训练循环 / 断点续训 / checkpoint 管理</td></tr>
          <tr><td><SrcLink path="tools/cfgs/waymo/mtr+100_percent_data.yaml" /></td><td>核心训练配置</td></tr>
          <tr><td><SrcLink path="mtr/models/model.py" /></td><td>MotionTransformer 顶层模型</td></tr>
          <tr><td><SrcLink path="mtr/models/context_encoder/mtr_encoder.py" /></td><td>MTREncoder 上下文编码器</td></tr>
          <tr><td><SrcLink path="mtr/models/motion_decoder/mtr_decoder.py" /></td><td>MTRDecoder（全部 loss 定义于此）</td></tr>
          <tr><td><SrcLink path="mtr/utils/loss_utils.py" /></td><td>nll_loss_gmm_direct GMM 损失</td></tr>
          <tr><td><SrcLink path="mtr/datasets/waymo/waymo_dataset.py" /></td><td>WaymoDataset 数据管道</td></tr>
        </tbody>
      </table>
    </div>
  );
}
