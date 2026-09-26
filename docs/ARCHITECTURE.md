# 系统架构

NoPress 是静态博客生成器：Notion Database 是唯一数据源，Astro 在构建时拉取全部内容，生成纯静态站点（`output: 'static'`）。

## 整体架构

```
页面 / 数据端点（构建时 getStaticPaths）
    ↓
NotionDataService (src/lib/notion/service)      ← 所有取数的唯一入口
    ↓ 检查 notionCache（命中 → 直接返回）
NotionAPI (src/lib/notion/api)
    ├── 官方 SDK：RateLimiter(5 并发, 50ms 间隔) + RetryHelper(指数退避)
    └── 非官方 API (notion-client)：RateLimiter(2 并发, 350ms 间隔)
    ↓
Notion API
    ↓
NotionPageRenderer / BlockRenderer（Notion blocks → HTML，30+ 块类型）
    ↓
文件 URL 解析 (file-url.ts)、Bookmark OG 抓取 (opengraph.ts)
    ↓
写入缓存（dev 内存 5 分钟 / build 文件 1 小时）
    ↓
返回 Post 对象 → Astro SSG → dist/
```

## 核心组件

### 1. NotionDataService（`src/lib/notion/service/index.ts`）

数据获取的单一入口，导出单例 `dataService`。每个公开方法对应一个缓存 key：

| 方法 | 缓存 key | 说明 |
|------|----------|------|
| `getAllPosts()` | `all-posts` | 全部已发布文章（date 降序） |
| `getAllPages()` | `all-pages` | 全部独立页面（type=Page） |
| `getAllTags()` | `all-tags` | 标签及计数（由 posts 派生） |
| `getMenuItems()` | `menu-items` | 导航菜单（date 升序） |
| `getDatabaseInfo()` | `database-info` | Database 标题/描述/封面/图标（站点元数据回填） |

`getPostBySlug()` / `getPageBySlug()` / `getPostsByTag()` 不单独发请求，基于 `all-posts` / `all-pages` 内存过滤。文章/页面元数据提取（`extractMetadata`）也在服务层完成。

```typescript
import dataService from '@lib/notion/service';

const posts = await dataService.getAllPosts();
const post = await dataService.getPostBySlug('my-post');
```

### 2. NotionAPI（`src/lib/notion/api/index.ts`）

Notion API 封装，同时使用**官方 SDK 和非官方 API**：

- **官方 SDK（@notionhq/client 5.x）**：
  - 用 `dataSources.query()` 查询；需先 `databases.retrieve()` 取 `data_sources[0].id`
  - `queryPublishedPosts()`（type=Post + status=Published + date 降序）、`queryPages()`（type=Page）、`queryMenuItems()`（type=Menu + date 升序）
  - `getDatabaseMeta()` 提供 Database 元信息（含封面/icon 的归属解析，见 §7）
- **非官方 API（notion-client）**：用于官方 API 覆盖不到的数据——块 format 信息、同步块、child_database 视图配置、文件签名 URL。配独立限流器 `notionUnofficialRateLimiter`；新增数据需求优先使用官方 SDK

### 3. 块渲染器（`src/lib/notion/renderer/`）

自研渲染器（不依赖 notion-to-md），将 Notion blocks 转换为 HTML：

- `block-renderer.ts` — 核心渲染逻辑，按块类型 switch，支持 30+ 块类型（段落、标题、列表、代码、表格、callout、toggle、column、synced_block、embed 等），递归渲染子块
- `rich-text.ts` — 富文本格式（粗体、斜体、颜色、公式内联）
- `index.ts` — 页面级渲染入口，协调 OG 抓取、文件 URL 解析等后处理

代码高亮（Prism.js）和数学公式（KaTeX）在客户端由 `src/scripts/` 渲染。

### 4. Database 渲染（`src/lib/notion/database/`）

支持在页面中嵌入 Notion Database，自动渲染为表格或画廊视图。

```
NotionPageRenderer (检测 child_database block)
    ↓
DatabaseRenderer (index.ts，构建 ViewConfig)
    ↓
DatabaseRepository (数据层)
    ├── getSchema() → 返回带 propertyOrder 的 schema
    └── queryRows() → 返回排序后的行数据
    ↓
LayoutRenderer (渲染层)
    ├── TableLayoutRenderer (table-layout.ts)
    └── GalleryLayoutRenderer (gallery-layout.ts)
```

- 列顺序、可见性、行排序均来自 Notion 视图配置（经非官方 API 获取）
- 排序完全在数据层实现，渲染层不做排序
- Gallery 封面处理分为三步：`resolveCoverSource()` 按视图配置确定一次来源（页面头图或属性 ID，并保留原有属性回退规则）；`resolveCoverUrl()` 按行从选定来源取值并转换 URL；`renderCover()` 仅根据 URL 生成 HTML，不读取行数据或视图配置。
- Gallery 的页面头图模式（`gallery_cover.type = 'page_cover'`）读取行数据的可选 `pageCoverUrl`：仓储从每条 Page 顶层的 `cover` 提取，使用该 Page ID 和 `table: 'block'` 经 `resolveCover()` 解析后写入缓存，无需额外逐页请求。没有头图时保留空封面容器，不回退到 Files 属性；其他封面模式保持原有行为。
- 支持属性类型：text、number、select、multi_select、date、checkbox 等；不支持的类型显示 `—`

### 5. 缓存系统（`src/lib/cache/`）

双层缓存，`notionCache` 单例，按 `NODE_ENV` 自动选择策略：

| 环境 | 实现 | TTL | 存储 |
|------|------|-----|------|
| 开发 | MemoryCache | 5 分钟 | 进程内存 |
| 生产（build） | FileCache | 1 小时 | `.cache/notion/*.json` |

缓存 key 的 namespace 掺入数据层代码版本（`code-version.ts` 对 `src/lib/notion/`、`src/lib/cache/`、`src/lib/utils/`、`src/lib/types.ts` 的内容 hash）：这些代码变更后缓存自动失效，旧缓存文件由 TTL 过期后的 `cleanup()` 回收，无需手动删除 `.cache/`。

### 6. API 优化（`src/lib/utils/api-helpers.ts`）

- **RateLimiter** — 并发控制。官方 API `notionRateLimiter`（5 并发, 50ms 最小间隔）；非官方 API `notionUnofficialRateLimiter`（2 并发, 350ms 间隔）
- **RetryHelper** — 自动重试临时性错误（网络错误、5xx、429），权限错误（401/403）直接抛出。最多 3 次，指数退避 1s → 2s → 4s，延迟上限 30s

### 7. 文件 URL 统一解析（`src/lib/notion/file-url.ts`）

Notion 文件 URL 短时效（官方 API 的 S3 签名 URL 约 1 小时有效），静态产物统一改用 `notion.so/image/` 代理 URL（Notion 服务端代为鉴权，长期有效）。全部解析逻辑收敛于此模块：

| 函数 | 职责 |
|------|------|
| `toProxyUrl(raw, owner)` | 唯一转换入口：`attachment:` 内部引用、Notion 文件存储 URL（新旧两种域名）、file.notion CDN 签名直链、站内相对路径 → 代理 URL；编码前剥离过期签名。已是代理格式、notion.site 公开图、外部图床直通 |
| `fileObjectUrl(obj)` | 官方 API 文件对象（`{type: 'external'\|'file'}`）拆包出原始 URL |
| `resolveIcon(src, owner)` / `resolveCover(src, owner)` | icon（emoji 或图片 URL）与封面的统一解析，兼容官方 API 对象和非官方 API 字符串两种形状 |
| `withDisplayParams(url, width)` | 展示场景追加压缩参数（仅性能优化） |

代理按 `owner`（`{id, table}`，id 为带连字符 UUID）鉴权，各来源文件的归属规则：

| 文件 | owner |
|------|-------|
| 正文图片/视频、callout 图标、文章封面 | 所属 block，`table: 'block'` |
| 数据库 icon | collection 记录，`table: 'collection'` |
| 数据库封面（`collection.cover`，旧版存储位置） | collection 记录，`table: 'collection'` |
| 数据库封面（`format.page_cover`，现行存储位置） | 数据库页 block，`table: 'block'`；URL 取自官方 API 的文件 URL（`attachment:` 引用经代理无法访问） |

例外：PDF/附件等非图片文件代理不支持，`block-renderer.ts` 的 `renderFile()` / `renderPdf()` 走 `getSignedUrl()`（非官方 API 的 `signed_urls` 缓存）。

### 8. 主题系统（`src/lib/theme/` + `src/themes/`）

页面、布局、组件、样式都在主题目录，框架与 UI 解耦。`default` 为全功能主题（6 个路由 + TOC/灯箱/评论）；`minimal` 是契约参考实现——仅依据 `docs/THEMES.md` 编写的三路由极简主题，同时用作主题契约的回归验证（`NOPRESS_THEME=minimal`）：

- `astro-integration.ts` — Astro 集成插件（在 `astro.config.mjs` 注册），扫描激活主题 `pages/` 下的页面（`.astro`）与端点（`.ts`）并 `injectRoute` 注入路由；对内核保留路由做构建期校验
- `manager.ts` / `loader.ts` — 主题注册、激活与加载（`theme.config.mjs` 经原生 ESM 动态导入）；`NOPRESS_THEME` 环境变量选择主题（默认 `default`）
- `schema.ts` — 主题清单的 zod 校验（`theme.config.mjs` 必填 id/name/version）
- 最小约束原则：框架只注入路由和配置别名，不干涉主题内部结构

`src/pages/` 只放内核数据端点（`.md`、`llms.txt`、RSS、robots），主题页面和端点放主题的 `pages/` 下。

### 9. Markdown 转换（`src/lib/markdown/`）

`htmlToMarkdown()` 将已渲染的 `post.content`（HTML）转为 Markdown，用于 `/post/{slug}.md`、`/{slug}.md` 端点和 `llms.txt` 索引（Markdown for Agents 产物）。基于 turndown + GFM 插件，附加 Notion 专属规则（`rules.ts`：公式、callout、代码块、去 UI 噪音）和 frontmatter 生成（`frontmatter.ts`）。转换直接复用缓存 HTML，不重新请求 Notion API。

### 10. 配置系统（`src/lib/config/loader.ts` + `src/config/`）

优先级：环境变量 > `.env` > 代码默认值（经 vite `loadEnv` 读取）。命名规范：`SITE_*`、`COMMENTS_GISCUS_*`。`SITE_TITLE` / `SITE_DESCRIPTION` / `SITE_ICON` 留空时自动回填 Notion Database 元数据（`resolved-site.ts`）。`SITE_URL` 影响 sitemap、RSS、canonical 和 `.md` 端点链接。完整变量表见 [CONFIGURATION.md](./CONFIGURATION.md)。

## 文件结构

```
src/
├── pages/                        # 只有数据端点：post/[slug].md.ts、[slug].md.ts、llms.txt.ts、rss/、robots.txt.ts
├── themes/                       # 主题契约见 docs/THEMES.md
│   ├── default/                  # 默认主题（全功能）：首页、/post/[slug]、/[slug]、/tag/[tag]、/page/[page]、archive
│   │   ├── layouts/              # BaseLayout
│   │   ├── components/           # Header、Footer、PostList、Pagination、Comments 等
│   │   ├── styles/               # global.css、notion.css
│   │   └── theme.config.mjs      # 主题清单
│   ├── minimal/                  # 契约参考实现（NOPRESS_THEME=minimal）：首页、/post/[slug]、/[slug] 三路由极简主题
│   └── terminal/                 # 绿磷光 CRT 风格（NOPRESS_THEME=terminal）：三路由，单深色形态
├── lib/
│   ├── notion/
│   │   ├── service/              # NotionDataService（数据层入口）
│   │   ├── api/                  # NotionAPI（官方 SDK + 非官方 API）+ 类型
│   │   ├── renderer/             # 块渲染器：block-renderer、rich-text、index
│   │   ├── database/             # 嵌入式 Database 渲染（repository、table/gallery layout）
│   │   ├── opengraph.ts          # Bookmark OG 元数据抓取（metascraper）
│   │   └── file-url.ts           # 文件 URL 统一解析（代理转换、icon/封面）
│   ├── cache/                    # notionCache：MemoryCache / FileCache + 数据层代码版本（自动失效）
│   ├── markdown/                 # htmlToMarkdown（turndown + Notion 规则）
│   ├── theme/                    # 主题系统：manager、loader、schema、astro-integration
│   ├── config/loader.ts          # 环境变量配置加载
│   └── utils/                    # api-helpers（限流/重试）、slug、date、format、version（构建 commit id）
├── config/                       # site.ts 默认值 + resolved-site.ts（回填 Database 元数据）
├── core/                         # meta-helpers（<head> 生成）
└── scripts/                      # 客户端脚本：TOC、代码高亮、KaTeX、mermaid、灯箱、giscus
```

---

**相关文档**:
- [AGENTS.md](../AGENTS.md) - AI 代理开发指南（关键约定、任务入口）
- [CONFIGURATION.md](./CONFIGURATION.md) - 环境变量全表
