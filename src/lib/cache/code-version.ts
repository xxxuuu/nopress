/**
 * 数据层代码版本计算
 *
 * 目的：让文件缓存随「参与缓存数据生产的代码」变更自动失效，
 * 根治「改数据结构后忘删 .cache/ 导致读到脏数据」的问题。
 *
 * 纳入范围的模块 = 会影响写入缓存的数据形态的代码：
 * - src/lib/notion/    数据拉取与渲染，缓存内容的直接生产者
 * - src/lib/cache/     缓存自身结构与语义
 * - src/lib/utils/     api-helpers（限流/重试）等，影响拉取行为
 * - src/lib/types.ts   数据结构定义
 *
 * 刻意排除：markdown/（只读缓存、不写缓存）、theme/、config/（不参与缓存数据生产），
 * 避免无关改动造成不必要的全量缓存失效。
 *
 * 版本值掺进缓存 namespace 后，代码变更 = key 变化 = 自动 miss；
 * 旧缓存文件读不到，由 TTL 过期后的 cleanup() 回收。
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

/** 参与缓存数据生产的代码位置（相对 src/lib/） */
const VERSIONED_PATHS = ['notion', 'cache', 'utils', 'types.ts'];

let cachedVersion: string | null = null;

/**
 * 计算数据层代码版本（sha256 前 8 位）
 * 同一进程内只计算一次；计算失败时退化为固定值，
 * 缓存退回纯 TTL 语义（与旧行为一致），不阻塞构建。
 */
export function getDataLayerVersion(): string {
  if (cachedVersion !== null) {
    return cachedVersion;
  }

  try {
    const libRoot = path.join(process.cwd(), 'src', 'lib');
    const files: string[] = [];

    for (const rel of VERSIONED_PATHS) {
      collectFiles(path.join(libRoot, rel), files);
    }

    const hash = crypto.createHash('sha256');
    for (const file of files.sort()) {
      hash.update(file);
      hash.update(readFileSync(file));
    }
    cachedVersion = hash.digest('hex').slice(0, 8);
  } catch (error) {
    console.warn('[Cache] Failed to compute data-layer version, falling back to unversioned:', error);
    cachedVersion = 'unversioned';
  }

  return cachedVersion;
}

/**
 * 递归收集目录下所有文件；入参为文件时收集自身
 * 记录相对 cwd 的路径（统一为 / 分隔符）保证跨平台稳定
 */
function collectFiles(target: string, out: string[]): void {
  const stats = statSync(target);

  if (stats.isFile()) {
    out.push(path.relative(process.cwd(), target).split(path.sep).join('/'));
    return;
  }

  for (const entry of readdirSync(target)) {
    collectFiles(path.join(target, entry), out);
  }
}
