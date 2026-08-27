import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  optimizeDeps: {
    include: ['react', 'react-dom/client'],
  },
  server: {
    // 允许用 PORT 指定端口，方便在 5173 已被占用时再开一个实例
    port: Number(process.env.PORT) || 5173,
    host: '0.0.0.0',
    allowedHosts: ['terminal.local'],
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
    warmup: {
      clientFiles: ['./src/main.tsx'],
    },
  },
  plugins: [react(), tailwindcss()],
})
