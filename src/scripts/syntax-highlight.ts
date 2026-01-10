/**
 * 语法高亮初始化脚本
 * 使用 Prism.js 为代码块添加语法高亮
 * 异步加载，避免阻塞首屏渲染
 */

let mutationObserver: MutationObserver | null = null;
let Prism: any = null;

/**
 * 动态加载 Prism.js 及其语言包
 */
async function loadPrism() {
  if (Prism) return Prism;

  // 动态导入 Prism 核心库
  const prismModule = await import('prismjs');
  Prism = prismModule.default;

  // 导入基础语言和依赖
  await import('prismjs/components/prism-markup');
  await import('prismjs/components/prism-markup-templating');
  await import('prismjs/components/prism-css');

  // 导入常用编程语言
  await import('prismjs/components/prism-javascript');
  await import('prismjs/components/prism-typescript');
  await import('prismjs/components/prism-jsx');
  await import('prismjs/components/prism-tsx');
  await import('prismjs/components/prism-scss');
  await import('prismjs/components/prism-json');
  await import('prismjs/components/prism-yaml');
  await import('prismjs/components/prism-markdown');
  await import('prismjs/components/prism-bash');
  await import('prismjs/components/prism-python');
  await import('prismjs/components/prism-java');
  await import('prismjs/components/prism-c');
  await import('prismjs/components/prism-cpp');
  await import('prismjs/components/prism-csharp');
  await import('prismjs/components/prism-go');
  await import('prismjs/components/prism-rust');
  await import('prismjs/components/prism-sql');
  await import('prismjs/components/prism-graphql');
  await import('prismjs/components/prism-docker');
  await import('prismjs/components/prism-nginx');
  await import('prismjs/components/prism-php');
  await import('prismjs/components/prism-ruby');
  await import('prismjs/components/prism-swift');
  await import('prismjs/components/prism-kotlin');

  return Prism;
}

/**
 * 初始化语法高亮
 */
export async function initSyntaxHighlight() {
  // 等待 Prism 加载完成
  const prism = await loadPrism();

  // 高亮现有代码块
  document.querySelectorAll('.notion-code > code').forEach((codeBlock: Element) => {
    if (codeBlock.className.includes('language-')) {
      prism.highlightElement(codeBlock);
    }
  });

  // 监听动态添加的代码块
  if (!mutationObserver) {
    mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const codeBlocks = (node as Element).querySelectorAll('.notion-code > code');
            codeBlocks.forEach((block: Element) => {
              if (block.className.includes('language-')) {
                prism.highlightElement(block);
              }
            });
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

// 页面加载完成后初始化（使用 requestIdleCallback 延迟执行）
if (typeof window !== 'undefined') {
  const initWhenIdle = () => {
    // 使用 requestIdleCallback 在浏览器空闲时加载
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => initSyntaxHighlight(), { timeout: 2000 });
    } else {
      // 降级方案：使用 setTimeout
      setTimeout(() => initSyntaxHighlight(), 100);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenIdle);
  } else {
    initWhenIdle();
  }
}
