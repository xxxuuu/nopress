/**
 * NoPress 主题配置验证模式
 * 使用 Zod 进行运行时类型验证
 * 按照最小约束原则：只验证必需字段
 */

import { z } from 'zod';
import type { ThemeConfig } from './types';

/**
 * 主题配置选项验证模式
 */
const themeOptionSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'select', 'color']),
  default: z.union([z.string(), z.number(), z.boolean()]),
  label: z.string(),
  description: z.string().optional(),
  // select 类型专用
  choices: z.array(z.string()).optional(),
  // number 类型专用
  min: z.number().optional(),
  max: z.number().optional(),
});

/**
 * 主题配置验证模式
 * 只验证 3 个必需字段：id, name, version
 * 其他字段都是可选的
 */
export const themeConfigSchema = z.object({
  // ===== 必需字段 =====
  id: z.string().min(1, '主题 ID 不能为空').regex(
    /^[a-z0-9-]+$/,
    '主题 ID 只能包含小写字母、数字和连字符'
  ),
  name: z.string().min(1, '主题名称不能为空'),
  version: z.string().regex(
    /^\d+\.\d+\.\d+/,
    '版本号必须符合 semver 格式（如 1.0.0）'
  ),

  // ===== 可选字段 =====
  author: z.string().optional(),
  description: z.string().optional(),
  homepage: z.url().optional(),
  repository: z.url().optional(),
  license: z.string().optional(),
  compatibleVersion: z.string().optional(),

  // 主题配置选项（可选）
  options: z.record(z.string(), themeOptionSchema).optional(),
});

/**
 * 验证主题配置
 * 成功时 data 必有值（discriminated union，调用方无需再判空）
 */
export function validateThemeConfig(config: unknown):
  | { success: true; data: ThemeConfig }
  | { success: false; errors: string[] } {
  const result = themeConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map(err =>
    `${err.path.join('.')}: ${err.message}`
  );

  return { success: false, errors };
}
