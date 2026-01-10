/**
 * 数学公式渲染脚本
 * 使用 KaTeX 渲染数学公式
 * 异步加载，避免阻塞首屏渲染
 */

let katex: any = null;
let mutationObserver: MutationObserver | null = null;

/**
 * 动态加载 KaTeX
 */
async function loadKatex() {
  if (katex) return katex;

  // 动态导入 KaTeX 及其样式
  const katexModule = await import('katex');
  katex = katexModule.default;
  await import('katex/dist/katex.min.css');

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
  // 初始渲染
  await renderMathEquations();

  // 监听动态添加的公式
  if (!mutationObserver) {
    mutationObserver = new MutationObserver(async (mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const element = node as Element;
            const hasBlockEquation = element.querySelector('.notion-equation-block .notion-equation');
            const hasInlineEquation = element.querySelector('code.notion-equation');

            if (hasBlockEquation || hasInlineEquation || element.classList.contains('notion-equation')) {
              renderMathEquations();
            }
          }
        });
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
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
