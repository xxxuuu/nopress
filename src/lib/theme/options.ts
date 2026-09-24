/**
 * 主题选项读取 API（契约面）
 *
 * 主题在 theme.config.mjs 的 options 中声明配置项，宿主可通过
 * NOPRESS_THEME_OPTIONS 环境变量覆盖默认值；本模块导出合并后的最终值。
 *
 * 值是构建期常量（dev 模式修改环境变量需重启），页面 frontmatter 与
 * 客户端脚本均可导入。key 形态与主题声明一致（建议 camelCase）。
 *
 * 用法：
 * ```ts
 * import { themeOptions } from '@lib/theme/options';
 * const opts = themeOptions as { accentColor?: string };
 * ```
 */

export { themeOptions } from 'virtual:nopress/theme-options';
import { themeOptions as resolved } from 'virtual:nopress/theme-options';

/** 合并后选项值的类型 */
export type ThemeOptionValue = string | number | boolean;

/**
 * 读取全部主题选项（带类型收窄的便捷读取）
 *
 * @param fallback 未声明/未提供时的兜底值
 */
export function getThemeOption<T extends ThemeOptionValue>(key: string, fallback: T): T {
  const value = resolved[key];
  return typeof value === typeof fallback ? (value as T) : fallback;
}
