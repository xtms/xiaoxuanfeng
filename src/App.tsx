import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { OverviewPage } from './pages/OverviewPage';
import { VLLMPage } from './pages/VLLMPage';
import { VLLMArchPage } from './pages/VLLMArchPage';
import { VLLMAscendPage } from './pages/VLLMAscendPage';
import { NanoVLLMPage } from './pages/NanoVLLMPage';
import { SGLangPage } from './pages/SGLangPage';
import { ComparisonPage } from './pages/ComparisonPage';
import { AttentionCloseReadingPage } from './pages/AttentionCloseReadingPage';
import { AttentionENPage } from './pages/AttentionENPage';
import { InfraTechPage } from './pages/InfraTechPage';
import { VLLMQuickStartPage } from './pages/VLLMQuickStartPage';
import { KVCachePage } from './pages/KVCachePage';
import { PDSeparationPage } from './pages/PDSeparationPage';
import { ServingSchedulerPage } from './pages/ServingSchedulerPage';
import { RouterPage } from './pages/RouterPage';
import { KVPoolPage } from './pages/KVPoolPage';
import { MemCachePage } from './pages/MemCachePage';
import { MooncakeKVPoolPage } from './pages/MooncakeKVPoolPage';
import { MooncakePage } from './pages/MooncakePage';
import { SGLangKVCachePage } from './pages/SGLangKVCachePage';
import { VLLMKVCachePage } from './pages/VLLMKVCachePage';
import { KVCacheComparePage } from './pages/KVCacheComparePage';
import { LoginPage } from './pages/LoginPage';
import { AutoDriveHomePage } from './pages/AutoDriveHomePage';
import { AutoDriveOverviewPage } from './pages/AutoDriveOverviewPage';
import { VoyagerPage } from './pages/VoyagerPage';
import { DriveVLAW0Page } from './pages/DriveVLAW0Page';
import { Emu3Page } from './pages/Emu3Page';
import { Pi05Page } from './pages/Pi05Page';
import { Pi0Page } from './pages/Pi0Page';
import { MTRPage } from './pages/MTRPage';
import { UniADPage } from './pages/UniADPage';
import { CosmosFrameworkPage } from './pages/CosmosFrameworkPage';
import { InferFlux3DPage } from './pages/InferFlux3DPage';
import { VisualizerPage } from './pages/VisualizerPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 登录页 — 独立布局，无需登录 */}
          <Route path="/login" element={<LoginPage />} />

          {/* 所有内容页 — 需要登录 */}
          <Route element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
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
            <Route path="/vllm-quickstart" element={<VLLMQuickStartPage />} />
            <Route path="/kv-cache" element={<KVCachePage />} />
            <Route path="/pd-separation" element={<PDSeparationPage />} />
            <Route path="/serving-scheduler" element={<ServingSchedulerPage />} />
            <Route path="/router" element={<RouterPage />} />
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
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}