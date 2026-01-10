/**
 * Notion Database 相关类型定义
 * 用于数据层和渲染层之间的数据契约
 */

/**
 * 属性类型枚举
 */
export type PropertyType =
  | 'title'           // 标题
  | 'text'            // 文本
  | 'number'          // 数字
  | 'select'          // 单选
  | 'multi_select'    // 多选
  | 'date'            // 日期
  | 'checkbox'        // 复选框
  | 'url'             // URL
  | 'email'           // 邮箱
  | 'phone'           // 电话
  | 'person'          // 人员
  | 'file'            // 文件
  | 'relation'        // 关联
  | 'formula';        // 公式

/**
 * 数据库元信息
 */
export interface Database {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  cover?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 数据库属性定义
 */
export interface DatabaseSchema {
  databaseId: string;
  properties: Record<string, PropertySchema>;
  /** 属性 ID 的显示顺序（由视图配置决定） */
  propertyOrder?: string[];
}

export interface PropertySchema {
  id: string;
  name: string;
  type: PropertyType;
  selectOptions?: SelectOption[];
  numberFormat?: string;
  [key: string]: any;
}

/**
 * Select 选项
 */
export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

/**
 * 数据库行数据
 */
export interface DatabaseRow {
  id: string;
  createdTime: string;
  lastEditedTime: string;
  properties: Record<string, PropertyValue>;
  archived: boolean;
}

/**
 * 属性值（根据类型不同有不同结构）
 */
export type PropertyValue =
  | TextPropertyValue
  | NumberPropertyValue
  | SelectPropertyValue
  | MultiSelectPropertyValue
  | DatePropertyValue
  | CheckboxPropertyValue
  | UnsupportedPropertyValue;

export interface TextPropertyValue {
  type: 'text' | 'title' | 'url' | 'email' | 'phone';
  value: string;
}

export interface NumberPropertyValue {
  type: 'number';
  value: number | null;
}

export interface SelectPropertyValue {
  type: 'select';
  value: SelectOption | null;
}

export interface MultiSelectPropertyValue {
  type: 'multi_select';
  value: SelectOption[];
}

export interface DatePropertyValue {
  type: 'date';
  value: DateValue | null;
}

export interface DateValue {
  start: string | null;
  end: string | null;
}

export interface CheckboxPropertyValue {
  type: 'checkbox';
  value: boolean;
}

export interface UnsupportedPropertyValue {
  type: 'unsupported';
  originalType: string;
}

/**
 * 查询选项
 */
export interface QueryOptions {
  limit?: number;
  offset?: string;
  filter?: Filter;
  sort?: Sort[];
  /** 视图配置（用于排序和字段过滤） */
  viewConfig?: ViewConfig;
}

/**
 * 视图配置
 */
export interface ViewConfig {
  /** 表格属性配置（用于列顺序和可见性） */
  tableProperties?: TablePropertyConfig[];
  /** 页面排序（行顺序） */
  pageSort?: string[];
}

export interface Filter {
  // 预留过滤接口
  property: string;
  operator: string;
  value: unknown;
}

export interface Sort {
  property: string;
  direction: 'ascending' | 'descending';
}

/**
 * 数据库渲染上下文
 */
export interface DatabaseRenderContext {
  database: Database;
  schema: DatabaseSchema;
  rows: DatabaseRow[];
}

/**
 * 表格属性配置
 */
export interface TablePropertyConfig {
  /** 属性内部 ID */
  property: string;
  /** 是否可见 */
  visible: boolean;
  /** 列宽 */
  width?: number;
}

/**
 * 数据库渲染选项
 */
export interface DatabaseRenderOptions {
  /** 布局类型 */
  layout?: 'table' | 'board' | 'gallery' | 'list';

  /** 最大行数 */
  maxRows?: number;

  /** 是否显示空属性 */
  showEmptyProperties?: boolean;

  /** 是否显示数据库标题 */
  showTitle?: boolean;
}
