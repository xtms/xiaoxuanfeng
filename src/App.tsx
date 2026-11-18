import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { InferFlux3DPage } from './pages/InferFlux3DPage';
import { VisualizerPage } from './pages/VisualizerPage';

// 路由级代码分割：内容页全部懒加载，首屏只加载登录页/通用可视化壳。
// 页面组件均为具名导出，需映射到 default 供 React.lazy 使用。
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const VLLMPage = lazy(() => import('./pages/VLLMPage').then((m) => ({ default: m.VLLMPage })));
const VLLMArchPage = lazy(() => import('./pages/VLLMArchPage').then((m) => ({ default: m.VLLMArchPage })));
const VLLMAscendPage = lazy(() => import('./pages/VLLMAscendPage').then((m) => ({ default: m.VLLMAscendPage })));
const NanoVLLMPage = lazy(() => import('./pages/NanoVLLMPage').then((m) => ({ default: m.NanoVLLMPage })));
const SGLangPage = lazy(() => import('./pages/SGLangPage').then((m) => ({ default: m.SGLangPage })));
const ComparisonPage = lazy(() => import('./pages/ComparisonPage').then((m) => ({ default: m.ComparisonPage })));
const AttentionCloseReadingPage = lazy(() => import('./pages/AttentionCloseReadingPage').then((m) => ({ default: m.AttentionCloseReadingPage })));
const AttentionENPage = lazy(() => import('./pages/AttentionENPage').then((m) => ({ default: m.AttentionENPage })));
const InfraTechPage = lazy(() => import('./pages/InfraTechPage').then((m) => ({ default: m.InfraTechPage })));
const LLMLearningPage = lazy(() => import('./pages/LLMLearningPage').then((m) => ({ default: m.LLMLearningPage })));
const Nanovllm2DeepinferPage = lazy(() => import('./pages/Nanovllm2DeepinferPage').then((m) => ({ default: m.Nanovllm2DeepinferPage })));
const DeepInferExplainedPage = lazy(() => import('./pages/DeepInferExplainedPage').then((m) => ({ default: m.DeepInferExplainedPage })));
const DeepInferMiniPage = lazy(() => import('./pages/DeepInferMiniPage').then((m) => ({ default: m.DeepInferMiniPage })));
const DeepInferLesson1Page = lazy(() => import('./pages/DeepInferLesson1Page').then((m) => ({ default: m.DeepInferLesson1Page })));
const DeepInferLesson2Page = lazy(() => import('./pages/DeepInferLesson2Page').then((m) => ({ default: m.DeepInferLesson2Page })));
const DeepInferLesson3Page = lazy(() => import('./pages/DeepInferLesson3Page').then((m) => ({ default: m.DeepInferLesson3Page })));
const DeepInferLesson4Page = lazy(() => import('./pages/DeepInferLesson4Page').then((m) => ({ default: m.DeepInferLesson4Page })));
const DeepInferLesson5Page = lazy(() => import('./pages/DeepInferLesson5Page').then((m) => ({ default: m.DeepInferLesson5Page })));
const DeepInferLesson6Page = lazy(() => import('./pages/DeepInferLesson6Page').then((m) => ({ default: m.DeepInferLesson6Page })));
const DeepInferLesson7Page = lazy(() => import('./pages/DeepInferLesson7Page').then((m) => ({ default: m.DeepInferLesson7Page })));
const DeepInferLesson8Page = lazy(() => import('./pages/DeepInferLesson8Page').then((m) => ({ default: m.DeepInferLesson8Page })));
const DeepInferLesson9Page = lazy(() => import('./pages/DeepInferLesson9Page').then((m) => ({ default: m.DeepInferLesson9Page })));
const DeepInferLesson10Page = lazy(() => import('./pages/DeepInferLesson10Page').then((m) => ({ default: m.DeepInferLesson10Page })));
const DeepInferLesson11Page = lazy(() => import('./pages/DeepInferLesson11Page').then((m) => ({ default: m.DeepInferLesson11Page })));
const DeepInferLesson12Page = lazy(() => import('./pages/DeepInferLesson12Page').then((m) => ({ default: m.DeepInferLesson12Page })));
const DeepInferLesson13Page = lazy(() => import('./pages/DeepInferLesson13Page').then((m) => ({ default: m.DeepInferLesson13Page })));
const DeepInferLesson14Page = lazy(() => import('./pages/DeepInferLesson14Page').then((m) => ({ default: m.DeepInferLesson14Page })));
const VLLMQuickStartPage = lazy(() => import('./pages/VLLMQuickStartPage').then((m) => ({ default: m.VLLMQuickStartPage })));
const KVCachePage = lazy(() => import('./pages/KVCachePage').then((m) => ({ default: m.KVCachePage })));
const PDSeparationPage = lazy(() => import('./pages/PDSeparationPage').then((m) => ({ default: m.PDSeparationPage })));
const ServingSchedulerPage = lazy(() => import('./pages/ServingSchedulerPage').then((m) => ({ default: m.ServingSchedulerPage })));
const VllmSchedulerPage = lazy(() => import('./pages/VllmSchedulerPage').then((m) => ({ default: m.VllmSchedulerPage })));
const SGLangSchedulerPage = lazy(() => import('./pages/SGLangSchedulerPage').then((m) => ({ default: m.SGLangSchedulerPage })));
const RouterPage = lazy(() => import('./pages/RouterPage').then((m) => ({ default: m.RouterPage })));
const SGLangGatewayPage = lazy(() => import('./pages/SGLangGatewayPage').then((m) => ({ default: m.SGLangGatewayPage })));
const VllmRouterPage = lazy(() => import('./pages/VllmRouterPage').then((m) => ({ default: m.VllmRouterPage })));
const KVPoolPage = lazy(() => import('./pages/KVPoolPage').then((m) => ({ default: m.KVPoolPage })));
const MemCachePage = lazy(() => import('./pages/MemCachePage').then((m) => ({ default: m.MemCachePage })));
const MooncakeKVPoolPage = lazy(() => import('./pages/MooncakeKVPoolPage').then((m) => ({ default: m.MooncakeKVPoolPage })));
const MooncakePage = lazy(() => import('./pages/MooncakePage').then((m) => ({ default: m.MooncakePage })));
const SGLangKVCachePage = lazy(() => import('./pages/SGLangKVCachePage').then((m) => ({ default: m.SGLangKVCachePage })));
const VLLMKVCachePage = lazy(() => import('./pages/VLLMKVCachePage').then((m) => ({ default: m.VLLMKVCachePage })));
const KVCacheComparePage = lazy(() => import('./pages/KVCacheComparePage').then((m) => ({ default: m.KVCacheComparePage })));
const AutoDriveHomePage = lazy(() => import('./pages/AutoDriveHomePage').then((m) => ({ default: m.AutoDriveHomePage })));
const AutoDriveOverviewPage = lazy(() => import('./pages/AutoDriveOverviewPage').then((m) => ({ default: m.AutoDriveOverviewPage })));
const VoyagerPage = lazy(() => import('./pages/VoyagerPage').then((m) => ({ default: m.VoyagerPage })));
const DriveVLAW0Page = lazy(() => import('./pages/DriveVLAW0Page').then((m) => ({ default: m.DriveVLAW0Page })));
const Emu3Page = lazy(() => import('./pages/Emu3Page').then((m) => ({ default: m.Emu3Page })));
const Pi05Page = lazy(() => import('./pages/Pi05Page').then((m) => ({ default: m.Pi05Page })));
const Pi0Page = lazy(() => import('./pages/Pi0Page').then((m) => ({ default: m.Pi0Page })));
const MTRPage = lazy(() => import('./pages/MTRPage').then((m) => ({ default: m.MTRPage })));
const UniADPage = lazy(() => import('./pages/UniADPage').then((m) => ({ default: m.UniADPage })));
const CosmosFrameworkPage = lazy(() => import('./pages/CosmosFrameworkPage').then((m) => ({ default: m.CosmosFrameworkPage })));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 所有内容页 — 直接公开访问 */}
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/vllm" element={<VLLMPage />} />
            <Route path="/vllm-arch" element={<VLLMArchPage />} />
            <Route path="/vllm-ascend" element={<VLLMAscendPage />} />
            <Route path="/nano-vllm" element={<NanoVLLMPage />} />
            <Route path="/sglang" element={<SGLangPage />} />
            <Route path="/comparison" element={<ComparisonPage />} />
            <Route path="/attention-close-reading" element={<AttentionCloseReadingPage />} />
            <Route path="/attention-en" element={<AttentionENPage />} />
            <Route path="/infratech" element={<InfraTechPage />} />
            <Route path="/llm-learning" element={<LLMLearningPage />} />
            <Route path="/nanovllm2deepinfer" element={<Nanovllm2DeepinferPage />} />
            <Route path="/deepinfer/mini" element={<DeepInferMiniPage />} />
            <Route path="/deepinfer/lesson/1" element={<DeepInferLesson1Page />} />
            <Route path="/deepinfer/lesson/2" element={<DeepInferLesson2Page />} />
            <Route path="/deepinfer/lesson/3" element={<DeepInferLesson3Page />} />
            <Route path="/deepinfer/lesson/4" element={<DeepInferLesson4Page />} />
            <Route path="/deepinfer/lesson/5" element={<DeepInferLesson5Page />} />
            <Route path="/deepinfer/lesson/6" element={<DeepInferLesson6Page />} />
            <Route path="/deepinfer/lesson/7" element={<DeepInferLesson7Page />} />
            <Route path="/deepinfer/lesson/8" element={<DeepInferLesson8Page />} />
            <Route path="/deepinfer/lesson/9" element={<DeepInferLesson9Page />} />
            <Route path="/deepinfer/lesson/10" element={<DeepInferLesson10Page />} />
            <Route path="/deepinfer/lesson/11" element={<DeepInferLesson11Page />} />
            <Route path="/deepinfer/lesson/12" element={<DeepInferLesson12Page />} />
            <Route path="/deepinfer/lesson/13" element={<DeepInferLesson13Page />} />
            <Route path="/deepinfer/lesson/14" element={<DeepInferLesson14Page />} />
            <Route path="/deepinfer/:page" element={<DeepInferExplainedPage />} />
            <Route path="/vllm-quickstart" element={<VLLMQuickStartPage />} />
            <Route path="/kv-cache" element={<KVCachePage />} />
            <Route path="/pd-separation" element={<PDSeparationPage />} />
            <Route path="/serving-scheduler" element={<ServingSchedulerPage />} />
            <Route path="/vllm-scheduler" element={<VllmSchedulerPage />} />
            <Route path="/sglang-scheduler" element={<SGLangSchedulerPage />} />
            <Route path="/router" element={<RouterPage />} />
            <Route path="/sglang-gateway" element={<SGLangGatewayPage />} />
            <Route path="/vllm-router" element={<VllmRouterPage />} />
            <Route path="/kv-pool" element={<KVPoolPage />} />
            <Route path="/memcache" element={<MemCachePage />} />
            <Route path="/mooncake-kvpool" element={<MooncakeKVPoolPage />} />
            <Route path="/mooncake" element={<MooncakePage />} />
            <Route path="/sglang-kv-cache" element={<SGLangKVCachePage />} />
            <Route path="/vllm-kv-cache" element={<VLLMKVCachePage />} />
            <Route path="/kv-cache-compare" element={<KVCacheComparePage />} />
            <Route path="/auto-drive" element={<AutoDriveHomePage />} />
            <Route path="/auto-drive/overview" element={<AutoDriveOverviewPage />} />
            <Route path="/auto-drive/voyager" element={<VoyagerPage />} />
            <Route path="/auto-drive/drivevla-w0" element={<DriveVLAW0Page />} />
            <Route path="/auto-drive/emu3" element={<Emu3Page />} />
            <Route path="/auto-drive/pi-0-5" element={<Pi05Page />} />
            <Route path="/auto-drive/pi0" element={<Pi0Page />} />
            <Route path="/auto-drive/mtr" element={<MTRPage />} />
            <Route path="/auto-drive/uniad" element={<UniADPage />} />
            <Route path="/auto-drive/cosmos-framework" element={<CosmosFrameworkPage />} />
            <Route path="/model-structure-3d" element={
              <InferFlux3DPage
                title="MiMo-V2.5 模型结构 3D"
                src="/inferflux/model-structure-3d.html"
                desc="MiMo-V2.5 (310B omni-modal MoE) 模型结构的 3D 交互可视化。可拖拽旋转、滚轮缩放，点击任意模块查看对应说明；底部面板可切换 Tensor/Data/Expert 并行配置与 P/D 部署区域。"
                tags={['3D 可视化', 'MoE', '模型结构', 'MiMo-V2.5']}
                hint="拖拽旋转 · 滚轮缩放 · 双击空白回到全景 · 点击模块查看说明"
              />
            } />
            <Route path="/arch-compare-3d" element={
              <VisualizerPage
                title="Qwen3.8 vs DeepSeek V4 架构 3D 对比"
                src="/inferflux/arch-compare-3d/index.html"
                desc="参照 InfraTech 架构对比 demo 构建的 2026 年新架构 3D 交互可视化，并排展示 Qwen3.8-Flash-Next 与 DeepSeek V4 两大模型的空间架构。内置 8 个模型（Qwen3.8、DeepSeek V4、Kimi K3、GLM-5、Gemma 4、MiniMax M2.5、Step 3.5、2017 原始 Transformer）可任意两两对比；支持 1 分钟 Story mode 分章节导览、token 流动动画、速度调节、组件点击聚焦与暗/亮主题切换。每个模块附带真实来源的参数标注（层数、MoE 专家数、KV 压缩、残差流、视觉/记忆/草稿分支等）。"
                tags={['3D 可视化', '架构对比', 'Qwen3.8', 'DeepSeek V4']}
                hint="拖拽旋转 · 滚轮缩放 · 点击模块聚焦 · 底部下拉框切换对比模型 · ▶ Story mode 导览 · Dark/Light 切换 · 底部滑块调节 token 流量"
              />
            } />
            <Route path="/transformer-explainer" element={
              <VisualizerPage
                title="Transformer Explainer — GPT-2 交互式可视化"
                src="/inferflux/transformer-explainer.html"
                desc="参照 poloclub/transformer-explainer（CHI 2026 论文）构建的 GPT-2 内部机制交互式可视化。内嵌 5 组真实 distilgpt2 激活数据，逐 token 展示 Embedding、QKV 投影、注意力矩阵（Q·Kᵀ → Scale·Mask → Softmax 三阶段展开）、MLP 与 Softmax 概率分布；可切换 12 层 × 12 头、调节温度与 top-k/top-p 采样并实时重新采样下一个 token。"
                tags={['Transformer', 'GPT-2', '注意力机制', '交互式可视化']}
                hint="切换示例 · 拖动 Layer/Head 滑块 · 点击 Attention 放大三阶段矩阵 · 点击 token 高亮注意力流 · 调节温度/采样重采样"
              />
            } />
            <Route path="/business-process" element={
              <VisualizerPage
                title="LLM 业务处理视图 — 3 场景交互可视化"
                src="/inferflux/business-processing.html"
                desc="参照 Transformer 3D 可视化 demo 构建的 LLM 推理服务业务处理视图，内含 3 个 3D 交互场景：① 推理请求全流程（Client → Tokenize → 调度排队 → Prefill → KV Cache → Decode → 采样 → 流式返回的完整业务链路）；② Transformer 内部处理（多头注意力矩阵 + 概率分布 + 采样自回归续写）；③ P/D 分离业务处理（Router → Prefill Pod 计算 KV → KV 传输（SHFS/NIXL/Mooncake）→ Decode Pod 逐词生成 → 流式返回）。数据流、KV 块、token 全部现场动态模拟。"
                tags={['3D 可视化', '请求生命周期', 'Transformer', 'P/D 分离']}
                hint="切换顶部标签 · 点击方块查看说明 · ▶ 播放/⏭ 单步/↺ 重置 · 场景②可换句子/切 Head/调温度 · 场景③可切换 KV 传输后端"
              />
            } />
            {/* 登录墙已移除：旧书签 /login 或未知路径 → 重定向首页，避免空白页 */}
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
    </BrowserRouter>
  );
}