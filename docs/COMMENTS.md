# 评论功能配置指南

NoPress 支持集成第三方评论系统，首个版本支持 Giscus（基于 GitHub Discussions）。

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [详细配置步骤](#详细配置步骤)
- [配置参数说明](#配置参数说明)
- [故障排查](#故障排查)
- [常见问题](#常见问题)

## 功能特性

✅ **完全免费**：托管在 GitHub，无服务器成本
✅ **无追踪**：不收集用户数据，尊重隐私
✅ **支持 Markdown**：评论支持 Markdown 语法
✅ **GitHub 集成**：评论存储在 GitHub Discussions
✅ **反应功能**：支持表情反应（👍👎😄🎉🚀❤️）
✅ **多语言**：支持简体中文、英语等多种语言
✅ **懒加载**：滚动到可视区域时才加载，不影响首屏性能

**支持的页面**：
- ✅ Post 页面（博客文章）：`/post/{slug}`
- ✅ Page 页面（独立页面）：`/{slug}`

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
   - 填写仓库信息，选择配置
   - 复制生成的配置

4. **配置 NoPress**（1 分钟）
   - 编辑 `src/config/site.ts`
   - 填入 Giscus 参数
   - 设置 `enabled: true`

5. **测试**（30 秒）
   - 运行 `npm run dev`
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
5. 可选：设置仓库图标和描述
6. 可选：创建一个讨论分类（如 "Announcements"）

### 步骤 3：获取配置参数

1. 访问 [Giscus 配置页面](https://giscus.app)

2. 填写以下信息：
   - **仓库**：`your-username/your-repo`（例如：`john/blog`）
   - **页面 ↔️ discussions 映射**：选择 `pathname`（推荐）
   - **Discussion 分类**：
     - 如果已有分类，选择一个（如 `Announcements`）
     - 如果没有，点击 "new repository category" 创建新分类
   - **主题**：选择 `light`（当前版本固定使用浅色主题）
   - **特性**：
     - ✅ 发送 `discussion` 的元数据：可选
     - ✅ 加载评论时显示主标题：可选
     - ✅ 启用反应反应：推荐启用
     - **输入框位置**：选择 `bottom`（底部）
     - **语言**：选择 `zh-CN`（简体中文）
     - **懒加载**：✅ 启用（推荐）

3. 点击 **Copy configuration** 复制配置参数

### 步骤 4：配置 NoPress

编辑 `src/config/site.ts` 文件：

```typescript
export const SITE_CONFIG = {
  // ... 其他配置

  // 评论系统配置
  comments: {
    enabled: true, // ← 改为 true 启用评论
    provider: 'giscus',
    giscus: {
      repo: 'your-username/your-repo',          // ← 你的 GitHub 仓库
      repoId: 'R_kgDOG...',                    // ← 从 Giscus 获取
      category: 'Announcements',               // ← 从 Giscus 获取
      categoryId: 'DIC_kwDOG...',              // ← 从 Giscus 获取
      mapping: 'pathname',
      strict: '0',
      reactionsEnabled: '1',
      emitMetadata: '0',
      inputPosition: 'bottom',
      lang: 'zh-CN',
      lazy: true,
    },
  },

  // ... 其他配置
} as const;
```

### 步骤 5：测试评论功能

1. 启动开发服务器：
   ```bash
   npm run dev
   ```

2. 访问任意文章或独立页面

3. 滚动到页面底部，应该看到评论区

4. 首次访问时，Giscus 会自动为该页面创建一个 Discussion

**验证成功**：
- ✅ 页面底部显示评论区
- ✅ 可以看到评论框
- ✅ 可以发布评论（需要登录 GitHub）
- ✅ GitHub 仓库的 Discussions 中出现对应讨论

## 配置参数说明

### 必需参数

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `enabled` | boolean | 全局开关 | `true` 启用，`false` 禁用 |
| `repo` | string | GitHub 仓库 | `username/blog` |
| `repoId` | string | 仓库 ID | `R_kgDOG...` |
| `category` | string | 讨论分类名称 | `Announcements` |
| `categoryId` | string | 分类 ID | `DIC_kwDOG...` |

### 可选参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mapping` | string | `pathname` | 页面映射方式 |
| `strict` | string | `0` | 严格模式 |
| `reactionsEnabled` | string | `1` | 启用反应功能 |
| `emitMetadata` | string | `0` | 发送元数据 |
| `inputPosition` | string | `bottom` | 输入框位置（`top` 或 `bottom`） |
| `lang` | string | `zh-CN` | 界面语言 |
| `lazy` | boolean | `true` | 懒加载 |

### 页面映射方式（mapping）

Giscus 支持多种页面映射方式：

| 映射方式 | 说明 | URL 改变的影响 | 推荐度 |
|---------|------|---------------|--------|
| `pathname` | URL 路径 | URL 改变会创建新讨论 | ⭐⭐⭐⭐⭐ |
| `url` | 完整 URL | URL 改变会创建新讨论 | ⭐⭐⭐⭐ |
| `title` | 页面标题 | 标题相同会共用讨论 | ⭐⭐⭐ |
| `og:title` | Open Graph 标题 | OG 标签相同会共用讨论 | ⭐⭐ |
| `specific` | 特定 term | 需要手动指定 term | ⭐ |
| `number` | 讨论编号 | 手动关联已有讨论 | ⭐ |

**推荐**：使用 `pathname`，URL 路径作为唯一标识。

### 语言支持

Giscus 支持的主要语言：

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
- [ ] `comments.enabled` 是否为 `true`
- [ ] Giscus 配置参数是否完整（repo、repoId、categoryId）
- [ ] 仓库是否启用了 Discussions
- [ ] 仓库是否为公开访问
- [ ] 浏览器控制台是否有错误

**常见错误**：

```
[Giscus] ❌ Missing required configuration
```

**解决方法**：检查 `src/config/site.ts` 中的 Giscus 配置是否完整。

### 问题 2：评论加载失败

**症状**：评论区显示"评论加载失败"

**错误信息**：
```
[Giscus] ❌ Failed to initialize: Failed to load Giscus script
```

**可能原因**：
1. 网络问题，无法访问 `giscus.app`
2. Giscus 服务暂时不可用
3. 配置参数错误

**解决方法**：
1. 检查网络连接
2. 等待一段时间后重试
3. 验证配置参数是否正确
4. 检查浏览器控制台的详细错误信息

### 问题 3：评论与页面不对应

**症状**：评论内容与当前页面不匹配

**可能原因**：
- `mapping` 配置不正确
- 页面的 URL 或标题发生变化

**解决方法**：
- 使用 `pathname` 映射（推荐）
- 保持页面 URL 稳定
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

A: 清空缓存重新构建：
```bash
rm -rf .cache
npm run dev
```

### Q: 如何禁用评论功能？

A: 有两种方式：

**全局禁用**（所有页面）：
```typescript
// src/config/site.ts
comments: {
  enabled: false, // ← 改为 false
  // ...
}
```

**特定页面禁用**（修改组件）：
编辑 `src/themes/default/components/Comments.astro`，添加自定义逻辑。

### Q: 评论数据存储在哪里？

A: 评论数据存储在你 GitHub 仓库的 Discussions 中，你拥有完全控制权。

### Q: 可以更换其他评论系统吗？

A: 当前版本支持 Giscus，架构设计上支持未来添加 Waline、Utterances、Twikoo 等其他评论系统。

### Q: 评论会同步到 Notion 吗？

A: 不会。评论存储在 GitHub Discussions，与 Notion 无关。

### Q: 可以导入其他平台的评论吗？

A: Giscus 支持从其他评论系统导入，详见 [Giscus 迁移指南](https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md#data-migration)。

### Q: 当前主题固定为浅色，会跟随站点主题切换吗？

A: 当前版本不会。评论系统使用固定的 `light` 主题，不会跟随站点的深色/浅色主题切换。等待主题系统完善后可以添加主题同步功能。

## 高级配置

### 自定义评论主题

虽然当前版本固定使用 `light` 主题，但你可以在 Giscus 配置页面选择不同的内置主题：

- `light` - 浅色主题（当前使用）
- `dark` - 深色主题
- `dark_dimmed` - 柔和深色
- `dark_high_contrast` - 高对比度深色
- `dark_tritan` - Triton 深色
- `transparent` - 透明主题

**注意**：即使选择了深色主题，当前版本也不会跟随站点主题自动切换。

更多主题：[Giscus 高级用法 - Theme](https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md#theme)

### 使用自定义主题 URL

如果你有自定义的 Giscus 主题，可以在 `src/scripts/comments/giscus.ts` 中修改：

```typescript
// 找到这一行（约 360 行）
script.setAttribute('data-theme', 'preferred_color_scheme');

// 改为你的自定义主题 URL
script.setAttribute('data-theme', 'https://your-custom-theme.css');
```

## 扩展阅读

- **[Giscus 官网](https://giscus.app)** - 在线配置工具
- **[Giscus GitHub](https://github.com/giscus/giscus)** - 源代码和文档
- **[Giscus 高级用法](https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md)** - 高级配置
