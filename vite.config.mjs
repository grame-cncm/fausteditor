import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: "./",
  build: {
    minify: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        other: resolve(__dirname, 'faustlive-wasm.html'),
      },
    },
    sourcemap: true
  },
})
