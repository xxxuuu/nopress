/**
 * 站点外观小工具：路径匹配、选项值校验
 */

/** 去掉末尾斜杠并解码，便于比较当前路径与菜单链接 */
export function normalizePath(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURI(path);
  } catch {
    // 非法编码保持原样
  }
  return decoded.length > 1 ? decoded.replace(/\/+$/, '') : decoded;
}

/** 菜单项是否对应当前页面（首页只做精确匹配，其余允许子路径） */
export function isCurrentPath(url: string, current: string): boolean {
  const target = normalizePath(url);
  if (target === '/') return current === '/';
  return current === target || current.startsWith(`${target}/`);
}

/**
 * 颜色选项写入 style 属性前做字符白名单校验（color 类型选项不经框架校验）
 * 允许 #hex、rgb()/hsl()/oklch() 与颜色关键字
 */
export function safeColor(value: string | undefined, fallback: string): string {
  return value && /^[#\w(),.%\s/-]+$/.test(value) ? value : fallback;
}
