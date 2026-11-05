import { defineConfig } from 'vite'
import appConfig from './vite.config.js'

export default defineConfig({
  ...appConfig,
  base: '/management/',
  publicDir: 'app-public',
  build: {
    outDir: 'public/management',
    emptyOutDir: true,
  },
})
