import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: isProduction ? '/react-vite-deploy-1/' : '/',  // ✅ Correct base path for GitHub Pages
  plugins: [
    react({
      jsxRuntime: 'classic'
    }),
    visualizer({
      open: false,
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
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      external: [],
      output: {
        manualChunks(id) {
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
