/**
 * Retro 主题桌面交互
 *
 * 初始化时序（docs/THEMES.md §5）：脚本位于 body 尾部，执行时立即初始化
 * （astro:page-load 首次触发要等 load 事件，大图页面会长时间卡在 interactive），
 * 以 body 元素身份防重入；astro:page-load 监听保留，覆盖软导航
 * （导航在同一 document 里替换 body 元素）。document 级监听只在模块
 * 顶层注册一次，避免软导航后重复叠加。
 *
 * 桌面行为：
 * - 图标：单击选中，已选中的再次单击 / Enter / singleClickOpen 开启后的单击
 *   均在页面内打开应用窗口（不再整页跳转）；带 target=_blank 的外部链接保持原生行为。
 * - 窗口管理器：双击图标经 fetch 抓取目标页并提取 .window 内容，在窗口层内
 *   拖动 / 聚焦 / 最小化 / 最大化 / 关闭；任务栏为每个窗口维护一个任务按钮
 *   （点击聚焦，再次点击最小化）；聚焦窗口时同步 document.title，
 *   地址栏经 replaceState 跟随聚焦窗口（透传 history.state）。
 * - 注入窗口内的代码块复制按钮由本脚本接管（内核脚本只绑定首屏 DOM）。
 * - 开始菜单：点击开始按钮开合，点击外部或 Escape 关闭。
 * - 任务栏时钟：24 小时制 HH:MM，30 秒刷新。
 */
import { themeOptions } from '@lib/theme/options';

const { singleClickOpen = false } = themeOptions as { singleClickOpen?: boolean };

// ---------- 窗口管理器状态（软导航会销毁 DOM，openWindows 随页面重置；内容缓存跨页面复用） ----------

interface OpenWindow {
  url: string;
  title: string;
  el: HTMLElement;
  taskEl: HTMLButtonElement;
  minimized: boolean;
}

const windowCache = new Map<string, HTMLElement>();
const openWindows: OpenWindow[] = [];
let selectedIcon: HTMLElement | null = null;
let zTop = 10;
let cascade = 0;
let focusedUrl: string | null = null;
let originalTitle = '';

// 与 Icon.astro 一致的像素图标（任务按钮 / 骨架窗口在客户端渲染用）
const ICON_SVGS: Record<string, string> = {
  doc: `<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M2 0h9l3 3v12H2z" fill="#0a0a0a"/><path d="M3 1h7l3 3v10H3z" fill="#ffffff"/><path d="M10 1l3 3h-3z" fill="#c0c0c0"/><g fill="#7b7b7b"><rect x="5" y="7" width="6" height="1"/><rect x="5" y="9" width="6" height="1"/><rect x="5" y="11" width="4" height="1"/></g></svg>`,
  note: `<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M2 0h9l3 3v12H2z" fill="#0a0a0a"/><path d="M3 1h7l3 3v10H3z" fill="#ffffff"/><path d="M10 1l3 3h-3z" fill="#c0c0c0"/><rect x="5" y="5" width="1" height="9" fill="#c00000"/><g fill="#8f9bb0"><rect x="8" y="6" width="4" height="1"/><rect x="8" y="8" width="4" height="1"/><rect x="8" y="10" width="4" height="1"/><rect x="8" y="12" width="3" height="1"/></g></svg>`,
  folder: `<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M1 3h5l2 2h7v10H1z" fill="#0a0a0a"/><path d="M2 4h4l2 2h6v8H2z" fill="#ffdf7e"/><rect x="2" y="4" width="4" height="2" fill="#fff2ae"/><rect x="2" y="12" width="12" height="2" fill="#e9b940"/></svg>`,
  image: `<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="2" width="14" height="12" fill="#0a0a0a"/><rect x="2" y="3" width="12" height="10" fill="#ffffff"/><rect x="3" y="4" width="3" height="3" fill="#ffba08"/><path d="M2 12l4-5 3 5z" fill="#007000"/><path d="M7 12l3-4 3 4z" fill="#00a000"/></svg>`,
};

const WC_GLYPHS = {
  min: '<svg viewBox="0 0 6 6" width="6" height="6" aria-hidden="true"><rect y="4" width="6" height="2" fill="currentColor"/></svg>',
  max: '<svg viewBox="0 0 6 6" width="6" height="6" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M0 0h6v6H0V2zm1 2v3h4V2z"/></svg>',
  close: '<svg viewBox="0 0 6 6" width="6" height="6" aria-hidden="true"><path stroke="currentColor" stroke-width="1.1" fill="none" d="M.7.7l4.6 4.6M5.3.7L.7 5.3"/></svg>',
};

function deselectIcon(): void {
  selectedIcon?.classList.remove('selected');
  selectedIcon = null;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch
  ));
}

function iconMarkup(icon: string, emoji?: string): string {
  if (emoji) return `<span class="task-emoji">${escapeHtml(emoji)}</span>`;
  return ICON_SVGS[icon] ?? ICON_SVGS.doc;
}

// ---------- 焦点与视觉状态 ----------

function updateFocusVisuals(): void {
  for (const win of openWindows) {
    const active = !win.minimized && focusedUrl === win.url;
    win.taskEl.classList.toggle('active', active);
    if (active) win.el.removeAttribute('data-inactive');
    else win.el.setAttribute('data-inactive', '');
  }
  // 页面自身的窗口：有应用窗口聚焦时退为非活动态
  const pageWindow = document.querySelector('[data-window]');
  if (pageWindow) {
    if (focusedUrl) pageWindow.setAttribute('data-inactive', '');
    else pageWindow.removeAttribute('data-inactive');
  }
  document.title = focusedUrl
    ? openWindows.find(w => w.url === focusedUrl)?.title ?? originalTitle
    : originalTitle;
  // 地址栏跟随聚焦窗口（replaceState 不产生历史记录）：分享与刷新深链落到对应页面。
  // 必须透传 history.state——Astro ClientRouter 在 state 里维护 index/scroll 簿记，
  // 抹成 null 会让该条目上的前进/后退被路由器放弃，URL 与 DOM 脱钩
  const sharePath = focusedUrl ?? initialPath;
  if (location.pathname + location.search !== sharePath) {
    history.replaceState(history.state, '', sharePath);
  }
}

function focusWindow(win: OpenWindow): void {
  focusedUrl = win.url;
  zTop += 1;
  win.el.style.zIndex = String(zTop);
  updateFocusVisuals();
}

function focusTopmost(): void {
  const visible = openWindows.filter(w => !w.minimized);
  const top = visible[visible.length - 1];
  focusedUrl = top?.url ?? null;
  if (top) {
    zTop += 1;
    top.el.style.zIndex = String(zTop);
  }
  updateFocusVisuals();
}

function minimizeWindow(win: OpenWindow): void {
  win.minimized = true;
  win.el.style.display = 'none';
  focusTopmost();
}

function restoreFocus(win: OpenWindow): void {
  win.minimized = false;
  win.el.style.display = '';
  focusWindow(win);
}

function closeWindow(win: OpenWindow): void {
  const index = openWindows.indexOf(win);
  if (index >= 0) openWindows.splice(index, 1);
  win.el.remove();
  win.taskEl.remove();
  focusTopmost();
}

// ---------- 窗口创建 ----------

function windowLayer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-window-layer]');
}

function taskHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-task-windows]');
}

async function fetchWindow(url: string): Promise<HTMLElement> {
  const cached = windowCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const win = doc.querySelector('.window');
  if (!(win instanceof HTMLElement)) throw new Error('目标页面缺少窗口内容');
  win.removeAttribute('data-window');
  windowCache.set(url, win);
  return win;
}

function makeDraggable(winEl: HTMLElement, titlebar: HTMLElement): void {
  titlebar.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('.wc-button')) return;
    if (winEl.classList.contains('maximized')) return;
    const rect = winEl.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const move = (ev: PointerEvent) => {
      const layer = winEl.parentElement;
      if (!layer) return;
      const x = Math.min(Math.max(ev.clientX - offsetX, -rect.width + 80), layer.clientWidth - 80);
      const y = Math.min(Math.max(ev.clientY - offsetY, 0), layer.clientHeight - 24);
      winEl.style.left = `${x}px`;
      winEl.style.top = `${y}px`;
    };
    const stop = () => {
      titlebar.removeEventListener('pointermove', move);
      titlebar.removeEventListener('pointerup', stop);
      titlebar.removeEventListener('pointercancel', stop);
    };
    titlebar.addEventListener('pointermove', move);
    titlebar.addEventListener('pointerup', stop);
    titlebar.addEventListener('pointercancel', stop);
    titlebar.setPointerCapture(event.pointerId);
  });
}

function toggleMaximize(winEl: HTMLElement): void {
  // 进入最大化时暂存用户调整过的尺寸/位置，还原时恢复
  if (winEl.classList.toggle('maximized')) {
    for (const prop of ['width', 'height', 'left', 'top'] as const) {
      if (winEl.style[prop]) {
        winEl.dataset[`restore${prop[0].toUpperCase()}${prop.slice(1)}`] = winEl.style[prop];
        winEl.style[prop] = '';
      }
    }
  } else {
    winEl.style.width = winEl.dataset.restoreWidth ?? '';
    winEl.style.height = winEl.dataset.restoreHeight ?? '';
    winEl.style.left = winEl.dataset.restoreLeft ?? '';
    winEl.style.top = winEl.dataset.restoreTop ?? '';
  }
}

/** 右缘/下缘/右下角三向调整大小手柄（winEl 内绝对定位，指针事件驱动） */
function makeResizable(winEl: HTMLElement): void {
  if (winEl.dataset.resizable) return;
  winEl.dataset.resizable = '1';

  const startResize = (event: PointerEvent, dir: 'corner' | 'right' | 'bottom'): void => {
    if (winEl.classList.contains('maximized')) return;
    const layer = winEl.parentElement;
    if (!layer) return;
    const rect = winEl.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;
    document.body.style.userSelect = 'none';
    const move = (ev: PointerEvent): void => {
      const width = Math.min(Math.max(startWidth + (ev.clientX - startX), 320), layer.clientWidth);
      const height = Math.min(Math.max(startHeight + (ev.clientY - startY), 200), layer.clientHeight);
      if (dir !== 'bottom') winEl.style.width = `${width}px`;
      if (dir !== 'right') winEl.style.height = `${height}px`;
    };
    const stop = (): void => {
      document.body.style.userSelect = '';
      winEl.removeEventListener('pointermove', move);
      winEl.removeEventListener('pointerup', stop);
      winEl.removeEventListener('pointercancel', stop);
    };
    winEl.addEventListener('pointermove', move);
    winEl.addEventListener('pointerup', stop);
    winEl.addEventListener('pointercancel', stop);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handles: Array<['corner' | 'right' | 'bottom', string]> = [
    ['corner', 'rs-corner'],
    ['right', 'rs-right'],
    ['bottom', 'rs-bottom'],
  ];
  for (const [dir, cls] of handles) {
    const handle = document.createElement('span');
    handle.className = `rs-handle ${cls}`;
    handle.setAttribute('aria-hidden', 'true');
    handle.addEventListener('pointerdown', (event) => startResize(event, dir));
    winEl.append(handle);
  }
}

/** 按当前 DOM 元素解析注册项：控件处理器在事件时动态解析，避免缓存元素复用时闭包指向已销毁的旧状态 */
function winByElement(winEl: HTMLElement): OpenWindow | undefined {
  return openWindows.find(w => w.el === winEl);
}

function bindWindowControls(winEl: HTMLElement): void {
  // 缓存的窗口元素可能多次开关，控制绑定只做一次（z-index/位置由 openWindow 每次设置）
  if (winEl.dataset.controlsBound) return;
  winEl.dataset.controlsBound = '1';
  winEl.querySelectorAll<HTMLAnchorElement>('a.wc-button').forEach((a) => {
    a.addEventListener('click', (event) => {
      event.preventDefault();
      const win = winByElement(winEl);
      if (win) closeWindow(win);
    });
  });
  const maxButton = winEl.querySelector<HTMLElement>('[data-window-max]');
  maxButton?.addEventListener('click', () => toggleMaximize(winEl));
  makeDraggable(winEl, winEl.querySelector<HTMLElement>('.titlebar') ?? winEl);
  makeResizable(winEl);
  // 注入内容在 initIcons 之后进入 DOM，其中的资源管理器行需要补绑定
  winEl.querySelectorAll<HTMLAnchorElement>('[data-desktop-icon]').forEach(bindIcon);
}

function buildSkeleton(url: string, title: string, icon: string, emoji?: string): {
  el: HTMLElement;
  win: OpenWindow;
} {
  const el = document.createElement('section');
  el.className = 'window app-window';
  const step = cascade % 6;
  cascade += 1;
  // 级联偏移按窗口层钳制，小屏上后续窗口不致推出屏幕外
  const layerWidth = windowLayer()?.clientWidth ?? 800;
  const layerHeight = windowLayer()?.clientHeight ?? 600;
  el.style.left = `${Math.min(40 + step * 28, Math.max(layerWidth - 360, 0))}px`;
  el.style.top = `${Math.min(16 + step * 24, Math.max(layerHeight - 260, 0))}px`;
  el.innerHTML = `
    <header class="titlebar">
      <span class="titlebar-icon">${iconMarkup(icon, emoji)}</span>
      <h2 class="titlebar-text">${escapeHtml(title)}</h2>
      <span class="titlebar-controls">
        <button type="button" class="wc-button" data-win-min title="最小化" aria-label="最小化">${WC_GLYPHS.min}</button>
        <button type="button" class="wc-button" data-window-max title="最大化" aria-label="切换最大化">${WC_GLYPHS.max}</button>
        <button type="button" class="wc-button" data-win-close title="关闭" aria-label="关闭">${WC_GLYPHS.close}</button>
      </span>
    </header>
    <div class="window-body"><div class="win-loading">正在打开…</div></div>`;
  const taskEl = document.createElement('button');
  taskEl.type = 'button';
  taskEl.className = 'task-button';
  taskEl.title = title;
  taskEl.innerHTML = `${iconMarkup(icon, emoji)}<span class="task-button-text">${escapeHtml(title)}</span>`;
  const win: OpenWindow = { url, title, el, taskEl, minimized: false };
  taskEl.addEventListener('click', () => {
    if (!win.minimized && focusedUrl === win.url) minimizeWindow(win);
    else restoreFocus(win);
  });
  el.querySelector<HTMLElement>('[data-win-min]')?.addEventListener('click', () => minimizeWindow(win));
  el.querySelector<HTMLElement>('[data-win-close]')?.addEventListener('click', () => closeWindow(win));
  el.querySelector<HTMLElement>('[data-window-max]')?.addEventListener('click', () => toggleMaximize(el));
  makeDraggable(el, el.querySelector<HTMLElement>('.titlebar') ?? el);
  makeResizable(el);
  return { el, win };
}

function openWindow(url: string, title: string, icon: string, emoji?: string): void {
  const layer = windowLayer();
  const host = taskHost();
  if (!layer || !host) return;

  const existing = openWindows.find(w => w.url === url);
  if (existing) {
    if (existing.minimized) restoreFocus(existing);
    else focusWindow(existing);
    return;
  }

  const { el, win } = buildSkeleton(url, title, icon, emoji);
  layer.append(el);
  host.append(win.taskEl);
  openWindows.push(win);
  focusWindow(win);

  fetchWindow(url)
    .then((fetched) => {
      if (!el.isConnected) return; // 等待期间窗口已被关闭
      fetched.classList.add('app-window');
      // 缓存元素可能带着上一次的残留状态（最小化/最大化/非活动态），复用前清零
      fetched.style.display = '';
      fetched.classList.remove('maximized');
      fetched.removeAttribute('data-inactive');
      for (const prop of ['restoreWidth', 'restoreHeight', 'restoreLeft', 'restoreTop']) {
        delete fetched.dataset[prop];
      }
      // 继承骨架窗口的位置与用户在加载期间调整的尺寸
      fetched.style.left = el.style.left;
      fetched.style.top = el.style.top;
      fetched.style.width = el.style.width;
      fetched.style.height = el.style.height;
      fetched.style.zIndex = el.style.zIndex;
      win.el = fetched;
      el.replaceWith(fetched);
      bindWindowControls(fetched);
    })
    .catch((err: unknown) => {
      const body = el.querySelector('.window-body');
      if (body) {
        body.innerHTML = `<div class="win-error">无法打开「${escapeHtml(title)}」${
          err instanceof Error ? `（${escapeHtml(err.message)}）` : ''
        }</div>`;
      }
    });
}

function openFromIcon(icon: HTMLElement): void {
  const url = icon.getAttribute('href');
  if (!url) return;
  openWindow(
    url,
    icon.dataset.title ?? icon.textContent?.trim() ?? url,
    icon.dataset.icon ?? 'doc',
    icon.dataset.emoji,
  );
}

// ---------- 桌面图标 ----------

function bindIcon(anchor: HTMLAnchorElement): void {
  if (singleClickOpen) anchor.title = anchor.title.replace('双击打开', '单击打开');
  anchor.addEventListener('click', (event) => {
    if (anchor.target === '_blank') return; // 外部链接：原生新开
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (singleClickOpen || event.detail === 0) {
      event.preventDefault();
      openFromIcon(anchor);
      return;
    }
    if (selectedIcon === anchor) {
      event.preventDefault();
      openFromIcon(anchor);
      return;
    }
    event.preventDefault();
    deselectIcon();
    selectedIcon = anchor;
    anchor.classList.add('selected');
  });
}

function initIcons(): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-desktop-icon]').forEach(bindIcon);
}

// ---------- 开始菜单 / 时钟 ----------

function closeStartMenu(): void {
  const toggle = document.querySelector<HTMLElement>('[data-start-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-start-menu]');
  if (!toggle || !menu) return;
  menu.classList.remove('open');
  toggle.classList.remove('pressed');
  toggle.setAttribute('aria-expanded', 'false');
}

function initStartMenu(): void {
  const toggle = document.querySelector<HTMLElement>('[data-start-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-start-menu]');
  if (!toggle || !menu) return;
  closeStartMenu();
  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = menu.classList.toggle('open');
    toggle.classList.toggle('pressed', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
}

/** 任务栏「桌面」按钮：有窗口时显示桌面（全部最小化，再点还原），无窗口时原生导航回首页 */
function initShowDesktop(): void {
  const button = document.querySelector<HTMLAnchorElement>('[data-show-desktop]');
  if (!button) return;
  button.addEventListener('click', (event) => {
    if (openWindows.length === 0) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const anyVisible = openWindows.some(w => !w.minimized);
    for (const win of openWindows) {
      win.minimized = anyVisible;
      win.el.style.display = anyVisible ? 'none' : '';
    }
    focusTopmost();
  });
}

let clockTimer: ReturnType<typeof setInterval> | undefined;

function startClock(): void {
  if (clockTimer !== undefined) clearInterval(clockTimer);
  const el = document.querySelector<HTMLElement>('[data-clock]');
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  tick();
  clockTimer = setInterval(tick, 30_000);
}

// ---------- 图片查看器 ----------
// 点击内容图片（渲染器包装的 a.glightbox）弹出复古查看器窗口：
// 上一张/下一张遍历同一正文内的全部图片，缩放/1:1/适应切换，Esc/方向键可用。

let viewerEl: HTMLElement | null = null;
let viewerLinks: HTMLAnchorElement[] = [];
let viewerIndex = 0;
let viewerScale: number | 'fit' = 'fit';
let onViewerResize: (() => void) | null = null;
let viewerPrevTitle = '';

function closeViewer(): void {
  if (!viewerEl) return;
  viewerEl.remove();
  viewerEl = null;
  if (onViewerResize) {
    window.removeEventListener('resize', onViewerResize);
    onViewerResize = null;
  }
  document.title = viewerPrevTitle;
}

function viewerFitScale(naturalWidth: number, naturalHeight: number): number {
  const stage = viewerEl?.querySelector<HTMLElement>('[data-viewer-stage]');
  if (!stage || !naturalWidth || !naturalHeight) return 1;
  return Math.min(stage.clientWidth / naturalWidth, stage.clientHeight / naturalHeight);
}

function applyViewerZoom(): void {
  if (!viewerEl) return;
  const img = viewerEl.querySelector<HTMLImageElement>('[data-viewer-img]');
  const status = viewerEl.querySelector<HTMLElement>('[data-viewer-status]');
  if (!img || !status || !img.naturalWidth) return;
  const scale = viewerScale === 'fit' ? viewerFitScale(img.naturalWidth, img.naturalHeight) : viewerScale;
  img.style.width = `${Math.max(1, Math.round(img.naturalWidth * scale))}px`;
  status.textContent = `第 ${viewerIndex + 1}/${viewerLinks.length} 张 · ${img.naturalWidth}×${img.naturalHeight} · ${Math.round(scale * 100)}%`;
}

function loadViewerImage(): void {
  if (!viewerEl) return;
  const link = viewerLinks[viewerIndex];
  const img = viewerEl.querySelector<HTMLImageElement>('[data-viewer-img]');
  const status = viewerEl.querySelector<HTMLElement>('[data-viewer-status]');
  const caption = viewerEl.querySelector<HTMLElement>('[data-viewer-caption]');
  const title = viewerEl.querySelector<HTMLElement>('.titlebar-text');
  if (!link || !img) return;
  const description = link.dataset.description?.trim() ?? '';
  if (title) title.textContent = description || '图片查看器';
  if (caption) caption.textContent = description;
  if (status) status.textContent = '加载中…';
  img.style.width = '';
  img.onload = applyViewerZoom;
  img.onerror = () => {
    if (status) status.textContent = '图片加载失败';
  };
  img.src = link.href;
}

function stepViewer(delta: number): void {
  if (!viewerEl || viewerLinks.length === 0) return;
  viewerIndex = (viewerIndex + delta + viewerLinks.length) % viewerLinks.length;
  viewerScale = 'fit';
  loadViewerImage();
}

function setViewerScale(scale: number | 'fit'): void {
  const img = viewerEl?.querySelector<HTMLImageElement>('[data-viewer-img]');
  if (!viewerEl || !img?.naturalWidth) return;
  viewerScale = scale === 'fit' ? 'fit' : Math.min(Math.max(scale, 0.05), 8);
  applyViewerZoom();
}

function currentViewerScale(): number {
  const img = viewerEl?.querySelector<HTMLImageElement>('[data-viewer-img]');
  if (!img?.naturalWidth) return 1;
  return viewerScale === 'fit' ? viewerFitScale(img.naturalWidth, img.naturalHeight) : viewerScale;
}

function openViewer(links: HTMLAnchorElement[], index: number): void {
  closeViewer();
  if (links.length === 0) return;
  viewerLinks = links;
  viewerIndex = Math.min(Math.max(index, 0), links.length - 1);
  viewerScale = 'fit';
  viewerPrevTitle = document.title;

  const el = document.createElement('div');
  el.className = 'image-viewer';
  el.innerHTML = `
    <div class="image-viewer-window">
      <header class="titlebar">
        <span class="titlebar-icon">${ICON_SVGS.image}</span>
        <h2 class="titlebar-text">图片查看器</h2>
        <span class="titlebar-controls">
          <button type="button" class="wc-button" data-viewer-close title="关闭" aria-label="关闭">${WC_GLYPHS.close}</button>
        </span>
      </header>
      <div class="viewer-toolbar">
        <button type="button" class="toolbar-button" data-viewer-prev>« 上一张</button>
        <button type="button" class="toolbar-button" data-viewer-next>下一张 »</button>
        <span class="toolbar-sep" aria-hidden="true"></span>
        <button type="button" class="toolbar-button" data-viewer-zoom-out>缩小</button>
        <button type="button" class="toolbar-button" data-viewer-zoom-in>放大</button>
        <button type="button" class="toolbar-button" data-viewer-fit>适应</button>
        <button type="button" class="toolbar-button" data-viewer-actual>1:1</button>
        <span class="toolbar-sep" aria-hidden="true"></span>
        <button type="button" class="toolbar-button" data-viewer-original>原图</button>
      </div>
      <div class="image-viewer-stage" data-viewer-stage>
        <img data-viewer-img alt="" />
      </div>
      <footer class="statusbar">
        <span class="status-cell" data-viewer-status>加载中…</span>
        <span class="status-cell status-right" data-viewer-caption></span>
      </footer>
    </div>`;
  document.body.append(el);
  viewerEl = el;

  el.addEventListener('mousedown', (event) => {
    if (event.target === el) closeViewer(); // 点击背板关闭
  });
  el.querySelectorAll<HTMLElement>('[data-viewer-close]').forEach((button) => {
    button.addEventListener('click', closeViewer);
  });
  el.querySelector<HTMLElement>('[data-viewer-prev]')?.addEventListener('click', () => stepViewer(-1));
  el.querySelector<HTMLElement>('[data-viewer-next]')?.addEventListener('click', () => stepViewer(1));
  el.querySelector<HTMLElement>('[data-viewer-zoom-out]')?.addEventListener('click', () => setViewerScale(currentViewerScale() / 1.25));
  el.querySelector<HTMLElement>('[data-viewer-zoom-in]')?.addEventListener('click', () => setViewerScale(currentViewerScale() * 1.25));
  el.querySelector<HTMLElement>('[data-viewer-fit]')?.addEventListener('click', () => setViewerScale('fit'));
  el.querySelector<HTMLElement>('[data-viewer-actual]')?.addEventListener('click', () => setViewerScale(1));
  el.querySelector<HTMLElement>('[data-viewer-original]')?.addEventListener('click', () => {
    const link = viewerLinks[viewerIndex];
    if (link) window.open(link.href, '_blank', 'noopener');
  });
  el.querySelector<HTMLElement>('[data-viewer-img]')?.addEventListener('click', () => {
    // 点击图片在 1:1 与适应之间切换
    setViewerScale(viewerScale === 'fit' ? 1 : 'fit');
  });
  onViewerResize = () => {
    if (viewerScale === 'fit') applyViewerZoom();
  };
  window.addEventListener('resize', onViewerResize);
  loadViewerImage();
}

// 内容图片点击拦截：默认行为是整页跳转原图，统一改为查看器展示
document.addEventListener('click', (event) => {
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // 修饰键：保留新标签打开原图
  const link = (event.target as HTMLElement | null)?.closest?.<HTMLAnchorElement>('a.glightbox');
  if (!link || !link.querySelector('img')) return;
  event.preventDefault();
  const scope = link.closest('.notion-content') ?? document;
  const links = Array.from(scope.querySelectorAll<HTMLAnchorElement>('a.glightbox'))
    .filter(a => a.querySelector('img'));
  openViewer(links, links.indexOf(link));
});

// ---------- document 级监听（模块只执行一次，处理器内部实时查询当前 DOM） ----------

document.addEventListener('click', (event) => {
  const target = event.target as Element | null;
  if (selectedIcon && !selectedIcon.contains(target)) deselectIcon();
  const menu = document.querySelector('[data-start-menu]');
  if (menu?.classList.contains('open') && !menu.contains(target)) closeStartMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    deselectIcon();
    closeStartMenu();
    closeViewer();
    return;
  }
  if (!viewerEl) return;
  if (event.key === 'ArrowLeft') stepViewer(-1);
  if (event.key === 'ArrowRight') stepViewer(1);
});

// 代码块复制委托：document 级单次注册，覆盖慢加载首屏与注入窗口两种来源
// （内核 code-copy 只绑 astro:page-load 时已存在的 DOM，二者职责不重叠）
document.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest('.notion-code-copy');
  if (!button) return;
  const code = button.closest('.notion-code-block')?.querySelector('code');
  if (!code) return;
  navigator.clipboard.writeText(code.textContent ?? '').catch(() => {});
  button.classList.add('copied');
  setTimeout(() => button.classList.remove('copied'), 2000);
});

// ---------- 每次页面加载（首次 + 软导航后） ----------
//
// 首次加载不等 astro:page-load：该事件初始时机晚于 DOM 就绪（等 load 事件），
// 图片多的页面会长时间卡在 interactive，交互全部延迟。脚本位于 body 尾部，
// DOM 已就绪，立即初始化。软导航在同一 document 里替换 body 元素，
// 故以 body 身份做防重标记：初始立即初始化后，首次 astro:page-load 不重复跑。
let initializedFor: HTMLElement | null = null;
let initialPath = '/';

function init(): void {
  if (initializedFor === document.body) return;
  initializedFor = document.body;
  selectedIcon = null;
  openWindows.length = 0;
  focusedUrl = null;
  zTop = 10;
  cascade = 0;
  originalTitle = document.title;
  initialPath = location.pathname + location.search;
  // 软导航替换 body 后查看器 DOM 已随之消失，只重置模块状态与 window 级监听
  if (onViewerResize) {
    window.removeEventListener('resize', onViewerResize);
    onViewerResize = null;
  }
  viewerEl = null;
  initIcons();
  initStartMenu();
  initShowDesktop();
  startClock();
  // 页面自身的窗口（直接访问 /post/* 等时渲染）：绑定最大化切换
  const pageWindow = document.querySelector<HTMLElement>('[data-window]');
  pageWindow?.querySelector<HTMLElement>('[data-window-max]')
    ?.addEventListener('click', () => toggleMaximize(pageWindow));

  // 窗口层：点击聚焦（注入内容的代码块复制已由 document 级委托接管）
  const layer = windowLayer();
  if (layer) {
    layer.addEventListener('mousedown', (event) => {
      const target = (event.target as HTMLElement).closest('.app-window');
      if (!target) return;
      const win = openWindows.find(w => w.el === target);
      if (win && !win.minimized && focusedUrl !== win.url) focusWindow(win);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
document.addEventListener('astro:page-load', init);
