import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/rpg-card-designer/',
  plugins: [react()],
})
