# RFC 004 - 评论系统功能

**状态**: ✅ 已实现
**创建日期**: 2026-01-13
**作者**: NoPress Team
**标签**: feature, comments, giscus

---

## 目录

- [背景与动机](#背景与动机)
- [目标](#目标)
- [详细设计](#详细设计)
- [实现计划](#实现计划)
- [风险与挑战](#风险与挑战)
- [参考资源](#参考资源)

---

## 背景与动机

### 现状

NoPress 作为一个基于 Notion 和 Astro 的静态博客生成器,目前已经实现了:
- ✅ Notion Database 作为唯一数据源
- ✅ 智能缓存系统和 API 优化
- ✅ 响应式设计和深色模式
- ✅ RSS Feed 订阅功能
- ✅ 文章目录(TOC)自动生成

但是缺少一个关键的博客功能:**评论系统**。

### 问题

现代博客系统需要评论功能来实现:
1. **读者互动**: 读者可以对文章发表评论、提出问题
2. **社区构建**: 通过讨论形成读者社区
3. **反馈收集**: 作者可以获得文章的反馈和建议
4. **内容丰富**: 评论内容可以补充和丰富文章内容

### 动机

自建评论系统需要:
- 后端服务器和数据库
- 用户认证和管理
- 垃圾评论过滤
- 数据备份和维护

这些成本对个人博客来说过于昂贵。而第三方评论系统提供了:
- **零服务器成本**: 托管在第三方平台
- **成熟的功能**: 用户认证、垃圾过滤、通知等
- **免费使用**: 大多数系统对公开仓库免费
- **易于集成**: 几行代码即可完成

---

## 目标

### 核心目标

1. **集成第三方评论系统**: 首个版本支持 Giscus(基于 GitHub Discussions)
2. **可扩展架构**: 设计支持未来添加其他评论系统(Waline、Utterances、Twikoo 等)
3. **Post 和 Page 支持**: 在博客文章和独立页面都显示评论区
4. **配置化管理**: 通过配置文件控制评论系统的启用和参数
5. **性能优化**: 延迟加载评论脚本,不影响首屏性能

### 非目标

- ❌ 不实现自建评论系统后端
- ❌ 不实现用户认证和管理(由第三方系统提供)
- ❌ 不实现评论数据导入导出(依赖第三方平台)
- ❌ 不在首页、归档页等列表页显示评论
- ❌ 不实现主题自动适配(等待主题系统完善后再实现)

---

## 详细设计

### 架构原则

**设计决策**: 配置在 core，实现在主题

NoPress 采用分层架构设计：
- **Core 层**: 提供配置接口和工具脚本，不涉及 UI 实现
- **Theme 层**: 提供 UI 组件和样式，完全自主

**优势**:
- ✅ 符合 NoPress"内核专注数据层"的设计理念
- ✅ 主题可以选择是否支持评论功能
- ✅ 主题可以自定义评论区的样式和布局
- ✅ 避免强制所有主题使用相同的 UI 设计

**职责划分**:

| 层级 | 职责 | 文件位置 |
|------|------|---------|
| **Core** | 配置定义、类型定义、工具脚本 | `src/config/site.ts`<br>`src/lib/types.ts`<br>`src/scripts/comments/` |
| **Theme** | UI 组件、样式、页面集成 | `src/themes/default/components/Comments.astro`<br>`src/themes/default/pages/post/[slug].astro` |

### 架构设计

```
用户访问 Post/Page 页面
    ↓
Astro 渲染页面内容
    ↓
Comments 组件
    ↓
检查 comments.enabled
    ↓ (enabled = true)
根据 provider 选择实现
    ↓ (provider = 'giscus')
Giscus 脚本动态加载
    ↓
Giscus iframe 渲染
    ↓
用户交互(评论、回复、反应)
    ↓
数据存储到 GitHub Discussions
```

### 分层设计

#### 1. 配置层 (Configuration Layer)

**文件**: `src/config/site.ts`

```typescript
export const SITE_CONFIG = {
  // ... 现有配置

  // 评论系统配置
  comments: {
    enabled: true,              // 全局开关
    provider: 'giscus' as const, // 评论提供商
    giscus: {
      repo: 'owner/repo',              // GitHub 仓库
      repoId: 'R_kgDOG...',            // 仓库 ID
      category: 'Announcements',       // 讨论分类
      categoryId: 'DIC_kwDOG...',      // 分类 ID
      mapping: 'pathname' as const,    // 页面映射方式
      strict: '0' as const,
      reactionsEnabled: '1' as const,
      emitMetadata: '0' as const,
      inputPosition: 'bottom' as const,
      lang: 'zh-CN',
      lazy: true,                      // 懒加载
    },
    // 未来扩展: waline, utterances, twikoo 等
  },
} as const;
```

**设计要点**:
- 使用 `as const` 确保类型安全
- 支持多个评论系统的配置共存
- `enabled` 作为总开关,可以快速禁用所有评论
- `provider` 决定使用哪个评论系统

#### 2. 类型层 (Type Layer)

**文件**: `src/lib/types.ts`

```typescript
// 评论系统提供商类型
export type CommentProvider = 'giscus' | 'waline' | 'utterances' | 'twikoo';

// 评论系统配置接口
export interface CommentSystemConfig {
  enabled: boolean;
  provider: CommentProvider;
  giscus?: GiscusConfig;
  waline?: WalineConfig;      // 未来扩展
  utterances?: UtterancesConfig; // 未来扩展
  twikoo?: TwikooConfig;      // 未来扩展
}

// Giscus 配置接口
export interface GiscusConfig {
  repo: string;                    // GitHub 仓库 (格式: owner/repo)
  repoId: string;                  // 仓库 ID
  category: string;                // 讨论分类名称
  categoryId: string;              // 分类 ID
  mapping: GiscusMapping;          // 页面映射方式
  strict: '0' | '1';               // 严格模式
  reactionsEnabled: '0' | '1';     // 启用反应
  emitMetadata: '0' | '1';         // 发送元数据
  inputPosition: 'top' | 'bottom'; // 输入框位置
  lang: string;                    // 语言
  lazy: boolean;                   // 懒加载
}

// Giscus 页面映射类型
export type GiscusMapping =
  | 'pathname'    // 使用 URL 路径
  | 'url'         // 使用完整 URL
  | 'title'       // 使用页面标题
  | 'og:title'    // 使用 Open Graph 标题
  | 'specific'    // 使用特定 term
  | 'number';     // 使用讨论编号
```

**设计要点**:
- 使用 TypeScript 接口确保类型安全
- `CommentProvider` 类型限制可用的评论系统
- 每个评论系统有独立的配置接口
- 支持未来扩展新的评论系统

#### 3. 组件层 (Component Layer)

**文件**: `src/themes/default/components/Comments.astro`

```astro
---
/**
 * 评论组件
 * 支持多种评论系统,首个版本支持 Giscus
 */

interface Props {
  slug: string;           // 页面 slug,用于映射评论
  title?: string;         // 页面标题
}

const { slug, title } = Astro.props;
import { SITE_CONFIG } from '@config/site';
---

{SITE_CONFIG.comments.enabled && (
  <div class="comments-container" id="comments">
    <div class="comments-loading">加载评论中...</div>

    <!-- Giscus 评论系统 -->
    {SITE_CONFIG.comments.provider === 'giscus' && (
      <script define:vars={{ slug, title, config: SITE_CONFIG.comments.giscus }}>
        import { initGiscus } from '@/scripts/comments/giscus';
        initGiscus({ slug, title, config });
      </script>
    )}

    <!-- 未来扩展: Waline -->
    {SITE_CONFIG.comments.provider === 'waline' && (
      <script define:vars={{ slug, title, config: SITE_CONFIG.comments.waline }}>
        import { initWaline } from '@/scripts/comments/waline';
        initWaline({ slug, title, config });
      </script>
    )}

    <!-- 未来扩展: Utterances -->
    {SITE_CONFIG.comments.provider === 'utterances' && (
      <script define:vars={{ slug, title, config: SITE_CONFIG.comments.utterances }}>
        import { initUtterances } from '@/scripts/comments/utterances';
        initUtterances({ slug, title, config });
      </script>
    )}
  </div>
)}

<style>
  .comments-container {
    margin-top: var(--spacing-2xl);
    padding-top: var(--spacing-xl);
    border-top: 1px solid var(--notion-border);
  }

  .comments-loading {
    text-align: center;
    color: var(--notion-text-secondary);
    padding: var(--spacing-xl);
    font-size: 0.9em;
  }

  /* Giscus 容器样式 */
  :global(.comments-container iframe[src*="giscus.app"]) {
    width: 100%;
    border: none;
  }

  /* 响应式调整 */
  @media (max-width: 768px) {
    .comments-container {
      margin-top: var(--spacing-xl);
      padding-top: var(--spacing-lg);
    }
  }
</style>
```

**设计要点**:
- 条件渲染: 仅在 `comments.enabled = true` 时显示
- 根据 `provider` 动态选择对应的初始化脚本
- 使用 `define:vars` 传递配置到客户端脚本
- 使用 CSS 变量确保样式与主题一致
- 响应式设计适配移动端

#### 4. 脚本层 (Script Layer)

**文件**: `src/scripts/comments/giscus.ts`

**说明**: Core 层提供的工具脚本，主题可以选择使用或自己实现。

```typescript
/**
 * Giscus 评论系统集成
 * @see https://giscus.app
 *
 * 注意: 主题同步功能等待主题系统完善后再实现
 * 当前版本使用固定的 Giscus 主题
 *
 * Core 层提供的工具脚本，主题可以选择使用或自己实现
 */

export interface GiscusInitOptions {
  slug: string;
  title: string;
  config: GiscusConfig;
}

let giscusInitialized = false;

/**
 * 初始化 Giscus 评论系统
 */
export async function initGiscus(options: GiscusInitOptions) {
  // 防止重复初始化
  if (giscusInitialized) {
    console.log('[Giscus] Already initialized');
    return;
  }

  const { slug, title, config } = options;

  try {
    // 动态加载 Giscus 脚本
    await loadGiscusScript(config, slug, title);

    giscusInitialized = true;
    console.log('[Giscus] ✅ Initialized successfully');
  } catch (error) {
    console.error('[Giscus] ❌ Failed to initialize:', error);

    // 显示错误提示
    showErrorMessage('评论加载失败,请刷新页面重试');
  }
}

/**
 * 动态加载 Giscus 脚本
 */
async function loadGiscusScript(
  config: GiscusConfig,
  slug: string,
  title: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // 移除旧的脚本(如果存在)
    const existingScript = document.querySelector('#giscus-script');
    if (existingScript) {
      existingScript.remove();
    }

    // 创建 script 标签
    const script = document.createElement('script');
    script.id = 'giscus-script';
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.defer = true;

    // 设置 Giscus 配置属性
    script.setAttribute('data-repo', config.repo);
    script.setAttribute('data-repo-id', config.repoId);
    script.setAttribute('data-category', config.category);
    script.setAttribute('data-category-id', config.categoryId);
    script.setAttribute('data-mapping', config.mapping);
    script.setAttribute('data-strict', config.strict);
    script.setAttribute('data-reactions-enabled', config.reactionsEnabled);
    script.setAttribute('data-emit-metadata', config.emitMetadata);
    script.setAttribute('data-input-position', config.inputPosition);
    script.setAttribute('data-lang', config.lang);
    script.setAttribute('data-lazy', config.lazy.toString());

    // 设置主题（固定使用 preferred_color_scheme，等待主题系统完善）
    // 未来扩展: 支持跟随系统主题切换
    script.setAttribute('data-theme', 'preferred_color_scheme');

    // 设置页面映射(使用 pathname)
    script.setAttribute('data-term', slug);

    // 加载完成回调
    script.onload = () => {
      // 隐藏加载提示
      const loading = document.querySelector('.comments-loading');
      if (loading) {
        loading.remove();
      }
      resolve();
    };

    script.onerror = () => {
      reject(new Error('Failed to load Giscus script'));
    };

    // 插入到 DOM
    const container = document.getElementById('comments');
    if (container) {
      container.appendChild(script);
    } else {
      reject(new Error('Comments container not found'));
    }
  });
}

/**
 * 显示错误消息
 */
function showErrorMessage(message: string) {
  const container = document.getElementById('comments');
  if (container) {
    container.innerHTML = `
      <div class="comments-error">
        <p>${message}</p>
        <p style="font-size: 0.85em; margin-top: 0.5em;">
          如果问题持续存在,请检查控制台获取更多信息
        </p>
      </div>
    `;
  }
}

// 导出类型
export type { GiscusInitOptions };
```

**设计要点**:
- **动态加载**: 使用 `createElement` 动态创建 script 标签
- **固定主题**: 当前使用固定的 `light` 主题,等待主题系统完善后再实现主题同步
- **错误处理**: `try-catch` + 友好的错误提示
- **防重复**: `giscusInitialized` 标志防止重复初始化
- **类型安全**: 完整的 TypeScript 类型定义

#### 5. 组件层 (Component Layer)

**文件**: `src/themes/default/components/Comments.astro`

**说明**: Theme 层的 UI 组件，每个主题可以有自己的实现。

本主题选择使用 Core 层提供的工具脚本 `@/scripts/comments/giscus.ts`，其他主题也可以：
- 使用不同的评论系统（Waline、Utterances 等）
- 自己实现 Giscus 集成
- 选择不支持评论功能

**Post 页面集成** (`src/themes/default/pages/post/[slug].astro`):

```astro
---
// ... 现有代码
import { SITE_CONFIG } from '@config/site';
import Comments from '@theme/components/Comments.astro';
---

<!-- 文章内容 -->
<div class="notion-content" set:html={post.content} />

<!-- 文章底部 -->
<footer class="page-footer">
  <a href="/" class="back-link">← 返回首页</a>
</footer>

<!-- 评论系统 -->
{SITE_CONFIG.comments.enabled && (
  <section class="comments-section">
    <Comments slug={post.slug} title={post.title} />
  </section>
)}
```

**Page 页面集成** (`src/themes/default/pages/[slug].astro`):

```astro
---
// ... 现有代码
import { SITE_CONFIG} from '@config/site';
import Comments from '@theme/components/Comments.astro';
---

<!-- 页面内容 -->
<div class="notion-content" set:html={page.content} />

<!-- 评论系统 -->
{SITE_CONFIG.comments.enabled && (
  <section class="comments-section">
    <Comments slug={page.slug} title={page.title} />
  </section>
)}
```

**设计要点**:
- 在页面主体内容之后添加评论
- 使用 `<section>` 标签包裹,语义化更好
- 通过 `comments.enabled` 控制是否显示
- 传递 `slug` 和 `title` 用于评论映射

---

---

### Giscus 配置说明

### 什么是 Giscus?

Giscus 是一个基于 GitHub Discussions 的评论系统,具有以下特点:
- ✅ **完全免费**: 托管在 GitHub,无服务器成本
- ✅ **无追踪**: 不收集用户数据,尊重隐私
- ✅ **支持 Markdown**: 评论支持 Markdown 语法
- ✅ **深色模式**: 内置多套主题,支持主题切换
- ✅ **多语言**: 支持多种语言
- ✅ **Reaction**: 支持表情反应(👍👎😄🎉🚀❤️)
- ✅ **自托管**: 完全基于 GitHub,数据在自己的仓库

### 配置步骤

#### 1. 安装 Giscus App

访问 https://github.com/apps/giscus,点击 **Install** 安装到你的仓库。

#### 2. 启用 Discussions

在仓库设置中启用 Discussions 功能:
- 进入仓库 **Settings**
- 滚动到 **Features** 部分
- 勾选 **Discussions**

#### 3. 获取配置参数

访问 https://giscus.app,填写以下信息:
- **仓库**: 你的 GitHub 仓库 (例如: `username/blog`)
- **页面 ↔️ discussions 映射**: 选择 `pathname`
- **Discussion 分类**: 选择 `Announcements` 或创建新分类
- **主题**: 选择 `light` | `dark` | `preferred_color_scheme`
- **特性**: 根据需要启用/禁用

点击 **Copy configuration** 复制配置。

#### 4. 配置 NoPress

将参数填入 `src/config/site.ts`:

```typescript
comments: {
  enabled: true,
  provider: 'giscus',
  giscus: {
    repo: 'your-username/your-repo',          // 从 Giscus 获取
    repoId: 'R_kgDOG...',                    // 从 Giscus 获取
    category: 'Announcements',               // 从 Giscus 获取
    categoryId: 'DIC_kwDOG...',              // 从 Giscus 获取
    mapping: 'pathname',
    strict: '0',
    reactionsEnabled: '1',
    emitMetadata: '0',
    inputPosition: 'bottom',
    lang: 'zh-CN',
    lazy: true,
  },
}
```

#### 5. 首次访问

访问任意 Post 或 Page 页面,Giscus 会自动创建对应的 Discussion。

### 页面映射方式

Giscus 支持多种页面映射方式:

| 映射方式 | 说明 | 适用场景 |
|---------|------|---------|
| `pathname` | 使用 URL 路径 | 推荐,URL 改变会创建新讨论 |
| `url` | 使用完整 URL | 包含查询参数 |
| `title` | 使用页面标题 | 标题相同会共用讨论 |
| `og:title` | 使用 Open Graph 标题 | 依赖 OG 标签 |
| `specific` | 使用特定 term | 需要手动指定 term |
| `number` | 使用讨论编号 | 手动关联已有讨论 |

**推荐**: 使用 `pathname`,URL 路径作为唯一标识。

---

### 扩展性设计

### 架构优势

**策略模式**: 通过 `provider` 字段选择评论系统,每个系统独立实现。

**开闭原则**: 对扩展开放,对修改封闭。添加新系统无需修改现有代码。

### 添加新评论系统示例

以 Waline 为例:

#### 1. 添加类型定义

```typescript
// src/lib/types.ts
export interface WalineConfig {
  serverURL: string;     // Waline 服务器地址
  lang: string;          // 语言
  emoji: boolean;        // 表情支持
  imageUploader: boolean; // 图片上传
}
```

#### 2. 添加配置

```typescript
// src/config/site.ts
comments: {
  enabled: true,
  provider: 'waline',
  waline: {
    serverURL: 'https://your-waline-server.com',
    lang: 'zh-CN',
    emoji: true,
    imageUploader: true,
  },
}
```

#### 3. 创建实现脚本

```typescript
// src/scripts/comments/waline.ts
export interface WalineInitOptions {
  slug: string;
  title: string;
  config: WalineConfig;
}

export async function initWaline(options: WalineInitOptions) {
  // Waline 初始化逻辑
}
```

#### 4. 添加组件分支

```astro
<!-- Comments.astro -->
{SITE_CONFIG.comments.provider === 'waline' && (
  <script define:vars={{ slug, title, config: SITE_CONFIG.comments.waline }}>
    import { initWaline } from '@/scripts/comments/waline';
    initWaline({ slug, title, config });
  </script>
)}
```

### 未来支持的评论系统

| 系统 | 特点 | 优先级 |
|------|------|--------|
| **Waline** | 基于 LeanCloud,功能丰富,支持表情、图片上传、数学公式 | P1 |
| **Utterances** | 基于 GitHub Issues,轻量级,但功能相对简单 | P2 |
| **Twikoo** | 基于腾讯云开发,无需后端,部署简单 | P2 |
| **Cusdis** | 开源,隐私友好,支持自托管 | P3 |

---

## 文件清单

### Core 层文件（配置和工具）

#### 需要创建的文件

1. `src/scripts/comments/giscus.ts` - Giscus 评论系统工具脚本

#### 需要修改的文件

2. `src/config/site.ts` - 添加 `comments` 配置项
3. `src/lib/types.ts` - 添加评论系统类型定义

### Theme 层文件（UI 和页面集成）

#### 需要创建的文件

4. `src/themes/default/components/Comments.astro` - 评论 UI 组件

#### 需要修改的文件

5. `src/themes/default/pages/post/[slug].astro` - Post 页面集成评论组件
6. `src/themes/default/pages/[slug].astro` - Page 页面集成评论组件

**架构说明**:
- **Core 层**: 提供配置接口和工具脚本，不涉及 UI 实现
- **Theme 层**: 提供 UI 组件和页面集成，完全自主

**主题选择权**:
- ✅ 使用相同的 Comments 组件（复用 core 工具脚本）
- ✅ 自己实现评论组件（使用不同的评论系统）
- ✅ 不支持评论功能

---

## 实现计划

### 阶段 1: 配置和类型 (30 分钟)

- [ ] 修改 `src/config/site.ts`,添加 `comments` 配置项
- [ ] 修改 `src/lib/types.ts`,添加评论系统类型定义
- [ ] 添加配置验证(可选,使用 Zod)

### 阶段 2: Giscus 脚本实现 (1 小时)

- [ ] 创建 `src/scripts/comments/giscus.ts`
- [ ] 实现 `initGiscus()` 函数
- [ ] 实现动态脚本加载 `loadGiscusScript()`
- [ ] 实现主题同步 `setupThemeSync()`
- [ ] 实现错误处理和降级

### 阶段 3: 组件开发 (1 小时)

- [ ] 创建 `src/themes/default/components/Comments.astro`
- [ ] 实现条件渲染逻辑
- [ ] 添加 Giscus 初始化脚本
- [ ] 添加样式(响应式、主题适配)

### 阶段 4: 页面集成 (30 分钟)

- [ ] 修改 `src/themes/default/pages/post/[slug].astro`,添加评论组件
- [ ] 修改 `src/themes/default/pages/[slug].astro`,添加评论组件
- [ ] 测试 Post 和 Page 页面评论显示

### 阶段 5: 测试和优化 (1 小时)

- [ ] 配置真实的 Giscus 参数
- [ ] 启动开发服务器测试
- [ ] 测试评论发布、回复、反应等功能
- [ ] 性能测试(首屏加载时间)
- [ ] 移动端测试

### 阶段 6: 文档编写 (1 小时)

- [ ] 编写 RFC 004 文档
- [ ] 更新 AGENTS.md 添加评论系统说明
- [ ] 添加配置示例和使用指南
- [ ] 添加故障排查指南

**总计**: 约 4.5 小时

---

## 风险与挑战

### 技术风险

#### 1. 脚本加载失败

**风险**: 网络问题或 Giscus 服务异常导致脚本加载失败。

**缓解措施**:
- `try-catch` 捕获错误
- 显示友好的错误提示
- 提供重试机制

#### 2. 性能影响

**风险**: 评论脚本可能影响页面加载性能。

**缓解措施**:
- 启用 `lazy` 懒加载,滚动到可视区域时才加载
- 使用 `requestIdleCallback` 在浏览器空闲时加载
- 预留超时降级方案

#### 3. 主题固定

**当前限制**: 评论系统当前使用固定的 `light` 主题,不会跟随站点主题切换。

**未来改进**: 等待主题系统完善后,可以添加主题同步功能:
- 监听主题切换事件
- 通过 `postMessage` 动态更新 Giscus 主题
- 支持自定义主题 URL

### 配置风险

#### 1. 敏感信息泄露

**风险**: `repoId` 和 `categoryId` 等敏感信息可能被泄露。

**缓解措施**:
- 使用环境变量存储敏感配置
- 在文档中明确标注哪些是敏感信息
- 提供配置模板,不包含真实值

#### 2. 配置错误

**风险**: 用户配置错误导致评论系统无法工作。

**缓解措施**:
- 使用 TypeScript 类型检查
- 提供详细的配置说明和示例
- 在开发环境下添加配置验证

### 用户体验风险

#### 1. 评论数据迁移

**风险**: 如果未来更换评论系统,如何迁移现有评论?

**缓解措施**:
- Giscus 数据存储在 GitHub Discussions,可以导出
- 提供数据导出指南
- 在 RFC 中说明数据迁移方案

#### 2. GitHub 依赖

**风险**: 如果 GitHub 服务中断,Giscus 将无法使用。

**缓解措施**:
- GitHub 的稳定性很高,风险较低
- 如果 GitHub 停机,评论区会显示加载失败,不影响文章内容
- 可以设置 `comments.enabled = false` 快速禁用

---

## 参考资源

### 官方文档

- **[Giscus 官方网站](https://giscus.app/)**
- **[Giscus GitHub](https://github.com/giscus/giscus-component)**
- **[GitHub Discussions API](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)**

### Astro 文档

- **[Astro 组件文档](https://docs.astro.build/en/core-concepts/astro-components/)**
- **[Astro 脚本标签](https://docs.astro.build/en/guides/client-side-scripts/)**
- **[Astro 集成 API](https://docs.astro.build/en/reference/integrations-reference/)**

### 项目文档

- **[RFC 001 - 主题系统设计](./001-theme-system.md)**: 了解主题架构
- **[RFC 003 - RSS Feed 功能](./003-rss-feed.md)**: 参考第三方功能集成模式
- **[AGENTS.md](../../AGENTS.md)**: AI 代理开发指南

### 相关技术

- **[requestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)**: 性能优化

### 未来扩展

#### 主题同步功能

等待主题系统完善后,可以添加以下功能:
- 监听主题切换事件
- 通过 `postMessage` 动态更新 Giscus 主题
- 支持自定义主题 URL
- 支持深色/浅色主题自动切换

实现方式:
```typescript
// 未来实现示例
window.addEventListener('theme-changed', (event) => {
  const { theme } = event.detail;
  const iframe = document.querySelector('iframe[src*="giscus.app"]');
  iframe.contentWindow?.postMessage(
    { giscus: { setConfig: { theme: getGiscusThemeUrl(theme) } } },
    'https://giscus.app'
  );
});
```

---

## 附录

### Giscus 主题列表

Giscus 支持多种主题,可以根据需要选择:

| 主题名称 | URL | 适用场景 |
|---------|-----|---------|
| Light | `https://giscus.app/themes/light` | 浅色主题 |
| Dark | `https://giscus.app/themes/dark` | 深色主题 |
| Dark Dimmed | `https://giscus.app/themes/dark_dimmed` | 柔和深色 |
| Dark High Contrast | `https://giscus.app/themes/dark_high_contrast` | 高对比度深色 |
| Dark Blue | `https://giscus.app/themes/dark_blue` | 蓝色深色 |
| Transparent | `https://giscus.app/themes/transparent` | 透明主题 |
| Preferred Color Scheme | `https://giscus.app/themes/preferences` | 跟随系统 |

### 常见问题

**Q: Giscus 是免费的吗?**

A: 是的,Giscus 完全免费,托管在 GitHub,无服务器成本。

**Q: Giscus 支持匿名评论吗?**

A: 不支持,用户需要登录 GitHub 账号才能评论。

**Q: 如果文章 URL 改变了,评论会丢失吗?**

A: 如果使用 `pathname` 映射,URL 改变会创建新的 Discussion。建议使用固定的 URL 结构。

**Q: 可以在一篇文章中关闭评论吗?**

A: 当前版本不支持,未来可以添加 Notion Database 字段控制单个文章的评论开关。

**Q: Giscus 的数据存储在哪里?**

A: 存储在你 GitHub 仓库的 Discussions 中,你拥有完全控制权。

---

## 变更日志

**2026-01-13**:
- ✅ 创建 RFC 004 文档
- ✅ 设计可扩展的评论系统架构
- ✅ 完成 Giscus 集成方案设计
- ⏳ 等待实现

---

**最后更新**: 2026-01-13
