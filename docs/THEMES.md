# NoPress 主题开发契约（v1）

本文档是主题与框架之间的完整契约。主题作者只需依赖本文档列出的 API 与约定；未列出的内部模块可能随时变更，恕不另行通知。

目标读者：想为 NoPress 编写或修改主题的开发者。架构背景见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 1. 主题的形态

一个主题是一个目录，最小要求只有两个文件/目录：

```
my-theme/
├── theme.config.mjs    # 必需：主题清单（原生 ESM，默认导出配置对象）
├── pages/              # 必需：页面（.astro）与数据端点（.ts），结构见下文
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
| `options` | - | 主题配置选项声明：key → `{ type, default, label, description?, choices?, min?, max? }`，type 为 `string/number/boolean/select/color`。宿主可覆盖默认值，主题经 `@lib/theme/options` 读取（见 §3.3） |

清单经 zod 校验，缺必需字段或格式错误会在构建启动时失败。

## 2. 加载与路由注入

- 环境变量 `NOPRESS_THEME` 选择 in-tree 主题（`src/themes/` 下的目录名），默认 `default`
- 环境变量 `NOPRESS_THEME_PATH` 指定 out-tree 主题（本地绝对/相对路径，或 node_modules 内的包名），优先级高于 `NOPRESS_THEME`
- 框架在构建启动时扫描激活主题的 `pages/` 目录，把 `.astro` 页面和 `.ts` 端点注入为 Astro 路由：

| 文件 | 路由 pattern |
|------|--------------|
| `pages/index.astro` | `/` |
| `pages/about.astro` | `/about` |
| `pages/post/[slug].astro` | `/post/[slug]` |
| `pages/tag/[tag].astro` | `/tag/[tag]` |
| `pages/search-index.json.ts` | `/search-index.json`（端点，见下节） |
| 子目录递归同理 | `pages/foo/bar.astro` → `/foo/bar` |

**主题端点**：`pages/` 下的 `.ts` 文件成为数据端点（与内核 `src/pages/` 的文件路由约定一致）——剥 `.ts` 后文件名即路由（副扩展名保留），导出 `GET` 返回 `Response`；动态端点（如 `[slug].json.ts`）自带 `getStaticPaths()`：

```ts
// pages/search-index.json.ts —— 构建期执行，产出静态 JSON
import dataService from '@lib/notion/service';

export async function GET() {
  const posts = await dataService.getAllPosts();  // 复用 all-posts 缓存
  return new Response(
    JSON.stringify(posts.map(p => ({ title: p.title, slug: p.slug }))),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
```

`Content-Type` 等响应头由端点自行设置。端点没有目录索引语义（`index.json.ts` → `/index.json`）。

**主题的职责**：动态路由的 `getStaticPaths()` 由页面/端点文件自己实现（见 §3.1 示例）。

**主题自有页面**：路由名不限于数据模型——`pages/` 下任意 `.astro` 文件都会成为路由，且不要求使用 Notion 数据。搜索页、友链页、作品集等主题专属页面直接新增文件即可（如 `pages/search.astro` → `/search`）；需要数据时在同一页面构建期调用 `dataService` 并把结果内联（静态站点无运行时数据）。

**保留路径**：以下路由由内核提供，主题页面与端点都不可占用，撞名会在构建期直接失败：`/post/{slug}.md`、`/{slug}.md`、`/rss/feed.xml`、`/llms.txt`、`/robots.txt`、`/sitemap-index.xml`。

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

`startYear`（`number | undefined`）来自 `SITE_START_YEAR`；页脚使用 `copyrightYearText`（`string`）展示年份，如 `2026` 或 `2023–2026`。

`<head>` 元标签可复用 core 工具：`getMetaConfig()`（`@core/config/meta`）+ `generateMetaTags()`（`@core/lib/meta-helpers`）。

### 3.3 主题选项

主题可在 `theme.config.mjs` 声明配置项，宿主通过环境变量 `NOPRESS_THEME_OPTIONS`（JSON 对象）覆盖默认值，主题代码读取合并结果：

```js
// theme.config.mjs —— 声明
export default {
  id: 'my-theme', name: 'My Theme', version: '1.0.0',
  options: {
    accentColor: { type: 'color', default: '#0066cc', label: '主题色' },
    showMeta:    { type: 'boolean', default: true, label: '显示元信息' },
    layout:      { type: 'select', default: 'list', choices: ['list', 'grid'], label: '布局' },
  },
};
```

```ts
// 主题代码 —— 读取（构建期常量，frontmatter 与客户端脚本均可导入）
import { themeOptions } from '@lib/theme/options';
const { accentColor = '#0066cc' } = themeOptions as { accentColor?: string };
```

规则：

- **覆盖来源**：`NOPRESS_THEME_OPTIONS='{"accentColor":"#f00"}'`，key 与声明一致（建议 camelCase）
- **类型转换**：`number`/`boolean` 接受字符串形态（`"42"`、`"true"`）；`select` 校验 `choices`；`number` 校验 `min`/`max`
- **fail fast**：未知 key、类型不匹配、越界均在构建期报错，不会静默丢弃；宿主对未声明 key 的覆盖会构建失败（防拼写错误）
- **保留选项 key**：`darkMode`（boolean）具有框架级行为（见 §6）；其余选项纯粹供主题自身消费
- 修改 `NOPRESS_THEME_OPTIONS` 后需重启 dev server（值在构建启动时固化）

完整可运行示例：`src/themes/minimal/`（`footerText` + `showPostMeta`）、`src/themes/default/`（`darkMode` + `showPostCover` + `showReadingTime`）、`src/themes/terminal/`（`promptSymbol` + `showScanlines`）。

## 4. 内容渲染契约（post.content / page.content）

`content` 是构建期由框架渲染器生成的 HTML 字符串。**HTML 结构和类名是公共 API**（变更政策见 §10），主题负责它的全部样式。核心结构：

| 内容 | 输出结构 |
|------|----------|
| 容器 | 由主题提供（`set:html` 的挂载点）；若需 TOC 功能必须含 `notion-content` 类，见 §5 |
| 段落/标题/引用/分隔线 | `<p>` `<h1>`-`<h3>`（带 `id` 锚点） `<blockquote class="notion-quote">` `<hr class="notion-divider">` |
| 嵌套块容器 | 嵌套列表/column 等的子块包在 `div.notion-children` 中 |
| 富文本颜色 | 行内/块级 Notion 颜色：文字色 `notion-{color}`、背景色 `notion-{color}-background`，色域 `gray/brown/orange/yellow/green/blue/purple/pink/red`，挂在 `<span>` 或 `<p>` 上；主题应提供全部 9 色的双模式映射 |
| Callout | `.notion-callout`(带 `notion-callout-{color}-background` 变体) > `.notion-callout-icon`(emoji 或 `img.notion-callout-icon-img`) + `.notion-callout-content` |
| 代码块 | `.notion-code-block` > `.notion-code-header`（`.notion-code-language` + 复制按钮 `.notion-code-copy`）+ `pre.notion-code > code.language-{lang}`，可选 `.notion-code-caption`；Prism token 配色（`.token.*`）由主题 CSS 负责 |
| Mermaid 图表 | 同代码块，`code.language-mermaid`，由脚本替换为 SVG |
| 行内公式 | `<code class="notion-equation">{latex}</code>`（无 `$` 包裹） |
| 块级公式 | `.notion-equation-block > .notion-equation`，文本为 `$$latex$$`；脚本用 KaTeX 替换内容并注入 KaTeX 样式，主题可覆盖布局（`.katex-display` 等） |
| 表格 | `.notion-table-wrapper > table.notion-table` |
| 图片 | `figure.notion-image.notion-image-{center\|left\|right}`（可选加 `notion-image-page-width`）> `<a class="glightbox" data-gallery="article-images" data-title data-description><img …></a>`；图片带 `onload` 内联脚本计算宽高比（`a` 元素接收 `data-aspect-ratio` / `.loaded`）；多图排布用 `.notion-column-list > .notion-column` |
| 书签卡片 | `.notion-bookmark` > `.notion-bookmark-info`（title/description/url）+ `.notion-bookmark-cover` |
| 链接提及 | `.notion-mention` > `.notion-mention-icon`（`img.notion-mention-favicon`）+ `.notion-mention-text`，整体为 `<a>` 时可点击 |
| 嵌入 | `figure.notion-embed-wrapper > iframe.notion-embed`（+ `figcaption`）；Twitter 变体 `notion-embed--twitter`；无法内嵌时降级为 `.notion-embed--fallback` 链接 |
| 视频 | `figure.notion-video-wrapper > iframe.notion-video`（+ `figcaption`） |
| PDF | `.notion-pdf` > `.notion-pdf-viewer`（iframe） |
| Toggle | 原生 `<details class="notion-toggle">` > `<summary class="notion-toggle-title">` + `.notion-toggle-content`——原生元素交互，无需 JS |
| Todo 列表 | `.notion-todo-list > .notion-todo-item`（勾选项带 `checked`） |
| 子页面 | `.notion-child-page` 链接 |
| 嵌入 Database | `.notion-database-wrapper` 内表格视图（`.notion-database-table-*`）或画廊视图（`.notion-database-gallery-*`、`.notion-database-card-*`），select 值带颜色变体 `notion-database-select-{color}`，完整类名以渲染器输出为准 |
| 不支持的块 | `.notion-unsupported`（不阻断渲染） |

## 5. 客户端脚本与导航

**必需：客户端导航**。主题布局的 `<head>` 必须包含 `<ClientRouter />`（`astro:transitions`）：

```astro
---
import { ClientRouter } from 'astro:transitions';
---
<head>
  <ClientRouter />
  ...
</head>
```

它把站内导航变为软导航（点击链接只替换页面主体，不整页刷新）。两条硬约定：

- 内核脚本的初始化统一挂在 `astro:page-load`（首次加载与每次软导航后都触发）——**缺少 `<ClientRouter />` 时该事件不会触发，全部脚本失效**
- 软导航会替换 `<html>` 的属性——依赖运行时 class 的逻辑（如深色模式）需在 `astro:after-swap` 重应用（内核注入的深色初始化已处理）；主题自有脚本的初始化同样挂 `astro:page-load`，而不是在脚本顶层直接操作 DOM

### 可选增强脚本

主题按需引入以下内核脚本，它们只依赖 §4 的 DOM 约定：

| 脚本 | 作用 | DOM 依赖 | 样式责任 |
|------|------|----------|----------|
| `syntax-highlight` | Prism 按语言按需高亮 | `.notion-code > code[class*="language-"]` | **主题**负责 `.token.*` 配色 |
| `code-copy` | 代码块复制按钮 | 渲染器自带的 `.notion-code-copy` | 主题负责按钮外观（`.copied` 态） |
| `math-rendering` | KaTeX 渲染行内/块级公式 | `code.notion-equation`、`.notion-equation-block .notion-equation` | 脚本注入 KaTeX 核心样式；主题可覆盖布局 |
| `mermaid-rendering` | Mermaid 图表渲染 | `pre code.language-mermaid` | 主题可设 `.mermaid` 容器尺寸 |
| `image-gallery` | PhotoSwipe 灯箱 | 渲染器自带的 `.glightbox[data-gallery="article-images"]` | 脚本注入 PhotoSwipe CSS |
| `table-of-contents` | 自动目录 + 滚动高亮 | **主题提供** `.toc-container` 容器 + 内容容器 `.notion-content`（h1-h3） | 主题负责目录样式（`.toc-item` / `.toc-active` 等） |
| `comments/giscus` | giscus 评论 | 见 §7 | 主题负责容器样式 |

引入方式（按需选取）：

```astro
<script>
  import '@/scripts/syntax-highlight';
  import '@/scripts/math-rendering';
</script>
```

`image-gallery` 保留正文图片的懒加载，灯箱先显示正文压缩图，再按需升级原图。图片尚未加载时只按宽高比暂时占位，不使用正文的 CSS 显示尺寸作为固有尺寸；灯箱图片加载后以 `naturalWidth` / `naturalHeight` 更新数据，并刷新 PhotoSwipe 内容与缩放边界。尺寸及原图状态按图片链接保存，因此直接跳到末尾、往返切换和重新打开均不依赖正文是否滚动到该图片。

灯箱刷新会等待拖动、双指缩放和过渡动画结束。原图升级时，已放大的图片保留屏幕上的显示大小和查看位置（以新边界为限）；尚未缩放的图片继续按真实尺寸适配视口。

不引入对应脚本时，上述标记仍是合法 HTML（公式/代码以原文显示，灯箱退化为普通图片链接），不会报错。

## 6. 深色模式

- 主题在清单 `options` 中声明 `darkMode`（boolean，保留 key）即声明为双模式主题，框架负责模式初始化，主题只管样式与切换 UI
- 配色钩子：`<html>` 的 class——`light` 或 `dark`，CSS 用 `:root …` / `html.dark …` 两套变量
- 切换 UI（如 ThemeToggle）由主题提供：toggle `html` 的 class 并写 `localStorage.theme`（值为 `'light' | 'dark'`）
- 未声明或值为 false：单形态主题，框架不做任何深色处理

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
| `@lib/theme/options` | 主题选项合并结果（构建期常量） | **稳定**（本契约 §3.3） |
| `@core/config/meta`、`@core/lib/meta-helpers` | `<head>` 元标签工具 | **稳定** |
| `@/scripts/*` | 客户端脚本 | **稳定**（本契约 §5，含各自的 DOM 约定） |
| `@theme` | 激活主题根目录（运行时注入） | 稳定；主题内部互引请用相对路径（tsconfig 无法解析动态别名，`astro check` 会报错） |
| `@lib/notion/api`、`@lib/notion/renderer`、`@lib/cache`、`@lib/markdown`、`@lib/config` | 框架内部 | **不稳定**，主题不应直接依赖 |
| `@`、`@lib`、`@config`、`@core`（tsconfig 静态别名） | — | 指向如上各项 |

## 9. 分发与兼容

当前支持的接入方式：

1. **in-tree**：把主题目录放进 `src/themes/`，设 `NOPRESS_THEME={目录名}`
2. **项目内路径**：主题放在项目内任意目录，设 `NOPRESS_THEME_PATH=themes-dev/my-theme`（开发期友好，改动即时生效）
3. **npm 包安装**：主题目录内提供 `package.json`（`files` 覆盖 `pages`/`layouts`/`styles`/`theme.config.mjs`），发布到 registry 或本地打包安装均可：

   ```bash
   # 已发布到 registry
   npm install nopress-theme-my-theme

   # 本地验证
   cd /path/to/my-theme && npm pack
   npm install --no-save ./nopress-theme-my-theme-1.0.0.tgz
   ```

   安装后设 `NOPRESS_THEME_PATH=node_modules/nopress-theme-my-theme`（裸包名 `nopress-theme-my-theme` 也可）。主题声明的 `dependencies` 会随安装进入宿主。

**限制**：`npm install <目录>` 形式（node_modules 内为 symlink）在 Astro 7 下不可用——符号链接被解析为真实路径后触发 Astro 对项目外 `.astro` 文件的路径解析错误。开发期请使用方式 2 或 3，或直接放 `src/themes/`。

主题代码引用的 `@lib/*`、`@core/*` 等别名仍解析自宿主项目的 `src/`，因此宿主必须是 NoPress 项目。「独立安装 NoPress 内核 + 任意目录装主题」这类内核包化能力属于远期路线；在此之前请勿假设 out-tree 主题可以引用未列在 §8 中的模块。

## 10. 变更政策

以下内容视为公共 API，破坏性变更会在 CHANGELOG 中显著标注：

- §4 的内容 HTML 结构与 `notion-*` 类名（渲染器新增块类型为非破坏性变更）
- §5 各脚本的 DOM 约定与引入路径
- §3 数据服务的返回结构与 `@lib/types` 字段
- §6 深色模式约定、§8 稳定别名
- §3.3 主题选项机制的语义（声明、覆盖来源、类型转换、fail-fast 行为）

新增能力（新的可选脚本、新的数据字段）不破坏兼容，主题应做好未知块类型（`.notion-unsupported`）与未知字段的容错。
