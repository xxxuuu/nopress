/**
 * Notion Database 仓储
 * 负责从 Notion API 获取数据库数据并返回标准化格式
 */

import { notionAPI } from '../api';
import { notionCache } from '../../cache';
import type {
  Database,
  DatabaseSchema,
  DatabaseRow,
  PropertySchema,
  PropertyValue,
  PropertyType,
  TextPropertyValue,
  NumberPropertyValue,
  SelectPropertyValue,
  MultiSelectPropertyValue,
  DatePropertyValue,
  CheckboxPropertyValue,
  UnsupportedPropertyValue,
  SelectOption,
  QueryOptions,
  ViewConfig,
  TablePropertyConfig,
} from './types';

/**
 * 数据库仓储接口
 * 定义数据访问契约，便于测试和替换实现
 */
export interface IDatabaseRepository {
  getDatabase(databaseId: string): Promise<Database>;
  getSchema(databaseId: string, viewConfig?: ViewConfig): Promise<DatabaseSchema>;
  queryRows(databaseId: string, options?: QueryOptions): Promise<DatabaseRow[]>;
}

/**
 * Notion 数据库仓储实现
 * 使用统一的 notionAPI 单例
 */
export class DatabaseRepository implements IDatabaseRepository {
  constructor(private cache = notionCache) {}

  /**
   * 获取数据库元信息
   */
  async getDatabase(databaseId: string): Promise<Database> {
    const cacheKey = `database:${databaseId}`;

    const cached = await this.cache.get<Database>(cacheKey);
    if (cached) return cached;

    const response = await notionAPI.retrieveDatabase(databaseId) as any;

    const database: Database = {
      id: response.id,
      title: this.extractTitle(response.title),
      description: this.extractDescription(response.description),
      icon: this.extractIcon(response.icon),
      cover: this.extractCover(response.cover),
      createdAt: response.created_time,
      updatedAt: response.last_edited_time,
    };

    await this.cache.set(cacheKey, database, 60 * 60 * 1000);

    return database;
  }

  /**
   * 获取数据库 Schema
   * 注意：Notion SDK 5.x 的 databases.retrieve 不再返回 properties
   * 需要从行数据中推断 schema
   * @param databaseId - 数据库 ID
   * @param viewConfig - 视图配置（用于确定属性显示顺序）
   */
  async getSchema(databaseId: string, viewConfig?: ViewConfig): Promise<DatabaseSchema> {
    // 缓存键包含视图配置的标识，以便不同视图可以有不同的属性顺序
    const viewId = viewConfig?.tableProperties
      ? viewConfig.tableProperties.map(p => p.property).join(',')
      : '';
    const cacheKey = `database:schema:${databaseId}:${viewId}`;

    const cached = await this.cache.get<DatabaseSchema>(cacheKey);
    if (cached) return cached;

    const response = await notionAPI.retrieveDatabase(databaseId) as any;

    let properties: Record<string, PropertySchema> = {};

    // 如果 response 中有 properties，直接使用
    if (response.properties && Object.keys(response.properties).length > 0) {
      properties = this.normalizeProperties(response.properties);
    } else {
      // SDK 5.x：从行数据中推断 schema
      const rowsResponse = await notionAPI.queryDatabaseRows(databaseId, { pageSize: 1 }) as any;

      if (rowsResponse.results?.length > 0) {
        const firstRow = rowsResponse.results[0];
        if (firstRow.properties) {
          properties = this.inferSchemaFromRow(firstRow.properties);
        }
      }
    }

    // 应用视图配置的属性顺序
    const propertyOrder = this.applyPropertyOrder(properties, viewConfig?.tableProperties);

    const schema: DatabaseSchema = {
      databaseId,
      properties,
      propertyOrder,
    };

    await this.cache.set(cacheKey, schema, 60 * 60 * 1000);

    return schema;
  }

  /**
   * 应用视图配置的属性顺序
   * @param properties - 原始属性映射
   * @param tableProperties - 表格属性配置
   * @returns 属性 ID 的显示顺序数组
   */
  private applyPropertyOrder(
    properties: Record<string, PropertySchema>,
    tableProperties?: TablePropertyConfig[]
  ): string[] | undefined {
    // 如果没有配置，返回 undefined（让渲染层使用默认顺序）
    if (!tableProperties || tableProperties.length === 0) {
      return undefined;
    }

    // 创建属性 ID 到 PropertySchema 的映射
    const propertyMap = new Map<string, PropertySchema>();
    for (const prop of Object.values(properties)) {
      propertyMap.set(prop.id, prop);
    }

    // 按照配置顺序构建属性 ID 数组
    const order: string[] = [];
    for (const config of tableProperties) {
      // 只包含可见且存在的属性
      if (config.visible && propertyMap.has(config.property)) {
        order.push(config.property);
      }
    }

    return order.length > 0 ? order : undefined;
  }

  /**
   * 从行数据推断 schema（当 databases.retrieve 不返回 properties 时）
   */
  private inferSchemaFromRow(rowProperties: Record<string, any>): Record<string, PropertySchema> {
    const result: Record<string, PropertySchema> = {};

    for (const [key, value] of Object.entries(rowProperties)) {
      let inferredType = this.inferPropertyType(value);

      // 'files' 类型统一映射为 'file' 以便处理
      if (inferredType === 'files') {
        inferredType = 'file';
      }

      // 使用 Notion 内部的 property ID（如果有的话）
      // 注意：value.id 可能是 URL 编码的（如 sT%3Bj），需要解码
      let propertyId = value?.id || key;
      try {
        propertyId = decodeURIComponent(propertyId);
      } catch {
        // 解码失败，使用原始值
      }

      result[key] = {
        id: propertyId,  // 使用解码后的内部 ID
        name: key,       // 使用属性名作为显示名
        type: inferredType,
      };

      // 如果是 select/multi_select，尝试提取选项
      if (inferredType === 'select' && value?.select) {
        result[key].selectOptions = [value.select];
      } else if (inferredType === 'multi_select' && value?.multi_select?.length > 0) {
        result[key].selectOptions = value.multi_select;
      }
    }

    return result;
  }

  /**
   * 从属性值推断属性类型
   */
  private inferPropertyType(propValue: any): PropertyType {
    if (!propValue || typeof propValue !== 'object') {
      return 'text';
    }

    const type = propValue.type;

    const knownTypes: PropertyType[] = [
      'title', 'text', 'number', 'select', 'multi_select',
      'date', 'checkbox', 'url', 'email', 'phone',
      'person', 'file', 'files', 'relation', 'formula'
    ];

    if (knownTypes.includes(type)) {
      return type;
    }

    // 根据值结构推断类型
    if (propValue.title !== undefined) return 'title';
    if (propValue.number !== undefined) return 'number';
    if (propValue.select !== undefined) return 'select';
    if (propValue.multi_select !== undefined) return 'multi_select';
    if (propValue.date !== undefined) return 'date';
    if (propValue.checkbox !== undefined) return 'checkbox';
    if (propValue.url !== undefined) return 'url';
    if (propValue.email !== undefined) return 'email';
    if (propValue.phone !== undefined) return 'phone';
    if (propValue.people !== undefined) return 'person';
    if (propValue.files !== undefined) return 'files';  // files 类型（复数）
    if (propValue.file !== undefined) return 'file';   // file 类型（单数）
    if (propValue.relation !== undefined) return 'relation';
    if (propValue.formula !== undefined) return 'formula';

    return 'text';
  }

  /**
   * 查询数据库行
   * @param databaseId - 数据库 ID
   * @param options - 查询选项（包含视图配置）
   */
  async queryRows(
    databaseId: string,
    options: QueryOptions = {}
  ): Promise<DatabaseRow[]> {
    // 基础缓存键（不包含视图配置，因为视图配置不影响原始数据）
    const baseCacheKey = `database:rows:${databaseId}:${options.limit || 100}`;

    // 先尝试获取基础缓存
    const cached = await this.cache.get<DatabaseRow[]>(baseCacheKey);

    let rows: DatabaseRow[];
    if (cached) {
      rows = cached;
    } else {
      const response = await notionAPI.queryDatabaseRows(databaseId, {
        pageSize: options.limit || 100,
      }) as any;

      rows = response.results.map((page: any) =>
        this.normalizeRow(page, databaseId)
      );

      // 缓存原始数据（5分钟）
      await this.cache.set(baseCacheKey, rows, 5 * 60 * 1000);
    }

    // 应用视图配置（排序等）
    return this.applyViewConfig(rows, options.viewConfig);
  }

  /**
   * 应用视图配置到行数据
   * @param rows - 原始行数据
   * @param viewConfig - 视图配置
   * @returns 处理后的行数据
   */
  private applyViewConfig(rows: DatabaseRow[], viewConfig?: ViewConfig): DatabaseRow[] {
    if (!viewConfig) return rows;

    let result = [...rows];

    // 应用 page_sort 排序
    if (viewConfig.pageSort && viewConfig.pageSort.length > 0) {
      result = this.sortRowsByPageSort(result, viewConfig.pageSort);
    }

    return result;
  }

  /**
   * 根据 page_sort 对行进行排序
   * @param rows - 行数据
   * @param pageSort - 排序顺序（页面 ID 数组）
   * @returns 排序后的行数据
   */
  private sortRowsByPageSort(rows: DatabaseRow[], pageSort: string[]): DatabaseRow[] {
    // 创建 ID 到索引的映射
    const sortOrder = new Map<string, number>();
    pageSort.forEach((id, index) => sortOrder.set(id, index));

    // 按照排序顺序排列，同时保留未在 page_sort 中的行（放到最后）
    return [...rows].sort((a, b) => {
      const indexA = sortOrder.get(a.id);
      const indexB = sortOrder.get(b.id);

      // 两个都有排序信息
      if (indexA !== undefined && indexB !== undefined) {
        return indexA - indexB;
      }
      // a 有排序信息，排前面
      if (indexA !== undefined) return -1;
      // b 有排序信息，排前面
      if (indexB !== undefined) return 1;
      // 都没有排序信息，保持原顺序
      return 0;
    });
  }

  /**
   * 提取标题
   */
  private extractTitle(titleArray: any[]): string {
    if (!titleArray || titleArray.length === 0) return 'Untitled';
    return titleArray.map((t: any) => t.plain_text || '').join('') || 'Untitled';
  }

  /**
   * 提取描述
   */
  private extractDescription(descArray: any[]): string {
    if (!descArray || descArray.length === 0) return '';
    return descArray.map((d: any) => d.plain_text || '').join('') || '';
  }

  /**
   * 提取图标
   */
  private extractIcon(icon: any): string | undefined {
    if (!icon) return undefined;
    if (icon.type === 'emoji') return icon.emoji;
    if (icon.type === 'external') return icon.external.url;
    return undefined;
  }

  /**
   * 提取封面
   */
  private extractCover(cover: any): string | undefined {
    if (!cover) return undefined;
    if (cover.type === 'external') return cover.external.url;
    if (cover.type === 'file') return cover.file?.url;
    return undefined;
  }

  /**
   * 标准化属性定义
   */
  private normalizeProperties(
    rawProperties: Record<string, any> | undefined | null
  ): Record<string, PropertySchema> {
    const result: Record<string, PropertySchema> = {};

    if (!rawProperties) {
      return result;
    }

    for (const [key, prop] of Object.entries(rawProperties)) {
      result[key] = {
        id: prop.id,
        name: prop.name,
        type: prop.type,
        // 根据类型添加额外属性
        ...(prop.type === 'select' && {
          selectOptions: prop.select?.options || [],
        }),
        ...(prop.type === 'multi_select' && {
          selectOptions: prop.multi_select?.options || [],
        }),
        ...(prop.type === 'number' && {
          numberFormat: prop.number?.format,
        }),
      };
    }

    return result;
  }

  /**
   * 标准化行数据
   */
  private normalizeRow(rawPage: any, databaseId: string): DatabaseRow {
    const properties: Record<string, PropertyValue> = {};

    for (const [key, value] of Object.entries(rawPage.properties)) {
      // 使用 Notion 内部的 property ID 作为 key（与 schema.properties.id 对应）
      // 注意：value.id 可能是 URL 编码的，需要解码
      let propertyId = value?.id || key;
      try {
        propertyId = decodeURIComponent(propertyId);
      } catch {
        // 解码失败，使用原始值
      }
      properties[propertyId] = this.normalizePropertyValue(value);
    }

    return {
      id: rawPage.id,
      createdTime: rawPage.created_time,
      lastEditedTime: rawPage.last_edited_time,
      properties,
      archived: rawPage.archived || false,
    };
  }

  /**
   * 标准化属性值
   */
  private normalizePropertyValue(raw: any): PropertyValue {
    // 根据 type 字段分发处理
    switch (raw.type) {
      case 'title':
        return {
          type: 'title',
          value: raw.title?.[0]?.plain_text || '',
        } as TextPropertyValue;

      case 'rich_text':
      case 'text':
        return {
          type: 'text',
          value: raw.rich_text?.[0]?.plain_text || '',
        } as TextPropertyValue;

      case 'number':
        return {
          type: 'number',
          value: raw.number ?? null,
        } as NumberPropertyValue;

      case 'select':
        return {
          type: 'select',
          value: raw.select
            ? { id: raw.select.id, name: raw.select.name, color: raw.select.color }
            : null,
        } as SelectPropertyValue;

      case 'multi_select':
        return {
          type: 'multi_select',
          value: raw.multi_select?.map((s: any) => ({
            id: s.id,
            name: s.name,
            color: s.color,
          })) || [],
        } as MultiSelectPropertyValue;

      case 'date':
        return {
          type: 'date',
          value: raw.date
            ? { start: raw.date.start, end: raw.date.end }
            : null,
        } as DatePropertyValue;

      case 'checkbox':
        return {
          type: 'checkbox',
          value: raw.checkbox || false,
        } as CheckboxPropertyValue;

      case 'url':
        return {
          type: 'url',
          value: raw.url || '',
        } as TextPropertyValue;

      case 'email':
        return {
          type: 'email',
          value: raw.email || '',
        } as TextPropertyValue;

      case 'phone':
        return {
          type: 'phone',
          value: raw.phone || '',
        } as TextPropertyValue;

      case 'files': {
        // Notion API 使用 'files' 类型（复数）
        // 数据结构: { files: [{ type: 'external', external: { url: '...' } }, ...] }
        const fileUrls: string[] = [];
        if (raw.files && Array.isArray(raw.files)) {
          for (const file of raw.files) {
            let fileUrl: string | undefined;
            if (file.type === 'external' && file.external?.url) {
              fileUrl = file.external.url;
            } else if (file.type === 'file' && file.file?.url) {
              fileUrl = file.file.url;
            }

            if (fileUrl) {
              // 清理 AWS S3 URL 的查询参数
              // 保留基础 URL，让 Notion 代理重新签名
              fileUrls.push(this.cleanFileUrl(fileUrl));
            }
          }
        }
        return {
          type: 'file',  // 转换为 'file' 类型以便渲染器处理
          value: fileUrls,
        } as any;
      }

      default:
        return {
          type: 'unsupported',
          originalType: raw.type,
        } as UnsupportedPropertyValue;
    }
  }

  /**
   * 清理文件 URL，移除 AWS S3 签名参数
   * 保留基础 URL，让 Notion 代理重新签名
   */
  private cleanFileUrl(url: string): string {
    if (!url || !url.includes('?')) return url;

    try {
      const urlObj = new URL(url);
      // 移除所有 AWS 相关的查询参数
      const paramsToRemove = Array.from(urlObj.searchParams.keys()).filter(
        key => key.startsWith('x-amz-') ||
               key.startsWith('X-Amz-') ||
               key === 'x-id'
      );
      paramsToRemove.forEach(key => urlObj.searchParams.delete(key));

      const cleaned = urlObj.toString();
      // 如果移除参数后没有查询参数了，去掉 ?
      return cleaned.endsWith('?') ? cleaned.slice(0, -1) : cleaned;
    } catch {
      return url;
    }
  }
}

/**
 * 创建数据库仓储实例
 */
export function createDatabaseRepository(): IDatabaseRepository {
  return new DatabaseRepository();
}
