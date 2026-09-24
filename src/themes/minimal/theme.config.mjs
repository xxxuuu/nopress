/**
 * NoPress Minimal 主题配置
 *
 * 契约验证用极简主题：纯文字、系统字体、无客户端框架。
 * 只实现部分路由（首页 / 文章 / 独立页面），验证主题可实现路由子集。
 */

export default {
  id: 'minimal',
  name: 'NoPress Minimal',
  version: '1.0.0',
  author: 'NoPress Team',
  description: '极简纯文字主题，NoPress 主题契约的参考实现',
  compatibleVersion: '^0.1.0',

  // 主题配置选项：宿主可用 NOPRESS_THEME_OPTIONS 覆盖默认值（docs/THEMES.md §3.3）
  options: {
    footerText: {
      type: 'string',
      default: '',
      label: '页脚附加文字',
      description: '显示在页脚版权行下方，留空则不显示',
    },
    showPostMeta: {
      type: 'boolean',
      default: true,
      label: '显示文章元信息',
      description: '文章页的日期/阅读时长/标签行',
    },
  },
};
