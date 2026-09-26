/**
 * Notion 文件 URL 统一解析
 *
 * Notion 的文件引用有多种来源和形状，过期规则各不相同：
 * - 官方 API：file 对象（{type: 'external'|'file'}），file.url 为 1 小时过期的 S3 签名 URL
 * - 非官方 API：内部字符串，2025-08 起为 attachment:<fileId>:<name> 新格式
 * - 站点内图片统一转换为 notion.so/image/ 代理 URL（服务端代为鉴权，长期有效）
 * - PDF/附件等非图片文件代理不支持，由调用方走 signed_url（见 renderer）
 */

const NOTION_HOST = 'https://www.notion.so';

/** 文件所属记录，决定代理 URL 的 table/id 鉴权参数 */
export interface FileOwner {
  id: string;
  table: 'block' | 'collection';
}

/**
 * 判断 URL 是否需要转换为代理格式
 */
function needsProxy(url: string): boolean {
  // 已经是代理格式的不需要再转换
  if (url.startsWith(`${NOTION_HOST}/image`)) {
    return false;
  }

  // notion.site 公开分享站的图片自带永久 URL
  if (url.includes('notion.site/images/page-cover/')) {
    return false;
  }

  return (
    url.startsWith('attachment:') ||            // Notion 内部文件引用（attachment:<fileId>:<文件名>）
    url.includes('secure.notion-static.com') || // Notion 文件存储旧域名
    url.includes('prod-files-secure')           // Notion 文件存储现行域名
  );
}

/**
 * 去掉 Notion S3 URL 上的临时签名 query，得到规范 URL
 * 代理只依据 table/id 鉴权，编码规范 URL 即可，产物才能长期有效
 */
function stripSignedQuery(url: string): string {
  const isNotionS3 =
    url.includes('secure.notion-static.com') || url.includes('prod-files-secure');
  if (!isNotionS3 || !url.includes('?')) {
    return url;
  }

  return url.split('?')[0];
}

/** Notion 新版文件 CDN 的签名直链域名 */
const FILE_CDN_HOST = /^file\.notion\.(?:so|com)$/i;

/**
 * 将 file.notion CDN 签名直链（/f/f/<spaceId>/<fileId>/<文件名>?tok=...）
 * 还原为 attachment: 内部引用。直链中的令牌数小时即过期，还原为内部引用
 * 后走统一代理转换即可不受其影响。
 */
function fromFileCdnUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!FILE_CDN_HOST.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 5 || parts[0] !== 'f' || parts[1] !== 'f') return null;
    const fileId = parts[3];
    const fileName = decodeURIComponent(parts.slice(4).join('/'));
    if (!fileId || !fileName) return null;
    return `attachment:${fileId}:${fileName}`;
  } catch {
    return null;
  }
}

/**
 * 任意 Notion 文件引用 → 永久 notion.so/image/ 代理 URL
 *
 * 覆盖：`attachment:` 内部引用、Notion 文件存储的签名 URL（新旧域名均剥离
 * 过期签名）、file.notion CDN 签名直链、站内相对路径。已是代理格式、
 * notion.site 公开图、外部图床（unsplash 等）原样返回——代理仅对 Notion
 * 自有文件存储有效。
 *
 * @param raw 原始文件引用（任意来源的 URL 或 attachment: 字符串）
 * @param owner 文件所属记录，用于代理鉴权
 */
export function toProxyUrl(raw: string, owner: FileOwner): string {
  if (!raw) return '';

  const ref = fromFileCdnUrl(raw) ?? raw;

  // 站内相对路径（以 / 开头，协议相对的 // 除外）
  if (ref.startsWith('/') && !ref.startsWith('//')) {
    return `${NOTION_HOST}${ref}`;
  }

  if (!needsProxy(ref)) {
    return ref;
  }

  try {
    const encoded = encodeURIComponent(stripSignedQuery(ref));
    return `${NOTION_HOST}/image/${encoded}?table=${owner.table}&id=${owner.id}`;
  } catch (error) {
    console.warn('[file-url] Failed to encode URL:', raw, error);
    return raw;
  }
}

/**
 * 官方 API 文件对象（{type: 'external'|'file', external|file: {url}}）→ 原始 URL
 */
export function fileObjectUrl(obj: unknown): string {
  const file = obj as { type?: string; external?: { url?: string }; file?: { url?: string } };
  if (!file?.type) return '';
  if (file.type === 'external') return file.external?.url || '';
  if (file.type === 'file') return file.file?.url || '';
  return '';
}

/**
 * 解析 icon → emoji 文本或永久图片 URL，无 icon 返回 ''
 *
 * 兼容两种数据形状：
 * - 官方 API 对象：{type: 'emoji'|'external'|'file', ...}
 * - 非官方 API collection 记录：emoji 字符串、http URL 或 attachment: 字符串
 */
export function resolveIcon(src: unknown, owner: FileOwner): string {
  if (!src) return '';

  if (typeof src === 'string') {
    // collection 记录的原始值：emoji / http URL / attachment: 引用
    if (src.startsWith('http') || src.startsWith('attachment:')) {
      return toProxyUrl(src, owner);
    }
    return src; // emoji
  }

  const icon = src as { type?: string; emoji?: string };
  if (icon.type === 'emoji') return icon.emoji || '';
  return toProxyUrl(fileObjectUrl(src), owner);
}

/**
 * 解析封面 → 永久图片 URL，无封面返回 ''
 *
 * 兼容两种数据形状：
 * - 官方 API 对象：page.cover / database.cover（{type: 'external'|'file', ...}）
 * - 非官方 API 内部字符串：format.page_cover / collection.cover（URL 或 attachment: 引用）
 */
export function resolveCover(src: unknown, owner: FileOwner): string {
  if (!src) return '';

  if (typeof src === 'string') {
    return toProxyUrl(src, owner);
  }

  return toProxyUrl(fileObjectUrl(src), owner);
}

/**
 * 为展示场景追加优化参数（Notion 代理的 cache/width、Unsplash 的压缩参数）
 * 仅影响加载性能，不影响 URL 有效性
 */
export function withDisplayParams(url: string, width?: number): string {
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
