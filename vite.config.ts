import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-genesys-platform': ['purecloud-platform-client-v2'],
          'vendor-genesys-spark':    ['genesys-spark'],
          'vendor-client-sdk':       ['purecloud-client-app-sdk'],
        },
      },
    },
  },
})
