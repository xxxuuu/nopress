/**
 * 统一的 Notion API 封装
 * 整合官方 SDK 和非官方 API，内置块级缓存
 */

import { Client } from '@notionhq/client';
import { NotionAPI as NotionAPILib } from 'notion-client';
import { mapImageUrl } from '../map-image-url';
import type { NotionPage, NotionBlock, BlockValue, PageData, DatabaseMeta } from './types';

// 重新导出类型
export type { NotionPage, NotionBlock, BlockValue, PageData, DatabaseMeta } from './types';

/**
 * 统一的 Notion API 封装
 * - 官方 SDK: 数据库查询、页面块获取
 * - 非官方 API: 格式信息、同步块内容
 * - 内置块级缓存（单次构建有效）
 */
export class NotionAPI {
  // 官方 SDK 客户端
  private officialClient: Client;
  // 非官方 API 客户端
  private unofficialClient: NotionAPILib;
  // 主数据库 ID
  private databaseId: string;
  // 主数据库的 data source ID 缓存
  private dataSourceId: string | null = null;
  // 其他数据库的 data source ID 缓存
  private dataSourceIdCache: Map<string, string> = new Map();

  // ======= 块级缓存（内存级，单次构建有效）=======
  private blockCache: Map<string, BlockValue> = new Map();
  private collectionCache: Map<string, any> = new Map();
  private viewCache: Map<string, any> = new Map();
  private signedUrlsCache: Map<string, string> = new Map();  // blockId -> 永久签名 URL

  // 追踪通过同步块获取的块 ID（只有这些块才能通过 getChildBlocksFromCache 返回）
  private syncedBlockIds: Set<string> = new Set();

  constructor(token: string, databaseId: string) {
    if (!token) {
      throw new Error('NOTION_TOKEN is required. Please set it in your .env file.');
    }
    if (!databaseId) {
      throw new Error('NOTION_DATABASE_ID is required. Please set it in your .env file.');
    }

    this.officialClient = new Client({ auth: token });
    this.unofficialClient = new NotionAPILib();
    this.databaseId = databaseId;
  }

  // ============== 数据库操作 ==============

  /**
   * 获取主数据库的 data source ID (SDK 5.x 需要)
   */
  private async getDataSourceId(): Promise<string> {
    if (this.dataSourceId) {
      return this.dataSourceId;
    }

    try {
      const database = await this.officialClient.databases.retrieve({
        database_id: this.databaseId,
      });

      // @ts-ignore - SDK 5.x returns data_sources array
      const dataSourceId = database.data_sources?.[0]?.id;
      if (!dataSourceId) {
        throw new Error('No data source ID found in database');
      }

      this.dataSourceId = dataSourceId;
      return dataSourceId;
    } catch (error) {
      console.error('[NotionAPI] Error getting data source ID:', error);
      throw new Error(`Failed to get data source ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取指定数据库的 data source ID
   */
  private async getDataSourceIdForDatabase(databaseId: string): Promise<string> {
    const cached = this.dataSourceIdCache.get(databaseId);
    if (cached) return cached;

    try {
      const database = await this.officialClient.databases.retrieve({
        database_id: databaseId,
      }) as any;

      const dataSourceId = database.data_sources?.[0]?.id;
      if (!dataSourceId) {
        throw new Error('No data source ID found in database');
      }

      this.dataSourceIdCache.set(databaseId, dataSourceId);
      return dataSourceId;
    } catch (error) {
      console.error('[NotionAPI] Error getting data source ID:', error);
      throw new Error(`Failed to get data source ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取数据库元信息（标题、描述、封面、图标）
   */
  async getDatabaseMeta(): Promise<DatabaseMeta> {
    try {
      const database = await this.officialClient.databases.retrieve({
        database_id: this.databaseId,
      });

      // @ts-ignore
      const titleArray = database.title || [];
      const title = titleArray.map((t: any) => t.plain_text || '').join('') || '';

      // @ts-ignore
      const descArray = database.description || [];
      const description = descArray.map((d: any) => d.plain_text || '').join('') || '';

      // 使用非官方 API 获取封面和图标（自动缓存）
      let coverUrl = '';
      let icon = '';
      try {
        const pageData = await this.getPageData(this.databaseId);

        if (pageData.collection) {
          const collectionId = Object.keys(pageData.collection)[0];
          if (collectionId) {
            const collectionData = pageData.collection[collectionId];

            if (collectionData?.value?.value?.cover) {
              coverUrl = mapImageUrl(collectionData.value.value.cover, {
                id: collectionId,
                type: 'collection'
              });
            }

            if (collectionData?.value?.value?.icon) {
              const rawIcon = collectionData.value.value.icon;
              if (rawIcon.startsWith('http')) {
                icon = mapImageUrl(rawIcon, {
                  id: collectionId,
                  type: 'collection'
                });
              } else {
                icon = rawIcon;
              }
            }
          }
        }
      } catch (error) {
        console.warn('[NotionAPI] Failed to fetch cover/icon:', error);
      }

      return { title, description, coverUrl, icon };
    } catch (error) {
      console.error('[NotionAPI] Error getting database meta:', error);
      return { title: '', description: '', coverUrl: '', icon: '' };
    }
  }

  /**
   * 查询已发布文章 (type=Post, status=Published)
   */
  async queryPublishedPosts(): Promise<NotionPage[]> {
    try {
      const dataSourceId = await this.getDataSourceId();

      // @ts-ignore - SDK 5.x uses dataSources.query
      const response = await this.officialClient.dataSources.query({
        data_source_id: dataSourceId,
        filter: {
          and: [
            { property: 'type', select: { equals: 'Post' } },
            { property: 'status', select: { equals: 'Published' } },
          ],
        },
        sorts: [{ property: 'date', direction: 'descending' }],
      });

      return response.results as NotionPage[];
    } catch (error) {
      console.error('[NotionAPI] Error querying posts:', error);
      throw new Error(`Failed to fetch posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 查询菜单项 (type=Menu, status=Published)
   */
  async queryMenuItems(): Promise<NotionPage[]> {
    try {
      const dataSourceId = await this.getDataSourceId();

      // @ts-ignore
      const response = await this.officialClient.dataSources.query({
        data_source_id: dataSourceId,
        filter: {
          and: [
            { property: 'type', select: { equals: 'Menu' } },
            { property: 'status', select: { equals: 'Published' } },
          ],
        },
        sorts: [{ property: 'date', direction: 'ascending' }],
      });

      return response.results as NotionPage[];
    } catch (error) {
      console.error('[NotionAPI] Error querying menu items:', error);
      return [];
    }
  }

  /**
   * 查询独立页面 (type=Page, status=Published)
   */
  async queryPages(): Promise<NotionPage[]> {
    try {
      const dataSourceId = await this.getDataSourceId();

      // @ts-ignore
      const response = await this.officialClient.dataSources.query({
        data_source_id: dataSourceId,
        filter: {
          and: [
            { property: 'type', select: { equals: 'Page' } },
            { property: 'status', select: { equals: 'Published' } },
          ],
        },
        sorts: [{ property: 'date', direction: 'descending' }],
      });

      return response.results as NotionPage[];
    } catch (error) {
      console.error('[NotionAPI] Error querying pages:', error);
      throw new Error(`Failed to fetch pages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 查询子数据库行（用于 child_database 渲染）
   */
  async queryDatabaseRows(
    databaseId: string,
    options: { pageSize?: number } = {}
  ): Promise<{ results: NotionPage[]; hasMore: boolean }> {
    try {
      const dataSourceId = await this.getDataSourceIdForDatabase(databaseId);

      // @ts-ignore
      const response = await this.officialClient.dataSources.query({
        data_source_id: dataSourceId,
        page_size: options.pageSize || 100,
      });

      return {
        results: response.results as NotionPage[],
        hasMore: response.has_more || false,
      };
    } catch (error) {
      console.error(`[NotionAPI] Error querying database ${databaseId}:`, error);
      throw new Error(`Failed to query database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取数据库详细信息
   */
  async retrieveDatabase(databaseId: string): Promise<any> {
    try {
      return await this.officialClient.databases.retrieve({
        database_id: databaseId,
      });
    } catch (error) {
      console.error(`[NotionAPI] Failed to retrieve database ${databaseId}:`, error);
      throw error;
    }
  }

  // ============== 页面操作 ==============

  /**
   * 获取单个页面元数据
   */
  async getPage(pageId: string): Promise<NotionPage> {
    try {
      const response = await this.officialClient.pages.retrieve({ page_id: pageId });
      return response as NotionPage;
    } catch (error) {
      console.error(`[NotionAPI] Error fetching page ${pageId}:`, error);
      throw new Error(`Failed to fetch page: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取页面的所有内容块（支持分页）
   */
  async getPageBlocks(pageId: string): Promise<NotionBlock[]> {
    try {
      const blocks: NotionBlock[] = [];
      let cursor: string | undefined = undefined;

      while (true) {
        const response = await this.officialClient.blocks.children.list({
          block_id: pageId,
          start_cursor: cursor,
          page_size: 100,
        });

        blocks.push(...(response.results as NotionBlock[]));

        if (!response.has_more || !response.next_cursor) {
          break;
        }

        cursor = response.next_cursor;
      }

      return blocks;
    } catch (error) {
      console.error(`[NotionAPI] Error fetching blocks for page ${pageId}:`, error);
      throw new Error(`Failed to fetch page blocks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取子块（用于嵌套块）
   */
  async getChildBlocks(blockId: string): Promise<NotionBlock[]> {
    try {
      const response = await this.officialClient.blocks.children.list({
        block_id: blockId,
        page_size: 100,
      });

      return response.results as NotionBlock[];
    } catch (error) {
      console.error(`[NotionAPI] Error fetching child blocks for ${blockId}:`, error);
      return [];
    }
  }

  // ============== 非官方 API + 缓存 ==============

  /**
   * 获取页面完整数据（非官方 API，自动缓存）
   * 用于获取块格式、同步块内容等官方 API 不提供的信息
   */
  async getPageData(pageId: string): Promise<PageData> {
    const pageData = await this.unofficialClient.getPage(pageId);

    // 自动存储到缓存
    if (pageData) {
      this.storePageData(pageData);
    }

    return pageData;
  }

  /**
   * 存储页面数据到缓存
   */
  private storePageData(pageData: PageData): void {
    if (pageData.block) {
      for (const [blockId, blockData] of Object.entries(pageData.block)) {
        if (blockData?.value) {
          this.blockCache.set(blockId, blockData.value);
        }
      }
    }

    if (pageData.collection) {
      for (const [collectionId, collectionData] of Object.entries(pageData.collection)) {
        if (collectionData?.value?.value) {
          this.collectionCache.set(collectionId, collectionData.value.value);
        }
      }
    }

    if (pageData.collection_view) {
      for (const [viewId, viewData] of Object.entries(pageData.collection_view)) {
        if (viewData?.value) {
          this.viewCache.set(viewId, viewData.value);
        }
      }
    }

    // 保存 signed_urls（用于文件/PDF 的永久 URL）
    if (pageData.signed_urls) {
      for (const [blockId, signedUrl] of Object.entries(pageData.signed_urls)) {
        if (signedUrl) {
          this.signedUrlsCache.set(blockId, signedUrl);
        }
      }
    }
  }

  /**
   * 获取块的 format 信息（从缓存）
   */
  getBlockFormat(blockId: string): any {
    const block = this.blockCache.get(blockId);
    return block?.format ?? {};
  }

  /**
   * 获取块的签名 URL（从缓存）
   * 用于获取文件/PDF 的永久 URL
   */
  getSignedUrl(blockId: string): string | null {
    // 尝试原始 ID 和标准化 ID（去掉连字符）
    const normalizedId = blockId.replace(/-/g, '');
    return this.signedUrlsCache.get(blockId) ||
           this.signedUrlsCache.get(normalizedId) ||
           null;
  }

  /**
   * 获取 collection 数据（从缓存）
   */
  getCollection(collectionId: string): any | null {
    return this.collectionCache.get(collectionId) ?? null;
  }

  /**
   * 获取所有 collection_view 条目
   */
  getCollectionViewEntries(): [string, any][] {
    return Array.from(this.viewCache.entries());
  }

  /**
   * 获取同步块的子块内容（缓存优先，未命中时通过 getBlocks 获取）
   *
   * 非官方 API 的同步块类型：
   * - transclusion_container: 原始同步块（包含内容）
   * - transclusion_reference: 同步副本（指向原始块）
   */
  async getSyncedBlockContent(blockId: string): Promise<BlockValue[]> {
    // 标准化 ID 格式（去掉连字符）
    const normalizedId = blockId.replace(/-/g, '');

    // 检查缓存（尝试两种格式）
    let block = this.blockCache.get(blockId) || this.blockCache.get(normalizedId);

    if (block?.content && block.content.length > 0) {
      const children: BlockValue[] = [];
      for (const childId of block.content) {
        const childBlock = this.blockCache.get(childId);
        if (childBlock) {
          children.push(childBlock);
          // 标记为同步块来源
          this.syncedBlockIds.add(childId);
        }
      }
      if (children.length > 0) {
        // 递归确保所有嵌套子块都在缓存中
        await this.ensureNestedBlocksCached(children);
        return children;
      }
    }

    // 缓存未命中，使用 getBlocks 获取指定块
    try {
      // 非官方 API 通常使用不带连字符的 ID
      const response = await this.unofficialClient.getBlocks([normalizedId]);

      // 从 response.recordMap.block 中获取块数据
      const recordMap = response?.recordMap;
      if (recordMap?.block) {
        // 存储所有返回的块到缓存
        for (const [id, blockData] of Object.entries(recordMap.block)) {
          if ((blockData as any)?.value) {
            this.blockCache.set(id, (blockData as any).value);
          }
        }
      }

      // 尝试两种格式获取目标块
      const blockValue = this.blockCache.get(normalizedId) || this.blockCache.get(blockId);

      if (!blockValue?.content) {
        return [];
      }

      // 获取子块（可能需要单独获取）
      const missingChildIds = blockValue.content.filter(
        (id: string) => !this.blockCache.has(id)
      );

      if (missingChildIds.length > 0) {
        const childResponse = await this.unofficialClient.getBlocks(missingChildIds);
        if (childResponse?.recordMap?.block) {
          for (const [id, blockData] of Object.entries(childResponse.recordMap.block)) {
            if ((blockData as any)?.value) {
              this.blockCache.set(id, (blockData as any).value);
            }
          }
        }
      }

      const children: BlockValue[] = [];
      for (const childId of blockValue.content) {
        const childBlock = this.blockCache.get(childId);
        if (childBlock) {
          children.push(childBlock);
          // 标记为同步块来源
          this.syncedBlockIds.add(childId);
        }
      }

      // 递归获取所有嵌套子块
      await this.ensureNestedBlocksCached(children);

      return children;
    } catch (error) {
      console.warn(`[SyncedBlock] Failed to fetch synced block ${blockId}:`, error);
      return [];
    }
  }


  /**
   * 从缓存获取块的子块（用于渲染同步块内的嵌套内容）
   * @returns 子块数组，如果缓存中没有完整数据则返回 null
   */
  getChildBlocksFromCache(blockId: string): BlockValue[] | null {
    // 标准化 ID 格式
    const normalizedId = blockId.replace(/-/g, '');

    // 只对同步块来源的块使用缓存
    // 如果父块不在 syncedBlockIds 中，返回 null 让调用方使用官方 API
    if (!this.syncedBlockIds.has(blockId) && !this.syncedBlockIds.has(normalizedId)) {
      return null;
    }

    const block = this.blockCache.get(blockId) || this.blockCache.get(normalizedId);

    if (!block?.content || block.content.length === 0) {
      return null;
    }

    const children: BlockValue[] = [];
    for (const childId of block.content) {
      const childBlock = this.blockCache.get(childId);
      if (childBlock) {
        children.push(childBlock);
      } else {
        // 如果有任何子块缺失，返回 null，让调用方使用官方 API
        return null;
      }
    }

    return children;
  }


  /**
   * 递归确保所有嵌套子块都在缓存中
   * 用于同步块渲染，确保嵌套内容可以从缓存获取
   */
  private async ensureNestedBlocksCached(blocks: BlockValue[]): Promise<void> {
    const missingIds: string[] = [];

    // 收集所有缺失的子块 ID，并标记已有的子块
    for (const block of blocks) {
      if (block.content && block.content.length > 0) {
        for (const childId of block.content) {
          // 标记为同步块来源
          this.syncedBlockIds.add(childId);
          if (!this.blockCache.has(childId)) {
            missingIds.push(childId);
          }
        }
      }
    }

    if (missingIds.length === 0) {
      return;
    }

    try {
      const response = await this.unofficialClient.getBlocks(missingIds);
      if (response?.recordMap?.block) {
        for (const [id, blockData] of Object.entries(response.recordMap.block)) {
          if ((blockData as any)?.value) {
            this.blockCache.set(id, (blockData as any).value);
            // 标记为同步块来源
            this.syncedBlockIds.add(id);
          }
        }
      }

      // 递归处理新获取的块
      const newBlocks: BlockValue[] = [];
      for (const id of missingIds) {
        const block = this.blockCache.get(id);
        if (block) {
          newBlocks.push(block);
        }
      }

      if (newBlocks.length > 0) {
        await this.ensureNestedBlocksCached(newBlocks);
      }
    } catch (error) {
      console.warn(`[SyncedBlock] Failed to fetch nested blocks:`, error);
    }
  }

  // ============== 缓存管理 ==============

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { blocks: number; collections: number; views: number } {
    return {
      blocks: this.blockCache.size,
      collections: this.collectionCache.size,
      views: this.viewCache.size,
    };
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.blockCache.clear();
    this.collectionCache.clear();
    this.viewCache.clear();
  }
}

// ============== 全局单例 ==============

let apiInstance: NotionAPI | null = null;

/**
 * 获取 NotionAPI 单例
 */
export function getNotionAPI(): NotionAPI {
  if (!apiInstance) {
    const token = import.meta.env.NOTION_TOKEN || process.env.NOTION_TOKEN;
    const databaseId = import.meta.env.NOTION_DATABASE_ID || process.env.NOTION_DATABASE_ID;
    apiInstance = new NotionAPI(token, databaseId);
  }
  return apiInstance;
}

/**
 * 全局单例（延迟初始化）
 */
export const notionAPI = {
  get instance(): NotionAPI {
    return getNotionAPI();
  },

  // 代理方法，便于直接使用
  queryPublishedPosts: () => getNotionAPI().queryPublishedPosts(),
  queryMenuItems: () => getNotionAPI().queryMenuItems(),
  queryPages: () => getNotionAPI().queryPages(),
  getDatabaseMeta: () => getNotionAPI().getDatabaseMeta(),
  getPage: (pageId: string) => getNotionAPI().getPage(pageId),
  getPageBlocks: (pageId: string) => getNotionAPI().getPageBlocks(pageId),
  getPageData: (pageId: string) => getNotionAPI().getPageData(pageId),
  getBlockFormat: (blockId: string) => getNotionAPI().getBlockFormat(blockId),
  getSignedUrl: (blockId: string) => getNotionAPI().getSignedUrl(blockId),
  getCollectionViewEntries: () => getNotionAPI().getCollectionViewEntries(),
  getSyncedBlockContent: (blockId: string) => getNotionAPI().getSyncedBlockContent(blockId),
  getChildBlocksFromCache: (blockId: string) => getNotionAPI().getChildBlocksFromCache(blockId),
  queryDatabaseRows: (databaseId: string, options?: { pageSize?: number }) =>
    getNotionAPI().queryDatabaseRows(databaseId, options),
  retrieveDatabase: (databaseId: string) => getNotionAPI().retrieveDatabase(databaseId),
  getCacheStats: () => getNotionAPI().getCacheStats(),
  clearCache: () => getNotionAPI().clearCache(),
};
