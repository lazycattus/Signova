import { env } from 'node:process'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: env.SIGNOVA_API_TARGET || 'http://127.0.0.1:5002',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        aac: fileURLToPath(new URL('./aac-board.html', import.meta.url)),
        report: fileURLToPath(new URL('./patient-report.html', import.meta.url)),
      },
    },
  },
  plugins: [react(), tailwindcss()],
})