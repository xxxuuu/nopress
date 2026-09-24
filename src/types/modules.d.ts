/**
 * Prism.js 语言组件无官方类型定义（@types/prismjs 不覆盖 components/* 子路径），
 * 组件通过运行时副作用注册语言，无需类型。
 */
declare module 'prismjs/components/*';

/**
 * 客户端脚本通过 URL 按需加载的远程 ESM 模块（如 PhotoSwipe CDN 构建），
 * TS 无法解析远程模块，统一声明为任意模块。
 */
declare module 'https://*';

/**
 * 主题选项虚拟模块：实际值由主题集成在构建期注入
 * （声明默认值 + NOPRESS_THEME_OPTIONS 覆盖值合并），见 src/lib/theme/astro-integration.ts。
 * 主题代码请通过 @lib/theme/options 读取。
 */
declare module 'virtual:nopress/theme-options' {
  export const themeOptions: Record<string, string | number | boolean>;
}
