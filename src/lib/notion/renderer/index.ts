/**
 * Notion 渲染器主入口
 */

import type { NotionClient } from '../client';
import type { RenderOptions } from './types';
import { NotionBlockRenderer } from './block-renderer';
import { NotionAPI } from 'notion-client';
import { createDatabaseRenderer } from '../database';

/**
 * 完整的 Notion 页面渲染器
 */
export class NotionPageRenderer {
  private blockRenderer: NotionBlockRenderer;
  private unofficialApi: NotionAPI;
  private blockFormatCache: Map<string, any> = new Map();
  private collectionCache: Map<string, any> = new Map(); // 缓存 collection 数据
  private collectionViewCache: Map<string, any> = new Map(); // 缓存 collection_view 数据
  private databaseRenderer: ReturnType<typeof createDatabaseRenderer>;

  constructor(private client: NotionClient, options: RenderOptions = {}) {
    this.blockRenderer = new NotionBlockRenderer(options);
    this.unofficialApi = new NotionAPI();
    this.databaseRenderer = createDatabaseRenderer(client, {
      layout: 'table',
      maxRows: 100,
    });

    // 注入 client 到 blockRenderer（用于获取子块）
    this.blockRenderer['fetchChildBlocks'] = (blockId: string) => this.client.getPageBlocks(blockId);

    // 注入 format 获取方法到 blockRenderer
    this.blockRenderer['getBlockFormat'] = (blockId: string) => this.getBlockFormat(blockId);

    // 注入数据库渲染方法到 blockRenderer
    this.blockRenderer['databaseRenderer'] = (block: any) => this.renderChildDatabase(block);
  }

  /**
   * 渲染整个页面为 HTML
   */
  async renderPage(pageId: string): Promise<string> {
    try {
      // 先使用非官方 API 获取完整数据（包含 format 信息）
      let pageData: any;
      try {
        pageData = await this.unofficialApi.getPage(pageId);

        // 缓存所有块的 format 信息
        if (pageData && pageData.block) {
          Object.entries(pageData.block).forEach(([blockId, blockData]: [string, any]) => {
            if (blockData && blockData.value && blockData.value.format) {
              this.blockFormatCache.set(blockId, blockData.value.format);
            }
          });
        }

        // 缓存 collection 数据（包含视图格式信息）
        if (pageData && pageData.collection) {
          Object.entries(pageData.collection).forEach(([collectionId, collectionData]: [string, any]) => {
            if (collectionData && collectionData.value) {
              this.collectionCache.set(collectionId, collectionData.value);
            }
          });
        }

        // 缓存 collection_view 数据
        if (pageData && pageData.collection_view) {
          Object.entries(pageData.collection_view).forEach(([viewId, viewData]: [string, any]) => {
            if (viewData && viewData.value) {
              this.collectionViewCache.set(viewId, viewData.value);
            }
          });
        }
      } catch (error) {
        console.warn(`[NotionRenderer] Failed to fetch format data from unofficial API:`, error);
        // 非官方 API 失败，继续使用官方 API（不带样式）
      }

      // 使用官方 API 获取页面块（保证兼容性）
      const blocks = await this.client.getPageBlocks(pageId);

      if (!blocks || blocks.length === 0) {
        return '<p><em>No content available.</em></p>';
      }

      // 渲染为 HTML
      const html = await this.blockRenderer.renderBlocks(blocks);

      return html;
    } catch (error) {
      console.error(`[NotionRenderer] Error rendering page ${pageId}:`, error);
      return '<p><em>Error loading content.</em></p>';
    }
  }

  /**
   * 获取块的 format 信息（从缓存）
   */
  private getBlockFormat(blockId: string): any {
    return this.blockFormatCache.get(blockId) || {};
  }

  /**
   * 渲染子数据库
   */
  private async renderChildDatabase(block: any): Promise<string> {
    try {
      const format = this.getBlockFormat(block.id);

      // 尝试从 block format 中获取视图信息
      let viewConfig = this.extractViewConfig(format);

      // 如果没有找到视图配置（child_database 使用不同的 collection），单独获取
      if (!viewConfig.config) {
        viewConfig = await this.fetchDatabaseViewConfig(block.id, format);
      }

      return await this.databaseRenderer.render(block, viewConfig.type, viewConfig);
    } catch (error) {
      console.warn(`[NotionRenderer] Failed to render child database:`, error);
      return `<div class="notion-child-database-error">
        <p>⚠️ 无法加载数据库内容</p>
      </div>`;
    }
  }

  /**
   * 为 child_database 单独获取视图配置
   */
  private async fetchDatabaseViewConfig(blockId: string, format: any): Promise<{ type: 'table' | 'gallery'; config?: any; page_sort?: string[] }> {
    try {
      // 使用非官方 API 获取该 child_database 的完整数据
      const dbData = await this.unofficialApi.getPage(blockId);

      if (!dbData) {
        return { type: 'table' };
      }

      // 缓存 block 的 format（包含视图配置）
      if (dbData.block && dbData.block[blockId]?.value?.format) {
        this.blockFormatCache.set(blockId, dbData.block[blockId].value.format);
      }

      // 缓存 collection_view 数据
      if (dbData.collection_view) {
        const viewEntries = Object.entries(dbData.collection_view) as [string, any][];
        for (const [viewId, viewData] of viewEntries) {
          if (viewData && typeof viewData === 'object' && 'value' in viewData) {
            this.collectionViewCache.set(viewId, viewData.value);
          }
        }
      }

      // 重新提取视图配置
      const newFormat = this.getBlockFormat(blockId);
      return this.extractViewConfig(newFormat);
    } catch (error) {
      console.warn(`[NotionRenderer] Failed to fetch view config for ${blockId}:`, error);
      return { type: 'table' };
    }
  }

  /**
   * 从 block format 中提取视图配置
   */
  private extractViewConfig(format: any): { type: 'table' | 'gallery'; config?: any; page_sort?: string[] } {
    const targetCollectionId = format?.collection_pointer?.id;

    // 如果 format 中有 collection_pointer，从 collection_view 找到对应的视图
    if (targetCollectionId) {
      for (const [viewId, view] of this.collectionViewCache.entries()) {
        if (view?.format?.collection_pointer?.id === targetCollectionId) {
          const viewType = view.type === 'gallery' ? 'gallery' : 'table';
          return {
            type: viewType,
            config: view.format,
            page_sort: view.page_sort,
          };
        }
      }
    }

    // 检查 format 中的视图信息（直接在 block 上）
    if (format?.type === 'gallery_view' || format?.type === 'gallery') {
      return { type: 'gallery', config: format };
    }

    // 检查子视图集合
    if (format?.views && Array.isArray(format.views) && format.views.length > 0) {
      const firstView = format.views[0];
      if (firstView?.type === 'gallery_view' || firstView?.type === 'gallery') {
        return { type: 'gallery', config: firstView };
      }
    }

    return { type: 'table' }; // 默认表格视图
  }
}

/**
 * 工厂函数
 */
export function createPageRenderer(client: NotionClient, options?: RenderOptions): NotionPageRenderer {
  return new NotionPageRenderer(client, options);
}

// 导出类型
export type { RenderOptions } from './types';
