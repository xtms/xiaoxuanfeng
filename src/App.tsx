import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { OverviewPage } from './pages/OverviewPage';
import { VLLMPage } from './pages/VLLMPage';
import { VLLMAscendPage } from './pages/VLLMAscendPage';
import { NanoVLLMPage } from './pages/NanoVLLMPage';
import { SGLangPage } from './pages/SGLangPage';
import { ComparisonPage } from './pages/ComparisonPage';
import { AttentionCloseReadingPage } from './pages/AttentionCloseReadingPage';
import { AttentionENPage } from './pages/AttentionENPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/vllm" element={<VLLMPage />} />
          <Route path="/vllm-ascend" element={<VLLMAscendPage />} />
          <Route path="/nano-vllm" element={<NanoVLLMPage />} />
          <Route path="/sglang" element={<SGLangPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/attention-close-reading" element={<AttentionCloseReadingPage />} />
          <Route path="/attention-en" element={<AttentionENPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}