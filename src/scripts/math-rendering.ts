/**
 * 数学公式渲染脚本
 * 使用 KaTeX 渲染数学公式
 * 异步加载，避免阻塞首屏渲染
 */

let katex: any = null;

/**
 * 确保 KaTeX 样式存在于 head（幂等）
 *
 * 客户端导航（<ClientRouter />）swap 时会移除 head 中 JS 注入的 <style>，
 * 而下方的 katex 模块缓存使 loadKatex 只执行一次——因此样式检查必须
 * 脱离模块缓存，在每次页面加载时独立执行。
 */
async function ensureKatexCss() {
  const KATEX_STYLE_FLAG = 'data-katex-css';
  if (document.head.querySelector(`style[${KATEX_STYLE_FLAG}]`)) return;

  // 样式用 ?inline 导入：若走普通 CSS import，Vite 会把 CSS 抽成独立 chunk
  // 并被 Astro 静态注入到所有页面（无论是否包含公式）；
  // ?inline 会把 CSS 字符串打进 JS chunk（内部字体 url() 已重写为本地路径），仅在真正加载 KaTeX 时注入
  const { default: katexCss } = await import('katex/dist/katex.min.css?inline');
  const style = document.createElement('style');
  style.textContent = katexCss;
  style.setAttribute(KATEX_STYLE_FLAG, '');
  document.head.appendChild(style);
}

/**
 * 动态加载 KaTeX
 */
async function loadKatex() {
  if (katex) return katex;

  const katexModule = await import('katex');
  katex = katexModule.default;

  return katex;
}

/**
 * 渲染所有数学公式
 */
async function renderMathEquations() {
  // 渲染块级公式 ($$...$$)
  const blockEquations = document.querySelectorAll('.notion-equation-block .notion-equation');
  // 渲染行内公式 ($...$)
  const inlineEquations = document.querySelectorAll('code.notion-equation');
  // 无公式页面不加载 KaTeX 及其样式（保持惰性）
  if (blockEquations.length === 0 && inlineEquations.length === 0) return;

  await ensureKatexCss();
  const katexLib = await loadKatex();

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

// astro:page-load 在首次加载与每次客户端导航后都会触发（依赖布局中的 <ClientRouter />）；
// requestIdleCallback 延迟执行避免阻塞首屏渲染
if (typeof window !== 'undefined') {
  document.addEventListener('astro:page-load', () => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => initMathRendering(), { timeout: 3000 });
    } else {
      setTimeout(() => initMathRendering(), 200);
    }
  });
}
