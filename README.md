# NoPress

**Notion + Astro = 极简博客生成器**

以 Notion Database 为唯一内容源：在 Notion 中写作，Astro 在构建时拉取内容，生成纯静态站点。

![GitHub stars](https://img.shields.io/github/stars/xxxuuu/nopress?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

技术栈：[Astro 4](https://astro.build/) · TypeScript · Notion API（官方 SDK 5.x）· Prism.js · KaTeX · Mermaid

## ✨ 特性

- 📝 **Notion 作为 CMS** — 在 Notion 中写作，构建时通过 API 拉取全部内容
- ⚡️ **纯静态输出** — 多级缓存（dev 内存 / build 文件），产物可部署到任何静态托管
- 🎯 **30+ Block 类型** — 完整保留 Notion 格式：代码高亮（25+ 语言）、KaTeX 公式、Mermaid 图表
- 📊 **Database 渲染** — 嵌入 Notion Database，支持表格 / 画廊视图
- 🎨 **图片 Gallery** — 点击全屏预览，支持切换和缩放
- 🤖 **Markdown for Agents** — 每页自动生成 Markdown 版本 + `llms.txt` 站点索引
- 🏷️ **标签、归档、分页**
- 💬 **评论系统** — Giscus（基于 GitHub Discussions）
- 🌙 **深色模式** — 跟随系统自动切换
- 📱 **响应式布局**
- 🚀 **一键部署** — Vercel / Netlify 零配置

## 🚀 快速开始

### 前置要求

- Node.js >= 24（见 [.nvmrc](.nvmrc)）
- npm
- Notion 账号

### 1️⃣ 安装项目

```bash
git clone https://github.com/xxxuuu/nopress.git
cd nopress
npm install
```

### 2️⃣ 配置 Notion

#### 创建 Integration Token

1. 访问 [Notion Integrations](https://www.notion.so/my-integrations)
2. 点击 "+ New integration"
3. 名称：NoPress，类型：Internal integration
4. Submit，复制 **Internal Integration Token**（以 `secret_` 或 `ntn_` 开头）

#### 创建 Database

在 Notion 中创建一个 Database，添加以下属性（**全部小写**）：

| 属性 | 类型 | 说明 |
|------|------|------|
| title | Title | 文章标题 |
| type | Select | Post / Page / Menu |
| status | Select | Published / Draft |
| slug | Rich Text | URL 路径 |
| summary | Rich Text | 摘要 |
| date | Date | 发布日期 |
| tags | Multi-select | 标签（Post 用） |

**获取 Database ID**：从浏览器地址栏复制
```
https://www.notion.so/workspace/{database_id}?v=xxx
                                 ^^^^^^^^^^^^^^^^
```

#### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：
```env
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxx
```

### 3️⃣ 创建第一篇文章

在 Notion Database 中新增一行：

| 字段 | 值 |
|------|-----|
| title | 我的第一篇博客 |
| type | Post |
| status | Published |
| slug | my-first-post |
| summary | 这是我的第一篇博客 |
| date | 2026-01-07 |
| tags | 入门 |

在 Notion 页面中写一些内容。

### 4️⃣ 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:4321](http://localhost:4321)

你应该能看到：
- ✅ 首页显示文章
- ✅ 点击进入文章详情
- ✅ 文章内容正常渲染

### 5️⃣ 自定义配置

支持通过环境变量自定义配置，适用于 CI/CD 和多环境部署。

**快速配置**：编辑 `.env` 文件
```bash
# 站点信息
SITE_URL=https://yourdomain.com
SITE_TITLE=我的博客
SITE_DESCRIPTION=基于 Notion 和 Astro 的博客

# 评论系统（可选）
COMMENTS_ENABLED=true
COMMENTS_GISCUS_REPO=owner/repo
COMMENTS_GISCUS_REPO_ID=R_kgDOG...
COMMENTS_GISCUS_CATEGORY_ID=DIC_kwDOG...
```

**修改主题颜色**: 编辑 `src/config/theme.ts`

📖 **详细配置指南**: **[站点配置系统](./docs/CONFIGURATION.md)** - 完整的环境变量参考和部署配置

## 🎯 核心概念

### 三种内容类型

通过 `type` 字段区分：

| 类型 | 用途 | URL | 字段 |
|------|------|-----|------|
| **Post** | 博客文章 | `/post/{slug}` | title, slug, date, tags, summary |
| **Page** | 独立页面 | `/{slug}` | title, slug, date, summary (关于、友链等) |
| **Menu** | 导航菜单 | 顶部导航 | title, slug, date |

### 页面路由

| 路由 | 内容 |
|------|------|
| `/` | 首页（分页 `/page/{page}`） |
| `/post/{slug}` | 文章 |
| `/{slug}` | 独立页面 |
| `/tag/{tag}` | 标签筛选 |
| `/archive` | 归档 |

### 必需字段（全部小写）

```
title, type, status, slug, summary, date
```

⚠️ **注意**: Notion 属性名必须全部小写，否则识别不了。

## 🤖 Markdown for Agents

构建时自动为每篇文章/页面生成面向 AI Agent 的 Markdown 版本：

| 产物 | URL | 说明 |
|------|-----|------|
| 文章 Markdown | `/post/{slug}.md` | YAML frontmatter（标题/日期/标签/canonical）+ 正文 |
| 页面 Markdown | `/{slug}.md` | `type=Page` 的独立页面 |
| 站点索引 | `/llms.txt` | 全站文章列表 + 摘要（[llmstxt.org](https://llmstxt.org) 规范） |

- 公式还原为 `$$...$$` / `$...$` 语法，代码块保留语言标识（含 mermaid）
- Notion Database 表格转换为 Markdown 表格，链接和图片自动转为绝对 URL
- HTML 页面 `<head>` 注入 `<link rel="alternate" type="text/markdown">`，Agent 可自动发现 Markdown 版本
- 转换直接消费构建缓存的 HTML，不产生额外 Notion API 调用

## 🚀 部署

### 构建静态站点

```bash
npm run build
npm run preview   # 本地预览构建产物
```

静态文件在 `dist/` 目录，可部署到任何静态站点托管服务。

### Vercel (推荐，零配置)

```bash
# 1. 推送到 GitHub
git push origin main

# 2. 在 Vercel 导入仓库
# 3. 设置环境变量：NOTION_TOKEN, NOTION_DATABASE_ID
# 4. 部署完成！
```

### Netlify

类似 Vercel，零配置支持。

## 💡 常见问题

### Q: 修改了 Notion 内容为什么看不到？

A: 有缓存机制。开发环境 5 分钟一次，生产环境 1 小时一次。清空缓存：`rm -rf .cache`

### Q: 图片显示不出来？

A: NoPress 自动转换临时链接为永久链接。确保图片通过 Notion 上传，重新构建试试。

### Q: 部署后所有图片都是 404？

A: Notion 临时 URL 会过期。确保你的版本有图片 URL 映射功能，重新部署。

### Q: 看不到文章？

A: 检查：
- [ ] Database 是否共享给 Integration（右上角 Share）
- [ ] `.env` 配置是否正确
- [ ] 文章 `status` 是否为 "Published"
- [ ] 所有属性名是否全部小写

### Q: 如何配置评论功能？

A: 参考详细配置指南：**[评论功能配置](./docs/COMMENTS.md)**

## 📖 文档

- **[站点配置系统](./docs/CONFIGURATION.md)** - 环境变量完整参考和部署配置指南 ⭐
- **[评论功能配置](./docs/COMMENTS.md)** - Giscus 评论系统配置指南 ⭐
- **[系统架构](./docs/ARCHITECTURE.md)** - 整体设计和数据流
- **[开发指南](./AGENTS.md)** - AI 代理开发指南（含架构地图与陷阱清单）
- **[RFCs](./docs/rfcs/)** - 功能设计和讨论

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

[MIT](./LICENSE)

## 致谢

- [Notion](https://notion.so) - 灵感来源
- [Astro](https://astro.build/) - 杰出的静态网站生成器
- [NotionNext](https://github.com/xxxuuu/NotionNext) - 图片 URL 映射参考
