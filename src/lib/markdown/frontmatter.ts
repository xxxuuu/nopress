/**
 * YAML frontmatter 生成
 * 输出字段对齐 Cloudflare Markdown for Agents 的规范（title/description/image），
 * 并补充 NoPress 结构化元数据（date/updated/tags/canonical）
 */

export interface FrontmatterData {
  title: string;
  description?: string;
  date?: string;
  updated?: string | null;
  tags?: string[];
  canonical?: string;
  image?: string;
}

/**
 * 转义 YAML 双引号字符串
 */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

/**
 * 生成 YAML frontmatter 块（含首尾 --- 分隔线）
 * 无有效字段时返回空字符串
 */
export function buildFrontmatter(data: FrontmatterData): string {
  const lines: string[] = [];

  if (data.title) lines.push(`title: ${yamlString(data.title)}`);
  if (data.description) lines.push(`description: ${yamlString(data.description)}`);
  if (data.date) lines.push(`date: ${yamlString(data.date)}`);
  if (data.updated) lines.push(`updated: ${yamlString(data.updated)}`);
  if (data.image) lines.push(`image: ${yamlString(data.image)}`);
  if (data.tags && data.tags.length > 0) {
    lines.push('tags:');
    for (const tag of data.tags) {
      lines.push(`  - ${yamlString(tag)}`);
    }
  }
  if (data.canonical) lines.push(`canonical: ${yamlString(data.canonical)}`);

  if (lines.length === 0) return '';

  return `---\n${lines.join('\n')}\n---\n`;
}
