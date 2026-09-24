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
图片 URL 永久化 (map-image-url.ts)、Bookmark OG 抓取 (opengraph.ts)
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
| `getDatabaseInfo()` | `database-info` | Database 标题/描述/图标（用于站点元数据回填） |

`getPostBySlug()` / `getPageBySlug()` / `getPostsByTag()` 不单独发请求，基于 `all-posts` / `all-pages` 内存过滤。

```typescript
import dataService from '@lib/notion/service';

const posts = await dataService.getAllPosts();
const post = await dataService.getPostBySlug('my-post');
```

### 2. NotionAPI（`src/lib/notion/api/index.ts`）

Notion API 封装，同时使用**官方 SDK 和非官方 API**：

- **官方 SDK（@notionhq/client 5.x）**：
  - 用 `dataSources.query()` 而非已弃用的 `databases.query()`；需先 `databases.retrieve()` 取 `data_sources[0].id`
  - 三个查询方法：`queryPublishedPosts()`（type=Post + status=Published + date 降序）、`queryPages()`（type=Page）、`queryMenuItems()`（type=Menu + date 升序）
  - 元数据提取（extractMetadata 逻辑）也在此文件
- **非官方 API（notion-client）**：仅用于 child_database 视图配置和个别块类型。有 403/429 风险，配独立限流器 `notionUnofficialRateLimiter`（2 并发, 350ms 间隔）；新增数据需求优先使用官方 SDK

### 3. 块渲染器（`src/lib/notion/renderer/`）

自研渲染器（不依赖 notion-to-md），将 Notion blocks 转换为 HTML：

- `block-renderer.ts` — 核心渲染逻辑，按块类型 switch，支持 30+ 块类型（段落、标题、列表、代码、表格、callout、toggle、column、synced_block、embed 等），递归渲染子块
- `rich-text.ts` — 富文本格式（粗体、斜体、颜色、公式内联）
- `index.ts` — 页面级渲染入口，协调 OG 抓取、图片 URL 映射等后处理

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
- 支持属性类型：text、number、select、multi_select、date、checkbox 等；不支持的类型显示 `—`

### 5. 缓存系统（`src/lib/cache/`）

双层缓存，`notionCache` 单例，按 `NODE_ENV` 自动选择策略：

| 环境 | 实现 | TTL | 存储 |
|------|------|-----|------|
| 开发 | MemoryCache | 5 分钟 | 进程内存 |
| 生产（build） | FileCache | 1 小时 | `.cache/notion/*.json` |

缓存 key 的 namespace 掺入了数据层代码版本（`code-version.ts` 对 `src/lib/notion/`、`src/lib/cache/`、`src/lib/utils/`、`src/lib/types.ts` 的内容 hash）：这些代码变更后缓存 key 自动变化、自动失效，旧缓存文件由 TTL 过期后的 `cleanup()` 回收，无需手动删除 `.cache/`。

### 6. API 优化（`src/lib/utils/api-helpers.ts`）

- **RateLimiter** — 并发控制。两个实例：官方 API `notionRateLimiter`（5 并发, 50ms 最小间隔）；非官方 API `notionUnofficialRateLimiter`（2 并发, 350ms 间隔）
- **RetryHelper** — 自动重试临时性错误（网络错误、5xx、429），不重试 401/403 等权限错误。最多 3 次，指数退避 1s → 2s → 4s，延迟上限 30s

### 7. 图片 URL 映射（`src/lib/notion/map-image-url.ts`）

Notion 的图片/附件 URL 会过期，构建产物中必须使用永久代理 URL：

```
原始:  https://prod-files-secure.s3.xxx/...?Expires=...&X-Amz-Signature=...
转换:  https://www.notion.so/image/{encoded_url}?table=block&id={block_id}
```

覆盖 `secure.notion-static.com`、`prod-files-secure`、Notion 内部相对路径及 Bookmark 外部图片。所有进入缓存的图片 URL 都需经过此转换，构建产物才能长期有效。

### 8. 主题系统（`src/lib/theme/` + `src/themes/`）

页面、布局、组件、样式都在主题目录，框架与 UI 解耦。`default` 为全功能主题（6 个路由 + TOC/灯箱/评论）；`minimal` 是契约参考实现——仅依据 `docs/THEMES.md` 编写的三路由极简主题，同时用作主题契约的回归验证（`NOPRESS_THEME=minimal`）：

- `astro-integration.ts` — Astro 集成插件（在 `astro.config.mjs` 注册），扫描激活主题的 `pages/` 目录并 `injectRoute` 注入路由
- `manager.ts` / `loader.ts` — 主题注册、激活与加载（`theme.config.mjs` 经原生 ESM 动态导入，支持任意合法 ESM 写法）；`NOPRESS_THEME` 环境变量选择主题（默认 `default`）
- `schema.ts` — 主题清单的 zod 校验（`theme.config.mjs` 必填 id/name/version）
- 最小约束原则：框架只注入路由和配置别名，不干涉主题内部结构

注意：`src/pages/` 只放数据端点（`.md`、`llms.txt`、RSS、robots），页面 `.astro` 文件放主题的 `pages/` 下。

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
│   └── minimal/                  # 契约参考实现（NOPRESS_THEME=minimal）：首页、/post/[slug]、/[slug] 三路由极简主题
├── lib/
│   ├── notion/
│   │   ├── service/              # NotionDataService（数据层入口）
│   │   ├── api/                  # NotionAPI（官方 SDK + 非官方 API）+ 类型
│   │   ├── renderer/             # 块渲染器：block-renderer、rich-text、index
│   │   ├── database/             # 嵌入式 Database 渲染（repository、table/gallery layout）
│   │   ├── opengraph.ts          # Bookmark OG 元数据抓取（metascraper）
│   │   └── map-image-url.ts      # 图片 URL 永久化
│   ├── cache/                    # notionCache：MemoryCache / FileCache + 数据层代码版本（自动失效）
│   ├── markdown/                 # htmlToMarkdown（turndown + Notion 规则）
│   ├── theme/                    # 主题系统：manager、loader、schema、astro-integration
│   ├── config/loader.ts          # 环境变量配置加载
│   └── utils/                    # api-helpers（限流/重试）、slug、date、format
├── config/                       # site.ts 默认值 + resolved-site.ts（回填 Database 元数据）
├── core/                         # meta-helpers（<head> 生成）
└── scripts/                      # 客户端脚本：TOC、代码高亮、KaTeX、mermaid、灯箱、giscus
```

## 关键技术决策

### 为什么用 SDK 5.x 的 `dataSources.query()`？

`databases.query()` 在 SDK 5.x 中已变更：Database 拆分为 data source 概念，需先 `databases.retrieve()` 拿到 `data_sources[0].id` 再查询。

### 为什么是双层缓存？

- 开发用内存缓存 → 重启即失效，快速迭代
- 构建用文件缓存 → 持久化，减少重复构建时的 API 调用（Notion API 有速率限制）

### 为什么需要两个 RateLimiter？

Notion 官方 API 平均限制约 3 请求/秒，非官方 API 更严格且可能 429。因此官方 API 用 5 并发 + 50ms 间隔，非官方 API 用更保守的 2 并发 + 350ms 间隔，各自独立排队。

### 为什么需要 RetryHelper？

网络波动导致偶发失败，自动重试临时性错误（网络错误、5xx、429），权限错误（401/403）不重试、直接抛出。指数退避避免雪上加霜。

### 为什么图片 URL 要映射？

Notion 的 S3 签名 URL 通常 1 小时过期。静态站点产物长期存在，必须换成 `notion.so/image/` 代理 URL（Notion 服务端代理签名，长期有效）。

### 为什么 HTML → Markdown 而不是 Notion → Markdown？

`post.content` 在数据层已渲染为 HTML 并缓存，Markdown 端点复用它：零额外 API 调用、与页面渲染结果天然一致。

---

**相关文档**:
- [AGENTS.md](../AGENTS.md) - AI 代理开发指南（陷阱清单、任务入口）
- [CONFIGURATION.md](./CONFIGURATION.md) - 环境变量全表
