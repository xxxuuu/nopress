# AGENTS.md

面向 AI 编码代理的项目指南。人类用户的入门文档见 [README.md](README.md)，架构详解见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 项目概述

NoPress 是静态博客生成器：**Notion Database 是唯一数据源**，Astro 在构建时拉取全部内容生成纯静态站点。

- 技术栈：Astro 7（`output: 'static'`）、@notionhq/client 5.x、TypeScript strict
- Node ≥ 24（`.nvmrc`、`package.json` engines）
- 改动通过 `npm run build` 验证（内含 `astro check` 类型检查；项目未配置测试框架和 linter）；构建依赖 `.env` 和 Notion 网络访问，冷缓存时较慢属正常
- dev/build 需要有效的 `.env`（`NOTION_TOKEN` + `NOTION_DATABASE_ID`）；内容全部来自 Notion API，无本地 mock

## 命令

```bash
npm run dev       # 开发服务器（内存缓存，TTL 5 分钟）
npm run check     # astro 类型检查（build 前置执行）
npm run build     # 构建到 dist/（类型检查 + 文件缓存 .cache/，TTL 1 小时）
npm run preview   # 预览构建产物
```

## 目录地图

```
src/
├── pages/                # 只有数据端点：post/[slug].md.ts、[slug].md.ts、llms.txt.ts、robots.txt.ts
├── themes/
│   ├── default/          # 默认主题（全功能）：全部 6 个路由 + TOC/灯箱/评论/全文搜索
│   │   ├── pages/        # 被注入为 Astro 路由（首页、/post/[slug]、/[slug]、/tag/[tag]、/page/[page]、archive）
│   │   ├── layouts/      # BaseLayout
│   │   ├── components/   # Header、Footer、PostList、Pagination、Comments（giscus）、SearchDialog 等
│   │   ├── scripts/      # 主题自有客户端脚本（search：搜索交互，引擎来自 @lib/search/client）
│   │   ├── styles/       # global.css（CSS 变量 + 深色模式）、notion.css、search.css
│   │   └── theme.config.mjs
│   ├── paper/            # 纸本学术排版主题：6 路由、章节编号、页边目录、BibTeX 引用
│   ├── minimal/          # 契约参考实现（NOPRESS_THEME=minimal）：3 个路由的极简主题
│   │   ├── pages/        # 首页、/post/[slug]、/[slug]
│   │   ├── layouts/      # BaseLayout
│   │   └── styles/       # global.css、content.css（仅依据 docs/THEMES.md 契约编写）
│   ├── terminal/         # 绿磷光 CRT 风格（NOPRESS_THEME=terminal）：3 路由，单深色形态
│   └── retro/            # 复古桌面 OS 风格（NOPRESS_THEME=retro）：多窗口桌面（双击开窗/拖拽/任务栏）、图片查看器，5 路由
│       ├── pages/        # 桌面（首页）、/documents 文档夹、/post/[slug]、/[slug]、/tag/[tag]
│       ├── layouts/      # BaseLayout（任务栏 + 开始菜单 + 窗口层）
│       ├── components/   # Window、DesktopIcon、Explorer、Icon（像素 SVG 图标集）
│       ├── scripts/      # 主题自有客户端脚本（desktop：窗口管理器、开始菜单、时钟）
│       └── styles/       # global.css、content.css
│   # 主题契约见 docs/THEMES.md；清单经 zod 验证（id/name/version 必填）
├── lib/
│   ├── notion/
│   │   ├── service/      # NotionDataService 单例：缓存 + 元数据提取（extractMetadata 在此；import dataService from '@lib/notion/service'）
│   │   ├── api/          # NotionAPI：官方 SDK 封装（查询/过滤/排序、签名 URL）+ 非官方 API
│   │   ├── renderer/     # 自研块渲染器：Notion blocks → HTML（30+ 块类型；代码块高亮与公式渲染在构建期完成）
│   │   ├── database/     # 嵌入式 child_database 渲染（表格/画廊视图）
│   │   ├── opengraph.ts  # metascraper 抓取 bookmark 链接的 OG 元数据
│   │   └── file-url.ts
│   ├── cache/            # notionCache 单例：dev=MemoryCache / build=FileCache；namespace 掺数据层代码版本 + 数据源标识，自动失效
│   ├── markdown/         # htmlToMarkdown()：HTML → Markdown（turndown + GFM + Notion 规则）
│   ├── search/           # 全文搜索内核接口：documents、endpoint（/search-docs.json，经 integration.ts 按 SITE_ENABLE_SEARCH 注入）、client（无头客户端 minisearch）
│   ├── rss/              # RSS feed 端点（/rss/feed.xml，经 integration.ts 按 SITE_ENABLE_RSS 注入）
│   ├── theme/            # 主题系统：manager / loader / zod schema / astro-integration
│   ├── config/           # env.ts（环境变量统一读取：配置期 readEnv / 渲染期 readRuntimeEnv）+ loader.ts（SITE_*、COMMENTS_* 配置加载）
│   └── utils/            # slug / date / format / api-helpers（RateLimiter + RetryHelper）/ failure（失败策略）/ version（构建 commit id）
├── config/               # site.ts 默认值 + resolved-site.ts（可回填 Notion Database 元信息）
├── core/                 # meta-helpers（<head> 标签生成）
└── scripts/              # 客户端脚本：TOC、mermaid、图片灯箱、giscus
```

**数据流**：页面/端点 → `dataService`（查缓存）→ `notionAPI`（官方 API 限流 5 并发，非官方 6 并发 + 指数退避重试）→ Notion API → `renderer`（blocks → HTML）→ 结果写入缓存 → 返回 `Post` 对象。详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 关键约定

1. **SDK 5.x 用 `dataSources.query()`**，不是 `databases.query()`。需先 `databases.retrieve()` 取 `data_sources[0].id`。实现见 `src/lib/notion/api/index.ts`。

2. **Notion Database 属性名必须全小写**（`title`、`status`、`date`…）。首字母大写会静默查不到数据。

3. **页面与端点路由都写在主题目录**。`src/pages/` 只放无条件构建的内核数据端点（`.md`、`llms.txt`、robots）；RSS feed 与搜索文档集分别由 `src/lib/rss/`、`src/lib/search/` 的 integration 按 `SITE_ENABLE_RSS` / `SITE_ENABLE_SEARCH` 注入，页面 `.astro` 和主题端点 `.ts` 都放在主题的 `pages/` 下，由 `src/lib/theme/astro-integration.ts` 扫描 `src/themes/*/pages/` 注入路由；`NOPRESS_THEME` 环境变量切换主题（默认 `default`）。主题路由撞内核保留路径（`/rss/feed.xml`、`/[slug].md`、`/search-docs.json` 等）会在构建期报错。

4. **astro-compress 的配置要求**（`astro.config.mjs`）：
   - HTML 选项必须挂在 `HTML['html-minifier-terser']` 键下，写在 `HTML` 顶层会被静默忽略
   - `ignoreCustomComments` 里的 "This page is also available as Markdown" 规则用于保留 Markdown 发现注释，需保持不变

5. **Notion 图片/附件 URL 会过期**。进入缓存的 URL 需经 `file-url.ts` 的 `toProxyUrl()`/`resolveIcon()`/`resolveCover()` 转成 `notion.so/image/` 代理格式，构建产物才能长期有效；代理按归属记录（`table` + `id`）鉴权，各来源的归属规则见 `docs/ARCHITECTURE.md`「文件 URL 统一解析」；PDF/附件例外，走 renderer 的 `getSignedUrl()`（代理不支持非图片文件）。

6. **路径别名**：tsconfig.json 定义四个静态别名 `@/*`、`@lib/*`、`@config/*`、`@core/*`；主题集成另在运行时注入 `@theme`（指向激活主题根目录，因随 `NOPRESS_THEME` 变化不进 tsconfig，主题内部相互引用请用相对路径）。不存在 `@components`、`@data`。

7. **缓存语义**：`getAllPosts()` 拉全量后缓存 key `all-posts`，`getPostBySlug()` / `getPostsByTag()` 等都基于它内存过滤，不会为单篇文章单独发请求。`getAllPages()`、`getAllTags()`、`getMenuItems()`、`getDatabaseInfo()` 各有独立缓存 key。缓存 namespace 掺有数据层代码版本 hash（`src/lib/cache/code-version.ts`，覆盖 notion/cache/utils/types.ts）和数据源标识（`NOTION_DATABASE_ID` 的短 hash），代码或数据源变更后缓存自动失效，无需手动 `rm -rf .cache/`；其余目录（markdown/theme/config）变更不影响缓存。

8. **slug 校验失败的 Post/Page 会被静默跳过**（仅控制台警告），路由匹配用 `slugMatch()` 容忍编码差异。规则在 `src/lib/utils/slug.ts`。

9. **Markdown 转换方向是 HTML → Markdown**（`src/lib/markdown/`，turndown）：`post.content` 是已渲染并缓存的 HTML，`.md` 端点直接从它转换，不重新请求 Notion API。

10. **`notion-client`（非官方 API）** 只用于 child_database 视图配置和个别块类型，有 403/429 风险，已配独立限流。新增数据需求优先使用官方 SDK。

11. **配置优先级**：环境变量 > `.env` > 代码默认值；单键读取统一走 `src/lib/config/env.ts`（配置期 `readEnv()` 经 `loadEnv` 补读，渲染期 `readRuntimeEnv()`）。`SITE_URL` 影响 sitemap、RSS、canonical 和 `.md` 端点的绝对链接。

12. **主题选项与保留 key**：宿主经 `NOPRESS_THEME_OPTIONS`（JSON）覆盖主题清单声明的 `options`；`darkMode` 为保留 key——声明且为 true 时内核自动注入深色模式初始化。机制与保留清单见 `docs/THEMES.md`。

13. **客户端导航生命周期**：主题布局**必须**包含 `<ClientRouter />`，站内导航为软导航——脚本初始化必须挂 `astro:page-load`（软导航后 `<script>` 不重跑），依赖 `<html>` 运行时属性的逻辑须在 `astro:after-swap` 重应用（属性会被替换为目标文档初始状态）。约定详见 `docs/THEMES.md`。

## Notion Database Schema（领域知识）

属性名**必须全小写**。只有 `status=Published` 的条目会显示。

| 属性 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `title` | Title | ✅ | 标题 |
| `type` | Select | ✅ | `Post` / `Page` / `Menu` |
| `status` | Select | ✅ | 只有 `Published` 会被查询 |
| `slug` | Rich Text | ✅ | URL 路径 |
| `summary` | Rich Text | ✅ | 摘要 |
| `date` | Date | ✅ | 发布日期，Post/Menu 的排序依据 |
| `tags` | Multi-select | Post | 标签 |
| `updated` | Date | - | 更新日期 |
| `cover` | Files | - | 封面图 |

三种内容类型：

- **`type=Post`** → `/post/{slug}`，按 `date` 降序
- **`type=Page`** → `/{slug}`（关于页、归档页等独立页面）
- **`type=Menu`** → 顶部导航项。`slug` 为内部路径（自动加 `/` 前缀）或完整外部 URL，按 `date` 升序排列

查询逻辑在 `src/lib/notion/api/index.ts` 的 `queryPublishedPosts()` / `queryPages()` / `queryMenuItems()`。

## 常见任务入口

| 任务 | 去哪里 |
|------|--------|
| 新增/修改 Notion 字段 | `src/lib/types.ts`（Post 接口）→ `src/lib/notion/service/index.ts`（字段提取）→ `src/lib/notion/api/index.ts`（查询/过滤/排序）→ 上表 schema |
| 改页面样式/布局 | `src/themes/default/`（styles/、layouts/） |
| 新增/修改主题 | `src/themes/<id>/`，遵循 `docs/THEMES.md` 契约（minimal 为参考实现） |
| 新增客户端功能 | `src/scripts/` 新建脚本 + `BaseLayout.astro` 引入 |
| 自定义 Notion 块渲染 | `src/lib/notion/renderer/block-renderer.ts`（按块类型 switch） |
| 改 Markdown 产物格式 | `src/lib/markdown/rules.ts`（Notion 规则）、`frontmatter.ts` |
| 全文搜索 | 内核接口：`src/lib/search/`；默认主题 UI：`src/themes/default/scripts/search.ts` + `components/SearchDialog.astro` |
| 站点配置 | 环境变量（`.env.example` 有完整清单）或 `src/config/site.ts` |

## 工作准则

**验证**：代码改动后运行 `npm run build` 确认构建通过（内含 `astro check` 类型检查，也是 CI 部署时执行的唯一检查）；数据层代码（notion/cache/utils/types.ts）改动会自动失效构建缓存，直接构建即可（见「缓存语义」）。

**文档同步**：改动落地时同步更新对应文档，避免文档与代码漂移：

| 改动类型 | 需要更新 |
|----------|----------|
| 目录结构、模块职责 | 本文件目录地图 + `docs/ARCHITECTURE.md` |
| 环境变量 | `.env.example` + `docs/CONFIGURATION.md` + `.github/workflows/build.yaml`（部署时从 CI 变量注入，遗漏会导致线上配置缺失） |
| Notion schema、查询逻辑 | 本文件 schema 表 + `docs/ARCHITECTURE.md` |
| 新增子系统/功能 | 在 `docs/` 新建文档 |

**提交信息**：遵循 Conventional Commits（`feat:` / `fix:` / `chore:` / `docs:` / `refactor:` / `style:` / `ci:`，见 git log 现有风格），一句话说清改动。提交需签名：用 `git commit -s -S`（`-s` 附加 Signed-off-by 行，`-S` 签名提交）。

**代码风格**：跟随现有代码——注释与文档用中文，TypeScript strict（避免引入 any），命名与邻近代码一致。

**敏感信息**：`NOTION_TOKEN` 等只放 `.env`（已 gitignore），不出现在代码、文档和提交信息中。

**范围控制**：只改与当前任务相关的文件；发现无关问题在回复中说明，不顺手重构。

## 文档索引

- `docs/USER-GUIDE.md` — 用户指南（非开发者：搭站、写作、换主题）
- `docs/DEVELOPMENT.md` — 开发指南（贡献者：环境、命令、调试、提交）
- `docs/ARCHITECTURE.md` — 架构详解（数据流、各子系统、技术决策）
- `docs/THEMES.md` — 主题开发契约（数据 API、内容 HTML 结构、可选脚本、别名稳定性、分发）
- `docs/CONFIGURATION.md` — 环境变量全表
- `docs/COMMENTS.md` — giscus 评论系统
