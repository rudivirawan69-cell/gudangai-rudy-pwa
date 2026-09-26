import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

/** GudangAI RUDY — build production (cepat · chunk stabil · Android-friendly) */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
    assetsInlineLimit: 4096,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash:10].js',
        chunkFileNames: 'assets/[name]-[hash:10].js',
        assetFileNames: 'assets/[name]-[hash:10][extname]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('\\react\\')) {
            return 'react-vendor'
          }
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('pdfjs-dist') || id.includes('tesseract.js') || id.includes('tesseract')) {
            return 'ocr-pdf'
          }
          if (id.includes('@vercel/speed-insights')) return 'insights'
        },
      },
    },
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' || process.env.VERCEL ? ['console', 'debugger'] : [],
    legalComments: 'none',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react'],
    exclude: ['pdfjs-dist', 'tesseract.js'],
  },
})
