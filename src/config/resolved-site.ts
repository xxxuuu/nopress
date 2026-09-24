/**
 * 站点配置解析器
 *
 * 优先级：用户配置 > Database 元数据 > 默认值
 *
 * 使用方式：
 * ```typescript
 * import { getResolvedSiteConfig } from '@config/resolved-site';
 * const config = await getResolvedSiteConfig();
 * ```
 */

import { SITE_CONFIG } from './site';
import type { SiteConfig } from './site';
import dataService from '@lib/notion/service';

/**
 * 解析后的站点配置
 *
 * 相比原始 SiteConfig：
 * - title/description/icon 经 Database 元数据回填后必有值
 * - 追加 seo（OG 图、Twitter Card 等派生信息）
 */
export type ResolvedSiteConfig = Omit<SiteConfig, 'title' | 'description' | 'icon'> & {
  title: string;
  description: string;
  icon: string;
  seo: {
    ogImage: string;
    twitterCard: string;
    twitterSite: string | undefined;
  };
};

let resolvedConfig: ResolvedSiteConfig | null = null;

/**
 * 处理站点图标
 * - URL 或本地路径：直接使用
 * - Emoji：转换为 SVG data URI
 * - 空值：返回默认值
 */
function processFavicon(icon: string | undefined): string {
  if (!icon) {
    return '/favicon.svg';
  }

  // URL 或本地路径
  if (icon.startsWith('http') || icon.startsWith('/')) {
    return icon;
  }

  // Emoji 转 SVG data URI
  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${icon}</text></svg>`;
}

/**
 * 格式化配置输出
 */
function formatConfigOutput(config: ResolvedSiteConfig, seo: ResolvedSiteConfig['seo']) {
  const output: string[] = [];

  output.push('[ResolvedConfig] ✅ Configuration resolved:');
  output.push('  Site: ' + `${config.title} | ${config.url}`);
  output.push('  Social: ' + Object.keys(config.social || {}).join(', '));
  output.push('  Settings: ' + `postsPerPage=${config.postsPerPage}, RSS=${config.enableRSS}, Sitemap=${config.enableSitemap}`);
  output.push('  Comments: ' + (config.comments.enabled
    ? `✅ ${config.comments.provider}` + (config.comments.provider === 'giscus'
      ? ` (${config.comments.giscus.repo}, ${config.comments.giscus.lang})`
      : '')
    : '❌ disabled'));
  output.push('  SEO: ' + `ogImage=${seo.ogImage ? '✅' : '❌'}, twitterCard=${seo.twitterCard}, twitterSite=${seo.twitterSite || 'N/A'}`);

  console.log(output.join('\n'));
}

/**
 * 从 Twitter URL 中提取用户名
 * @example
 * extractTwitterUsername('https://twitter.com/username') => '@username'
 * extractTwitterUsername('https://x.com/username') => '@username'
 */
function extractTwitterUsername(twitterUrl: string | undefined): string | undefined {
  if (!twitterUrl) return undefined;

  try {
    const url = new URL(twitterUrl);
    const pathname = url.pathname;
    const username = pathname.split('/').filter(Boolean)[0];
    return username ? `@${username}` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 获取解析后的站点配置
 *
 * 自动合并用户配置和 Database 元数据：
 * - title: 用户配置 || Database 名称 || ''
 * - description: 用户配置 || Database 描述 || ''
 * - icon: 用户配置 || Database 图标 || ''
 */
export async function getResolvedSiteConfig(): Promise<ResolvedSiteConfig> {
  // 返回缓存的配置
  if (resolvedConfig) {
    return resolvedConfig;
  }

  try {
    // 获取 Database 元数据
    const dbInfo = await dataService.getDatabaseInfo();

    // 合并配置（用户配置优先）
    const rawIcon = SITE_CONFIG.icon || dbInfo.icon || '';

    // 处理 Twitter 用户名
    const twitterUrl = SITE_CONFIG.social?.twitter;
    const twitterSite = extractTwitterUsername(twitterUrl);

    resolvedConfig = {
      ...SITE_CONFIG,
      title: SITE_CONFIG.title || dbInfo.title || '',
      description: SITE_CONFIG.description || dbInfo.description || '',
      icon: processFavicon(rawIcon),  // 处理图标格式
      // 添加 SEO 配置
      seo: {
        ogImage: dbInfo.coverUrl || '',  // 使用 Database 封面图，没有则为空
        twitterCard: 'summary_large_image',
        twitterSite: twitterSite || undefined,  // 使用解析的 Twitter 用户名，没有则为 undefined
      },
    };

    formatConfigOutput(resolvedConfig, resolvedConfig.seo);

    return resolvedConfig;
  } catch (error) {
    console.error('[ResolvedConfig] ❌ Failed to resolve config:', error);

    // 处理 Twitter 用户名（降级场景）
    const twitterUrl = SITE_CONFIG.social?.twitter;
    const twitterSite = extractTwitterUsername(twitterUrl);

    // 降级：使用用户配置或默认值
    resolvedConfig = {
      ...SITE_CONFIG,
      title: SITE_CONFIG.title || '',
      description: SITE_CONFIG.description || '',
      icon: processFavicon(SITE_CONFIG.icon),  // 处理图标格式
      // 添加 SEO 配置（降级场景）
      seo: {
        ogImage: '',  // 降级场景无封面图
        twitterCard: 'summary_large_image',
        twitterSite: twitterSite || undefined,  // 使用解析的 Twitter 用户名，没有则为 undefined
      },
    };

    formatConfigOutput(resolvedConfig, resolvedConfig.seo);

    return resolvedConfig;
  }
}

/**
 * 同步获取配置（用于已初始化的场景）
 *
 * 注意：必须先调用 getResolvedSiteConfig() 初始化
 */
export function getResolvedSiteConfigSync() {
  if (!resolvedConfig) {
    throw new Error(
      'Config not initialized. Call getResolvedSiteConfig() first in server-side code.',
    );
  }
  return resolvedConfig;
}
