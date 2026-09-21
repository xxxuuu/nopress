/**
 * 图片 Gallery 功能
 * 使用 PhotoSwipe v5 实现完整的图片预览体验（包含缩略图支持）
 */

export function initImageGallery() {
  // 等待 DOM 准备好
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupGallery);
  } else {
    setupGallery();
  }
}

async function setupGallery() {
  const galleryLinks = document.querySelectorAll('.glightbox[data-gallery="article-images"]');

  if (galleryLinks.length === 0) {
    console.log('[ImageGallery] No images found');
    return;
  }

  // 为每个链接准备数据
  const prepareLinks = () => {
    galleryLinks.forEach((link) => {
      const linkEl = link as HTMLAnchorElement;
      const img = linkEl.querySelector('img') as HTMLImageElement;

      if (!img) return;

      // 等待图片加载完成以获取尺寸
      const setupDimensions = () => {
        const width = img.naturalWidth || img.width || 1200;
        const height = img.naturalHeight || img.height || 800;

        linkEl.setAttribute('data-pswp-width', width.toString());
        linkEl.setAttribute('data-pswp-height', height.toString());

        // 确保 href 指向图片 URL
        if (!linkEl.href || linkEl.href === '') {
          linkEl.href = img.src;
        }
      };

      if (img.complete && img.naturalWidth) {
        setupDimensions();
      } else {
        img.addEventListener('load', setupDimensions);
        // 如果图片加载失败或超时，使用默认尺寸
        setTimeout(setupDimensions, 1000);
      }
    });
  };

  prepareLinks();

  // 等待一小段时间确保数据属性已设置
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    // 动态导入 PhotoSwipe 模块
    const [PhotoSwipeLightboxModule, PhotoSwipeModule] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/photoswipe@5.4.3/dist/photoswipe-lightbox.esm.min.js'),
      import('https://cdn.jsdelivr.net/npm/photoswipe@5.4.3/dist/photoswipe.esm.min.js')
    ]);

    const PhotoSwipeLightbox = PhotoSwipeLightboxModule.default;

    // 初始化 PhotoSwipe Lightbox
    const lightbox = new PhotoSwipeLightbox({
      gallery: 'body',
      children: '.glightbox[data-gallery="article-images"]',
      pswpModule: PhotoSwipeModule.default,
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

          const buildThumbnails = () => {
            // 直接从 DOM 获取所有图片链接
            const allLinks = document.querySelectorAll('.glightbox[data-gallery="article-images"]');
            let thumbsHTML = '';

            allLinks.forEach((link, index) => {
              const img = link.querySelector('img');
              const thumbSrc = img ? (img as HTMLImageElement).src : (link as HTMLAnchorElement).href;

              thumbsHTML += `
                <div class="pswp__thumbnail" data-index="${index}">
                  <img src="${thumbSrc}" alt="" />
                </div>
              `;
            });

            el.innerHTML = thumbsHTML;

            // 点击缩略图跳转
            el.addEventListener('click', (e: MouseEvent) => {
              const target = e.target as HTMLElement;
              const thumb = target.closest('.pswp__thumbnail');
              if (thumb) {
                const index = parseInt((thumb as HTMLElement).dataset.index || '0');
                lightbox.pswp.goTo(index);
              }
            });

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
                  const scrollLeft = container.scrollLeft;

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

            lightbox.pswp.on('change', updateActive);
            updateActive();

            // 阻止滚动事件穿透到背后的页面
            el.addEventListener('wheel', (e: WheelEvent) => {
              e.preventDefault();
              e.stopPropagation();

              // 手动处理横向滚动
              const container = el as HTMLElement;
              container.scrollLeft += e.deltaY;
            }, { passive: false });
          };

          buildThumbnails();

          // 动态检测是否溢出，调整对齐方式
          const checkOverflow = () => {
            const isOverflowing = el.scrollWidth > el.offsetWidth;
            el.style.justifyContent = isOverflowing ? 'flex-start' : 'center';
          };

          // 初始检测
          requestAnimationFrame(() => {
            checkOverflow();
          });

          // 窗口大小改变时重新检测
          window.addEventListener('resize', () => {
            checkOverflow();
          });
        }
      });
    });

    // 渐进式加载：灯箱初始显示压缩图（a 内 img 的 src），原图（a 的 href）在后台预载后无缝替换
    // 压缩图与原图等比缩放，替换时布局无跳动
    lightbox.on('uiRegister', function() {
      const pswp = lightbox.pswp;

      // 打开/切换前将 slide 数据源换成压缩图（未升级过的 slide）
      pswp.on('gettingData', (e: any) => {
        const data = e.data;
        if (!data || data.srcUpgraded) return;
        const thumbSrc = data.element?.querySelector?.('img')?.getAttribute('src');
        if (thumbSrc) data.src = thumbSrc;
      });

      // 压缩图显示完成后，后台预载原图并替换 slide
      // 注意：loadComplete 触发时 pswp.currSlide 可能尚未赋值（打开流程早期），
      // 且非当前 slide 的 img 不可见、图片等比，替换无布局副作用，无需区分当前与否
      pswp.on('loadComplete', (e: any) => {
        const slide = e.slide;
        const content = e.content;
        if (!slide || !content || slide.data?.fullProbeStarted) return;

        const fullSrc = slide.data?.element?.getAttribute('href') || '';
        const imgEl = content.element as HTMLImageElement | null;
        if (!fullSrc || !imgEl || imgEl.src === fullSrc) return;

        slide.data.fullProbeStarted = true;
        const probe = new Image();
        probe.onload = () => {
          // 升级后同步 data.src，防止 gettingData 将数据源回退成压缩图
          if (content.element) {
            slide.data.src = fullSrc;
            slide.data.srcUpgraded = true;
            (content.element as HTMLImageElement).src = fullSrc;
          }
        };
        probe.src = fullSrc;
      });
    });

    // 初始化
    lightbox.init();

    console.log(`[ImageGallery] ✅ PhotoSwipe initialized with ${galleryLinks.length} images`);
  } catch (error) {
    console.error('[ImageGallery] Failed to initialize PhotoSwipe:', error);
  }
}

// 页面加载完成后延迟初始化（使用 requestIdleCallback 避免阻塞首屏渲染）
if (typeof window !== 'undefined') {
  const initWhenIdle = () => {
    // 使用 requestIdleCallback 在浏览器空闲时加载
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => initImageGallery(), { timeout: 3000 });
    } else {
      // 降级方案：使用 setTimeout
      setTimeout(() => initImageGallery(), 200);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenIdle);
  } else {
    initWhenIdle();
  }
}
