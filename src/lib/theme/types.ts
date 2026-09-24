/**
 * NoPress 主题系统类型定义
 * 按照最小约束原则设计
 *
 * 注意：数据契约类型（Post/Tag/MenuItem 等）的唯一来源是 @lib/types，
 * 主题直接从那里导入，此处不再重复定义。
 */

/**
 * 主题配置接口
 * 只包含必需字段：id, name, version
 * 其他字段都是可选的
 */
export interface ThemeConfig {
  // ===== 必需字段 =====
  id: string;
  name: string;
  version: string;

  // ===== 可选字段 =====
  author?: string;
  description?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  compatibleVersion?: string;  // 兼容的 NoPress 版本（semver 格式，当前仅作文档标注，不做校验）

  /**
   * 主题配置选项（可选）
   * 声明主题支持的自定义配置项；宿主通过 NOPRESS_THEME_OPTIONS 环境变量覆盖默认值，
   * 主题代码经 @lib/theme/options 读取合并结果（构建期常量）
   */
  options?: ThemeOptions;
}

/**
 * 主题配置选项类型
 */
export type ThemeOptionType = 'string' | 'number' | 'boolean' | 'select' | 'color';

/**
 * 单个配置选项定义
 */
export interface ThemeOption {
  type: ThemeOptionType;
  default: string | number | boolean;
  label: string;
  description?: string;
  /** select 类型专用：允许的取值 */
  choices?: string[];
  /** number 类型专用 */
  min?: number;
  max?: number;
}

/**
 * 主题配置选项集合
 */
export interface ThemeOptions {
  [key: string]: ThemeOption;
}

/**
 * 主题路径信息
 * 只包含根目录路径，其他路径由主题自行组织
 */
export interface ThemePaths {
  root: string;  // 主题根目录绝对路径
}

/**
 * 主题类型
 */
export type ThemeType = 'in-tree' | 'out-tree';

/**
 * 主题清单（包含配置和路径信息）
 */
export interface ThemeManifest {
  config: ThemeConfig;
  paths: ThemePaths;
  type: ThemeType;
}

/**
 * 主题加载配置
 */
export interface ThemeLoadConfig {
  theme?: string;         // in-tree 主题 ID（默认 'default'）
  themePath?: string;     // out-tree 主题路径（npm 包名或本地路径）
}

/**
 * 页面路由配置
 * 用于 Astro Integration 注入路由
 */
export interface PageRoute {
  pattern: string;      // 路由 pattern，如 '/', '/post/[slug]'
  entrypoint: string;   // 页面文件的完整路径
}
