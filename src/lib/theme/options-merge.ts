/**
 * 主题选项合并与类型转换
 *
 * 宿主通过环境变量 NOPRESS_THEME_OPTIONS 提供覆盖值（JSON 对象，保留主题声明的 key 形态）。
 * 本模块把覆盖值按主题声明的类型校验转换，与默认值合并。
 *
 * 设计约束：未知 key 和类型不匹配都在构建期报错（fail fast），
 * 避免宿主的拼写错误被静默丢弃。
 */

import type { ThemeOptions } from './types';

/** 合并后的选项值：构建期常量，注入虚拟模块供主题读取 */
export type ThemeOptionValue = string | number | boolean;

/**
 * 解析宿主提供的原始 JSON 字符串
 */
export function parseRawOverrides(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `NOPRESS_THEME_OPTIONS 不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('NOPRESS_THEME_OPTIONS 必须是 JSON 对象，如 {"accentColor":"#f00"}');
  }

  return parsed as Record<string, unknown>;
}

/**
 * 按声明类型转换单个覆盖值（环境变量来源可能是字符串形态）
 */
function coerceValue(
  key: string,
  declared: ThemeOptions[string],
  value: unknown
): ThemeOptionValue {
  const { type } = declared;

  if (type === 'number') {
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(num)) throw new Error(`主题选项 "${key}" 声明为 number，但值无法转换: ${JSON.stringify(value)}`);
    if (declared.min !== undefined && num < declared.min) throw new Error(`主题选项 "${key}"=${num} 低于声明的最小值 ${declared.min}`);
    if (declared.max !== undefined && num > declared.max) throw new Error(`主题选项 "${key}"=${num} 超过声明的最大值 ${declared.max}`);
    return num;
  }

  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    throw new Error(`主题选项 "${key}" 声明为 boolean，但值无法转换: ${JSON.stringify(value)}`);
  }

  // string / color / select：统一走字符串
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`主题选项 "${key}" 声明为 ${type}，但值不是字符串: ${JSON.stringify(value)}`);
  }
  const str = String(value);

  if (type === 'select' && declared.choices && !declared.choices.includes(str)) {
    throw new Error(`主题选项 "${key}" 的值 "${str}" 不在可选项内: ${declared.choices.join(', ')}`);
  }

  return str;
}

/**
 * 合并声明的默认值与宿主覆盖值
 *
 * @param declared 主题声明的 options（theme.config.mjs）
 * @param overrides 宿主提供的覆盖值（已解析的 JSON 对象）
 * @returns 合并结果；未声明 options 的主题返回空对象
 */
export function mergeThemeOptions(
  declared: ThemeOptions | undefined,
  overrides: Record<string, unknown>
): Record<string, ThemeOptionValue> {
  const merged: Record<string, ThemeOptionValue> = {};

  for (const [key, option] of Object.entries(declared ?? {})) {
    merged[key] = option.default;
  }

  for (const [key, value] of Object.entries(overrides)) {
    const option = declared?.[key];
    if (!option) {
      throw new Error(
        `NOPRESS_THEME_OPTIONS 中的 "${key}" 未在激活主题的 options 中声明（可用: ${Object.keys(declared ?? {}).join(', ') || '无'}）`
      );
    }
    merged[key] = coerceValue(key, option, value);
  }

  return merged;
}
