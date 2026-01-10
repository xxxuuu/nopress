/**
 * NoPress 主题系统公共 API
 * 按照最小约束原则：只导出必要的接口和类型
 */

export { nopressThemeIntegration } from './astro-integration';
export { ThemeLoader, createThemeLoader } from './loader';
export { ThemeManager, createThemeManager } from './manager';
export {
  validateThemeConfig,
  validateThemeManifest,
} from './schema';

// 导出类型
export type {
  ThemeConfig,
  ThemeManifest,
  ThemeOption,
  ThemeOptions,
  ThemePaths,
  ThemeType,
  ThemeLoadConfig,
  ThemeValidationResult,
  PageRoute,
  Post,
  Page,
  MenuItem,
} from './types';

/**
 * 定义主题配置的辅助函数
 * 提供类型提示和验证
 */
import type { ThemeConfig } from './types';

export function defineTheme(config: ThemeConfig): ThemeConfig {
  return config;
}
