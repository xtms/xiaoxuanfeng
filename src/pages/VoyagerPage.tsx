export function VoyagerPage() {
  return (
    <div className="prose max-w-none">
      <h1>Voyager</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">🏷️ 自动驾驶 · 端到端 · NVIDIA · 世界模型</span>
      </div>
      <p>NVIDIA 开源的端到端自动驾驶训练框架，基于<strong>世界模型（World Model）</strong>与<strong>规划器（Planner）</strong>的联合训练架构，实现从传感器输入到规划输出的端到端学习。</p>
      <div className="glass-card" style={{ textAlign: 'center', padding: '48px 24px', marginTop: 32 }}>
        <p style={{ color: 'var(--vp-c-text-3)', fontSize: '0.9rem', margin: 0 }}>📝 详细分析待补充</p>
      </div>
    </div>
  );
}