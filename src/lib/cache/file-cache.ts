import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Cache, CacheEntry, FileCacheConfig } from './types';

/**
 * 文件系统缓存实现
 * 适用于生产环境和持久化缓存需求
 */
export class FileCache implements Cache {
  private cacheDir: string;
  private defaultTTL: number;
  private namespace: string;
  private enabled: boolean;
  private compress: boolean;

  constructor(config: FileCacheConfig = {}) {
    this.cacheDir = config.cacheDir ?? path.join(process.cwd(), '.cache', 'notion');
    this.defaultTTL = config.defaultTTL ?? 60 * 60 * 1000; // 默认 1 小时
    this.namespace = config.namespace ?? 'default';
    this.enabled = config.enabled ?? true;
    this.compress = config.compress ?? false;

    // 确保缓存目录存在
    this.ensureCacheDir();
  }

  /**
   * 确保缓存目录存在
   */
  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('[FileCache] Failed to create cache directory:', error);
    }
  }

  /**
   * 生成缓存文件路径
   */
  private getCacheFilePath(key: string): string {
    // 使用 MD5 哈希避免文件名过长和特殊字符问题
    const hash = crypto.createHash('md5').update(`${this.namespace}:${key}`).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }

  /**
   * 检查缓存项是否过期
   */
  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * 获取缓存数据
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) {
      return null;
    }

    const filePath = this.getCacheFilePath(key);

    try {
      // 读取缓存文件
      const content = await fs.readFile(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(content);

      // 检查是否过期
      if (this.isExpired(entry)) {
        // 删除过期文件
        await this.delete(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      // 文件不存在或读取失败
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[FileCache] Failed to read cache:', error);
      }
      return null;
    }
  }

  /**
   * 设置缓存数据
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const filePath = this.getCacheFilePath(key);
    const cacheTTL = ttl ?? this.defaultTTL;
    const now = Date.now();

    const entry: CacheEntry<T> = {
      data: value,
      expiresAt: now + cacheTTL,
      createdAt: now,
    };

    try {
      // 确保目录存在
      await this.ensureCacheDir();

      // 写入缓存文件
      const content = JSON.stringify(entry, null, this.compress ? 0 : 2);
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      console.error('[FileCache] Failed to write cache:', error);
    }
  }

  /**
   * 删除缓存数据
   */
  async delete(key: string): Promise<void> {
    const filePath = this.getCacheFilePath(key);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      // 忽略文件不存在的错误
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[FileCache] Failed to delete cache:', error);
      }
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    try {
      // 读取缓存目录中的所有文件
      const files = await fs.readdir(this.cacheDir);

      // 删除所有 .json 文件
      await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(file => fs.unlink(path.join(this.cacheDir, file)))
      );

      console.log(`[FileCache] Cleared ${files.length} cache files`);
    } catch (error) {
      console.error('[FileCache] Failed to clear cache:', error);
    }
  }

  /**
   * 检查缓存是否存在且未过期
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * 获取缓存统计信息
   */
  async getStats() {
    try {
      const files = await fs.readdir(this.cacheDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      let validCount = 0;
      let expiredCount = 0;
      let totalSize = 0;

      for (const file of jsonFiles) {
        const filePath = path.join(this.cacheDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const entry: CacheEntry<any> = JSON.parse(content);
          const stats = await fs.stat(filePath);

          totalSize += stats.size;

          if (this.isExpired(entry)) {
            expiredCount++;
          } else {
            validCount++;
          }
        } catch (error) {
          // 忽略无效的缓存文件
        }
      }

      return {
        total: jsonFiles.length,
        valid: validCount,
        expired: expiredCount,
        totalSize,
        namespace: this.namespace,
        cacheDir: this.cacheDir,
      };
    } catch (error) {
      console.error('[FileCache] Failed to get stats:', error);
      return {
        total: 0,
        valid: 0,
        expired: 0,
        totalSize: 0,
        namespace: this.namespace,
        cacheDir: this.cacheDir,
      };
    }
  }

  /**
   * 清理过期的缓存文件
   */
  async cleanup(): Promise<number> {
    try {
      const files = await fs.readdir(this.cacheDir);
      let cleanedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.cacheDir, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const entry: CacheEntry<any> = JSON.parse(content);

          if (this.isExpired(entry)) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        } catch (error) {
          // 删除无效的缓存文件
          try {
            await fs.unlink(filePath);
            cleanedCount++;
          } catch {
            // 忽略删除失败
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`[FileCache] Cleaned ${cleanedCount} expired files`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('[FileCache] Failed to cleanup:', error);
      return 0;
    }
  }
}

// 创建默认实例
export const fileCache = new FileCache();
