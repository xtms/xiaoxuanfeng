import { PageHeader } from '../components/PageHeader';
export function Pi0Page() {
  return (
    <div className="prose max-w-none">
      <PageHeader
        title="π0"
        date="更新于 2026-09"
        tags={['自动驾驶', 'VLA', 'Physical Intelligence', '具身智能']}
      />
      <p>Physical Intelligence 的<strong>旗舰机器人基础模型</strong>，基于视觉-语言-行动（VLA）架构，实现跨具身形态的泛化操作，支持多种机器人平台和任务。</p>
      <div className="glass-card" style={{ textAlign: 'center', padding: '48px 24px', marginTop: 32 }}>
        <p style={{ color: 'var(--vp-c-text-3)', fontSize: '0.9rem', margin: 0 }}>📝 详细分析待补充</p>
      </div>
    </div>
  );
}