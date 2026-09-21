/**
 * 数学公式渲染脚本
 * 使用 KaTeX 渲染数学公式
 * 异步加载，避免阻塞首屏渲染
 */

let katex: any = null;

/**
 * 动态加载 KaTeX
 */
async function loadKatex() {
  if (katex) return katex;

  // 动态导入 KaTeX 及其样式
  const katexModule = await import('katex');
  katex = katexModule.default;

  // 样式用 ?inline 导入：若走普通 CSS import，Vite 会把 CSS 抽成独立 chunk
  // 并被 Astro 静态注入到所有页面（无论是否包含公式）；
  // ?inline 会把 CSS 字符串打进 JS chunk（内部字体 url() 已重写为本地路径），仅在真正加载 KaTeX 时注入
  const { default: katexCss } = await import('katex/dist/katex.min.css?inline');
  const style = document.createElement('style');
  style.textContent = katexCss;
  document.head.appendChild(style);

  return katex;
}

/**
 * 渲染所有数学公式
 */
async function renderMathEquations() {
  const katexLib = await loadKatex();

  // 渲染块级公式 ($$...$$)
  const blockEquations = document.querySelectorAll('.notion-equation-block .notion-equation');
  blockEquations.forEach((element) => {
    const text = element.textContent;
    if (text) {
      // 移除 $$ 符号
      const expression = text.replace(/^\$\$|\$\$$/g, '').trim();
      try {
        katexLib.render(expression, element as HTMLElement, {
          displayMode: true,
          throwOnError: false,
          errorColor: '#cc0000',
          strict: 'warn',
        });
      } catch (error) {
        console.error('[KaTeX] Failed to render block equation:', error);
      }
    }
  });

  // 渲染行内公式 ($...$)
  const inlineEquations = document.querySelectorAll('code.notion-equation');
  inlineEquations.forEach((element) => {
    const text = element.textContent;
    if (text) {
      // 移除 $ 符号
      const expression = text.replace(/^\$|\$$/g, '').trim();
      try {
        katexLib.render(expression, element as HTMLElement, {
          displayMode: false,
          throwOnError: false,
          errorColor: '#cc0000',
          strict: 'warn',
        });
      } catch (error) {
        console.error('[KaTeX] Failed to render inline equation:', error);
      }
    }
  });
}

/**
 * 初始化数学公式渲染
 */
export async function initMathRendering() {
  // 先检查页面是否存在公式，避免无公式页面加载 KaTeX（JS + CSS 约 300KB）
  const hasEquations =
    document.querySelector('.notion-equation-block .notion-equation') !== null ||
    document.querySelector('code.notion-equation') !== null;
  if (!hasEquations) return;

  // 初始渲染（静态站点内容不会动态变化，无需 MutationObserver 监听后续添加的公式）
  await renderMathEquations();
}

// 页面加载完成后延迟初始化（使用 requestIdleCallback 避免阻塞首屏渲染）
if (typeof window !== 'undefined') {
  const initWhenIdle = () => {
    // 使用 requestIdleCallback 在浏览器空闲时加载
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => initMathRendering(), { timeout: 3000 });
    } else {
      // 降级方案：使用 setTimeout
      setTimeout(() => initMathRendering(), 200);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenIdle);
  } else {
    initWhenIdle();
  }
}
