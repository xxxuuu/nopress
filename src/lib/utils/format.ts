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
 *
 * 阅读速度参考：
 * - 中日文（汉字/假名）：475 字/分钟（平均速度）
 * - 英文：225 词/分钟（正常阅读速度）
 * - 代码：70 行/分钟（阅读代码比文本慢 2-3 倍）
 *
 * @param content 文章内容（HTML 或 Markdown）
 * @returns 阅读时间（分钟）
 */
export function calculateReadingTime(content: string): number {
  if (!content || typeof content !== 'string') {
    return 1; // 默认返回1分钟
  }

  // 提取代码块并计算行数
  const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
  const codeLines = codeBlocks.reduce((total, block) => {
    // 移除 ``` 标记后计算实际代码行数
    const code = block.replace(/^```\w*\n?/gm, '').replace(/```$/g, '');
    return total + code.split('\n').filter(line => line.trim()).length;
  }, 0);

  // 移除代码块、图片、链接等非文本内容
  const plainText = content
    .replace(/```[\s\S]*?```/g, '') // 移除代码块
    .replace(/`[^`]*`/g, '') // 移除行内代码
    .replace(/!\[.*?\]\(.*?\)/g, '') // 移除图片
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1') // 移除链接，保留文本
    .replace(/<[^>]*>/g, '') // 移除 HTML 标签
    .replace(/#+\s/g, '') // 移除标题标记
    .replace(/[*_~`|]/g, '') // 移除其他标记
    .replace(/\s+/g, ' ') // 合并空白字符
    .trim();

  // 分别计算中日文字符和英文单词
  // 中日文包括：汉字 + 平假名 + 片假名
  const cjkChars = (
    plainText.match(/[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]/g) || []
  ).length;
  const englishWords = (plainText.match(/[a-zA-Z]+/g) || []).length;

  // 计算各部分阅读时间（分钟）
  const cjkTime = cjkChars / 475; // 中日文：475 字/分钟（平均速度）
  const englishTime = englishWords / 225; // 英文：225 词/分钟
  const codeTime = codeLines / 70; // 代码：70 行/分钟

  // 总时间向上取整，最少1分钟
  const totalMinutes = Math.ceil(cjkTime + englishTime + codeTime);

  return Math.max(1, totalMinutes);
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
