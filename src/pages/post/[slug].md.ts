/**
 * 文章 Markdown 端点
 * 为每篇文章生成 /post/{slug}.md（面向 AI Agent 的 Markdown 版本）
 */

import type { APIRoute, GetStaticPaths } from 'astro';
import dataService from '@lib/notion/service';
import { isValidSlug } from '@lib/utils/slug';
import { htmlToMarkdown } from '@lib/markdown';

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await dataService.getAllPosts();

  return posts
    .filter(post => isValidSlug(post.slug))
    .map(post => ({
      params: { slug: post.slug },
      props: { post },
    }));
};

export const GET: APIRoute = async ({ props, site }) => {
  const { post } = props as { post: import('@lib/types').Post };
  const siteUrl = site?.href?.replace(/\/+$/, '') || '';

  const markdown = htmlToMarkdown(post.content, {
    siteUrl,
    frontmatter: {
      title: post.title,
      description: post.description || undefined,
      date: post.publishedAt,
      updated: post.updatedAt,
      tags: post.tags,
      image: post.coverUrl || undefined,
      canonical: siteUrl ? `${siteUrl}/post/${post.slug}` : undefined,
    },
  });

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
};
