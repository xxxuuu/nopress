import type { NotionClient } from './client';
import type { NotionPage } from './types';
import type { NotionPageRenderer } from './renderer';
import type { Post } from '../types';
import { slugify } from '../utils/slug';
import { calculateReadingTime, generateExcerpt } from '../utils/format';
import { notionRateLimiter, notionRetryHelper } from '../utils/api-helpers';

/**
 * Notion 查询方法
 * 提供高级查询接口，处理元数据提取和内容转换
 * 使用限流和重试机制优化 API 调用
 */
export class NotionQueries {
  constructor(
    private client: NotionClient,
    private renderer: NotionPageRenderer
  ) {}

  /**
   * 获取所有已发布的文章
   */
  async getAllPosts(): Promise<Post[]> {
    const pages = await this.client.queryPublishedPosts();

    // 并行获取所有文章内容
    const posts = await Promise.all(
      pages.map(page => this.getPostWithContent(page))
    );

    return posts.filter((post): post is Post => post !== null);
  }

  /**
   * 获取所有独立页面（type=Page）
   */
  async getAllPages(): Promise<Post[]> {
    const pages = await this.client.queryPages();

    // 并行获取所有页面内容
    const pageContents = await Promise.all(
      pages.map(page => this.getPostWithContent(page))
    );

    return pageContents.filter((page): page is Post => page !== null);
  }

  /**
   * 根据 slug 获取单篇文章
   */
  async getPostBySlug(slug: string): Promise<Post | null> {
    const posts = await this.getAllPosts();
    return posts.find(post => post.slug === slug) || null;
  }

  /**
   * 获取单篇文章（包含内容）
   * 使用限流和重试机制
   */
  async getPostWithContent(page: NotionPage): Promise<Post | null> {
    try {
      const metadata = this.extractMetadata(page);

      // 验证必需字段
      if (!metadata.slug) {
        console.error(`[NotionQueries] Post ${page.id} has empty slug. Title: "${metadata.title}"`);
        return null;
      }

      // 使用限流器控制并发，使用重试助手处理错误
      const html = await notionRateLimiter.execute(() =>
        notionRetryHelper.execute(
          () => this.renderer.renderPage(page.id),
          `Rendering page ${page.id} to HTML`
        )
      );

      // 生成摘要和阅读时间
      const excerpt = metadata.description || generateExcerpt(html, 200);
      const readingTime = calculateReadingTime(html);

      return {
        ...metadata,
        content: html,
        excerpt,
        readingTime,
      };
    } catch (error) {
      console.error(`[NotionQueries] Error processing post ${page.id}:`, error);
      return null;
    }
  }

  /**
   * 从 Notion 页面提取元数据
   *
   * 实际数据库字段名 (全部小写):
   * - title: 标题 (title 类型)
   * - status: 发布状态 (select 类型: Published/Draft)
   * - slug: URL slug (rich_text 类型)
   * - summary: 摘要/描述 (rich_text 类型)
   * - date: 发布日期 (date 类型)
   * - tags: 标签 (multi_select 类型)
   * - type: 内容类型 (select 类型: Post/Page/Menu)
   *
   * 注意: cover 和 icon 属性在 page 对象的顶层，不是在 properties 中
   */
  private extractMetadata(page: NotionPage): Omit<Post, 'content' | 'excerpt' | 'readingTime'> {
    const properties = page.properties as any;

    // 提取标题 (title 类型，字段名是 title 不是 Title)
    const title = properties.title?.title?.[0]?.plain_text || 'Untitled';

    // 提取 slug (rich_text 类型，字段名是 slug 不是 Slug)
    let slug = properties.slug?.rich_text?.[0]?.plain_text || '';
    if (!slug) {
      slug = slugify(title);
    }

    // 最后的安全检查：如果 slug 仍然为空，使用 page ID 作为后备
    if (!slug) {
      console.warn(`[NotionQueries] Empty slug for page ${page.id} (title: "${title}"), using page ID as fallback`);
      slug = page.id.replace(/-/g, '');
    }

    // 提取描述 (rich_text 类型，字段名是 summary 不是 Description)
    const description = properties.summary?.rich_text?.[0]?.plain_text || '';

    // 提取发布日期 (date 类型，字段名是 date 不是 Published)
    const publishedAt = properties.date?.date?.start || new Date().toISOString().split('T')[0];

    // 提取更新日期 (如果有 updated 字段)
    const updatedAt = properties.updated?.date?.start || null;

    // 提取标签 (multi_select 类型，字段名是 tags 不是 Tags)
    const tags = properties.tags?.multi_select?.map((tag: any) => tag.name) || [];

    // 提取封面图片（cover 在 page 对象顶层，不是 properties 中）
    let coverUrl = '';
    const cover = (page as any).cover;
    if (cover) {
      if (cover.type === 'external' && cover.external?.url) {
        coverUrl = cover.external.url;
      } else if (cover.type === 'file' && cover.file?.url) {
        coverUrl = cover.file.url;
      }
    }

    // 提取图标（icon 在 page 对象顶层，不是 properties 中）
    let icon = '';
    const pageIcon = (page as any).icon;
    if (pageIcon) {
      if (pageIcon.type === 'emoji') {
        // emoji 类型
        icon = pageIcon.emoji || '';
      } else if (pageIcon.type === 'external' && pageIcon.external?.url) {
        // 外部图片 URL
        icon = pageIcon.external.url;
      } else if (pageIcon.type === 'file' && pageIcon.file?.url) {
        // Notion 托管的图片
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
