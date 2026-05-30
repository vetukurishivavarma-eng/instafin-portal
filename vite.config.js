import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // All @react-pdf/* packages and their dependencies
          if (id.includes('@react-pdf')) return 'pdfVendor';
          // Chart libraries
          if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'charts';
          // Core vendor libraries
          if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('scheduler')) return 'vendor';
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@react-pdf/renderer'],
  },
})
