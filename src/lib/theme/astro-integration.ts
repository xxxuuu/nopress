/**
 * NoPress 主题系统 Astro 集成插件
 * 负责扫描主题 pages/ 目录并注入路由
 * 按照最小约束原则：只注入路由和配置别名，不干涉主题内部实现
 */

import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'url';
import { loadEnv } from 'vite';
import path from 'path';
import fs from 'fs';
import { createThemeManager } from './manager';
import { mergeThemeOptions, parseRawOverrides } from './options-merge';
import type { ThemeLoadConfig, PageRoute } from './types';

/** 主题选项虚拟模块 id（契约面是 @lib/theme/options，见 src/lib/theme/options.ts） */
const THEME_OPTIONS_MODULE = 'virtual:nopress/theme-options';

/**
 * 读取 NOPRESS_THEME_OPTIONS：真实环境变量优先，其次 .env 文件
 *
 * integration hook 在 Vite 初始化前执行，process.env 不含 .env 内容，需用 loadEnv 补读
 */
function readThemeOptionsEnv(projectRoot: string, command: string): string | undefined {
  if (process.env.NOPRESS_THEME_OPTIONS) {
    return process.env.NOPRESS_THEME_OPTIONS;
  }
  const mode = command === 'dev' ? 'development' : 'production';
  const fileEnv = loadEnv(mode, projectRoot, 'NOPRESS_THEME_OPTIONS');
  return fileEnv.NOPRESS_THEME_OPTIONS || undefined;
}

/**
 * NoPress 主题集成
 */
export function nopressThemeIntegration(): AstroIntegration {
  return {
    name: 'nopress-theme',
    hooks: {
      'astro:config:setup': async ({ config, updateConfig, injectRoute, command }) => {
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
          await themeManager.initialize(themeConfig);
        } catch (error) {
          console.error('[NoPress Theme] Failed to initialize theme:');
          console.error(error);
          throw error;
        }

        // 获取激活的主题
        const activeTheme = themeManager.getActiveTheme();
        console.log(`[NoPress Theme] Active theme: ${activeTheme.config.name}`);

        // 合并主题选项：声明的默认值 + 宿主覆盖（NOPRESS_THEME_OPTIONS）
        const rawOptions = readThemeOptionsEnv(projectRoot, command);
        let themeOptions: Record<string, string | number | boolean> = {};
        try {
          themeOptions = mergeThemeOptions(
            activeTheme.config.options,
            rawOptions ? parseRawOverrides(rawOptions) : {}
          );
        } catch (error) {
          console.error('[NoPress Theme] Invalid theme options:');
          throw error;
        }
        const overridden = Object.keys(themeOptions)
          .filter(key => activeTheme.config.options?.[key] !== undefined && themeOptions[key] !== activeTheme.config.options[key].default);
        if (overridden.length > 0) {
          console.log(`[NoPress Theme] Options overridden: ${overridden.join(', ')}`);
        }

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
          '@core': path.join(projectRoot, 'src/core'),
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
            plugins: [
              {
                name: 'nopress-theme-options',
                resolveId(id) {
                  // '\0' 前缀标记虚拟模块，阻止 Vite 尝试按文件路径解析
                  return id === THEME_OPTIONS_MODULE ? `\0${THEME_OPTIONS_MODULE}` : null;
                },
                load(id) {
                  if (id !== `\0${THEME_OPTIONS_MODULE}`) return null;
                  // 构建期常量：dev 模式下修改 NOPRESS_THEME_OPTIONS 需重启 dev server
                  return `export const themeOptions = ${JSON.stringify(themeOptions)};`;
                },
              },
            ],
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
