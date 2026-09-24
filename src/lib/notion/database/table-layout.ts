/**
 * Notion Database 表格布局渲染器
 * 负责将数据库数据渲染为 HTML 表格
 */

import type { BlockObjectResponse } from '@notionhq/client';
import type {
  DatabaseRenderContext,
  PropertySchema,
  PropertyValue,
  PropertyType,
  Database,
  DatabaseRow,
  DatabaseRenderOptions,
  DatabaseSchema,
} from '../database/types';
import { escapeHtml } from '../renderer/rich-text';

/**
 * 支持的属性类型（MVP）
 */
const SUPPORTED_PROPERTY_TYPES: PropertyType[] = [
  'title',
  'text',
  'number',
  'select',
  'multi_select',
  'date',
  'checkbox',
  'url',
  'email',
  'phone',
];

/**
 * 表格布局渲染器
 * 将数据库渲染为 HTML 表格
 */
export class TableLayoutRenderer {
  constructor(private options: DatabaseRenderOptions = {}) {}

  /**
   * 渲染完整表格
   */
  render(context: DatabaseRenderContext): string {
    const { database, schema, rows } = context;

    // 使用 schema 中的 propertyOrder 获取排序后的属性
    const visibleProperties = this.getVisibleProperties(schema);

    // 生成各部分
    const header = this.renderHeader(visibleProperties);
    const body = this.renderBody(rows, visibleProperties);
    const empty = rows.length === 0 ? this.renderEmpty() : '';

    return `
      <div class="notion-database-wrapper">
        <div class="notion-database-table-wrapper">
          <table class="notion-database-table">
            <thead>${header}</thead>
            <tbody>${body}</tbody>
          </table>
          ${empty}
        </div>
      </div>
    `;
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
   * 渲染表头
   */
  private renderHeader(properties: PropertySchema[]): string {
    const cells = properties.map(prop => {
      const name = escapeHtml(prop.name);
      return `<th class="notion-database-th" data-type="${prop.type}">${name}</th>`;
    }).join('');

    return `<tr>${cells}</tr>`;
  }

  /**
   * 渲染表体
   */
  private renderBody(rows: DatabaseRow[], properties: PropertySchema[]): string {
    if (rows.length === 0) return '';

    return rows.map(row => {
      const cells = properties.map(prop => {
        const value = row.properties[prop.id];
        const content = this.renderCellValue(value, prop);
        return `<td class="notion-database-td" data-type="${prop.type}">${content}</td>`;
      }).join('');

      return `<tr class="notion-database-row">${cells}</tr>`;
    }).join('');
  }

  /**
   * 渲染单元格值
   */
  private renderCellValue(value: PropertyValue | undefined, prop: PropertySchema): string {
    if (!value) {
      return '<span class="notion-database-empty">-</span>';
    }

    switch (value.type) {
      case 'title':
      case 'text':
      case 'url':
      case 'email':
      case 'phone':
        return this.renderText(value.value);

      case 'number':
        return this.renderNumber(value.value);

      case 'select':
        return this.renderSelect(value.value);

      case 'multi_select':
        return this.renderMultiSelect(value.value);

      case 'checkbox':
        return this.renderCheckbox(value.value);

      case 'date':
        return this.renderDate(value.value);

      default: {
        const label = value.type === 'unsupported' ? value.originalType : value.type;
        return `<span class="notion-database-unsupported" title="不支持类型: ${label}">—</span>`;
      }
    }
  }

  /**
   * 渲染文本
   */
  private renderText(value: string): string {
    if (!value || value === '') {
      return '<span class="notion-database-empty">-</span>';
    }

    // 如果是 URL，渲染为链接
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return `<a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer" class="notion-database-link">${escapeHtml(value)}</a>`;
    }

    return `<span class="notion-database-text">${escapeHtml(value)}</span>`;
  }

  /**
   * 渲染数字
   */
  private renderNumber(value: number | null): string {
    if (value === null) {
      return '<span class="notion-database-empty">-</span>';
    }
    return `<span class="notion-database-number">${value}</span>`;
  }

  /**
   * 渲染单选
   */
  private renderSelect(value: { id: string; name: string; color: string } | null): string {
    if (!value) {
      return '<span class="notion-database-empty">-</span>';
    }
    return `<span class="notion-database-select notion-database-select-${value.color}">${escapeHtml(value.name)}</span>`;
  }

  /**
   * 渲染多选
   */
  private renderMultiSelect(value: { id: string; name: string; color: string }[]): string {
    if (!value || value.length === 0) {
      return '<span class="notion-database-empty">-</span>';
    }

    const tags = value.map(option =>
      `<span class="notion-database-select notion-database-select-${option.color}">${escapeHtml(option.name)}</span>`
    ).join('');

    return `<span class="notion-database-multi-select">${tags}</span>`;
  }

  /**
   * 渲染复选框
   */
  private renderCheckbox(value: boolean): string {
    const checked = value ? 'checked' : '';
    return `<input type="checkbox" class="notion-database-checkbox" ${checked} disabled />`;
  }

  /**
   * 渲染日期
   */
  private renderDate(value: { start: string | null; end: string | null } | null): string {
    if (!value) {
      return '<span class="notion-database-empty">-</span>';
    }

    const startDate = value.start ? new Date(value.start).toLocaleDateString('zh-CN') : '-';
    const endDate = value.end ? ` - ${new Date(value.end).toLocaleDateString('zh-CN')}` : '';

    return `<span class="notion-database-date">📅 ${startDate}${endDate}</span>`;
  }

  /**
   * 渲染空数据提示
   */
  private renderEmpty(): string {
    return `
      <div class="notion-database-empty-state">
        <p>暂无数据</p>
      </div>
    `;
  }

  /**
   * 获取可见属性（使用 schema 中预定义的顺序）
   * 属性顺序已在数据层根据视图配置确定
   */
  private getVisibleProperties(schema: DatabaseSchema): PropertySchema[] {
    const { properties, propertyOrder } = schema;

    // 创建属性 ID 到 PropertySchema 的映射
    const propertyMap = new Map<string, PropertySchema>();
    for (const prop of Object.values(properties)) {
      propertyMap.set(prop.id, prop);
    }

    // 如果有预定义的属性顺序，按顺序返回
    if (propertyOrder && propertyOrder.length > 0) {
      const result: PropertySchema[] = [];
      for (const propId of propertyOrder) {
        const prop = propertyMap.get(propId);
        if (prop && SUPPORTED_PROPERTY_TYPES.includes(prop.type)) {
          result.push(prop);
        }
      }

      // 如果顺序中没有找到任何支持的属性，回退到默认行为
      if (result.length === 0) {
        return Object.values(properties).filter(p =>
          SUPPORTED_PROPERTY_TYPES.includes(p.type)
        );
      }

      return result;
    }

    // 没有预定义顺序时，返回所有支持的属性
    return Object.values(properties).filter(p =>
      SUPPORTED_PROPERTY_TYPES.includes(p.type)
    );
  }

  /**
   * 获取属性类型图标
   */
  private getPropertyIcon(type: PropertyType): string {
    const icons: Record<PropertyType, string> = {
      title: 'text',
      text: 'text',
      number: '123',
      select: '🏷️',
      multi_select: '🏷️',
      date: '📅',
      checkbox: '☑️',
      url: '🔗',
      email: '✉️',
      phone: '📞',
      person: '👤',
      file: '📎',
      files: '📎',
      relation: '🔗',
      formula: '𝑓',
    };

    return `<span class="notion-database-icon-${type}" title="${type}">${icons[type] || '?'}</span>`;
  }
}
