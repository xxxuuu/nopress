// 文章元数据类型
export interface PostMetadata {
  id: string;
  title: string;
  slug: string;
  description: string;
  publishedAt: string;
  updatedAt: string | null;
  tags: string[];
  coverUrl: string;
  icon: string; // emoji 或图片 URL
}

// 完整文章类型
export interface Post extends PostMetadata {
  content: string;
  excerpt?: string;
  readingTime?: number;
}

// 标签类型
export interface Tag {
  name: string;
  slug: string;
  count: number;
}

// 菜单项类型
export interface MenuItem {
  title: string;
  url: string; // 内部链接（如 /about）或外部链接（如 https://example.com）
  isExternal: boolean; // 是否为外部链接
}

// 分页信息
export interface Pagination {
  currentPage: number;
  totalPages: number;
  postsPerPage: number;
  totalPosts: number;
}

// 数据服务接口
export interface DataService {
  getAllPosts(): Promise<Post[]>;
  getPostBySlug(slug: string): Promise<Post | null>;
  getPostsByTag(tag: string): Promise<Post[]>;
  getAllTags(): Promise<Tag[]>;
  getMenuItems(): Promise<MenuItem[]>;
  getAllPages(): Promise<Post[]>; // Page 和 Post 结构相同
  getPageBySlug(slug: string): Promise<Post | null>;
  getDatabaseInfo(): Promise<{ title: string; description: string; coverUrl: string; icon: string }>;
}

// ==================== 评论系统类型 ====================

// 评论系统提供商类型
export type CommentProvider = 'giscus' | 'waline' | 'utterances' | 'twikoo';

// Giscus 页面映射类型
export type GiscusMapping =
  | 'pathname' // 使用 URL 路径
  | 'url' // 使用完整 URL
  | 'title' // 使用页面标题
  | 'og:title' // 使用 Open Graph 标题
  | 'specific' // 使用特定 term
  | 'number'; // 使用讨论编号

// Giscus 配置接口
export interface GiscusConfig {
  repo: string; // GitHub 仓库 (格式: owner/repo)
  repoId: string; // 仓库 ID
  category: string; // 讨论分类名称
  categoryId: string; // 分类 ID
  mapping: GiscusMapping; // 页面映射方式
  strict: '0' | '1'; // 严格模式
  reactionsEnabled: '0' | '1'; // 启用反应
  emitMetadata: '0' | '1'; // 发送元数据
  inputPosition: 'top' | 'bottom'; // 输入框位置
  lang: string; // 语言
  lazy: boolean; // 懒加载
}

// Waline 配置接口（未来扩展）
export interface WalineConfig {
  serverURL: string; // Waline 服务器地址
  lang: string; // 语言
  emoji: boolean; // 表情支持
  imageUploader: boolean; // 图片上传
}

// Utterances 配置接口（未来扩展）
export interface UtterancesConfig {
  repo: string; // GitHub 仓库
  issueTerm: string; // issue 映射方式
  label: string; // issue 标签
  theme: string; // 主题
}

// Twikoo 配置接口（未来扩展）
export interface TwikooConfig {
  envId: string; // 环境ID
  region: string; // 服务区域
}

// 评论系统配置接口
export interface CommentSystemConfig {
  enabled: boolean; // 全局开关
  provider: CommentProvider; // 评论提供商
  giscus?: GiscusConfig; // Giscus 配置
  waline?: WalineConfig; // Waline 配置（未来扩展）
  utterances?: UtterancesConfig; // Utterances 配置（未来扩展）
  twikoo?: TwikooConfig; // Twikoo 配置（未来扩展）
}
