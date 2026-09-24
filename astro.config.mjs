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

  // Astro 7 默认改为 'jsx'（按 JSX 规则剥离空白），会去掉内联元素之间的空格。
  // 显式保留 HTML 感知压缩的旧行为，避免博客排版回归。
  compressHTML: true,

  server: {
    host: true, // This makes the server listen on all IPs (0.0.0.0)
    // port: 3000, // Optional: specify a custom port
  },

  integrations: [
    nopressThemeIntegration(),
    sitemap(),
    // HTML/CSS/JS 压缩
    compress({
      // HTML 压缩配置（选项需挂在 html-minifier-terser 键下）
      HTML: {
        'html-minifier-terser': {
          // 移除注释
          removeComments: true,
          // 保留的注释：astro 内部注释 + Markdown for Agents 发现提示
          ignoreCustomComments: [
            /^\s*#/,
            /.*\$.*/,
            /^\s*\[/,
            /^\s*\]/,
            /^\s*!/,
            /^\s*\//,
            /^\s*astro:.*/,
            /^\s*astro:end/,
            /This page is also available as Markdown/i,
          ],
          // 移除标签间空格
          collapseWhitespace: true,
          // 压缩内联 CSS
          minifyCSS: true,
          // 压缩内联 JS
          minifyJS: true,
          // 保留属性引号（如果安全）
          removeAttributeQuotes: false,
          // 移除可选标签
          removeOptionalTags: false,
          // 移除空属性
          removeEmptyAttributes: true,
          // 保留自定义属性（如 data-astro-cid）
          ignoreCustomFragments: [/<data-astro[^>]*>/],
        },
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
});
