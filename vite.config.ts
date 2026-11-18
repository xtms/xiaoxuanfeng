import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3200,
    host: '0.0.0.0',
    // HMR 通过 LAN IP 访问时：clientPort 让客户端连到页面所在主机:3200（而非 localhost），
    // allowedHosts 放开主机校验，避免 ws 连接 403 / ERR_CONNECTION_REFUSED。
    allowedHosts: true,
    hmr: {
      clientPort: 3200,
    },
  },
})