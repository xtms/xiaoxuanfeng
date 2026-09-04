// Pi-0.5 适配涉及两个上游仓库：LeRobot（src/lerobot/...）与 OpenPI（src/openpi/...）
const LEROBOT_GH = 'https://github.com/huggingface/lerobot/blob/main';
const OPENPI_GH = 'https://github.com/physical-intelligence/openpi/blob/main';

// NPU 适配新增文件在上游不存在 → 链接到所属 pi05 目录
const PI05_DIR = 'https://github.com/huggingface/lerobot/tree/main/src/lerobot/policies/pi05';

function githubUrl(path: string): string {
  if (path.startsWith('src/openpi/')) return `${OPENPI_GH}/${path}`;
  if (path === 'scripts/train_pytorch.py') return `${OPENPI_GH}/${path}`;
  // lerobot pi05 policy 短名 → 补全完整路径
  if (path === 'modeling_pi05.py' || path === 'vision_siglip_npu.py') {
    return `${LEROBOT_GH}/src/lerobot/policies/pi05/${path}`;
  }
  return `${LEROBOT_GH}/${path}`;
}

function FileLink({ path, href }: { path: string; href?: string }) {
  return (
    <a href={href ?? githubUrl(path)} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function Pi05Page() {
  return (
    <>
      <style>{`
        .pi05-container {
          --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100;
          --s5: #e87ba4; --s6: #008300; --s7: #4a3aa7; --s8: #e34948;
          --seq-250: #86b6ef; --seq-400: #3987e5; --seq-500: #256abf; --seq-600: #184f95;
        }
        :root.dark .pi05-container,
        [data-theme="dark"] .pi05-container {
          --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500;
          --s5: #d55181; --seq-250: #86b6ef; --seq-400: #3987e5; --seq-500: #256abf; --seq-600: #184f95;
        }
        .pi05-container .diagram-section {
          margin-bottom: 48px;
          background: var(--vp-c-bg);
          border: 1px solid var(--vp-c-divider);
          border-radius: 12px;
          padding: 28px 24px;
        }
        .pi05-container .diagram-section h2 {
          font-size: 1.2rem; font-weight: 600;
          margin: 0 0 4px; padding: 0; border: none;
          color: var(--vp-c-text-1);
        }
        .pi05-container .diagram-section .desc {
          color: var(--vp-c-text-2); font-size: 0.85rem; margin-bottom: 20px; margin-top: 0;
        }
        .pi05-container .diagram-section svg { display: block; width: 100%; height: auto; }
        .pi05-container .diagram-section svg * { box-sizing: content-box; }
        .pi05-container .diagram-section svg text { font-family: inherit; line-height: 1; }
        .pi05-container .legend-row { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
        .pi05-container .legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--vp-c-text-2); }
        .pi05-container .legend-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
        .pi05-container .section-divider {
          display: flex; align-items: center;
          margin: 48px 0 32px; color: var(--vp-c-text-3); font-size: 0.9rem; font-weight: 600;
        }
        .pi05-container .section-divider::before, .pi05-container .section-divider::after {
          content: ''; flex: 1; height: 1px; background: var(--vp-c-divider);
        }
        .pi05-container .section-divider span { padding: 0 16px; }
        .pi05-container h2 { font-size: 1.2rem; font-weight: 600; margin: 36px 0 12px; padding: 0; border: none; color: var(--vp-c-text-1); }
        .pi05-container h3 { font-size: 1.05rem; font-weight: 600; margin: 28px 0 8px; padding: 0; border: none; color: var(--vp-c-text-1); }
        .pi05-container pre { font-size: 0.82rem; background: var(--vp-c-bg-alt); border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 14px 16px; overflow-x: auto; }
        .pi05-container table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.85rem; }
        .pi05-container th { background: var(--vp-c-bg-alt); text-align: left; padding: 8px 12px; border: 1px solid var(--vp-c-divider); font-weight: 600; }
        .pi05-container td { padding: 8px 12px; border: 1px solid var(--vp-c-divider); }
        .pi05-container ul, .pi05-container ol { margin: 8px 0; padding-left: 24px; }
        .pi05-container li { margin: 4px 0; font-size: 0.9rem; line-height: 1.65; }
        .pi05-container p { font-size: 0.9rem; line-height: 1.7; color: var(--vp-c-text-2); margin: 8px 0; }
        .pi05-container code { font-size: 0.82em; background: var(--vp-c-bg-alt); padding: 1px 5px; border-radius: 3px; }
        .pi05-container a { color: var(--vp-c-brand); text-decoration: none; }
        .pi05-container a:hover { text-decoration: underline; }
      `}</style>

      <div className="prose max-w-none pi05-container">
        <h1>Pi-0.5 NPU 适配 — 架构可视化</h1>
        <div className="page-meta">
          <span className="page-meta-item">📅 更新于 2026-09</span>
          <span className="page-meta-item">🏷️ 自动驾驶 · VLA · Pi-0.5 · NPU 适配</span>
        </div>
        <p style={{ color: 'var(--vp-c-text-2)', fontSize: '0.95rem', marginBottom: 8 }}>
          基于 DrivingSDK model_examples/Pi-0.5 源码分析
        </p>
        <p style={{ marginBottom: 40 }}>
          📖 源码仓库：<a href="https://gitcode.com/Ascend/DrivingSDK/blob/master/model_examples/Pi-0.5/README.md" target="_blank" rel="noopener noreferrer">https://gitcode.com/Ascend/DrivingSDK/blob/master/model_examples/Pi-0.5/README.md</a>
        </p>

        {/* ===== 1. Directory Structure ===== */}
        <section className="diagram-section">
          <h2>1. 整体目录结构</h2>
          <p className="desc">代码仓库组织方式，展示各模块的层级关系与职责划分</p>
          <svg viewBox="0 0 1000 460" role="img" aria-label="Pi-0.5 目录结构">
            <defs>
              <filter id="shadow1"><feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.08"/></filter>
            </defs>
            {/* Root */}
            <rect x="380" y="10" width="240" height="36" rx="6" fill="var(--s1)" filter="url(#shadow1)"/>
            <text x="500" y="33" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="600">model_examples/Pi-0.5</text>
            {/* Lines from root */}
            <line x1="500" y1="46" x2="500" y2="65" stroke="var(--vp-c-divider)" strokeWidth="1.5"/>
            <line x1="100" y1="65" x2="900" y2="65" stroke="var(--vp-c-divider)" strokeWidth="1.5"/>
            <line x1="100" y1="65" x2="100" y2="82" stroke="var(--vp-c-divider)" strokeWidth="1.5"/>
            <line x1="310" y1="65" x2="310" y2="82" stroke="var(--vp-c-divider)" strokeWidth="1.5"/>
            <line x1="500" y1="65" x2="500" y2="82" stroke="var(--vp-c-divider)" strokeWidth="1.5"/>
            <line x1="690" y1="65" x2="690" y2="82" stroke="var(--vp-c-divider)" strokeWidth="1.5"/>
            <line x1="880" y1="65" x2="880" y2="82" stroke="var(--vp-c-divider)" strokeWidth="1.5"/>
            {/* Level 1 nodes */}
            <rect x="10" y="82" width="180" height="32" rx="5" fill="var(--s2)" opacity="0.12"/>
            <text x="100" y="102" textAnchor="middle" fill="var(--s2)" fontSize="12" fontWeight="600">📄 README.md</text>
            <rect x="220" y="82" width="180" height="32" rx="5" fill="var(--s3)" opacity="0.12"/>
            <text x="310" y="102" textAnchor="middle" fill="var(--s3)" fontSize="12" fontWeight="600">📦 inference/</text>
            <rect x="410" y="82" width="180" height="32" rx="5" fill="var(--s4)" opacity="0.12"/>
            <text x="500" y="102" textAnchor="middle" fill="var(--s4)" fontSize="12" fontWeight="600">📦 lerobot/</text>
            <rect x="600" y="82" width="180" height="32" rx="5" fill="var(--s5)" opacity="0.12"/>
            <text x="690" y="102" textAnchor="middle" fill="var(--s5)" fontSize="12" fontWeight="600">📦 openpi/</text>
            <rect x="790" y="82" width="180" height="32" rx="5" fill="var(--s7)" opacity="0.12"/>
            <text x="880" y="102" textAnchor="middle" fill="var(--s7)" fontSize="12" fontWeight="600">📦 test/</text>
            {/* Level 2: inference */}
            <line x1="310" y1="114" x2="310" y2="130" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="160" y1="130" x2="460" y2="130" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="160" y1="130" x2="160" y2="145" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="310" y1="130" x2="310" y2="145" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="460" y1="130" x2="460" y2="145" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <rect x="70" y="145" width="180" height="28" rx="4" fill="var(--s3)" opacity="0.08"/>
            <text x="160" y="163" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">📄 README.md</text>
            <rect x="220" y="145" width="180" height="28" rx="4" fill="var(--s3)" opacity="0.08"/>
            <text x="310" y="163" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">🏗️ 推理 NPU 优化补丁</text>
            <rect x="370" y="145" width="180" height="28" rx="4" fill="var(--s3)" opacity="0.08"/>
            <text x="460" y="163" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">🧪 test/pi05_latency.py</text>
            {/* Level 2: lerobot */}
            <line x1="500" y1="114" x2="500" y2="130" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="350" y1="130" x2="650" y2="130" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="350" y1="130" x2="350" y2="145" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="500" y1="130" x2="500" y2="145" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="650" y1="130" x2="650" y2="145" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <rect x="260" y="145" width="180" height="28" rx="4" fill="var(--s4)" opacity="0.08"/>
            <text x="350" y="163" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">🏗️ pi05.patch</text>
            <rect x="410" y="145" width="180" height="28" rx="4" fill="var(--s4)" opacity="0.08"/>
            <text x="500" y="163" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">📦 src/lerobot/policies/pi05/</text>
            <rect x="560" y="145" width="180" height="28" rx="4" fill="var(--s4)" opacity="0.08"/>
            <text x="650" y="163" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">🧪 test/</text>
            {/* Level 3: pi05 core files */}
            <line x1="500" y1="173" x2="500" y2="188" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="200" y1="188" x2="800" y2="188" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="200" y1="188" x2="200" y2="200" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="350" y1="188" x2="350" y2="200" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="500" y1="188" x2="500" y2="200" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="650" y1="188" x2="650" y2="200" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="800" y1="188" x2="800" y2="200" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <rect x="110" y="200" width="180" height="28" rx="4" fill="var(--s1)" opacity="0.1"/>
            <text x="200" y="218" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11">configuration_pi05.py</text>
            <rect x="260" y="200" width="180" height="28" rx="4" fill="var(--s1)" opacity="0.1"/>
            <text x="350" y="218" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11">modeling_pi05.py</text>
            <rect x="410" y="200" width="180" height="28" rx="4" fill="var(--s1)" opacity="0.1"/>
            <text x="500" y="218" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11">processor_pi05.py</text>
            <rect x="560" y="200" width="180" height="28" rx="4" fill="var(--s3)" opacity="0.1"/>
            <text x="650" y="218" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11">🔧 vision_siglip_npu.py</text>
            <rect x="710" y="200" width="180" height="28" rx="4" fill="var(--s7)" opacity="0.1"/>
            <text x="800" y="218" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11">☸️ pi_gemma.py</text>
            {/* Level 2: test scripts */}
            <line x1="880" y1="114" x2="880" y2="130" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="790" y1="130" x2="970" y2="130" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="790" y1="130" x2="790" y2="145" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="880" y1="130" x2="880" y2="145" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <line x1="970" y1="130" x2="970" y2="145" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <rect x="700" y="145" width="180" height="28" rx="4" fill="var(--s7)" opacity="0.08"/>
            <text x="790" y="163" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">env_npu.sh</text>
            <rect x="790" y="145" width="180" height="28" rx="4" fill="var(--s7)" opacity="0.08"/>
            <text x="880" y="163" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">train_full.sh</text>
            <rect x="880" y="145" width="180" height="28" rx="4" fill="var(--s7)" opacity="0.08"/>
            <text x="970" y="163" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">train_performance.sh</text>
            {/* Legend */}
            <g transform="translate(10, 260)">
              <rect x="0" y="0" width="10" height="10" rx="2" fill="var(--s1)" opacity="0.15"/>
              <text x="16" y="9" fill="var(--vp-c-text-2)" fontSize="11">核心模型文件</text>
              <rect x="140" y="0" width="10" height="10" rx="2" fill="var(--s3)" opacity="0.15"/>
              <text x="156" y="9" fill="var(--vp-c-text-2)" fontSize="11">推理优化</text>
              <rect x="240" y="0" width="10" height="10" rx="2" fill="var(--s4)" opacity="0.15"/>
              <text x="256" y="9" fill="var(--vp-c-text-2)" fontSize="11">LeRobot 框架</text>
              <rect x="360" y="0" width="10" height="10" rx="2" fill="var(--s7)" opacity="0.15"/>
              <text x="376" y="9" fill="var(--vp-c-text-2)" fontSize="11">训练脚本</text>
            </g>
            {/* Summary box */}
            <rect x="10" y="290" width="980" height="155" rx="8" fill="var(--s1)" opacity="0.04" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="24" y="314" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">📐 三层补丁体系</text>
            <text x="24" y="336" fill="var(--vp-c-text-2)" fontSize="11">pi05.patch        → 训练适配：MindSpeed AdamW、DataLoader 参数调优、ACT attention need_weights=False</text>
            <text x="24" y="356" fill="var(--vp-c-text-2)" fontSize="11">openpi.patch      → 上游适配：torch_npu 导入、环境变量支持、数据集字段映射 v3.0</text>
            <text x="24" y="376" fill="var(--vp-c-text-2)" fontSize="11">inference/*.patch → 推理优化：QKV 融合、NPU PFA、AdaRMS 查表、TorchAir 双图编译（~2400 行核心变更）</text>
            <text x="24" y="400" fill="var(--vp-c-text-2)" fontSize="11">三层补丁修改的源码文件互不重叠，可分别安装，也可在同一官方基线上按任意顺序依次执行 git apply</text>
            <line x1="24" y1="412" x2="976" y2="412" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="24" y="432" fill="var(--vp-c-text-3)" fontSize="10">参考基线：LeRobot b954337 (训练) / b74a551 (推理) · OpenPI main · 昇腾 CANN 8.3.RC1 + TorchNPU 7.2.0</text>
          </svg>
        </section>

        {/* ===== 2. Model Architecture ===== */}
        <section className="diagram-section">
          <h2>2. 模型架构层次</h2>
          <p className="desc">Pi-0.5 双系统 VLA 模型：PI05Policy → PI05Pytorch → PaliGemmaWithExpertModel</p>
          <svg viewBox="0 0 1000 620" role="img" aria-label="Pi-0.5 模型架构">
            <defs>
              <filter id="shadow2"><feDropShadow dx="0" dy="1.5" stdDeviation="2" floodOpacity="0.1"/></filter>
              <marker id="arrowDown" markerWidth="8" markerHeight="8" refX="4" refY="8" orient="auto">
                <path d="M0,0 L4,8 L8,0" fill="var(--vp-c-text-3)"/>
              </marker>
            </defs>
            {/* Layer 1: PI05Policy */}
            <rect x="250" y="10" width="500" height="50" rx="10" fill="var(--s1)" filter="url(#shadow2)"/>
            <text x="500" y="32" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">PI05Policy</text>
            <text x="500" y="50" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="11">入口层：图像预处理 · token 化 · 动作采样</text>
            <line x1="500" y1="60" x2="500" y2="85" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowDown)"/>
            {/* Layer 2: PI05Pytorch */}
            <rect x="200" y="90" width="600" height="50" rx="10" fill="var(--seq-400)" filter="url(#shadow2)"/>
            <text x="500" y="112" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">PI05Pytorch</text>
            <text x="500" y="130" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="11">核心模型层：flow-matching 动作采样 · denoise 循环 · 推理优化</text>
            <line x1="500" y1="140" x2="500" y2="165" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowDown)"/>
            {/* Layer 3: PaliGemmaWithExpertModel (dual tower) */}
            <rect x="50" y="170" width="900" height="130" rx="10" fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)" strokeWidth="1.5" filter="url(#shadow2)"/>
            <text x="500" y="194" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="14" fontWeight="700">PaliGemmaWithExpertModel</text>
            <text x="500" y="212" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">双塔模型：Paligemma 主干 + Action Expert 专家</text>
            {/* Left tower: Paligemma */}
            <rect x="65" y="226" width="420" height="62" rx="8" fill="var(--s3)" opacity="0.08" stroke="var(--s3)" strokeOpacity="0.2" strokeWidth="1"/>
            <text x="275" y="248" textAnchor="middle" fill="var(--s3)" fontSize="12" fontWeight="600">🏗️ Paligemma (Prefix)</text>
            <text x="275" y="268" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">SigLIP Vision Tower → MultiModal Projector → Gemma Language Model</text>
            {/* Right tower: Action Expert */}
            <rect x="515" y="226" width="420" height="62" rx="8" fill="var(--s2)" opacity="0.08" stroke="var(--s2)" strokeOpacity="0.2" strokeWidth="1"/>
            <text x="725" y="248" textAnchor="middle" fill="var(--s2)" fontSize="12" fontWeight="600">⚡ Gemma Action Expert (Denoise)</text>
            <text x="725" y="268" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">input_layernorm (AdaRMS) → self_attn (QKV+PFA) → post_attention (AdaRMS) → mlp</text>
            <line x1="485" y1="257" x2="510" y2="257" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowDown)"/>
            <line x1="500" y1="300" x2="500" y2="325" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowDown)"/>
            {/* Detailed Layer 4: Components */}
            <text x="500" y="348" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11">核心组件展开</text>
            <rect x="30" y="358" width="220" height="80" rx="7" fill="var(--s1)" opacity="0.06" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="140" y="380" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">SigLIP Vision</text>
            <text x="140" y="398" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">Patch Embedding</text>
            <text x="140" y="414" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">ViT Encoder</text>
            <text x="140" y="430" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">Attention Pooling</text>
            <rect x="270" y="358" width="220" height="80" rx="7" fill="var(--s3)" opacity="0.06" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="380" y="380" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">MultiModal Projector</text>
            <text x="380" y="398" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">视觉特征 → 语言空间</text>
            <text x="380" y="414" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">线性投影</text>
            <rect x="510" y="358" width="220" height="80" rx="7" fill="var(--s7)" opacity="0.06" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="620" y="380" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">Gemma Language</text>
            <text x="620" y="398" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">Prefix Prefill</text>
            <text x="620" y="414" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">Causal Self-Attention</text>
            <text x="620" y="430" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">RMSNorm</text>
            <rect x="750" y="358" width="220" height="80" rx="7" fill="var(--s2)" opacity="0.06" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="860" y="380" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">Action Expert</text>
            <text x="860" y="398" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">AdaRMS 条件调制</text>
            <text x="860" y="414" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">QKV Self-Attention</text>
            <text x="860" y="430" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">Flow-Matching Denoise</text>
            {/* Flow arrows */}
            <line x1="250" y1="398" x2="265" y2="398" stroke="var(--vp-c-text-3)" strokeWidth="1" markerEnd="url(#arrowDown)"/>
            <line x1="490" y1="398" x2="505" y2="398" stroke="var(--vp-c-text-3)" strokeWidth="1" markerEnd="url(#arrowDown)"/>
            <line x1="730" y1="398" x2="745" y2="398" stroke="var(--vp-c-text-3)" strokeWidth="1" markerEnd="url(#arrowDown)"/>
            {/* Pi0 vs Pi0.5 comparison */}
            <g transform="translate(30, 458)">
              <rect x="0" y="0" width="940" height="145" rx="8" fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)" strokeWidth="1"/>
              <text x="20" y="24" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">π0 vs π0.5 关键差异</text>
              {/* Table header */}
              <rect x="20" y="36" width="140" height="26" fill="var(--seq-250)" opacity="0.15"/>
              <text x="90" y="54" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">特性</text>
              <rect x="160" y="36" width="390" height="26" fill="var(--s1)" opacity="0.06"/>
              <text x="355" y="54" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">π0</text>
              <rect x="550" y="36" width="370" height="26" fill="var(--s2)" opacity="0.06"/>
              <text x="735" y="54" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">π0.5</text>
              <text x="90" y="80" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">时间条件</text>
              <text x="355" y="80" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">action_time_mlp_* 拼接</text>
              <text x="735" y="80" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">time_mlp_* AdaRMS 条件调制</text>
              <text x="90" y="100" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">AdaRMS</text>
              <text x="355" y="100" textAnchor="middle" fill="var(--s8)" fontSize="10">不使用</text>
              <text x="735" y="100" textAnchor="middle" fill="var(--s3)" fontSize="10">Action Expert 使用</text>
              <text x="90" y="120" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">Tokenizer 长度</text>
              <text x="355" y="120" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">48 tokens</text>
              <text x="735" y="120" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">200 tokens</text>
              <text x="90" y="140" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">参数数量</text>
              <text x="355" y="140" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">更高 (含 state embedding)</text>
              <text x="735" y="140" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">更低 (无 state embedding)</text>
            </g>
          </svg>
        </section>

        {/* ===== 3. Inference Flow ===== */}
        <section className="diagram-section">
          <h2>3. 推理路径决策树</h2>
          <p className="desc">sample_actions() 入口如何根据运行时条件选择最优推理路径</p>
          <svg viewBox="0 0 1000 520" role="img" aria-label="推理路径决策树">
            <defs>
              <filter id="shadow3"><feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.08"/></filter>
              <marker id="arrowFlow" markerWidth="8" markerHeight="8" refX="4" refY="8" orient="auto">
                <path d="M0,0 L4,8 L8,0" fill="var(--s1)"/>
              </marker>
            </defs>
            {/* Entry */}
            <rect x="350" y="10" width="300" height="40" rx="20" fill="var(--s1)" filter="url(#shadow3)"/>
            <text x="500" y="36" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">sample_actions()</text>
            <line x1="500" y1="50" x2="500" y2="75" stroke="var(--s1)" strokeWidth="1.5" markerEnd="url(#arrowFlow)"/>
            {/* Decision 1 */}
            <polygon points="500,78 620,115 500,152 380,115" fill="var(--s4)" opacity="0.12" stroke="var(--s4)" strokeWidth="1.5"/>
            <text x="500" y="112" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">RTC 参数?</text>
            <text x="500" y="127" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">动态参数存在?</text>
            {/* Yes branch */}
            <line x1="620" y1="115" x2="820" y2="115" stroke="var(--s4)" strokeWidth="1.5" markerEnd="url(#arrowFlow)"/>
            <text x="720" y="108" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">Yes</text>
            <rect x="825" y="95" width="155" height="40" rx="8" fill="var(--s4)" opacity="0.08" stroke="var(--s4)" strokeWidth="1"/>
            <text x="902" y="112" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11" fontWeight="600">原生 eager 路径</text>
            <text x="902" y="128" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="10">标准 transformer forward</text>
            {/* No branch */}
            <line x1="500" y1="152" x2="500" y2="175" stroke="var(--s1)" strokeWidth="1.5" markerEnd="url(#arrowFlow)"/>
            <text x="515" y="168" fill="var(--vp-c-text-2)" fontSize="10">No</text>
            {/* Decision 2 */}
            <polygon points="500,178 620,215 500,252 380,215" fill="var(--s3)" opacity="0.12" stroke="var(--s3)" strokeWidth="1.5"/>
            <text x="500" y="212" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">图编译启用?</text>
            <text x="500" y="227" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">compile_inference_graph</text>
            {/* Yes: Graph compile */}
            <line x1="620" y1="215" x2="820" y2="215" stroke="var(--s3)" strokeWidth="1.5" markerEnd="url(#arrowFlow)"/>
            <text x="720" y="208" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">Yes</text>
            <rect x="825" y="195" width="155" height="40" rx="8" fill="var(--s3)" opacity="0.08" stroke="var(--s3)" strokeWidth="1"/>
            <text x="902" y="212" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">TorchAir 双图</text>
            <text x="902" y="228" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="10">prefix + denoise 10步</text>
            {/* No: continue */}
            <line x1="500" y1="252" x2="500" y2="275" stroke="var(--s1)" strokeWidth="1.5" markerEnd="url(#arrowFlow)"/>
            <text x="515" y="268" fill="var(--vp-c-text-2)" fontSize="10">No</text>
            {/* Decision 3 */}
            <polygon points="500,278 620,315 500,352 380,315" fill="var(--s2)" opacity="0.12" stroke="var(--s2)" strokeWidth="1.5"/>
            <text x="500" y="312" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">NPU 融合条件?</text>
            <text x="500" y="327" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">eval + NPU + QKV fused</text>
            {/* Yes: NPU optimized */}
            <line x1="620" y1="315" x2="820" y2="315" stroke="var(--s2)" strokeWidth="1.5" markerEnd="url(#arrowFlow)"/>
            <text x="720" y="308" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">Yes</text>
            <rect x="825" y="295" width="155" height="40" rx="8" fill="var(--s2)" opacity="0.08" stroke="var(--s2)" strokeWidth="1"/>
            <text x="902" y="312" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">NPU 融合路径</text>
            <text x="902" y="328" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="10">_forward_npu_optimized</text>
            {/* No: fallback */}
            <line x1="500" y1="352" x2="500" y2="375" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowFlow)"/>
            <text x="515" y="368" fill="var(--vp-c-text-2)" fontSize="10">No</text>
            <rect x="385" y="378" width="230" height="40" rx="8" fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="500" y="396" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="11" fontWeight="600">原生 eager 路径 (fallback)</text>
            <text x="500" y="412" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="10">标准 transformer forward</text>
            {/* Detail boxes */}
            <g transform="translate(10, 440)">
              <rect x="0" y="0" width="980" height="70" rx="8" fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)" strokeWidth="1"/>
              <text x="20" y="22" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">路径说明</text>
              <text x="20" y="42" fill="var(--vp-c-text-2)" fontSize="10">
                <tspan fill="var(--s4)" fontWeight="600">RTC 路径</tspan><tspan fill="var(--vp-c-text-2)">：动态参数（实时控制）场景，走原生 eager 保持灵活性</tspan>
              </text>
              <text x="20" y="58" fill="var(--vp-c-text-2)" fontSize="10">
                <tspan fill="var(--s3)" fontWeight="600">双图路径</tspan><tspan fill="var(--vp-c-text-2)">：TorchAir 编译 prefix + 固定 10 步 denoise 为两张图，极致推理性能</tspan>
              </text>
              <text x="500" y="42" fill="var(--vp-c-text-2)" fontSize="10">
                <tspan fill="var(--s2)" fontWeight="600">NPU 融合路径</tspan><tspan fill="var(--vp-c-text-2)">：QKV 融合 + PFA + NPU RoPE/RMSNorm，不依赖编译的 eager 融合</tspan>
              </text>
              <text x="500" y="58" fill="var(--vp-c-text-2)" fontSize="10">
                <tspan fill="var(--vp-c-text-3)" fontWeight="600">Fallback</tspan><tspan fill="var(--vp-c-text-2)">：CPU/CUDA 或非推理场景，走标准 transformers 路径</tspan>
              </text>
            </g>
          </svg>
        </section>

        {/* ===== 4. Three-Layer Patch System ===== */}
        <section className="diagram-section">
          <h2>4. 三层补丁体系</h2>
          <p className="desc">三个独立 patch 文件，修改互不重叠，可任意顺序安装</p>
          <svg viewBox="0 0 1000 360" role="img" aria-label="三层补丁体系">
            <defs>
              <filter id="shadow4"><feDropShadow dx="0" dy="1.5" stdDeviation="2" floodOpacity="0.08"/></filter>
            </defs>
            {/* Layer 1: Training */}
            <rect x="30" y="15" width="300" height="200" rx="10" fill="var(--s1)" opacity="0.06" stroke="var(--s1)" strokeWidth="1.5" filter="url(#shadow4)"/>
            <rect x="30" y="15" width="300" height="36" rx="10" fill="var(--s1)" opacity="0.15"/>
            <text x="180" y="38" textAnchor="middle" fill="var(--s1)" fontSize="14" fontWeight="700">🏋️ 训练适配</text>
            <text x="50" y="68" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">pi05.patch</text>
            <text x="50" y="88" fill="var(--vp-c-text-2)" fontSize="10">📄 configs/train.py</text>
            <text x="60" y="104" fill="var(--vp-c-text-3)" fontSize="9">num_workers 4→12</text>
            <text x="50" y="124" fill="var(--vp-c-text-2)" fontSize="10">📄 optim/optimizers.py</text>
            <text x="60" y="140" fill="var(--vp-c-text-3)" fontSize="9">AdamW → MindSpeed AdamW</text>
            <text x="60" y="154" fill="var(--vp-c-text-3)" fontSize="9">tensor 序列化修复</text>
            <text x="50" y="174" fill="var(--vp-c-text-2)" fontSize="10">📄 policies/act/modeling_act.py</text>
            <text x="60" y="190" fill="var(--vp-c-text-3)" fontSize="9">need_weights=False</text>
            <text x="50" y="210" fill="var(--vp-c-text-2)" fontSize="10">📄 scripts/lerobot_train.py</text>
            <text x="60" y="226" fill="var(--vp-c-text-3)" fontSize="9">torch_npu + DataLoader 优化</text>
            {/* Layer 2: OpenPI */}
            <rect x="350" y="15" width="300" height="200" rx="10" fill="var(--s3)" opacity="0.06" stroke="var(--s3)" strokeWidth="1.5" filter="url(#shadow4)"/>
            <rect x="350" y="15" width="300" height="36" rx="10" fill="var(--s3)" opacity="0.15"/>
            <text x="500" y="38" textAnchor="middle" fill="var(--s3)" fontSize="14" fontWeight="700">🔗 上游适配</text>
            <text x="370" y="68" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">openpi.patch</text>
            <text x="370" y="88" fill="var(--vp-c-text-2)" fontSize="10">📄 scripts/train_pytorch.py</text>
            <text x="380" y="104" fill="var(--vp-c-text-3)" fontSize="9">torch_npu + transfer_to_npu</text>
            <text x="370" y="124" fill="var(--vp-c-text-2)" fontSize="10">📄 models/tokenizer.py</text>
            <text x="380" y="140" fill="var(--vp-c-text-3)" fontSize="9">PALIGEMMA_TOKENIZER_PATH</text>
            <text x="370" y="160" fill="var(--vp-c-text-2)" fontSize="10">📄 training/config.py</text>
            <text x="380" y="176" fill="var(--vp-c-text-3)" fontSize="9">数据集字段映射 v3.0</text>
            <text x="380" y="190" fill="var(--vp-c-text-3)" fontSize="9">环境变量支持</text>
            <text x="370" y="210" fill="var(--vp-c-text-2)" fontSize="10">📄 training/data_loader.py</text>
            <text x="380" y="226" fill="var(--vp-c-text-3)" fontSize="9">导入路径适配</text>
            {/* Layer 3: Inference */}
            <rect x="670" y="15" width="300" height="200" rx="10" fill="var(--s2)" opacity="0.06" stroke="var(--s2)" strokeWidth="1.5" filter="url(#shadow4)"/>
            <rect x="670" y="15" width="300" height="36" rx="10" fill="var(--s2)" opacity="0.15"/>
            <text x="820" y="38" textAnchor="middle" fill="var(--s2)" fontSize="14" fontWeight="700">⚡ 推理优化</text>
            <text x="690" y="68" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">inference/*.patch</text>
            <text x="690" y="88" fill="var(--vp-c-text-2)" fontSize="10">📄 policies/factory.py</text>
            <text x="700" y="104" fill="var(--vp-c-text-3)" fontSize="9">推理准备入口</text>
            <text x="690" y="124" fill="var(--vp-c-text-2)" fontSize="10">📄 pi05/configuration_pi05.py</text>
            <text x="700" y="140" fill="var(--vp-c-text-3)" fontSize="9">图编译配置项</text>
            <text x="690" y="160" fill="var(--vp-c-text-2)" fontSize="10">📄 pi05/modeling_pi05.py</text>
            <text x="700" y="176" fill="var(--vp-c-text-3)" fontSize="9">核心 NPU 推理优化 (~1800行)</text>
            <text x="690" y="196" fill="var(--vp-c-text-2)" fontSize="10">🆕 pi05/vision_siglip_npu.py</text>
            <text x="700" y="212" fill="var(--vp-c-text-3)" fontSize="9">NPU 视觉塔 (~370行)</text>
            <text x="690" y="232" fill="var(--vp-c-text-2)" fontSize="10">📄 pi_gemma.py</text>
            <text x="700" y="248" fill="var(--vp-c-text-3)" fontSize="9">dtype 对齐修复</text>
            {/* Bottom: unified note */}
            <rect x="30" y="235" width="940" height="50" rx="8" fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="500" y="258" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">🔑 设计原则：训练保精度，推理求极致</text>
            <text x="500" y="276" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">训练路径最小侵入（仅替换优化器和 DataLoader 参数）· 推理路径深度优化（算子融合 + 图编译 + 查找表）</text>
            {/* Software stack */}
            <rect x="30" y="300" width="940" height="50" rx="8" fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="500" y="320" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">📦 软件依赖链</text>
            <text x="500" y="340" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">CANN 8.3.RC1 → TorchNPU 7.2.0 → PyTorch 2.7.1 → MindSpeed → transformers (fix/lerobot_openpi) → LeRobot 0.5.2 → OpenPI</text>
          </svg>
        </section>

        {/* ===== 5. NPU Optimization Pipeline ===== */}
        <section className="diagram-section">
          <h2>5. NPU 推理优化管线</h2>
          <p className="desc">从原始模型到极致推理性能的完整优化链路</p>
          <svg viewBox="0 0 1000 560" role="img" aria-label="NPU 优化管线">
            <defs>
              <filter id="shadow5"><feDropShadow dx="0" dy="1.5" stdDeviation="2" floodOpacity="0.08"/></filter>
              <marker id="arrowPipe" markerWidth="8" markerHeight="8" refX="4" refY="8" orient="auto">
                <path d="M0,0 L4,8 L8,0" fill="var(--s1)"/>
              </marker>
            </defs>
            {/* Stage 1: Weight Loading */}
            <rect x="30" y="20" width="180" height="100" rx="10" fill="var(--s1)" opacity="0.06" stroke="var(--s1)" strokeWidth="1.5" filter="url(#shadow5)"/>
            <text x="120" y="48" textAnchor="middle" fill="var(--s1)" fontSize="12" fontWeight="700">1️⃣ 权重加载</text>
            <text x="120" y="68" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">PI05Policy.from_pretrained()</text>
            <text x="120" y="84" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">加载 SigLIP + Gemma</text>
            <text x="120" y="100" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">检查点权重</text>
            <line x1="210" y1="70" x2="245" y2="70" stroke="var(--s1)" strokeWidth="1.5" markerEnd="url(#arrowPipe)"/>
            {/* Stage 2: Device Placement */}
            <rect x="250" y="20" width="180" height="100" rx="10" fill="var(--s3)" opacity="0.06" stroke="var(--s3)" strokeWidth="1.5" filter="url(#shadow5)"/>
            <text x="340" y="48" textAnchor="middle" fill="var(--s3)" fontSize="12" fontWeight="700">2️⃣ 设备放置</text>
            <text x="340" y="68" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">policy.to(device)</text>
            <text x="340" y="84" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">移动到 NPU 设备</text>
            <text x="340" y="100" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">确定推理 dtype</text>
            <line x1="430" y1="70" x2="465" y2="70" stroke="var(--s1)" strokeWidth="1.5" markerEnd="url(#arrowPipe)"/>
            {/* Stage 3: Prepare Optimizations */}
            <rect x="470" y="20" width="180" height="100" rx="10" fill="var(--s2)" opacity="0.06" stroke="var(--s2)" strokeWidth="1.5" filter="url(#shadow5)"/>
            <text x="560" y="48" textAnchor="middle" fill="var(--s2)" fontSize="12" fontWeight="700">3️⃣ 优化准备</text>
            <text x="560" y="68" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">prepare_inference_optimizations()</text>
            <text x="560" y="84" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">精度统一 + QKV 融合</text>
            <text x="560" y="100" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">视觉塔替换 + 图编译</text>
            <line x1="650" y1="70" x2="685" y2="70" stroke="var(--s1)" strokeWidth="1.5" markerEnd="url(#arrowPipe)"/>
            {/* Stage 4: Inference */}
            <rect x="690" y="20" width="280" height="100" rx="10" fill="var(--s5)" opacity="0.06" stroke="var(--s5)" strokeWidth="1.5" filter="url(#shadow5)"/>
            <text x="830" y="48" textAnchor="middle" fill="var(--s5)" fontSize="12" fontWeight="700">4️⃣ 推理执行</text>
            <text x="830" y="68" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">predict_action_chunk()</text>
            <text x="830" y="84" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">eager 融合 / TorchAir 双图</text>
            <text x="830" y="100" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">→ 动作预测输出</text>
            {/* Optimization detail sections */}
            <line x1="500" y1="120" x2="500" y2="140" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="500" y="158" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="13" fontWeight="600">优化技术栈展开</text>
            {/* Row 1: QKV Fusion + Vision PFA */}
            <rect x="30" y="172" width="460" height="115" rx="8" fill="var(--s1)" opacity="0.04" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="48" y="196" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">🔗 QKV 权重融合</text>
            <text x="48" y="216" fill="var(--vp-c-text-2)" fontSize="10">• Paligemma LM + Gemma Expert 每层 attention 的 q_proj/k_proj/v_proj 合并为单一 qkv Linear</text>
            <text x="48" y="232" fill="var(--vp-c-text-2)" fontSize="10">• 视觉塔 SigLIP 的 q_proj/k_proj/v_proj 同样合并为 qkv Linear</text>
            <text x="48" y="248" fill="var(--vp-c-text-2)" fontSize="10">• 效果：每个 attention 层从 3 次 Linear call → 1 次 Linear + split</text>
            <text x="48" y="268" fill="var(--vp-c-text-3)" fontSize="10">实现：fuse_qkv_weights() — torch.cat([q.weight, k.weight, v.weight], dim=0) → nn.Linear</text>
            <rect x="510" y="172" width="460" height="115" rx="8" fill="var(--s3)" opacity="0.04" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="528" y="196" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">👁️ 视觉塔 NPU PFA</text>
            <text x="528" y="216" fill="var(--vp-c-text-2)" fontSize="10">• 替换 transformers SigLIP 为 PI05SiglipVisionModel</text>
            <text x="528" y="232" fill="var(--vp-c-text-2)" fontSize="10">• Q/K/V 强制转为 FP16 后调用 npu_prompt_flash_attention</text>
            <text x="528" y="248" fill="var(--vp-c-text-2)" fontSize="10">• 输出在 out_proj 前恢复视觉塔原始 dtype</text>
            <text x="528" y="268" fill="var(--vp-c-text-3)" fontSize="10">环境变量：LEROBOT_PI05_ENABLE_VISION_NPU_PFA</text>
            {/* Row 2: NPU Fused Operators */}
            <rect x="30" y="300" width="460" height="115" rx="8" fill="var(--s2)" opacity="0.04" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="48" y="324" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">⚡ NPU 融合算子替换</text>
            <text x="48" y="344" fill="var(--vp-c-text-2)" fontSize="10">• self-attention → npu_prompt_flash_attention (BSND layout, int8 blocked mask)</text>
            <text x="48" y="360" fill="var(--vp-c-text-2)" fontSize="10">• RoPE → npu_rotary_mul (q/k 合并后一次调用)</text>
            <text x="48" y="376" fill="var(--vp-c-text-2)" fontSize="10">• RMSNorm → npu_rms_norm (融合归一化)</text>
            <text x="48" y="392" fill="var(--vp-c-text-2)" fontSize="10">• 残差连接 → npu_add_rms_norm (加法和归一化融合)</text>
            <text x="48" y="408" fill="var(--vp-c-text-3)" fontSize="10">实现：_forward_npu_optimized() — 逐层循环，单次 QKV 投影 + NPU 融合算子</text>
            <rect x="510" y="300" width="460" height="115" rx="8" fill="var(--s5)" opacity="0.04" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="528" y="324" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">📐 AdaRMS 融合调制</text>
            <text x="528" y="344" fill="var(--vp-c-text-2)" fontSize="10">• 将 dense(cond) 输出的 scale 融入 npu_rms_norm 的 gamma 参数</text>
            <text x="528" y="360" fill="var(--vp-c-text-2)" fontSize="10">• 1+scale 作为 RMSNorm weight，同时完成归一化和缩放</text>
            <text x="528" y="376" fill="var(--vp-c-text-2)" fontSize="10">• 减少一次逐元素乘法的 kernel launch 开销</text>
            <text x="528" y="392" fill="var(--vp-c-text-3)" fontSize="10">实现：_npu_adarms_layernorm() → dynamic_weight = scale_weight.to(dtype)</text>
            {/* Row 3: Precomputed tables + Graph compile */}
            <rect x="30" y="428" width="460" height="115" rx="8" fill="var(--s7)" opacity="0.04" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="48" y="452" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">📊 固定 10 步 Denoise 查找表</text>
            <text x="48" y="472" fill="var(--vp-c-text-2)" fontSize="10">• 预计算 10 步 timestep 表 (1.0 - i/10)</text>
            <text x="48" y="488" fill="var(--vp-c-text-2)" fontSize="10">• 预计算 10 步 AdaRMS condition 表 (time_mlp → silu)</text>
            <text x="48" y="504" fill="var(--vp-c-text-2)" fontSize="10">• 预计算 scale/shift/gate 调制表 (per-step, per-layer 独立 buffer)</text>
            <text x="48" y="520" fill="var(--vp-c-text-2)" fontSize="10">• 尺度优化：scale 存为 1D 1+scale、shift/gate 存为广播形状 [1,1,hidden]</text>
            <text x="48" y="536" fill="var(--vp-c-text-3)" fontSize="10">目的：图编译路径跳过每层 dense(cond) 计算，减少 GatherV2 操作</text>
            <rect x="510" y="428" width="460" height="115" rx="8" fill="var(--s3)" opacity="0.04" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="528" y="452" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">🖥️ TorchAir 双图编译</text>
            <text x="528" y="472" fill="var(--vp-c-text-2)" fontSize="10">• Prefix 图：images+tokens → embed → prefill → KV cache</text>
            <text x="528" y="488" fill="var(--vp-c-text-2)" fontSize="10">• Denoise 图：noise + KV cache + 查表 → 10步 Euler 积分 → action</text>
            <text x="528" y="504" fill="var(--vp-c-text-2)" fontSize="10">• Graph-safe 补丁：Linear 展开、attention bmm 替代、RoPE 重写</text>
            <text x="528" y="520" fill="var(--vp-c-text-2)" fontSize="10">• 编译选项：frozen_parameter + tiling_schedule_optimize</text>
            <text x="528" y="536" fill="var(--vp-c-text-3)" fontSize="10">后端：torchair (默认) / npugraph_ex / inductor</text>
          </svg>
        </section>

        {/* ===== 6. 业务架构图 ===== */}
        <section className="diagram-section">
          <h2>6. 业务架构总览</h2>
          <p className="desc">从昇腾适配视角看 Pi-0.5 的完整业务架构：训练 + 推理两条 pipeline，三层补丁解耦</p>
          <svg viewBox="0 0 1000 650" role="img" aria-label="Pi-0.5 业务架构">
            <defs>
              <filter id="shadowB"><feDropShadow dx="0" dy="1.5" stdDeviation="2" floodOpacity="0.08"/></filter>
              <marker id="arrowB" markerWidth="8" markerHeight="8" refX="4" refY="8" orient="auto">
                <path d="M0,0 L4,8 L8,0" fill="var(--s1)"/>
              </marker>
            </defs>

            {/* Title */}
            <text x="500" y="24" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="15" fontWeight="700">Pi-0.5 昇腾适配 — 业务架构总览</text>

            {/* Left: 训练 Pipeline */}
            <rect x="20" y="42" width="460" height="290" rx="10" fill="var(--s1)" opacity="0.04" stroke="var(--s1)" strokeWidth="1.5" filter="url(#shadowB)"/>
            <rect x="20" y="42" width="460" height="32" rx="10" fill="var(--s1)" opacity="0.12"/>
            <text x="250" y="63" textAnchor="middle" fill="var(--s1)" fontSize="13" fontWeight="700">🏋️ 训练 Pipeline (A3 单机8卡)</text>

            {/* Training flow */}
            <rect x="45" y="88" width="185" height="40" rx="6" fill="var(--s1)" opacity="0.08" stroke="var(--s1)" strokeWidth="1"/>
            <text x="137" y="106" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">koch_test 数据集</text>
            <text x="137" y="120" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">v2.1 → v3.0 格式转换</text>

            <line x1="230" y1="108" x2="255" y2="108" stroke="var(--s1)" strokeWidth="1.5" markerEnd="url(#arrowB)"/>

            <rect x="260" y="88" width="195" height="40" rx="6" fill="var(--s1)" opacity="0.08" stroke="var(--s1)" strokeWidth="1"/>
            <text x="357" y="106" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">LeRobot DataLoader</text>
            <text x="357" y="120" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">num_workers=12, prefetch=4</text>

            <line x1="357" y1="128" x2="357" y2="148" stroke="var(--s1)" strokeWidth="1.5" markerEnd="url(#arrowB)"/>

            <rect x="45" y="153" width="410" height="40" rx="6" fill="var(--s3)" opacity="0.08" stroke="var(--s3)" strokeWidth="1"/>
            <text x="250" y="171" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">PI05Policy (train mode)</text>
            <text x="250" y="185" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">flow-matching denoise · MindSpeed AdamW optimizer · bf16 mixed precision</text>

            <line x1="250" y1="193" x2="250" y2="213" stroke="var(--s1)" strokeWidth="1.5" markerEnd="url(#arrowB)"/>

            <rect x="45" y="218" width="410" height="40" rx="6" fill="var(--s2)" opacity="0.08" stroke="var(--s2)" strokeWidth="1"/>
            <text x="250" y="236" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">Accelerator (8× NPU DDP)</text>
            <text x="250" y="250" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">gradient accumulation · accelerator.backward · optimizer.step</text>

            <line x1="250" y1="258" x2="250" y2="278" stroke="var(--s1)" strokeWidth="1.5" markerEnd="url(#arrowB)"/>

            <rect x="45" y="283" width="410" height="36" rx="6" fill="var(--s7)" opacity="0.08" stroke="var(--s7)" strokeWidth="1"/>
            <text x="250" y="305" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">📊 训练结果: 30k steps · loss=0.004 · FPS=155.1 (Atlas 800T A3)</text>

            {/* pi05.patch annotations */}
            <rect x="485" y="88" width="120" height="22" rx="4" fill="var(--s1)" opacity="0.15"/>
            <text x="545" y="103" textAnchor="middle" fill="var(--s1)" fontSize="10" fontWeight="600">pi05.patch</text>
            <line x1="485" y1="99" x2="460" y2="99" stroke="var(--s1)" strokeWidth="1" strokeDasharray="4,3"/>

            {/* Right: 推理 Pipeline */}
            <rect x="520" y="42" width="460" height="290" rx="10" fill="var(--s2)" opacity="0.04" stroke="var(--s2)" strokeWidth="1.5" filter="url(#shadowB)"/>
            <rect x="520" y="42" width="460" height="32" rx="10" fill="var(--s2)" opacity="0.12"/>
            <text x="750" y="63" textAnchor="middle" fill="var(--s2)" fontSize="13" fontWeight="700">⚡ 推理 Pipeline (NPU 优化)</text>

            <rect x="545" y="88" width="185" height="40" rx="6" fill="var(--s2)" opacity="0.08" stroke="var(--s2)" strokeWidth="1"/>
            <text x="637" y="106" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">PI05Policy.from_pretrained()</text>
            <text x="637" y="120" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">加载 SigLIP + Gemma 权重</text>

            <line x1="730" y1="108" x2="755" y2="108" stroke="var(--s2)" strokeWidth="1.5" markerEnd="url(#arrowB)"/>

            <rect x="760" y="88" width="195" height="40" rx="6" fill="var(--s2)" opacity="0.08" stroke="var(--s2)" strokeWidth="1"/>
            <text x="857" y="106" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">policy.to(npu:0)</text>
            <text x="857" y="120" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">bf16 精度对齐</text>

            <line x1="750" y1="128" x2="750" y2="148" stroke="var(--s2)" strokeWidth="1.5" markerEnd="url(#arrowB)"/>

            <rect x="545" y="153" width="410" height="40" rx="6" fill="var(--s3)" opacity="0.08" stroke="var(--s3)" strokeWidth="1"/>
            <text x="750" y="171" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">prepare_inference_optimizations()</text>
            <text x="750" y="185" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">QKV融合 · 视觉塔替换 · 图编译 · 10步查表预计算</text>

            <line x1="750" y1="193" x2="750" y2="213" stroke="var(--s2)" strokeWidth="1.5" markerEnd="url(#arrowB)"/>

            <rect x="545" y="218" width="195" height="52" rx="6" fill="var(--s5)" opacity="0.08" stroke="var(--s5)" strokeWidth="1"/>
            <text x="642" y="238" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">Eager 融合路径</text>
            <text x="642" y="254" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">_forward_npu_optimized</text>
            <text x="642" y="266" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">QKV + PFA + AdaRMS</text>

            <rect x="760" y="218" width="195" height="52" rx="6" fill="var(--s3)" opacity="0.08" stroke="var(--s3)" strokeWidth="1"/>
            <text x="857" y="238" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">TorchAir 双图</text>
            <text x="857" y="254" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">prefix + denoise 10步</text>
            <text x="857" y="266" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">frozen_parameter</text>

            <line x1="750" y1="270" x2="750" y2="290" stroke="var(--s2)" strokeWidth="1.5" markerEnd="url(#arrowB)"/>

            <rect x="545" y="295" width="410" height="30" rx="6" fill="var(--s7)" opacity="0.08" stroke="var(--s7)" strokeWidth="1"/>
            <text x="750" y="314" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="11" fontWeight="600">📊 pi05_latency.py 时延测试: e2e + model.sample_actions</text>

            {/* inference patch annotations */}
            <rect x="485" y="153" width="120" height="22" rx="4" fill="var(--s2)" opacity="0.15"/>
            <text x="545" y="168" textAnchor="middle" fill="var(--s2)" fontSize="10" fontWeight="600">inference/*.patch</text>
            <line x1="485" y1="164" x2="460" y2="164" stroke="var(--s2)" strokeWidth="1" strokeDasharray="4,3"/>

            {/* Bottom: 软件栈 */}
            <rect x="20" y="350" width="960" height="80" rx="8" fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="40" y="374" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">📦 Pi-0.5 昇腾适配软件栈</text>

            {/* Stack layers */}
            <rect x="40" y="390" width="130" height="26" rx="5" fill="var(--s1)" opacity="0.12"/>
            <text x="105" y="408" textAnchor="middle" fill="var(--s1)" fontSize="10" fontWeight="600">CANN 8.3.RC1</text>
            <text x="185" y="408" fill="var(--vp-c-text-3)" fontSize="16">→</text>
            <rect x="200" y="390" width="110" height="26" rx="5" fill="var(--s2)" opacity="0.12"/>
            <text x="255" y="408" textAnchor="middle" fill="var(--s2)" fontSize="10" fontWeight="600">TorchNPU 7.2.0</text>
            <text x="325" y="408" fill="var(--vp-c-text-3)" fontSize="16">→</text>
            <rect x="340" y="390" width="100" height="26" rx="5" fill="var(--s3)" opacity="0.12"/>
            <text x="390" y="408" textAnchor="middle" fill="var(--s3)" fontSize="10" fontWeight="600">PyTorch 2.7.1</text>
            <text x="455" y="408" fill="var(--vp-c-text-3)" fontSize="16">→</text>
            <rect x="470" y="390" width="100" height="26" rx="5" fill="var(--s4)" opacity="0.12"/>
            <text x="520" y="408" textAnchor="middle" fill="var(--s4)" fontSize="10" fontWeight="600">MindSpeed</text>
            <text x="585" y="408" fill="var(--vp-c-text-3)" fontSize="16">→</text>
            <rect x="600" y="390" width="110" height="26" rx="5" fill="var(--s5)" opacity="0.12"/>
            <text x="655" y="408" textAnchor="middle" fill="var(--s5)" fontSize="10" fontWeight="600">transformers</text>
            <text x="725" y="408" fill="var(--vp-c-text-3)" fontSize="16">→</text>
            <rect x="740" y="390" width="100" height="26" rx="5" fill="var(--s7)" opacity="0.12"/>
            <text x="790" y="408" textAnchor="middle" fill="var(--s7)" fontSize="10" fontWeight="600">LeRobot 0.5.2</text>
            <text x="855" y="408" fill="var(--vp-c-text-3)" fontSize="16">→</text>
            <rect x="870" y="390" width="90" height="26" rx="5" fill="var(--s8)" opacity="0.12"/>
            <text x="915" y="408" textAnchor="middle" fill="var(--s8)" fontSize="10" fontWeight="600">OpenPI</text>

            {/* Bottom: 三层补丁关系 */}
            <rect x="20" y="448" width="960" height="190" rx="8" fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="40" y="472" fill="var(--vp-c-text-1)" fontSize="12" fontWeight="600">🔗 三层补丁解耦架构</text>

            <rect x="40" y="488" width="280" height="135" rx="8" fill="var(--s1)" opacity="0.05" stroke="var(--s1)" strokeWidth="1"/>
            <text x="180" y="510" textAnchor="middle" fill="var(--s1)" fontSize="11" fontWeight="700">pi05.patch</text>
            <text x="55" y="530" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: configs/train.py</text>
            <text x="55" y="546" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: optim/optimizers.py</text>
            <text x="55" y="562" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: policies/act/modeling_act.py</text>
            <text x="55" y="578" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: scripts/lerobot_train.py</text>
            <text x="55" y="598" fill="var(--vp-c-text-3)" fontSize="10">目标: 训练适配 — MindSpeed AdamW, DataLoader调优</text>
            <text x="55" y="614" fill="var(--vp-c-text-3)" fontSize="10">基线: LeRobot b954337</text>

            <rect x="360" y="488" width="280" height="135" rx="8" fill="var(--s3)" opacity="0.05" stroke="var(--s3)" strokeWidth="1"/>
            <text x="500" y="510" textAnchor="middle" fill="var(--s3)" fontSize="11" fontWeight="700">openpi.patch</text>
            <text x="375" y="530" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: scripts/train_pytorch.py</text>
            <text x="375" y="546" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: models/tokenizer.py</text>
            <text x="375" y="562" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: training/config.py</text>
            <text x="375" y="578" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: training/data_loader.py</text>
            <text x="375" y="598" fill="var(--vp-c-text-3)" fontSize="10">目标: 上游适配 — torch_npu导入, 数据集v3.0映射</text>
            <text x="375" y="614" fill="var(--vp-c-text-3)" fontSize="10">基线: OpenPI main</text>

            <rect x="680" y="488" width="280" height="135" rx="8" fill="var(--s2)" opacity="0.05" stroke="var(--s2)" strokeWidth="1"/>
            <text x="820" y="510" textAnchor="middle" fill="var(--s2)" fontSize="11" fontWeight="700">inference/*.patch</text>
            <text x="695" y="530" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: factory.py (推理入口)</text>
            <text x="695" y="546" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: configuration_pi05.py</text>
            <text x="695" y="562" fill="var(--vp-c-text-2)" fontSize="10">🖊️ 修改文件: modeling_pi05.py (~1800行)</text>
            <text x="695" y="578" fill="var(--vp-c-text-2)" fontSize="10">🆕 新增文件: vision_siglip_npu.py (366行)</text>
            <text x="695" y="598" fill="var(--vp-c-text-3)" fontSize="10">目标: 推理优化 — QKV融合, PFA, 图编译</text>
            <text x="695" y="614" fill="var(--vp-c-text-3)" fontSize="10">基线: LeRobot b74a551</text>
          </svg>
        </section>

        {/* ===== 7. 训练/推理时序图 ===== */}
        <section className="diagram-section">
          <h2>7. 训练与推理时序图</h2>
          <p className="desc">从用户视角看 Pi-0.5 训练和推理的完整时序流程</p>
          <svg viewBox="0 0 1000 580" role="img" aria-label="训练推理时序图">
            <defs>
              <filter id="shadowT"><feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.08"/></filter>
              <marker id="arrowT" markerWidth="8" markerHeight="8" refX="4" refY="8" orient="auto">
                <path d="M0,0 L4,8 L8,0" fill="var(--vp-c-text-3)"/>
              </marker>
            </defs>

            {/* Header */}
            <text x="500" y="20" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="14" fontWeight="700">Pi-0.5 训练 &amp; 推理 — 时序交互图</text>

            {/* == 训练阶段 == */}
            <text x="250" y="50" textAnchor="middle" fill="var(--s1)" fontSize="12" fontWeight="700">🏋️ 训练阶段</text>

            {/* Lifelines */}
            <line x1="80" y1="65" x2="80" y2="280" stroke="var(--vp-c-divider)" strokeWidth="2" strokeDasharray="6,3"/>
            <line x1="250" y1="65" x2="250" y2="280" stroke="var(--vp-c-divider)" strokeWidth="2" strokeDasharray="6,3"/>
            <line x1="420" y1="65" x2="420" y2="280" stroke="var(--vp-c-divider)" strokeWidth="2" strokeDasharray="6,3"/>

            <text x="80" y="62" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">用户</text>
            <text x="250" y="62" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">LeRobot Trainer</text>
            <text x="420" y="62" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">8× NPU (DDP)</text>

            {/* Messages */}
            <rect x="85" y="75" width="155" height="30" rx="5" fill="var(--s1)" opacity="0.08" stroke="var(--s1)" strokeWidth="1"/>
            <text x="162" y="94" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="10" fontWeight="600">bash train_full.sh</text>
            <line x1="240" y1="90" x2="245" y2="90" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowT)"/>

            <rect x="255" y="115" width="155" height="30" rx="5" fill="var(--s3)" opacity="0.08" stroke="var(--s3)" strokeWidth="1"/>
            <text x="332" y="134" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="10" fontWeight="600">加载 checkpoint + dataset</text>
            <line x1="410" y1="130" x2="415" y2="130" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowT)"/>

            <rect x="255" y="155" width="155" height="30" rx="5" fill="var(--s3)" opacity="0.08" stroke="var(--s3)" strokeWidth="1"/>
            <text x="332" y="174" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="10" fontWeight="600">Accelerator.prepare()</text>
            <line x1="410" y1="170" x2="415" y2="170" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowT)"/>

            <rect x="255" y="195" width="155" height="30" rx="5" fill="var(--s2)" opacity="0.08" stroke="var(--s2)" strokeWidth="1"/>
            <text x="332" y="214" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="10" fontWeight="600">pi05.patch 训练优化</text>
            <line x1="410" y1="210" x2="415" y2="210" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowT)"/>

            <rect x="255" y="235" width="155" height="30" rx="5" fill="var(--s7)" opacity="0.08" stroke="var(--s7)" strokeWidth="1"/>
            <text x="332" y="254" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="10" fontWeight="600">30k steps · FPS=155</text>
            <line x1="250" y1="250" x2="90" y2="250" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowT)"/>

            <rect x="85" y="260" width="155" height="14" rx="3" fill="var(--vp-c-bg)" stroke="none"/>
            <text x="162" y="271" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">← 训练完成，保存 checkpoint</text>

            {/* == 推理阶段 == */}
            <text x="750" y="50" textAnchor="middle" fill="var(--s2)" fontSize="12" fontWeight="700">⚡ 推理阶段</text>

            <line x1="580" y1="65" x2="580" y2="280" stroke="var(--vp-c-divider)" strokeWidth="2" strokeDasharray="6,3"/>
            <line x1="750" y1="65" x2="750" y2="280" stroke="var(--vp-c-divider)" strokeWidth="2" strokeDasharray="6,3"/>
            <line x1="920" y1="65" x2="920" y2="280" stroke="var(--vp-c-divider)" strokeWidth="2" strokeDasharray="6,3"/>

            <text x="580" y="62" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">测试脚本</text>
            <text x="750" y="62" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">PI05Policy (eval)</text>
            <text x="920" y="62" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="10">NPU Device</text>

            <rect x="585" y="75" width="155" height="30" rx="5" fill="var(--s2)" opacity="0.08" stroke="var(--s2)" strokeWidth="1"/>
            <text x="662" y="94" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="10" fontWeight="600">pi05_latency.py</text>
            <line x1="740" y1="90" x2="745" y2="90" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowT)"/>

            <rect x="585" y="115" width="155" height="30" rx="5" fill="var(--s3)" opacity="0.08" stroke="var(--s3)" strokeWidth="1"/>
            <text x="662" y="134" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="10" fontWeight="600">prepare_inference_optimizations()</text>
            <line x1="740" y1="130" x2="745" y2="130" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowT)"/>

            <rect x="755" y="145" width="155" height="25" rx="4" fill="var(--s1)" opacity="0.06" stroke="none"/>
            <text x="832" y="161" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="9">fuse_qkv_weights()</text>
            <line x1="910" y1="157" x2="915" y2="157" stroke="var(--vp-c-text-3)" strokeWidth="1" markerEnd="url(#arrowT)"/>

            <rect x="755" y="178" width="155" height="25" rx="4" fill="var(--s3)" opacity="0.06" stroke="none"/>
            <text x="832" y="194" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="9">Vision Tower NPU PFA</text>
            <line x1="910" y1="190" x2="915" y2="190" stroke="var(--vp-c-text-3)" strokeWidth="1" markerEnd="url(#arrowT)"/>

            <rect x="755" y="211" width="155" height="25" rx="4" fill="var(--s5)" opacity="0.06" stroke="none"/>
            <text x="832" y="227" textAnchor="middle" fill="var(--vp-c-text-2)" fontSize="9">_refresh_fixed_denoise_lookup_tables()</text>
            <line x1="910" y1="223" x2="915" y2="223" stroke="var(--vp-c-text-3)" strokeWidth="1" markerEnd="url(#arrowT)"/>

            <rect x="585" y="245" width="155" height="30" rx="5" fill="var(--s7)" opacity="0.08" stroke="var(--s7)" strokeWidth="1"/>
            <text x="662" y="264" textAnchor="middle" fill="var(--vp-c-text-1)" fontSize="10" fontWeight="600">predict_action_chunk() x10</text>
            <line x1="740" y1="260" x2="745" y2="260" stroke="var(--vp-c-text-3)" strokeWidth="1.5" markerEnd="url(#arrowT)"/>

            <rect x="585" y="280" width="155" height="14" rx="3" fill="none"/>
            <text x="662" y="291" textAnchor="middle" fill="var(--vp-c-text-3)" fontSize="9">← 时延结果: mean/median/p90</text>

            {/* Bottom: 关键设计决策 */}
            <rect x="20" y="305" width="960" height="260" rx="8" fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)" strokeWidth="1"/>
            <text x="40" y="330" fill="var(--vp-c-text-1)" fontSize="13" fontWeight="700">🎯 关键设计决策</text>

            <text x="40" y="356" fill="var(--s1)" fontSize="11" fontWeight="600">1. 训练保精度，推理求极致</text>
            <text x="55" y="376" fill="var(--vp-c-text-2)" fontSize="10">训练路径最小侵入，仅替换优化器（AdamW → MindSpeed AdamW）和 DataLoader 参数（num_workers=12, prefetch=4）</text>
            <text x="55" y="392" fill="var(--vp-c-text-2)" fontSize="10">推理路径深度优化，QKV 融合 + PFA + AdaRMS 查表 + TorchAir 双图编译，所有优化均可在 eager 融合和编译图之间切换</text>

            <text x="40" y="420" fill="var(--s2)" fontSize="11" fontWeight="600">2. 三层补丁互不重叠</text>
            <text x="55" y="440" fill="var(--vp-c-text-2)" fontSize="10">pi05.patch、openpi.patch、inference/*.patch 修改的源码文件互不重叠，可独立安装，也可在同一官方基线上按任意顺序 git apply</text>

            <text x="40" y="468" fill="var(--s3)" fontSize="11" fontWeight="600">3. 推理路径三态切换</text>
            <text x="55" y="488" fill="var(--vp-c-text-2)" fontSize="10">RTC 动态参数场景 → 原生 eager；无 RTC + eval + NPU → eager NPU 融合（_forward_npu_optimized）</text>
            <text x="55" y="504" fill="var(--vp-c-text-2)" fontSize="10">无 RTC + eval + NPU + compile_inference_graph → TorchAir 双图（prefix 图 + 固定 10 步 denoise 图）</text>

            <text x="40" y="532" fill="var(--s5)" fontSize="11" fontWeight="600">4. 固定 10 步 Denoise 查表</text>
            <text x="55" y="552" fill="var(--vp-c-text-2)" fontSize="10">预计算 10 步 timestep 表、AdaRMS condition 表、scale/shift/gate 调制表，图编译路径跳过每层 dense(cond) 计算，减少 GatherV2</text>
          </svg>
        </section>

        {/* ===== 8. 核心代码逐步分析 ===== */}
        <div className="section-divider"><span>核心代码逐步分析</span></div>

        <h2>8.1 训练适配补丁 (pi05.patch)</h2>
        <p>pi05.patch 位于仓库根目录，应用于 LeRobot 基线 <code>b954337</code>，共修改 4 个文件，目标是最小侵入地让训练在昇腾 NPU 上运行。 </p>

        <h3>8.1.1 DataLoader 参数调优</h3>
        <p>文件: <FileLink path="src/lerobot/configs/train.py" /> </p>
        <pre>{` # 修改前
 num_workers: int = 4
 # 修改后
+num_workers: int = 12`}</pre>
        <p>将 DataLoader 的 <code>num_workers</code> 从 4 提升到 12，充分利用 NPU 场景下的多核 CPU 并行数据加载能力。配合 <code>lerobot_train.py</code> 中的 <code>persistent_workers=True</code> 和 <code>prefetch_factor=4</code>，减少数据加载等待时间。</p>

        <h3>8.1.2 MindSpeed AdamW 替换</h3>
        <p>文件: <FileLink path="src/lerobot/optim/optimizers.py" /> </p>
        <pre>{` # 关键修改
+from mindspeed.optimizer.adamw import AdamW
 ...
-return torch.optim.AdamW(params, **kwargs)
+return AdamW(params, **kwargs)`}</pre>
        <p>用 MindSpeed 的 AdamW 实现替换 PyTorch 原生 AdamW。MindSpeed AdamW 针对昇腾 NPU 做了算子融合优化，能显著提升训练吞吐。同时增加了 <code>convert_tensor_to_python</code> 辅助函数，解决 tensor 序列化到 JSON 时的兼容性问题。</p>

        <h3>8.1.3 ACT Attention 优化</h3>
        <p>文件: <FileLink path="src/lerobot/policies/act/modeling_act.py" /> </p>
        <pre>{` # 3 处 attention 调用均添加 need_weights=False
-x = self.self_attn(q, k, value=x, key_padding_mask=key_padding_mask)
-x = x[0]
+x = self.self_attn(q, k, value=x, key_padding_mask=key_padding_mask, need_weights=False)[0]`}</pre>
        <p>ACT（Action Chunking Transformer）的 self-attention 和 cross-attention 默认返回 attention weights，在训练时不需要。显式传入 <code>need_weights=False</code> 避免不必要的 attention matrix 计算和内存分配。</p>

        <h2>8.2 上游适配补丁 (openpi.patch)</h2>
        <p>openpi.patch 应用于 OpenPI 仓库，共修改 4 个文件，目标是将 OpenPI 训练框架适配到昇腾 NPU 环境。 </p>

        <h3>8.2.1 torch_npu 导入</h3>
        <p>文件: <FileLink path="scripts/train_pytorch.py" /> </p>
        <pre>{`+import torch_npu
+from torch_npu.contrib import transfer_to_npu`}</pre>
        <p>在训练入口脚本中导入 torch_npu，使 PyTorch 能够识别 NPU 设备。transfer_to_npu 提供模型和数据的 NPU 迁移能力。</p>

        <h3>8.2.2 Tokenizer 路径环境变量</h3>
        <p>文件: <FileLink path="src/openpi/models/tokenizer.py" /> </p>
        <pre>{`+path = os.getenv("PALIGEMMA_TOKENIZER_PATH")
+if path is None:
+    path = download.maybe_download("gs://big_vision/paligemma_tokenizer.model", ...)
+else:
+    path = pathlib.Path(path)`}</pre>
        <p>在无网络环境下，通过环境变量 <code>PALIGEMMA_TOKENIZER_PATH</code> 指定本地 tokenizer 模型路径，避免从 GCS 下载。</p>

        <h3>8.2.3 数据集字段映射 v3.0</h3>
        <p>文件: <FileLink path="src/openpi/training/config.py" /> </p>
        <pre>{` # 数据字段映射升级到 v3.0 格式
-"observation/image": "image",
+"observation/image": "observation.images.image",
-"observation/state": "state",
+"observation/state": "observation.state",
-"actions": "actions",
+"actions": "action",`}</pre>
        <p>LeRobot 数据集格式从 v2.1 升级到 v3.0，字段名从扁平的 <code>observation/image</code> 改为嵌套的 <code>observation.images.image</code>。同时将 <code>actions</code> 改为 <code>action</code>，并添加 <code>action_sequence_keys</code> 配置。</p>

        <h2>8.3 推理优化补丁 (inference/*.patch) — 核心深度分析</h2>
        <p>这是整个 Pi-0.5 昇腾适配的<strong>核心</strong>，共 ~2400 行变更，涉及 5 个文件的修改和 1 个新文件。按功能模块逐一分析：  </p>

        <h3>8.3.1 推理准备入口 (factory.py)</h3>
        <p>文件: <FileLink path="src/lerobot/policies/pi05/factory.py" /> </p>
        <pre>{` # make_policy() 函数末尾新增
+if hasattr(policy, "prepare_inference_optimizations"):
+    policy.prepare_inference_optimizations()`}</pre>
        <p>在 policy 加载权重并移动到目标设备后，统一调用推理优化准备。这是整个推理优化链路的<strong>统一入口</strong>，确保所有优化在正确的时间点（权重已加载、设备已就位）执行。</p>

        <h3>8.3.2 配置项扩展 (configuration_pi05.py)</h3>
        <p>文件: <FileLink path="src/lerobot/policies/pi05/configuration_pi05.py" /> </p>
        <pre>{` # 新增 6 个推理图编译配置项
+compile_inference_graph: bool = False
+compile_inference_backend: str | None = "torchair"
+compile_inference_fullgraph: bool = True
+compile_inference_dynamic: bool = False
+compile_frozen_parameter: bool = True
+compile_tiling_schedule_optimize: bool = True`}</pre>
        <p>这些配置项控制 TorchAir 双图编译的行为。默认关闭，由调用方（如 pi05_latency.py 的 <code>--graph-compile</code> 参数）显式开启。支持三种后端：torchair（默认，NPU 原生）、npugraph_ex、inductor。</p>

        <h3>8.3.3 QKV 权重融合 (fuse_qkv_weights)</h3>
        <p>文件: <FileLink path="modeling_pi05.py" /> — PaliGemmaWithExpertModel.fuse_qkv_weights() </p>
        <pre>{`@torch.no_grad()
def fuse_qkv_weights(self):
    for model in (self.paligemma.model.language_model, self.gemma_expert.model):
        for layer in model.layers:
            attn = layer.self_attn
            qkv_weight = torch.cat(
                [attn.q_proj.weight, attn.k_proj.weight, attn.v_proj.weight],
                dim=0,
            ).contiguous()
            attn.qkv = nn.Linear(qkv_weight.shape[1], qkv_weight.shape[0],
                                bias=False, device=..., dtype=...)
            attn.qkv.weight.copy_(qkv_weight)`}</pre>
        <p><strong>这是推理优化的第一步</strong>。遍历 Paligemma Language Model 和 Gemma Expert 的每一层 attention，将 q_proj、k_proj、v_proj 三个独立 Linear 层的权重在 dim=0 上拼接为单一的 qkv Linear。效果：<strong>每个 attention 层从 3 次 Linear 调用减少为 1 次 Linear + split</strong>，大幅减少 kernel launch 开销。</p>
        <p>视觉塔 SigLIP 的 QKV 融合在 <code>PI05SiglipAttention.fuse_qkv_weights()</code> 中独立实现（vision_siglip_npu.py），逻辑相同。</p>

        <h3>8.3.4 视觉塔 NPU PFA 替换 (vision_siglip_npu.py)</h3>
        <p>文件: <FileLink path="vision_siglip_npu.py" href={PI05_DIR} /> — 新增 366 行独立文件 </p>

        <p>这是 <strong>新增的 366 行独立文件</strong>，完整实现了 SigLIP Vision Transformer 的本地版本，核心能力是支持 NPU Prompt Flash Attention。</p>

        <pre>{`class PI05SiglipAttention(nn.Module):
    def forward(self, hidden_states, attention_mask=None, **kwargs):
        query, key, value = self._project_qkv(hidden_states)

        if self._can_use_npu_pfa(query):
            # PFA 固定使用 FP16 Q/K/V 计算
            attn_output = torch_npu.npu_prompt_flash_attention(
                query.to(torch.float16).contiguous(),
                key.to(torch.float16).contiguous(),
                value.to(torch.float16).contiguous(),
                num_heads=self.num_heads,
                input_layout="BSND",
                scale_value=1.0 / math.sqrt(self.head_dim),
                atten_mask=_blocked_attention_mask(attention_mask),
            )
            attn_output = attn_output.to(output_dtype)  # 恢复视觉塔 dtype
        else:
            attn_output, attn_weights = self._eager_attention(query, key, value, attention_mask)`}</pre>
        <p>关键设计：</p>
        <ul>
          <li><strong>Q/K/V 强制转为 FP16</strong> 后调用 <code>npu_prompt_flash_attention</code>，NPU 上 FP16 计算效率最高</li>
          <li><strong>输出在 out_proj 前恢复视觉塔原始 dtype</strong>，保持下游计算精度</li>
          <li>替换策略：<code>prepare_vision_tower_npu_fused_ops()</code> 创建新的 <code>PI05SiglipVisionModel</code>，用旧 vision_tower 的 state_dict 加载权重，实现<strong>无损替换</strong></li>
          <li>通过环境变量 <code>LEROBOT_PI05_ENABLE_VISION_NPU_PFA</code> 控制是否启用</li>
        </ul>

        <h3>8.3.5 NPU 融合推理路径 (_forward_npu_optimized)</h3>
        <p>文件: <FileLink path="modeling_pi05.py" /> — PaliGemmaWithExpertModel._forward_npu_optimized() </p>
        <p>这是 <strong>eager 模式下 NPU 融合推理的核心实现</strong>，约 200 行，替代原始的双模型分别 forward 路径。</p>

        <pre>{`def _forward_npu_optimized(self, attention_mask, position_ids,
                          past_key_values, inputs_embeds,
                          use_cache, adarms_cond, adarms_modulations=None):
    torch_npu = _import_torch_npu()
    npu_attention_mask = self._npu_attention_mask(attention_mask)
    # 预计算 RoPE cos/sin，单次 forward 内各层复用
    rotary_cos, rotary_sin = self._build_npu_rotary_cache(position_ids, ...)

    for layer_idx in range(num_layers):
        for model_idx, model, hidden_states, cond, modulation_table in active_models:
            # 1. AdaRMS / RMSNorm（支持调制表或实时计算）
            normed, gate = self._npu_or_adarms_layernorm(
                torch_npu, layer.input_layernorm, residual, cond, input_modulation)

            # 2. 单次 QKV 投影（已融合权重）
            qkv = attn.qkv(normed)
            query_states, key_states, value_states = qkv.split([q_out, kv_out, kv_out], dim=-1)

        # 3. 合并后统一 RoPE
        query_states, key_states = self._npu_rotary_emb(
            torch_npu, query_states, key_states, rotary_cos, rotary_sin)

        # 4. NPU Prompt Flash Attention
        att_output = torch_npu.npu_prompt_flash_attention(
            query_states, key_states, value_states,
            num_heads=..., input_layout="BSND",
            scale_value=..., atten_mask=npu_attention_mask, ...)

        # 5. npu_add_rms_norm（残差 + 归一化融合）
        out_emb, _, after_first_residual = torch_npu.npu_add_rms_norm(...)`}</pre>
        <p>逐层循环中，每层执行以下融合算子替换：</p>
        <table>
          <thead><tr><th>原始操作</th><th>NPU 融合算子</th><th>融合效果</th></tr></thead>
          <tbody>
            <tr><td>RMSNorm</td><td><code>npu_rms_norm</code></td><td>单次 kernel 完成归一化</td></tr>
            <tr><td>AdaRMS (dense + scale + norm)</td><td><code>npu_rms_norm</code> + 1+scale 作为 gamma</td><td>消除 scale 逐元素乘法</td></tr>
            <tr><td>q_proj + k_proj + v_proj</td><td>单个 qkv Linear + split</td><td>3→1 次矩阵乘法</td></tr>
            <tr><td>RoPE (q/k 分别)</td><td><code>npu_rotary_mul</code> (q/k 合并)</td><td>减少 Python 侧拆分/拼接</td></tr>
            <tr><td>Self-Attention</td><td><code>npu_prompt_flash_attention</code></td><td>BSND layout, int8 阻塞 mask</td></tr>
            <tr><td>残差 + RMSNorm</td><td><code>npu_add_rms_norm</code></td><td>加法和归一化融合为单 kernel</td></tr>
          </tbody>
        </table>

        <h3>8.3.6 AdaRMS 融合调制</h3>
        <p>文件: <FileLink path="modeling_pi05.py" /> — PaliGemmaWithExpertModel._npu_adarms_layernorm() </p>
        <pre>{`def _npu_adarms_layernorm(self, torch_npu, layernorm, hidden_states,
                          cond=None, modulation=None, *, return_gate=True):
    if modulation is None:
        # 实时计算路径：dense(cond) → scale/shift/gate
        modulation = layernorm.dense(cond)
        scale, shift, gate = modulation.chunk(3, dim=-1)
        scale_weight = 1 + scale.reshape(-1)
    else:
        # 查表路径：直接使用预计算调制量
        scale_weight, shift, gate = modulation

    # 核心：1+scale 作为 npu_rms_norm 的 gamma，同时完成归一化和缩放
    dynamic_weight = scale_weight.to(dtype=hidden_states.dtype).contiguous()
    normed = torch_npu.npu_rms_norm(hidden_states, dynamic_weight, layernorm.eps)[0]
    normed = normed + shift  # shift 保持原 AdaRMS 语义
    return normed, gate`}</pre>
        <p>AdaRMS 的核心创新：将 <code>dense(cond)</code> 输出的 scale 融入 <code>npu_rms_norm</code> 的 gamma 参数，让 RMSNorm <strong>同时完成归一化和缩放</strong>。这减少了一次逐元素乘法的 kernel launch 开销。图编译路径使用预计算调制表，进一步跳过 per-step 的 dense(cond) 计算。</p>

        <h3>8.3.7 固定 10 步 Denoise 查找表</h3>
        <p>文件: <FileLink path="modeling_pi05.py" /> — PI05Pytorch._refresh_fixed_denoise_lookup_tables() </p>
        <pre>{`@torch.no_grad()
def _refresh_fixed_denoise_lookup_tables(self):
    # 1. 预计算 10 步 timestep 表
    timestep_table_f32 = 1.0 - torch.arange(10, ...) / 10

    # 2. Sin-Cos 时间嵌入 → time_mlp → AdaRMS cond
    time_embedding = create_sinusoidal_pos_embedding(timestep_table_f32, ...)
    adarms_cond = self.time_mlp_in(time_embedding)
    adarms_cond = F.silu(adarms_cond)
    adarms_cond = self.time_mlp_out(adarms_cond)
    adarms_cond = F.silu(adarms_cond).to(dtype=target_dtype)

    # 3. 遍历所有 AdaRMS 层，预计算 scale/shift/gate
    for layernorm in self._action_expert_adarms_layernorms():
        modulation = layernorm.dense(adarms_cond)
        scale, shift, gate = modulation.reshape(10, 3, -1).unbind(dim=1)
        scale_weight_tables.append((1 + scale).to(dtype=target_dtype))
        shift_tables.append(shift[:, None, None, :].to(dtype=target_dtype))
        gate_tables.append(gate[:, None, None, :].to(dtype=target_dtype))

    # 4. 拆分为 per-step/per-layer 独立 buffer
    # 避免 Tensor 链式索引产生大量 GatherV2 操作
    self._refresh_adarms_modulation_step_buffers(...)`}</pre>
        <p>查找表的设计要点：</p>
        <ul>
          <li><strong>10 步固定</strong>：Pi-0.5 推理使用固定 10 步 Euler 积分，表结构不可变</li>
          <li><strong>scale 存为 1D</strong>：<code>1+scale</code> 直接作为 RMSNorm gamma，无需 reshape</li>
          <li><strong>shift/gate 存为广播形状</strong>：<code>[1, 1, hidden]</code>，避免逐元素广播的显式操作</li>
          <li><strong>per-step/per-layer 独立 buffer</strong>：图编译路径直接消费 buffer tuple，避免 Tensor 链式索引产生的 GatherV2 操作</li>
          <li><strong>37 个 AdaRMS 层</strong>：18 层 × 2 (input + post_attention) + 1 final norm = 37 层</li>
        </ul>

        <h3>8.3.8 TorchAir 双图编译</h3>
        <p>文件: <FileLink path="modeling_pi05.py" /> — PI05Pytorch.enable_sample_actions_graph_compile() </p>
        <pre>{`def enable_sample_actions_graph_compile(self, *, backend=None, ...):
    # 1. 强制 eager_bmm attention（图编译安全的 attention 实现）
    self._force_eager_attention_for_graph_compile()

    # 2. NPU 图编译安全补丁
    if next(self.parameters()).device.type == "npu":
        self._patch_linear_for_npu_graph_compile()      # Linear → 二维展开
        self._patch_gemma_attention_for_npu_graph_compile()  # bmm 替代 matmul
        self._patch_siglip_attention_for_npu_graph_compile() # 同上
        self._patch_gemma_rotary_for_npu_graph_compile()     # RoPE 重写

    # 3. 编译两张图
    self._compiled_action_prefix_forward = torch.compile(
        self._action_prefix_forward_for_compile, **compile_kwargs)
    self._compiled_action_denoise_10_steps = torch.compile(
        self._action_denoise_10_steps_for_compile, **compile_kwargs)`}</pre>
        <p>双图编译策略：</p>
        <ul>
          <li><strong>Prefix 图</strong>：images + tokens → embed → vision tower → language model prefill → KV cache。输入变化（不同图像/文本），输出 KV cache 供 denoise 复用</li>
          <li><strong>Denoise 图</strong>：noise + KV cache + 查表 → 10 步 Euler 积分 → action。<strong>10 步整体编译为一张图</strong>，KV cache 在 10 步内只读复用，AdaRMS 调制量来自预计算表</li>
          <li><strong>Graph-safe 补丁</strong>：TorchAir/GE 对 rank&gt;2 的 Linear MatMul 维度推断不稳定，补丁将 Linear 展开为二维、将 attention matmul 改写为 bmm、将 RoPE 重写为显式三角函数计算</li>
          <li><strong>编译选项</strong>：<code>frozen_parameter=True</code>（参数冻结）、<code>tiling_schedule_optimize=True</code>（tiling 调度优化）</li>
        </ul>

        <h3>8.3.9 推理路径决策实现</h3>
        <p>文件: <FileLink path="modeling_pi05.py" /> — PI05Pytorch.sample_actions() </p>
        <pre>{`@torch.no_grad()
def sample_actions(self, images, img_masks, tokens, masks, noise, num_steps, **kwargs):
    # 路径 1: TorchAir 双图编译
    if self._can_use_compiled_action_inference(kwargs):
        return self._sample_actions_graph_inference(
            images, img_masks, tokens, masks, noise, num_steps)
    # 路径 2: PaliGemmaWithExpertModel.forward() 内部判断
    # → _can_use_npu_fused_inference() → _forward_npu_optimized()  (NPU 融合)
    # → 或走原生 eager 路径 (fallback)`}</pre>
        <p>决策链：</p>
        <ol>
          <li><code>_can_use_compiled_action_inference()</code>：图编译已启用 + 无 RTC 动态参数 → <strong>TorchAir 双图</strong></li>
          <li><code>_can_use_npu_fused_inference()</code>：eval 模式 + NPU 设备 + QKV 已融合 + AdaRMS 条件满足 → <strong>_forward_npu_optimized</strong></li>
          <li>都不满足 → <strong>原生 eager 路径</strong>（标准 transformers forward）</li>
        </ol>

        <h3>8.3.10 图像预处理优化</h3>
        <p>文件: <FileLink path="modeling_pi05.py" /> — PI05Policy._preprocess_images() </p>
        <pre>{`# PI05Policy._preprocess_images() 优化
-# 原逻辑：NCHW → NHWC → resize → NCHW（两次转置）
+is_channels_first = img.shape[1] == 3
+image_hw = img.shape[2:4] if is_channels_first else img.shape[1:3]
+# resize_with_pad_torch 会识别 NCHW/NHWC，保留原布局可避免 NPU 上重复转置
+if image_hw != self.config.image_resolution:
+    img = resize_with_pad_torch(img, *self.config.image_resolution)`}</pre>
        <p>原代码在图像预处理中强制做 NCHW → NHWC → resize → NCHW 的两次转置。优化后保留原布局，由 <code>resize_with_pad_torch</code> 自动识别格式，<strong>避免 NPU 上重复转置的开销</strong>。</p>

        <h3>8.3.11 多相机视角合并</h3>
        <p>文件: <FileLink path="modeling_pi05.py" /> — PI05Pytorch.embed_prefix() </p>
        <pre>{`# embed_prefix() 优化：多相机视角合并为一次 vision forward
+stacked_images = torch.stack(images, dim=1)  # [B, num_views, C, H, W]
+flat_images = stacked_images.reshape(bsize * num_views, ...)
+flat_img_emb = self.paligemma_with_expert.embed_image(flat_images)
+# 恢复为 [B, num_views * num_img_embs, hidden_dim]
+return flat_img_emb.reshape(bsize, num_views * num_img_embs, hidden_dim)`}</pre>
        <p>多个相机视角（如主视角 + 腕部视角）原本逐个调用 SigLIP，造成重复的调度开销。优化后合并为一次 forward，在 batch 维度上并行处理，<strong>减少 Python 调度次数和 kernel launch 开销</strong>。</p>

        <h2>8.4 时延测试脚本 (pi05_latency.py)</h2>
        <p>文件: <FileLink path="inference/test/pi05_latency.py" href={PI05_DIR} /> （201 行）</p>

        <pre>{`# 核心测试流程
policy = PI05Policy.from_pretrained(args.pretrained, config=config, ...)
policy.prepare_inference_optimizations(
    enable_npu_fused_ops=True,
    enable_graph_compile=args.graph_compile,
    enable_qkv_fusion=True,
)
policy.eval()

# 预热（触发首次图编译和运行时缓存）
for _ in range(args.warmup):
    end_to_end()
    model_path()

# 正式测量
for _ in range(args.iterations):
    synchronize(device)
    start = time.perf_counter()
    output = end_to_end()          # predict_action_chunk()
    synchronize(device)
    e2e_values.append(...)

    synchronize(device)
    start = time.perf_counter()
    output = model_path()          # model.sample_actions()
    synchronize(device)
    model_values.append(...)`}</pre>
        <p>关键设计：</p>
        <ul>
          <li><strong>合成数据</strong>：图像用 <code>torch.rand</code> 随机生成，文本 token 固定为全 1，仅用于测量推理时延，不能评估模型精度</li>
          <li><strong>两个测量维度</strong>：<code>e2e</code>（完整端到端，含图像预处理）和 <code>model.sample_actions</code>（纯模型推理）</li>
          <li><strong>同步测量</strong>：每次推理前后调用 <code>torch.npu.synchronize()</code>，确保覆盖 NPU 算子的实际设备执行时间</li>
          <li><strong>统计输出</strong>：mean / median / p90，p90 使用 <code>int((N-1)*0.9)</code> 下界索引，不会在默认 10 次采样时退化为最大值</li>
          <li><strong>双路径支持</strong>：<code>--graph-compile</code> 参数在 eager 融合和 TorchAir 双图之间切换</li>
        </ul>

        <h2>8.5 推理路径完整调用链</h2>
        <p>以下是从用户调用到最终 NPU 算子执行的完整调用链：</p>
        <pre>{`1. pi05_latency.py
   └─ policy.predict_action_chunk(batch)              # PI05Policy
      └─ self.model.sample_actions(images, ...)       # PI05Pytorch

2. PI05Pytorch.sample_actions()
   ├─ [路径A] _can_use_compiled_action_inference()
   │   └─ _sample_actions_graph_inference()
   │       ├─ _compiled_action_prefix_forward()       # TorchAir 编译图1
   │       │   ├─ embed_prefix()                      # 视觉塔 + 语言嵌入
   │       │   └─ PaliGemmaWithExpertModel.forward()  # prefix prefill → KV cache
   │       └─ _compiled_action_denoise_10_steps()     # TorchAir 编译图2
   │           └─ 10× denoise_step (Euler 积分, 查表调制)
   │
   ├─ [路径B] _can_use_npu_fused_inference() → _forward_npu_optimized()
   │   └─ for layer in layers:
   │       ├─ npu_rms_norm / npu_adarms_layernorm     # AdaRMS 融合
   │       ├─ attn.qkv(normed)                        # 融合 QKV 投影
   │       ├─ npu_rotary_mul                          # 融合 RoPE
   │       ├─ npu_prompt_flash_attention              # NPU PFA
   │       └─ npu_add_rms_norm                        # 残差+归一化融合
   │
   └─ [路径C] 原生 eager forward (fallback)
       └─ 标准 transformers Gemma/SigLIP forward`}</pre>
      </div>
    </>
  );
}