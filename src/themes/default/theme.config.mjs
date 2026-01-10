/**
 * NoPress 默认主题配置
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
    // 深色模式
    darkMode: {
      type: 'boolean',
      default: true,
      label: '启用深色模式',
      description: '支持浅色/深色主题切换',
    },

    // 布局配置
    headerStyle: {
      type: 'select',
      default: 'sticky',
      choices: ['fixed', 'sticky', 'static'],
      label: '头部样式',
      description: '控制页面头部的显示方式',
    },

    contentWidth: {
      type: 'number',
      default: 1024,
      min: 800,
      max: 1400,
      label: '内容最大宽度（px）',
      description: '文章内容区域的最大宽度',
    },

    // 功能开关
    showReadingTime: {
      type: 'boolean',
      default: true,
      label: '显示阅读时间',
    },

    showPostCover: {
      type: 'boolean',
      default: true,
      label: '显示文章封面',
    },

    // 样式配置
    accentColor: {
      type: 'color',
      default: '#0066cc',
      label: '主题色',
      description: '主题的强调色',
    },

    borderRadius: {
      type: 'number',
      default: 8,
      min: 0,
      max: 24,
      label: '圆角半径（px）',
      description: '卡片和按钮的圆角大小',
    },
  },
};
