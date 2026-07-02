import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/react')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'ui-vendor'
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
