# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**最后更新**: 2026-01-12

## Project Overview

NoPress (Notion + WordPress) 是一个基于 Notion 和 Astro 的静态博客生成器，使用 Notion 作为 CMS，内置智能缓存系统和 API 优化机制。

**核心特性**:
- 📝 Notion Database 作为唯一数据源
- 📊 Notion Database 渲染（表格/画廊视图）
- ⚡️ 智能缓存系统（内存 + 文件缓存）
- 🔄 API 限流和重试机制
- 🎨 响应式设计和深色模式
- 📊 开箱即用的性能优化

## Core Architecture

### Data Layer - Notion 集成

**数据入口**: `src/lib/data/index.ts`
- 检查 Notion 配置（NOTION_TOKEN + NOTION_DATABASE_ID）
- 如果配置缺失，抛出友好错误提示
- 导出 NotionDataService 单例

**重要**: 项目已移除 Mock 数据支持，必须配置 Notion 才能运行。

### Notion Integration Flow

完整的数据获取流程（包含缓存、API 优化和图片 URL 映射）：

```
用户请求页面
    ↓
NotionDataService (src/lib/data/notion-service.ts)
    ↓
检查缓存 (notionCache)
    ↓ (缓存命中 - 15ms)
    └─→ 返回缓存数据 ✅
    ↓ (缓存未命中)
NotionQueries (src/lib/notion/queries.ts)
    ↓
并发控制 (RateLimiter - 最多3个并发)
    ↓
重试助手 (RetryHelper - 指数退避重试)
    ↓
NotionClient (src/lib/notion/client.ts)
    ↓ SDK 5.x: dataSources.query()
Notion API
    ↓
NotionBlockParser (src/lib/notion/parser.ts)
    ↓ 使用 notion-to-md 转换
Markdown 内容
    ↓
ContentTransformer (生成摘要、计算阅读时间)
    ↓
BlockRenderer (转换临时 URL 为永久 URL)
    ↓
缓存结果 (TTL: 5分钟/1小时)
    ↓
返回 Post Object
```

**关键组件**:

1. **NotionClient** (`src/lib/notion/client.ts`)
   - 封装 Notion API 调用
   - **重要**: SDK 5.x 使用 `dataSources.query()` 而不是 `databases.query()`
   - 需要先获取 `data_source_id`
   - 处理分页和错误
   - **过滤逻辑**:
     - 只查询 `type` 为 `Post` 的条目
     - 只查询 `status` 为 `Published` 的条目
     - 按 `date` 字段降序排序

2. **NotionBlockParser** (`src/lib/notion/parser.ts`)
   - 使用 `notion-to-md` 库转换 Notion blocks
   - 支持限流和重试
   - 返回 Markdown 字符串

3. **NotionQueries** (`src/lib/notion/queries.ts`)
   - 提取元数据（从 Notion page properties）
   - 协调内容转换
   - 应用限流和重试机制

4. **Image URL Mapping** (`src/lib/notion/map-image-url.ts`)
   - 将临时 URL 转换为永久 URL
   - Notion 的图片和附件 URL 会过期，需要转换为代理格式
   - 转换格式：`https://www.notion.so/image/{encoded_url}?table=block&id={block_id}`
   - 支持图片压缩和优化（可选）
   - **适用于**：
     - `secure.notion-static.com` (AWS 存储)
     - `prod-files-secure` (生产环境文件)
     - Notion 内部相对路径（以 `/` 开头）
     - Bookmark 外部图片

### Notion Database 渲染

项目支持在页面中嵌入 Notion Database，并自动渲染为表格或画廊视图。

**支持的视图类型**:
- **表格视图** (`table`): 传统数据表格，支持列排序和隐藏
- **画廊视图** (`gallery`): 卡片式布局，适合展示图文内容

**架构概览**:

```
NotionPageRenderer (src/lib/notion/renderer/index.ts)
    ├── 检测 child_database block
    ├── 获取视图配置 (type, table_properties, page_sort)
    ↓
DatabaseRenderer (src/lib/notion/database/index.ts)
    ├── 构建 ViewConfig
    │   ├── tableProperties: 列顺序和可见性
    │   └── pageSort: 行排序顺序
    ↓
DatabaseRepository (数据层)
    ├── getSchema(viewConfig) → 返回带 propertyOrder 的 schema
    └── queryRows(viewConfig) → 返回排序后的行数据
    ↓
LayoutRenderer (渲染层)
    ├── TableLayoutRenderer (src/lib/notion/database/table-layout.ts)
    └── GalleryLayoutRenderer (src/lib/notion/database/gallery-layout.ts)
```

**核心文件**:

| 文件 | 职责 |
|------|------|
| `src/lib/notion/database/types.ts` | 类型定义 |
| `src/lib/notion/database/repository.ts` | 数据访问层（排序、属性顺序） |
| `src/lib/notion/database/index.ts` | 数据库渲染器协调器 |
| `src/lib/notion/database/table-layout.ts` | 表格布局渲染器 |
| `src/lib/notion/database/gallery-layout.ts` | 画廊布局渲染器 |
| `src/lib/notion/renderer/index.ts` | 视图配置检测 |

**视图配置检测**:

`NotionPageRenderer` 使用非官方 API (`notion-client`) 获取完整的视图配置：

```typescript
// 从 block format 中提取视图配置
private extractViewConfig(format: any): {
  type: 'table' | 'gallery';
  config?: any;           // 包含 table_properties
  page_sort?: string[];   // 行排序顺序
}
```

**数据层排序** (重要架构设计):

排序逻辑完全在数据层实现，渲染层无需处理排序：

1. **列顺序** (`tableProperties`):
   - `Repository.getSchema()` 接收 `viewConfig`
   - `applyPropertyOrder()` 根据 `table_properties` 生成 `propertyOrder`
   - 返回的 `DatabaseSchema.propertyOrder` 包含排序后的属性 ID 数组

2. **行顺序** (`pageSort`):
   - `Repository.queryRows()` 接收 `viewConfig`
   - `sortRowsByPageSort()` 根据 `page_sort` 对行排序
   - 返回排序后的 `DatabaseRow[]`

**类型定义**:

```typescript
// 视图配置
interface ViewConfig {
  tableProperties?: TablePropertyConfig[];  // 列配置
  pageSort?: string[];                      // 行排序
}

// 表格属性配置
interface TablePropertyConfig {
  property: string;   // 属性内部 ID
  visible: boolean;   // 是否可见
  width?: number;     // 列宽
}

// 数据库 Schema（包含属性顺序）
interface DatabaseSchema {
  databaseId: string;
  properties: Record<string, PropertySchema>;
  propertyOrder?: string[];  // 属性 ID 的显示顺序
}
```

**支持的属性类型** (表格视图):

| 类型 | 渲染方式 |
|------|----------|
| `title`, `text`, `url`, `email`, `phone` | 文本（URL 自动转为链接） |
| `number` | 数字 |
| `select` | 单选标签（带颜色） |
| `multi_select` | 多选标签（带颜色） |
| `date` | 日期（中文格式） |
| `checkbox` | 复选框（禁用状态） |

**使用方式**:

在 Notion 页面中插入数据库块即可，渲染器会自动检测并渲染：

1. 创建 child_database 块
2. 配置视图（表格/画廊）
3. 设置列可见性和顺序
4. 设置行排序顺序
5. 保存页面 → 自动渲染

**注意事项**:
- child_database 使用独立的 collection，需要单独获取视图配置
- 属性 ID 会自动 URL 解码（处理 `sT%3Bj` 这类编码）
- 不支持的属性类型显示为 `—` 占位符
- 空值显示为 `-`

### Cache System

**缓存策略** (`src/lib/cache/`):

```typescript
// 开发环境 (npm run dev)
MemoryCache
├── TTL: 5 分钟
├── 自动清理: 每分钟
└── 存储: 进程内存

// 生产环境 (npm run build)
FileCache
├── TTL: 1 小时
├── 存储: .cache/notion/*.json
├── 压缩: 启用
└── 清理: 手动调用 cleanup()
```

**使用方式**:
```typescript
import { notionCache } from '@lib/cache';

// 自动使用缓存（在 NotionDataService 中）
const cached = await notionCache.get<Post[]>('all-posts');
if (cached) return cached;

// 设置缓存
await notionCache.set('all-posts', posts);

// 查看统计
const stats = await notionCache.getStats();
```

### API Optimization

**限流器** (`RateLimiter`):
```typescript
// src/lib/utils/api-helpers.ts
const notionRateLimiter = new RateLimiter(
  3,    // 最大并发请求数
  100   // 最小请求间隔（毫秒）
);

// 使用
await notionRateLimiter.execute(() => {
  return notion.dataSources.query(...);
});
```

**重试助手** (`RetryHelper`):
```typescript
const notionRetryHelper = new RetryHelper({
  maxRetries: 3,           // 最大重试次数
  initialDelay: 1000,      // 初始延迟 1 秒
  backoffMultiplier: 2,    // 指数退避 (1s → 2s → 4s)
  maxDelay: 10000,         // 最大延迟 10 秒
});

// 自动重试网络错误和 5xx 错误
await notionRetryHelper.execute(
  () => parser.pageToMarkdown(pageId),
  'Converting page to markdown'
);
```

**组合使用**（在 NotionQueries 中）:
```typescript
const markdown = await notionRateLimiter.execute(() =>
  notionRetryHelper.execute(
    () => this.parser.pageToMarkdown(page.id),
    `Converting page ${page.id} to markdown`
  )
);
```

### Astro Static Generation

使用 Astro 的 `getStaticPaths()` 在构建时生成所有页面：

- **动态路由**：`[slug].astro`、`[tag].astro`、`[category].astro`
- **构建时数据获取**：所有页面在 `getStaticPaths()` 中调用 `dataService` 获取数据
- **Markdown 渲染**：使用 `marked` + `sanitize-html` 将 Markdown 转为安全的 HTML

### Configuration System

双配置文件系统：

- **`src/config/site.ts`**：站点元信息、作者、导航、SEO
- **`src/config/theme.ts`**：颜色、字体、排版、响应式断点

所有配置通过 CSS 变量应用到全局样式（`src/styles/global.css`）。

## Development Commands

```bash
# 安装依赖
npm install

# 开发服务器（需要 Notion 配置）
npm run dev

# 生产构建
npm run build

# 预览构建结果
npm run preview
```

**注意**: 必须配置 `.env` 文件才能运行，否则会抛出配置缺失错误。

## Environment Setup

### Notion API 配置（必需）

创建 `.env` 文件：
```env
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxx
```

**获取方式**:
1. **NOTION_TOKEN**: 在 https://www.notion.so/my-integrations 创建 Integration
2. **NOTION_DATABASE_ID**: 从 Database URL 复制（32 位字符）

重启服务器后，控制台会显示：
```
✅ Using Notion API as data source
📦 Using Memory Cache (fast, ephemeral)
```

## Notion Database Schema

**重要**: SDK 5.x 和实际测试发现，Notion Database 属性名**必须全部小写**。

### 必需字段（全部小写）

| 属性名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `title` | Title | 条目标题 | "从 Linux 内核看读写锁设计" |
| `type` | Select | 内容类型 | "Post" / "Page" / "Menu" (**必需**) |
| `status` | Select | 发布状态 | "Published" / "Draft" |
| `slug` | Rich Text | URL slug | "kernel-rwlock" |
| `summary` | Rich Text | 内容摘要/描述 | "前段时间看了《Linux内核设计与实现》..." |
| `date` | Date | 发布/排序日期 | 2024-01-04 |
| `tags` | Multi-select | 标签 | ["Linux", "操作系统"] |

**type 字段说明**（支持 3 种内容类型）:

1. **`type=Post`** - 博客文章
   - 显示路径: `/post/{slug}`
   - 必需字段: `title`, `slug`, `summary`, `date`, `tags`
   - 首页列表: `/index.astro`
   - slug 限制: 不能包含 `/` 或 URL，只允许字母、数字、连字符、下划线和中文

2. **`type=Page`** - 独立页面（如关于页、归档页等）
   - 显示路径: `/{slug}`
   - 必需字段: `title`, `slug`, `summary`, `date`
   - 路由文件: `/[slug].astro`
   - slug 限制: 同 Post
   - **用途**: 创建"关于"、"归档"、"友链"等独立页面

3. **`type=Menu`** - 导航菜单项
   - 显示位置: 网站顶部导航栏
   - 必需字段: `title`, `slug`, `date`
   - slug 用途:
     - 内部链接: `about`, `blog`, `archive`（自动添加 `/` 前缀）
     - 外部链接: `https://github.com/username`（完整 URL）
   - date 用途: 控制菜单显示顺序（升序排列）

**过滤规则**:
- 只有 `status=Published` 的条目才会显示
- 其他 type 值（如 Draft、Note）会被自动过滤
- Post 和 Page 的 slug 验证失败时会被跳过并输出警告日志

### 可选字段

| 属性名 | 类型 | 说明 |
|--------|------|------|
| `updated` | Date | 更新日期 |
| `cover` | Files | 封面图片 |

**代码位置**: 属性提取逻辑在 `src/lib/notion/queries.ts` 的 `extractMetadata()` 方法中。

**注意**:
- ❌ 错误: `Title`, `Status`, `Published`, `Description`, `Type`（首字母大写）
- ✅ 正确: `title`, `status`, `date`, `summary`, `type`（全部小写）

## Adding New Pages

Astro 使用文件系统路由：
- 静态页面：直接在 `src/pages/` 下创建 `.astro` 文件
- 动态页面：使用 `[param].astro` 并实现 `getStaticPaths()`

**重要**：所有页面数据获取都应通过 `import dataService from '@lib/data'`，这样可以自动适配数据源。

## Styling System

### 深色模式实现
- CSS 变量定义在 `:root` 和 `:root.dark`
- 主题切换通过修改 `<html>` 的 class 实现
- `ThemeToggle.astro` 使用 localStorage 持久化用户偏好
- **防闪烁**：`BaseLayout.astro` 中的 inline script 在页面加载前设置主题

### 响应式设计
断点定义在 `src/config/theme.ts`：
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

## Article Features

### 文章目录（Table of Contents）

文章页面自动生成交互式目录，支持三种响应式模式：

**响应式断点**：
- **≥ 1441px**：完整文字目录（右侧固定定位）
- **769px - 1440px**：横条模式（悬浮展开）
- **≤ 768px**：完全隐藏

**核心功能**：

1. **自动提取标题**：从 `.notion-content` 提取 h1-h3，自动生成 slug ID，相对层级计算
2. **滚动高亮**：基于视口中心位置检测，三级优先级算法解决长段落问题
3. **横条模式**：宽度根据文字长度动态映射，使用平方根函数实现非线性分布
4. **动态定位**：根据 `.page-main` 位置调整，防止与封面图重叠

**技术实现**：

```typescript
// 核心文件
src/scripts/table-of-contents.ts            // TOC 生成和交互逻辑
src/themes/default/pages/post/[slug].astro  // 样式和容器

// 关键函数
initTableOfContents()   // 入口函数
generateTocHtml()       // 生成 HTML（含动态宽度计算）
setupScrollSpy()        // 滚动高亮
setupTocPosition()      // 动态位置调整
applyBarWidths()        // 应用动态横条宽度
```

**注意事项**：
- 样式使用 `:global()` 包裹（动态生成内容）
- 横条宽度通过 `data-bar-width` 和 CSS 自定义属性实现
- `.notion-main` 上添加了 `overflow-x: hidden` 防止横向滚动

## Working with Notion Content

### 菜单配置（Menu Items）

网站导航菜单完全由 Notion Database 中 `type=Menu` 的条目控制。

**如何添加菜单项**：
1. 在 Notion Database 中创建新行
2. 设置 `type` 为 `Menu`
3. 设置 `status` 为 `Published`
4. 设置 `title` 为菜单显示文字（如 "关于"、"归档"）
5. 设置 `slug` 为链接地址：
   - 内部链接：`about`, `archive`, `links` 等（会自动添加 `/` 前缀）
   - 外部链接：`https://github.com/username` 等完整 URL
6. 设置 `date` 字段控制菜单显示顺序（按升序排列）

**示例**：
| title | type | status | slug | date | 效果 |
|-------|------|--------|------|------|------|
| 博客 | Menu | Published | blog | 2024-01-01 | 跳转到 `/blog` |
| 关于 | Menu | Published | about | 2024-01-02 | 跳转到 `/about` |
| GitHub | Menu | Published | https://github.com/xxx | 2024-01-03 | 在新标签页打开外部链接 ↗ |

**技术实现**：
- 菜单数据使用缓存（TTL: 5分钟/1小时）
- 外部链接会自动添加 `target="_blank"` 和 `rel="noopener noreferrer"`
- 外部链接会显示 ↗ 图标

### 修改 Notion 数据结构
如果需要添加新的 Database 属性：

1. 在 Notion Database 中添加属性
2. 更新 `src/lib/notion/types.ts` 的 `NotionPageProperties` 接口
3. 修改 `src/lib/notion/queries.ts` 的 `extractMetadata()` 方法提取新字段
4. 更新 `src/lib/types.ts` 的 `Post` 接口（如果需要暴露给上层）

### Notion 块类型支持
`notion-to-md` 库自动处理大部分 Notion 块类型。如需自定义特定块的渲染，在 `src/lib/notion/parser.ts` 的 `configureCustomTransformers()` 中添加转换器。

## Path Aliases

TypeScript 路径别名（定义在 `tsconfig.json` 和 `astro.config.mjs`）：

```typescript
@/*              → src/*
@components/*    → src/components/*
@lib/*           → src/lib/*
@config/*        → src/config/*
@data/*          → src/data/*
```

## Deployment Notes

部署到 Vercel/Netlify 时：
1. 设置环境变量 `NOTION_TOKEN` 和 `NOTION_DATABASE_ID`
2. 构建命令：`npm run build`
3. 输出目录：`dist`

**重要**：Notion API 有速率限制，建议使用定时构建而非实时构建（如 GitHub Actions 定时触发）。

## Troubleshooting

### 配置相关

**问题**: 启动时报错 "Notion configuration missing"
```
❌ Notion configuration missing!
💡 Please set NOTION_TOKEN and NOTION_DATABASE_ID in your .env file.
```

**解决**:
1. 复制 `.env.example` 为 `.env`
2. 设置 `NOTION_TOKEN` 和 `NOTION_DATABASE_ID`
3. 重启开发服务器

---

### 文章显示问题

**问题**: 文章不显示或列表为空

**检查清单**:
- [ ] Notion 中 `status` 字段是否为 "Published"（注意小写）
- [ ] `date` 字段是否已设置
- [ ] `slug` 字段是否填写
- [ ] Integration 是否有 Database 访问权限
  - 在 Database 页面点击 "⋯" → "Add connections" → 选择你的 Integration
- [ ] 属性名是否全部小写（`title`, `status`, `date`, `summary`）

---

### 性能和缓存问题

**问题**: 页面加载很慢（超过 30 秒）

**原因**: 缓存未命中，正在从 Notion API 获取所有数据

**解决**:
1. 第一次加载较慢是正常的（~50秒）
2. 后续访问会使用缓存（~15ms）
3. 查看控制台日志确认缓存状态：
   ```
   ❌ Cache MISS: all-posts (0ms)  # 第一次
   ✅ Cache HIT: all-posts (1ms)   # 第二次
   ```

**手动清理缓存**:
```bash
# 开发环境：重启服务器会清空内存缓存
npm run dev

# 生产环境：删除文件缓存目录
rm -rf .cache/notion
```

---

### 网络错误

**问题**: 频繁出现 ECONNRESET 或 fetch failed 错误

**原因**: Notion API 网络抖动或并发请求过多

**解决**: ✅ 已内置解决方案
- 限流器控制并发（最多 3 个）
- 重试机制自动重试（最多 3 次）
- 查看控制台日志确认重试：
  ```
  [Retry] Attempt 1/3 failed: fetch failed
  [Retry] Waiting 1000ms before retry...
  ```

**如果仍有问题**:
```typescript
// 调整限流参数（src/lib/utils/api-helpers.ts）
export const notionRateLimiter = new RateLimiter(
  2,    // 减少并发数
  200   // 增加请求间隔
);
```

---

### Notion API 错误

**问题**: 401 Unauthorized
- 检查 `NOTION_TOKEN` 是否有效
- 确认 Token 格式正确（以 `secret_` 开头）

**问题**: 404 Not Found
- 检查 `NOTION_DATABASE_ID` 是否正确
- 确认是 32 位字符（不包含连字符）
- Database ID 从 URL 中获取：`https://www.notion.so/workspace/{database_id}?v=...`

**问题**: 403 Forbidden
- Integration 没有 Database 访问权限
- 在 Notion 中将 Database 共享给 Integration

---

### SDK 5.x 相关

**问题**: 代码中使用 `databases.query()` 但不工作

**原因**: SDK 5.x API 变更

**解决**: 使用 `dataSources.query()`
```typescript
// ❌ SDK 4.x (已废弃)
await notion.databases.query({ database_id })

// ✅ SDK 5.x (当前使用)
const database = await notion.databases.retrieve({ database_id });
const dataSourceId = database.data_sources[0].id;
await notion.dataSources.query({ data_source_id: dataSourceId })
```

**代码位置**: `src/lib/notion/client.ts` 的 `queryPublishedPosts()` 方法

---

### 缓存调试

**查看缓存统计**:
```typescript
// 在 .astro 文件中
import { notionCache } from '@lib/cache';

const stats = await notionCache.getStats();
console.log(stats);
// { total: 3, valid: 3, expired: 0, namespace: 'notion' }
```

**清空缓存**:
```typescript
await notionCache.clear();
console.log('✅ 缓存已清空');
```

**调整 TTL**:
```typescript
// src/lib/cache/index.ts
export function createNotionCache() {
  return new CacheManager({
    memoryConfig: {
      defaultTTL: 10 * 60 * 1000, // 改为 10 分钟
    },
  });
}
```
