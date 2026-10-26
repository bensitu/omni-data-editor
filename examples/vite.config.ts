import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pages = [
  'index.html',
  'showcase/index.html',
  'standalone/index.html',
  'datatables-dialog/index.html',
  'datatables-inline/index.html',
  'tabulator-dialog/index.html',
  'tabulator-inline/index.html',
  'async-select/index.html',
];

export default defineConfig({
  base: process.env.OMNIDATAEDITOR_EXAMPLES_BASE ?? '/',
  build: {
    outDir: '../dist/examples',
    emptyOutDir: true,
    rolldownOptions: {
      input: pages.map((page) => fileURLToPath(new URL(page, import.meta.url))),
    },
  },
});
