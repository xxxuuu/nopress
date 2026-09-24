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
