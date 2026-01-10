/**
 * Notion 渲染器类型定义
 */

/**
 * Notion 16 种文本颜色和 9 种背景色
 */
export type NotionColor =
  | 'default'
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
  | 'gray_background'
  | 'brown_background'
  | 'orange_background'
  | 'yellow_background'
  | 'green_background'
  | 'blue_background'
  | 'purple_background'
  | 'pink_background'
  | 'red_background';

/**
 * Callout 图标类型
 */
export interface CalloutIcon {
  type: 'emoji' | 'external' | 'file';
  emoji?: string;
  external?: { url: string };
  file?: { url: string };
}

/**
 * 渲染上下文
 * 用于在递归渲染时传递状态信息
 */
export interface RenderContext {
  listDepth: number; // 当前列表嵌套深度
  inList: boolean; // 是否在列表内
  listType?: 'bulleted' | 'numbered' | 'todo'; // 列表类型
}

/**
 * 渲染选项
 */
export interface RenderOptions {
  /**
   * 是否启用 Toggle 交互
   * 默认：true
   */
  enableToggle?: boolean;

  /**
   * 是否懒加载图片
   * 默认：true
   */
  lazyLoadImages?: boolean;

  /**
   * 图片最大宽度（像素）
   * 默认：0（无限制）
   */
  imageMaxWidth?: number;
}
