/**
 * Notion 渲染器主入口
 * 使用统一的 notionAPI 单例
 */

import type { RenderOptions } from './types';
import { NotionBlockRenderer } from './block-renderer';
import { createDatabaseRenderer } from '../database';
import { notionAPI } from '../api';

/**
 * 完整的 Notion 页面渲染器
 */
export class NotionPageRenderer {
  private blockRenderer: NotionBlockRenderer;
  private databaseRenderer: ReturnType<typeof createDatabaseRenderer>;

  constructor(options: RenderOptions = {}) {
    this.blockRenderer = new NotionBlockRenderer(options);
    this.databaseRenderer = createDatabaseRenderer({
      layout: 'table',
      maxRows: 100,
    });

    // 注入方法到 blockRenderer（使用全局 notionAPI）
    // fetchChildBlocks 先检查缓存（用于同步块嵌套内容），再用官方 API
    this.blockRenderer['fetchChildBlocks'] = async (blockId: string) => {
      const cached = notionAPI.getChildBlocksFromCache(blockId);
      if (cached !== null) {
        return cached.map(block => this.convertUnofficialBlock(block));
      }
      return notionAPI.getPageBlocks(blockId);
    };
    this.blockRenderer['getBlockFormat'] = (blockId: string) => notionAPI.getBlockFormat(blockId);
    this.blockRenderer['databaseRenderer'] = (block: any) => this.renderChildDatabase(block);
    this.blockRenderer['fetchSyncedBlockContent'] = (blockId: string) => this.fetchSyncedBlockContent(blockId);
  }

  /**
   * 渲染整个页面为 HTML
   */
  async renderPage(pageId: string): Promise<string> {
    try {
      // 预获取页面数据（自动缓存格式信息）
      try {
        await notionAPI.getPageData(pageId);
      } catch (error) {
        console.warn(`[NotionRenderer] Failed to fetch format data:`, error);
        // 格式获取失败，继续渲染（不带样式）
      }

      // 获取页面块
      const blocks = await notionAPI.getPageBlocks(pageId);

      if (!blocks || blocks.length === 0) {
        return '<p><em>No content available.</em></p>';
      }

      // 渲染为 HTML
      return await this.blockRenderer.renderBlocks(blocks);
    } catch (error) {
      console.error(`[NotionRenderer] Error rendering page ${pageId}:`, error);
      return '<p><em>Error loading content.</em></p>';
    }
  }

  /**
   * 渲染子数据库
   */
  private async renderChildDatabase(block: any): Promise<string> {
    try {
      const format = notionAPI.getBlockFormat(block.id);

      // 尝试从 block format 中获取视图信息
      let viewConfig = this.extractViewConfig(format);

      // 如果没有找到视图配置（child_database 使用不同的 collection），单独获取
      if (!viewConfig.config) {
        viewConfig = await this.fetchDatabaseViewConfig(block.id);
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
  private async fetchDatabaseViewConfig(blockId: string): Promise<{ type: 'table' | 'gallery'; config?: any; page_sort?: string[] }> {
    try {
      // 获取数据（自动缓存）
      await notionAPI.getPageData(blockId);

      // 从缓存提取视图配置
      const newFormat = notionAPI.getBlockFormat(blockId);
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
      for (const [, view] of notionAPI.getCollectionViewEntries()) {
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

  /**
   * 获取同步块的原始内容
   */
  private async fetchSyncedBlockContent(blockId: string): Promise<any[]> {
    try {
      const children = await notionAPI.getSyncedBlockContent(blockId);
      return children.map(block => this.convertUnofficialBlock(block));
    } catch (error) {
      console.warn(`[SyncedBlock] Failed to fetch content:`, error);
      return [];
    }
  }

  /**
   * 将非官方 API 块格式转换为官方 API 格式
   */
  private convertUnofficialBlock(block: any): any {
    const type = block.type;
    const id = block.id;
    const hasChildren = block.content && block.content.length > 0;

    // 基础结构
    const converted: any = {
      id,
      type,
      has_children: hasChildren,
    };

    // 根据类型转换具体内容
    switch (type) {
      case 'text':
        converted.type = 'paragraph';
        converted.paragraph = {
          rich_text: this.convertRichText(block.properties?.title),
          color: block.format?.block_color || 'default',
        };
        break;

      case 'header':
        converted.type = 'heading_1';
        converted.heading_1 = {
          rich_text: this.convertRichText(block.properties?.title),
          is_toggleable: false,
        };
        break;

      case 'sub_header':
        converted.type = 'heading_2';
        converted.heading_2 = {
          rich_text: this.convertRichText(block.properties?.title),
          is_toggleable: false,
        };
        break;

      case 'sub_sub_header':
        converted.type = 'heading_3';
        converted.heading_3 = {
          rich_text: this.convertRichText(block.properties?.title),
          is_toggleable: false,
        };
        break;

      case 'bulleted_list':
        converted.type = 'bulleted_list_item';
        converted.bulleted_list_item = {
          rich_text: this.convertRichText(block.properties?.title),
        };
        break;

      case 'numbered_list':
        converted.type = 'numbered_list_item';
        converted.numbered_list_item = {
          rich_text: this.convertRichText(block.properties?.title),
        };
        break;

      case 'to_do':
        converted.type = 'to_do';
        converted.to_do = {
          rich_text: this.convertRichText(block.properties?.title),
          checked: block.properties?.checked?.[0]?.[0] === 'Yes',
        };
        break;

      case 'code':
        converted.type = 'code';
        converted.code = {
          rich_text: this.convertRichText(block.properties?.title),
          language: block.properties?.language?.[0]?.[0] || 'plaintext',
          caption: [],
        };
        break;

      case 'quote':
        converted.type = 'quote';
        converted.quote = {
          rich_text: this.convertRichText(block.properties?.title),
        };
        break;

      case 'callout':
        converted.type = 'callout';
        converted.callout = {
          rich_text: this.convertRichText(block.properties?.title),
          icon: block.format?.page_icon
            ? { type: 'emoji', emoji: block.format.page_icon }
            : null,
          color: block.format?.block_color || 'default',
        };
        break;

      case 'image':
        converted.type = 'image';
        const imageUrl = block.properties?.source?.[0]?.[0] || block.format?.display_source;
        converted.image = {
          type: imageUrl?.startsWith('http') ? 'external' : 'file',
          [imageUrl?.startsWith('http') ? 'external' : 'file']: { url: imageUrl },
          caption: this.convertRichText(block.properties?.caption),
        };
        break;

      case 'divider':
        converted.type = 'divider';
        converted.divider = {};
        break;

      default:
        // 其他类型保持原样，让 block-renderer 处理
        converted[type] = block.properties || {};
    }

    return converted;
  }

  /**
   * 转换富文本格式
   */
  private convertRichText(properties: any): any[] {
    if (!properties || !Array.isArray(properties)) {
      return [];
    }

    return properties.map((item: any) => {
      const text = item[0] || '';
      const annotations = item[1] || [];

      const richText: any = {
        type: 'text',
        text: { content: text, link: null },
        plain_text: text,
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: false,
          color: 'default',
        },
      };

      // 解析格式标记
      for (const ann of annotations) {
        if (ann[0] === 'b') richText.annotations.bold = true;
        if (ann[0] === 'i') richText.annotations.italic = true;
        if (ann[0] === 's') richText.annotations.strikethrough = true;
        if (ann[0] === '_') richText.annotations.underline = true;
        if (ann[0] === 'c') richText.annotations.code = true;
        if (ann[0] === 'a') richText.text.link = { url: ann[1] };
        if (ann[0] === 'h') richText.annotations.color = ann[1];
      }

      return richText;
    });
  }
}

/**
 * 工厂函数（简化，不再需要 client 参数）
 */
export function createPageRenderer(options?: RenderOptions): NotionPageRenderer {
  return new NotionPageRenderer(options);
}

// 导出类型
export type { RenderOptions } from './types';
