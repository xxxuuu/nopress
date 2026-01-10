/**
 * 代码块复制功能
 * 为所有代码块添加一键复制功能
 */

/**
 * 初始化代码块复制功能
 */
export function initCodeCopy() {
  // 查找所有复制按钮
  const copyButtons = document.querySelectorAll('.notion-code-copy');

  copyButtons.forEach((button) => {
    button.addEventListener('click', async (event) => {
      // 获取对应的代码块
      const codeBlock = (button as HTMLElement).closest('.notion-code-block');
      if (!codeBlock) return;

      const codeElement = codeBlock.querySelector('code');
      if (!codeElement) return;

      const code = codeElement.textContent || '';

      // 使用 Clipboard API 复制代码
      await navigator.clipboard.writeText(code);

      // 显示复制成功状态
      showCopySuccess(button as HTMLElement);
    });
  });

  // 监听动态添加的代码块
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          const newCopyButtons = (node as Element).querySelectorAll('.notion-code-copy');
          newCopyButtons.forEach((button) => {
            button.addEventListener('click', async (event) => {
              const codeBlock = (button as HTMLElement).closest('.notion-code-block');
              if (!codeBlock) return;

              const codeElement = codeBlock.querySelector('code');
              if (!codeElement) return;

              const code = codeElement.textContent || '';

              await navigator.clipboard.writeText(code);
              showCopySuccess(button as HTMLElement);
            });
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * 显示复制成功状态
 */
function showCopySuccess(button: HTMLElement): void {
  const originalText = button.querySelector('.copy-text');
  if (originalText) {
    originalText.textContent = 'COPIED';
  }

  button.classList.add('copied');

  // 2 秒后恢复原状
  setTimeout(() => {
    if (originalText) {
      originalText.textContent = 'COPY';
    }
    button.classList.remove('copied');
  }, 2000);
}

// 页面加载完成后初始化
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCodeCopy);
  } else {
    initCodeCopy();
  }
}
