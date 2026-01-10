/**
 * NoPress 主题系统 Astro 集成插件
 * 负责扫描主题 pages/ 目录并注入路由
 * 按照最小约束原则：只注入路由和配置别名，不干涉主题内部实现
 */

import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { createThemeManager } from './manager';
import type { ThemeLoadConfig, PageRoute } from './types';

/**
 * NoPress 主题集成
 */
export function nopressThemeIntegration(): AstroIntegration {
  return {
    name: 'nopress-theme',
    hooks: {
      'astro:config:setup': ({ config, updateConfig, injectRoute }) => {
        // 获取项目根目录
        const projectRoot = fileURLToPath(new URL('.', config.root));

        // 创建主题管理器
        const themeManager = createThemeManager(projectRoot);

        // 从环境变量读取主题配置
        const themeConfig: ThemeLoadConfig = {
          theme: process.env.NOPRESS_THEME || 'default',
          themePath: process.env.NOPRESS_THEME_PATH,
        };

        // 初始化主题系统
        try {
          themeManager.initialize(themeConfig);
        } catch (error) {
          console.error('[NoPress Theme] Failed to initialize theme:');
          console.error(error);
          throw error;
        }

        // 获取激活的主题
        const activeTheme = themeManager.getActiveTheme();
        console.log(`[NoPress Theme] Active theme: ${activeTheme.config.name}`);

        // 扫描主题的 pages/ 目录
        const pagesDir = path.join(activeTheme.paths.root, 'pages');
        const pages = scanThemePages(pagesDir);

        console.log(`[NoPress Theme] Found ${pages.length} pages in theme:`);

        // 注入页面到 Astro 路由
        for (const page of pages) {
          injectRoute({
            pattern: page.pattern,
            entrypoint: page.entrypoint,
          });
        }

        // 配置 Vite 别名
        const aliases: Record<string, string> = {
          '@theme': activeTheme.paths.root,
        };

        // 为主题的常见目录添加快捷别名（如果存在）
        const optionalDirs = ['layouts', 'components', 'styles', 'lib', 'assets'];
        for (const dir of optionalDirs) {
          const dirPath = path.join(activeTheme.paths.root, dir);
          if (fs.existsSync(dirPath)) {
            aliases[`@theme/${dir}`] = dirPath;
          }
        }

        updateConfig({
          vite: {
            resolve: {
              alias: aliases,
            },
          },
        });
      },
    },
  };
}

/**
 * 扫描主题 pages/ 目录，生成路由配置
 */
function scanThemePages(pagesDir: string): PageRoute[] {
  const pages: PageRoute[] = [];

  function scan(dir: string, prefix = '') {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // 递归扫描子目录
        scan(fullPath, path.posix.join(prefix, entry.name));
      } else if (entry.name.endsWith('.astro')) {
        // 生成路由 pattern
        const fileName = entry.name.replace(/\.astro$/, '');
        let pattern = prefix ? `/${prefix}` : '';

        if (fileName === 'index') {
          // index.astro -> /prefix 或 /
          pattern = pattern || '/';
        } else if (fileName.startsWith('[') && fileName.endsWith(']')) {
          // [slug].astro -> /prefix/[slug]
          pattern = `${pattern}/${fileName}`;
        } else if (fileName.startsWith('[...') && fileName.endsWith(']')) {
          // [...path].astro -> /prefix/[...path]
          pattern = `${pattern}/${fileName}`;
        } else {
          // about.astro -> /prefix/about
          pattern = `${pattern}/${fileName}`;
        }

        pages.push({
          pattern: pattern || '/',
          entrypoint: fullPath,
        });
      }
    }
  }

  scan(pagesDir);
  return pages;
}
