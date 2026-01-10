import type { Post, Tag, MenuItem, DataService } from '../types';
import { getNotionClient } from '../notion/client';
import { createPageRenderer } from '../notion/renderer';
import { NotionQueries } from '../notion/queries';
import { slugify, slugMatch } from '../utils/slug';
import { compareDate } from '../utils/date';
import { notionCache } from '../cache';

/**
 * Notion 数据服务
 * 实现与 Mock 服务相同的接口，从真实 Notion API 获取数据
 * 使用缓存层减少 API 调用
 */
class NotionDataService implements DataService {
  private queries: NotionQueries;

  constructor() {
    const client = getNotionClient();
    const renderer = createPageRenderer(client, {
      enableToggle: true,
      lazyLoadImages: true,
    });
    this.queries = new NotionQueries(client, renderer);
  }

  /**
   * 获取所有文章（按发布日期倒序）
   */
  async getAllPosts(): Promise<Post[]> {
    const cacheKey = 'all-posts';

    // 尝试从缓存获取
    const cached = await notionCache.get<Post[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // 缓存未命中，从 Notion API 获取
    const posts = await this.queries.getAllPosts();
    const sorted = posts.sort((a, b) => compareDate(b.publishedAt, a.publishedAt));

    // 缓存结果
    await notionCache.set(cacheKey, sorted);

    return sorted;
  }

  /**
   * 根据 slug 获取单篇文章
   */
  async getPostBySlug(slug: string): Promise<Post | null> {
    const posts = await this.getAllPosts();
    const post = posts.find(p => slugMatch(p.slug, slug));
    return post || null;
  }

  /**
   * 获取指定标签的所有文章
   */
  async getPostsByTag(tag: string): Promise<Post[]> {
    const posts = await this.getAllPosts();
    return posts
      .filter(post => post.tags.some(t => slugMatch(t, tag)))
      .sort((a, b) => compareDate(b.publishedAt, a.publishedAt));
  }

  /**
   * 获取所有标签及其文章数
   */
  async getAllTags(): Promise<Tag[]> {
    const cacheKey = 'all-tags';

    // 尝试从缓存获取
    const cached = await notionCache.get<Tag[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // 缓存未命中，计算标签
    const posts = await this.getAllPosts();
    const tagMap = new Map<string, number>();

    posts.forEach(post => {
      post.tags.forEach(tag => {
        const count = tagMap.get(tag) || 0;
        tagMap.set(tag, count + 1);
      });
    });

    const tags = Array.from(tagMap.entries())
      .map(([name, count]) => ({
        name,
        slug: slugify(name),
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // 缓存结果
    await notionCache.set(cacheKey, tags);

    return tags;
  }

  /**
   * 获取菜单项
   */
  async getMenuItems(): Promise<MenuItem[]> {
    const cacheKey = 'menu-items';

    // 尝试从缓存获取
    const cached = await notionCache.get<MenuItem[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // 缓存未命中，从 Notion API 获取
    const client = getNotionClient();
    const pages = await client.queryMenuItems();

    const menuItems: MenuItem[] = pages.reverse().map(page => {
      const properties = page.properties as any;

      // 提取标题
      const title = properties.title?.title?.[0]?.plain_text || 'Untitled';

      // 提取 slug 作为 URL
      let url = properties.slug?.rich_text?.[0]?.plain_text || '/';

      // 判断是否为外部链接
      const isExternal = url.startsWith('http://') || url.startsWith('https://');

      // 如果是内部链接且不以 / 开头，添加 /
      if (!isExternal && !url.startsWith('/')) {
        url = `/${url}`;
      }

      return {
        title,
        url,
        isExternal,
      };
    });

    // 缓存结果
    await notionCache.set(cacheKey, menuItems);

    return menuItems;
  }

  /**
   * 获取数据库信息（标题、描述、封面和图标）
   */
  async getDatabaseInfo(): Promise<{ title: string; description: string; coverUrl: string; icon: string }> {
    const cacheKey = 'database-info';

    // 尝试从缓存获取
    const cached = await notionCache.get<{ title: string; description: string; coverUrl: string; icon: string }>(cacheKey);
    if (cached) {
      return cached;
    }

    // 缓存未命中，从 Notion API 获取
    const client = getNotionClient();
    const info = await client.getDatabaseInfo();

    // 缓存结果
    await notionCache.set(cacheKey, info);

    return info;
  }

  /**
   * 获取所有独立页面（type=Page）
   */
  async getAllPages(): Promise<Post[]> {
    const cacheKey = 'all-pages';

    // 尝试从缓存获取
    const cached = await notionCache.get<Post[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // 缓存未命中，从 Notion API 获取
    const pages = await this.queries.getAllPages();

    // 缓存结果
    await notionCache.set(cacheKey, pages);

    return pages;
  }

  /**
   * 根据 slug 获取单个独立页面
   */
  async getPageBySlug(slug: string): Promise<Post | null> {
    const pages = await this.getAllPages();
    const page = pages.find(p => slugMatch(p.slug, slug));
    return page || null;
  }
}

// 导出单例
export const notionService = new NotionDataService();
export default notionService;
