/**
 * NoPress Terminal 主题配置
 *
 * 绿磷光 CRT 风格：黑底绿字、等宽字体贯穿全站、单深色形态（无明暗切换）。
 * 三路由：首页 / 文章 / 独立页面。
 */

export default {
  id: 'terminal',
  name: 'NoPress Terminal',
  version: '1.0.0',
  author: 'NoPress Team',
  description: '绿磷光 CRT 终端风格主题',
  compatibleVersion: '^0.1.0',

  // 主题选项：宿主可用 NOPRESS_THEME_OPTIONS 覆盖默认值（docs/THEMES.md §3.3）
  options: {
    promptSymbol: {
      type: 'string',
      default: '$',
      label: '提示符',
      description: '终端提示符符号，用于页头与列表标题',
    },
    showScanlines: {
      type: 'boolean',
      default: true,
      label: 'CRT 扫描线',
      description: '全屏扫描线质感（部分显示器上可能引起条纹感，可关闭）',
    },
  },
};
