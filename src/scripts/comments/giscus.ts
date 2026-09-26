/**
 * Giscus 评论系统集成
 * @see https://giscus.app
 *
 * 注意: 主题同步功能等待主题系统完善后再实现
 * 当前版本使用固定的 Giscus 主题
 *
 * Core 层提供的工具脚本，主题可以选择使用或自己实现
 */

import type { GiscusConfig } from '@lib/types';

export interface GiscusInitOptions {
  container: HTMLElement; // 评论容器元素
  slug: string;
  title: string;
  config: GiscusConfig;
}

/** 容器内是否已挂载 giscus（客户端导航会带来全新容器，不受模块级状态影响） */
function containerHasGiscus(container: HTMLElement): boolean {
  return !!container.querySelector('iframe.giscus-frame, #giscus-script');
}

/**
 * 初始化 Giscus 评论系统
 * @param options.container - 评论容器 DOM 元素
 * @param options.slug - 页面 slug，用于映射评论
 * @param options.title - 页面标题
 * @param options.config - Giscus 配置
 */
export async function initGiscus(options: GiscusInitOptions): Promise<void> {
  if (containerHasGiscus(options.container)) {
    return;
  }

  const { container, slug, title, config } = options;

  // 验证配置
  if (!config.repo || !config.repoId || !config.categoryId) {
    console.error('[Giscus] ❌ Missing required configuration', {
      repo: config.repo,
      repoId: config.repoId,
      categoryId: config.categoryId,
    });
    showErrorMessage(container, '评论系统配置不完整，请联系站点管理员');
    return;
  }

  try {
    // 动态加载 Giscus 脚本
    await loadGiscusScript(container, config, slug);

    console.log('[Giscus] ✅ Initialized successfully');
  } catch (error) {
    console.error('[Giscus] ❌ Failed to initialize:', error);

    // 显示错误提示
    showErrorMessage(container, '评论加载失败，请刷新页面重试');
  }
}

/**
 * 动态加载 Giscus 脚本
 * @param container - 评论容器 DOM 元素
 */
async function loadGiscusScript(
  container: HTMLElement,
  config: GiscusConfig,
  slug: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // 移除旧的脚本（如果存在）
    const existingScript = document.querySelector('#giscus-script');
    if (existingScript) {
      existingScript.remove();
    }

    // 创建 script 标签
    const script = document.createElement('script');
    script.id = 'giscus-script';
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.defer = true;

    // 设置 Giscus 配置属性
    script.setAttribute('data-repo', config.repo);
    script.setAttribute('data-repo-id', config.repoId);
    script.setAttribute('data-category', config.category);
    script.setAttribute('data-category-id', config.categoryId);
    script.setAttribute('data-mapping', config.mapping);
    script.setAttribute('data-strict', config.strict);
    script.setAttribute('data-reactions-enabled', config.reactionsEnabled);
    script.setAttribute('data-emit-metadata', config.emitMetadata);
    script.setAttribute('data-input-position', config.inputPosition);
    script.setAttribute('data-lang', config.lang);
    script.setAttribute('data-lazy', config.lazy.toString());

    // 设置主题（固定使用 preferred_color_scheme，等待主题系统完善）
    // 未来扩展: 支持跟随系统主题切换
    script.setAttribute('data-theme', 'preferred_color_scheme');

    // 设置页面映射（使用 pathname）
    script.setAttribute('data-term', slug);

    // 加载完成回调
    script.onload = () => {
      // 隐藏加载提示
      const loading = container.querySelector('.comments-loading');
      if (loading) {
        loading.remove();
      }
      resolve();
    };

    script.onerror = () => {
      reject(new Error('Failed to load Giscus script'));
    };

    // 插入到容器
    container.appendChild(script);
  });
}

/**
 * 显示错误消息
 * @param container - 评论容器 DOM 元素
 * @param message - 错误消息
 */
function showErrorMessage(container: HTMLElement, message: string): void {
  container.innerHTML = `
    <div class="comments-error" style="
      padding: 1rem;
      text-align: center;
      color: var(--color-text-secondary, #666);
      border: 1px solid var(--color-border, #e0e0e0);
      border-radius: 0.5rem;
      background: var(--color-surface, #f5f5f5);
    ">
      <p style="margin: 0;">${message}</p>
      <p style="
        font-size: 0.85em;
        margin: 0.5em 0 0 0;
        color: var(--color-text-tertiary, #999);
      ">
        如果问题持续存在，请检查控制台获取更多信息
      </p>
    </div>
  `;
}
