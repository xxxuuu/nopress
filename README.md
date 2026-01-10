# NoPress

**Notion + Astro = 极简博客生成器**

一个简洁高效的静态博客生成器，以 Notion 为内容管理系统，基于 Astro 构建。

![GitHub stars](https://img.shields.io/github/stars/xxxuuu/nopress?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

## ✨ 核心特性

- 📝 **Notion 作为 CMS** - 直接在 Notion 中编辑，无需部署
- ⚡️ **高性能** - 静态 HTML，支持智能缓存（3466x 性能提升）
- 📊 **Database 渲染** - 支持嵌入 Notion Database（表格/画廊视图）
- 🎯 **完整 Block 支持** - 30+ Notion 块类型，完整保留格式
- 🔤 **代码和公式** - 语法高亮（25+ 语言）+ KaTeX 数学公式
- 📊 **Mermaid 图表** - 流程图、时序图、甘特图等
- 🖼️ **图片永久化** - 自动转换临时链接为永久链接
- 🎨 **图片 Gallery** - 点击图片全屏预览，支持左右切换和缩放
- 🏷️ **标签和分类** - 灵活的内容组织
- 🌙 **深色模式** - 自动切换
- 📱 **响应式设计** - 完美适配所有设备
- 🚀 **一键部署** - Vercel/Netlify 零配置部署

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- npm 或 pnpm
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
4. Submit，复制 **Internal Integration Token**（以 `secret_` 开头）

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

**修改站点信息**: 编辑 `src/config/site.ts`

**修改主题颜色**: 编辑 `src/config/theme.ts`

## 🎯 核心概念

### 三种内容类型

通过 `type` 字段区分：

| 类型 | 用途 | URL | 字段 |
|------|------|-----|------|
| **Post** | 博客文章 | `/post/{slug}` | title, slug, date, tags, summary |
| **Page** | 独立页面 | `/{slug}` | title, slug, date, summary (关于、友链等) |
| **Menu** | 导航菜单 | 顶部导航 | title, slug, date |

### 必需字段（全部小写）

```
title, type, status, slug, summary, date
```

⚠️ **注意**: Notion 属性名必须全部小写，否则识别不了。

## 📊 性能指标

| 指标 | 数值 |
|------|------|
| 首页加载（缓存）| ~15ms |
| 首次 API 调用 | ~52s |
| 缓存命中率 | 95%+ |
| 性能提升 | 3466x |

## 🛠️ 技术栈

- **框架**: [Astro 4.x](https://astro.build/) - 静态网站生成
- **语言**: [TypeScript](https://www.typescriptlang.org/) - 类型安全
- **内容**: [Notion API](https://developers.notion.com/) - SDK 5.x
- **渲染**: 30+ Notion Block 类型直接支持
- **代码**: [Prism.js](https://prismjs.com/) - 25+ 语言语法高亮
- **公式**: [KaTeX](https://katex.org/) - 数学公式渲染
- **图表**: [Mermaid](https://mermaid.js.org/) - 流程图等
- **样式**: CSS 变量 + 深色模式支持

## 📦 项目结构

```
nopress/
├── docs/
│   ├── ARCHITECTURE.md    # 系统架构
│   └── rfcs/              # 设计决策 (RFCs)
├── src/
│   ├── lib/
│   │   ├── data/          # 数据层
│   │   ├── notion/        # Notion 集成
│   │   ├── cache/         # 缓存系统
│   │   └── utils/         # 工具函数
│   ├── pages/             # Astro 路由
│   ├── components/        # UI 组件
│   ├── scripts/           # 客户端脚本
│   ├── styles/            # 样式文件
│   └── config/            # 配置文件
├── CLAUDE.md              # 开发者指南
└── package.json
```

## 🎨 功能演示

### 博客文章页面

- 完整保留 Notion 格式
- 30+ 块类型支持
- 自动语法高亮
- 数学公式渲染

### 导航菜单

在 Notion Database 中创建 `type=Menu` 的条目，自动显示在顶部：

```
Title: 博客
Type: Menu
Slug: blog
Date: 2026-01-01
```

### 标签和分类

文章自动按标签、分类分组，提供：
- `/post` - 所有文章
- `/archive` - 归档页面
- `/tag/{tag}` - 标签筛选

## 🚀 部署

### 构建静态站点

```bash
npm run build
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

## 📈 项目统计

- **代码行数**: ~10,800 行
- **Block 类型**: 30+
- **语法高亮**: 25+ 语言
- **缓存效果**: 3466x 性能提升

## 📖 文档

- **[系统架构](./docs/ARCHITECTURE.md)** - 整体设计和数据流
- **[开发者指南](./CLAUDE.md)** - 开发规范和最佳实践
- **[RFCs](./docs/rfcs/)** - 功能设计和讨论

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT License - 详见 [LICENSE](./LICENSE)

## 致谢

- [Notion](https://notion.so) - 灵感来源
- [Astro](https://astro.build/) - 杰出的静态网站生成器
- [NotionNext](https://github.com/xxxuuu/NotionNext) - 图片 URL 映射参考

---

**最后更新**: 2026-01-12 | **版本**: v0.1.0
