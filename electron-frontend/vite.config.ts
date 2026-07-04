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
          if (!id.includes('node_modules')) {
            return undefined
          }
          if (id.includes('node_modules/react')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'ui-vendor'
          }
          if (id.includes('node_modules/@radix-ui') || id.includes('node_modules/motion')) {
            return 'interaction-vendor'
          }
          if (id.includes('node_modules/embla-carousel')) {
            return 'carousel-vendor'
          }
          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
