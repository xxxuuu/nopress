# NoPress

**Notion + Astro = 极简博客生成器**

以 Notion Database 为唯一内容源：在 Notion 中写作，Astro 在构建时拉取内容，生成纯静态站点。

![GitHub stars](https://img.shields.io/github/stars/xxxuuu/nopress?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

技术栈：[Astro 7](https://astro.build/) · TypeScript · Notion API（官方 SDK 5.x）· Prism.js · KaTeX · Mermaid

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

不写代码、不装任何东西，三步上线：

1. **准备 Notion**：把 [Example Database](https://app.notion.com/p/xxuuu/a6d887563979827fb7d601c96daa2b11) 复制到你的工作区，并创建一个 Integration Token
2. **部署**：Fork 本仓库后在 [Vercel](https://vercel.com)（免费）导入，设置 `NOTION_TOKEN` 和 `NOTION_DATABASE_ID` 两个环境变量
3. **写作**：在 Notion Database 里写文章，博客自动呈现

完整分步说明见 **[用户指南](./docs/USER-GUIDE.md)** ⭐。想在本地运行或参与开发见 [本地运行](./docs/USER-GUIDE.md#六本地运行可选)。

## 📖 文档

- **[用户指南](./docs/USER-GUIDE.md)** - 不写代码搭好博客：Notion 配置、部署、写作、换主题 ⭐
- **[开发指南](./docs/DEVELOPMENT.md)** - 参与开发：环境、命令、调试、提交规范 ⭐
- **[站点配置系统](./docs/CONFIGURATION.md)** - 环境变量完整参考和部署配置指南
- **[评论功能配置](./docs/COMMENTS.md)** - Giscus 评论系统配置指南
- **[主题开发契约](./docs/THEMES.md)** - 主题开发与分发（开发者向）
- **[系统架构](./docs/ARCHITECTURE.md)** - 整体设计和数据流
- **[AGENTS.md](./AGENTS.md)** - AI 代理开发指南（含架构地图与陷阱清单）

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

[MIT](./LICENSE)

## 致谢

- [Notion](https://notion.so) - 灵感来源
- [Astro](https://astro.build/) - 杰出的静态网站生成器
- [NotionNext](https://github.com/xxxuuu/NotionNext) - 图片 URL 映射参考
