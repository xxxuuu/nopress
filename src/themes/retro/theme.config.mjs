/**
 * NoPress Retro 主题配置
 *
 * 复古桌面操作系统风格：银灰立体斜面、海军蓝标题栏、经典 teal 桌面。
 * 首页即桌面（图标双击打开为应用窗口），文章与独立页面以窗口呈现，
 * 标签与全部文档收进「我的文档」。
 * 五路由：桌面 / 文档夹 / 文章 / 独立页面 / 标签文件夹。单形态（无明暗切换）。
 */

export default {
  id: 'retro',
  name: 'NoPress Retro',
  version: '1.0.0',
  author: 'NoPress Team',
  description: '复古桌面操作系统风格主题：桌面图标、窗口化文章、任务栏与开始菜单',
  compatibleVersion: '^0.1.0',

  // 主题选项：宿主可用 NOPRESS_THEME_OPTIONS 覆盖默认值（docs/THEMES.md）
  options: {
    wallpaper: {
      type: 'select',
      default: 'database',
      choices: ['database', 'teal', 'clouds', 'slate'],
      label: '桌面壁纸',
      description: 'database 使用 Notion Database 封面（无封面时回退 teal）/ teal 水鸭色 / clouds 蓝天白云 / slate 蓝灰色',
    },
    showClock: {
      type: 'boolean',
      default: true,
      label: '任务栏时钟',
      description: '任务栏右侧的系统托盘时钟',
    },
    showScanlines: {
      type: 'boolean',
      default: true,
      label: 'CRT 扫描线',
      description: '全屏细微扫描线质感，还原低分辨率显示器的观感',
    },
    singleClickOpen: {
      type: 'boolean',
      default: false,
      label: '单击打开图标',
      description: '关闭后恢复默认的双击（触屏两次轻点）打开方式',
    },
  },
};
