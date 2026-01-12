import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { nopressThemeIntegration } from './src/lib/theme/astro-integration.ts';

// 从环境变量读取站点 URL，默认使用开发环境地址
const SITE_URL = import.meta.env.SITE_URL || 'http://localhost:4321';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
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
