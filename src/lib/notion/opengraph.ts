/**
 * Open Graph 数据获取模块
 * 使用 metascraper 从网页 URL 提取元数据
 */

import metascraper from 'metascraper';
import metascraperAuthor from 'metascraper-author';
import metascraperDate from 'metascraper-date';
import metascraperDescription from 'metascraper-description';
import metascraperLogo from 'metascraper-logo';
import metascraperPublisher from 'metascraper-publisher';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';
import path from 'node:path';
import { RateLimiter, RetryHelper } from '../utils/api-helpers';
import { FileCache } from '../cache/file-cache';

export interface OpenGraphData {
  title: string;
  description: string;
  /** 页面显式声明的预览图（og:image / twitter:image），无则空串 */
  image: string;
  url: string;
  logo: string;
  author: string;
  publisher: string;
  date: string;
}

// 创建 metascraper 实例（带所有插件）
// 注意：不用 metascraper-image——它在 og:image 缺失时会降级抓页面上任意 <img>，
// 导致 favicon/logo 被当成预览图；预览图改由 extractPreviewImage 严格提取
const scraper = metascraper([
  metascraperAuthor(),
  metascraperDate(),
  metascraperDescription(),
  metascraperLogo(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperUrl(),
]);

// 预览图 meta 候选，按优先级排列
const PREVIEW_IMAGE_KEYS = [
  'og:image:secure_url',
  'og:image:url',
  'og:image',
  'twitter:image:src',
  'twitter:image',
] as const;

// 仅重试瞬态失败（超时/网络抖动/限流/5xx）；403、404 等确定性失败不重试
const ogRetry = new RetryHelper({
  maxRetries: 1,
  initialDelay: 500,
  shouldRetry: (error: Error) =>
    /timeout|aborted/i.test(error.message) ||
    /fetch failed|ECONNRESET|network/i.test(error.message) ||
    /\b429\b/.test(error.message) ||
    /\b5\d{2}\b/.test(error.message),
});

/**
 * 从 HTML 中严格提取站点显式声明的预览图（og:image / twitter:image）。
 * 相对路径会基于最终 URL（跟随重定向后）解析为绝对地址。
 */
function extractPreviewImage(html: string, baseUrl: string): string {
  const candidates = new Map<string, string>();
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs.set(m[1].toLowerCase(), m[2] ?? m[3]);
    }
    const key = attrs.get('property') ?? attrs.get('name');
    if (key && attrs.get('content') && !candidates.has(key.toLowerCase())) {
      candidates.set(key.toLowerCase(), attrs.get('content')!);
    }
  }
  for (const key of PREVIEW_IMAGE_KEYS) {
    const raw = candidates.get(key);
    if (!raw) continue;
    try {
      return new URL(raw, baseUrl).toString();
    } catch {
      // 非法 URL，尝试下一个候选
    }
  }
  return '';
}

// metascraper-logo 只认 og:logo / JSON-LD，不读 <link rel="icon">，
// favicon 需按此优先级自行提取（apple-touch-icon 尺寸最大、质量最好）
const FAVICON_RELS = [
  'apple-touch-icon',
  'apple-touch-icon-precomposed',
  'icon',
  'shortcut icon',
] as const;

/**
 * 从 HTML <link> 中提取站点图标，相对路径基于最终 URL 解析为绝对地址。
 */
function extractFavicon(html: string, baseUrl: string): string {
  const links = new Map<string, string>();
  for (const tag of html.match(/<link\s[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs.set(m[1].toLowerCase(), m[2] ?? m[3]);
    }
    const rel = attrs.get('rel')?.toLowerCase();
    const href = attrs.get('href');
    if (rel && href && !links.has(rel)) {
      links.set(rel, href);
    }
  }
  for (const rel of FAVICON_RELS) {
    const href = links.get(rel);
    if (!href) continue;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      // 非法 URL，尝试下一个候选
    }
  }
  return '';
}

// 内存缓存：成功结果与失败结果（null）都记录，
// 避免同一 URL 在一次构建内被反复抓取（403 类必然失败、超时类大概率复现）
const cache = new Map<string, OpenGraphData | null>();

// Open Graph 专用限流器
const ogRateLimiter = new RateLimiter(20);

// OG 结果持久化到磁盘，跨构建复用：外部网站抓取是构建期最不可靠的一环，
// 成功结果 7 天内不重新抓取；失败只进内存缓存，下次构建自动重试
const diskCache = new FileCache({
  cacheDir: path.join(process.cwd(), '.cache', 'opengraph'),
  defaultTTL: 7 * 24 * 60 * 60 * 1000,
  namespace: 'opengraph',
});

/**
 * 从 URL 获取 Open Graph 数据
 * @param url - 目标 URL
 * @param fetchFn - fetch 函数（可选，用于测试或自定义）
 * @returns Open Graph 数据，失败返回 null
 */
export async function fetchOpenGraphData(
  url: string,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<OpenGraphData | null> {
  // 检查内存缓存
  if (cache.has(url)) {
    return cache.get(url)!;
  }

  // 检查磁盘缓存（跨构建）
  const cached = await diskCache.get<OpenGraphData>(url);
  if (cached) {
    cache.set(url, cached);
    return cached;
  }

  // Retry 包在限流器外层：退避等待期间释放并发槽，不阻塞其他 URL 的抓取
  try {
    const fetched = await ogRetry.execute(() =>
      ogRateLimiter.execute(async () => {
        const response = await fetchFn(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const data = await scraper({ url, html });
        return { data, html, baseUrl: response.url || url };
      })
    );

    const { data, html, baseUrl } = fetched;
    const ogData: OpenGraphData = {
      title: data.title || '',
      description: data.description || '',
      image: extractPreviewImage(html, baseUrl),
      url: data.url || url,
      logo: data.logo || extractFavicon(html, baseUrl),
      author: data.author || '',
      publisher: data.publisher || '',
      date: data.date || '',
    };

    // 缓存结果（内存 + 磁盘）
    cache.set(url, ogData);
    await diskCache.set(url, ogData);

    return ogData;
  } catch (error) {
    console.warn(`[OpenGraph] Failed to fetch ${url}:`, error);
    // 失败仅记入内存缓存，下次构建重试
    cache.set(url, null);
    return null;
  }
}

/**
 * 清空缓存
 */
export function clearOpenGraphCache(): void {
  cache.clear();
}

/**
 * 获取缓存统计信息
 */
export function getOpenGraphCacheStats(): { size: number; urls: string[] } {
  return {
    size: cache.size,
    urls: Array.from(cache.keys()),
  };
}
