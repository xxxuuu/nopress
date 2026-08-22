/**
 * 文章目录（Table of Contents）功能
 * - 自动提取文章中的标题生成目录
 * - 滚动高亮当前章节
 * - 点击跳转到对应章节
 */

interface TocItem {
  id: string;
  text: string;
  level: number;
  element: HTMLElement;
}

export function initTableOfContents() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupToc);
  } else {
    setupToc();
  }
}

function setupToc() {
  const tocContainer = document.querySelector('.toc-container');
  const contentContainer = document.querySelector('.notion-content');

  if (!tocContainer || !contentContainer) {
    return;
  }

  // 提取所有标题
  const headings = contentContainer.querySelectorAll('h1, h2, h3');

  if (headings.length === 0) {
    // 没有标题，隐藏目录
    tocContainer.classList.add('toc-empty');
    return;
  }

  // 为标题生成id并提取TOC项
  const tocItems: TocItem[] = Array.from(headings).map((heading, index) => {
    const headingEl = heading as HTMLElement;

    // 如果标题没有id，自动生成一个
    if (!headingEl.id) {
      const text = headingEl.textContent || '';
      const slug = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '');
      headingEl.id = slug || `heading-${index}`;
    }

    return {
      id: headingEl.id,
      text: headingEl.textContent || '',
      level: parseInt(heading.tagName[1]),
      element: headingEl,
    };
  });

  // 生成目录HTML
  const tocHtml = generateTocHtml(tocItems);
  const tocNav = tocContainer.querySelector('.toc-nav');
  if (tocNav) {
    tocNav.innerHTML = tocHtml;
  }

  // 应用动态横条宽度
  applyBarWidths(tocContainer);

  // 设置点击事件
  setupTocClicks(tocContainer);

  // 悬浮显示 hover 条目对应的完整标题（窄屏横条模式）
  setupTocTooltip(tocContainer);

  // 设置动态位置调整
  setupTocPosition(tocContainer);

  // 等待DOM更新后再设置滚动监听
  setTimeout(() => {
    setupScrollSpy(tocItems, tocContainer);
  }, 0);
}

function generateTocHtml(items: TocItem[]): string {
  if (items.length === 0) return '';

  // 找到实际使用的最小 level（最高级标题）
  const minLevel = Math.min(...items.map(item => item.level));

  // 收集所有文字长度并排序，用于归一化映射
  const lengths = items.map(item => item.text.length);
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);
  const lengthRange = maxLength - minLength || 1; // 避免除以0

  // 为每个层级定义宽度范围
  const levelRanges: { [key: number]: { min: number; max: number } } = {};
  items.forEach(item => {
    const relativeLevel = item.level - minLevel;
    if (!levelRanges[relativeLevel]) {
      // 一级: 32-44px, 二级: 24-36px, 三级: 20-28px
      const max = 44 - relativeLevel * 8;
      const min = max - 12;
      levelRanges[relativeLevel] = { min, max };
    }
  });

  let html = '<ul class="toc-list">';

  items.forEach(item => {
    // 基于最小 level 计算相对缩进
    const relativeLevel = item.level - minLevel;
    const indent = relativeLevel * 1.125;

    // 归一化文字长度 (0-1)
    const normalizedLength = (item.text.length - minLength) / lengthRange;

    // 使用平方根函数拉开差距（让相似长度有更明显区分）
    // sqrt 曲线使得短文本差异更明显
    const adjustedLength = Math.sqrt(normalizedLength);

    // 映射到当前层级的宽度范围
    const range = levelRanges[relativeLevel];
    const barWidth = Math.round(range.min + adjustedLength * (range.max - range.min));

    html += `
      <li class="toc-item toc-level-${item.level}" style="--toc-indent: ${indent}rem;" data-bar-width="${barWidth}">
        <a href="#${item.id}" class="toc-link" data-target="${item.id}">
          ${escapeHtml(item.text)}
        </a>
      </li>
    `;
  });

  html += '</ul>';
  return html;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function applyBarWidths(tocContainer: Element) {
  const items = tocContainer.querySelectorAll('.toc-item');
  items.forEach(item => {
    const barWidth = item.getAttribute('data-bar-width');
    const link = item.querySelector('.toc-link') as HTMLElement;
    if (barWidth && link) {
      link.style.setProperty('--bar-width', `${barWidth}px`);
    }
  });
}

function setupTocPosition(tocContainer: Element) {
  const pageMain = document.querySelector('.page-main');
  if (!pageMain) return;

  const updatePosition = () => {
    const mainRect = pageMain.getBoundingClientRect();
    const tocEl = tocContainer as HTMLElement;

    // 计算正文顶部相对于视口的位置
    const mainTop = mainRect.top;

    // 默认目录距离顶部 100px
    const defaultTop = 100;

    // 如果正文顶部低于默认位置，使用正文顶部位置（加一点间距）
    // 否则使用默认位置
    const newTop = Math.max(defaultTop, mainTop + 20);

    tocEl.style.top = `${newTop}px`;

    // 最大高度设在面板上（面板承担滚动），确保目录不会超出视口
    const maxHeight = window.innerHeight - newTop - 20;
    const panel = tocEl.querySelector('.toc-wrapper') as HTMLElement | null;
    if (panel) {
      panel.style.maxHeight = `${maxHeight}px`;
    }
  };

  // 滚动时更新位置
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updatePosition();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // 窗口大小改变时也更新
  window.addEventListener('resize', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updatePosition();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // 初始化位置
  requestAnimationFrame(() => {
    updatePosition();
  });
}

function setupTocClicks(container: Element) {
  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest('.toc-link') as HTMLAnchorElement;

    if (!link) return;

    e.preventDefault();

    const targetId = link.getAttribute('data-target');
    if (!targetId) return;

    const targetElement = document.getElementById(targetId);
    if (!targetElement) return;

    // 平滑滚动到目标位置
    const offset = 80; // 给顶部导航栏留空间
    const elementPosition = targetElement.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });

    // 更新URL hash（但不触发跳转）
    history.pushState(null, '', `#${targetId}`);
  });
}

/**
 * 悬浮标题提示
 * 窄屏横条模式下，hover 某个横条时在其左侧显示完整标题。
 * tooltip 挂在滚动容器（.toc-wrapper）之外，避免被 overflow 裁剪。
 */
function setupTocTooltip(tocContainer: Element) {
  const tooltip = document.createElement('div');
  tooltip.className = 'toc-tooltip';
  tocContainer.appendChild(tooltip);

  const nav = tocContainer.querySelector('.toc-nav');
  if (!nav) return;

  const show = (link: HTMLElement) => {
    const text = (link.textContent || '').trim();
    if (!text) return;

    tooltip.textContent = text;
    tooltip.classList.add('toc-tooltip-visible');

    // 垂直定位到对应横条的中心（tooltip 绝对定位于 toc-container 内）
    const containerRect = tocContainer.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    tooltip.style.top = `${linkRect.top - containerRect.top + linkRect.height / 2}px`;
  };

  const hide = () => {
    tooltip.classList.remove('toc-tooltip-visible');
  };

  // 事件委托：悬停不同横条时切换文字，移到间隙时隐藏
  nav.addEventListener('mouseover', (e) => {
    const link = (e.target as HTMLElement).closest('.toc-link');
    if (link) {
      show(link as HTMLElement);
    } else {
      hide();
    }
  });

  nav.addEventListener('mouseleave', hide);

  // 键盘聚焦同样显示标题
  nav.addEventListener('focusin', (e) => {
    const link = (e.target as HTMLElement).closest('.toc-link');
    if (link) show(link as HTMLElement);
  });
  nav.addEventListener('focusout', hide);

  // 滚动时位置会失效，直接隐藏
  window.addEventListener('scroll', hide, { passive: true });
}

function setupScrollSpy(items: TocItem[], container: Element) {
  let currentActiveId = '';

  const updateActive = () => {
    // 计算屏幕中上部分的参考位置（视口高度的 1/3 处）
    const viewportHeight = window.innerHeight;
    const referencePoint = viewportHeight / 3;

    // 找到最接近参考点的标题
    let activeId = '';
    let minDistance = Infinity;

    for (const item of items) {
      const element = item.element;
      const rect = element.getBoundingClientRect();

      // 计算标题与参考点的距离（绝对值）
      const distance = Math.abs(rect.top - referencePoint);

      // 只考虑在视口内或稍微上方的标题
      if (rect.top <= viewportHeight && rect.top >= -rect.height) {
        if (distance < minDistance) {
          minDistance = distance;
          activeId = item.id;
        }
      }
    }

    // 如果视口内没有找到标题，激活最后一个已滚过的标题
    if (!activeId) {
      for (let i = items.length - 1; i >= 0; i--) {
        const rect = items[i].element.getBoundingClientRect();
        // 找最后一个在视口上方的标题（top < 0）
        if (rect.top < 0) {
          activeId = items[i].id;
          break;
        }
      }
    }

    // 如果还是没有（页面顶部），默认激活第一个
    if (!activeId && items.length > 0) {
      activeId = items[0].id;
    }

    // 更新激活状态
    if (activeId !== currentActiveId) {
      currentActiveId = activeId;

      // 移除所有激活状态
      const allLinks = document.querySelectorAll('.toc-container .toc-link');

      allLinks.forEach(link => {
        link.classList.remove('toc-active');
      });

      // 添加新的激活状态
      if (activeId) {
        const activeLink = document.querySelector(`.toc-container .toc-link[data-target="${activeId}"]`);
        if (activeLink) {
          activeLink.classList.add('toc-active');
        }
      }
    }
  };

  // 节流处理滚动事件
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateActive();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // 初始化 - 确保在下一个事件循环中执行
  requestAnimationFrame(() => {
    updateActive();
  });
}

// 自动初始化
if (typeof window !== 'undefined') {
  initTableOfContents();
}
