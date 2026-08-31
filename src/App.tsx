import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
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
          <Route path="/vllm-quickstart" element={<VLLMQuickStartPage />} />
          <Route path="/kv-cache" element={<KVCachePage />} />
          <Route path="/pd-separation" element={<PDSeparationPage />} />
          <Route path="/serving-scheduler" element={<ServingSchedulerPage />} />
          <Route path="/router" element={<RouterPage />} />
          <Route path="/kv-pool" element={<KVPoolPage />} />
          <Route path="/memcache" element={<MemCachePage />} />
          <Route path="/mooncake-kvpool" element={<MooncakeKVPoolPage />} />
          <Route path="/mooncake" element={<MooncakePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}