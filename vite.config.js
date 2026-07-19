import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  // Site servi sous https://hibol.github.io/hibol-minesweeper/ (GitHub Pages
  // de projet, pas de user/org) : doit correspondre au nom du repo.
  base: '/hibol-minesweeper/',
  plugins: [vue()],
})
