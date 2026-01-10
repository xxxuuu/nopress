/**
 * NoPress 主题管理器
 * 负责管理主题注册、激活和查询
 * 按照最小约束原则：只管理主题加载和激活，不干涉主题内部结构
 */

import type { ThemeManifest, ThemeLoadConfig } from './types';
import { ThemeLoader } from './loader';

export class ThemeManager {
  private themes: Map<string, ThemeManifest> = new Map();
  private activeThemeId: string | null = null;
  private loader: ThemeLoader;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.loader = new ThemeLoader(projectRoot);
  }

  /**
   * 初始化主题系统
   */
  initialize(config: ThemeLoadConfig): void {
    let manifest: ThemeManifest;

    try {
      // 1. 加载主题
      if (config.themePath) {
        // Out-tree 主题
        manifest = this.loader.loadOutTreeTheme(config.themePath);
      } else if (config.theme) {
        // In-tree 主题
        manifest = this.loader.loadInTreeTheme(config.theme);
      } else {
        // 默认主题
        manifest = this.loader.loadInTreeTheme('default');
      }

      // 2. 注册主题
      this.registerTheme(manifest);

      // 3. 激活主题
      this.setActiveTheme(manifest.config.id);

      console.log(`[Theme] ✅ Theme "${manifest.config.name}" loaded successfully`);
    } catch (error) {
      console.error('[Theme] ❌ Failed to initialize theme system:');
      console.error(error);
      throw error;
    }
  }

  /**
   * 注册主题
   */
  registerTheme(manifest: ThemeManifest): void {
    const { id, name } = manifest.config;

    if (this.themes.has(id)) {
      console.warn(`[Theme] Theme "${id}" is already registered, overwriting...`);
    }

    this.themes.set(id, manifest);
    console.log(`[Theme] Registered theme: ${name} (${id})`);
  }

  /**
   * 获取指定主题
   */
  getTheme(id: string): ThemeManifest | null {
    return this.themes.get(id) || null;
  }

  /**
   * 获取所有已注册的主题
   */
  getAllThemes(): ThemeManifest[] {
    return Array.from(this.themes.values());
  }

  /**
   * 设置激活的主题
   */
  setActiveTheme(id: string): void {
    if (!this.themes.has(id)) {
      throw new Error(`Theme "${id}" is not registered`);
    }

    this.activeThemeId = id;
  }

  /**
   * 获取当前激活的主题
   */
  getActiveTheme(): ThemeManifest {
    if (!this.activeThemeId) {
      throw new Error('No active theme set');
    }

    const theme = this.themes.get(this.activeThemeId);
    if (!theme) {
      throw new Error(`Active theme "${this.activeThemeId}" not found`);
    }

    return theme;
  }

  /**
   * 扫描可用的 in-tree 主题
   */
  scanAvailableThemes(): string[] {
    return this.loader.scanInTreeThemes();
  }
}

/**
 * 创建主题管理器实例
 */
export function createThemeManager(projectRoot: string): ThemeManager {
  return new ThemeManager(projectRoot);
}
