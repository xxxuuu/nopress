/**
 * 独立页面 Markdown 端点
 * 为每个 type=Page 的页面生成 /{slug}.md（面向 AI Agent 的 Markdown 版本）
 */

import type { APIRoute, GetStaticPaths } from 'astro';
import dataService from '@lib/notion/service';
import { isValidSlug } from '@lib/utils/slug';
import { htmlToMarkdown } from '@lib/markdown';

export const getStaticPaths: GetStaticPaths = async () => {
  const pages = await dataService.getAllPages();

  return pages
    .filter(page => isValidSlug(page.slug))
    .map(page => ({
      params: { slug: page.slug },
      props: { page },
    }));
};

export const GET: APIRoute = async ({ props, site }) => {
  const { page } = props as { page: import('@lib/types').Post };
  const siteUrl = site?.href?.replace(/\/+$/, '') || '';

  const markdown = htmlToMarkdown(page.content, {
    siteUrl,
    frontmatter: {
      title: page.title,
      description: page.description || undefined,
      date: page.publishedAt,
      updated: page.updatedAt,
      tags: page.tags,
      image: page.coverUrl || undefined,
      canonical: siteUrl ? `${siteUrl}/${page.slug}` : undefined,
    },
  });

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
};
