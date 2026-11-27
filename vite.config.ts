import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  optimizeDeps: { include: ['zod', 'mammoth', 'pdfjs-dist/legacy/build/pdf.mjs'] },
})
