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
