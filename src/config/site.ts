/**
 * 站点配置
 *
 * 支持通过环境变量覆盖默认配置，优先级：
 * 1. 环境变量（生产环境推荐）
 * 2. .env 文件（本地开发）
 * 3. 代码中的默认值（fallback）
 *
 * 环境变量命名规范：
 * - SITE_URL, SITE_TITLE, SITE_DESCRIPTION -> 站点基本信息
 * - AUTHOR_NAME, AUTHOR_EMAIL, AUTHOR_BIO -> 作者信息
 * - COMMENTS_ENABLED, COMMENTS_GISCUS_REPO -> 评论系统
 * - 详见文档：docs/CONFIGURATION.md
 */

import { loadSiteConfig } from '@lib/config/loader';

/**
 * 加载站点配置
 *
 * 配置来源（优先级从高到低）：
 * 1. 环境变量（如 SITE_URL, SITE_TITLE）
 * 2. .env 文件
 * 3. 代码默认值
 */
export const SITE_CONFIG = loadSiteConfig();

// 导出类型
export type SiteConfig = typeof SITE_CONFIG;
