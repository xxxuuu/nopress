# NoPress 用户指南

## 一、搭好你的博客

### 第 1 步：准备 Notion

1. **复制内容数据库**：打开 [Example Database](https://xxuuu.notion.site/a6d887563979827fb7d601c96daa2b11)，点右上角 **Duplicate** 复制到自己的工作区；也可以手动新建 Database 并添加这些列（**列名必须全部小写**）：

   | 列名 | 类型 | 说明 |
   |------|------|------|
   | title | Title | 文章标题 |
   | type | Select | 填 `Post`（文章）/ `Page`（独立页面）/ `Menu`（导航菜单） |
   | status | Select | 填 `Published` 才会显示，`Draft` 不显示 |
   | slug | Text | 链接地址，如 `hello-world` |
   | summary | Text | 摘要 |
   | date | Date | 发布日期 |
   | tags | Multi-select | 标签（可选） |

2. **复制 Database ID**：用浏览器打开这个 Database 页面，从地址栏复制：

   ```
   https://www.notion.so/workspace/{database_id}
                                    ^^^^^^^^^^^^
   ```

3. **创建 Integration Token**：

   1. 打开 [Notion Integrations](https://www.notion.so/my-integrations)，点 **+ New integration**
   2. **内容访问权限**里选择第 1 步的 Database 页面（也可以之后再在 Database 页面右上角 **··· → Connections** 里添加）
   3. 提交后复制页面上显示的 **Token**（`secret_` 或 `ntn_` 开头）

   不做这一步的话，博客读不到 Database 里的内容。

### 第 2 步：部署

1. 把 [NoPress 仓库](https://github.com/xxxuuu/nopress) **Fork** 到你的 GitHub 账号（或用 Use this template）
2. 打开 [Vercel](https://vercel.com)（免费），**Add New → Project**，导入你刚 Fork 的仓库
3. 在 **Environment Variables** 里添加两条：

   | 名称 | 值 |
   |------|-----|
   | `NOTION_TOKEN` | 第 1 步复制的 Token |
   | `NOTION_DATABASE_ID` | 第 1 步复制的 Database ID |

4. 点 **Deploy**，几十秒后你的博客就上线了

Netlify 等其它平台同理：导入仓库 + 配这两个变量即可。

## 二、日常写作

**写博客 = 在 Notion Database 里加一行 + 写页面内容**，然后执行部署（也可以配置成自动部署，见[第五章](#五可选notion-更新自动部署)）。

| 我想…… | 在 Notion 里怎么做 |
|---------|-------------------|
| 发文章 | 加一行：`type` 选 `Post`、`status` 选 `Published`、填好 `slug` 和 `date`，页面里正常写内容 |
| 存草稿 | `status` 选 `Draft`，博客上不会出现 |
| 改文章 | 直接改 Notion 页面内容，改完触发一次部署 |
| 加"关于"页 | 加一行 `type` 选 `Page`，`slug` 填 `about`——访问地址就是 `/about` |
| 加导航菜单 | 加一行 `type` 选 `Menu`：`slug` 填站内地址（如 `/about`）或完整网址（如 `https://github.com/你`） |

## 三、站点设置

| 我想改…… | 怎么做 |
|----------|--------|
| 站点名称 / 图标 / 描述 | 在托管平台的环境变量里设 `SITE_TITLE` / `SITE_ICON` / `SITE_DESCRIPTION`（留空则自动使用 Notion Database 的名称和图标） |
| 评论开关与配置 | 见 [评论配置指南](./COMMENTS.md) |
| 每页文章数、RSS 开关 | 环境变量 `SITE_POSTS_PER_PAGE` / `SITE_ENABLE_RSS`（完整清单见 [配置参考](./CONFIGURATION.md)） |
| 网站地址 | 环境变量 `SITE_URL`（绑定自己的域名后设置） |

## 四、换主题

NoPress 内置三套主题，**换主题只需要设置一个环境变量**（在托管平台的环境变量里添加 `NOPRESS_THEME`）：

| 值 | 风格 |
|----|------|
| `default` | Notion 风格全功能主题：标签、归档、分页、目录、评论（默认） |
| `minimal` | 极简白净风格 |
| `terminal` | 绿字黑底终端风 |

设置后重新部署生效。

### 主题选项

部分主题支持进一步定制，通过环境变量 `NOPRESS_THEME_OPTIONS` 传递，格式是一段 JSON：

```text
NOPRESS_THEME_OPTIONS = {"footerText": "欢迎留言", "showReadingTime": false}
```

各主题支持哪些选项：

- **default**：`darkMode`（深色模式开关）、`showPostCover`（文章封面）、`showReadingTime`（阅读时长）
- **minimal**：`darkMode`、`footerText`（页脚文字）、`showPostMeta`（文章元信息）
- **terminal**：`promptSymbol`（终端提示符符号）、`showScanlines`（扫描线质感）

完整的选项机制说明见 [主题文档](./THEMES.md)。

## 五、（可选）Notion 更新自动部署

博客是构建时从 Notion 拉取内容生成的静态页面，改完 Notion 要重新部署才能看到效果。Notion 数据库的**自动化**功能能在数据库变动时向指定网址发通知（`发送 webhook` 操作需要 Notion 商业版或教育版），配合 Vercel 的 **Deploy Hook** 可实现文章更新自动部署。

### 第 1 步：创建 Deploy Hook

1. 打开 Vercel 项目的 **Settings → Git → Deploy Hooks**
2. NAME 填 `notion`，GIT BRANCH 填博客仓库的分支（一般是 `main`），点 **Create Hook**
3. 复制生成的网址（形如 `https://api.vercel.com/v1/integrations/deploy/…`）——它相当于部署开关，**不要公开**

### 第 2 步：在 Notion 数据库里建自动化

1. 打开内容 Database，点右上角 **⚡ → 新建自动化**
3. 点击 **添加触发器 → 属性 `status`**，值只勾选 `Published`
3. 点 **新操作 → 发送 webhook**，粘贴第 1 步的网址

此时文章将在 `status` 被改为 `Published` 时自动触发 Vercel 部署

