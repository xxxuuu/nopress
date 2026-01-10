/**
 * 截断文本到指定长度
 * @param text 原始文本
 * @param length 最大长度
 * @param suffix 后缀，默认为 '...'
 * @returns 截断后的文本
 */
export function truncate(text: string, length: number, suffix: string = '...'): string {
  if (text.length <= length) {
    return text;
  }
  return text.substring(0, length).trim() + suffix;
}

/**
 * 计算阅读时间（分钟）
 * @param content 文章内容
 * @param wordsPerMinute 每分钟阅读字数，默认 200
 * @returns 阅读时间（分钟）
 */
export function calculateReadingTime(content: string, wordsPerMinute: number = 200): number {
  if (!content || typeof content !== 'string') {
    return 1; // 默认返回1分钟
  }

  // 移除 Markdown 语法
  const plainText = content
    .replace(/```[\s\S]*?```/g, '') // 移除代码块
    .replace(/`[^`]*`/g, '') // 移除行内代码
    .replace(/!\[.*?\]\(.*?\)/g, '') // 移除图片
    .replace(/\[.*?\]\(.*?\)/g, '') // 移除链接
    .replace(/#+\s/g, '') // 移除标题标记
    .replace(/[*_~`]/g, '') // 移除其他标记
    .replace(/\n/g, ' '); // 替换换行为空格

  // 中文按字符计数，英文按单词计数
  const chineseChars = plainText.match(/[\u4e00-\u9fa5]/g) || [];
  const englishWords = plainText.match(/[a-zA-Z]+/g) || [];

  const totalWords = chineseChars.length + englishWords.length;
  const minutes = Math.ceil(totalWords / wordsPerMinute);

  return Math.max(1, minutes); // 至少1分钟
}

/**
 * 从 HTML 或 Markdown 提取纯文本
 * @param content 内容
 * @returns 纯文本
 */
export function extractPlainText(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  return content
    .replace(/<[^>]*>/g, '') // 移除 HTML 标签
    .replace(/```[\s\S]*?```/g, '') // 移除代码块
    .replace(/`[^`]*`/g, '') // 移除行内代码
    .replace(/!\[.*?\]\(.*?\)/g, '') // 移除图片
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1') // 移除链接，保留文本
    .replace(/#+\s/g, '') // 移除标题标记
    .replace(/[*_~]/g, '') // 移除其他标记
    .replace(/\s+/g, ' ') // 合并空格
    .trim();
}

/**
 * 生成文章摘要
 * @param content 文章内容
 * @param maxLength 最大长度，默认 200
 * @returns 摘要
 */
export function generateExcerpt(content: string, maxLength: number = 200): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  const plainText = extractPlainText(content);
  return truncate(plainText, maxLength);
}
