# NoPress 开发指南

面向想参与 NoPress 开发的贡献者。使用 Notion 搭博客请看 [用户指南](./USER-GUIDE.md)；制作主题请看 [主题开发契约](./THEMES.md)。

AI 编码代理的工作约定集中在 [AGENTS.md](../AGENTS.md)，本文件与之互补：这里讲"怎么跑起来、怎么改、怎么提交"，AGENTS.md 讲项目约定与陷阱清单。

## 环境准备

- Node.js ≥ 24（版本见 [.nvmrc](../.nvmrc)），npm
- 一个有效的 Notion Integration Token 和 Database ID（获取方式见 [用户指南](./USER-GUIDE.md#一搭好你的博客)）

```bash
git clone https://github.com/xxxuuu/nopress.git
cd nopress
npm install
cp .env.example .env   # 填入 NOTION_TOKEN 与 NOTION_DATABASE_ID
```

所有内容来自 Notion API，没有本地 mock——`.env` 无效或断网时构建无法进行。

## 常用命令

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发服务器（`http://localhost:4321`，内容缓存于内存，TTL 5 分钟） |
| `npm run check` | 类型检查（`astro check`） |
| `npm run build` | 类型检查 + 构建到 `dist/`（文件缓存 `.cache/`，TTL 1 小时） |
| `npm run preview` | 本地预览构建产物 |

`npm run build` 是提交前的最终验证，也是 CI 部署时执行的唯一检查。

## 项目结构

```
src/
├── pages/        # 内核数据端点（.md、llms.txt、RSS、robots）
├── themes/       # 主题（default 全功能 / minimal 契约参考 / terminal CRT 风）
├── lib/          # 内核：Notion 数据层、渲染器、缓存、markdown、主题系统、配置
├── config/       # 站点配置默认值与解析
├── core/         # <head> 元标签工具
├── scripts/      # 客户端脚本（高亮、公式、图表、灯箱、TOC、评论）
└── types/        # 模块声明
```

完整目录地图与模块职责见 [AGENTS.md](../AGENTS.md#目录地图)；数据流与设计决策见 [架构文档](./ARCHITECTURE.md)。

## 常见开发任务

| 任务 | 入口 |
|------|------|
| 改页面样式/布局 | `src/themes/<主题>/`（styles/、layouts/、components/） |
| 新增/修改 Notion 字段 | `src/lib/types.ts` → `src/lib/notion/api/index.ts` → 同步 Notion Database schema |
| 自定义 Notion 块渲染 | `src/lib/notion/renderer/block-renderer.ts`（按块类型 switch） |
| 新增客户端功能 | `src/scripts/` 新脚本 + 主题 BaseLayout 引入 |
| 新增/修改主题 | 从 `src/themes/minimal/` 起步，遵循 [主题契约](./THEMES.md) |
| 站点配置 | 环境变量（清单见 [.env.example](../.env.example)）或 `src/config/site.ts` |

改完运行 `npm run build` 验证。涉及主题行为的改动，建议用另一个内置主题交叉验证（如改内核渲染器后跑 `NOPRESS_THEME=minimal npm run build`）。

## 调试技巧

- **改了 Notion 数据看不到**：dev 缓存 5 分钟、build 缓存 1 小时；数据层代码（notion/cache/utils/types）改动会自动失效缓存，也可 `rm -rf .cache/` 手动清理
- **主题切换**：`NOPRESS_THEME=minimal|terminal`；out-tree 主题用 `NOPRESS_THEME_PATH`（注意 Astro 7 对项目外 `.astro` 路径的限制，见 [主题契约 §9](./THEMES.md#9-分发与兼容)）
- **主题选项**：`NOPRESS_THEME_OPTIONS='{"key":value}'`，构建日志会打印被覆盖的选项
- **路由冲突**：主题路由撞内核保留路径会在构建期报错，错误信息里带完整保留清单

## 提交与文档

- 提交信息遵循 Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `chore:` / `ci:`），一句话说清改动，使用 `git commit -s -S` 签名
- 改动落地时同步对应文档（对应关系表见 [AGENTS.md 工作准则](../AGENTS.md#工作准则)）——例如改环境变量需同时更新 `.env.example`、`docs/CONFIGURATION.md` 和 CI workflow
- 代码注释与文档使用中文，TypeScript strict（避免 `any`）

## CI 与部署

[`.github/workflows/build.yaml`](../.github/workflows/build.yaml) 为手动触发（`workflow_dispatch`）：执行 `npm run build` 后把 `dist/` 推送到部署仓库。环境变量（`NOTION_*` 从 Secrets、`SITE_*` / `COMMENTS_*` / `NOPRESS_*` 从 Variables）在 workflow 中显式注入——新增环境变量时需同步该文件。
