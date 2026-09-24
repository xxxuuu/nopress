/**
 * Rich Text 渲染器
 * 处理 Notion 的富文本格式：粗体、斜体、颜色、链接等
 */

import type { RichTextItemResponse } from '@notionhq/client/build/src/api-endpoints';
import type { NotionColor } from './types';
import { fetchOpenGraphData } from '../opengraph';

/**
 * 渲染 RichText 数组为 HTML
 */
export async function renderRichText(richTexts: RichTextItemResponse[]): Promise<string> {
  if (!richTexts || richTexts.length === 0) return '';

  const results = await Promise.all(richTexts.map(rt => renderSingleRichText(rt)));
  return results.join('');
}

/**
 * 渲染 RichText 数组为文本
 */
export function renderPlainText(richTexts: RichTextItemResponse[]): string {
  if (!richTexts || richTexts.length === 0) return '';

  return richTexts[0].plain_text
}

/**
 * 渲染单个 RichText 对象
 */
async function renderSingleRichText(richText: RichTextItemResponse): Promise<string> {
  // 处理不同类型的 RichText
  let text = '';

  if (richText.type === 'text') {
    text = richText.text.content;

    // 处理链接
    if (richText.text.link) {
      const url = richText.text.link.url;
      text = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text).replace(/\n/g, '<br>')}</a>`;
    } else {
      text = escapeHtml(text).replace(/\n/g, '<br>');
    }
  } else if (richText.type === 'mention') {
    // 处理 @mention
    text = await renderMention(richText as any);
  } else if (richText.type === 'equation') {
    // 处理行内公式
    // 需要 HTML 转义：LaTeX 字面 <、& 会破坏 HTML 结构；
    // 浏览器 textContent 解码后仍是原始字符，KaTeX 渲染不受影响
    text = `<code class="notion-equation">${escapeHtml(richText.equation.expression)}</code>`;
  }

  // 应用注释（annotations）
  const annotations = richText.annotations;

  if (annotations.bold) text = `<strong>${text}</strong>`;
  if (annotations.italic) text = `<em>${text}</em>`;
  if (annotations.strikethrough) text = `<del>${text}</del>`;
  if (annotations.underline) text = `<u>${text}</u>`;
  if (annotations.code) text = `<code>${text}</code>`;

  // 应用颜色
  if (annotations.color !== 'default') {
    const colorClass = getColorClass(annotations.color as NotionColor);
    text = `<span class="${colorClass}">${text}</span>`;
  }

  return text;
}

/**
 * 渲染 Mention
 */
async function renderMention(richText: any): Promise<string> {
  const mention = richText.mention;
  const href = richText.href;
  const plainText = richText.plain_text || '';

  // 如果没有 mention 数据，使用 plain_text 作为后备
  if (!mention) {
    if (!plainText) {
      // 无数据的 mention，可能是权限问题或已删除的链接
      return `<span class="notion-mention notion-mention-empty">
        <span class="notion-mention-icon">❓</span>
        <span class="notion-mention-text">Unknown Mention</span>
      </span>`;
    }
    return `<span class="notion-mention">
      <span class="notion-mention-icon">💬</span>
      <span class="notion-mention-text">${escapeHtml(plainText)}</span>
    </span>`;
  }

  let icon = '';
  let displayText = plainText;

  switch (mention.type) {
    case 'page':
      // 页面 mention - 显示页面图标和标题
      icon = '📄';
      break;

    case 'database':
      // 数据库 mention - 显示数据库图标和标题
      icon = '🗄️';
      break;

    case 'user':
      // 用户 mention - 显示 @ 图标和用户名
      icon = '@';
      break;

    case 'date':
      // 日期 mention - 显示日历图标和日期
      icon = '📅';
      if (mention.date) {
        displayText = mention.date.start;
        if (mention.date.end) {
          displayText += ` → ${mention.date.end}`;
        }
      }
      break;

    case 'link_mention':
      // 链接 mention - 使用 Open Graph 数据
      ({ icon, displayText } = await renderLinkMention(mention.link_mention, plainText));
      break;

    case 'link_preview':
      // 链接 preview - 使用 Open Graph 数据
      ({ icon, displayText } = await renderLinkPreview(mention.link_preview, plainText));
      break;

    default:
      // 未知类型，使用默认图标
      icon = '💬';
  }

  // 如果 displayText 为空，使用 mention 类型作为后备
  if (!displayText) {
    displayText = mention.type || 'mention';
  }

  // 如果有有效链接，渲染为可点击的链接
  if (href && href !== '#' && href.trim() !== '') {
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="notion-mention">
      <span class="notion-mention-icon">${icon}</span>
      <span class="notion-mention-text">${escapeHtml(displayText)}</span>
    </a>`;
  }

  // 否则渲染为普通 span
  return `<span class="notion-mention">
    <span class="notion-mention-icon">${icon}</span>
    <span class="notion-mention-text">${escapeHtml(displayText)}</span>
  </span>`;
}

/**
 * 渲染链接 mention（使用 Open Graph 数据）
 */
async function renderLinkMention(
  linkMention: any,
  plainText: string
): Promise<{ icon: string; displayText: string }> {
  if (!linkMention?.href) {
    return { icon: '🔗', displayText: plainText };
  }

  const urlObj = new URL(linkMention.href);

  // GitHub 特殊处理：只显示仓库名（owner/repo 格式）
  if (urlObj.hostname === 'github.com' || urlObj.hostname === 'www.github.com') {
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts[1];
      const displayText = `${owner}/${repo}`;

      // 使用 GitHub favicon
      const faviconUrl = 'https://github.githubassets.com/favicons/favicon.svg';
      const icon = `<img src="${faviconUrl}" alt="" class="notion-mention-favicon" loading="lazy" onerror="this.style.display='none'" />`;

      return { icon, displayText };
    }
  }

  // 其他链接使用 Open Graph 数据
  try {
    const ogData = await fetchOpenGraphData(linkMention.href);

    // 优先使用 og:title，其次用 mention.title，最后用域名
    const displayText = ogData?.title || linkMention.title || urlObj.hostname.replace(/^www\./, '');

    // 优先使用 og:logo，其次用 Google Favicon
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=16`;
    const icon = ogData?.logo
      ? `<img src="${ogData.logo}" alt="" class="notion-mention-favicon" loading="lazy" onerror="this.style.display='none'" />`
      : `<img src="${faviconUrl}" alt="" class="notion-mention-favicon" loading="lazy" onerror="this.style.display='none'" />`;

    return { icon, displayText };
  } catch {
    // Open Graph 获取失败，使用 favicon 作为后备
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=16`;
    const displayText = linkMention.title || urlObj.hostname.replace(/^www\./, '') || linkMention.href;
    const icon = `<img src="${faviconUrl}" alt="" class="notion-mention-favicon" loading="lazy" onerror="this.style.display='none'" />`;

    return { icon, displayText };
  }
}

/**
 * 渲染链接 preview（使用 Open Graph 数据）
 */
async function renderLinkPreview(
  linkPreview: any,
  plainText: string
): Promise<{ icon: string; displayText: string }> {
  if (!linkPreview?.url) {
    return { icon: '🔗', displayText: plainText };
  }

  try {
    const urlObj = new URL(linkPreview.url);

    // GitHub 特殊处理：只显示仓库名（owner/repo 格式）
    const githubRepoName = extractGitHubRepoName(linkPreview.url);
    if (githubRepoName) {
      const faviconUrl = 'https://github.githubassets.com/favicons/favicon.svg';
      const icon = `<img src="${faviconUrl}" alt="" class="notion-mention-favicon" loading="lazy" onerror="this.style.display='none'" />`;
      return { icon, displayText: githubRepoName };
    }

    const ogData = await fetchOpenGraphData(linkPreview.url);

    // 优先使用 og:title，其次提取域名
    let displayText = plainText;
    if (ogData?.title) {
      displayText = ogData.title;
    } else if (displayText === linkPreview.url) {
      displayText = urlObj.hostname.replace(/^www\./, '');
    }

    // 优先使用 og:logo，其次用 Google Favicon
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=16`;
    const icon = ogData?.logo
      ? `<img src="${ogData.logo}" alt="" class="notion-mention-favicon" loading="lazy" onerror="this.style.display='none'" />`
      : `<img src="${faviconUrl}" alt="" class="notion-mention-favicon" loading="lazy" onerror="this.style.display='none'" />`;

    return { icon, displayText };
  } catch {
    // Open Graph 获取失败，使用 favicon 作为后备
    const urlObj = new URL(linkPreview.url);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=16`;

    let displayText = plainText;
    if (displayText === linkPreview.url) {
      displayText = urlObj.hostname.replace(/^www\./, '');
    }

    const icon = `<img src="${faviconUrl}" alt="" class="notion-mention-favicon" loading="lazy" onerror="this.style.display='none'" />`;

    return { icon, displayText };
  }
}

/**
 * 从 URL 提取 GitHub 仓库名（owner/repo 格式）
 * 如果不是 GitHub URL，返回 null
 */
function extractGitHubRepoName(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'github.com' || urlObj.hostname === 'www.github.com') {
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        return `${pathParts[0]}/${pathParts[1]}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 获取颜色的 CSS 类名
 */
function getColorClass(color: NotionColor): string {
  return `notion-${color.replace('_', '-')}`;
}

/**
 * 转义 HTML 特殊字符
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, char => map[char]);
}

/**
 * 提取纯文本（用于 alt、title 等属性）
 */
export function extractPlainText(richTexts: RichTextItemResponse[]): string {
  if (!richTexts || richTexts.length === 0) return '';
  return richTexts.map(rt => rt.plain_text).join('');
}
