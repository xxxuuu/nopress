/**
 * NoPress 主题系统类型定义
 * 按照最小约束原则设计
 */

/**
 * 主题配置选项类型
 */
export type ThemeOptionType = 'string' | 'number' | 'boolean' | 'select' | 'color';

/**
 * 单个配置选项定义
 */
export interface ThemeOption {
  type: ThemeOptionType;
  default: any;
  label: string;
  description?: string;
  // select 类型专用
  choices?: string[];
  // number 类型专用
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
  compatibleVersion?: string;  // 兼容的 NoPress 版本（semver 格式）

  // 主题专属配置选项（可选）
  options?: ThemeOptions;
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
  theme?: string;         // in-tree 主题 ID
  themePath?: string;     // out-tree 主题路径（npm 包名或本地路径）
}

/**
 * 主题验证结果
 */
export interface ThemeValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * 页面路由配置
 * 用于 Astro Integration 注入路由
 */
export interface PageRoute {
  pattern: string;      // 路由 pattern，如 '/', '/post/[slug]'
  entrypoint: string;   // 页面文件的完整路径
}

// ===== NoPress 核心数据类型 =====
// 这些类型由内核固定，主题只能使用，不能修改

/**
 * 文章对象
 */
export interface Post {
  // 必需字段
  id: string;
  title: string;
  slug: string;
  summary: string;
  date: string;           // ISO 8601 格式
  type: 'Post' | 'Page' | 'Menu';
  status: 'Published' | 'Draft';

  // Post 特有字段
  tags: string[];

  // 可选字段
  updated?: string;       // ISO 8601 格式
  cover?: string;         // 永久图片 URL

  // 内容字段
  content: string;        // HTML 内容

  // 元数据字段
  readingTime?: number;   // 分钟
  wordCount?: number;
}

/**
 * 页面对象（独立页面，如"关于"）
 * 与 Post 类似，但没有 tags
 */
export type Page = Omit<Post, 'tags'>;

/**
 * 菜单项对象
 */
export interface MenuItem {
  title: string;
  slug: string;
  isExternal: boolean;
  date: string;
}
