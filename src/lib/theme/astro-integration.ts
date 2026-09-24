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
 * 内核保留路由：由 src/pages/ 的数据端点和内置 integration 提供，主题路由不可占用
 *
 * 注意：Astro 7 对路由冲突仅告警并按优先级渲染（未来版本才会硬错误），
 * 因此必须在扫描后显式校验，保证撞名时构建失败而不是静默覆盖。
 */
const RESERVED_PATTERNS = new Set([
  '/rss/feed.xml',
  '/llms.txt',
  '/robots.txt',
  '/sitemap-index.xml',
]);

/**
 * 校验主题路由不占用内核保留路由，命中即抛错（fail fast）
 */
function assertNoReservedRoutes(patterns: string[], themeName: string): void {
  for (const pattern of patterns) {
    // 动态 Markdown 端点占用的是整个命名空间，不能仅比较参数名（如 [id].md）。
    const reservedMarkdown = /^\/[^/]+\.md$/.test(pattern) || /^\/post\/[^/]+\.md$/.test(pattern);
    if (reservedMarkdown || RESERVED_PATTERNS.has(pattern)) {
      throw new Error(
        `[NoPress Theme] 主题 "${themeName}" 的路由 "${pattern}" 占用了内核保留路由（保留清单: /{slug}.md, /post/{slug}.md, ${[...RESERVED_PATTERNS].join(', ')}）`
      );
    }
  }
}

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

        // 扫描主题的 pages/ 目录（页面 .astro 与端点 .ts）
        const pagesDir = path.join(activeTheme.paths.root, 'pages');
        const pages = scanThemeRoutes(pagesDir);

        // 保留路由校验（Astro 7 对冲突只告警不失败，需显式拦截）
        assertNoReservedRoutes(pages.map(page => page.pattern), activeTheme.config.name);

        console.log(`[NoPress Theme] Found ${pages.length} routes in theme:`);

        // 注入页面与端点到 Astro 路由
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
 *
 * 支持两类文件（与内核 src/pages/ 的文件路由约定一致）：
 * - `.astro` 页面：剥扩展名后文件名即路由段（index.astro → /）
 * - `.ts` 端点：剥 .ts 后保留副扩展名作为路由段（search-index.json.ts → /search-index.json），
 *   文件需导出 GET 等方法；动态参数（[slug].json.ts）由文件自带 getStaticPaths
 */
function scanThemeRoutes(pagesDir: string): PageRoute[] {
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
        continue;
      }

      let routeSegment: string;
      let isPage = false;
      if (entry.name.endsWith('.astro')) {
        routeSegment = entry.name.replace(/\.astro$/, '');
        isPage = true;
      } else if (entry.name.endsWith('.ts')) {
        routeSegment = entry.name.replace(/\.ts$/, '');
      } else {
        continue;
      }

      let pattern = prefix ? `/${prefix}` : '';
      if (isPage && routeSegment === 'index') {
        // index.astro -> /prefix 或 /；端点无目录索引语义（index.json.ts -> /index.json）
        pattern = pattern || '/';
      } else {
        // about.astro -> /prefix/about；[slug].astro -> /prefix/[slug]；
        // search-index.json.ts -> /prefix/search-index.json
        pattern = `${pattern}/${routeSegment}`;
      }

      pages.push({
        pattern: pattern || '/',
        entrypoint: fullPath,
      });
    }
  }

  scan(pagesDir);
  return pages;
}
