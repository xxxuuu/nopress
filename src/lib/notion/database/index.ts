/**
 * Notion Database 渲染器
 * 协调数据获取和布局渲染
 */

import type { BlockObjectResponse } from '@notionhq/client';
import type { NotionClient } from '../client';
import { createDatabaseRepository, type IDatabaseRepository } from './repository';
import { TableLayoutRenderer } from './table-layout';
import { GalleryLayoutRenderer } from './gallery-layout';
import type {
  DatabaseRenderContext,
  DatabaseRenderOptions,
  Database,
  DatabaseSchema,
  QueryOptions,
  ViewConfig,
} from './types';

/**
 * 数据库渲染器
 * 协调数据获取和布局渲染
 */
export class DatabaseRenderer {
  constructor(
    private client: NotionClient,
    private options: DatabaseRenderOptions = {}
  ) {}

  /**
   * 渲染 child_database block
   * @param block - 数据库块
   * @param view - 视图类型
   * @param viewConfig - 视图配置（包含 table_properties、page_sort 等信息）
   */
  async render(
    block: BlockObjectResponse,
    view?: 'table' | 'gallery',
    viewConfig?: { type: 'table' | 'gallery'; config?: any; page_sort?: string[] }
  ): Promise<string> {
    const databaseId = block.id;

    try {
      const repository = createDatabaseRepository(this.client);

      // 构建视图配置（传递给数据层）
      const repoViewConfig: ViewConfig = viewConfig ? {
        tableProperties: viewConfig.config?.table_properties,
        pageSort: viewConfig.page_sort,
      } : undefined;

      // 构建查询选项（用于数据排序）
      const queryOptions: QueryOptions = {
        limit: this.options.maxRows || 100,
        viewConfig: repoViewConfig,
      };

      const [database, schema, rows] = await Promise.all([
        repository.getDatabase(databaseId),
        repository.getSchema(databaseId, repoViewConfig),
        repository.queryRows(databaseId, queryOptions),
      ]);

      const context: DatabaseRenderContext = {
        database,
        schema,
        rows,
      };

      // 使用传入的视图类型，如果没有则使用默认配置
      const layout = view || this.options.layout || 'table';
      const layoutRenderer = layout === 'gallery'
        ? new GalleryLayoutRenderer(this.options, viewConfig?.config)
        : new TableLayoutRenderer(this.options);

      // 注意：行排序和列顺序已在数据层完成
      return layoutRenderer.render(context);
    } catch (error: any) {
      console.error(`[DatabaseRenderer] Failed to query database ${databaseId}:`, error);
      const isAuthError = error?.code === 'unauthorized' ||
                          error?.code === 'object_not_found' ||
                          error?.code === 'forbidden';
      const isApiError = error?.code === 'validation_error' ||
                        error?.code === 'invalid_request';

      if (isAuthError || isApiError) {
        return this.renderFallback(block);
      }

      console.error(`[DatabaseRenderer] Failed to render database ${databaseId}:`, error);
      return this.renderError(error);
    }
  }

  /**
   * 渲染降级 UI（当 API 无法访问时）
   */
  private renderFallback(block: BlockObjectResponse): string {
    const childDatabase = (block as any).child_database;
    const title = childDatabase?.title || 'Database';

    return `<div class="notion-child-database">
      <div class="notion-child-database-title">
        🗄️ ${this.escapeHtml(title)}
      </div>
      <div class="notion-database-error">
        <p>⚠️ 此数据库需要额外权限才能访问</p>
      </div>
    </div>`;
  }

  /**
   * 渲染错误占位符
   */
  private renderError(error: any): string {
    const message = error?.message || 'Unknown error';
    return `<div class="notion-database-error">
      <p>⚠️ 无法加载数据库内容</p>
      <p class="notion-database-error-detail">${this.escapeHtml(message)}</p>
    </div>`;
  }

  /**
   * 转义 HTML 实体
   */
  private escapeHtml(str: string): string {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return str.replace(/[&<>"']/g, char => htmlEntities[char]);
  }
}

/**
 * 创建数据库渲染器实例
 */
export function createDatabaseRenderer(
  client: NotionClient,
  options?: DatabaseRenderOptions
): DatabaseRenderer {
  return new DatabaseRenderer(client, options);
}
