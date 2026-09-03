/**
 * 将文本转换为 URL-safe 的 slug
 * @param text 原始文本
 * @returns URL-safe slug
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    // 替换空格为连字符
    .replace(/\s+/g, '-')
    // 移除特殊字符
    .replace(/[^\w\-\u4e00-\u9fa5]+/g, '')
    // 替换多个连字符为单个
    .replace(/\-\-+/g, '-')
    // 移除首尾的连字符
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * 检查两个 slug 是否匹配
 * @param slug1 第一个 slug
 * @param slug2 第二个 slug
 * @returns 是否匹配
 */
export function slugMatch(slug1: string, slug2: string): boolean {
  return slugify(slug1) === slugify(slug2);
}

/**
 * 检查 slug 是否可用于路由（防止破坏 URL 规则）
 * 规则与 post/[slug].astro 的路由验证保持一致
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string' || slug.length === 0) {
    return false;
  }

  // slug 不能包含斜杠（会破坏路由）
  if (slug.includes('/')) {
    return false;
  }

  // slug 不能是 URL（不能包含协议）
  if (slug.includes('://') || slug.includes('http') || slug.includes('https')) {
    return false;
  }

  // slug 不能包含特殊字符（只允许字母、数字、连字符、下划线、中文）
  if (!/^[a-zA-Z0-9\-_\u4e00-\u9fa5]+$/.test(slug)) {
    return false;
  }

  return true;
}
