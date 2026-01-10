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
