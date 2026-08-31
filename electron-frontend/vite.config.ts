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
          // three is loaded lazily by the valley, after the app has painted. Left in `vendor` it
          // would be pulled into the entry graph and parsed on the critical path, which is the
          // opposite of the point -- the world is allowed to arrive late, the app is not.
          if (id.includes('node_modules/three')) {
            return 'three-vendor'
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
