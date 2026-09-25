# NoPress 配置系统指南

NoPress 支持灵活的配置系统，可以通过环境变量或配置文件来自定义站点设置。

> 只想搭好博客、改改标题和主题？先看 [用户指南](./USER-GUIDE.md)，本文是全部变量的技术参考。

## 目录

- [配置方式](#配置方式)
- [环境变量参考](#环境变量参考)
- [部署配置](#部署配置)
- [常见问题](#常见问题)

## 配置方式

### 方式一：环境变量（推荐用于生产环境）

使用环境变量配置站点，适用于 Vercel、Netlify、Docker 等部署环境。

**优点**：
- ✅ 敏感信息（如 Notion Token）不会提交到代码库
- ✅ 不同环境（开发/测试/生产）使用不同配置
- ✅ CI/CD 友好，支持自动化部署

**设置方式**：

1. **本地开发**：在 `.env` 文件中配置
2. **Vercel**：在项目设置 → Environment Variables 中添加
3. **Netlify**：在 Site settings → Environment variables 中添加
4. **Docker**：使用 `-e` 参数或 `--env-file`：

```bash
docker run -e SITE_URL=https://example.com -e SITE_TITLE="My Blog" ...
```

### 方式二：修改默认配置（不推荐）

直接修改 `src/lib/config/loader.ts` 中的默认值。

**缺点**：
- ❌ 配置会提交到 Git，不适合敏感信息
- ❌ 不支持多环境配置

**仅适用于**：公开配置的默认值，如语言、每页文章数等。

### 配置优先级

当同一个配置在多个地方设置时，优先级从高到低：

1. **环境变量**（如 `SITE_URL`）
2. **.env 文件**
3. **Notion Database 元数据**（仅适用于 `SITE_TITLE`、`SITE_DESCRIPTION`、`SITE_ICON`）
4. **代码默认值**（`src/lib/config/loader.ts`）

**自动获取 Database 元数据**：

站点的标题、描述和图标可以自动从 Notion Database 获取：
- `SITE_TITLE` 留空 → 使用 Database 名称
- `SITE_DESCRIPTION` 留空 → 使用 Database 描述
- `SITE_ICON` 留空 → 使用 Database 图标（Emoji 或图片 URL）

**示例**：
```bash
# .env 文件
SITE_TITLE=  # 留空，自动使用 Database 名称
SITE_DESCRIPTION=  # 留空，自动使用 Database 描述

# 或者手动指定（优先级更高）
SITE_TITLE=My Custom Blog  # ← 使用自定义标题，不使用 Database 名称
```

## 环境变量参考

### Notion API 配置（必需）

| 变量名 | 说明 | 示例值 | 获取方式 |
|--------|------|--------|----------|
| `NOTION_TOKEN` | Notion Integration Token | `secret_xxx...` | [Notion Integrations](https://www.notion.so/my-integrations) |
| `NOTION_DATABASE_ID` | Notion Database ID | `abc123...` | 从 Database URL 复制（32 字符） |

---

### 主题配置

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `NOPRESS_THEME` | 使用的 in-tree 主题（`src/themes/` 下的目录名） | `default` | `minimal` |
| `NOPRESS_THEME_PATH` | out-tree 主题路径（项目内相对/绝对路径，或 node_modules 内的包名），优先于 `NOPRESS_THEME` | - | `node_modules/my-theme` |
| `NOPRESS_THEME_OPTIONS` | 主题选项覆盖值，JSON 对象（key 须在主题 `theme.config.mjs` 的 `options` 中声明） | - | `{"footerText":"Hello"}` |

`NOPRESS_THEME_OPTIONS` 的值是构建期常量：类型按主题声明自动转换（number/boolean 支持字符串形态），未知 key 或类型不匹配会在构建时报错。可用选项取决于激活主题的声明，详见 [THEMES.md](./THEMES.md) §3.3。

---

### 站点基本信息

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `SITE_URL` | 站点 URL | `http://localhost:4321` | `https://example.com` |
| `SITE_TITLE` | 站点标题 | 留空使用 Database 名称 | `我的博客` |
| `SITE_DESCRIPTION` | 站点描述 | 留空使用 Database 描述 | `关于技术的博客` |
| `SITE_ICON` | 站点图标/Favicon | 留空使用 Database 图标 | `/favicon.ico` 或 `🚀` |
| `SITE_POSTS_PER_PAGE` | 每页文章数 | `10` | `20` |
| `SITE_ENABLE_RSS` | 启用 RSS | `true` | `true`, `false` |
| `SITE_ENABLE_SITEMAP` | 启用 Sitemap | `true` | `true`, `false` |

**自动获取 Database 元数据**：

- `SITE_TITLE`、`SITE_DESCRIPTION`、`SITE_ICON` 留空时，会自动使用 Notion Database 的元数据
- 手动指定的值优先级更高，会覆盖 Database 元数据

**使用示例**：

```bash
# .env - 完全使用 Database 元数据
SITE_URL=https://myblog.com
SITE_TITLE=  # 留空，自动使用 Database 名称
SITE_DESCRIPTION=  # 留空，自动使用 Database 描述
SITE_ICON=  # 留空，自动使用 Database 图标
SITE_POSTS_PER_PAGE=15

# 或者手动指定（覆盖 Database 元数据）
SITE_TITLE=我的技术博客  # 使用自定义标题
SITE_DESCRIPTION=分享前端、后端、DevOps 技术文章
SITE_ICON=🚀  # 使用自定义 Emoji 图标
```

---

### 社交链接

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `SITE_SOCIAL` | 社交链接（JSON） | 见下方示例 | - |

**SITE_SOCIAL 格式**：

必须是有效的 JSON 字符串：

```bash
# .env
SITE_SOCIAL={"github":"https://github.com/username","twitter":"https://twitter.com/username","email":"mailto:me@example.com"}
```

支持的社交链接：
- `github` - GitHub 主页
- `twitter` - Twitter/X 主页
- `email` - 邮箱（mailto: 链接）
- `linkedin` - LinkedIn 主页
- `website` - 个人网站

---

### 评论系统配置

#### 全局开关

| 变量名 | 说明 | 默认值 | 可选值 |
|--------|------|--------|--------|
| `COMMENTS_ENABLED` | 启用评论功能 | `false` | `true`, `false` |
| `COMMENTS_PROVIDER` | 评论提供商 | `giscus` | 当前仅实现 `giscus` |

#### Giscus 配置

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `COMMENTS_GISCUS_REPO` | GitHub 仓库 | `owner/blog` |
| `COMMENTS_GISCUS_REPO_ID` | 仓库 ID | `R_kgDOG...` |
| `COMMENTS_GISCUS_CATEGORY` | 讨论分类 | `Announcements` |
| `COMMENTS_GISCUS_CATEGORY_ID` | 分类 ID | `DIC_kwDOG...` |
| `COMMENTS_GISCUS_MAPPING` | 页面映射方式 | `pathname` |
| `COMMENTS_GISCUS_STRICT` | 严格模式 | `0` |
| `COMMENTS_GISCUS_REACTIONS_ENABLED` | 表情反应 | `1` |
| `COMMENTS_GISCUS_EMIT_METADATA` | 发送元数据 | `0` |
| `COMMENTS_GISCUS_INPUT_POSITION` | 输入框位置 | `bottom` |
| `COMMENTS_GISCUS_LANG` | 界面语言 | `zh-CN` |
| `COMMENTS_GISCUS_LAZY` | 懒加载 | `true` |

**完整示例**：

```bash
# .env
COMMENTS_ENABLED=true
COMMENTS_PROVIDER=giscus
COMMENTS_GISCUS_REPO=johndoe/blog
COMMENTS_GISCUS_REPO_ID=R_kgDOGxxxxx
COMMENTS_GISCUS_CATEGORY=Announcements
COMMENTS_GISCUS_CATEGORY_ID=DIC_kwDOGxxxxx
COMMENTS_GISCUS_MAPPING=pathname
COMMENTS_GISCUS_STRICT=0
COMMENTS_GISCUS_REACTIONS_ENABLED=1
COMMENTS_GISCUS_EMIT_METADATA=0
COMMENTS_GISCUS_INPUT_POSITION=bottom
COMMENTS_GISCUS_LANG=zh-CN
COMMENTS_GISCUS_LAZY=true
```

**获取 Giscus 配置**：
1. 访问 [Giscus 配置页面](https://giscus.app)
2. 填写仓库信息
3. 复制生成的配置到 `.env`

详细配置指南：**[评论功能配置](./COMMENTS.md)**

---

## 部署配置

### Vercel 部署

1. **推送代码到 GitHub**
2. **在 Vercel 导入仓库**
3. **设置环境变量**：

   进入项目 → Settings → Environment Variables，添加以下变量：

   ```
   NOTION_TOKEN=secret_xxx...
   NOTION_DATABASE_ID=abc123...
   SITE_URL=https://yourdomain.vercel.app
   SITE_TITLE=My Blog
   COMMENTS_ENABLED=true
   COMMENTS_GISCUS_REPO=owner/repo
   COMMENTS_GISCUS_REPO_ID=R_kgDOG...
   COMMENTS_GISCUS_CATEGORY_ID=DIC_kwDOG...
   ```

4. **重新部署**：

   环境变量修改后，需要触发新的部署：
   - 推送新代码
   - 或在 Vercel 控制台点击 "Redeploy"

**Pro tip**：使用 Vercel CLI 批量设置环境变量：

```bash
# .env.production
NOTION_TOKEN=secret_xxx...
NOTION_DATABASE_ID=abc123...
SITE_URL=https://myblog.com
# ... 其他配置

# 导入到 Vercel
vercel env pull .env.production
```

---

### Netlify 部署

1. **连接 Netlify 到 GitHub**
2. **设置环境变量**：

   进入 Site settings → Build & deploy → Environment，添加：

   ```
   NOTION_TOKEN=secret_xxx...
   NOTION_DATABASE_ID=abc123...
   SITE_URL=https://myblog.netlify.app
   ```

3. **构建配置**（可选）：

   ```toml
   # netlify.toml
   [build]
     command = "npm run build"
     publish = "dist"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

---

### Docker 部署

**Dockerfile 示例**：

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**运行命令**：

```bash
# 使用环境变量
docker run -d \
  -e NOTION_TOKEN=secret_xxx \
  -e NOTION_DATABASE_ID=abc123 \
  -e SITE_URL=https://myblog.com \
  -p 80:80 \
  myblog:latest

# 或使用 .env 文件
docker run -d --env-file .env -p 80:80 myblog:latest
```

---

### GitHub Pages 部署

使用 GitHub Actions 自动部署：

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Build site
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
          SITE_URL: https://username.github.io
          SITE_TITLE: My Blog
        run: npm run build

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

**设置 GitHub Secrets**：

进入仓库 → Settings → Secrets and variables → Actions，添加：

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

---

## 常见问题

### Q: 为什么我的环境变量没有生效？

**检查清单**：

- [ ] 确认 `.env` 文件在项目根目录
- [ ] 确认变量名拼写正确（区分大小写）
- [ ] 重启开发服务器（修改 `.env` 后需要重启）
- [ ] 检查是否有空格或特殊字符

**调试方法**：

```typescript
// 在任意 .astro 文件中打印配置
import { SITE_CONFIG } from '@config/site';

console.log('当前配置：', SITE_CONFIG);
```

---

### Q: 如何在不同环境使用不同配置？

**方法 1：多个 .env 文件**

```bash
# .env.development
SITE_URL=http://localhost:4321
COMMENTS_ENABLED=false

# .env.production
SITE_URL=https://myblog.com
COMMENTS_ENABLED=true

# .env.staging
SITE_URL=https://staging.myblog.com
```

启动时指定环境：

```bash
# 开发环境
cp .env.development .env
npm run dev

# 生产环境
cp .env.production .env
npm run build
```

**方法 2：使用 CI/CD 环境变量**

在 Vercel/Netlify 的不同分支/环境设置不同的环境变量。

---

### Q: 敏感信息（如 Notion Token）应该怎么处理？

**最佳实践**：

1. ❌ **不要**将 `.env` 文件提交到 Git
2. ✅ **应该**在 `.gitignore` 中包含 `.env`
3. ✅ **应该**使用 `cp .env.example .env` 创建本地配置
4. ✅ **应该**在生产环境使用平台的环境变量功能

**检查 `.gitignore`**：

```gitignore
# 环境变量文件
.env
.env.local
.env.*.local

# 但保留示例文件
!.env.example
```

---

### Q: 评论功能配置后看不到效果？

**解决方法**：

1. 重新运行 `npm run dev`（配置在页面渲染时注入，无需清缓存）

2. 检查环境变量是否正确设置：

```bash
# .env
COMMENTS_ENABLED=true
COMMENTS_GISCUS_REPO=owner/repo  # ← 必须填写
COMMENTS_GISCUS_REPO_ID=R_kg...  # ← 必须填写
COMMENTS_GISCUS_CATEGORY_ID=DIC_...  # ← 必须填写
```

3. 查看浏览器控制台是否有错误

4. 确认 Giscus 配置参数正确（访问 [Giscus](https://giscus.app) 重新生成）

详细配置指南：**[评论功能配置](./COMMENTS.md)**

---

### Q: 如何自定义导航菜单和外部链接？

**当前版本**：导航菜单由 Notion Database 中 `type=Menu` 的条目控制。

**配置方式**：

在 Notion Database 中创建 `type=Menu` 的条目：

| title | type | status | slug | date |
|-------|------|--------|------|------|
| 博客 | Menu | Published | blog | 2024-01-01 |
| 关于 | Menu | Published | about | 2024-01-02 |

**未来版本**：计划支持通过配置文件自定义导航。

---

### Q: 修改了环境变量，需要重新部署吗？

**本地开发**：修改 `.env` 后重启服务器：

```bash
# Ctrl+C 停止服务器
npm run dev  # 重新启动
```

**生产环境**：
- **Vercel/Netlify**：修改环境变量会自动触发重新部署
- **Docker**：需要重新构建镜像并运行

---

### Q: 可以在代码中读取环境变量吗？

**可以**，使用 Astro 的 `import.meta.env`：

```astro
---
const siteUrl = import.meta.env.SITE_URL;
const notionToken = import.meta.env.NOTION_TOKEN;
---
```

**推荐**：使用 `SITE_CONFIG` 对象而不是直接读取环境变量：

```astro
---
import { SITE_CONFIG } from '@config/site';

const siteUrl = SITE_CONFIG.url;  // ← 推荐这种方式
---
```

---

## 配置示例

### 示例 1：个人博客

```bash
# .env
NOTION_TOKEN=secret_xxx...
NOTION_DATABASE_ID=abc123...

SITE_URL=https://johndoe.com
SITE_TITLE=John's Blog
SITE_DESCRIPTION=Web 开发技术和设计思考

COMMENTS_ENABLED=true
COMMENTS_GISCUS_REPO=johndoe/blog
COMMENTS_GISCUS_REPO_ID=R_kgDOG...
COMMENTS_GISCUS_CATEGORY_ID=DIC_kwDOG...
```

---

### 示例 2：技术团队博客

```bash
# .env
NOTION_TOKEN=secret_xxx...
NOTION_DATABASE_ID=abc123...

SITE_URL=https://teamtech.io
SITE_TITLE=Team Tech Blog
SITE_DESCRIPTION=分享我们的技术实践和经验
SITE_POSTS_PER_PAGE=20

COMMENTS_ENABLED=true
COMMENTS_GISCUS_REPO=teamtech/blog
COMMENTS_GISCUS_REPO_ID=R_kgDOG...
COMMENTS_GISCUS_CATEGORY_ID=DIC_kwDOG...
COMMENTS_GISCUS_LANG=zh-CN
```

---

## 高级配置

### 自定义配置字段

如果需要添加自定义配置字段：

1. **在 `src/lib/config/loader.ts` 添加读取逻辑**：

```typescript
export function loadSiteConfig() {
  return {
    // ... 现有配置

    // 自定义字段
    myCustomField: getEnvString('MY_CUSTOM_FIELD', 'default_value'),
  };
}
```

2. **在 `.env.example` 添加文档**：

```bash
# 自定义配置
MY_CUSTOM_FIELD=default_value
```

3. **在代码中使用**：

```astro
---
import { SITE_CONFIG } from '@config/site';
const myValue = SITE_CONFIG.myCustomField;
---
```

---

### 条件配置

根据环境变量启用/禁用功能：

```typescript
// src/lib/config/loader.ts
export function loadSiteConfig() {
  const isProduction = import.meta.env.MODE === 'production';

  return {
    // 生产环境启用评论，开发环境禁用
    comments: {
      enabled: isProduction && getEnvBoolean('COMMENTS_ENABLED', false),
      // ...
    },
  };
}
```

---

## 扩展阅读

- **[评论功能配置](./COMMENTS.md)** - Giscus 评论系统详细配置
- **[系统架构](./ARCHITECTURE.md)** - 整体设计和数据流
