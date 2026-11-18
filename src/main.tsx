import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// 关闭浏览器刷新时的滚动位置恢复，避免首次加载停留在此前滚动位置（配合 Layout 路由切换 scrollTo(0,0)）。
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)