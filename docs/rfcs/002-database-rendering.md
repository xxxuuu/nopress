# RFC 002: Notion Database 渲染功能

**状态**: 草案
**创建日期**: 2026-01-10
**作者**: NoPress Team
**标签**: feature, rendering, database

← [返回 RFC 目录](./README.md)

---

## 目录

- [背景与动机](#背景与动机)
- [目标](#目标)
- [系统架构](#系统架构)
- [数据层设计](#数据层设计)
- [渲染层设计](#渲染层设计)
  - [视图扩展性设计](#视图扩展性设计)
- [API 设计](#api-设计)
- [样式规范](#样式规范)
- [实现计划](#实现计划)
- [风险与挑战](#风险与挑战)
- [替代方案](#替代方案)
- [参考资源](#参考资源)

---

## 背景与动机

### 现状

当前 NoPress 在渲染 Notion 页面时，对于 `child_database` 类型的 block 仅显示标题：

```typescript
// src/lib/notion/renderer/block-renderer.ts:703-712
private renderChildDatabase(block: BlockObjectResponse, context: RenderContext): string {
  const childDatabase = (block as any).child_database;
  const title = childDatabase.title;

  return `<div class="notion-child-database">
    <div class="notion-child-database-title">
      🗄️ ${escapeHtml(title)}
    </div>
  </div>`;
}
```

### 问题

1. **功能缺失**：用户在 Notion 中精心设计的数据库视图无法在博客中展示
2. **数据浪费**：数据库中包含的有价值信息（表格、清单等）无法被读者访问
3. **体验不一致**：Notion 原页面的丰富内容与静态博客的简化呈现形成落差

### 动机

Notion Database 是 Notion 最强大的功能之一，支持：
- 多种视图类型（表格、看板、日历、图库等）
- 丰富的属性类型（文本、数字、日期、人员、文件等）
- 关联和公式等高级功能

支持 Database 渲染将极大提升 NoPress 的内容呈现能力。

---

## 目标

### 核心目标

1. **完整渲染**：支持将 Notion Database 以表格形式完整渲染
2. **数据解耦**：数据获取与渲染逻辑完全分离
3. **类型安全**：完整的 TypeScript 类型定义
4. **渐进增强**：MVP 支持核心属性，后续逐步扩展
5. **性能优化**：支持缓存和按需加载

### 非目标

1. **交互功能**：不实现编辑、新增、删除等写操作
2. **视图切换**：MVP 仅支持表格视图，但架构预留扩展点（见[视图扩展性设计](#视图扩展性设计)）
3. **高级属性**：公式、汇总等复杂属性类型暂不支持

### 未来版本支持

| 功能 | 计划版本 | 说明 |
|------|----------|------|
| 看板视图 | v0.2+ | 按 select 属性分组，卡片式展示 |
| 图库视图 | v0.2+ | 网格布局展示封面图 |
| 日历视图 | v0.3+ | 按日期属性展示日历 |
| 列表视图 | v0.2+ | 紧凑的列表模式 |
| 视图切换 | v0.2+ | 客户端 JavaScript 切换视图 |
| Person 属性 | v0.2+ | 显示用户名和头像 |
| File 属性 | v0.2+ | 图片预览和下载链接 |
| Relation 属性 | v0.3+ | 关联数据库跳转 |

---

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         Render Context                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌─────────────────────────────────┐  │
│  │ BlockRenderer│ ───> │     DatabaseRenderer            │  │
│  └──────────────┘      │  ┌─────────────────────────────┐│  │
│                         │  │   TableLayout (Default)     ││  │
│                         │  └─────────────────────────────┘│  │
│                         └─────────────────────────────────┘  │
│                                      ↕                       │
│  ┌──────────────────────────────────────────────────────────┐│
│  │              DatabaseRepository (Data Layer)             ││
│  │  ┌────────────────────────────────────────────────────┐  ││
│  │  │  + getDatabase(id): Promise<Database>              │  ││
│  │  │  + getSchema(id): Promise<DatabaseSchema>          │  ││
│  │  │  + queryRows(id, options): Promise<DatabaseRow[]>  │  ││
│  │  └────────────────────────────────────────────────────┘  ││
│  └──────────────────────────────────────────────────────────┘│
│                                      ↕                       │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                 NotionClient (API Layer)                 ││
│  │  ┌────────────────────────────────────────────────────┐  ││
│  │  │  databases.retrieve({ database_id })               │  ││
│  │  │  dataSources.query({ data_source_id })             │  ││
│  │  └────────────────────────────────────────────────────┘  ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 分层设计

| 层级 | 职责 | 组件 |
|------|------|------|
| **渲染层** | 将数据转换为 HTML | `DatabaseRenderer`, `LayoutRenderer` |
| **数据层** | 获取并标准化数据 | `DatabaseRepository` |
| **API 层** | 与 Notion API 通信 | `NotionClient` |
| **缓存层** | 提升性能 | `notionCache` |

---

## 数据层设计

### 核心原则

1. **单一职责**：只负责数据获取和标准化，不包含渲染逻辑
2. **接口抽象**：通过接口定义数据契约，实现可替换
3. **缓存优先**：自动处理缓存逻辑

### 类型定义

```typescript
/**
 * 数据库元信息
 */
interface Database {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  cover?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 数据库属性定义
 */
interface DatabaseSchema {
  databaseId: string;
  properties: Record<string, PropertySchema>;
}

interface PropertySchema {
  id: string;
  name: string;
  type: PropertyType;
  [key: string]: any;
}

type PropertyType =
  | 'title'           // 标题
  | 'text'            // 文本
  | 'number'          // 数字
  | 'select'          // 单选
  | 'multi_select'    // 多选
  | 'date'            // 日期
  | 'checkbox'        // 复选框
  | 'url'             // URL
  | 'email'           // 邮箱
  | 'phone'           // 电话
  | 'person'          // 人员
  | 'file'            // 文件
  | 'relation'        // 关联
  | 'formula';        // 公式

/**
 * 数据库行数据
 */
interface DatabaseRow {
  id: string;
  createdTime: string;
  lastEditedTime: string;
  properties: Record<string, PropertyValue>;
  archived: boolean;
}

/**
 * 属性值（根据类型不同有不同结构）
 */
type PropertyValue =
  | TextPropertyValue
  | NumberPropertyValue
  | SelectPropertyValue
  | MultiSelectPropertyValue
  | DatePropertyValue
  | CheckboxPropertyValue
  | UnsupportedPropertyValue;

interface TextPropertyValue {
  type: 'text' | 'title' | 'url' | 'email' | 'phone';
  value: string;
}

interface NumberPropertyValue {
  type: 'number';
  value: number | null;
}

interface SelectPropertyValue {
  type: 'select';
  value: SelectOption | null;
}

interface SelectOption {
  id: string;
  name: string;
  color: string;
}

interface MultiSelectPropertyValue {
  type: 'multi_select';
  value: SelectOption[];
}

interface DatePropertyValue {
  type: 'date';
  value: {
    start: string | null;
    end: string | null;
  } | null;
}

interface CheckboxPropertyValue {
  type: 'checkbox';
  value: boolean;
}

interface UnsupportedPropertyValue {
  type: 'unsupported';
  originalType: string;
}
```

### DatabaseRepository

```typescript
/**
 * 数据库仓储接口
 * 定义数据访问契约，便于测试和替换实现
 */
interface IDatabaseRepository {
  getDatabase(databaseId: string): Promise<Database>;
  getSchema(databaseId: string): Promise<DatabaseSchema>;
  queryRows(databaseId: string, options?: QueryOptions): Promise<DatabaseRow[]>;
}

interface QueryOptions {
  limit?: number;
  offset?: string;
  filter?: Filter;
  sort?: Sort[];
}

/**
 * Notion 数据库仓储实现
 * 负责与 Notion API 交互并返回标准化数据
 */
class NotionDatabaseRepository implements IDatabaseRepository {
  constructor(
    private client: NotionClient,
    private cache: CacheManager
  ) {}

  /**
   * 获取数据库元信息
   */
  async getDatabase(databaseId: string): Promise<Database> {
    const cacheKey = `database:${databaseId}`;

    // 尝试从缓存获取
    const cached = await this.cache.get<Database>(cacheKey);
    if (cached) return cached;

    // 从 API 获取
    const response = await this.client.databases.retrieve({
      database_id: databaseId,
    });

    const database: Database = {
      id: response.id,
      title: this.extractTitle(response.title),
      description: this.extractDescription(response.description),
      icon: this.extractIcon(response.icon),
      cover: this.extractCover(response.cover),
      createdAt: response.created_time,
      updatedAt: response.last_edited_time,
    };

    // 缓存结果（1小时）
    await this.cache.set(cacheKey, database, 60 * 60 * 1000);

    return database;
  }

  /**
   * 获取数据库 Schema
   */
  async getSchema(databaseId: string): Promise<DatabaseSchema> {
    const cacheKey = `database:schema:${databaseId}`;

    const cached = await this.cache.get<DatabaseSchema>(cacheKey);
    if (cached) return cached;

    const response = await this.client.databases.retrieve({
      database_id: databaseId,
    });

    const schema: DatabaseSchema = {
      databaseId,
      properties: this.normalizeProperties(response.properties),
    };

    await this.cache.set(cacheKey, schema, 60 * 60 * 1000);

    return schema;
  }

  /**
   * 查询数据库行
   */
  async queryRows(
    databaseId: string,
    options: QueryOptions = {}
  ): Promise<DatabaseRow[]> {
    const cacheKey = `database:rows:${databaseId}:${JSON.stringify(options)}`;

    // 行数据缓存时间较短（5分钟）
    const cached = await this.cache.get<DatabaseRow[]>(cacheKey);
    if (cached) return cached;

    // 获取 data_source_id
    const dataSourceId = await this.client.getDataSourceId(databaseId);

    // 查询数据
    const response = await this.client.dataSources.query({
      data_source_id: dataSourceId,
      page_size: options.limit || 100,
      start_cursor: options.offset,
    });

    const rows = response.results.map((page: any) =>
      this.normalizeRow(page, databaseId)
    );

    await this.cache.set(cacheKey, rows, 5 * 60 * 1000);

    return rows;
  }

  /**
   * 标准化属性定义
   */
  private normalizeProperties(
    rawProperties: Record<string, any>
  ): Record<string, PropertySchema> {
    const result: Record<string, PropertySchema> = {};

    for (const [key, prop] of Object.entries(rawProperties)) {
      result[key] = {
        id: prop.id,
        name: prop.name,
        type: prop.type,
        // 根据类型添加额外属性
        ...(prop.type === 'select' && {
          options: prop.select?.options || [],
        }),
        ...(prop.type === 'multi_select' && {
          options: prop.multi_select?.options || [],
        }),
        ...(prop.type === 'number' && {
          format: prop.number?.format,
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
      properties[key] = this.normalizePropertyValue(value);
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
        };

      case 'rich_text':
      case 'text':
        return {
          type: 'text',
          value: raw.rich_text?.[0]?.plain_text || '',
        };

      case 'number':
        return {
          type: 'number',
          value: raw.number ?? null,
        };

      case 'select':
        return {
          type: 'select',
          value: raw.select
            ? { id: raw.select.id, name: raw.select.name, color: raw.select.color }
            : null,
        };

      case 'multi_select':
        return {
          type: 'multi_select',
          value: raw.multi_select?.map((s: any) => ({
            id: s.id,
            name: s.name,
            color: s.color,
          })) || [],
        };

      case 'date':
        return {
          type: 'date',
          value: raw.date
            ? { start: raw.date.start, end: raw.date.end }
            : null,
        };

      case 'checkbox':
        return {
          type: 'checkbox',
          value: raw.checkbox || false,
        };

      case 'url':
        return {
          type: 'url',
          value: raw.url || '',
        };

      default:
        return {
          type: 'unsupported',
          originalType: raw.type,
        };
    }
  }
}
```

---

## 渲染层设计

### 核心原则

1. **数据驱动**：渲染器只接收标准化数据，不关心数据来源
2. **布局抽象**：支持不同的布局策略（表格、卡片等）
3. **可扩展性**：通过插件机制支持自定义渲染

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      DatabaseRenderer                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  职责：协调 DatabaseRepository 和 LayoutRenderer          ││
│  │  + render(databaseId): Promise<string>                  ││
│  └─────────────────────────────────────────────────────────┘│
│                              ↓                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    ILayoutRenderer                       ││
│  │  ┌────────────────────┐  ┌───────────────────────────┐  ││
│  │  │  TableLayout       │  │  CardLayout (Future)      │  ││
│  │  │  - renderHeader()  │  │  - renderCards()          │  ││
│  │  │  - renderRows()    │  │  - renderFilters()        │  ││
│  │  └────────────────────┘  └───────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
│                              ↓                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   ICellRenderer                          ││
│  │  ┌────────────────┐  ┌────────────┐  ┌──────────────┐  ││
│  │  │ TextCell       │  │SelectCell  │  │DateCell      │  ││
│  │  └────────────────┘  └────────────┘  └──────────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### DatabaseRenderer

```typescript
/**
 * 数据库渲染器
 * 协调数据获取和布局渲染
 */
class DatabaseRenderer {
  private layoutRenderer: ILayoutRenderer;
  private repository: IDatabaseRepository;

  constructor(
    repository: IDatabaseRepository,
    options: DatabaseRenderOptions = {}
  ) {
    this.repository = repository;

    // 根据选项选择布局渲染器
    const layoutType = options.layout || 'table';
    this.layoutRenderer = LayoutRendererFactory.create(layoutType, options);
  }

  /**
   * 渲染数据库
   */
  async render(databaseId: string): Promise<string> {
    try {
      // 并行获取数据库信息和行数据
      const [database, schema, rows] = await Promise.all([
        this.repository.getDatabase(databaseId),
        this.repository.getSchema(databaseId),
        this.repository.queryRows(databaseId, {
          limit: this.options.maxRows || 100,
        }),
      ]);

      // 使用布局渲染器渲染
      return this.layoutRenderer.render({
        database,
        schema,
        rows,
      });
    } catch (error) {
      console.error(`[DatabaseRenderer] Failed to render ${databaseId}:`, error);
      return this.renderError(error);
    }
  }

  /**
   * 渲染错误占位符
   */
  private renderError(error: Error): string {
    return `<div class="notion-database-error">
      <p>⚠️ Unable to load database content</p>
      <p class="notion-database-error-detail">${escapeHtml(error.message)}</p>
    </div>`;
  }
}
```

### ILayoutRenderer

```typescript
/**
 * 布局渲染器接口
 * 定义不同视图类型的渲染契约
 */
interface ILayoutRenderer {
  render(context: DatabaseRenderContext): string;
}

interface DatabaseRenderContext {
  database: Database;
  schema: DatabaseSchema;
  rows: DatabaseRow[];
}

/**
 * 表格布局渲染器
 * 最常用且稳定的数据库视图
 */
class TableLayoutRenderer implements ILayoutRenderer {
  private cellRenderers: Map<PropertyType, ICellRenderer>;

  constructor(options: TableLayoutOptions = {}) {
    this.cellRenderers = this.initCellRenderers(options);
  }

  /**
   * 渲染完整表格
   */
  render(context: DatabaseRenderContext): string {
    const { database, schema, rows } = context;

    // 过滤可见属性
    const visibleProperties = this.getVisibleProperties(schema.properties);

    // 生成各部分
    const title = this.renderTitle(database);
    const header = this.renderHeader(visibleProperties);
    const body = this.renderBody(rows, visibleProperties);
    const empty = rows.length === 0 ? this.renderEmpty() : '';

    return `
      <div class="notion-database-wrapper">
        ${title}
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
  private renderTitle(database: Database): string {
    const icon = database.icon ? `<span class="notion-database-icon">${database.icon}</span>` : '';
    const title = escapeHtml(database.title);

    return `
      <div class="notion-database-header">
        ${icon}
        <h3 class="notion-database-title">${title}</h3>
        <span class="notion-database-count">${this.rowCount}</span>
      </div>
    `;
  }

  /**
   * 渲染表头
   */
  private renderHeader(properties: PropertySchema[]): string {
    const cells = properties.map(prop => {
      const icon = this.getPropertyIcon(prop.type);
      const name = escapeHtml(prop.name);
      return `<th class="notion-database-th" data-type="${prop.type}">
        ${icon}<span class="notion-database-th-text">${name}</span>
      </th>`;
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
        const cellRenderer = this.cellRenderers.get(prop.type);
        const content = cellRenderer ? cellRenderer.render(value, prop) : '';
        return `<td class="notion-database-td" data-type="${prop.type}">${content}</td>`;
      }).join('');

      return `<tr class="notion-database-row">${cells}</tr>`;
    }).join('');
  }

  /**
   * 获取可见属性（排除不支持的类型）
   */
  private getVisibleProperties(
    properties: Record<string, PropertySchema>
  ): PropertySchema[] {
    const supportedTypes: PropertyType[] = [
      'title', 'text', 'number', 'select',
      'multi_select', 'date', 'checkbox', 'url'
    ];

    return Object.values(properties).filter(p =>
      supportedTypes.includes(p.type)
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
      select: 'select',
      multi_select: 'select',
      date: 'calendar',
      checkbox: 'check',
      url: 'link',
      email: 'mail',
      phone: 'phone',
      person: 'person',
      file: 'file',
      relation: 'relation',
      formula: 'formula',
    };
    return `<span class="notion-database-icon-${type}">${icons[type] || '?'}</span>`;
  }
}
```

### ICellRenderer

```typescript
/**
 * 单元格渲染器接口
 */
interface ICellRenderer {
  render(value: PropertyValue, schema: PropertySchema): string;
}

/**
 * 文本单元格渲染器
 */
class TextCellRenderer implements ICellRenderer {
  render(value: TextPropertyValue, schema: PropertySchema): string {
    if (!value || value.value === '') return '<span class="notion-database-empty">-</span>';
    return `<span class="notion-database-text">${escapeHtml(value.value)}</span>`;
  }
}

/**
 * Select 单选单元格渲染器
 */
class SelectCellRenderer implements ICellRenderer {
  render(value: SelectPropertyValue, schema: PropertySchema): string {
    if (!value || value.value === null) {
      return '<span class="notion-database-empty">-</span>';
    }

    const option = value.value;
    return `<span class="notion-database-select notion-database-select-${option.color}">
      ${escapeHtml(option.name)}
    </span>`;
  }
}

/**
 * MultiSelect 多选单元格渲染器
 */
class MultiSelectCellRenderer implements ICellRenderer {
  render(value: MultiSelectPropertyValue, schema: PropertySchema): string {
    if (!value || value.value.length === 0) {
      return '<span class="notion-database-empty">-</span>';
    }

    const tags = value.value.map(option =>
      `<span class="notion-database-select notion-database-select-${option.color}">
        ${escapeHtml(option.name)}
      </span>`
    ).join('');

    return `<span class="notion-database-multi-select">${tags}</span>`;
  }
}

/**
 * Checkbox 复选框单元格渲染器
 */
class CheckboxCellRenderer implements ICellRenderer {
  render(value: CheckboxPropertyValue, schema: PropertySchema): string {
    const checked = value.value ? 'checked' : '';
    return `<input type="checkbox" class="notion-database-checkbox" ${checked} disabled />`;
  }
}

/**
 * Date 日期单元格渲染器
 */
class DateCellRenderer implements ICellRenderer {
  render(value: DatePropertyValue, schema: PropertySchema): string {
    if (!value || value.value === null) {
      return '<span class="notion-database-empty">-</span>';
    }

    const date = value.value.start
      ? new Date(value.value.start).toLocaleDateString()
      : '-';

    return `<span class="notion-database-date">
      📅 ${escapeHtml(date)}
    </span>`;
  }
}
```

### 视图扩展性设计

**设计目标**：架构预留多视图支持，MVP 仅实现表格视图，未来可无缝扩展其他视图类型。

#### 视图类型枚举

```typescript
/**
 * 支持的数据库视图类型
 */
enum DatabaseViewType {
  TABLE = 'table',       // 表格视图 (MVP)
  BOARD = 'board',       // 看板视图 (v0.2+)
  GALLERY = 'gallery',   // 图库视图 (v0.2+)
  LIST = 'list',         // 列表视图 (v0.2+)
  CALENDAR = 'calendar', // 日历视图 (v0.3+)
}

interface ViewConfig {
  type: DatabaseViewType;
  name: string;
  // 看板视图特有配置
  groupBy?: string;      // 按哪个属性分组
  // 图库视图特有配置
  coverProperty?: string; // 用哪个属性作为封面
  // 列表视图特有配置
  showIcon?: boolean;
  // ... 其他视图特有配置
}
```

#### 多视图渲染架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     DatabaseRenderer (协调器)                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  render(databaseId, viewConfig?: ViewConfig)               ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              LayoutRendererFactory (工厂)                   ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │  create(viewType): ILayoutRenderer                   │   ││
│  │  │    → TableLayoutRenderer    (table)                  │   ││
│  │  │    → BoardLayoutRenderer    (board, v0.2+)           │   ││
│  │  │    → GalleryLayoutRenderer  (gallery, v0.2+)         │   ││
│  │  │    → ListLayoutRenderer    (list, v0.2+)             │   ││
│  │  │    → CalendarLayoutRenderer (calendar, v0.3+)        │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

#### 看板视图 (Board) 设计

```typescript
/**
 * 看板布局渲染器 (v0.2+)
 * 按 select 属性分组，卡片式展示
 */
class BoardLayoutRenderer implements ILayoutRenderer {
  render(context: DatabaseRenderContext): string {
    const { database, schema, rows } = context;
    const groupByProp = this.findGroupByProperty(schema.properties);

    // 按分组属性聚合行
    const groups = this.groupByProperty(rows, groupByProp);

    // 渲染为看板
    return `
      <div class="notion-database-wrapper notion-database-board">
        ${this.renderTitle(database)}
        <div class="notion-board-columns">
          ${groups.map(group => this.renderColumn(group)).join('')}
        </div>
      </div>
    `;
  }

  private renderColumn(group: BoardGroup): string {
    return `
      <div class="notion-board-column" data-group="${group.name}">
        <div class="notion-board-header">
          <span class="notion-board-group-name">${group.name}</span>
          <span class="notion-board-count">${group.count}</span>
        </div>
        <div class="notion-board-cards">
          ${group.rows.map(row => this.renderCard(row)).join('')}
        </div>
      </div>
    `;
  }

  private renderCard(row: DatabaseRow): string {
    const title = row.properties['title'];
    const summary = row.properties['summary'];
    const tags = row.properties['tags'];

    return `
      <div class="notion-board-card">
        <h4 class="notion-board-card-title">${title}</h4>
        <p class="notion-board-card-summary">${summary}</p>
        <div class="notion-board-card-tags">${tags}</div>
      </div>
    `;
  }
}
```

#### 图库视图 (Gallery) 设计

```typescript
/**
 * 图库布局渲染器 (v0.2+)
 * 网格布局展示封面图
 */
class GalleryLayoutRenderer implements ILayoutRenderer {
  render(context: DatabaseRenderContext): string {
    const { database, rows } = context;

    return `
      <div class="notion-database-wrapper notion-database-gallery">
        ${this.renderTitle(database)}
        <div class="notion-gallery-grid">
          ${rows.map(row => this.renderGalleryItem(row)).join('')}
        </div>
      </div>
    `;
  }

  private renderGalleryItem(row: DatabaseRow): string {
    const cover = row.properties['cover'];
    const title = row.properties['title'];

    return `
      <div class="notion-gallery-item">
        <div class="notion-gallery-cover">
          <img src="${cover}" alt="" loading="lazy" />
        </div>
        <div class="notion-gallery-info">
          <h4 class="notion-gallery-title">${title}</h4>
        </div>
      </div>
    `;
  }
}
```

#### 客户端视图切换 (v0.2+)

MVP 阶段服务端渲染单一视图，v0.2+ 支持客户端 JavaScript 切换视图：

```typescript
/**
 * 客户端视图切换逻辑
 * 服务端渲染所有视图的 HTML，通过 CSS 控制显示
 */
class ViewSwitcher {
  // 服务端渲染时生成所有视图
  renderAllViews(databaseId: string): string {
    return `
      <div class="notion-database-container" data-database-id="${databaseId}">
        <!-- 视图切换器 -->
        <div class="notion-database-views">
          <button data-view="table" class="active">📊 表格</button>
          <button data-view="board">📋 看板</button>
          <button data-view="gallery">🖼️ 图库</button>
        </div>

        <!-- 各视图容器 -->
        <div class="notion-database-view notion-database-view-table">
          ${this.renderTableView(databaseId)}
        </div>
        <div class="notion-database-view notion-database-view-board" hidden>
          ${this.renderBoardView(databaseId)}
        </div>
        <div class="notion-database-view notion-database-view-gallery" hidden>
          ${this.renderGalleryView(databaseId)}
        </div>
      </div>

      <script>
        // 客户端切换逻辑
        document.querySelectorAll('.notion-database-views button').forEach(btn => {
          btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            // 切换按钮状态
            document.querySelectorAll('.notion-database-views button').forEach(b =>
              b.classList.toggle('active', b === btn)
            );
            // 切换视图显示
            document.querySelectorAll('.notion-database-view').forEach(v =>
              v.hidden = v.dataset.view !== view
            );
          });
        });
      </script>
    `;
  }
}
```

#### 样式预留

```css
/* 视图切换器 */
.notion-database-views {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--notion-border);
}

.notion-database-views button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--notion-border);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}

.notion-database-views button.active {
  background: var(--color-primary);
  color: white;
}

/* 看板视图 (v0.2+) */
.notion-database-board {
  /* ... */
}

.notion-board-columns {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
}

.notion-board-column {
  min-width: 280px;
  background: var(--notion-gray-light);
  border-radius: var(--radius-md);
  padding: 1rem;
}

/* 图库视图 (v0.2+) */
.notion-database-gallery {
  /* ... */
}

.notion-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}
```

---

## API 设计

### 集成到 BlockRenderer

```typescript
// src/lib/notion/renderer/block-renderer.ts

class NotionBlockRenderer {
  private databaseRenderer: DatabaseRenderer | null = null;

  constructor(private client: NotionClient, options: RenderOptions = {}) {
    // ... 现有代码

    // 延迟初始化 DatabaseRenderer
    if (options.enableDatabase !== false) {
      this.databaseRenderer = new DatabaseRenderer(
        new NotionDatabaseRepository(this.client, notionCache),
        options.database || {}
      );
    }
  }

  async renderBlock(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    switch (block.type) {
      // ... 现有 case

      case 'child_database':
        if (this.databaseRenderer) {
          return await this.databaseRenderer.render(block.id);
        }
        return this.renderChildDatabasePlaceholder(block);

      // ... 其他 case
    }
  }

  /**
   * 渲染数据库占位符（当数据库渲染被禁用时）
   */
  private renderChildDatabasePlaceholder(block: BlockObjectResponse): string {
    const childDatabase = (block as any).child_database;
    return `<div class="notion-child-database">
      <div class="notion-child-database-title">
        🗄️ ${escapeHtml(childDatabase.title)}
      </div>
    </div>`;
  }
}
```

### 配置选项

```typescript
interface RenderOptions {
  // ... 现有选项

  /** 是否启用数据库渲染 */
  enableDatabase?: boolean;

  /** 数据库渲染配置 */
  database?: DatabaseRenderOptions;
}

interface DatabaseRenderOptions {
  /** 布局类型 */
  layout?: 'table' | 'card';

  /** 最大行数 */
  maxRows?: number;

  /** 是否显示空属性 */
  showEmptyProperties?: boolean;
}
```

---

## 样式规范

### CSS 变量

```css
:root {
  /* 数据库颜色 */
  --notion-database-border: #e0e0e0;
  --notion-database-bg: #ffffff;
  --notion-database-hover: #f7f6f3;
  --notion-database-header-bg: #faf9f7;

  /* Select 标签颜色 */
  --notion-select-gray: #e3e2e0;
  --notion-select-brown: #eee0da;
  --notion-select-orange: #fadece;
  --notion-select-yellow: #fdecc8;
  --notion-select-green: #dbeddb;
  --notion-select-blue: #d3e5ef;
  --notion-select-purple: #e8deee;
  --notion-select-pink: #f5e0e9;
  --notion-select-red: #ffe2dd;
}
```

### 样式结构

```css
/* ========== 数据库容器 ========== */

.notion-database-wrapper {
  margin: 2rem 0;
  border: 1px solid var(--notion-database-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--notion-database-bg);
}

/* ========== 数据库头部 ========== */

.notion-database-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--notion-database-border);
  background: var(--notion-database-header-bg);
}

.notion-database-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.notion-database-count {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--notion-text-gray);
}

/* ========== 数据库表格 ========== */

.notion-database-table-wrapper {
  overflow-x: auto;
}

.notion-database-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

.notion-database-table th,
.notion-database-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--notion-database-border);
  white-space: nowrap;
}

.notion-database-table th {
  background: var(--notion-database-header-bg);
  font-weight: 500;
  font-size: 0.85rem;
  color: var(--notion-text-gray);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.notion-database-table tr:hover {
  background: var(--notion-database-hover);
}

/* ========== Select 标签 ========== */

.notion-database-select {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 500;
}

.notion-database-select-gray { background: var(--notion-select-gray); }
.notion-database-select-brown { background: var(--notion-select-brown); }
.notion-database-select-orange { background: var(--notion-select-orange); }
.notion-database-select-yellow { background: var(--notion-select-yellow); }
.notion-database-select-green { background: var(--notion-select-green); }
.notion-database-select-blue { background: var(--notion-select-blue); }
.notion-database-select-purple { background: var(--notion-select-purple); }
.notion-database-select-pink { background: var(--notion-select-pink); }
.notion-database-select-red { background: var(--notion-select-red); }

/* ========== Checkbox ========== */

.notion-database-checkbox {
  width: 18px;
  height: 18px;
  cursor: not-allowed;
  accent-color: var(--color-primary);
}

/* ========== 空值 ========== */

.notion-database-empty {
  color: var(--notion-text-gray);
  font-style: italic;
}

/* ========== 响应式 ========== */

@media (max-width: 768px) {
  .notion-database-wrapper {
    margin: 1rem -1rem;
    border-left: none;
    border-right: none;
    border-radius: 0;
  }

  .notion-database-header {
    padding: 0.75rem 1rem;
  }

  .notion-database-table th,
  .notion-database-table td {
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
  }
}
```

---

## 实现计划

### 阶段一：基础设施（2-3天）

**目标**：建立数据层和基础渲染能力

| 任务 | 文件 | 描述 |
|------|------|------|
| 1.1 | `types.ts` | 定义数据库相关 TypeScript 类型 |
| 1.2 | `database-repository.ts` | 实现 `NotionDatabaseRepository` |
| 1.3 | `client.ts` | 添加 `getDataSourceId(databaseId)` 重载 |
| 1.4 | 测试 | 验证数据获取正确性 |

### 阶段二：表格渲染（3-4天）

**目标**：实现完整的表格视图渲染

| 任务 | 文件 | 描述 |
|------|------|------|
| 2.1 | `database-renderer.ts` | 实现 `DatabaseRenderer` 主类 |
| 2.2 | `layout/table-layout.ts` | 实现 `TableLayoutRenderer` |
| 2.3 | `cell/` | 实现各类型 `ICellRenderer` |
| 2.4 | `block-renderer.ts` | 集成到现有渲染流程 |
| 2.5 | `notion.css` | 添加数据库样式 |

### 阶段三：优化增强（2-3天）

**目标**：完善错误处理和用户体验

| 任务 | 描述 |
|------|------|
| 3.1 | 错误边界和降级处理 |
| 3.2 | 加载状态指示器 |
| 3.3 | 空数据状态提示 |
| 3.4 | 缓存策略优化 |

### 阶段四：测试与文档（1-2天）

| 任务 | 描述 |
|------|------|
| 4.1 | 单元测试 |
| 4.2 | 集成测试 |
| 4.3 | 用户文档更新 |
| 4.4 | 示例页面 |

### 时间估算

- **总计**：8-12 天
- **MVP 最小可用版本**：阶段一 + 阶段二（5-7 天）

---

## 风险与挑战

### 1. API 限流

**风险**：查询大型数据库可能触发 Notion API 速率限制

**缓解措施**：
- 使用现有的 `RateLimiter` 和 `RetryHelper`
- 实现智能缓存策略
- 提供配置选项限制查询数量

### 2. 性能问题

**风险**：大型数据库渲染可能导致页面卡顿

**缓解措施**：
- 限制默认查询数量（100 行）
- 实现客户端分页
- 考虑虚拟滚动（后续迭代）

### 3. 复杂属性类型

**风险**：某些属性类型（人员、文件、关联）需要额外 API 调用

**缓解措施**：
- MVP 只支持基础类型
- 复杂类型标记为 "Unsupported"
- 后续迭代逐步添加支持

### 4. 数据一致性问题

**风险**：静态生成后数据变更需要重新构建

**缓解措施**：
- 文档说明此限制
- 提供缓存 TTL 配置
- 后续考虑 ISR 方案

---

## 替代方案

### 方案 A：使用 Notion Embed

**方式**：使用 `<iframe>` 嵌入 Notion 原生视图

**优点**：
- 实现简单，无需渲染逻辑
- 功能完整，支持所有属性类型

**缺点**：
- 需要用户登录 Notion
- 样式无法自定义
- 加载速度慢
- 可能被 Notion 封禁

**结论**：不推荐

### 方案 B：仅导出 CSV

**方式**：将数据库导出为 CSV 文件，然后渲染

**优点**：
- 数据格式简单
- 渲染逻辑简单

**缺点**：
- 失去属性类型信息
- 需要手动维护导出
- 无法处理复杂类型

**结论**：适合作为补充功能

### 方案 C：使用第三方库

**方式**：使用 `notion-agent` 或 `react-notion-x` 等库

**优点**：
- 减少开发工作量
- 社区维护

**缺点**：
- 引入额外依赖
- 可能不完全符合项目需求
- React 依赖与 Astro 不兼容

**结论**：参考实现，自主开发

---

## 参考资源

- [Notion API - Block Reference](https://developers.notion.com/reference/block)
- [Notion API - Database Reference](https://developers.notion.com/reference/database)
- [Notion API - Data Source Query](https://developers.notion.com/reference/query-a-data-source)
- [react-notion-x 源码](https://github.com/NotionX/react-notion-x)
- [notion-agent 源码](https://github.com/splitbee/notion-agent)

---

## 附录

### 属性类型支持矩阵

| 类型 | MVP 支持 | 渲染方式 | 备注 |
|------|----------|----------|------|
| title | ✅ | 文本 | 作为主列，带链接 |
| text / rich_text | ✅ | 文本 | 支持基础格式 |
| number | ✅ | 数字 | 支持格式化 |
| select | ✅ | 标签 | 带颜色 |
| multi_select | ✅ | 标签组 | 多个标签 |
| date | ✅ | 日期 | 格式化显示 |
| checkbox | ✅ | 复选框 | 只读状态 |
| url | ✅ | 链接 | 可点击 |
| email | ✅ | 邮箱链接 | mailto: |
| phone | ✅ | 电话链接 | tel: |
| person | ❌ | - | 需要额外 API |
| file | ❌ | - | 需要处理 URL |
| relation | ❌ | - | 需要关联查询 |
| formula | ❌ | - | 需要计算引擎 |
| created_time | ⏳ | 日期 | 后续迭代 |
| created_by | ⏳ | 用户 | 后续迭代 |
| last_edited_time | ⏳ | 日期 | 后续迭代 |
| last_edited_by | ⏳ | 用户 | 后续迭代 |

### 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 0.1 | 2025-01-10 | 初始草案 |
