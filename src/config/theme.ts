/**
 * 主题配置
 * 包含颜色方案、字体、排版等主题相关设置
 */

export const THEME_CONFIG = {
  // 默认主题（light | dark | auto）
  // auto 会根据系统偏好自动选择
  defaultTheme: 'auto' as 'light' | 'dark' | 'auto',

  // 颜色方案
  colors: {
    light: {
      primary: '#0066cc',
      secondary: '#6b7280',
      background: '#ffffff',
      surface: '#f9fafb',
      text: '#1a1a1a',
      textSecondary: '#6b7280',
      border: '#e5e7eb',
      codeBlock: '#f3f4f6',
      link: '#0066cc',
      linkHover: '#0052a3',
    },
    dark: {
      primary: '#3b82f6',
      secondary: '#9ca3af',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      border: '#334155',
      codeBlock: '#1e293b',
      link: '#60a5fa',
      linkHover: '#3b82f6',
    },
  },

  // 字体
  fonts: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
    mono: '"JetBrains Mono", "Fira Code", "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },

  // 排版
  typography: {
    baseFontSize: '16px',
    baseLineHeight: '1.6',
    headingWeight: '700',
    bodyWeight: '400',
    scale: {
      h1: '2.25rem', // 36px
      h2: '1.875rem', // 30px
      h3: '1.5rem', // 24px
      h4: '1.25rem', // 20px
      h5: '1.125rem', // 18px
      h6: '1rem', // 16px
    },
  },

  // 间距（基于 8px 系统）
  spacing: {
    xs: '0.5rem', // 8px
    sm: '1rem', // 16px
    md: '1.5rem', // 24px
    lg: '2rem', // 32px
    xl: '3rem', // 48px
    '2xl': '4rem', // 64px
  },

  // 圆角
  borderRadius: {
    sm: '0.25rem', // 4px
    md: '0.5rem', // 8px
    lg: '0.75rem', // 12px
    full: '9999px',
  },

  // 阴影
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  },

  // 过渡动画
  transitions: {
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
  },

  // 断点（响应式）
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const;

// 导出类型
export type ThemeConfig = typeof THEME_CONFIG;
