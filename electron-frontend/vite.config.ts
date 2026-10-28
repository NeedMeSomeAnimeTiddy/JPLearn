import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server's address is in index.html's content security policy so `npm run dev` can load
// and hot-reload. The built app never talks to it, so the build takes it out (audit 8 nit 2); if
// the policy is edited and the address is no longer there, the build fails rather than ship it
// unchecked.
const DEV_SERVER_CONNECT_SOURCES = ' http://localhost:5173 ws://localhost:5173'

function dropDevServerFromBuiltPolicy(): Plugin {
  return {
    name: 'jplearn-drop-dev-server-from-csp',
    apply: 'build',
    transformIndexHtml(html) {
      if (!html.includes(DEV_SERVER_CONNECT_SOURCES)) {
        throw new Error('index.html content security policy no longer lists the dev server address')
      }
      return html.replace(DEV_SERVER_CONNECT_SOURCES, '')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), dropDevServerFromBuiltPolicy()],
  build: {
    rollupOptions: {
      // A lazy import that something else also imports statically is not lazy: the module lands in
      // the entry chunk and the import() produces nothing. That happened to the valley once (#83)
      // and the only sign was a line in the build log, so it is an error now rather than a warning.
      onwarn(warning, warn) {
        if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') {
          throw new Error(`A lazy import is not lazy any more: ${warning.message}`)
        }
        warn(warning)
      },
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
