import { Client } from '@notionhq/client';
import { NotionAPI } from 'notion-client';
import { mapImageUrl } from './map-image-url';
import type { NotionPage, NotionBlock } from './types';

/**
 * Notion API 客户端
 * 封装基础的 Notion API 调用
 *
 * Note: SDK 5.x 使用 dataSources.query() 而不是 databases.query()
 */
export class NotionClient {
  private client: Client;
  private unofficialApi: NotionAPI;
  private databaseId: string;
  private dataSourceId: string | null = null;
  private dataSourceIdCache: Map<string, string> = new Map();

  constructor(token: string, databaseId: string) {
    if (!token) {
      throw new Error('NOTION_TOKEN is required. Please set it in your .env file.');
    }
    if (!databaseId) {
      throw new Error('NOTION_DATABASE_ID is required. Please set it in your .env file.');
    }

    this.client = new Client({ auth: token });
    this.unofficialApi = new NotionAPI();
    this.databaseId = databaseId;
  }

  /**
   * 获取 data source ID (SDK 5.x 需要)
   */
  private async getDataSourceId(): Promise<string> {
    if (this.dataSourceId) {
      return this.dataSourceId;
    }

    try {
      const database = await this.client.databases.retrieve({
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
      console.error('Error getting data source ID:', error);
      throw new Error(`Failed to get data source ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取数据库的元信息（标题、描述、封面和图标）
   */
  async getDatabaseInfo(): Promise<{ title: string; description: string; coverUrl: string; icon: string }> {
    try {
      const database = await this.client.databases.retrieve({
        database_id: this.databaseId,
      });

      // 提取数据库标题
      // @ts-ignore
      const titleArray = database.title || [];
      const title = titleArray.map((t: any) => t.plain_text || '').join('') || '';

      // 提取数据库描述
      // @ts-ignore
      const descArray = database.description || [];
      const description = descArray.map((d: any) => d.plain_text || '').join('') || '';

      // 尝试使用非官方 API 获取封面图和图标
      let coverUrl = '';
      let icon = '';
      try {
        const unofficialData = await this.unofficialApi.getPage(this.databaseId);

        // 尝试从 collection 中获取 cover 和 icon
        if (unofficialData.collection) {
          const collectionId = Object.keys(unofficialData.collection)[0];
          if (collectionId) {
            const collectionData = unofficialData.collection[collectionId];

            // 获取封面 - cover 在 value.cover
            if (collectionData?.value?.cover) {
              const rawCoverUrl = collectionData.value.cover;
              // 转换临时 URL 为永久 URL
              coverUrl = mapImageUrl(rawCoverUrl, {
                id: collectionId,
                type: 'collection'
              });
            }

            // 获取图标 - icon 在 value.icon
            if (collectionData?.value?.icon) {
              const rawIcon = collectionData.value.icon;
              // icon 可能是 emoji 字符串或 URL
              if (rawIcon.startsWith('http')) {
                // 图片 URL，需要转换
                icon = mapImageUrl(rawIcon, {
                  id: collectionId,
                  type: 'collection'
                });
              } else {
                // emoji 字符串，直接使用
                icon = rawIcon;
              }
            }
          }
        }
      } catch (error) {
        console.warn('[NotionClient] Failed to fetch cover/icon via unofficial API:', error);
      }

      return { title, description, coverUrl, icon };
    } catch (error) {
      console.error('Error getting database info:', error);
      // 如果获取失败，返回默认值
      return {
        title: '',
        description: '',
        coverUrl: '',
        icon: '',
      };
    }
  }

  /**
   * 查询 Database 中的所有已发布文章
   *
   * Note: SDK 5.x 使用 dataSources.query() 和 data_source_id
   * 属性名全部为小写 (status, date, type 而不是 Status, Published, Type)
   *
   * 过滤条件:
   * - type = 'Post' (只查询博客文章)
   * - status = 'Published' (只查询已发布的)
   */
  async queryPublishedPosts(): Promise<NotionPage[]> {
    try {
      const dataSourceId = await this.getDataSourceId();

      // @ts-ignore - SDK 5.x uses dataSources.query
      const response = await this.client.dataSources.query({
        data_source_id: dataSourceId,
        filter: {
          and: [
            {
              property: 'type', // 小写! 只查询 type 为 Post 的
              select: {
                equals: 'Post',
              },
            },
            {
              property: 'status', // 小写! 只查询 status 为 Published 的
              select: {
                equals: 'Published',
              },
            },
          ],
        },
        sorts: [
          {
            property: 'date',
            direction: 'descending',
          },
        ],
      });

      return response.results as NotionPage[];
    } catch (error) {
      console.error('Error querying Notion database:', error);
      throw new Error(`Failed to fetch posts from Notion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 查询 Database 中的所有菜单项
   *
   * 过滤条件:
   * - type = 'Menu' (只查询菜单项)
   * - status = 'Published' (只查询已发布的)
   *
   */
  async queryMenuItems(): Promise<NotionPage[]> {
    try {
      const dataSourceId = await this.getDataSourceId();

      // @ts-ignore - SDK 5.x uses dataSources.query
      const response = await this.client.dataSources.query({
        data_source_id: dataSourceId,
        filter: {
          and: [
            {
              property: 'type', // 小写! 只查询 type 为 Menu 的
              select: {
                equals: 'Menu',
              },
            },
            {
              property: 'status', // 小写! 只查询 status 为 Published 的
              select: {
                equals: 'Published',
              },
            },
          ],
        },
        sorts: [
          {
            property: 'date',
            direction: 'descending',
          },
        ]
      });

      return response.results as NotionPage[];
    } catch (error) {
      console.error('Error querying menu items:', error);
      // 菜单查询失败不应该阻塞整个应用，返回空数组
      return [];
    }
  }

  /**
   * 查询 Database 中的所有独立页面
   *
   * 过滤条件:
   * - type = 'Page' (只查询独立页面)
   * - status = 'Published' (只查询已发布的)
   */
  async queryPages(): Promise<NotionPage[]> {
    try {
      const dataSourceId = await this.getDataSourceId();

      // @ts-ignore - SDK 5.x uses dataSources.query
      const response = await this.client.dataSources.query({
        data_source_id: dataSourceId,
        filter: {
          and: [
            {
              property: 'type', // 小写! 只查询 type 为 Page 的
              select: {
                equals: 'Page',
              },
            },
            {
              property: 'status', // 小写! 只查询 status 为 Published 的
              select: {
                equals: 'Published',
              },
            },
          ],
        },
        sorts: [
          {
            property: 'date',
            direction: 'descending',
          },
        ],
      });

      return response.results as NotionPage[];
    } catch (error) {
      console.error('Error querying pages:', error);
      throw new Error(`Failed to fetch pages from Notion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取单个页面的元数据
   */
  async getPage(pageId: string): Promise<NotionPage> {
    try {
      const response = await this.client.pages.retrieve({ page_id: pageId });
      return response as NotionPage;
    } catch (error) {
      console.error(`Error fetching page ${pageId}:`, error);
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
        const response = await this.client.blocks.children.list({
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
      console.error(`Error fetching blocks for page ${pageId}:`, error);
      throw new Error(`Failed to fetch page blocks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取子块（用于嵌套块，如列表项下的子项）
   */
  async getChildBlocks(blockId: string): Promise<NotionBlock[]> {
    try {
      const response = await this.client.blocks.children.list({
        block_id: blockId,
        page_size: 100,
      });

      return response.results as NotionBlock[];
    } catch (error) {
      console.error(`Error fetching child blocks for ${blockId}:`, error);
      return [];
    }
  }

  /**
   * 查询数据库行（用于 child_database 渲染）
   */
  async queryDatabaseRows(
    databaseId: string,
    options: { pageSize?: number } = {}
  ): Promise<{ results: NotionPage[]; hasMore: boolean }> {
    try {
      const dataSourceId = await this.getDataSourceIdForDatabase(databaseId);

      // @ts-ignore - SDK 5.x uses dataSources.query
      const response = await this.client.dataSources.query({
        data_source_id: dataSourceId,
        page_size: options.pageSize || 100,
      });

      return {
        results: response.results as NotionPage[],
        hasMore: response.has_more || false,
      };
    } catch (error) {
      console.error(`Error querying database ${databaseId}:`, error);
      throw new Error(`Failed to query database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取指定数据库的 data source ID
   * 每个数据库都有自己独立的 data source ID
   */
  private async getDataSourceIdForDatabase(databaseId: string): Promise<string> {
    const cached = this.dataSourceIdCache.get(databaseId);
    if (cached) return cached;

    try {
      const database = await this.client.databases.retrieve({
        database_id: databaseId,
      }) as any;

      // @ts-ignore - SDK 5.x returns data_sources array
      const dataSourceId = database.data_sources?.[0]?.id;
      if (!dataSourceId) {
        throw new Error('No data source ID found in database');
      }

      this.dataSourceIdCache.set(databaseId, dataSourceId);
      return dataSourceId;
    } catch (error) {
      console.error('Error getting data source ID:', error);
      throw new Error(`Failed to get data source ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取数据库详细信息（用于 child_database 渲染）
   */
  async retrieveDatabase(databaseId: string): Promise<any> {
    try {
      return await this.client.databases.retrieve({
        database_id: databaseId,
      });
    } catch (error) {
      console.error(`[NotionClient] Failed to retrieve database ${databaseId}:`, error);
      throw error;
    }
  }
}

// 创建单例实例
let clientInstance: NotionClient | null = null;

export function getNotionClient(): NotionClient {
  if (!clientInstance) {
    const token = import.meta.env.NOTION_TOKEN || process.env.NOTION_TOKEN;
    const databaseId = import.meta.env.NOTION_DATABASE_ID || process.env.NOTION_DATABASE_ID;

    clientInstance = new NotionClient(token, databaseId);
  }

  return clientInstance;
}

export default getNotionClient;
