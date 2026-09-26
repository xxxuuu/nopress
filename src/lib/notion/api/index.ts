/**
 * 统一的 Notion API 封装
 * 整合官方 SDK 和非官方 API，内置块级缓存
 */

import { Client } from '@notionhq/client';
import { NotionAPI as NotionAPILib } from 'notion-client';
import { resolveIcon, resolveCover } from '../file-url';
import {
  notionUnofficialRateLimiter,
  notionUnofficialRetryHelper,
} from '../../utils/api-helpers';
import type { NotionPage, NotionBlock, BlockValue, PageData, DatabaseMeta } from './types';

// 重新导出类型
export type { NotionPage, NotionBlock, BlockValue, PageData, DatabaseMeta } from './types';

/**
 * 将可能是无连字符格式的 ID 规范化为带连字符的 UUID（recordMap 的 key 格式）
 */
function toDashedId(id: string): string {
  if (id.includes('-')) return id;
  if (id.length !== 32) return id;
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

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

  // 已成功通过非官方 API 抓取的页面 ID（避免重复请求）
  private fetchedPageIds: Set<string> = new Set();

  constructor(token: string, databaseId: string) {
    if (!token) {
      throw new Error('NOTION_TOKEN is required. Please set it in your .env file.');
    }
    if (!databaseId) {
      throw new Error('NOTION_DATABASE_ID is required. Please set it in your .env file.');
    }

    this.officialClient = new Client({ auth: token });
    // 2026-08 起 Notion 的 Cloudflare 防护拒绝不带 User-Agent 的请求（403）
    // 参见 https://github.com/NotionX/react-notion-x/issues/710
    this.unofficialClient = new NotionAPILib({
      ofetchOptions: {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'accept-language': 'en-US,en;q=0.9',
        },
      },
    });
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

      // 封面与图标（自动缓存）
      //
      // 封面按存储位置解析（归属记录决定代理鉴权，见 file-url.ts）：
      // 1. 官方 API external → 直通
      // 2. collection.cover（旧版存储位置）→ 代理（table=collection）
      // 3. block format.page_cover（现行存储位置）→ 代理（table=block）。
      //    URL 取官方 API 的文件对象而非 recordMap 原始引用（attachment:
      //    形式经代理无法访问）
      let coverUrl = '';
      let icon = '';
      const officialCover = (database as any).cover;

      if (officialCover?.type === 'external') {
        coverUrl = resolveCover(officialCover, { id: this.databaseId, table: 'block' });
      }

      try {
        const pageData = await this.getPageData(this.databaseId);

        const collectionRecord = pageData.collection || {};
        // 兼容原始格式（spaceId 包装的双层 value）和缓存重组格式（单层 value）
        const collectionId = Object.keys(collectionRecord)[0];
        const collectionValue = collectionId
          ? collectionRecord[collectionId]?.value?.value ??
            collectionRecord[collectionId]?.value
          : null;

        if (!coverUrl && collectionValue?.cover) {
          coverUrl = resolveCover(collectionValue.cover, {
            id: collectionId,
            table: 'collection',
          });
        }

        if (collectionValue?.icon) {
          icon = resolveIcon(collectionValue.icon, {
            id: collectionId,
            table: 'collection',
          });
        }

        if (!coverUrl) {
          // 数据库封面实际存放在 collection_view_page block 的 format.page_cover
          // （collection.cover 通常为空）；recordMap 的 key 为带连字符的 UUID，
          // 而 NOTION_DATABASE_ID 可能是无连字符格式，需做两种查找
          const blockMap = pageData.block || {};
          const dbBlock =
            blockMap[toDashedId(this.databaseId)]?.value ??
            blockMap[this.databaseId]?.value;
          const pageCover = (dbBlock as any)?.format?.page_cover as string | undefined;

          if (pageCover) {
            coverUrl = resolveCover(officialCover, {
              id: toDashedId(this.databaseId),
              table: 'block',
            });
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
   *
   * 内置限流 + 429 重试 + 抓取去重：
   * - 限流器控制非官方 API 的全局并发和请求间隔
   * - 已成功抓取过的页面直接从缓存重组数据，不再发起请求
   *
   * 重要：关闭 notion-client 内部的 fetchMissingBlocks / signFileUrls。
   * Notion 新增 spaceId 包装层后，notion-utils 的 getPageContentBlockIds
   * 遍历在根节点即中断，导致 chunk 0 之外的块永远补不齐（图片宽度等
   * format 信息缺失）。这里由 normalizeRecordMap + ensureCompleteRecordMap
   * + signPageFileUrls 自行完成同样的工作。
   */
  async getPageData(pageId: string): Promise<PageData> {
    const normalizedId = pageId.replace(/-/g, '');

    // 已抓取过：从块级缓存重组返回，避免重复请求
    if (this.fetchedPageIds.has(normalizedId)) {
      return this.rebuildPageData();
    }

    const pageData = await notionUnofficialRateLimiter.execute(() =>
      notionUnofficialRetryHelper.execute(
        () => this.unofficialClient.getPage(pageId, {
          concurrency: 2,
          fetchMissingBlocks: false,
          signFileUrls: false,
        }),
        `Fetching page data ${pageId}`
      )
    );

    if (pageData) {
      this.normalizeRecordMap(pageData);
      await this.ensureCompleteRecordMap(pageData);
      await this.signPageFileUrls(pageData);
      this.fetchedPageIds.add(normalizedId);
      this.storePageData(pageData);
    }

    return pageData;
  }

  /**
   * 解包 Notion 新格式的 spaceId 包装层（原地修改）
   * 旧格式：block[id] = { value: {...} }
   * 新格式：block[id] = { value: { value: {...} } }
   */
  private normalizeRecordMap(pageData: PageData): void {
    const tables = ['block', 'collection', 'collection_view'] as const;
    for (const table of tables) {
      const record = pageData[table];
      if (!record) continue;

      for (const [id, entry] of Object.entries(record)) {
        const inner = (entry as any)?.value?.value;
        if (inner) {
          (record as any)[id] = { value: inner };
        }
      }
    }
  }

  /**
   * 获取块引用的所有子块 ID（content 数组 + 同步块引用指针）
   */
  private getBlockReferences(block: BlockValue): string[] {
    const refs: string[] = [...(block.content || [])];
    const transclusionRef = block.format?.transclusion_reference_pointer?.id;
    if (transclusionRef) {
      refs.push(transclusionRef);
    }
    return refs;
  }

  /**
   * 递归补齐 recordMap 中缺失的块
   *
   * 沿 content / transclusion_reference_pointer 引用逐层遍历，
   * 分批请求缺失块并合并，直到整棵块树完整。
   * 无法获取的块用占位符标记，防止死循环。
   */
  private async ensureCompleteRecordMap(pageData: PageData): Promise<void> {
    const blockMap = pageData.block;
    if (!blockMap) return;

    const MAX_ROUNDS = 50;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const pending = new Set<string>();
      for (const entry of Object.values(blockMap)) {
        const block = (entry as any)?.value as BlockValue;
        if (!block) continue;
        for (const ref of this.getBlockReferences(block)) {
          if (!blockMap[ref]) {
            pending.add(ref);
          }
        }
      }

      if (pending.size === 0) {
        return;
      }

      const ids = Array.from(pending);
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        try {
          const res = await this.fetchBlocksGuarded(batch);
          const newBlocks = res?.recordMap?.block || {};

          let added = 0;
          for (const [id, raw] of Object.entries(newBlocks)) {
            const value = (raw as any)?.value?.value ?? (raw as any)?.value;
            if (value && !blockMap[id]) {
              blockMap[id] = { value };
              added++;
            }
          }

          if (added === 0) {
            // 本批没有任何新增（块已删除或无权限），标记占位符避免死循环
            for (const id of batch) {
              if (!blockMap[id]) {
                blockMap[id] = { value: { id, type: 'missing' } };
              }
            }
          }
        } catch (error) {
          console.warn(`[NotionAPI] Failed to complete record map:`, error);
          return;
        }
      }
    }
  }

  /**
   * 为页面内所有文件块（图片/PDF/附件/封面）获取签名 URL
   * notion-client 的 addSignedUrls 是公开方法，传入完整块 ID 列表即可
   */
  private async signPageFileUrls(pageData: PageData): Promise<void> {
    try {
      await (this.unofficialClient as any).addSignedUrls({
        recordMap: pageData,
        contentBlockIds: Object.keys(pageData.block || {}),
      });
    } catch (error) {
      console.warn(`[NotionAPI] Failed to sign file urls:`, error);
    }
  }

  /**
   * 从内部块级缓存重组 PageData
   */
  private rebuildPageData(): PageData {
    const block: Record<string, { value: BlockValue }> = {};
    for (const [id, value] of this.blockCache.entries()) {
      block[id] = { value };
    }

    const collection: Record<string, { value: any }> = {};
    for (const [id, value] of this.collectionCache.entries()) {
      collection[id] = { value };
    }

    const collection_view: Record<string, { value: any }> = {};
    for (const [id, value] of this.viewCache.entries()) {
      collection_view[id] = { value };
    }

    return { block, collection, collection_view };
  }

  /**
   * 存储页面数据到缓存
   *
   * Notion API 格式变化：增加了 spaceId 包装层
   * 旧格式：block[blockId] = { value: {...} }
   * 新格式：block[blockId] = { value: { value: {...} } }
   */
  private storePageData(pageData: PageData): void {
    if (pageData.block) {
      for (const [blockId, blockData] of Object.entries(pageData.block)) {
        // 检测并解包 spaceId 层
        let blockValue = blockData?.value;
        if (blockValue?.value) {
          // 存在 spaceId 包装，取内层 value
          blockValue = blockValue.value;
        }
        if (blockValue) {
          this.blockCache.set(blockId, blockValue);
        }
      }
    }

    if (pageData.collection) {
      for (const [collectionId, collectionData] of Object.entries(pageData.collection)) {
        // collection 也可能有 spaceId 包装
        let collectionValue = collectionData?.value?.value;
        if (!collectionValue && collectionData?.value) {
          collectionValue = collectionData.value;
        }
        if (collectionValue) {
          this.collectionCache.set(collectionId, collectionValue);
        }
      }
    }

    if (pageData.collection_view) {
      for (const [viewId, viewData] of Object.entries(pageData.collection_view)) {
        // collection_view 也可能有 spaceId 包装
        let viewValue = viewData?.value;
        if (viewValue?.value) {
          viewValue = viewValue.value;
        }
        if (viewValue) {
          this.viewCache.set(viewId, viewValue);
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
   * 调用非官方 API 的 getBlocks（带限流和 429 重试）
   */
  private fetchBlocksGuarded(blockIds: string[]): Promise<any> {
    return notionUnofficialRateLimiter.execute(() =>
      notionUnofficialRetryHelper.execute(
        () => this.unofficialClient.getBlocks(blockIds),
        `Fetching blocks (${blockIds.length})`
      )
    );
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
      const response = await this.fetchBlocksGuarded([normalizedId]);

      // 从 response.recordMap.block 中获取块数据
      const recordMap = response?.recordMap;
      if (recordMap?.block) {
        // 存储所有返回的块到缓存（处理 spaceId 包装）
        for (const [id, blockData] of Object.entries(recordMap.block)) {
          let blockValue = (blockData as any)?.value;
          if (blockValue?.value) {
            // 解包 spaceId 层
            blockValue = blockValue.value;
          }
          if (blockValue) {
            this.blockCache.set(id, blockValue);
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
        const childResponse = await this.fetchBlocksGuarded(missingChildIds);
        if (childResponse?.recordMap?.block) {
          for (const [id, blockData] of Object.entries(childResponse.recordMap.block)) {
            let blockValue = (blockData as any)?.value;
            if (blockValue?.value) {
              // 解包 spaceId 层
              blockValue = blockValue.value;
            }
            if (blockValue) {
              this.blockCache.set(id, blockValue);
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
      const response = await this.fetchBlocksGuarded(missingIds);
      if (response?.recordMap?.block) {
        for (const [id, blockData] of Object.entries(response.recordMap.block)) {
          let blockValue = (blockData as any)?.value;
          if (blockValue?.value) {
            // 解包 spaceId 层
            blockValue = blockValue.value;
          }
          if (blockValue) {
            this.blockCache.set(id, blockValue);
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
    this.fetchedPageIds.clear();
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
