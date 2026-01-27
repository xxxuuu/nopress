/**
 * Notion Block 渲染器
 * 支持所有 Notion 块类型
 */

import type { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import type { RenderContext, RenderOptions, BlockFormat } from './types';
import { renderRichText, extractPlainText, escapeHtml, renderPlainText } from './rich-text';
import { mapImageUrl, compressImage } from '../map-image-url';
import { fetchOpenGraphData } from '../opengraph';

export class NotionBlockRenderer {
  private options: Required<RenderOptions>;
  private fetchChildBlocks: (blockId: string) => Promise<BlockObjectResponse[]>;
  private getBlockFormat: (blockId: string) => BlockFormat;
  private getSignedUrl: (blockId: string) => string | null;
  private databaseRenderer: (block: BlockObjectResponse) => Promise<string>;
  private fetchSyncedBlockContent: (blockId: string) => Promise<BlockObjectResponse[]>;


  constructor(options: RenderOptions = {}) {
    this.options = {
      enableToggle: true,
      lazyLoadImages: true,
      imageMaxWidth: 0,
      ...options,
    };

    // 这些方法会在 NotionPageRenderer 中注入
    this.fetchChildBlocks = async () => [];
    this.getBlockFormat = () => ({});
    this.getSignedUrl = () => null;
    this.databaseRenderer = async () => '';
    this.fetchSyncedBlockContent = async () => [];
  }

  /**
   * 渲染块数组
   */
  async renderBlocks(
    blocks: BlockObjectResponse[],
    context: RenderContext = this.createContext()
  ): Promise<string> {
    const htmlParts: string[] = [];
    let i = 0;

    while (i < blocks.length) {
      const block = blocks[i];

      // 处理列表的连续项（需要包裹在 ul/ol 中）
      if (this.isListItem(block)) {
        const listItems: BlockObjectResponse[] = [];
        const listType = this.getListType(block);

        // 收集连续的相同类型列表项
        while (i < blocks.length && this.isListItem(blocks[i]) && this.getListType(blocks[i]) === listType) {
          listItems.push(blocks[i]);
          i++;
        }

        // 渲染整个列表
        const html = await this.renderList(listItems, listType, context);
        htmlParts.push(html);
      } else {
        const html = await this.renderBlock(block, context);
        if (html) htmlParts.push(html);
        i++;
      }
    }

    return htmlParts.join('\n');
  }

  /**
   * 渲染单个块
   */
  async renderBlock(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    // 根据块类型分发渲染
    switch (block.type) {
      // 基础文本块
      case 'paragraph':
        return await this.renderParagraph(block, context);
      case 'heading_1':
      case 'heading_2':
      case 'heading_3':
        return this.renderHeading(block, context);

      // 列表块（由 renderBlocks 统一处理）
      case 'bulleted_list_item':
      case 'numbered_list_item':
      case 'to_do':
        return await this.renderListItem(block, context);

      // 富文本块
      case 'quote':
        return await this.renderQuote(block, context);
      case 'callout':
        return await this.renderCallout(block, context);
      case 'toggle':
        return await this.renderToggle(block, context);

      // 代码和公式
      case 'code':
        return this.renderCode(block, context);
      case 'equation':
        return this.renderEquation(block, context);

      // 媒体块
      case 'image':
        return this.renderImage(block, context);
      case 'video':
        return this.renderVideo(block, context);
      case 'file':
        return this.renderFile(block, context);
      case 'pdf':
        return this.renderPdf(block, context);

      // 嵌入和书签
      case 'embed':
        return this.renderEmbed(block, context);
      case 'bookmark':
        return this.renderBookmark(block, context);
      case 'link_preview':
        return await this.renderLinkPreview(block, context);

      // 布局块
      case 'divider':
        return this.renderDivider();
      case 'table':
        return await this.renderTable(block, context);
      case 'column_list':
        return await this.renderColumnList(block, context);
      case 'column':
        return await this.renderColumn(block, context);

      // 子页面和数据库
      case 'child_page':
        return this.renderChildPage(block, context);
      case 'child_database':
        return this.renderChildDatabase(block, context);
      case 'link_to_page':
        return this.renderLinkToPage(block, context);

      // 其他特殊块
      case 'table_of_contents':
        return this.renderTableOfContents();
      case 'breadcrumb':
        return this.renderBreadcrumb();
      case 'synced_block':
        return await this.renderSyncedBlock(block, context);

      default:
        // 不支持的块类型显示占位符
        return this.renderUnsupported(block);
    }
  }

  // ========== 基础块渲染方法 ==========

  /**
   * 渲染段落
   */
  private async renderParagraph(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const paragraph = (block as any).paragraph;
    const text = await renderRichText(paragraph.rich_text);
    const bgClass = this.getBlockBackgroundClass(paragraph);

    let html = '';
    if (!text.trim()) {
      html = '<p><br></p>'; // 空段落
    } else {
      const classAttr = bgClass ? ` class="${bgClass.trim()}"` : '';
      html = `<p${classAttr}>${text}</p>`;
    }

    // 处理子块（嵌套内容）
    if (block.has_children) {
      const children = await this.fetchChildBlocks(block.id);
      const childrenHtml = await this.renderBlocks(children, context);
      html += `<div class="notion-children">${childrenHtml}</div>`;
    }

    return html;
  }

  /**
   * 渲染标题
   */
  private async renderHeading(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const level = block.type.replace('heading_', '');
    const heading = (block as any)[block.type];
    const text = await renderRichText(heading.rich_text);
    const id = this.generateHeadingId(extractPlainText(heading.rich_text));
    const toggleable = heading.is_toggleable ? ' data-toggleable="true"' : '';
    const bgClass = this.getBlockBackgroundClass(heading);
    const classAttr = bgClass ? ` class="${bgClass.trim()}"` : '';

    return `<h${level} id="${id}"${classAttr}${toggleable}>${text}</h${level}>`;
  }

  // ========== 列表块渲染 ==========

  /**
   * 判断是否为列表项
   */
  private isListItem(block: BlockObjectResponse): boolean {
    return ['bulleted_list_item', 'numbered_list_item', 'to_do'].includes(block.type);
  }

  /**
   * 获取列表类型
   */
  private getListType(block: BlockObjectResponse): 'bulleted' | 'numbered' | 'todo' {
    if (block.type === 'bulleted_list_item') return 'bulleted';
    if (block.type === 'numbered_list_item') return 'numbered';
    return 'todo';
  }

  /**
   * 渲染列表（包裹多个列表项）
   */
  private async renderList(
    blocks: BlockObjectResponse[],
    listType: 'bulleted' | 'numbered' | 'todo',
    context: RenderContext
  ): Promise<string> {
    const tag = listType === 'numbered' ? 'ol' : 'ul';
    const className = listType === 'todo' ? ' class="notion-todo-list"' : '';

    const items = await Promise.all(
      blocks.map(block => this.renderListItem(block, context))
    );

    // 过滤掉空的列表项
    const validItems = items.filter(item => item.trim() !== '');

    return `<${tag}${className}>\n${validItems.join('\n')}\n</${tag}>`;
  }

  /**
   * 渲染列表项
   */
  private async renderListItem(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const item = (block as any)[block.type];
    const text = await renderRichText(item.rich_text);
    let childrenHtml = '';

    // 处理子块（嵌套列表项或其他内容）
    if (block.has_children) {
      const children = await this.fetchChildBlocks(block.id);
      childrenHtml = await this.renderBlocks(children, context);
    }

    // 如果既没有文本也没有子块，跳过这个列表项
    if (!text && !childrenHtml) {
      return '';
    }

    let html = '';

    // TODO 列表特殊处理
    if (block.type === 'to_do') {
      const checked = item.checked ? 'checked' : '';
      html = `<li class="notion-todo-item">
        <input type="checkbox" ${checked} disabled />
        <span>${text}</span>`;
    } else {
      html = `<li>${text}`;
    }

    // 添加子块内容
    if (childrenHtml) {
      html += `\n${childrenHtml}`;
    }

    html += '</li>';
    return html;
  }

  // ========== 富文本块渲染 ==========

  /**
   * 渲染引用块
   */
  private async renderQuote(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const quote = (block as any).quote;
    const text = await renderRichText(quote.rich_text);
    const bgClass = this.getBlockBackgroundClass(quote);

    let html = `<blockquote class="notion-quote${bgClass}">${text}`;

    // 处理子块
    if (block.has_children) {
      const children = await this.fetchChildBlocks(block.id);
      const childrenHtml = await this.renderBlocks(children, context);
      html += `\n<div class="notion-children">${childrenHtml}</div>`;
    }

    html += '</blockquote>';
    return html;
  }

  /**
   * 渲染 Callout（高亮块）
   */
  private async renderCallout(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const callout = (block as any).callout;
    const text = await renderRichText(callout.rich_text);
    const icon = this.getCalloutIcon(callout.icon);
    const colorClass = callout.color !== 'default' ? `notion-callout-${callout.color.replace('_', '-')}` : '';

    let html = `<div class="notion-callout ${colorClass}">
      <div class="notion-callout-icon">${icon}</div>
      <div class="notion-callout-content">${text}`;

    // 处理子块
    if (block.has_children) {
      const children = await this.fetchChildBlocks(block.id);
      const childrenHtml = await this.renderBlocks(children, context);
      html += `\n${childrenHtml}`;
    }

    html += `</div>
    </div>`;
    return html;
  }

  /**
   * 渲染 Toggle（折叠块）
   */
  private async renderToggle(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const toggle = (block as any).toggle;
    const text = await renderRichText(toggle.rich_text);

    if (!this.options.enableToggle) {
      // 不启用折叠功能，直接展开显示
      let html = `<div class="notion-toggle-expanded">
        <div class="notion-toggle-title">${text}</div>`;

      if (block.has_children) {
        const children = await this.fetchChildBlocks(block.id);
        const childrenHtml = await this.renderBlocks(children, context);
        html += `<div class="notion-toggle-content">${childrenHtml}</div>`;
      }

      html += '</div>';
      return html;
    }

    // 启用折叠功能
    let html = `<details class="notion-toggle">
      <summary class="notion-toggle-title">${text}</summary>`;

    if (block.has_children) {
      const children = await this.fetchChildBlocks(block.id);
      const childrenHtml = await this.renderBlocks(children, context);
      html += `<div class="notion-toggle-content">${childrenHtml}</div>`;
    }

    html += '</details>';
    return html;
  }

  // ========== 代码和公式渲染 ==========

  /**
   * 渲染代码块
   */
  private renderCode(block: BlockObjectResponse, context: RenderContext): string {
    const code = (block as any).code;
    const text = code.rich_text.map((rt: any) => rt.plain_text).join('');
    const language = code.language || 'plaintext';
    const caption = code.caption && code.caption.length > 0
      ? `<div class="notion-code-caption">${renderPlainText(code.caption)}</div>`
      : '';

    // Mermaid 代码块不显示 header
    const isMermaid = language === 'mermaid';

    // 显示语言标签（首字母大写）
    const displayLanguage = language === 'plaintext' ? 'Plain Text' : language.charAt(0).toUpperCase() + language.slice(1);

    const headerHtml = !isMermaid ? `
      <div class="notion-code-header">
        <span class="notion-code-language">${displayLanguage}</span>
        <button class="notion-code-copy" title="复制代码" aria-label="复制代码">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span class="copy-text">COPY</span>
        </button>
      </div>
    ` : '';

    return `<div class="notion-code-block">
      ${headerHtml}
      <pre class="notion-code"><code class="language-${language}">${escapeHtml(text)}</code></pre>
      ${caption}
    </div>`;
  }

  /**
   * 渲染公式块
   */
  private renderEquation(block: BlockObjectResponse, context: RenderContext): string {
    const equation = (block as any).equation;
    // 注意：公式内容不需要 HTML 转义，KaTeX 会自行处理
    const expression = equation.expression;

    return `<div class="notion-equation-block">
      <span class="notion-equation">$$${expression}$$</span>
    </div>`;
  }

  // ========== 媒体块渲染 ==========

  /**
   * 渲染图片
   */
  private async renderImage(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const image = (block as any).image;
    let url = this.getFileUrl(image);

    // 转换临时 URL 为永久 URL
    url = mapImageUrl(url, block);

    // 可选：压缩图片
    if (this.options.imageMaxWidth > 0) {
      url = compressImage(url, this.options.imageMaxWidth);
    }

    const caption = image.caption && image.caption.length > 0
      ? renderPlainText(image.caption)
      : '';

    const alt = caption || 'Image';
    const loading = this.options.lazyLoadImages ? 'loading="lazy"' : '';

    // 获取 format 样式信息（来自非官方 API）
    const format = this.getBlockFormat(block.id);

    // 提取样式属性
    const alignment = format.block_alignment || 'center'; // left, center, right
    const blockWidth = format.block_width; // 像素宽度
    const blockHeight = format.block_height; // 像素高度
    const aspectRatio = format.block_aspect_ratio; // 宽高比
    const isFullWidth = format.block_full_width;
    const isPageWidth = format.block_page_width;

    // 构建样式和类名
    let styleAttr = '';
    let figureClass = `notion-image notion-image-${alignment}`;

    // 宽度处理优先级：full-width > page-width > block_width > 默认
    if (isFullWidth) {
      figureClass += ' notion-image-full-width';
    } else if (isPageWidth) {
      figureClass += ' notion-image-page-width';
    } else if (blockWidth) {
      styleAttr = `style="max-width: ${blockWidth}px;"`;
    } else if (this.options.imageMaxWidth > 0) {
      styleAttr = `style="max-width: ${this.options.imageMaxWidth}px;"`;
    }

    // 计算图片宽高比用于容器占位（防止 CLS）
    // 图片加载完成后会用 naturalWidth/naturalHeight 替换为真实比例
    let wrapperStyleAttr = '';
    let wrapperDataAttr = '';

    if (blockWidth && aspectRatio) {
      // Notion 的 block_aspect_ratio 是 height / width，需要取倒数
      const cssRatio = 1 / aspectRatio;
      wrapperStyleAttr = ` style="aspect-ratio: ${cssRatio.toFixed(6)};"`;
      wrapperDataAttr = ` data-aspect-ratio="${cssRatio.toFixed(6)}"`;
    } else if (blockWidth && blockHeight) {
      // 后备方案：使用 block_width 和 block_height（可能是用户手动调整的尺寸，加载后会被真实比例替换）
      const ratio = blockWidth / blockHeight;
      wrapperStyleAttr = ` style="aspect-ratio: ${ratio.toFixed(6)};"`;
      wrapperDataAttr = ` data-aspect-ratio="${ratio.toFixed(6)}"`;
    }

    const escapedUrl = escapeHtml(url);
    const escapedCaption = escapeHtml(caption);

    return `<figure class="${figureClass}" ${styleAttr}>
      <a href="${escapedUrl}" class="glightbox" data-gallery="article-images" data-description="${escapedCaption}" data-title="${escapeHtml(alt)}"${wrapperStyleAttr}${wrapperDataAttr}>
        <img src="${escapedUrl}" alt="${escapeHtml(alt)}" ${loading} onload="const ratio=this.naturalWidth/this.naturalHeight;this.parentElement.style.aspectRatio=ratio.toFixed(6);this.parentElement.setAttribute('data-aspect-ratio',ratio.toFixed(6));this.parentElement.classList.add('loaded')" />
      </a>
      ${caption ? `<figcaption>${caption}</figcaption>` : ''}
    </figure>`;
  }


  /**
   * 渲染视频
   */
  private async renderVideo(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const video = (block as any).video;
    let url = this.getFileUrl(video);

    // 转换临时 URL 为永久 URL（只对上传的文件，外部链接不处理）
    if (video.type === 'file') {
      url = mapImageUrl(url, block);
    }

    const caption = video.caption && video.caption.length > 0
      ? renderPlainText(video.caption)
      : '';

    // 判断是外部链接还是上传文件
    if (video.type === 'external') {
      // 尝试识别常见视频平台
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = this.extractYoutubeId(url);
        return `<figure class="notion-video">
          <div class="notion-video-wrapper">
            <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>
          </div>
          ${caption ? `<figcaption>${caption}</figcaption>` : ''}
        </figure>`;
      }
      // 其他外部视频链接
      return `<figure class="notion-video">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
          📹 ${caption || 'View Video'}
        </a>
      </figure>`;
    }

    // 上传的视频文件
    return `<figure class="notion-video">
      <video controls>
        <source src="${escapeHtml(url)}" />
        Your browser does not support the video tag.
      </video>
      ${caption ? `<figcaption>${caption}</figcaption>` : ''}
    </figure>`;
  }

  /**
   * 渲染文件
   */
  private async renderFile(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const file = (block as any).file;
    let url = this.getFileUrl(file);

    // 优先使用 signed_url（永久 URL），否则使用图片代理（对文件可能不生效）
    const signedUrl = this.getSignedUrl(block.id);
    if (signedUrl) {
      url = signedUrl;
    } else if (file.type === 'file') {
      // 上传的文件尝试使用图片代理（可能不生效）
      url = mapImageUrl(url, block);
    }

    const caption =
      file.caption && file.caption.length > 0
        ? renderPlainText(file.caption)
        : '';

    const fileName = caption || this.extractFileName(url) || '';

    return `<div class="notion-file">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" download>
        📎 ${escapeHtml(fileName)}
      </a>
    </div>`;
  }

  /**
   * 从 URL 提取文件名
   */
  private extractFileName(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      return decodeURIComponent(pathname.split('/').pop() || '');
    } catch {
      return url.split('/').pop() || '';
    }
  }

  /**
   * 渲染 PDF
   */
  private async renderPdf(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const pdf = (block as any).pdf;
    let url = this.getFileUrl(pdf);

    // 优先使用 signed_url（永久 URL）
    // 注意：mapImageUrl 使用 /image/ 代理，不支持 PDF，所以必须用 signed_url
    const signedUrl = this.getSignedUrl(block.id);
    if (signedUrl) {
      url = signedUrl;
    }
    // 如果没有 signed_url，保持原始 URL（可能会过期）

    const caption = pdf.caption && pdf.caption.length > 0
      ? renderPlainText(pdf.caption)
      : '';

    // 使用 Google Docs Viewer 嵌入 PDF
    const viewerUrl = `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(url)}`;

    return `<div class="notion-pdf">
      <div class="notion-pdf-viewer">
        <embed src="${escapeHtml(viewerUrl)}" type="application/pdf" />
      </div>
      ${caption ? `<div class="notion-pdf-caption">${caption}</div>` : ''}
    </div>`;
  }

  // ========== 嵌入和书签渲染 ==========

  /**
   * 将普通 URL 转换为 embed URL（作为 fallback，format 优先）
   */
  private convertToEmbedUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // YouTube
      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        return this.extractYouTubeEmbedUrl(url);
      }

      // Spotify
      if (urlObj.hostname === 'open.spotify.com') {
        return url.replace(/^https:\/\/open\.spotify\.com\//, 'https://open.spotify.com/embed/');
      }

      // Vimeo
      if (urlObj.hostname === 'vimeo.com') {
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const videoId = pathParts[0];
        return `https://player.vimeo.com/video/${videoId}`;
      }

      // 其他 URL 直接返回（依赖 format 中的正确 URL）
      return url;
    } catch {
      return url;
    }
  }

  /**
   * 提取 YouTube embed URL
   */
  private extractYouTubeEmbedUrl(url: string): string {
    // youtube.com/watch?v=VIDEO_ID
    const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (watchMatch) {
      return `https://www.youtube.com/embed/${watchMatch[1]}`;
    }
    // youtube.com/shorts/VIDEO_ID
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) {
      return `https://www.youtube.com/embed/${shortsMatch[1]}`;
    }
    // youtube.com/embed/VIDEO_ID (已经是 embed 格式)
    if (url.includes('youtube.com/embed/')) {
      return url;
    }
    return url;
  }

  /**
   * 判断是否是 Twitter/X URL
   */
  private isTwitterUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'x.com' || urlObj.hostname === 'twitter.com' || urlObj.hostname === 'www.twitter.com';
    } catch {
      return false;
    }
  }

  /**
   * 渲染 Twitter/X 嵌入（使用 oEmbed API）
   */
  private async renderTwitterEmbed(url: string, caption: string): Promise<string> {
    try {
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
      const response = await fetch(oembedUrl, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Twitter oEmbed failed: ${response.status}`);
      }

      const data = await response.json();

      return `<figure class="notion-embed notion-embed--twitter">
        ${data.html || ''}
        ${caption ? `<figcaption>${caption}</figcaption>` : ''}
      </figure>`;
    } catch (error) {
      console.warn('[Embed] Twitter oEmbed failed:', error);
      // 降级：显示链接卡片
      return `<figure class="notion-embed notion-embed--fallback">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="notion-embed-fallback-link">
          <span class="notion-embed-fallback-icon">𝕏</span>
          <span class="notion-embed-fallback-text">查看 Twitter/X 内容</span>
        </a>
        ${caption ? `<figcaption>${caption}</figcaption>` : ''}
      </figure>`;
    }
  }

  /**
   * 渲染嵌入内容
   */
  private async renderEmbed(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const embed = (block as any).embed;
    const url = embed.url;
    const caption = embed.caption && embed.caption.length > 0
      ? renderPlainText(embed.caption)
      : '';

    // 获取 format 信息（来自非官方 API，可能包含正确的 embed URL）
    const format = this.getBlockFormat(block.id);

    // 检查是否是 Twitter/X
    if (this.isTwitterUrl(url)) {
      return await this.renderTwitterEmbed(url, caption);
    }

    // 如果 format 中有正确的 embed URL，优先使用
    let embedUrl = format.display_source || '';

    // 否则转换普通 URL 为 embed URL
    if (!embedUrl) {
      embedUrl = this.convertToEmbedUrl(url);
    }

    return `<figure class="notion-embed">
      <div class="notion-embed-wrapper">
        <iframe src="${escapeHtml(embedUrl)}" frameborder="0" allowfullscreen data-loading="lazy"></iframe>
      </div>
      ${caption ? `<figcaption>${caption}</figcaption>` : ''}
    </figure>`;
  }

  /**
   * 渲染书签
   */
  private async renderBookmark(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const bookmark = (block as any).bookmark;
    const url = bookmark.url;

    // 获取 Open Graph 数据
    const ogData = await fetchOpenGraphData(url);

    // 标题优先级：og:title > caption > 域名
    const caption = bookmark.caption && bookmark.caption.length > 0
      ? extractPlainText(bookmark.caption)
      : '';
    const domain = this.extractDomain(url);
    const title = ogData?.title || caption || domain;

    // 描述：og:description
    const description = ogData?.description || '';

    // 图片：og:image > logo > favicon
    const image = ogData?.image || ogData?.logo;

    return `<figure class="notion-bookmark">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        ${image ? `<div class="notion-bookmark-cover"><img src="${image}" alt="" loading="lazy" /></div>` : ''}
        <div class="notion-bookmark-info">
          <div class="notion-bookmark-title">${escapeHtml(title)}</div>
          ${description ? `<div class="notion-bookmark-description">${escapeHtml(description)}</div>` : ''}
          <div class="notion-bookmark-url">${escapeHtml(domain)}</div>
        </div>
      </a>
    </figure>`;
  }

  /**
   * 从 URL 提取域名
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return 'example.com';
    }
  }

  /**
   * 渲染链接预览
   */
  private async renderLinkPreview(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const linkPreview = (block as any).link_preview;
    const url = linkPreview.url;

    // 获取 Open Graph 数据
    const ogData = await fetchOpenGraphData(url);

    // 提取域名
    const domain = this.extractDomain(url);

    // 标题：优先使用 og:title，否则使用域名
    const title = ogData?.title || domain;

    // 描述：og:description
    const description = ogData?.description || '';

    // 图片：og:image > logo
    const image = ogData?.image || ogData?.logo;

    return `<figure class="notion-bookmark">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        ${image ? `<div class="notion-bookmark-cover"><img src="${image}" alt="" loading="lazy" /></div>` : ''}
        <div class="notion-bookmark-info">
          <div class="notion-bookmark-title">${escapeHtml(title)}</div>
          ${description ? `<div class="notion-bookmark-description">${escapeHtml(description)}</div>` : ''}
          <div class="notion-bookmark-url">${escapeHtml(domain)}</div>
        </div>
      </a>
    </figure>`;
  }

  // ========== 布局块渲染 ==========

  /**
   * 渲染分隔线
   */
  private renderDivider(): string {
    return '<hr class="notion-divider" />';
  }

  /**
   * 渲染表格
   */
  private async renderTable(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const table = (block as any).table;
    const hasColumnHeader = table.has_column_header;
    const hasRowHeader = table.has_row_header;

    if (!block.has_children) {
      return '<div class="notion-table-empty">Empty table</div>';
    }

    const children = await this.fetchChildBlocks(block.id);
    const rows = children.filter(child => child.type === 'table_row');

    let html = '<div class="notion-table-wrapper"><table class="notion-table">';

    // 渲染表头
    if (hasColumnHeader && rows.length > 0) {
      const headerRow = (rows[0] as any).table_row;
      html += '<thead><tr>';

      for (const cell of headerRow.cells) {
        const cellContent = await renderRichText(cell);
        html += `<th>${cellContent}</th>`;
      }

      html += '</tr></thead>';
      rows.shift(); // 移除已渲染的表头行
    }

    // 渲染表体
    html += '<tbody>';

    for (const row of rows) {
      const tableRow = (row as any).table_row;
      html += '<tr>';

      for (let j = 0; j < tableRow.cells.length; j++) {
        const cell = tableRow.cells[j];
        const tag = hasRowHeader && j === 0 ? 'th' : 'td';
        const cellContent = await renderRichText(cell);
        html += `<${tag}>${cellContent}</${tag}>`;
      }

      html += '</tr>';
    }

    html += '</tbody></table></div>';
    return html;
  }

  /**
   * 渲染列布局
   */
  private async renderColumnList(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    if (!block.has_children) return '';

    const children = await this.fetchChildBlocks(block.id);
    const columns = children.filter(child => child.type === 'column');

    const columnsHtml = await Promise.all(
      columns.map(col => this.renderColumn(col as any, context))
    );

    return `<div class="notion-column-list">
      ${columnsHtml.join('\n')}
    </div>`;
  }

  /**
   * 渲染单列
   */
  private async renderColumn(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    if (!block.has_children) return '<div class="notion-column"></div>';

    const children = await this.fetchChildBlocks(block.id);
    const childrenHtml = await this.renderBlocks(children, context);

    // 获取列宽比例
    const format = this.getBlockFormat(block.id);
    const columnRatio = format.column_ratio;

    // 应用列宽样式（使用 CSS 变量，支持移动端响应式）
    let styleAttr = '';
    if (columnRatio && columnRatio > 0 && columnRatio < 1) {
      const widthPercent = (columnRatio * 100).toFixed(2);
      // 使用 CSS 变量，移动端可通过 CSS 覆盖这些变量
      styleAttr = ` style="--column-flex: 0 0 ${widthPercent}%; --column-width: ${widthPercent}%;"`;
    }

    return `<div class="notion-column"${styleAttr}>
      ${childrenHtml}
    </div>`;
  }

  // ========== 子页面和链接渲染 ==========

  /**
   * 渲染子页面
   */
  private renderChildPage(block: BlockObjectResponse, context: RenderContext): string {
    const childPage = (block as any).child_page;
    const title = childPage.title;

    return `<div class="notion-child-page">
      <a href="#" onclick="return false;">
        📄 ${escapeHtml(title)}
      </a>
    </div>`;
  }

  /**
   * 渲染子数据库
   */
  private async renderChildDatabase(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    try {
      return await this.databaseRenderer(block);
    } catch {
      // 降级显示：简单的数据库标题
      const childDatabase = (block as any).child_database;
      const title = childDatabase.title;

      return `<div class="notion-child-database">
        <div class="notion-child-database-title">
          🗄️ ${escapeHtml(title)}
        </div>
      </div>`;
    }
  }

  /**
   * 渲染链接到页面
   */
  private renderLinkToPage(block: BlockObjectResponse, context: RenderContext): string {
    const linkToPage = (block as any).link_to_page;

    if (linkToPage.type === 'page_id') {
      return `<div class="notion-link-to-page">
        <a href="#" onclick="return false;">
          🔗 Linked Page
        </a>
      </div>`;
    }

    return '';
  }

  // ========== 其他特殊块 ==========

  /**
   * 渲染目录
   */
  private renderTableOfContents(): string {
    return `<div class="notion-table-of-contents">
      <div class="notion-table-of-contents-title">📑 Table of Contents</div>
      <div class="notion-table-of-contents-hint">(Generated automatically)</div>
    </div>`;
  }

  /**
   * 渲染面包屑
   */
  private renderBreadcrumb(): string {
    return '<div class="notion-breadcrumb">🏠 Home</div>';
  }

  // ========== 辅助方法 ==========

  /**
   * 渲染不支持的块类型
   */
  private renderUnsupported(block: BlockObjectResponse): string {
    console.warn(`[NotionRenderer] Unsupported block type: ${block.type}`);

    return `<div class="notion-unsupported" data-block-type="${block.type}">
      <span>⚠️ Unsupported block type: <code>${block.type}</code></span>
    </div>`;
  }

  /**
   * 创建默认渲染上下文
   */
  private createContext(): RenderContext {
    return {
      listDepth: 0,
      inList: false,
    };
  }

  /**
   * 生成标题的锚点 ID
   */
  private generateHeadingId(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }

  /**
   * 获取 Callout 图标
   */
  private getCalloutIcon(icon: any): string {
    if (!icon) return '💡';
    if (icon.type === 'emoji') return icon.emoji;
    if (icon.type === 'external') return `<img src="${icon.external.url}" alt="icon" class="notion-callout-icon-img" />`;
    if (icon.type === 'file') return `<img src="${icon.file.url}" alt="icon" class="notion-callout-icon-img" />`;
    return '💡';
  }

  /**
   * 获取文件 URL（处理 external 和 file 类型）
   */
  private getFileUrl(file: any): string {
    if (file.type === 'external') return file.external.url;
    if (file.type === 'file') return file.file.url;
    return '';
  }

  /**
   * 提取 YouTube 视频 ID
   */
  private extractYoutubeId(url: string): string {
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    return match ? match[1] : '';
  }

  /**
   * 获取块的背景色类名
   */
  private getBlockBackgroundClass(blockData: any): string {
    // 某些块类型支持 color 属性，它可以包含背景色信息
    // 例如：paragraph, heading, callout, quote, code 等
    const color = blockData.color;
    if (!color || color === 'default') return '';

    // Notion 的颜色格式：如 "blue_background", "yellow_background" 等
    if (color.endsWith('_background')) {
      return ` notion-${color.replace('_', '-')}`;
    }

    return '';
  }

  /**
   * 渲染 Synced Block（同步块）
   */
  private async renderSyncedBlock(block: BlockObjectResponse, context: RenderContext): Promise<string> {
    const syncedBlock = (block as any).synced_block;

    // synced_from 为 null 表示这是原始块
    // synced_from 有值表示这是同步的副本
    if (syncedBlock.synced_from === null) {
      // 这是原始块，渲染其子块
      if (block.has_children) {
        const children = await this.fetchChildBlocks(block.id);
        return await this.renderBlocks(children, context);
      }
      return '';
    } else {
      // 这是同步的副本，需要获取原始块的子块
      const originalBlockId = syncedBlock.synced_from.block_id;

      try {
        // 优先使用非官方 API 获取（可访问公开页面）
        const children = await this.fetchSyncedBlockContent(originalBlockId);
        if (children && children.length > 0) {
          return await this.renderBlocks(children, context);
        }
      } catch (error) {
        console.warn(`[SyncedBlock] Failed to fetch original block ${originalBlockId}:`, error);
      }

      return '';
    }
  }
}
