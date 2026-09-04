export function AutoDriveOverviewPage() {
  return (
    <div className="prose max-w-none">
      <h1>自动驾驶 — 总体架构</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">🏷️ 自动驾驶 · 总体架构</span>
      </div>
      <p>端到端自动驾驶的核心范式演进：从传统模块化方案到端到端模仿学习、强化学习，再到 VLA（视觉-语言-行动）大模型架构。</p>

      <h2>核心范式</h2>
      <table>
        <thead><tr><th>范式</th><th>代表框架</th><th>核心思想</th></tr></thead>
        <tbody>
          <tr><td><strong>模块化</strong></td><td>传统方案</td><td>感知→预测→规划→控制，各模块独立优化</td></tr>
          <tr><td><strong>端到端模仿学习</strong></td><td>Voyager, MTR</td><td>传感器输入→规划输出，端到端训练</td></tr>
          <tr><td><strong>VLA 大模型</strong></td><td>DriveVLA-W0, π0, Pi-0.5</td><td>视觉-语言-行动统一架构，多任务泛化</td></tr>
          <tr><td><strong>多模态大一统</strong></td><td>Emu3</td><td>图文视频统一生成，下一代感知基础</td></tr>
        </tbody>
      </table>

      <h2>框架对比</h2>
      <table>
        <thead><tr><th>框架</th><th>机构</th><th>架构类型</th><th>输入模态</th><th>输出</th></tr></thead>
        <tbody>
          <tr><td><strong>Voyager</strong></td><td>NVIDIA</td><td>端到端世界模型</td><td>多相机 + 激光雷达</td><td>轨迹 / 规划</td></tr>
          <tr><td><strong>DriveVLA-W0</strong></td><td>华为</td><td>VLA 大模型</td><td>多相机 + 语言指令</td><td>控制信号</td></tr>
          <tr><td><strong>Emu3</strong></td><td>智源</td><td>多模态大一统</td><td>图文视频任意</td><td>多模态生成</td></tr>
          <tr><td><strong>Pi-0.5</strong></td><td>Physical Intelligence</td><td>VLA 基础模型</td><td>视觉 + 语言</td><td>机器人动作</td></tr>
          <tr><td><strong>π0</strong></td><td>Physical Intelligence</td><td>VLA 旗舰模型</td><td>视觉 + 语言 + 触觉</td><td>跨具身动作</td></tr>
          <tr><td><strong>MTR</strong></td><td>Waymo</td><td>Motion Transformer</td><td>矢量化地图 + 轨迹</td><td>多模态轨迹</td></tr>
        </tbody>
      </table>
    </div>
  );
}