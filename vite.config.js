import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/chat_app/' : '/',
  plugins: [
    react({
      jsxRuntime: 'classic' // Helps with React 18+ compatibility
    }),
    visualizer({
      open: false, // Disable auto-open in production
      filename: "bundle-stats.html",
      gzipSize: true
    })
  ],
  optimizeDeps: {
    include: [
      'react-router-dom',
      'react',
      'react-dom',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore'
    ]
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600, // Increased from 1000
    rollupOptions: {
      external: [], // Ensure no unexpected externalization
      output: {
        manualChunks(id) {
          // More flexible chunking strategy
          if (id.includes('node_modules/react')) return 'react-vendor';
          if (id.includes('node_modules/firebase')) return 'firebase-vendor';
          if (id.includes('node_modules')) return 'other-vendor';
        },
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    }
  },
  server: {
    port: 3000,
    strictPort: true
  },
  preview: {
    port: 3000,
    strictPort: true
  }
});