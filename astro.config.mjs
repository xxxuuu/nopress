import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import compress from 'astro-compress';
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
    // HTML/CSS/JS 压缩
    compress({
      // HTML 压缩配置
      HTML: {
        // 移除注释
        removeComments: true,
        // 移除标签间空格
        collapseWhitespace: true,
        // 压缩内联 CSS
        minifyCSS: true,
        // 压缩内联 JS
        minifyJS: true,
        // 移除属性引号（如果安全）
        removeAttributeQuotes: false,
        // 移除可选标签
        removeOptionalTags: false,
        // 移除空属性
        removeEmptyAttributes: true,
        // 保留自定义属性（如 data-astro-cid）
        ignoreCustomFragments: [/<data-astro[^>]*>/],
      },
      // CSS 压缩配置
      CSS: {
        // 启用 CSS 压缩
        defaults: true,
      },
      // JS 压缩配置
      JS: {
        // 启用 JS 压缩
        defaults: true,
      },
      // SVG 压缩配置
      SVG: {
        // 启用 SVG 压缩
        defaults: true,
      },
    }),
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
