/**
 * Notion 数据服务
 * 统一的数据访问入口，包含缓存、业务逻辑和元数据提取
 */

// 配置检查（在模块加载时执行）
const hasNotionConfig = !!(
  (import.meta.env?.NOTION_TOKEN || process.env?.NOTION_TOKEN) &&
  (import.meta.env?.NOTION_DATABASE_ID || process.env?.NOTION_DATABASE_ID)
);

if (!hasNotionConfig) {
  throw new Error(
    '❌ Notion configuration missing!\n' +
    '💡 Please set NOTION_TOKEN and NOTION_DATABASE_ID in your .env file.\n' +
    '📖 See README.md for setup instructions.'
  );
}

import type { Post, Tag, MenuItem, DataService } from '../../types';
import type { NotionPage } from '../api/types';
import type { NotionPageRenderer } from '../renderer';
import { createPageRenderer } from '../renderer';
import { notionAPI } from '../api';
import { slugify, slugMatch } from '../../utils/slug';
import { compareDate } from '../../utils/date';
import { calculateReadingTime, generateExcerpt } from '../../utils/format';
import { notionRateLimiter, notionRetryHelper } from '../../utils/api-helpers';
import { notionCache } from '../../cache';

/**
 * Notion 数据服务
 * 统一的数据访问入口，包含缓存、业务逻辑和元数据提取
 */
class NotionDataService implements DataService {
  private renderer: NotionPageRenderer;

  constructor() {
    this.renderer = createPageRenderer({
      enableToggle: true,
      lazyLoadImages: true,
    });
  }

  // ============== 公开 API ==============

  /**
   * 获取所有文章（按发布日期倒序）
   */
  async getAllPosts(): Promise<Post[]> {
    const cacheKey = 'all-posts';

    const cached = await notionCache.get<Post[]>(cacheKey);
    if (cached) return cached;

    // 从 Notion API 获取已发布文章
    const pages = await notionAPI.queryPublishedPosts();

    // 并行获取所有文章内容
    const posts = await Promise.all(
      pages.map(page => this.getPostWithContent(page))
    );

    const validPosts = posts
      .filter((post): post is Post => post !== null)
      .sort((a, b) => compareDate(b.publishedAt, a.publishedAt));

    await notionCache.set(cacheKey, validPosts);
    return validPosts;
  }

  /**
   * 根据 slug 获取单篇文章
   */
  async getPostBySlug(slug: string): Promise<Post | null> {
    const posts = await this.getAllPosts();
    return posts.find(p => slugMatch(p.slug, slug)) || null;
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

    const cached = await notionCache.get<Tag[]>(cacheKey);
    if (cached) return cached;

    const posts = await this.getAllPosts();
    const tagMap = new Map<string, number>();

    posts.forEach(post => {
      post.tags.forEach(tag => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    });

    const tags = Array.from(tagMap.entries())
      .map(([name, count]) => ({
        name,
        slug: slugify(name),
        count,
      }))
      .sort((a, b) => b.count - a.count);

    await notionCache.set(cacheKey, tags);
    return tags;
  }

  /**
   * 获取菜单项
   */
  async getMenuItems(): Promise<MenuItem[]> {
    const cacheKey = 'menu-items';

    const cached = await notionCache.get<MenuItem[]>(cacheKey);
    if (cached) return cached;

    const pages = await notionAPI.queryMenuItems();

    const menuItems: MenuItem[] = pages.reverse().map(page => {
      const properties = page.properties as any;
      const title = properties.title?.title?.[0]?.plain_text || 'Untitled';
      let url = properties.slug?.rich_text?.[0]?.plain_text || '/';

      const isExternal = url.startsWith('http://') || url.startsWith('https://');
      if (!isExternal && !url.startsWith('/')) {
        url = `/${url}`;
      }

      return { title, url, isExternal };
    });

    await notionCache.set(cacheKey, menuItems);
    return menuItems;
  }

  /**
   * 获取数据库信息（标题、描述、封面和图标）
   */
  async getDatabaseInfo(): Promise<{ title: string; description: string; coverUrl: string; icon: string }> {
    const cacheKey = 'database-info';

    const cached = await notionCache.get<{ title: string; description: string; coverUrl: string; icon: string }>(cacheKey);
    if (cached) return cached;

    const info = await notionAPI.getDatabaseMeta();

    await notionCache.set(cacheKey, info);
    return info;
  }

  /**
   * 获取所有独立页面（type=Page）
   */
  async getAllPages(): Promise<Post[]> {
    const cacheKey = 'all-pages';

    const cached = await notionCache.get<Post[]>(cacheKey);
    if (cached) return cached;

    const pages = await notionAPI.queryPages();

    const pageContents = await Promise.all(
      pages.map(page => this.getPostWithContent(page))
    );

    const validPages = pageContents.filter((page): page is Post => page !== null);

    await notionCache.set(cacheKey, validPages);
    return validPages;
  }

  /**
   * 根据 slug 获取单个独立页面
   */
  async getPageBySlug(slug: string): Promise<Post | null> {
    const pages = await this.getAllPages();
    return pages.find(p => slugMatch(p.slug, slug)) || null;
  }

  // ============== 内部方法 ==============

  /**
   * 获取单篇文章（包含渲染内容）
   * 使用限流和重试机制
   */
  private async getPostWithContent(page: NotionPage): Promise<Post | null> {
    try {
      const metadata = this.extractMetadata(page);

      if (!metadata.slug) {
        console.error(`[NotionService] Post ${page.id} has empty slug. Title: "${metadata.title}"`);
        return null;
      }

      // 使用限流器控制并发，使用重试助手处理错误
      const html = await notionRateLimiter.execute(() =>
        notionRetryHelper.execute(
          () => this.renderer.renderPage(page.id),
          `Rendering page ${page.id} to HTML`
        )
      );

      const excerpt = metadata.description || generateExcerpt(html, 200);
      const readingTime = calculateReadingTime(html);

      return {
        ...metadata,
        content: html,
        excerpt,
        readingTime,
      };
    } catch (error) {
      console.error(`[NotionService] Error processing post ${page.id}:`, error);
      return null;
    }
  }

  /**
   * 从 Notion 页面提取元数据
   *
   * 数据库字段名 (全部小写):
   * - title: 标题 (title 类型)
   * - status: 发布状态 (select: Published/Draft)
   * - slug: URL slug (rich_text)
   * - summary: 摘要/描述 (rich_text)
   * - date: 发布日期 (date)
   * - tags: 标签 (multi_select)
   * - type: 内容类型 (select: Post/Page/Menu)
   */
  private extractMetadata(page: NotionPage): Omit<Post, 'content' | 'excerpt' | 'readingTime'> {
    const properties = page.properties as any;

    // 提取标题
    const title = properties.title?.title?.[0]?.plain_text || 'Untitled';

    // 提取 slug
    let slug = properties.slug?.rich_text?.[0]?.plain_text || '';
    if (!slug) {
      slug = slugify(title);
    }
    if (!slug) {
      console.warn(`[NotionService] Empty slug for page ${page.id}, using page ID`);
      slug = page.id.replace(/-/g, '');
    }

    // 提取其他字段
    const description = properties.summary?.rich_text?.[0]?.plain_text || '';
    const publishedAt = properties.date?.date?.start || new Date().toISOString().split('T')[0];
    const updatedAt = properties.updated?.date?.start || null;
    const tags = properties.tags?.multi_select?.map((tag: any) => tag.name) || [];

    // 提取封面图片（在 page 对象顶层）
    let coverUrl = '';
    const cover = (page as any).cover;
    if (cover) {
      if (cover.type === 'external' && cover.external?.url) {
        coverUrl = cover.external.url;
      } else if (cover.type === 'file' && cover.file?.url) {
        coverUrl = cover.file.url;
      }
    }

    // 提取图标（在 page 对象顶层）
    let icon = '';
    const pageIcon = (page as any).icon;
    if (pageIcon) {
      if (pageIcon.type === 'emoji') {
        icon = pageIcon.emoji || '';
      } else if (pageIcon.type === 'external' && pageIcon.external?.url) {
        icon = pageIcon.external.url;
      } else if (pageIcon.type === 'file' && pageIcon.file?.url) {
        icon = pageIcon.file.url;
      }
    }

    return {
      id: page.id,
      title,
      slug,
      description,
      publishedAt,
      updatedAt,
      tags,
      coverUrl,
      icon,
    };
  }
}

// 导出单例
export const notionService = new NotionDataService();
export default notionService;
