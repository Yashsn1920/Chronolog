import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const leetcodeProxy = {
  '/api/leetcode': {
    target: 'https://leetcode.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/api\/leetcode/, '/graphql/'),
    headers: { Referer: 'https://leetcode.com/' },
  },
}
const n8nProxy = {
  '/api/n8n': {
    target: process.env.N8N_BASE_URL || 'http://127.0.0.1:5678',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/n8n/, ''),
  },
}
const ollamaProxy = {
  '/api/ollama': {
    target: 'http://127.0.0.1:11434',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: { ...leetcodeProxy, ...n8nProxy, ...ollamaProxy } },
  preview: { proxy: { ...leetcodeProxy, ...n8nProxy, ...ollamaProxy } },
})
