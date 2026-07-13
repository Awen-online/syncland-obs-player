import { defineConfig } from 'vite';

export default defineConfig({
  base: './',           // relative asset URLs so the built bundle drops into any subdir
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Keep the bundle small — OBS's embedded CEF is not as generous as a full browser.
    target: 'es2020',
    minify: 'esbuild',
  },
});
