/**
 * Notion 图片 URL 映射工具
 * 将临时 URL 转换为永久 URL
 */

const NOTION_HOST = 'https://www.notion.so';

/**
 * 判断 URL 是否需要转换
 */
function needsConversion(url: string, type: string): boolean {
  // 已经是 notion.so/image 格式的不需要再转换
  if (url.startsWith(`${NOTION_HOST}/image`)) {
    return false;
  }

  // 已经是 notion.site/images 格式的不需要转换
  if (url.includes('notion.site/images/page-cover/')) {
    return false;
  }

  // 需要转换的 URL 类型：
  // 1. AWS secure storage
  if (url.includes('secure.notion-static.com')) {
    return true;
  }

  // 2. Production secure files
  if (url.includes('prod-files-secure')) {
    return true;
  }

  // 3. Bookmark 类型的外部图片
  if (type === 'bookmark' && url.startsWith('http')) {
    return true;
  }

  // 4. Notion 内部相对路径（以 / 开头）
  if (url.startsWith('/')) {
    return true;
  }

  return false;
}

/**
 * 将图片 URL 映射为永久 URL
 * @param url 原始 URL
 * @param block Notion block 对象
 * @returns 转换后的永久 URL
 */
export function mapImageUrl(url: string, block?: any): string {
  if (!url) return '';

  const blockId = block?.id || '';
  const blockType = block?.type || 'block';

  // 处理相对路径
  if (url.startsWith('/') && !url.startsWith('//')) {
    return `${NOTION_HOST}${url}`;
  }

  // 检查是否需要转换
  if (!needsConversion(url, blockType)) {
    return url;
  }

  // 转换为 Notion 代理 URL
  try {
    const encodedUrl = encodeURIComponent(url);

    // 根据类型决定 table 参数
    const table = blockType === 'collection' ? 'collection' : 'block';

    // 使用 Notion 的图片代理，这样可以避免临时 URL 过期
    return `${NOTION_HOST}/image/${encodedUrl}?table=${table}&id=${blockId}`;
  } catch (error) {
    console.warn('Failed to encode image URL:', url, error);
    return url;
  }
}

/**
 * 压缩图片 URL（可选的优化）
 * @param url 图片 URL
 * @param width 目标宽度
 * @returns 优化后的 URL
 */
export function compressImage(url: string, width?: number): string {
  if (!url) return '';

  // SVG 不压缩
  if (url.endsWith('.svg')) {
    return url;
  }

  // Notion CDN 图片
  if (url.includes('notion.so/image')) {
    const separator = url.includes('?') ? '&' : '?';
    const widthParam = width ? `&width=${width}` : '';
    return `${url}${separator}cache=v2${widthParam}`;
  }

  // Unsplash 图片
  if (url.includes('images.unsplash.com')) {
    const separator = url.includes('?') ? '&' : '?';
    const widthParam = width ? `&w=${width}` : '&w=1200';
    return `${url}${separator}q=80&fm=webp${widthParam}`;
  }

  // 自定义图床或其他外部 URL 不处理
  return url;
}

/**
 * 判断是否为 emoji
 */
export function isEmoji(str: string): boolean {
  if (!str) return false;
  // Unicode emoji 范围
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  return emojiRegex.test(str);
}
