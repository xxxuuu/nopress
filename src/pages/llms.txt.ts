/**
 * llms.txt 站点索引端点
 * 为 AI Agent 提供全站内容发现入口（https://llmstxt.org 规范）
 */

import type { APIRoute } from 'astro';
import { getResolvedSiteConfig } from '@config/resolved-site';
import dataService from '@lib/notion/service';
import { isValidSlug } from '@lib/utils/slug';

export const GET: APIRoute = async ({ site }) => {
  const siteUrl = site?.href?.replace(/\/+$/, '') || '';
  const SITE_CONFIG = await getResolvedSiteConfig();

  const [posts, pages] = await Promise.all([
    dataService.getAllPosts(),
    dataService.getAllPages(),
  ]);

  const siteTitle = SITE_CONFIG?.title ?? 'Untitled Site';
  const siteDescription = SITE_CONFIG?.description ?? '';

  const sections: string[] = [];

  sections.push(`# ${siteTitle}`);
  sections.push('');
  sections.push(`> ${siteDescription}`);

  const postLines = posts
    .filter(post => isValidSlug(post.slug))
    .map(post => {
      const mdUrl = siteUrl ? `${siteUrl}/post/${post.slug}.md` : `/post/${post.slug}.md`;
      const summary = post.description ? `: ${post.description.replace(/\r?\n/g, ' ')}` : '';
      return `- [${post.title}](${mdUrl})${summary}`;
    });

  if (postLines.length > 0) {
    sections.push('', '## Posts', '', ...postLines);
  }

  const pageLines = pages
    .filter(page => isValidSlug(page.slug))
    .map(page => {
      const mdUrl = siteUrl ? `${siteUrl}/${page.slug}.md` : `/${page.slug}.md`;
      const summary = page.description ? `: ${page.description.replace(/\r?\n/g, ' ')}` : '';
      return `- [${page.title}](${mdUrl})${summary}`;
    });

  if (pageLines.length > 0) {
    sections.push('', '## Pages', '', ...pageLines);
  }

  return new Response(sections.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
