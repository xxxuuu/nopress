# RFC-001: NoPress 主题系统设计

## 元数据

- **RFC 编号**: 001
- **标题**: NoPress 主题系统设计
- **状态**: 提议中 (Proposed)
- **创建日期**: 2026-01-10
- **作者**: NoPress Team

---

## 摘要

NoPress 主题系统采用**最小约束原则**，让主题开发者拥有最大的自由度。

### 核心理念

```
┌─────────────────────────────────────┐
│   NoPress 内核                       │
│   ─────────────────────────────     │
│   只做 3 件事：                      │
│   1. 提供数据 API                   │
│   2. 加载主题                        │
│   3. 注入页面路由                    │
└─────────────────────────────────────┘
              ↓ 提供数据
┌─────────────────────────────────────┐
│   主题（完全自主）                   │
│   ─────────────────────────────     │
│   最小要求：                         │
│   • theme.config.mjs （元信息）     │
│   • pages/ （至少一个页面）          │
│                                     │
│   可选一切：                         │
│   • layouts/、components/、styles/  │
│   • 任意组织方式、任意技术栈         │
└─────────────────────────────────────┘
```

### 支持的主题模式

1. **In-tree 主题**：内置在项目中（`src/themes/`）
2. **Out-tree 主题**：外部独立的主题包（npm 包或本地路径）

---

## 动机

### 设计目标

NoPress 主题系统旨在实现以下目标：

1. **极致灵活** - 主题可以是任何形态（博客、SPA、文档站、作品集等）
2. **学习成本低** - 新手只需关注 `pages/`，高级用户可以自由发挥
3. **内核简洁** - 内核专注于数据层，不干涉 UI
4. **易于迁移** - 从其他系统迁移主题更容易

### 设计原则

采用**最小约束原则**，参考成熟系统的设计：

**借鉴 Hugo** ([文档](https://gohugo.io/getting-started/directory-structure/))：
- 主题只需遵循基本目录结构
- 不强制"必需组件"
- 通过模板查找顺序实现灵活性

**借鉴 qiankun** ([文档](https://qiankun.umijs.org/guide))：
- 明确的生命周期（bootstrap、mount、unmount）
- 框架无关，不限制技术选择
- 动态加载，按需注入

**NoPress 的实现**：
- 主题只需 `theme.config.mjs` + `pages/`
- 内核只负责加载主题和注入路由
- 主题内部完全自主

---

## 详细设计

### 1. 总体架构

#### 1.1 架构图

```
┌──────────────────────────────────────────────────────┐
│                NoPress 应用                           │
└──────────────────────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────┐
        │      NoPress 内核               │
        │    ─────────────────────       │
        │                                │
        │  ① 数据层 (src/lib/)           │
        │     • Data Service API         │
        │     • Notion 集成              │
        │     • 缓存系统                  │
        │     • 工具函数                  │
        │                                │
        │  ② 主题加载器                   │
        │     • 加载 theme.config.mjs    │
        │     • 验证基本结构               │
        │     • 返回主题清单               │
        │                                │
        │  ③ Astro 集成                  │
        │     • 扫描 pages/ 目录          │
        │     • 注入页面到路由             │
        │     • 配置 Vite 别名            │
        └────────────────────────────────┘
                         ↑
                         │ import dataService from '@lib/data'
                         │
        ┌────────────────────────────────┐
        │   主题 (src/themes/xxx/)        │
        │  ─────────────────────────     │
        │                                │
        │  必需：                         │
        │  • theme.config.mjs            │
        │  • pages/                      │
        │    └── index.astro (至少一个)   │
        │                                │
        │  可选（完全自由）：              │
        │  • layouts/                    │
        │  • components/                 │
        │  • lib/                        │
        │  • styles/                     │
        │  • assets/                     │
        │  • public/                     │
        │  • ... 任何其他目录              │
        └────────────────────────────────┘
```

#### 1.2 数据流

```
用户访问 /post/hello
    ↓
主题页面 (themes/default/pages/post/[slug].astro)
    ↓
调用数据 API (import dataService from '@lib/data')
    ↓
内核数据层 (src/lib/data/)
    ↓
返回 Post 对象
    ↓
主题渲染 UI（内部组织完全自由）
```

---

### 2. 主题结构规范

#### 2.1 最小主题结构

**主题只需要 2 个必需元素：**

```
my-theme/
├── theme.config.mjs  # 必需：主题元信息
└── pages/            # 必需：至少一个页面文件
    └── index.astro   # 示例：首页
```

这就是一个完整可用的主题！

#### 2.2 典型主题结构（示例）

主题可以自由添加任何目录和文件：

```
my-theme/
├── theme.config.mjs      # 必需：主题元信息
│
├── pages/                # 必需：页面路由
│   ├── index.astro
│   ├── [slug].astro
│   ├── post/
│   │   └── [slug].astro
│   └── tag/
│       └── [tag].astro
│
├── layouts/              # 可选：如果主题想使用布局组件
│   ├── Base.astro
│   └── Post.astro
│
├── components/           # 可选：如果主题想使用组件
│   ├── Header.astro
│   ├── Footer.astro
│   └── PostCard.astro
│
├── lib/                  # 可选：主题自己的工具函数
│   └── helpers.ts
│
├── styles/               # 可选：样式文件
│   ├── global.css
│   └── notion.css
│
├── assets/               # 可选：需要处理的资源
│   ├── images/
│   └── fonts/
│
├── public/               # 可选：静态资源
│   └── favicon.svg
│
├── package.json          # Out-tree 主题需要
└── README.md             # 主题说明文档
```

**重点**：除了 `theme.config.mjs` 和 `pages/`，其他一切都是可选的。

#### 2.3 主题配置文件

**最小配置：**

```javascript
// theme.config.mjs
export default {
  // 基础元信息（必需）
  id: 'my-theme',
  name: 'My Theme',
  version: '1.0.0',
};
```

**完整配置（示例）：**

```javascript
// theme.config.mjs
export default {
  // ===== 基础元信息（必需） =====
  id: 'default',                    // 主题唯一标识符
  name: 'NoPress Default',          // 主题显示名称
  version: '1.0.0',                 // 语义化版本

  // ===== 可选元信息 =====
  author: 'NoPress Team',
  description: '简洁优雅的博客主题',
  homepage: 'https://github.com/...',
  repository: 'https://github.com/...',
  license: 'MIT',
  compatibleVersion: '^0.1.0',      // 兼容的 NoPress 版本

  // ===== 用户可配置选项（可选） =====
  // 主题可以定义任意配置项，在主题内部通过 Astro.locals 或环境变量访问
  options: {
    darkMode: {
      type: 'boolean',
      default: true,
      label: '启用深色模式',
      description: '支持浅色/深色主题切换',
    },
    contentWidth: {
      type: 'number',
      default: 1024,
      min: 800,
      max: 1400,
      label: '内容最大宽度（px）',
    },
    accentColor: {
      type: 'color',
      default: '#0066cc',
      label: '主题色',
    },
  },
};
```

**配置说明：**
- 使用 `.mjs` 格式（而非 `.ts`），因为需要在 Node.js 运行时动态加载
- `id`、`name`、`version` 是必需字段
- `options` 是可选的，主题可以定义任意配置项供用户自定义

---

### 3. 内核职责

NoPress 内核只负责 3 件事，不干涉主题的内部实现。

#### 3.1 职责一：数据层

**提供统一的 Data Service API：**

```typescript
// 主题通过 @lib/data 导入数据服务
import dataService from '@lib/data';

// 可用的数据方法
interface DataService {
  // 获取所有文章
  getAllPosts(): Promise<Post[]>

  // 根据 slug 获取文章
  getPostBySlug(slug: string): Promise<Post>

  // 根据 slug 获取页面
  getPageBySlug(slug: string): Promise<Page>

  // 获取指定标签的文章
  getPostsByTag(tag: string): Promise<Post[]>

  // 获取菜单项
  getMenuItems(): Promise<MenuItem[]>
}

// Post 对象结构
interface Post {
  id: string;             // 文章唯一标识
  title: string;          // 文章标题
  summary: string;        // 文章摘要
  slug: string;           // URL slug
  date: string;           // 发布日期（ISO 8601）
  updated?: string;       // 更新日期（ISO 8601）
  tags: string[];         // 标签数组
  cover?: string;         // 封面图片 URL
  content: string;        // 文章 HTML 内容
  readingTime?: number;   // 预计阅读时间（分钟）
  wordCount?: number;     // 字数统计
}

// Page 对象结构（独立页面，如"关于"）
interface Page {
  id: string;
  title: string;
  summary: string;
  slug: string;
  date: string;
  content: string;
}

// MenuItem 对象结构（导航菜单）
interface MenuItem {
  title: string;          // 显示文字
  slug: string;           // 链接地址（内部链接或完整 URL）
  isExternal: boolean;    // 是否为外部链接
}
```

**工具函数：**

```typescript
// 主题可以使用内核提供的工具函数
import { formatDate, calculateReadingTime, slugify } from '@lib/utils';

// 格式化日期
formatDate(isoDate: string): string

// 计算阅读时间
calculateReadingTime(content: string): number

// 生成 slug
slugify(text: string): string
```

#### 3.2 职责二：主题加载器

**加载主题的流程：**

```typescript
// src/lib/theme/loader.ts
class ThemeLoader {
  // 加载 in-tree 主题
  loadInTreeTheme(themeId: string): ThemeManifest {
    const themePath = path.join(projectRoot, 'src/themes', themeId);

    // 1. 检查主题目录是否存在
    if (!fs.existsSync(themePath)) {
      throw new Error(`Theme "${themeId}" not found`);
    }

    // 2. 加载 theme.config.mjs
    const config = this.loadThemeConfig(themePath);

    // 3. 验证必需字段
    if (!config.id || !config.name || !config.version) {
      throw new Error('Theme config must have id, name, and version');
    }

    // 4. 验证 pages/ 目录存在
    const pagesDir = path.join(themePath, 'pages');
    if (!fs.existsSync(pagesDir)) {
      throw new Error('Theme must have a "pages/" directory');
    }

    // 5. 返回主题清单
    return {
      config,
      paths: { root: themePath },
      type: 'in-tree',
    };
  }

  // 加载 out-tree 主题（npm 包或本地路径）
  loadOutTreeTheme(themeSpec: string): ThemeManifest {
    // 类似逻辑
  }
}
```

**验证规则（最小化）：**
- ✅ `theme.config.mjs` 文件存在且可加载
- ✅ `id`、`name`、`version` 字段存在
- ✅ `pages/` 目录存在
- ❌ 不检查其他目录（layouts/、components/ 等）
- ❌ 不检查页面文件数量（可以只有 1 个页面）

#### 3.3 职责三：Astro 集成

**注入主题页面到 Astro 路由：**

```typescript
// src/lib/theme/astro-integration.ts
export function nopressThemeIntegration(): AstroIntegration {
  return {
    name: 'nopress-theme',
    hooks: {
      'astro:config:setup': async ({ updateConfig, injectRoute }) => {
        // 1. 加载主题
        const themeManager = createThemeManager(projectRoot);
        await themeManager.initialize({
          theme: process.env.NOPRESS_THEME || 'default',
          themePath: process.env.NOPRESS_THEME_PATH,
        });

        const theme = themeManager.getActiveTheme();
        const pagesDir = path.join(theme.paths.root, 'pages');

        // 2. 扫描主题的 pages/ 目录
        const pages = scanThemePages(pagesDir);

        // 3. 注入页面到 Astro 路由
        for (const page of pages) {
          injectRoute({
            pattern: page.pattern,      // 如 '/', '/post/[slug]'
            entrypoint: page.entrypoint, // 页面文件的完整路径
          });
        }

        console.log(`[NoPress] Loaded theme "${theme.config.name}" with ${pages.length} pages`);

        // 4. 配置 Vite 别名
        updateConfig({
          vite: {
            resolve: {
              alias: {
                '@theme': theme.paths.root, // 主题根目录
              },
            },
          },
        });

        // 5. 如果主题有 public/ 目录，注入静态资源
        const publicDir = path.join(theme.paths.root, 'public');
        if (fs.existsSync(publicDir)) {
          // 配置 Astro 的 publicDir 或复制文件
        }
      },
    },
  };
}

/**
 * 扫描主题 pages/ 目录，生成路由配置
 */
function scanThemePages(pagesDir: string) {
  const pages: Array<{ pattern: string; entrypoint: string }> = [];

  function scan(dir: string, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // 递归扫描子目录
        scan(fullPath, path.join(prefix, entry.name));
      } else if (entry.name.endsWith('.astro')) {
        // 生成路由 pattern
        const fileName = entry.name.replace(/\.astro$/, '');
        let pattern = prefix ? `/${prefix}` : '';

        if (fileName === 'index') {
          // index.astro -> /
        } else if (fileName.startsWith('[') && fileName.endsWith(']')) {
          // [slug].astro -> /[slug]
          pattern = `${pattern}/${fileName}`;
        } else {
          // about.astro -> /about
          pattern = `${pattern}/${fileName}`;
        }

        pages.push({
          pattern: pattern || '/',
          entrypoint: fullPath,
        });
      }
    }
  }

  scan(pagesDir);
  return pages;
}
```

**路由映射示例：**
```
主题文件路径                      → Astro 路由 pattern
────────────────────────────────────────────────────
pages/index.astro                → /
pages/about.astro                → /about
pages/[slug].astro               → /[slug]
pages/post/[slug].astro          → /post/[slug]
pages/tag/[tag].astro            → /tag/[tag]
pages/blog/[...path].astro       → /blog/[...path]
```

---

### 4. 主题开发指南

#### 4.1 三种典型主题风格

##### 风格 A：组件化主题（传统博客）

**目录结构：**
```
theme-a/
├── theme.config.mjs
├── pages/
│   ├── index.astro
│   └── post/[slug].astro
├── layouts/
│   ├── Base.astro
│   └── Post.astro
├── components/
│   ├── Header.astro
│   ├── Footer.astro
│   └── PostCard.astro
└── styles/
    └── global.css
```

**页面示例：**
```astro
---
// pages/index.astro
import dataService from '@lib/data';
import Base from '../layouts/Base.astro';
import PostCard from '../components/PostCard.astro';

const posts = await dataService.getAllPosts();
---

<Base title="首页">
  <div class="post-list">
    {posts.map(post => <PostCard post={post} />)}
  </div>
</Base>
```

**布局示例：**
```astro
---
// layouts/Base.astro
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';

interface Props {
  title: string;
  description?: string;
}

const { title, description } = Astro.props;
---

<!DOCTYPE html>
<html>
<head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="stylesheet" href="/styles/global.css" />
</head>
<body>
  <Header />
  <main>
    <slot />
  </main>
  <Footer />
</body>
</html>
```

##### 风格 B：单文件主题（极简主义）

**目录结构：**
```
theme-b/
├── theme.config.mjs
├── pages/
│   ├── index.astro       # 所有 HTML 都在这里
│   └── post/[slug].astro # 所有 HTML 都在这里
└── public/
    └── style.css         # 一个 CSS 文件
```

**页面示例：**
```astro
---
// pages/index.astro - 不使用布局和组件
import dataService from '@lib/data';
const posts = await dataService.getAllPosts();
---

<!DOCTYPE html>
<html>
<head>
  <title>极简博客</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <header>
    <h1>我的博客</h1>
    <nav>
      <a href="/">首页</a>
      <a href="/about">关于</a>
    </nav>
  </header>

  <main>
    <h2>文章列表</h2>
    <ul>
      {posts.map(post => (
        <li>
          <a href={`/post/${post.slug}`}>
            <h3>{post.title}</h3>
            <p>{post.summary}</p>
            <time>{post.date}</time>
          </a>
        </li>
      ))}
    </ul>
  </main>

  <footer>
    <p>&copy; 2026 My Blog</p>
  </footer>
</body>
</html>
```

##### 风格 C：SPA 主题（单页应用）

**目录结构：**
```
theme-c/
├── theme.config.mjs
├── pages/
│   └── [...slug].astro   # 捕获所有路由
├── src/
│   ├── App.tsx           # React/Vue 应用
│   ├── Router.tsx        # 客户端路由
│   ├── pages/            # 客户端页面组件
│   └── components/
└── styles/
    └── app.css
```

**页面示例：**
```astro
---
// pages/[...slug].astro - 所有路由由客户端处理
import dataService from '@lib/data';

// 预加载所有数据
const posts = await dataService.getAllPosts();
const pages = await dataService.getAllPages();
---

<!DOCTYPE html>
<html>
<head>
  <title>SPA Blog</title>
  <link rel="stylesheet" href="/styles/app.css" />
</head>
<body>
  <div id="app"></div>
  <script>
    // 将数据传递给客户端应用
    window.__INITIAL_DATA__ = {
      posts: {JSON.stringify(posts)},
      pages: {JSON.stringify(pages)},
    };
  </script>
  <script type="module" src="/src/App.tsx"></script>
</body>
</html>
```

#### 4.2 页面开发模式

**标准页面示例（文章详情）：**

```astro
---
// pages/post/[slug].astro
import dataService from '@lib/data';
import { formatDate } from '@lib/utils';

// Astro 的静态路径生成
export async function getStaticPaths() {
  const posts = await dataService.getAllPosts();

  return posts.map(post => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

const { post } = Astro.props;
---

<!DOCTYPE html>
<html>
<head>
  <title>{post.title}</title>
  <meta name="description" content={post.summary} />
</head>
<body>
  <article>
    <header>
      <h1>{post.title}</h1>
      <time>{formatDate(post.date)}</time>
      {post.tags.map(tag => (
        <a href={`/tag/${tag}`}>#{tag}</a>
      ))}
    </header>

    <div class="content" set:html={post.content} />
  </article>
</body>
</html>
```

**动态数据获取：**

```astro
---
// pages/tag/[tag].astro
import dataService from '@lib/data';

export async function getStaticPaths() {
  const posts = await dataService.getAllPosts();

  // 收集所有标签
  const tags = new Set<string>();
  posts.forEach(post => post.tags.forEach(tag => tags.add(tag)));

  // 为每个标签生成页面
  return Array.from(tags).map(tag => ({
    params: { tag },
    props: {
      tag,
      posts: posts.filter(p => p.tags.includes(tag)),
    },
  }));
}

const { tag, posts } = Astro.props;
---

<h1>标签：{tag}</h1>
<ul>
  {posts.map(post => (
    <li><a href={`/post/${post.slug}`}>{post.title}</a></li>
  ))}
</ul>
```

#### 4.3 主题内部导入

主题可以使用以下别名：

```typescript
// 导入数据服务（内核提供）
import dataService from '@lib/data';

// 导入工具函数（内核提供）
import { formatDate } from '@lib/utils';

// 导入主题内部文件
import Layout from '@theme/layouts/Base.astro';
import Component from '@theme/components/Header.astro';
import { helper } from '@theme/lib/helpers';
```

**别名配置：**
- `@lib/*` → `src/lib/*`（内核）
- `@theme/*` → `src/themes/active-theme/*`（主题根目录）

---

### 5. 主题使用方式

#### 5.1 In-tree 主题（推荐用于开发）

**目录位置：** `src/themes/default/`

**使用配置：**
```env
# .env
NOPRESS_THEME=default
```

**Astro 配置：**
```javascript
// astro.config.mjs
import { nopressThemeIntegration } from './src/lib/theme/astro-integration';

export default defineConfig({
  integrations: [
    nopressThemeIntegration(), // 会自动加载 NOPRESS_THEME 指定的主题
  ],
});
```

**优点：**
- 与项目代码一起管理，便于快速迭代
- 无需额外安装依赖
- 可直接修改源代码

**适用场景：**
- 项目默认主题
- 需要频繁修改的主题
- 学习和参考实现

#### 5.2 Out-tree 主题（推荐用于发布）

**方式 1：npm 包**

```bash
# 安装主题
npm install @nopress/theme-minimal
```

```env
# .env
NOPRESS_THEME_PATH=@nopress/theme-minimal
```

**方式 2：本地路径**

```env
# .env
NOPRESS_THEME_PATH=./custom-themes/my-theme
```

**主题包结构（package.json）：**
```json
{
  "name": "@nopress/theme-minimal",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./theme.config.mjs"
  },
  "files": [
    "theme.config.mjs",
    "pages/",
    "layouts/",
    "components/",
    "styles/",
    "public/"
  ]
}
```

**优点：**
- 可以发布到 npm 供其他项目使用
- 独立版本管理
- 易于分享和更新

---

### 6. 实现计划

#### 6.1 核心模块

| 模块 | 文件路径 | 职责 | 状态 |
|------|---------|------|------|
| 类型定义 | `src/lib/theme/types.ts` | TypeScript 类型定义 | ⏳ 待实现 |
| 配置验证 | `src/lib/theme/schema.ts` | Zod 验证 schema | ⏳ 待实现 |
| 主题加载器 | `src/lib/theme/loader.ts` | 加载和验证主题 | ⏳ 待实现 |
| 主题管理器 | `src/lib/theme/manager.ts` | 管理主题注册和激活 | ⏳ 待实现 |
| Astro 集成 | `src/lib/theme/astro-integration.ts` | 页面注入和别名配置 | ⏳ 待实现 |
| 公共 API | `src/lib/theme/index.ts` | 导出接口 | ⏳ 待实现 |

#### 6.2 默认主题实现

| 任务 | 说明 | 状态 |
|------|------|------|
| 创建主题配置 | 创建 `src/themes/default/theme.config.mjs` | ⏳ 待完成 |
| 创建 pages/ 目录 | 将现有页面迁移到 `src/themes/default/pages/*` | ⏳ 待完成 |
| 创建 layouts/ 目录 | 将现有布局迁移到 `src/themes/default/layouts/*` | ⏳ 待完成 |
| 创建 components/ 目录 | 按需保留 UI 组件在主题内 | ⏳ 待完成 |
| 创建 styles/ 目录 | 迁移样式文件到主题内 | ⏳ 待完成 |

#### 6.3 测试计划

- [ ] 验证最小主题（只有 theme.config.mjs + 1 个页面）
- [ ] 验证组件化主题（完整结构）
- [ ] 验证单文件主题（极简风格）
- [ ] 测试 in-tree 主题加载
- [ ] 测试 out-tree 主题加载（本地路径）
- [ ] 测试 out-tree 主题加载（npm 包）
- [ ] 测试页面路由注入
- [ ] 测试 Vite 别名配置

---

## 参考资料

- [Hugo Directory Structure](https://gohugo.io/getting-started/directory-structure/)
- [Hugo New Template System](https://gohugo.io/templates/new-templatesystem-overview/)
- [qiankun Guide](https://qiankun.umijs.org/guide)
- [Micro Frontends with qiankun](https://medium.com/@fibonalabsdigital/how-to-implement-micro-frontends-using-qiankun-9f308eddc5f4)
- [Astro Integrations API](https://docs.astro.build/en/reference/integrations-reference/)

---

## 附录

### A. 常见问题

**Q: 主题必须实现哪些页面？**
A: 至少 1 个页面即可。主题可以只有 `index.astro`，也可以有完整的页面集（首页、文章、标签等）。

**Q: 主题必须使用组件化结构吗？**
A: 不必须。主题可以自由选择组织方式：组件化、单文件、甚至客户端 SPA。

**Q: 如何在主题中使用 Tailwind CSS？**
A: 主题可以在 `theme.config.mjs` 中声明依赖，或者在主题内部自行配置。内核不限制技术选择。

**Q: 主题可以修改数据结构吗？**
A: 不可以。`Post`、`Page`、`MenuItem` 等数据结构由内核固定，主题只能使用，不能修改。

**Q: 如何覆盖主题的某个页面？**
A: 借鉴 Hugo 的覆盖机制，用户可以在项目根目录创建同路径的文件覆盖主题文件（未来实现）。

### B. 术语表

| 术语 | 说明 |
|------|------|
| In-tree 主题 | 内置在项目中的主题（`src/themes/`） |
| Out-tree 主题 | 外部独立的主题包（npm 包或本地路径） |
| 最小约束 | 只规定必需元素，其他完全自由 |
| 数据层 | 内核负责的数据获取和处理逻辑 |
| UI 层 | 主题负责的页面和视觉呈现 |
| 页面注入 | 使用 Astro 的 `injectRoute()` API 动态添加路由 |
