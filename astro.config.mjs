import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { nopressThemeIntegration } from './src/lib/theme/astro-integration.ts';

// https://astro.build/config
export default defineConfig({
  site: 'http://localhost:4321',
  output: 'static',

  integrations: [
    nopressThemeIntegration(),
    sitemap(),
  ],

  vite: {
    resolve: {
      alias: {
        '@': '/src',
        '@lib': '/src/lib',
        '@config': '/src/config',
      }
    }
  },

  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
