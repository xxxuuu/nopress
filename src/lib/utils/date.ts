import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/**
 * 格式化日期为可读格式
 * @param date 日期字符串或 Date 对象
 * @param formatStr 格式字符串，默认 'yyyy年MM月dd日'
 * @returns 格式化后的日期字符串
 */
export function formatDate(date: string | Date, formatStr: string = 'yyyy年MM月dd日'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr, { locale: zhCN });
}

/**
 * 显示相对时间（如：3天前）
 * @param date 日期字符串或 Date 对象
 * @returns 相对时间字符串
 */
export function timeAgo(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(dateObj, { addSuffix: true, locale: zhCN });
}

/**
 * 解析 ISO 日期字符串
 * @param dateString ISO 日期字符串
 * @returns Date 对象
 */
export function parseDate(dateString: string): Date {
  return parseISO(dateString);
}

/**
 * 比较两个日期
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @returns 负数表示 date1 < date2，0 表示相等，正数表示 date1 > date2
 */
export function compareDate(date1: string | Date, date2: string | Date): number {
  const d1 = typeof date1 === 'string' ? parseISO(date1) : date1;
  const d2 = typeof date2 === 'string' ? parseISO(date2) : date2;
  return d1.getTime() - d2.getTime();
}
