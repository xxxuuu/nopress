/**
 * 站点配置
 * 包含网站的基本信息、作者信息、导航等
 */

export const SITE_CONFIG = {
  // 站点基本信息
  title: 'My Blog',
  description: '基于 NoPress (Notion + WordPress) 构建的个人博客',
  url: 'http://localhost:4321',
  language: 'zh-CN',

  // 作者信息
  author: {
    name: 'Your Name',
    email: 'your@email.com',
    avatar: '/avatar.jpg',
    bio: '热爱技术，热爱分享',
    social: {
      github: 'https://github.com/yourusername',
      twitter: 'https://twitter.com/yourusername',
      email: 'mailto:your@email.com',
      // 可以添加更多社交链接
      // linkedin: 'https://linkedin.com/in/yourusername',
    },
  },

  // 网站设置
  postsPerPage: 10, // 每页显示的文章数
  enableRSS: true, // 是否启用 RSS
  enableSitemap: true, // 是否启用 Sitemap

  // 导航菜单（注意：实际导航由 Notion Database 中 type=Menu 的条目控制）
  // 这里的配置可以作为默认值或备份
  nav: [
    { text: '首页', href: '/' },
    { text: '标签', href: '/tags' },
    { text: '关于', href: '/about' },
  ],

  // 外部链接（友情链接等）
  links: [
    { text: 'Astro', href: 'https://astro.build' },
    { text: 'Notion', href: 'https://www.notion.so' },
    // 可以添加更多链接
  ],

  // SEO 设置
  seo: {
    ogImage: '/og-image.jpg', // Open Graph 默认图片
    twitterCard: 'summary_large_image',
    twitterSite: '@yourusername',
  },
} as const;

// 导出类型
export type SiteConfig = typeof SITE_CONFIG;
