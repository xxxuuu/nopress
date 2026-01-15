import rss from '@astrojs/rss';
import { getResolvedSiteConfig } from '@config/resolved-site';
import dataService from '@lib/data';

export async function GET(context) {
  // 获取解析后的站点配置
  const SITE_CONFIG = await getResolvedSiteConfig();

  // 从 dataService 获取所有文章（自动使用缓存）
  const allPosts = await dataService.getAllPosts();

  // 取最近 10 篇文章
  const recentPosts = allPosts.slice(0, 10);

  // 构建 RSS feed
  return rss({
    // Feed 基本信息
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    site: context.site,

    // 转换 Post 数据为 RSS item
    items: recentPosts.map((post) => ({
      title: post.title,
      link: `/post/${post.slug}`,
      pubDate: new Date(post.publishedAt),
      description: post.description,
      content: post.content, // 完整 HTML 内容
      categories: post.tags,
    })),

    // RSS 配置
    trailingSlash: false,
    customData: `<language>zh-CN</language>`,
  });
}
