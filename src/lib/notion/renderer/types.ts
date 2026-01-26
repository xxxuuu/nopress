/**
 * Notion 渲染器类型定义
 */

/**
 * Block Format 类型（来自非官方 API）
 * 用于获取块的格式信息，如对齐方式、宽度等
 */
export interface BlockFormat {
  // 图片相关
  block_width?: number;           // 图片宽度（像素）
  block_height?: number;          // 图片高度（像素）
  block_aspect_ratio?: number;    // 宽高比（width / height）
  block_full_width?: boolean;     // 是否全宽
  block_page_width?: boolean;     // 是否占满容器宽度
  block_preserve_scale?: boolean;  // 是否保持比例
  block_alignment?: 'left' | 'center' | 'right';
  display_source?: string;
  original_source?: string;

  // 图片编辑元数据（可选）
  image_edit_metadata?: {
    crop?: {
      x: number;
      y: number;
      unit: string;
      width: number;
      height: number;
    };
    mask?: string;
  };

  // 列布局相关
  column_ratio?: number;          // 列宽比例（0-1）

  // 数据库相关
  collection_pointer?: {
    id: string;
    spaceId: string;
  };
  type?: string;
  views?: Array<{
    type: string;
    format?: any;
    page_sort?: string[];
  }>;

  // 其他未定义的字段
  [key: string]: any;
}

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
