import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const studioRoot = fileURLToPath(new URL('./', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('./playbook/', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public/', import.meta.url)),
  build: { outDir: fileURLToPath(new URL('./dist/playbook/', import.meta.url)), emptyOutDir: true },
  server: { host: '127.0.0.1', port: 4179, strictPort: true, fs: { allow: [studioRoot, fileURLToPath(new URL('../examples/', import.meta.url))] } },
  preview: { host: '127.0.0.1', port: 4179, strictPort: true },
});
