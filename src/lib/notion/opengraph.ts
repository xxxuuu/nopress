/**
 * Open Graph 数据获取模块
 * 使用 metascraper 从网页 URL 提取元数据
 */

import metascraper from 'metascraper';
import metascraperAuthor from 'metascraper-author';
import metascraperDate from 'metascraper-date';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperLogo from 'metascraper-logo';
import metascraperPublisher from 'metascraper-publisher';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';
import { RateLimiter } from '../utils/api-helpers';

export interface OpenGraphData {
  title: string;
  description: string;
  image: string;
  url: string;
  logo: string;
  author: string;
  publisher: string;
  date: string;
}

// 创建 metascraper 实例（带所有插件）
const scraper = metascraper([
  metascraperAuthor(),
  metascraperDate(),
  metascraperDescription(),
  metascraperImage(),
  metascraperLogo(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperUrl(),
]);

// 内存缓存：成功结果与失败结果（null）都记录，
// 避免同一 URL 在一次构建内被反复抓取（403 类必然失败、超时类大概率复现）
const cache = new Map<string, OpenGraphData | null>();

// Open Graph 专用限流器
const ogRateLimiter = new RateLimiter(20);

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
  // 检查缓存
  if (cache.has(url)) {
    return cache.get(url)!;
  }

  // 使用限流器控制请求
  const result = await ogRateLimiter.execute(async () => {
    try {
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
      const data = await scraper({ url, html, ...response });

      const ogData: OpenGraphData = {
        title: data.title || '',
        description: data.description || '',
        image: data.image || '',
        url: data.url || url,
        logo: data.logo || '',
        author: data.author || '',
        publisher: data.publisher || '',
        date: data.date || '',
      };

      // 缓存结果
      cache.set(url, ogData);

      return ogData;
    } catch (error) {
      console.warn(`[OpenGraph] Failed to fetch ${url}:`, error);
      // 失败同样记入缓存，构建内不再重试
      cache.set(url, null);
      return null;
    }
  });

  return result;
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
