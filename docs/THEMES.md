# NoPress 主题开发契约（v1）

本文档是主题与框架之间的完整契约。主题作者只需依赖本文档列出的 API 与约定；未列出的内部模块可能随时变更，恕不另行通知。

目标读者：想为 NoPress 编写或修改主题的开发者。架构背景见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 1. 主题的形态

一个主题是一个目录，最小要求只有两个文件/目录：

```
my-theme/
├── theme.config.mjs    # 必需：主题清单（原生 ESM，默认导出配置对象）
└── pages/              # 必需：页面路由（.astro 文件，结构见 §2）
├── layouts/            # 可选，自由组织
├── components/         # 可选，自由组织
└── styles/             # 可选，自由组织
```

除 `theme.config.mjs` 和 `pages/` 外，目录内部结构完全由主题自行决定。

### theme.config.mjs 字段

| 字段 | 必需 | 说明 |
|------|------|------|
| `id` | ✅ | 主题标识，仅小写字母、数字、连字符 |
| `name` | ✅ | 显示名称 |
| `version` | ✅ | semver 格式（如 `1.0.0`） |
| `author` / `description` / `homepage` / `repository` / `license` | - | 元信息 |
| `compatibleVersion` | - | 声明兼容的 NoPress 版本范围。**当前仅作文档标注，框架不校验** |

清单经 zod 校验，缺必需字段或格式错误会在构建启动时失败。

## 2. 加载与路由注入

- 环境变量 `NOPRESS_THEME` 选择 in-tree 主题（`src/themes/` 下的目录名），默认 `default`
- 环境变量 `NOPRESS_THEME_PATH` 指定 out-tree 主题（本地绝对/相对路径，或 node_modules 内的包名），优先级高于 `NOPRESS_THEME`
- 框架在构建启动时扫描激活主题的 `pages/` 目录，把每个 `.astro` 文件注入为 Astro 路由：

| 文件 | 路由 pattern |
|------|--------------|
| `pages/index.astro` | `/` |
| `pages/about.astro` | `/about` |
| `pages/post/[slug].astro` | `/post/[slug]` |
| `pages/tag/[tag].astro` | `/tag/[tag]` |
| 子目录递归同理 | `pages/foo/bar.astro` → `/foo/bar` |

**主题的职责**：动态路由的 `getStaticPaths()` 由页面文件自己实现（见 §3.1 示例）。

**主题自有页面**：路由名不限于数据模型——`pages/` 下任意 `.astro` 文件都会成为路由，且不要求使用 Notion 数据。搜索页、友链页、作品集等主题专属页面直接新增文件即可（如 `pages/search.astro` → `/search`）；需要数据时在同一页面构建期调用 `dataService` 并把结果内联（静态站点无运行时数据）。

**保留路径**：框架在 `src/pages/` 下提供数据端点，主题路由不可占用：`/post/{slug}.md`、`/{slug}.md`、`/rss/feed.xml`、`/llms.txt`、`/robots.txt`、`/sitemap-index.xml`。

## 3. 数据访问

唯一数据入口是 `@lib/notion/service`（单例）。数据来自 Notion Database，全部在构建期取得，无运行时请求。

```ts
import dataService from '@lib/notion/service';
```

| 方法 | 返回 | 说明 |
|------|------|------|
| `getAllPosts()` | `Post[]` | 全部已发布文章，按 `publishedAt` 降序 |
| `getPostBySlug(slug)` | `Post \| null` | 基于全量内存过滤 |
| `getPostsByTag(tag)` | `Post[]` | 按标签过滤，日期降序 |
| `getAllTags()` | `Tag[]` | 标签名 + slug + 计数，按计数降序 |
| `getMenuItems()` | `MenuItem[]` | 顶部导航（`type=Menu`），`date` 升序 |
| `getAllPages()` | `Post[]` | 独立页面（`type=Page`），与 Post 同构 |
| `getPageBySlug(slug)` | `Post \| null` | 按 slug 取独立页面 |
| `getDatabaseInfo()` | `{ title, description, coverUrl, icon }` | Database 元信息 |

字段类型的唯一来源是 `@lib/types`：

```ts
import type { Post, Tag, MenuItem } from '@lib/types';
```

`Post` 关键字段：`id` / `title` / `slug` / `description` / `publishedAt` / `updatedAt`（可空）/ `tags` / `coverUrl` / `icon`（emoji 或图片 URL）/ `content`（已渲染 HTML，见 §4）/ `excerpt` / `readingTime`（分钟）。

`MenuItem`：`{ title, url, isExternal }`——内部路径已带 `/` 前缀，外部链接完整 URL。

### 3.1 页面示例

```astro
---
import { isValidSlug } from '@lib/utils/slug';

export async function getStaticPaths() {
  const posts = await dataService.getAllPosts();
  return posts
    .filter(post => isValidSlug(post.slug))  // 无效 slug 的文章会被静默跳过
    .map(post => ({ params: { slug: post.slug }, props: { post } }));
}

const { post } = Astro.props;
---
<div class="notion-content" set:html={post.content} />
```

路由匹配对编码差异宽容（`slugMatch`），但生成路径时请始终用原始 `post.slug`。

### 3.2 站点配置

```ts
import { getResolvedSiteConfig } from '@config/resolved-site';
const SITE_CONFIG = await getResolvedSiteConfig();
```

返回 `ResolvedSiteConfig`：用户环境变量与 Notion Database 元数据合并后的配置。`title` / `description` / `icon` 必有值（自动回填 Database 标题/描述/图标），另有 `url`、`social`（Record）、`postsPerPage`、`enableRSS`、`enableSitemap`、`comments`（giscus 配置）、`seo`（`ogImage` / `twitterCard` / `twitterSite`）。

`<head>` 元标签可复用 core 工具：`getMetaConfig()`（`@core/config/meta`）+ `generateMetaTags()`（`@core/lib/meta-helpers`）。

## 4. 内容渲染契约（post.content / page.content）

`content` 是构建期由框架渲染器生成的 HTML 字符串。**HTML 结构和类名是公共 API**（变更政策见 §10），主题负责它的全部样式。核心结构：

| 内容 | 输出结构 |
|------|----------|
| 容器 | 由主题提供（`set:html` 的挂载点）；若需 TOC 功能必须含 `notion-content` 类，见 §5 |
| 段落/标题/引用/分隔线 | `<p>` `<h1>`-`<h3>` `<blockquote class="notion-quote">` `<hr class="notion-divider">` |
| Callout | `.notion-callout` > `.notion-callout-icon` + `.notion-callout-content` |
| 代码块 | `.notion-code-block` > `.notion-code-header`（`.notion-code-language` + 复制按钮 `.notion-code-copy`）+ `pre.notion-code > code.language-{lang}`；Prism token 配色（`.token.*`）由主题 CSS 负责 |
| Mermaid 图表 | 同代码块，`code.language-mermaid`，由脚本替换为 SVG |
| 行内公式 | `<code class="notion-equation">{latex}</code>`（无 `$` 包裹） |
| 块级公式 | `.notion-equation-block > .notion-equation`，文本为 `$$latex$$`；脚本用 KaTeX 替换内容并注入 KaTeX 样式，主题可覆盖布局（`.katex-display` 等） |
| 表格 | `.notion-table-wrapper > table.notion-table` |
| 图片 | `<a class="glightbox" data-gallery="article-images" data-title data-description><img …></a>`；封面图带 `onload` 内联脚本计算宽高比（容器需支持 `data-aspect-ratio` / `.loaded`） |
| 书签卡片 | `.notion-bookmark` > `.notion-bookmark-info`（title/description/url）+ `.notion-bookmark-cover` |
| 嵌入 | `.notion-embed-wrapper > iframe.notion-embed`；降级为 `.notion-embed--fallback` 链接 |
| Toggle | `.notion-toggle > .notion-toggle-title + .notion-toggle-content`（展开态加 `.notion-toggle-expanded`） |
| Todo 列表 | `.notion-todo-list > .notion-todo-item`（勾选项带 `checked`） |
| 子页面 | `.notion-child-page` 链接 |
| 嵌入 Database | `.notion-database-wrapper` 内表格视图（`.notion-database-table-*`）或画廊视图（`.notion-database-gallery-*`、`.notion-database-card-*`），完整类名以渲染器输出为准 |
| 不支持的块 | `.notion-unsupported`（不阻断渲染） |

## 5. 可选客户端脚本

框架提供一组即插即用的客户端脚本（`src/scripts/`），主题**自行决定引入哪些**。它们只依赖 §4 的 DOM 约定，不依赖特定主题：

```astro
<script>
  import '@/scripts/syntax-highlight';
  import '@/scripts/code-copy';
</script>
```

| 脚本 | 作用 | DOM 依赖 | 样式责任 |
|------|------|----------|----------|
| `syntax-highlight` | Prism 按语言按需高亮 | `.notion-code > code[class*="language-"]` | **主题**负责 `.token.*` 配色 |
| `code-copy` | 代码块复制按钮 | 渲染器自带的 `.notion-code-copy` | 主题负责按钮外观（`.copied` 态） |
| `math-rendering` | KaTeX 渲染行内/块级公式 | `code.notion-equation`、`.notion-equation-block .notion-equation` | 脚本注入 KaTeX 核心样式；主题可覆盖布局 |
| `mermaid-rendering` | Mermaid 图表渲染 | `pre code.language-mermaid` | 主题可设 `.mermaid` 容器尺寸 |
| `image-gallery` | PhotoSwipe 灯箱 | 渲染器自带的 `.glightbox[data-gallery="article-images"]` | 脚本注入 PhotoSwipe CSS |
| `table-of-contents` | 自动目录 + 滚动高亮 | **主题提供** `.toc-container` 容器 + 内容容器 `.notion-content`（h1-h3） | 主题负责目录样式（`.toc-item` / `.toc-active` 等） |
| `comments/giscus` | giscus 评论 | 见 §7 | 主题负责容器样式 |

不引入对应脚本时，上述标记仍是合法 HTML（公式/代码以原文显示，灯箱退化为普通图片链接），不会报错。

## 6. 深色模式约定

- 当前主题写在 `<html>` 的 class 上：`light` 或 `dark`
- 持久化 key：`localStorage.theme`（值为 `'light' | 'dark'`）
- 主题应在 `<head>` 内联防闪烁脚本（必须在首帧前执行）：

```html
<script is:inline>
  (function() {
    const theme = localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.add(theme);
  })();
</script>
```

CSS 侧用 `html.dark …` / `:root …` 区分两套变量。

## 7. 评论系统

评论配置来自 `SITE_CONFIG.comments`（`enabled` + `provider` + `giscus` 详情）。接入模式：服务端渲染容器 + `data-*` 传参 + 客户端初始化：

```astro
---
const SITE_CONFIG = await getResolvedSiteConfig();
const giscusData = JSON.stringify({ slug, title, config: SITE_CONFIG.comments.giscus });
---
{SITE_CONFIG.comments.enabled && (
  <div class="comments-container" data-giscus-config={giscusData} data-provider={SITE_CONFIG.comments.provider}>
    <div class="comments-loading">加载评论中...</div>
  </div>
)}
<script>
  import { initGiscus } from '@/scripts/comments/giscus';
  // 读取 .comments-container 的 data-giscus-config / data-provider 后调用 initGiscus()
</script>
```

## 8. 别名与稳定性分级

| 别名 | 指向 | 稳定性 |
|------|------|--------|
| `@lib/notion/service` | 数据服务单例 | **稳定**（本契约 §3） |
| `@lib/types` | 数据契约类型 | **稳定**（本契约 §3） |
| `@lib/utils/date`、`@lib/utils/slug`、`@lib/utils/format` | 通用工具 | **稳定** |
| `@config/resolved-site`、`@config/site` | 站点配置 | **稳定**（本契约 §3.2） |
| `@core/config/meta`、`@core/lib/meta-helpers` | `<head>` 元标签工具 | **稳定** |
| `@/scripts/*` | 客户端脚本 | **稳定**（本契约 §5，含各自的 DOM 约定） |
| `@theme` | 激活主题根目录（运行时注入） | 稳定；主题内部互引请用相对路径（tsconfig 无法解析动态别名，`astro check` 会报错） |
| `@lib/notion/api`、`@lib/notion/renderer`、`@lib/cache`、`@lib/markdown`、`@lib/config` | 框架内部 | **不稳定**，主题不应直接依赖 |
| `@`、`@lib`、`@config`、`@core`（tsconfig 静态别名） | — | 指向如上各项 |

## 9. 分发与兼容

当前支持的两种方式：

1. **in-tree**：把主题目录放进 `src/themes/`，设 `NOPRESS_THEME={目录名}`
2. **本地路径**：设 `NOPRESS_THEME_PATH=../my-theme`（开发期友好，改动即时生效）

以 npm 包形式分发主题需要 NoPress 内核先完成包化（框架模块当前直接从宿主项目 `src/` 解析），属于远期路线。在此之前请勿假设 out-tree 主题可以引用未列在 §8 中的模块。

## 10. 变更政策

以下内容视为公共 API，破坏性变更会在 CHANGELOG 中显著标注：

- §4 的内容 HTML 结构与 `notion-*` 类名（渲染器新增块类型为非破坏性变更）
- §5 各脚本的 DOM 约定与引入路径
- §3 数据服务的返回结构与 `@lib/types` 字段
- §6 深色模式约定、§8 稳定别名

新增能力（新的可选脚本、新的数据字段）不破坏兼容，主题应做好未知块类型（`.notion-unsupported`）与未知字段的容错。
