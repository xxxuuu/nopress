# 系统架构

## 整体架构

```
用户访问页面
    ↓
NotionDataService
    ↓
缓存检查 (MemoryCache / FileCache)
    ↓ (缓存命中) → 返回
    ↓ (缓存未命中)
NotionClient (SDK 5.x)
    ↓
限流器 (RateLimiter: 最多3并发)
    ↓
重试助手 (RetryHelper: 指数退避)
    ↓
Notion API
    ↓
BlockRenderer (渲染30+块类型)
    ↓
Cache 保存 (TTL: 5分钟/1小时)
    ↓
返回页面
```

## 核心组件

### 1. NotionDataService (`src/lib/data/notion-service.ts`)

数据获取的单一入口，处理缓存策略和错误处理。

```typescript
// 使用方式
import dataService from '@lib/data';

// 获取所有发布的文章
const posts = await dataService.getAllPosts();

// 获取特定文章
const post = await dataService.getPostBySlug('my-post');
```

### 2. NotionClient (`src/lib/notion/client.ts`)

Notion API 的封装，使用 SDK 5.x，关键变更：
- 使用 `dataSources.query()` 而不是 `databases.query()`
- 需要先获取 `data_source_id`
- 处理分页和错误

### 3. Notion Database 渲染 (`src/lib/notion/database/`)

支持在页面中嵌入 Notion Database，自动渲染为表格或画廊视图。

**架构流程**:
```
NotionPageRenderer (检测 child_database)
    ↓
DatabaseRenderer (解析视图配置)
    ↓
DatabaseRepository (数据层)
    ├── getSchema() → 返回带 propertyOrder 的 schema
    └── queryRows() → 返回排序后的行数据
    ↓
LayoutRenderer (渲染层)
    ├── TableLayoutRenderer (表格布局)
    └── GalleryLayoutRenderer (画廊布局)
```

**关键特性**:
- 支持表格视图（table）和画廊视图（gallery）
- 列顺序和可见性由 Notion 视图配置控制
- 行排序完全在数据层实现
- 支持多种属性类型（text, number, select, date, checkbox 等）

### 4. BlockRenderer (`src/lib/notion/renderer/block-renderer.ts`)

将 Notion blocks 转换为 HTML，支持：
- 30+ 块类型（段落、标题、列表、代码、表格等）
- 富文本格式（粗体、斜体、颜色等）
- 递归子块渲染
- 语法高亮（Prism.js）
- 数学公式（KaTeX）

### 5. 缓存系统 (`src/lib/cache/`)

双层缓存策略：

| 环境 | 实现 | TTL | 存储 |
|------|------|-----|------|
| 开发 | MemoryCache | 5 分钟 | 内存 |
| 生产 | FileCache | 1 小时 | `.cache/notion/*.json` |

### 6. API 优化 (`src/lib/utils/api-helpers.ts`)

- **RateLimiter** - 限制并发请求数（最多3个）
- **RetryHelper** - 自动重试失败请求（指数退避）

### 7. 图片 URL 映射 (`src/lib/notion/map-image-url.ts`)

将 Notion 临时 URL 转换为永久 URL：
```
原始: https://prod-files-secure.s3.xxx/...?expires=3600
转换后: https://www.notion.so/image/{encoded}?table=block&id=xxx
```

## 数据流

### 页面请求流程

```
用户访问 /post/my-post
    ↓
Astro getStaticPaths() 调用 NotionDataService
    ↓
NotionDataService 检查缓存
    ↓ (命中) → 直接返回
    ↓ (未命中) → 请求 Notion API
        ↓
        RateLimiter 控制并发
        ↓
        RetryHelper 处理失败
        ↓
        Notion API 返回数据
    ↓
BlockRenderer 渲染 blocks
    ↓
URL 映射转换图片链接
    ↓
保存到缓存
    ↓
返回给 Astro 进行 SSG
    ↓
生成静态 HTML 文件
    ↓
用户获得完整页面
```

### 内容类型支持

```typescript
// 三种内容类型，通过 type 字段区分

// 1. Post - 博客文章
{
  title: "从 Linux 内核看读写锁设计",
  type: "Post",           // 关键
  status: "Published",
  slug: "kernel-rwlock",
  date: "2024-01-04",
  tags: ["Linux", "内核"],
  summary: "..."
}

// 2. Page - 独立页面
{
  title: "关于我",
  type: "Page",          // 关键
  status: "Published",
  slug: "about",
  date: "2024-01-01",
  summary: "..."
}

// 3. Menu - 导航菜单
{
  title: "博客",
  type: "Menu",          // 关键
  status: "Published",
  slug: "blog",          // 内部链接
  date: "2024-01-01"
}
```

## 文件结构

```
src/
├── lib/
│   ├── data/
│   │   ├── index.ts              # 数据层入口
│   │   └── notion-service.ts     # Notion 服务
│   ├── notion/
│   │   ├── client.ts             # Notion API 客户端
│   │   ├── queries.ts            # 查询方法
│   │   ├── types.ts              # 类型定义
│   │   ├── map-image-url.ts      # 图片 URL 映射
│   │   ├── parser.ts             # Notion 内容解析
│   │   └── database/             # Database 渲染
│   │       ├── index.ts          # 数据库渲染器协调器
│   │       ├── repository.ts     # 数据访问层
│   │       ├── table-layout.ts   # 表格布局渲染器
│   │       ├── gallery-layout.ts # 画廊布局渲染器
│   │       └── types.ts          # 类型定义
│   │   └── renderer/
│   │       ├── block-renderer.ts # Block 渲染器 (709行)
│   │       ├── rich-text.ts      # 富文本渲染
│   │       └── index.ts          # 页面渲染器入口
│   ├── cache/
│   │   ├── index.ts              # 缓存管理器
│   │   ├── memory-cache.ts       # 内存缓存
│   │   ├── file-cache.ts         # 文件缓存
│   │   └── types.ts              # 类型定义
│   └── utils/
│       ├── api-helpers.ts        # 限流、重试
│       ├── date.ts               # 日期工具
│       ├── format.ts             # 格式化工具
│       └── slug.ts               # Slug 工具
├── pages/
│   ├── index.astro               # 首页
│   ├── [slug].astro              # Page 动态路由
│   ├── post/
│   │   ├── index.astro           # 文章列表
│   │   └── [slug].astro          # 文章详情
│   ├── archive.astro             # 归档页面
│   └── tag/
│       └── [tag].astro           # 标签筛选
├── components/
│   └── layout/
│       └── BaseLayout.astro      # 基础布局
├── config/
│   ├── site.ts                   # 站点配置
│   └── theme.ts                  # 主题配置
├── scripts/
│   ├── syntax-highlight.ts       # Prism 高亮 (77行)
│   ├── math-rendering.ts         # KaTeX 公式 (120行)
│   └── mermaid-rendering.ts      # Mermaid 图表
└── styles/
    ├── global.css                # 全局样式
    ├── notion.css                # Notion 块样式 (772行)
    └── index.css                 # 组件样式
```

## 关键技术决策

### 为什么选择 Notion API SDK 5.x？

- ✅ 最新的 API 版本
- ✅ 更好的类型支持
- ⚠️ `databases.query()` 已弃用，使用 `dataSources.query()`

### 为什么是双层缓存？

- 开发环境用内存缓存 → 快速迭代
- 生产环境用文件缓存 → 持久化数据，减少 API 调用

### 为什么需要 RateLimiter？

Notion API 有速率限制（3 请求/秒），超出会被限流，所以：
- 限制并发数为 3
- 请求间隔 100ms
- 自动排队管理

### 为什么需要 RetryHelper？

网络波动导致偶尔失败，自动重试：
- 最多重试 3 次
- 指数退避（1s → 2s → 4s → 8s）
- 只重试临时错误（不重试 401、403 等权限错误）

## 性能指标

| 指标 | 数值 | 说明 |
|------|------|------|
| 首次加载 | ~52s | 从 Notion API 获取所有数据 |
| 缓存命中 | ~15ms | 从缓存读取 |
| 性能提升 | 3466x | 缓存效果 |
| Block 类型 | 30+ | 支持的块类型数 |
| 语法高亮 | 25+ | 支持的编程语言 |

---

**相关文档**:
- [RFCs - 设计决策](./rfcs/) - 功能设计和讨论
- [CLAUDE.md](../CLAUDE.md) - 开发者指南
