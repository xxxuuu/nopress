/**
 * 语法高亮初始化脚本
 * 使用 Prism.js 为代码块添加语法高亮
 * 异步加载，避免阻塞首屏渲染
 * 按页面实际出现的语言按需加载组件，依赖组件分层并行加载
 */

let Prism: any = null;

/**
 * 语言 → 动态加载器
 * markup / css / clike / javascript 由 prismjs 核心自带，无需在此注册
 * 未列出的语言保持纯文本（如 plain、mermaid），静默跳过
 */
const LANG_LOADERS: Record<string, () => Promise<unknown>> = {
  'markup-templating': () => import('prismjs/components/prism-markup-templating'),
  typescript: () => import('prismjs/components/prism-typescript'),
  jsx: () => import('prismjs/components/prism-jsx'),
  scss: () => import('prismjs/components/prism-scss'),
  c: () => import('prismjs/components/prism-c'),
  cpp: () => import('prismjs/components/prism-cpp'),
  json: () => import('prismjs/components/prism-json'),
  yaml: () => import('prismjs/components/prism-yaml'),
  markdown: () => import('prismjs/components/prism-markdown'),
  bash: () => import('prismjs/components/prism-bash'),
  python: () => import('prismjs/components/prism-python'),
  java: () => import('prismjs/components/prism-java'),
  csharp: () => import('prismjs/components/prism-csharp'),
  go: () => import('prismjs/components/prism-go'),
  rust: () => import('prismjs/components/prism-rust'),
  sql: () => import('prismjs/components/prism-sql'),
  graphql: () => import('prismjs/components/prism-graphql'),
  docker: () => import('prismjs/components/prism-docker'),
  nginx: () => import('prismjs/components/prism-nginx'),
  php: () => import('prismjs/components/prism-php'),
  ruby: () => import('prismjs/components/prism-ruby'),
  swift: () => import('prismjs/components/prism-swift'),
  kotlin: () => import('prismjs/components/prism-kotlin'),
  protobuf: () => import('prismjs/components/prism-protobuf'),
};

/**
 * Notion 语言名 → Prism 组件名的别名映射
 */
const LANG_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  'c#': 'csharp',
  shell: 'bash',
  sh: 'bash',
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  yml: 'yaml',
  golang: 'go',
};

/**
 * 第二层语言：组件内部依赖其他组件先完成注册
 * （值为依赖列表，依赖本身均为第一层或 prismjs 核心自带语言）
 */
const LANG_SECOND_LAYER: Record<string, string[]> = {
  tsx: ['jsx', 'typescript'],
  cpp: ['c'],
  php: ['markup-templating'],
};

/**
 * 收集页面代码块中出现的语言（经别名归一化）
 */
function collectLanguages(): string[] {
  const langs = new Set<string>();
  document.querySelectorAll('.notion-code > code[class*="language-"]').forEach((el) => {
    const match = el.className.match(/language-([\w#+-]+)/);
    if (match) {
      langs.add(LANG_ALIASES[match[1]] || match[1]);
    }
  });
  return Array.from(langs);
}

/**
 * 按需加载 Prism 核心及指定语言的组件
 * 组件依赖注册顺序，分两轮并行加载
 */
async function loadPrism(languages: string[]) {
  if (Prism) return Prism;

  // 动态导入 Prism 核心库（自带 markup/css/clike/javascript）
  const prismModule = await import('prismjs');
  Prism = prismModule.default;

  // 展开第二层语言的依赖
  const needed = new Set(languages);
  for (const lang of languages) {
    for (const dep of LANG_SECOND_LAYER[lang] || []) {
      needed.add(dep);
    }
  }

  const firstLayer: Promise<unknown>[] = [];
  const secondLayer: Promise<unknown>[] = [];
  for (const lang of needed) {
    const loader = LANG_LOADERS[lang];
    if (!loader) continue; // 不认识的语言保持纯文本
    (LANG_SECOND_LAYER[lang] ? secondLayer : firstLayer).push(loader());
  }

  // 第一轮：无依赖组件；第二轮：依赖第一轮注册结果组件
  await Promise.all(firstLayer);
  await Promise.all(secondLayer);

  return Prism;
}

/**
 * 初始化语法高亮
 */
export async function initSyntaxHighlight() {
  // 先收集页面语言，无代码块时直接返回，避免加载 Prism
  const languages = collectLanguages();
  if (languages.length === 0) return;

  // 等待 Prism 加载完成
  const prism = await loadPrism(languages);

  // 高亮现有代码块（静态站点内容不会动态变化，无需 MutationObserver 监听后续添加的代码块）
  document.querySelectorAll('.notion-code > code').forEach((codeBlock: Element) => {
    if (codeBlock.className.includes('language-')) {
      prism.highlightElement(codeBlock);
    }
  });
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
