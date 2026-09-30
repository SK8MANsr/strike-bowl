import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Relative base keeps production output portable; the Session owns preview HOST/PORT.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['HOST', 'PORT', 'LB_PROXY'])
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return {
    base: './',
    define: mode === 'test' ? { 'import.meta.env.VITE_TEST_HOOKS': JSON.stringify('true') } : {},
    server: {
      host: env.HOST ?? '127.0.0.1', port, strictPort: true,
      // Local-only: LB_PROXY=http://127.0.0.1:8080 forwards /api to a locally running leaderboard server.
      proxy: env.LB_PROXY ? { '/api': { target: env.LB_PROXY, changeOrigin: false } } : undefined,
      allowedHosts: ['.manuspre.computer', '.manus.computer', '.manus-asia.computer', '.manuscomputer.ai', '.manusvm.computer', 'localhost', '127.0.0.1'],
    },
    build: { outDir: mode === 'test' ? 'dist-test' : 'dist', target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false },
    test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
  }
})
