/**
 * 配置加载器
 *
 * 支持从多个来源加载配置，优先级从高到低：
 * 1. 环境变量 (process.env)
 * 2. .env 文件
 * 3. 默认配置值
 *
 * 环境变量命名规范：
 * - 站点配置：SITE_* (例如: SITE_URL, SITE_TITLE)
 * - 评论配置：COMMENTS_GISCUS_* (例如: COMMENTS_GISCUS_REPO)
 */

// 使用 Vite 的 loadEnv 加载环境变量（与 astro.config.mjs 保持一致）
import { loadEnv } from 'vite';
const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');

/**
 * 从环境变量读取字符串值
 */
function getEnvString(key: string, defaultValue?: string): string | undefined {
  const value = env[key];
  return value && value.trim() !== '' ? value : defaultValue;
}

/**
 * 从环境变量读取布尔值
 * 支持: true, false, 1, 0
 */
function getEnvBoolean(key: string, defaultValue?: boolean): boolean | undefined {
  const value = env[key];
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return defaultValue;
}

/**
 * 从环境变量读取数字值
 */
function getEnvNumber(key: string, defaultValue?: number): number | undefined {
  const value = env[key];
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const num = Number(value.trim());
  return isNaN(num) ? defaultValue : num;
}

/**
 * 读取站点起始年份；未配置时保留单年份展示。
 */
function getSiteStartYear(): number | undefined {
  const value = getEnvString('SITE_START_YEAR')?.trim();
  if (!value) return undefined;

  const currentYear = new Date().getFullYear();
  const year = Number(value);
  if (!/^[1-9]\d{3}$/.test(value) || year > currentYear) {
    throw new Error(`[Config] SITE_START_YEAR 必须为 1000 至 ${currentYear} 之间的四位整数年份，或留空。`);
  }

  return year;
}

/**
 * 从环境变量读取 JSON 对象
 * 支持 JSON 字符串格式的配置
 */
function getEnvJson<T>(key: string, defaultValue?: T): T | undefined {
  const value = env[key];
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  try {
    return JSON.parse(value.trim()) as T;
  } catch (error) {
    console.warn(`[Config] Failed to parse JSON for ${key}:`, error);
    return defaultValue;
  }
}

/**
 * 加载社交链接配置
 */
function loadSocialConfig() {
  return getEnvJson<Record<string, string>>('SITE_SOCIAL', {
    github: 'https://github.com/yourusername',
    twitter: 'https://twitter.com/yourusername',
    email: 'mailto:your@email.com',
  });
}

/**
 * 加载评论系统配置
 */
function loadCommentsConfig() {
  const enabled = getEnvBoolean('COMMENTS_ENABLED', false);
  const provider = getEnvString('COMMENTS_PROVIDER', 'giscus');

  return {
    enabled,
    provider: provider as 'giscus' | 'waline' | 'utterances' | 'twikoo',
    giscus: {
      repo: getEnvString('COMMENTS_GISCUS_REPO', ''),
      repoId: getEnvString('COMMENTS_GISCUS_REPO_ID', ''),
      category: getEnvString('COMMENTS_GISCUS_CATEGORY', 'Announcements'),
      categoryId: getEnvString('COMMENTS_GISCUS_CATEGORY_ID', ''),
      mapping: getEnvString('COMMENTS_GISCUS_MAPPING', 'pathname') as
        | 'pathname'
        | 'url'
        | 'title'
        | 'og:title'
        | 'specific'
        | 'number',
      strict: getEnvString('COMMENTS_GISCUS_STRICT', '0') as '0' | '1',
      reactionsEnabled: getEnvString(
        'COMMENTS_GISCUS_REACTIONS_ENABLED',
        '1'
      ) as '0' | '1',
      emitMetadata: getEnvString('COMMENTS_GISCUS_EMIT_METADATA', '0') as
        | '0'
        | '1',
      inputPosition: getEnvString(
        'COMMENTS_GISCUS_INPUT_POSITION',
        'bottom'
      ) as 'top' | 'bottom',
      lang: getEnvString('COMMENTS_GISCUS_LANG', 'zh-CN'),
      lazy: getEnvBoolean('COMMENTS_GISCUS_LAZY', true) ?? true,
    },
  };
}

/**
 * 加载站点配置
 *
 * 环境变量映射：
 * - SITE_URL -> url
 * - SITE_TITLE -> title (留空则使用 Database 名称)
 * - SITE_DESCRIPTION -> description (留空则使用 Database 描述)
 * - SITE_ICON -> icon (留空则使用 Database 图标)
 * - SITE_START_YEAR -> startYear (留空则版权行只显示构建当年)
 * - SITE_POSTS_PER_PAGE -> postsPerPage
 * - SITE_ENABLE_RSS -> enableRSS
 * - SITE_ENABLE_SITEMAP -> enableSitemap
 * - SITE_SOCIAL -> social (JSON 格式)
 */
export function loadSiteConfig() {
  const config = {
    // 站点基本信息（title/description/icon 留空则使用 Database 元数据）
    title: getEnvString('SITE_TITLE', ''),
    description: getEnvString('SITE_DESCRIPTION', ''),
    icon: getEnvString('SITE_ICON', ''),
    url: getEnvString('SITE_URL', 'http://localhost:4321'),
    startYear: getSiteStartYear(),

    // 社交链接
    social: loadSocialConfig(),

    // 网站设置
    postsPerPage: getEnvNumber('SITE_POSTS_PER_PAGE', 10) ?? 10,
    enableRSS: getEnvBoolean('SITE_ENABLE_RSS', true) ?? true,
    enableSitemap: getEnvBoolean('SITE_ENABLE_SITEMAP', true) ?? true,

    // 评论系统配置
    comments: loadCommentsConfig(),
  };

  return config;
}
