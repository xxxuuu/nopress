/**
 * 配置加载器
 *
 * 支持从多个来源加载配置，优先级从高到低：
 * 1. 环境变量 (NODE_ENV)
 * 2. .env 文件
 * 3. 默认配置值
 *
 * 环境变量命名规范：
 * - 站点配置：SITE_* (例如: SITE_URL, SITE_TITLE)
 * - 作者配置：AUTHOR_* (例如: AUTHOR_NAME, AUTHOR_EMAIL)
 * - 评论配置：COMMENTS_GISCUS_* (例如: COMMENTS_GISCUS_REPO)
 */

/**
 * 从环境变量读取字符串值
 */
function getEnvString(key: string, defaultValue?: string): string | undefined {
  const value = import.meta.env[key];
  return value && value.trim() !== '' ? value : defaultValue;
}

/**
 * 从环境变量读取布尔值
 * 支持: true, false, 1, 0
 */
function getEnvBoolean(key: string, defaultValue?: boolean): boolean | undefined {
  const value = import.meta.env[key];
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
  const value = import.meta.env[key];
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const num = Number(value.trim());
  return isNaN(num) ? defaultValue : num;
}

/**
 * 从环境变量读取 JSON 对象
 * 支持 JSON 字符串格式的配置
 */
function getEnvJson<T>(key: string, defaultValue?: T): T | undefined {
  const value = import.meta.env[key];
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
 * 加载作者配置
 */
function loadAuthorConfig() {
  return {
    name: getEnvString('AUTHOR_NAME', 'Your Name'),
    email: getEnvString('AUTHOR_EMAIL', 'your@email.com'),
    avatar: getEnvString('AUTHOR_AVATAR', '/avatar.jpg'),
    bio: getEnvString('AUTHOR_BIO', '热爱技术，热爱分享'),
    social: getEnvJson<Record<string, string>>('AUTHOR_SOCIAL', {
      github: 'https://github.com/yourusername',
      twitter: 'https://twitter.com/yourusername',
      email: 'mailto:your@email.com',
    }),
  };
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
      mapping: getEnvString('COMMENTS_GISCUS_MAPPING', 'pathname') as 'pathname' | 'url' | 'title' | 'og:title' | 'specific' | 'number',
      strict: getEnvString('COMMENTS_GISCUS_STRICT', '0') as '0' | '1',
      reactionsEnabled: getEnvString('COMMENTS_GISCUS_REACTIONS_ENABLED', '1') as '0' | '1',
      emitMetadata: getEnvString('COMMENTS_GISCUS_EMIT_METADATA', '0') as '0' | '1',
      inputPosition: getEnvString('COMMENTS_GISCUS_INPUT_POSITION', 'bottom') as 'top' | 'bottom',
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
 * - SITE_TITLE -> title
 * - SITE_DESCRIPTION -> description
 * - SITE_LANGUAGE -> language
 * - SITE_POSTS_PER_PAGE -> postsPerPage
 * - SITE_ENABLE_RSS -> enableRSS
 * - SITE_ENABLE_SITEMAP -> enableSitemap
 */
export function loadSiteConfig() {
  const config = {
    // 站点基本信息
    title: getEnvString('SITE_TITLE', 'My Blog'),
    description: getEnvString('SITE_DESCRIPTION', '基于 NoPress (Notion + WordPress) 构建的个人博客'),
    url: getEnvString('SITE_URL', 'http://localhost:4321'),
    language: getEnvString('SITE_LANGUAGE', 'zh-CN'),

    // 作者信息
    author: loadAuthorConfig(),

    // 网站设置
    postsPerPage: getEnvNumber('SITE_POSTS_PER_PAGE', 10) ?? 10,
    enableRSS: getEnvBoolean('SITE_ENABLE_RSS', true) ?? true,
    enableSitemap: getEnvBoolean('SITE_ENABLE_SITEMAP', true) ?? true,

    // 评论系统配置
    comments: loadCommentsConfig(),

    // 导航菜单（暂不支持环境变量配置）
    nav: [
      { text: '首页', href: '/' },
      { text: '标签', href: '/tags' },
      { text: '关于', href: '/about' },
    ],

    // 外部链接（暂不支持环境变量配置）
    links: [
      { text: 'Astro', href: 'https://astro.build' },
      { text: 'Notion', href: 'https://www.notion.so' },
    ],

    // SEO 设置
    seo: {
      ogImage: getEnvString('SEO_OG_IMAGE', '/og-image.jpg'),
      twitterCard: getEnvString('SEO_TWITTER_CARD', 'summary_large_image'),
      twitterSite: getEnvString('SEO_TWITTER_SITE', '@yourusername'),
    },
  };

  return config;
}
