import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [
    TanStackRouterVite({
      routesDirectory: resolve(__dirname, 'src/renderer/routes'),
      generatedRouteTree: resolve(__dirname, 'src/renderer/routeTree.gen.ts'),
      autoCodeSplitting: true,
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  define: {
    'process.type': '"browser"',
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.CHATBOX_BUILD_TARGET': JSON.stringify('unknown'),
    'process.env.CHATBOX_BUILD_PLATFORM': JSON.stringify('web'),
    'process.env.CHATBOX_BUILD_CHANNEL': JSON.stringify('unknown'),
    'process.env.USE_LOCAL_API': JSON.stringify(''),
    'process.env.USE_BETA_API': JSON.stringify(''),
    'process.env.USE_LOCAL_CHATBOX': JSON.stringify(''),
    'process.env.USE_BETA_CHATBOX': JSON.stringify(''),
  },
  server: {
    port: 1212,
    strictPort: true,
  },
  css: {
    postcss: resolve(__dirname, 'postcss.config.js'),
  },
})
