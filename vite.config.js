import { defineConfig } from 'vite'

export default defineConfig({
  base: '/WebGazerComparision/',
  server: {
    port: 5174,
  },
  build: {
    rollupOptions: {
      external: ['@mediapipe/face_mesh'],
      output: {
        globals: {
          '@mediapipe/face_mesh': 'globalThis',
        },
      },
    },
  },
})
