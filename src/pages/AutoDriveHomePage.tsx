import { Link } from 'react-router-dom';

const frameworks = [
  {
    to: '/auto-drive/voyager',
    name: 'Voyager',
    desc: 'NVIDIA 开源的端到端自动驾驶训练框架，基于大模型的世界模型与规划器',
    tags: ['端到端', '世界模型', 'NVIDIA'],
    color: '#76b900',
  },
  {
    to: '/auto-drive/drivevla-w0',
    name: 'DriveVLA-W0',
    desc: '华为开源的视觉-语言-行动（VLA）端到端自动驾驶大模型',
    tags: ['VLA', '端到端', '视觉语言'],
    color: '#cf0a2c',
  },
  {
    to: '/auto-drive/emu3',
    name: 'Emu3',
    desc: '北京智源研究院的多模态大一统模型，支持图像/视频/文本生成与理解',
    tags: ['多模态', '生成式', '大一统'],
    color: '#3b82f6',
  },
  {
    to: '/auto-drive/pi-0-5',
    name: 'Pi-0.5',
    desc: 'Physical Intelligence 的通用机器人基础模型，视觉-语言-行动',
    tags: ['VLA', '机器人', '通用模型'],
    color: '#8b5cf6',
  },
  {
    to: '/auto-drive/pi0',
    name: 'π0',
    desc: 'Physical Intelligence 的旗舰机器人基础模型，跨具身泛化',
    tags: ['VLA', '具身智能', '跨平台'],
    color: '#ec4899',
  },
  {
    to: '/auto-drive/mtr',
    desc: 'Waymo 开源的 Motion Transformer，多模态轨迹预测框架',
    name: 'MTR',
    tags: ['轨迹预测', 'Transformer', 'Waymo'],
    color: '#f59e0b',
  },
  {
    to: '/auto-drive/uniad',
    desc: 'OpenDriveLab 开源的端到端自动驾驶框架，六大任务 unified，CVPR 2023 最佳论文',
    name: 'UniAD',
    tags: ['端到端', 'BEVFormer', 'CVPR 2023'],
    color: '#14b8a6',
  },
  {
    to: '/auto-drive/cosmos-framework',
    desc: 'NVIDIA 世界模型训练/微调基础设施，TOML 配置流 + ImaginaireTrainer + FSDP',
    name: 'Cosmos-Framework',
    tags: ['NVIDIA', '世界模型', 'TOML', 'FSDP'],
    color: '#a855f7',
  },
];

export function AutoDriveHomePage() {
  return (
    <div className="prose max-w-none">
      <h1>自动驾驶学习指南</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">🏷️ 自动驾驶 · 端到端 · VLA</span>
      </div>
      <p>深入理解端到端自动驾驶与具身智能训练框架，涵盖 Voyager、DriveVLA-W0、Emu3、Pi-0.5、π0、MTR、UniAD、Cosmos-Framework 等主流框架的架构设计、训练范式与实现原理。</p>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">8</div><div className="stat-label">训练框架</div></div>
        <div className="stat-card"><div className="stat-value">端到端</div><div className="stat-label">核心范式</div></div>
        <div className="stat-card"><div className="stat-value">VLA</div><div className="stat-label">模型架构</div></div>
        <div className="stat-card"><div className="stat-value">多模态</div><div className="stat-label">感知融合</div></div>
      </div>

      {/* Framework cards */}
      <h2>📦 框架总览</h2>
      <p style={{ color: 'var(--vp-c-text-3)', margin: '0 0 16px', fontSize: '0.9rem' }}>
        端到端自动驾驶与具身智能训练框架
      </p>
      <div className="grid grid-cols-2 gap-3">
        {frameworks.map(({ to, name, desc, tags, color }) => (
          <Link key={to} to={to} className="no-underline" style={{ color: 'inherit' }}>
            <div className="glass-card h-full">
              <div className="flex items-center gap-3 mb-3">
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                <span className="font-bold text-lg" style={{ color: 'var(--vp-c-text-1)' }}>{name}</span>
              </div>
              <p className="text-sm mb-3" style={{ color: 'var(--vp-c-text-2)', lineHeight: 1.6 }}>{desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => <span key={t} className="tag tag-outline">{t}</span>)}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Learning path */}
      <h2>🗺️ 学习路径</h2>
      <p style={{ color: 'var(--vp-c-text-3)', margin: '0 0 16px', fontSize: '0.9rem' }}>
        推荐学习顺序
      </p>
      <div className="glass-card" style={{ padding: '16px 0' }}>
        <div className="learning-path">
          <div className="path-step"><div className="path-step-num">1</div><div className="path-step-content"><h4><Link to="/auto-drive/overview">总体架构</Link></h4><p>理解端到端自动驾驶的核心范式：模仿学习、强化学习、VLA 架构</p></div></div>
          <div className="path-step"><div className="path-step-num">2</div><div className="path-step-content"><h4><Link to="/auto-drive/mtr">MTR</Link></h4><p>Waymo 的 Motion Transformer，多模态轨迹预测经典框架</p></div></div>
          <div className="path-step"><div className="path-step-num">3</div><div className="path-step-content"><h4><Link to="/auto-drive/voyager">Voyager</Link></h4><p>NVIDIA 端到端自动驾驶框架，世界模型 + 规划器</p></div></div>
          <div className="path-step"><div className="path-step-num">4</div><div className="path-step-content"><h4><Link to="/auto-drive/drivevla-w0">DriveVLA-W0</Link></h4><p>华为 VLA 端到端自动驾驶大模型</p></div></div>
          <div className="path-step"><div className="path-step-num">5</div><div className="path-step-content"><h4><Link to="/auto-drive/emu3">Emu3</Link></h4><p>智源多模态大一统模型，下一代自动驾驶感知基础</p></div></div>
          <div className="path-step"><div className="path-step-num">6</div><div className="path-step-content"><h4><Link to="/auto-drive/pi0">π0</Link> + <Link to="/auto-drive/pi-0-5">Pi-0.5</Link></h4><p>Physical Intelligence 的通用机器人基础模型，VLA 架构前沿</p></div></div>
          <div className="path-step"><div className="path-step-num">7</div><div className="path-step-content"><h4><Link to="/auto-drive/uniad">UniAD</Link></h4><p>OpenDriveLab 端到端自动驾驶，六大任务统一，CVPR 2023 最佳论文</p></div></div>
          <div className="path-step"><div className="path-step-num">8</div><div className="path-step-content"><h4><Link to="/auto-drive/cosmos-framework">Cosmos-Framework</Link></h4><p>NVIDIA 世界模型训练基础设施：TOML 配置流 + ImaginaireTrainer + CP 数据窗口</p></div></div>
        </div>
      </div>
    </div>
  );
}