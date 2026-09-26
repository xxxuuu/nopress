/**
 * Mermaid 图表渲染脚本
 * 用于渲染流程图、序列图、甘特图等
 * 异步加载，避免阻塞首屏渲染
 */

let mermaid: any = null;

/**
 * 动态加载 Mermaid
 */
async function loadMermaid() {
  if (mermaid) return mermaid;

  const mermaidModule = await import('mermaid');
  mermaid = mermaidModule.default;

  return mermaid;
}

/**
 * 初始化 Mermaid 配置
 */
async function initMermaidConfig() {
  const mermaidLib = await loadMermaid();

  mermaidLib.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'inherit',
    logLevel: 'error',
    // 主题配置
    themeVariables: {},
    // 流程图配置 - 增加缩放比例
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
      padding: 20,
    },
    // 序列图配置
    sequence: {
      useMaxWidth: true,
      messageMargin: 60,
      boxMargin: 10,
    },
    // 甘特图配置
    gantt: {
      useMaxWidth: true,
      fontSize: 14,
    },
    // 类图配置
    class: {
      useMaxWidth: true,
    },
    // 状态图配置
    state: {
      useMaxWidth: true,
    },
    // 实体关系图配置
    er: {
      useMaxWidth: true,
    },
    // Git 图配置
    gitGraph: {
      useMaxWidth: true,
      showBranches: true,
      showCommitLabel: true,
      mainBranchName: 'main',
      rotateCommitLabel: true,
    },
  });
}

/**
 * 渲染所有 Mermaid 图表
 */
async function renderMermaidDiagrams() {
  const mermaidLib = await loadMermaid();

  // 查找所有 mermaid 代码块
  const mermaidBlocks = document.querySelectorAll('pre code.language-mermaid');

  if (mermaidBlocks.length === 0) return;

  // 为每个代码块创建渲染容器
  mermaidBlocks.forEach((codeBlock, index) => {
    const pre = codeBlock.parentElement;
    if (!pre) return;

    // 获取 mermaid 代码
    const code = codeBlock.textContent || '';

    // 创建渲染容器
    const container = document.createElement('div');
    container.className = 'mermaid-diagram';
    container.setAttribute('data-processed', 'false');

    // 创建一个带有唯一 ID 的 div
    const mermaidDiv = document.createElement('div');
    mermaidDiv.className = 'mermaid';
    mermaidDiv.textContent = code;
    mermaidDiv.id = `mermaid-${index}-${Date.now()}`;

    container.appendChild(mermaidDiv);

    // 替换原始代码块
    pre.replaceWith(container);
  });

  // 渲染所有 mermaid 图表
  try {
    await mermaidLib.run({
      querySelector: '.mermaid',
    });
  } catch (error) {
    console.error('Mermaid render error:', error);
  }
}

/**
 * 初始化 Mermaid 渲染
 */
export async function initMermaidRendering() {
  // 先检查页面是否存在 Mermaid 代码块，避免无图表页面加载 Mermaid（约 500KB）
  if (document.querySelectorAll('pre code.language-mermaid').length === 0) return;

  await initMermaidConfig();
  // 静态站点内容不会动态变化，无需 MutationObserver 监听后续添加的代码块
  await renderMermaidDiagrams();
}

// astro:page-load 在首次加载与每次客户端导航后都会触发（依赖布局中的 <ClientRouter />）；
// requestIdleCallback 延迟执行避免阻塞首屏渲染
if (typeof window !== 'undefined') {
  document.addEventListener('astro:page-load', () => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => initMermaidRendering(), { timeout: 3000 });
    } else {
      setTimeout(() => initMermaidRendering(), 200);
    }
  });
}
