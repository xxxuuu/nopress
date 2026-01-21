import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { nopressThemeIntegration } from './src/lib/theme/astro-integration.ts';
import { loadEnv } from 'vite';

// Astro 配置文件加载较早，使用 loadEnv 读取环境变量
// 参考: https://docs.astro.build/zh-cn/guides/environment-variables/#在-astro-配置文件中
const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
const SITE_URL = env.SITE_URL || 'http://localhost:4321';

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
