import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        aac: fileURLToPath(new URL('./aac-board.html', import.meta.url)),
      },
    },
  },
  plugins: [react(), tailwindcss()],
})
