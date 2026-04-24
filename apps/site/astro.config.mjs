import { defineConfig } from 'astro/config';

// Static SSG. Lit components (e.g. <ai-form>) run on the client only —
// we emit them as plain HTML and register them from a <script type="module">.
export default defineConfig({
  site: 'https://manufosela.github.io',
  base: '/ai-components',
  output: 'static',
  build: {
    assets: 'assets',
  },
});
