/**
 * 图片 Gallery 功能
 * 使用 PhotoSwipe v5 实现完整的图片预览体验（包含缩略图支持）
 */

const GALLERY_SELECTOR = '.glightbox[data-gallery="article-images"]';

// PhotoSwipe 打开时会把当前实例挂到 window.pswp（官方行为），这里只做存在性判断
declare global {
  interface Window {
    pswp?: unknown;
  }
}

/** 缩略图栏的请求尺寸：栏内格子最大 60px，240px 覆盖到 3x 屏，避免按文章原图（1400px）加载 */
const THUMB_WIDTH = 240;

// 客户端导航会重复进入 setupGallery，销毁上一轮的 lightbox（其内部绑定旧 DOM）
let activeLightbox: { destroy?: () => void } | null = null;

/**
 * 灯箱初始化是异步的（idle 调度 + 模块加载），期间点击图片会触发 <a> 默认行为——
 * 整页跳转到原图。capture 阶段先拦下这类点击并记住索引，初始化完成后补开灯箱。
 */
let earlyClickIndex: number | null = null;
let earlyClickGuard: ((e: MouseEvent) => void) | null = null;

function installEarlyClickGuard() {
  if (earlyClickGuard || !document.querySelector(GALLERY_SELECTOR)) return;
  earlyClickGuard = (e: MouseEvent) => {
    // 修饰键点击（新标签打开原图等）不拦截，与 PhotoSwipe 自身对修饰键的处理一致
    if (window.pswp || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const target = (e.target as HTMLElement | null)?.closest?.(GALLERY_SELECTOR);
    if (!target) return;
    e.preventDefault();
    if (earlyClickIndex === null) {
      earlyClickIndex = Array.from(document.querySelectorAll(GALLERY_SELECTOR)).indexOf(target);
    }
  };
  document.addEventListener('click', earlyClickGuard, true);
}

function removeEarlyClickGuard() {
  if (!earlyClickGuard) return;
  document.removeEventListener('click', earlyClickGuard, true);
  earlyClickGuard = null;
}

/** PhotoSwipe 核心模块加载函数：pswpModule 与打开前预热共用 */
async function loadPswpCore() {
  return (await import('https://cdn.jsdelivr.net/npm/photoswipe@5.4.3/dist/photoswipe.esm.min.js')).default;
}

// 核心模块约 50KB，只在首次会话预热一次，避免每页重复下载
let coreWarmed = false;
function scheduleCoreWarmup() {
  if (coreWarmed) return;
  const warm = () => {
    coreWarmed = true;
    loadPswpCore().catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(warm, { timeout: 5000 });
  } else {
    setTimeout(warm, 1500);
  }
}

async function setupGallery() {
  const galleryLinks = document.querySelectorAll(GALLERY_SELECTOR);

  if (galleryLinks.length === 0) {
    console.log('[ImageGallery] No images found');
    return;
  }

  activeLightbox?.destroy?.();
  activeLightbox = null;

  // 注入 PhotoSwipe 样式（仅在有图片的页面加载，替代 BaseLayout 的全站 preload）
  loadPhotoSwipeCss();

  try {
    // 动态导入 PhotoSwipeLightbox（轻量）；
    // photoswipe 核心通过 pswpModule 传入加载函数，推迟到首次点击打开灯箱时才下载
    const { default: PhotoSwipeLightbox } = await import('https://cdn.jsdelivr.net/npm/photoswipe@5.4.3/dist/photoswipe-lightbox.esm.min.js');

    // 初始化 PhotoSwipe Lightbox
    const lightbox = new PhotoSwipeLightbox({
      gallery: 'body',
      children: GALLERY_SELECTOR,
      pswpModule: loadPswpCore,
      showHideAnimationType: 'zoom',
      // 其他配置
      padding: { top: 20, bottom: 60, left: 20, right: 20 },
      bgOpacity: 0.95,
      loop: true,
    });

    // 添加自定义 UI 元素
    lightbox.on('uiRegister', function() {
      // 图片说明
      lightbox.pswp.ui.registerElement({
        name: 'custom-caption',
        order: 9,
        isButton: false,
        appendTo: 'root',
        html: '',
        onInit: (el: any) => {
          const updateCaption = () => {
            const currSlide = lightbox.pswp.currSlide;
            if (currSlide && currSlide.data.element) {
              const description = currSlide.data.element.getAttribute('data-description') || '';
              el.innerHTML = description;
              el.className = description ? 'pswp__caption' : 'pswp__caption pswp__caption--empty';
            }
          };

          lightbox.pswp.on('change', updateCaption);
          updateCaption();
        }
      });

      // 缩略图栏
      lightbox.pswp.ui.registerElement({
        name: 'thumbnails-bar',
        order: 10,
        isButton: false,
        appendTo: 'root',
        html: '',
        onInit: (el: any) => {
          el.className = 'pswp__thumbnails';

          // 更新激活状态并滚动到当前缩略图
          const updateActive = () => {
            const thumbs = el.querySelectorAll('.pswp__thumbnail');
            thumbs.forEach((thumb: Element, index: number) => {
              if (index === lightbox.pswp.currIndex) {
                thumb.classList.add('pswp__thumbnail--active');

                // 自动滚动到当前激活的缩略图
                const thumbElement = thumb as HTMLElement;
                const container = el as HTMLElement;
                const thumbLeft = thumbElement.offsetLeft;
                const thumbWidth = thumbElement.offsetWidth;
                const containerWidth = container.offsetWidth;

                // 计算目标滚动位置（让缩略图居中）
                const targetScroll = thumbLeft - (containerWidth / 2) + (thumbWidth / 2);

                // 平滑滚动到目标位置
                container.scrollTo({
                  left: targetScroll,
                  behavior: 'smooth'
                });
              } else {
                thumb.classList.remove('pswp__thumbnail--active');
              }
            });
          };

          // 点击缩略图跳转
          el.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const thumb = target.closest('.pswp__thumbnail');
            if (thumb) {
              const index = parseInt((thumb as HTMLElement).dataset.index || '0');
              lightbox.pswp.goTo(index);
            }
          });

          // 阻止滚动事件穿透到背后的页面
          el.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();

            // 手动处理横向滚动
            const container = el as HTMLElement;
            container.scrollLeft += e.deltaY;
          }, { passive: false });

          // 动态检测是否溢出，调整对齐方式
          const checkOverflow = () => {
            const isOverflowing = el.scrollWidth > el.offsetWidth;
            el.style.justifyContent = isOverflowing ? 'flex-start' : 'center';
          };

          // 窗口大小改变时重新检测（随灯箱销毁解绑，避免软导航后累积监听器）
          const onResize = () => { checkOverflow(); };
          window.addEventListener('resize', onResize);
          lightbox.pswp.on('destroy', () => {
            window.removeEventListener('resize', onResize);
          });

          // 填充缩略图：延迟到打开动画结束后，且只请求小尺寸图并标记 lazy/async。
          // 打开瞬间的成本从「N 张文章原图的下载 + 解码」（随图片数线性增长）
          // 降为「仅可视区域的几张小图」，横向滚动到哪张才加载哪张
          lightbox.pswp.on('openingAnimationEnd', () => {
            const links = document.querySelectorAll(GALLERY_SELECTOR);
            const frag = document.createDocumentFragment();

            links.forEach((link, index) => {
              const linkEl = link as HTMLAnchorElement;
              const img = linkEl.querySelector('img') as HTMLImageElement | null;
              const thumbSrc = toThumbSrc(img ? img.src : linkEl.href);

              const thumb = document.createElement('div');
              thumb.className = 'pswp__thumbnail';
              thumb.dataset.index = String(index);

              const thumbImg = document.createElement('img');
              thumbImg.src = thumbSrc;
              thumbImg.alt = '';
              thumbImg.loading = 'lazy';
              thumbImg.decoding = 'async';

              thumb.appendChild(thumbImg);
              frag.appendChild(thumb);
            });

            el.appendChild(frag);

            lightbox.pswp.on('change', updateActive);
            updateActive();

            requestAnimationFrame(checkOverflow);
          });
        }
      });
    });

    // 尺寸与原图升级状态按正文链接保存，避免切换/重开时被新建的 slide 数据覆盖。
    interface ImageState {
      src: string;
      fullSrc: string;
      width: number;
      height: number;
      fullLoading: boolean;
    }
    interface ItemData {
      element?: HTMLElement;
      src?: string;
      width?: number;
      height?: number;
    }
    interface ContentEvent {
      content: { data: ItemData; element?: HTMLElement; index: number };
      isError?: boolean;
    }
    const images = new WeakMap<HTMLElement, ImageState>();
    const pendingRefresh = new Set<number>();

    // 原图替换和尺寸修正必须刷新 PhotoSwipe 的内容缓存、缩放级别与平移边界。
    // 延迟到加载事件结束、打开动画完成后，避免同步缓存命中时重入 slide 初始化。
    const flushRefresh = () => {
      const pswp = lightbox.pswp;
      if (!pswp || pswp.isDestroying || !pswp.opener.isOpen) return;
      // 刷新会重建 slide；等手势和动画结束，避免它们继续操作已销毁的实例。
      if (pswp.gestures.isDragging || pswp.gestures.isZooming
        || pswp.mainScroll.isShifted() || pswp.animations.isPanRunning()) {
        requestAnimationFrame(flushRefresh);
        return;
      }
      const indexes = [...pendingRefresh];
      pendingRefresh.clear();
      indexes.forEach((index) => {
        const slide = pswp.currSlide;
        const center = pswp.getViewportCenterPoint();
        // 初始视图继续自动适配真实尺寸；已放大的视图保存屏幕宽度和中心对应的图片坐标。
        const view = slide?.index === index && slide.width > 0 && slide.height > 0
          && slide.currZoomLevel !== slide.zoomLevels.initial
          ? {
            width: slide.width * slide.currZoomLevel,
            x: (center.x - slide.pan.x) / (slide.width * slide.currZoomLevel),
            y: (center.y - slide.pan.y) / (slide.height * slide.currZoomLevel),
          } : null;

        pswp.refreshSlideContent(index);

        const refreshed = pswp.currSlide;
        if (view && refreshed?.index === index && refreshed.width > 0) {
          // 固有像素数改变后换算 zoom，而不是沿用旧值；同步恢复，避免中间帧居中闪跳。
          const zoom = view.width / refreshed.width;
          refreshed.zoomTo(zoom, center, 0, true);
          refreshed.panTo(
            center.x - view.x * refreshed.width * zoom,
            center.y - view.y * refreshed.height * zoom,
          );
        }
      });
    };
    const refreshLater = (index: number) => {
      pendingRefresh.add(index);
      requestAnimationFrame(flushRefresh);
    };
    lightbox.on('openingAnimationEnd', flushRefresh);
    lightbox.on('destroy', () => pendingRefresh.clear());

    // itemData 同时覆盖首次预载和后续切换；不能只在 gettingData 中改 slide。
    lightbox.addFilter('itemData', (data: ItemData) => {
      const link = data.element;
      const img = link?.querySelector('img');
      if (!(link instanceof HTMLAnchorElement) || !img) return data;

      let state = images.get(link);
      if (!state) {
        const ratio = Number(link.dataset.aspectRatio);
        state = {
          src: img.src || link.href,
          fullSrc: link.href || img.src,
          // 未加载的正文图只有 CSS 排版尺寸，不能把它当成图片固有尺寸。
          // 暂以宽高比占位，灯箱自身加载完成后再使用 naturalWidth/Height。
          width: img.naturalWidth || 1200,
          height: img.naturalHeight || (Number.isFinite(ratio) && ratio > 0
            ? Math.max(1, Math.round(1200 / ratio)) : 800),
          fullLoading: false,
        };
        images.set(link, state);
      }
      data.src = state.src;
      data.width = state.width;
      data.height = state.height;
      return data;
    });

    const onImageReady = ({ content, isError }: ContentEvent) => {
      const link = content.data.element;
      const state = link && images.get(link);
      const img = content.element;
      if (isError || !state || !(img instanceof HTMLImageElement)
        || !img.complete || !img.naturalWidth || img.src !== state.src) return;

      if (state.width !== img.naturalWidth || state.height !== img.naturalHeight) {
        state.width = img.naturalWidth;
        state.height = img.naturalHeight;
        refreshLater(content.index);
      }
      if (state.src === state.fullSrc || state.fullLoading) return;

      state.fullLoading = true;
      const probe = new Image();
      probe.onload = () => {
        state.fullLoading = false;
        state.src = state.fullSrc;
        state.width = probe.naturalWidth;
        state.height = probe.naturalHeight;
        refreshLater(content.index);
      };
      // 保留已加载的压缩图；下次激活时允许重试原图。
      probe.onerror = () => { state.fullLoading = false; };
      probe.src = state.fullSrc;
    };
    lightbox.on('loadComplete', onImageReady);
    // 后台预载完成时可能尚无 slide，不会触发 loadComplete；挂载/激活时补齐。
    lightbox.on('contentAppend', onImageReady);
    lightbox.on('contentActivate', onImageReady);

    // 初始化
    lightbox.init();
    activeLightbox = lightbox as { destroy?: () => void };

    // 初始化完成，解除点击拦截；初始化期间被拦下的点击补开灯箱
    removeEarlyClickGuard();
    if (earlyClickIndex !== null) {
      lightbox.loadAndOpen(earlyClickIndex, { gallery: document.body });
      earlyClickIndex = null;
    }

    // 预热核心模块，消除首次打开灯箱时的 CDN 下载等待
    scheduleCoreWarmup();

    console.log(`[ImageGallery] ✅ PhotoSwipe initialized with ${galleryLinks.length} images`);
  } catch (error) {
    // 模块加载失败时放开拦截，退回浏览器默认行为（跳转原图），避免点击无响应
    removeEarlyClickGuard();
    console.error('[ImageGallery] Failed to initialize PhotoSwipe:', error);
  }
}

/**
 * 将文章展示图 URL 换成缩略图栏用的小尺寸 URL。
 * Notion 代理图改 width 参数、Unsplash 改 w 参数（服务端按需缩放），
 * 其余图源没有可用的尺寸参数，保持原样。
 */
function toThumbSrc(src: string): string {
  try {
    const url = new URL(src, location.href);
    if (url.hostname === 'www.notion.so' && url.pathname.startsWith('/image/')) {
      url.searchParams.set('width', String(THUMB_WIDTH));
      return url.toString();
    }
    if (url.hostname === 'images.unsplash.com') {
      url.searchParams.set('w', String(THUMB_WIDTH));
      return url.toString();
    }
  } catch {
    // URL 解析失败时保持原样
  }
  return src;
}

/**
 * 注入 PhotoSwipe 样式（幂等）
 */
function loadPhotoSwipeCss() {
  if (document.querySelector('link[data-pswp-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/photoswipe@5.4.3/dist/photoswipe.css';
  link.dataset.pswpCss = '';
  document.head.appendChild(link);
}

// astro:page-load 在首次加载与每次客户端导航后都会触发（依赖布局中的 <ClientRouter />）；
// 单个模块级监听器统一调度，避免监听器随导航累积。
// requestIdleCallback 延迟执行避免阻塞首屏渲染
if (typeof window !== 'undefined') {
  document.addEventListener('astro:page-load', () => {
    // 软导航会整体替换 document，旧 guard 随之失效，重置引用以便在新文档上重装
    earlyClickGuard = null;
    earlyClickIndex = null;
    installEarlyClickGuard();

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => setupGallery(), { timeout: 3000 });
    } else {
      setTimeout(() => setupGallery(), 200);
    }
  });
}

// 供 window.pswp 全局增强生效的模块标记
export {};
