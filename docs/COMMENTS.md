# 评论功能配置指南

NoPress 通过 [Giscus](https://giscus.app)（基于 GitHub Discussions）提供评论功能。评论**全部通过环境变量配置**：本地写在 `.env`，托管平台写在项目环境变量里，无需改任何代码。

## 目录

- [功能特性](#功能特性)
- [主题支持范围](#主题支持范围)
- [快速开始](#快速开始)
- [详细配置步骤](#详细配置步骤)
- [环境变量参考](#环境变量参考)
- [故障排查](#故障排查)
- [常见问题](#常见问题)
- [高级配置](#高级配置)

## 功能特性

✅ **完全免费**：托管在 GitHub，无服务器成本
✅ **无追踪**：不收集用户数据，尊重隐私
✅ **支持 Markdown**：评论支持 Markdown 语法
✅ **GitHub 集成**：评论存储在 GitHub Discussions
✅ **反应功能**：支持表情反应（👍👎😄🎉🚀❤️）
✅ **多语言**：支持简体中文、英语等多种语言
✅ **懒加载**：滚动到可视区域时才加载，不影响首屏性能
✅ **深色适配**：评论主题跟随站点深浅色模式，切换即时生效，无需配置

**支持的页面**（评论组件所在位置）：
- ✅ Post 页面（博客文章）：`/post/{slug}`
- ✅ Page 页面（独立页面）：`/{slug}`

## 主题支持范围

评论组件目前内置于 **`default`** 和 **`paper`** 两个主题。`minimal`、`terminal` 与 `retro` 主题不含评论区——配置了环境变量也不会显示（页面不渲染评论容器，无构建告警）。

自定义主题可按 [主题开发契约 §7](./THEMES.md#7-评论系统) 自行接入同一套配置。

## 快速开始

### 5 分钟配置指南

1. **安装 Giscus App**（1 分钟）
   - 访问 https://github.com/apps/giscus
   - 点击 Install 安装到你的博客仓库

2. **启用 Discussions**（30 秒）
   - 进入仓库 Settings → Features
   - 勾选 Discussions

3. **获取配置参数**（2 分钟）
   - 访问 https://giscus.app
   - 填写仓库信息，复制生成的 `repo`、`repoId`、`categoryId` 等参数

4. **配置环境变量**（1 分钟）
   - 在 `.env`（本地）或托管平台环境变量（线上）中填入
   - 设置 `COMMENTS_ENABLED=true`

5. **测试**（30 秒）
   - 重启 `npm run dev`
   - 访问任意文章，查看底部评论区

## 详细配置步骤

### 步骤 1：安装 Giscus App

1. 访问 [Giscus GitHub App](https://github.com/apps/giscus)
2. 点击 **Install** 按钮
3. 选择要安装的仓库（你的博客仓库）
   - 可以选择 **All repositories**（所有仓库）
   - 或只选择特定仓库
4. 点击 **Install** 完成安装

### 步骤 2：启用 Discussions

在你的 GitHub 仓库中启用 Discussions 功能：

1. 进入你的 GitHub 仓库
2. 点击 **Settings** 标签页
3. 滚动到 **Features** 部分
4. 勾选 **Discussions**
5. 可选：创建一个讨论分类（如 `Announcements`）

### 步骤 3：获取配置参数

1. 访问 [Giscus 配置页面](https://giscus.app)

2. 填写以下信息：
   - **仓库**：`your-username/your-repo`（例如：`john/blog`）
   - **Discussion 分类**：
     - 如果已有分类，选择一个（如 `Announcements`）
     - 如果没有，点击 "new repository category" 创建新分类
   - **页面 ↔️ discussions 映射**：选择 `pathname`（推荐；与 NoPress 默认值一致）
   - **特性**：
     - ✅ 启用反应功能：推荐启用
     - **输入框位置**：`bottom`（底部，默认一致）
     - **语言**：`zh-CN`（默认一致）
     - **懒加载**：✅ 启用（默认一致）

3. 从生成的配置脚本中复制这些值（对应环境变量见下一步）：
   - `data-repo` → 仓库名
   - `data-repo-id` → 仓库 ID（`R_kgDO...` 开头）
   - `data-category` → 分类名称
   - `data-category-id` → 分类 ID（`DIC_kwDO...` 开头）

> **主题选项不用管**：giscus.app 上的"主题"选择只影响它生成的示例脚本；NoPress 固定跟随站点深浅色模式，见[高级配置](#高级配置)。

### 步骤 4：配置环境变量

**本地开发**：写入项目根目录的 `.env` 文件（评论相关变量支持从 `.env` 读取）：

```bash
# .env —— 评论配置
COMMENTS_ENABLED=true
COMMENTS_PROVIDER=giscus

COMMENTS_GISCUS_REPO=your-username/your-repo
COMMENTS_GISCUS_REPO_ID=R_kgDOG...
COMMENTS_GISCUS_CATEGORY=Announcements
COMMENTS_GISCUS_CATEGORY_ID=DIC_kwDOG...

# 以下均有默认值，按需覆盖
# COMMENTS_GISCUS_MAPPING=pathname
# COMMENTS_GISCUS_INPUT_POSITION=bottom
# COMMENTS_GISCUS_LANG=zh-CN
# COMMENTS_GISCUS_LAZY=true
```

**线上部署**：在托管平台的环境变量设置中添加同名变量：

- **Vercel**：Project → Settings → Environment Variables
- **Netlify**：Site configuration → Environment variables
- **使用本仓库 CI**（`.github/workflows/build.yaml`）：`COMMENTS_GISCUS_REPO_ID` 和 `COMMENTS_GISCUS_CATEGORY_ID` 从 **Secrets** 读取，其余 `COMMENTS_*` 从 **Variables** 读取，填到仓库的 Settings → Secrets and variables → Actions 即可

完整变量清单见 [`.env.example`](../.env.example) 与 [CONFIGURATION.md](./CONFIGURATION.md)。

### 步骤 5：测试评论功能

1. 重启开发服务器（配置在启动时读取）：
   ```bash
   npm run dev
   ```

2. 访问任意文章或独立页面

3. 滚动到页面底部，应该看到评论区

4. 发表一条评论后，GitHub 仓库的 Discussions 中会出现对应讨论

**验证成功**：
- ✅ 页面底部显示评论区
- ✅ 可以看到评论框
- ✅ 可以发布评论（需要登录 GitHub）
- ✅ GitHub 仓库的 Discussions 中出现对应讨论

## 环境变量参考

### 总开关

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `COMMENTS_ENABLED` | boolean | `false` | 评论总开关，`true` 启用 |
| `COMMENTS_PROVIDER` | string | `giscus` | 评论提供商。**目前仅实现 giscus**；设为其他值（`waline` / `utterances` / `twikoo`）时页面不渲染评论区，仅控制台提示"暂未实现" |

### Giscus 参数

**必需参数**（缺失时评论区显示"评论系统配置不完整"，浏览器控制台报错）：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `COMMENTS_GISCUS_REPO` | GitHub 仓库 | `username/blog` |
| `COMMENTS_GISCUS_REPO_ID` | 仓库 ID（giscus.app 生成） | `R_kgDOG...` |
| `COMMENTS_GISCUS_CATEGORY_ID` | 分类 ID（giscus.app 生成） | `DIC_kwDOG...` |

**有默认值的参数**：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `COMMENTS_GISCUS_CATEGORY` | `Announcements` | 讨论分类名称，需与 `CATEGORY_ID` 对应的分类一致 |
| `COMMENTS_GISCUS_MAPPING` | `pathname` | 页面映射方式，见下表 |
| `COMMENTS_GISCUS_STRICT` | `0` | giscus 严格模式（`0` / `1`） |
| `COMMENTS_GISCUS_REACTIONS_ENABLED` | `1` | 主帖表情反应（`0` / `1`） |
| `COMMENTS_GISCUS_EMIT_METADATA` | `0` | 向页面发送 discussion 元数据（`0` / `1`） |
| `COMMENTS_GISCUS_INPUT_POSITION` | `bottom` | 输入框位置（`top` 或 `bottom`） |
| `COMMENTS_GISCUS_LANG` | `zh-CN` | 界面语言 |
| `COMMENTS_GISCUS_LAZY` | `true` | 懒加载（`true` / `false`） |

### 页面映射方式（`COMMENTS_GISCUS_MAPPING`）

| 映射方式 | 说明 | URL 改变的影响 | 推荐度 |
|---------|------|---------------|--------|
| `pathname` | URL 路径 | URL 改变会创建新讨论 | ⭐⭐⭐⭐⭐ |
| `url` | 完整 URL | URL 改变会创建新讨论 | ⭐⭐⭐⭐ |
| `title` | 页面标题 | 标题相同会共用讨论 | ⭐⭐⭐ |
| `og:title` | Open Graph 标题 | OG 标签相同会共用讨论 | ⭐⭐ |
| `specific` | 特定 term | 需要手动指定 term | ⭐ |
| `number` | 讨论编号 | 手动关联已有讨论 | ⭐ |

**推荐**：使用默认的 `pathname`，以 URL 路径作为唯一标识。

### 语言支持

`COMMENTS_GISCUS_LANG` 常用取值：

| 语言代码 | 语言 |
|---------|------|
| `zh-CN` | 简体中文 |
| `zh-TW` | 繁体中文 |
| `en` | 英语 |
| `ja` | 日语 |
| `ko` | 韩语 |
| `de` | 德语 |
| `fr` | 法语 |
| `es` | 西班牙语 |
| `ru` | 俄语 |

完整列表：[Giscus 高级用法 - Locale](https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md#locale)

## 故障排查

### 问题 1：评论区不显示

**症状**：页面底部看不到评论区

**检查清单**：
- [ ] `COMMENTS_ENABLED` 是否为 `true`（默认是 `false`，不显示属正常）
- [ ] 当前主题是否为 `default` 或 `paper`（`minimal` / `terminal` / `retro` 没有评论区）
- [ ] 修改环境变量后是否**重启了 dev server / 重新部署**（配置在构建启动时读取）
- [ ] `COMMENTS_GISCUS_REPO`、`COMMENTS_GISCUS_REPO_ID`、`COMMENTS_GISCUS_CATEGORY_ID` 是否已设置
- [ ] 仓库是否启用了 Discussions 且为公开访问
- [ ] 浏览器控制台是否有错误

**常见错误**：

```
[Giscus] ❌ Missing required configuration
```

页面表现：评论区位置显示"评论系统配置不完整，请联系站点管理员"。

**解决方法**：检查上表三个必需环境变量是否已正确设置。

### 问题 2：评论加载失败

**症状**：评论区显示"评论加载失败，请刷新页面重试"

**错误信息**：
```
[Giscus] ❌ Failed to initialize: Failed to load Giscus script
```

**可能原因**：
1. 网络问题，无法访问 `giscus.app`
2. Giscus 服务暂时不可用
3. Giscus App 未安装到仓库

**解决方法**：
1. 检查网络连接
2. 等待一段时间后重试
3. 确认 Giscus App 已安装并有权限访问仓库
4. 检查浏览器控制台的详细错误信息

### 问题 3：评论与页面不对应

**症状**：评论内容与当前页面不匹配

**可能原因**：
- `COMMENTS_GISCUS_MAPPING` 配置与预期不符
- 页面的 URL 或标题发生变化

**解决方法**：
- 使用 `pathname` 映射（推荐）
- 保持页面 URL（`slug`）稳定
- 如果需要关联到已有讨论，使用 `number` 映射

### 问题 4：需要登录才能看到评论

**症状**：未登录用户看不到评论区

**可能原因**：
- GitHub 仓库是私有的

**解决方法**：
- 将仓库设置为公开（Public）
- 或告知读者需要登录 GitHub 账号

## 常见问题

### Q: 修改了配置为什么看不到效果？

A: 评论配置在**构建/启动时**读取。本地修改 `.env` 后需重启 `npm run dev`；托管平台修改环境变量后需重新触发部署。

### Q: 如何禁用评论功能？

A: 不设置 `COMMENTS_ENABLED`（或设为 `false`）即可——默认就是关闭的，改完重新部署生效。

如需在某个主题中彻底移除评论相关代码，可删除该主题页面里对 `<Comments />` 组件的引用（`default` 主题在 `src/themes/default/pages/post/[slug].astro` 与 `src/themes/default/pages/[slug].astro`）。

### Q: 评论数据存储在哪里？

A: 评论数据存储在你 GitHub 仓库的 Discussions 中，你拥有完全控制权。

### Q: 可以更换其他评论系统吗？

A: `COMMENTS_PROVIDER` 架构上预留了 `waline` / `utterances` / `twikoo`，但**当前仅实现了 Giscus**；设置其他值时评论区不渲染，仅控制台提示"暂未实现"。

### Q: 评论会同步到 Notion 吗？

A: 不会。评论存储在 GitHub Discussions，与 Notion 无关。

### Q: 可以导入其他平台的评论吗？

A: Giscus 支持从其他评论系统导入，详见 [Giscus 迁移指南](https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md#data-migration)。

### Q: 评论会跟随站点的深色模式切换吗？

A: 会。评论主题跟随站点深浅色模式，点击站点的深浅色切换按钮即时生效（无需刷新），无需任何配置。如需固定主题或自定义样式，见[高级配置](#高级配置)。

## 高级配置

### 自定义评论主题

默认跟随站点深浅色：浅色模式用 `light`，深色模式用 `transparent_dark`（透明底，融入站点自身底色）。如需调整，编辑 `src/scripts/comments/giscus.ts` 顶部的 `GISCUS_THEME` 常量对：

```typescript
const GISCUS_THEME: Record<SiteThemeMode, string> = {
  light: 'light',
  dark: 'transparent_dark',   // 可换 'dark'、'dark_dimmed' 或自定义主题 CSS 的 URL
};
```

常用内置主题：`light`、`light_high_contrast`、`light_protanopia`、`light_tritanopia`、`dark`、`dark_dimmed`、`dark_high_contrast`、`dark_tritanopia`、`transparent_dark`、`preferred_color_scheme`、`noborder_light`、`noborder_dark`、`cobalt`、`purple_dark`。

完整主题列表：[Giscus 高级用法 - Theme](https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md#theme)

> 主题作者注意：直接修改 `src/scripts/` 属于改内核代码，更新 NoPress 时会被覆盖。更可持续的方式是在自己的主题中按 [THEMES.md §7](./THEMES.md#7-评论系统) 实现评论组件。

## 扩展阅读

- **[Giscus 官网](https://giscus.app)** - 在线配置工具
- **[Giscus GitHub](https://github.com/giscus/giscus)** - 源代码和文档
- **[Giscus 高级用法](https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md)** - 高级配置
- **[CONFIGURATION.md](./CONFIGURATION.md)** - 全部环境变量参考
- **[THEMES.md §7](./THEMES.md#7-评论系统)** - 主题作者接入评论
