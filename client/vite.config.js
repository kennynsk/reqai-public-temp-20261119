import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const runtimeEnv = globalThis.process?.env || {}
const apiProxyTarget = runtimeEnv.VITE_API_PROXY_TARGET || 'http://localhost:5178'
const usePolling = runtimeEnv.VITE_USE_POLLING === 'true'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5177,
    strictPort: true,
    watch: {
      usePolling,
    },
    proxy: {
      '/api': apiProxyTarget,
    },
  },
})
