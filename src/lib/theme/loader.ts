/**
 * NoPress 主题加载器
 * 负责加载主题并验证基本结构
 * 按照最小约束原则：只验证 pages/ 目录存在
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { ThemeManifest, ThemeConfig } from './types';
import { validateThemeConfig } from './schema';

export class ThemeLoader {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * 加载 in-tree 主题（src/themes/ 目录下的主题）
   */
  async loadInTreeTheme(themeId: string): Promise<ThemeManifest> {
    const themePath = path.join(this.projectRoot, 'src', 'themes', themeId);

    if (!fs.existsSync(themePath)) {
      throw new Error(`In-tree 主题不存在: ${themeId}`);
    }

    return this.loadThemeFromPath(themePath, 'in-tree');
  }

  /**
   * 加载 out-tree 主题（npm 包或本地路径）
   */
  async loadOutTreeTheme(themeSpec: string): Promise<ThemeManifest> {
    let themePath: string;

    // 判断是 npm 包还是本地路径
    if (themeSpec.startsWith('.') || themeSpec.startsWith('/')) {
      // 本地路径
      themePath = path.resolve(this.projectRoot, themeSpec);
    } else {
      // npm 包 - 从 node_modules 查找
      themePath = path.join(this.projectRoot, 'node_modules', themeSpec);
    }

    if (!fs.existsSync(themePath)) {
      throw new Error(`Out-tree 主题不存在: ${themeSpec}`);
    }

    return this.loadThemeFromPath(themePath, 'out-tree');
  }

  /**
   * 从指定路径加载主题
   */
  private async loadThemeFromPath(
    themePath: string,
    type: 'in-tree' | 'out-tree'
  ): Promise<ThemeManifest> {
    // 1. 加载主题配置
    const config = await this.loadThemeConfig(themePath);

    // 2. 验证主题配置（只验证 id, name, version）
    const validation = validateThemeConfig(config);
    if (!validation.success) {
      throw new Error(
        `主题配置验证失败:\n${validation.errors?.join('\n')}`
      );
    }

    // 3. 验证 pages/ 目录存在（唯一必需的目录）
    const pagesDir = path.join(themePath, 'pages');
    if (!fs.existsSync(pagesDir)) {
      throw new Error(`主题缺少必需的 pages/ 目录`);
    }

    // 4. 返回主题清单
    return {
      config: validation.data,
      paths: { root: themePath },
      type,
    };
  }

  /**
   * 加载主题配置文件
   * 原生 ESM 动态导入，配置文件可用任意合法 ESM 写法（import、计算属性等）
   *
   * 注意：integration 代码经 Vite module runner 执行，源码级 import() 会被
   * Vite 拦截并在 astro check/sync 场景下随 runner 关闭而失败。
   * 用 Function 构造器取得 Node 原生 import（函数体为常量，参数是文件 URL）。
   */
  private nativeImport = new Function('url', 'return import(url)') as (url: string) => Promise<{ default?: unknown }>;

  private async loadThemeConfig(themePath: string): Promise<ThemeConfig> {
    // 优先尝试 .mjs，然后是 .js
    const possiblePaths = [
      path.join(themePath, 'theme.config.mjs'),
      path.join(themePath, 'theme.config.js'),
    ];

    let configPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        configPath = p;
        break;
      }
    }

    if (!configPath) {
      throw new Error(`主题配置文件不存在 (尝试过: theme.config.mjs, theme.config.js)`);
    }

    try {
      const mod = await this.nativeImport(pathToFileURL(configPath).href);
      const config = mod.default as ThemeConfig | undefined;

      if (!config || typeof config !== 'object') {
        throw new Error('主题配置文件必须默认导出配置对象');
      }

      return config;
    } catch (error) {
      // loadThemeConfig 自身的校验错误直接抛出，其余包装为加载失败
      if (error instanceof Error && error.message.includes('必须默认导出')) {
        throw error;
      }
      throw new Error(
        `加载主题配置文件失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 扫描所有可用的 in-tree 主题
   */
  scanInTreeThemes(): string[] {
    const themesDir = path.join(this.projectRoot, 'src', 'themes');

    if (!fs.existsSync(themesDir)) {
      return [];
    }

    const entries = fs.readdirSync(themesDir, { withFileTypes: true });

    const themes: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const themePath = path.join(themesDir, entry.name);

        // 检查是否存在配置文件 (.mjs 或 .js)
        const hasMjsConfig = fs.existsSync(path.join(themePath, 'theme.config.mjs'));
        const hasJsConfig = fs.existsSync(path.join(themePath, 'theme.config.js'));

        if (hasMjsConfig || hasJsConfig) {
          themes.push(entry.name);
        }
      }
    }

    return themes;
  }
}

/**
 * 创建主题加载器实例
 */
export function createThemeLoader(projectRoot: string): ThemeLoader {
  return new ThemeLoader(projectRoot);
}
