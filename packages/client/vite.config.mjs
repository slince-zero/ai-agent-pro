import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  optimizeDeps: {
    include: ['react', 'react-dom/client', '@tabler/icons-react'],
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local'],
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
    warmup: {
      clientFiles: ['./src/main.jsx'],
    },
  },
  plugins: [react(), tailwindcss()],
})
