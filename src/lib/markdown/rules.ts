/**
 * Turndown 自定义规则
 * 针对 NoPress 的 Notion HTML 输出结构，将特有块还原为原生 Markdown 语法
 *
 * 规则分三类：
 * 1. 噪音移除：HTML 特有的 UI 元素（复制按钮、灯箱包装等），Markdown 版不应保留
 * 2. 剥壳还原：公式/代码在 HTML 渲染时被包裹，此处还原为原生 Markdown 语法
 * 3. 语义映射：Markdown 无对应结构的块（callout/toggle/iframe 等），做降级表达
 */

import TurndownService from 'turndown';

type Filter = TurndownService.Filter;
type Replace = NonNullable<TurndownService.Rule['replacement']>;

/**
 * 构造「标签 + class」匹配的 filter 谓词
 * nodeName 先行短路，保证非元素节点不会走到 classList
 */
function tagWithClass(tag: string, className: string): Filter {
  return (node) =>
    node.nodeName === tag.toUpperCase() &&
    node.classList.contains(className);
}

/**
 * 将内容按行加 blockquote 前缀
 */
function toBlockquote(content: string): string {
  const body = content.trim();
  if (!body) return '';
  return '\n' + body.split('\n').map(line => `> ${line}`).join('\n') + '\n';
}

/**
 * 提取节点内第一个匹配选择器的文本
 */
function textOf(node: HTMLElement, selector: string): string {
  return (node.querySelector(selector)?.textContent || '').trim();
}

/**
 * 注册所有自定义规则（需在 gfm 插件之后调用）
 */
export function applyNotionRules(td: TurndownService): void {
  const add = (name: string, filter: Filter, replacement: Replace) =>
    td.addRule(`notion-${name}`, { filter, replacement });

  // ===== 噪音移除（HTML 特有 UI）=====

  // 代码块头部（语言标签 + 复制按钮）
  add('strip-code-header', tagWithClass('div', 'notion-code-header'), () => '');

  // 代码块复制按钮（防御性规则）
  add('strip-code-copy', tagWithClass('button', 'notion-code-copy'), () => '');

  // Callout 图标
  add('strip-callout-icon', tagWithClass('div', 'notion-callout-icon'), () => '');

  // Mention 的 favicon 图片（避免输出空 alt 图片）
  add('strip-mention-favicon', tagWithClass('img', 'notion-mention-favicon'), () => '');

  // ===== 剥壳还原（还原为原生 Markdown 语法）=====

  // 块级公式 → $$...$$（span 文本本身已含 $$ 定界符）
  add(
    'block-equation',
    tagWithClass('div', 'notion-equation-block'),
    (_content, node) => `\n\n${(node.textContent || '').trim()}\n\n`
  );

  // 行内公式 → $...$
  add(
    'inline-equation',
    tagWithClass('code', 'notion-equation'),
    (content) => `$${content.trim()}$`
  );

  // ===== 语义映射（Markdown 无对应结构的降级表达）=====

  // Callout → blockquote
  add('callout', tagWithClass('div', 'notion-callout'), (content) =>
    toBlockquote(content)
  );

  // Toggle 标题：从内容流中剔除，由 toggle 规则单独重组为粗体
  add(
    'toggle-title',
    (node) =>
      node.nodeName === 'SUMMARY' ||
      (node.nodeName === 'DIV' && node.classList.contains('notion-toggle-title')),
    () => ''
  );

  // Toggle（details 折叠形态 / 展开形态）→ 粗体标题 + 内容
  add(
    'toggle',
    (node) =>
      node.nodeName === 'DETAILS' ||
      (node.nodeName === 'DIV' && node.classList.contains('notion-toggle-expanded')),
    (content, node) => {
      const title = textOf(node, 'summary') || textOf(node, '.notion-toggle-title');
      return `\n**${title}**\n\n${content.trim()}\n`;
    }
  );

  // 代码块说明文字 → 斜体
  add('code-caption', tagWithClass('div', 'notion-code-caption'), (content) =>
    `\n*${content.trim()}*\n`
  );

  // 图片说明 → 斜体
  add('image-caption', 'figcaption', (content) => `\n*${content.trim()}*\n`);

  // 图片灯箱包装链接 → 只保留内部图片
  add('unwrap-lightbox', tagWithClass('a', 'glightbox'), (content) => content);

  // 视频文件 → 链接
  add('video', 'video', (_content, node) => {
    const src = node.querySelector('source')?.getAttribute('src') || '';
    return src ? `\n[Video](${src})\n` : '';
  });

  // iframe 嵌入（YouTube 等）→ 链接
  add('iframe', 'iframe', (_content, node) => {
    const src = node.getAttribute('src') || '';
    return src ? `\n[Embedded Video](${src})\n` : '';
  });
}

/**
 * HTML 字符串预处理
 * 在 Turndown 解析前处理无法用规则表达的结构：
 * To-do 复选框 → [x]/[ ] 文本标记，交给 turndown 内置的
 * task list 输出与嵌套列表缩进逻辑（自定义 li 规则需要自己实现缩进，得不偿失）
 */
export function preprocessHtml(html: string): string {
  return html.replace(
    // 渲染输出形如 <input type="checkbox" checked disabled /> 或 <input type="checkbox"  disabled />
    /<input type="checkbox"\s*(checked)?\s*disabled\s*\/>/g,
    (_match, checked) => `${checked ? '[x]' : '[ ]'} `
  );
}
