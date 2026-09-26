/**
 * Notion Database 画廊布局渲染器
 * 负责将数据库数据渲染为卡片画廊
 */

import type {
  DatabaseRenderContext,
  PropertySchema,
  PropertyValue,
  PropertyType,
  Database,
  DatabaseRow,
  DatabaseRenderOptions,
} from './types';
import { escapeHtml } from '../renderer/rich-text';
import { toProxyUrl } from '../file-url';

/** 视图选定的封面来源，与具体行是否有图片无关 */
type GalleryCoverSource =
  | { type: 'page_cover' }
  | { type: 'property'; propertyId: string };

/**
 * 画廊支持的属性类型
 */
const GALLERY_PROPERTY_TYPES: PropertyType[] = [
  'title',
  'text',
  'number',
  'select',
  'multi_select',
  'date',
  'checkbox',
  'url',
];

/**
 * 画廊布局渲染器
 * 将数据库渲染为卡片网格
 */
export class GalleryLayoutRenderer {
  constructor(private options: DatabaseRenderOptions = {}, private viewConfig?: any) {}

  /**
   * 渲染完整画廊
   */
  render(context: DatabaseRenderContext): string {
    const { database, schema, rows } = context;

    // 每个视图只解析一次封面来源，再按行获取图片
    const coverSource = this.resolveCoverSource(schema.properties);
    const titleProperty = this.findPropertyByType(schema.properties, 'title');
    const visibleProperties = this.getVisibleProperties(schema.properties, titleProperty?.id);

    // 获取封面尺寸配置
    const coverSize = this.viewConfig?.gallery_cover_size || 'medium';

    // 生成卡片
    const cards = this.renderCards(rows, {
      coverSource,
      titleProperty,
      visibleProperties,
    });
    const empty = rows.length === 0 ? this.renderEmpty() : '';

    return `
      <div class="notion-database-wrapper notion-database-gallery-wrapper notion-database-gallery-size-${coverSize}">
        <div class="notion-database-gallery">
          ${cards}
          ${empty}
        </div>
      </div>
    `;
  }

  /**
   * 根据 gallery_cover 配置确定封面来源，集中处理属性选择和回退
   */
  private resolveCoverSource(properties: Record<string, PropertySchema>): GalleryCoverSource | undefined {
    const galleryCover = this.viewConfig?.gallery_cover;

    // 页面头图独立于 Files 属性，没有头图时也不回退到字段图片
    if (galleryCover?.type === 'page_cover') return { type: 'page_cover' };

    if (galleryCover?.type === 'property' && galleryCover.property) {
      const prop = Object.values(properties).find(p => p.id === galleryCover.property);
      if (prop) {
        return { type: 'property', propertyId: prop.id };
      }
    }

    // 默认查找第一个 file 类型的属性
    const prop = this.findPropertyByType(properties, 'file');
    return prop ? { type: 'property', propertyId: prop.id } : undefined;
  }

  /**
   * 渲染标题栏
   */
  private renderTitle(database: Database, rowCount: number): string {
    const icon = database.icon ? `<span class="notion-database-icon">${escapeHtml(database.icon)}</span>` : '';
    const title = escapeHtml(database.title);

    return `
      <div class="notion-database-header">
        ${icon}
        <h3 class="notion-database-title">${title}</h3>
        <span class="notion-database-count">${rowCount} 项</span>
      </div>
    `;
  }

  /**
   * 渲染所有卡片
   */
  private renderCards(
    rows: DatabaseRow[],
    config: {
      coverSource?: GalleryCoverSource;
      titleProperty?: PropertySchema;
      visibleProperties: PropertySchema[];
    }
  ): string {
    if (rows.length === 0) return '';
    return rows.map(row => this.renderCard(row, config)).join('');
  }

  /**
   * 渲染单个卡片
   */
  private renderCard(
    row: DatabaseRow,
    config: {
      coverSource?: GalleryCoverSource;
      titleProperty?: PropertySchema;
      visibleProperties: PropertySchema[];
    }
  ): string {
    const { coverSource, titleProperty, visibleProperties } = config;

    // 先解析当前行的封面 URL，再生成 HTML
    const coverUrl = this.resolveCoverUrl(row, coverSource);
    const cover = this.renderCover(coverUrl);

    // 获取标题
    const title = this.renderCardTitle(row, titleProperty);

    // 渲染属性
    const properties = visibleProperties.map(prop => {
      const value = row.properties[prop.id];
      return this.renderProperty(value, prop);
    }).filter(Boolean).join('');

    return `
      <div class="notion-database-card">
        ${cover}
        <div class="notion-database-card-content">
          ${title}
          ${properties ? `<div class="notion-database-card-properties">${properties}</div>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * 从选定来源获取图片并转换 URL；所选来源没有图片时不再回退
   */
  private resolveCoverUrl(row: DatabaseRow, source?: GalleryCoverSource): string | undefined {
    if (!source) return undefined;

    let imageUrl: string | undefined;

    if (source.type === 'page_cover') {
      imageUrl = row.pageCoverUrl;
    } else {
      const value = row.properties[source.propertyId];
      imageUrl = value?.type === 'file' ? value.value?.[0] : undefined;
    }

    // 转换临时 URL 为代理 URL；已解析的页面头图保持不变
    return imageUrl ? toProxyUrl(imageUrl, { id: row.id, table: 'block' }) : undefined;
  }

  /**
   * 根据封面 URL 生成 HTML，不参与来源选择或数据读取
   */
  private renderCover(coverUrl?: string): string {
    // 始终渲染封面容器以保持布局一致
    let imageHtml = '';

    if (coverUrl) {
      imageHtml = `<img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" onload="this.parentElement.classList.add('loaded')" onerror="this.parentElement.classList.add('notion-database-card-cover-error')" />`;
    }

    return `<div class="notion-database-card-cover">${imageHtml}</div>`;
  }

  /**
   * 渲染卡片标题
   */
  private renderCardTitle(row: DatabaseRow, titleProperty?: PropertySchema): string {
    if (!titleProperty) return '';

    const value = row.properties[titleProperty.id];
    const text = value && (value.type === 'title' || value.type === 'text') ? value.value : '';

    if (!text) {
      return `<div class="notion-database-card-title notion-database-empty">Untitled</div>`;
    }

    return `<div class="notion-database-card-title">${escapeHtml(text)}</div>`;
  }

  /**
   * 渲染卡片属性
   */
  private renderProperty(value: PropertyValue | undefined, prop: PropertySchema): string {
    if (!value) return '';

    const content = this.renderPropertyValue(value, prop);
    if (!content) return '';

    // 只显示值，不显示字段名（与 Notion 保持一致）
    return `<div class="notion-database-card-property">
      ${content}
    </div>`;
  }

  /**
   * 渲染属性值
   */
  private renderPropertyValue(value: PropertyValue, prop: PropertySchema): string {
    switch (value.type) {
      case 'text':
      case 'title':
        return this.renderText(value.value);

      case 'number':
        return this.renderNumber(value.value);

      case 'select':
        return this.renderSelect(value.value);

      case 'multi_select':
        return this.renderMultiSelect(value.value);

      case 'date':
        return this.renderDate(value.value);

      case 'checkbox':
        return this.renderCheckbox(value.value);

      case 'url':
        return this.renderUrl(value.value);

      default:
        return '';
    }
  }

  /**
   * 渲染文本
   */
  private renderText(value: string): string {
    if (!value || value === '') return '';
    // 截断长文本
    const truncated = value.length > 50 ? value.slice(0, 50) + '...' : value;
    return escapeHtml(truncated);
  }

  /**
   * 渲染数字
   */
  private renderNumber(value: number | null): string {
    if (value === null) return '-';
    return String(value);
  }

  /**
   * 渲染单选
   */
  private renderSelect(value: { id: string; name: string; color: string } | null): string {
    if (!value) return '';
    return `<span class="notion-database-select notion-database-select-${value.color}">${escapeHtml(value.name)}</span>`;
  }

  /**
   * 渲染多选
   */
  private renderMultiSelect(value: { id: string; name: string; color: string }[]): string {
    if (!value || value.length === 0) return '';
    const tags = value.slice(0, 3).map(option =>
      `<span class="notion-database-select notion-database-select-${option.color}">${escapeHtml(option.name)}</span>`
    ).join('');
    return tags;
  }

  /**
   * 渲染日期
   */
  private renderDate(value: { start: string | null; end: string | null } | null): string {
    if (!value || !value.start) return '';
    const date = new Date(value.start).toLocaleDateString('zh-CN');
    return date;
  }

  /**
   * 渲染复选框
   */
  private renderCheckbox(value: boolean): string {
    return value ? '✓' : '';
  }

  /**
   * 渲染 URL
   */
  private renderUrl(value: string): string {
    if (!value) return '';
    const display = value.length > 30 ? value.slice(0, 30) + '...' : value;
    return `<a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer" class="notion-database-link">${escapeHtml(display)}</a>`;
  }

  /**
   * 渲染空数据提示
   */
  private renderEmpty(): string {
    return `
      <div class="notion-database-empty-state notion-database-gallery-empty">
        <p>暂无数据</p>
      </div>
    `;
  }

  /**
   * 查找指定类型的属性
   */
  private findPropertyByType(
    properties: Record<string, PropertySchema>,
    type: PropertyType
  ): PropertySchema | undefined {
    return Object.values(properties).find(p => p.type === type);
  }

  /**
   * 获取可见属性（排除标题和封面，以及不支持的类型）
   */
  private getVisibleProperties(
    properties: Record<string, PropertySchema>,
    excludeId?: string
  ): PropertySchema[] {
    // 如果配置了 gallery_properties，使用配置的属性
    const galleryProperties = this.viewConfig?.gallery_properties;
    if (galleryProperties && Array.isArray(galleryProperties) && galleryProperties.length > 0) {
      const result: PropertySchema[] = [];
      for (const propConfig of galleryProperties) {
        if (propConfig.visible && propConfig.property) {
          const prop = Object.values(properties).find(p => p.id === propConfig.property);
          if (prop && prop.id !== excludeId && GALLERY_PROPERTY_TYPES.includes(prop.type)) {
            result.push(prop);
          }
        }
      }
      return result;
    }

    // 默认：查找所有支持的属性
    return Object.values(properties)
      .filter(p => GALLERY_PROPERTY_TYPES.includes(p.type) && p.id !== excludeId)
      .slice(0, 4); // 最多显示 4 个属性
  }
}
