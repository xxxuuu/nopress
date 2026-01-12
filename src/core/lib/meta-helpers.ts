import type { MetaConfig } from '@core/config/meta';

/**
 * 生成 canonical URL
 */
export function getCanonicalUrl(
  siteUrl: string,
  pathname: string,
): string {
  return new URL(pathname, siteUrl).href;
}

/**
 * 生成完整标题
 */
export function getFullTitle(title: string, siteName: string): string {
  return title === siteName ? title : `${title} | ${siteName}`;
}

/**
 * 生成 Open Graph 图片 URL
 */
export function getOgImageUrl(image: string, siteUrl: string): string {
  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }
  return new URL(image, siteUrl).href;
}

/**
 * 生成 meta 标签对象
 */
export interface MetaTags {
  title: string;
  description: string;
  canonical: string;
  ogType: string;
  ogUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterCard: string;
  twitterSite?: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
}

export function generateMetaTags(
  metaConfig: MetaConfig,
  pageTitle: string,
  pathname: string,
  description?: string,
): MetaTags {
  const fullTitle = getFullTitle(pageTitle, metaConfig.title);
  const canonical = getCanonicalUrl(metaConfig.siteUrl, pathname);
  const ogImageUrl = getOgImageUrl(
    metaConfig.ogImage || '/og-image.png',
    metaConfig.siteUrl,
  );

  return {
    title: fullTitle,
    description: description || metaConfig.description,
    canonical,
    ogType: metaConfig.ogType,
    ogUrl: canonical,
    ogTitle: fullTitle,
    ogDescription: description || metaConfig.description,
    ogImage: ogImageUrl,
    twitterCard: metaConfig.twitterCard,
    twitterSite: metaConfig.twitterSite,
    twitterTitle: fullTitle,
    twitterDescription: description || metaConfig.description,
    twitterImage: ogImageUrl,
  };
}
