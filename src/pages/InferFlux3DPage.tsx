import { VisualizerPage } from './VisualizerPage';

// 向后兼容别名 — 统一使用通用 VisualizerPage 组件
export function InferFlux3DPage(props: React.ComponentProps<typeof VisualizerPage>) {
  return <VisualizerPage {...props} />;
}
