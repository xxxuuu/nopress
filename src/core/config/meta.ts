import { z } from 'zod';

/**
 * 元信息配置 Schema
 */
export const MetaConfigSchema = z.object({
  // SEO 基础信息
  title: z.string(),
  description: z.string(),
  siteUrl: z.string().url(),
  language: z.string().default('zh-CN'),

  // Open Graph
  ogType: z.string().default('website'),
  ogImage: z.string().optional(),
  twitterCard: z.string().default('summary_large_image'),
  twitterSite: z.string().optional(),

  // 深色模式
  darkMode: z.boolean().default(true),

  // RSS
  enableRSS: z.boolean().default(true),
  rssUrl: z.string().default('/feed.xml'),
});

export type MetaConfig = z.infer<typeof MetaConfigSchema>;

/**
 * 默认元信息配置
 */
export const DEFAULT_META_CONFIG: MetaConfig = {
  title: 'My Blog',
  description: '基于 NoPress 构建的个人博客',
  siteUrl: 'http://localhost:4321',
  language: 'zh-CN',
  ogType: 'website',
  ogImage: '/og-image.png',
  twitterCard: 'summary_large_image',
  twitterSite: '@username',
  darkMode: true,
  enableRSS: true,
  rssUrl: '/feed.xml',
};

/**
 * 获取元信息配置（从 SITE_CONFIG 覆盖默认值）
 */
export function getMetaConfig(siteConfig: any): MetaConfig {
  return {
    ...DEFAULT_META_CONFIG,
    title: siteConfig.title || DEFAULT_META_CONFIG.title,
    description: siteConfig.description || DEFAULT_META_CONFIG.description,
    siteUrl: siteConfig.url || DEFAULT_META_CONFIG.siteUrl,
    language: siteConfig.language || DEFAULT_META_CONFIG.language,
    ogImage: siteConfig.seo?.ogImage || DEFAULT_META_CONFIG.ogImage,
    twitterCard: siteConfig.seo?.twitterCard || DEFAULT_META_CONFIG.twitterCard,
    twitterSite: siteConfig.seo?.twitterSite || DEFAULT_META_CONFIG.twitterSite,
  };
}
