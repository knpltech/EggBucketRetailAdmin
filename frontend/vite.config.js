import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backendUrl = 'https://eggbucketretailadmin.onrender.com'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    proxy: {
      // Proxy API calls to backend during development to avoid CORS
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      // If your frontend calls /login directly (not under /api)
      '/login': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      }
    }
  },
})
