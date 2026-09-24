/**
 * NoPress 默认主题配置
 *
 * 清单只包含元数据与主题选项声明；选项可被宿主经 NOPRESS_THEME_OPTIONS
 * 覆盖（docs/THEMES.md §3.3），未声明的定制点直接修改主题源码。
 */

export default {
  // 基础元数据
  id: 'default',
  name: 'NoPress Default',
  version: '1.0.0',
  author: 'NoPress Team',
  description: 'NoPress 官方默认主题，简洁优雅的博客主题',
  compatibleVersion: '^0.1.0',

  // 主题配置选项
  options: {
    darkMode: {
      type: 'boolean',
      default: true,
      label: '深色模式',
      description: '关闭后站点恒为浅色：不输出防闪烁脚本与切换按钮',
    },
    showPostCover: {
      type: 'boolean',
      default: true,
      label: '显示文章封面',
      description: '文章页顶部的全宽封面图（不影响分享用的 OG 图）',
    },
    showReadingTime: {
      type: 'boolean',
      default: true,
      label: '显示阅读时间',
      description: '文章页元信息行中的阅读时长',
    },
  },
};
