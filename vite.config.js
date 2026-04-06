import { defineConfig } from 'vite';

// Relative base keeps assets working on GitHub Pages project sites
// without hardcoding repository names.
export default defineConfig({
  base: './'
});
