/**
 * Markdown for Agents 转换入口
 * 将 Notion 渲染出的 HTML 转换为面向 AI Agent 的 Markdown 文档
 *
 * 输出结构（对齐 Cloudflare Markdown for Agents 规范）：
 * 1. YAML frontmatter（结构化元数据）
 * 2. 正文 Markdown（公式/代码块/表格等还原为原生语法）
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { applyNotionRules, preprocessHtml } from './rules';
import { buildFrontmatter, type FrontmatterData } from './frontmatter';

export { buildFrontmatter, type FrontmatterData } from './frontmatter';

export interface HtmlToMarkdownOptions {
  /** 站点根 URL（用于相对链接绝对化），如 https://example.com */
  siteUrl?: string;
  /** frontmatter 元数据，不传则不生成 */
  frontmatter?: FrontmatterData;
}

/**
 * 创建配置好的 Turndown 实例
 */
function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    // Notion 富文本中的软换行（<br>）折叠为空格
    br: ' ',
  });

  // GFM：表格 / 删除线 / 任务列表
  gfm(td);

  // NoPress 的 Notion HTML 结构规则
  applyNotionRules(td);

  return td;
}

/**
 * 将相对 URL 转为绝对 URL
 * Agent 在脱离站点上下文时，相对路径无法解析
 */
function absolutizeUrls(markdown: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, '');
  // 匹配 [text](url) 与 ![alt](url) 中以 / 开头的链接
  return markdown.replace(
    /(!?\[[^\]]*\])\((\/[^)\s]*)\)/g,
    (_match, prefix: string, path: string) => `${prefix}(${base}${path})`
  );
}

/**
 * 将 HTML 内容转换为完整 Markdown 文档（frontmatter + 正文）
 */
export function htmlToMarkdown(html: string, options: HtmlToMarkdownOptions = {}): string {
  const td = createTurndown();

  let body: string;
  try {
    body = td.turndown(preprocessHtml(html));
  } catch (error) {
    console.error('[Markdown] Failed to convert HTML to markdown:', error);
    body = '';
  }

  body = body.trim();

  // 清理仅含空白的行（空段落 <p><br></p> 的残留）
  body = body.replace(/^[ \t]+$/gm, '');

  if (options.siteUrl) {
    body = absolutizeUrls(body, options.siteUrl);
  }

  const frontmatter = options.frontmatter ? buildFrontmatter(options.frontmatter) : '';

  return frontmatter ? `${frontmatter}\n${body}\n` : `${body}\n`;
}
