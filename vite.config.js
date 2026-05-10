import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  base: '/WebGazerComparision/',
  server: {
    port: 5174,
  },
  resolve: {
    alias: {
      '@mediapipe/face_mesh': path.resolve(__dirname, 'src/mediapipe-face-mesh-shim.js'),
    },
  },
})
