/**
 * NoPress 主题系统公共 API
 * 按照最小约束原则：只导出必要的接口和类型
 */

export { nopressThemeIntegration } from './astro-integration';
export { ThemeLoader, createThemeLoader } from './loader';
export { ThemeManager, createThemeManager } from './manager';
export { validateThemeConfig, themeConfigSchema } from './schema';
export { themeOptions, getThemeOption } from './options';
export type { ThemeOptionValue } from './options';
export { mergeThemeOptions, parseRawOverrides } from './options-merge';

// 导出类型
export type {
  ThemeConfig,
  ThemeManifest,
  ThemeOption,
  ThemeOptionType,
  ThemeOptions,
  ThemePaths,
  ThemeType,
  ThemeLoadConfig,
  PageRoute,
} from './types';
