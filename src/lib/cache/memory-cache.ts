import type { Cache, CacheEntry, CacheConfig } from './types';

/**
 * 内存缓存实现
 * 适用于开发环境和短期缓存
 */
export class MemoryCache implements Cache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number;
  private namespace: string;
  private enabled: boolean;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: CacheConfig = {}) {
    this.defaultTTL = config.defaultTTL ?? 5 * 60 * 1000; // 默认 5 分钟
    this.namespace = config.namespace ?? 'default';
    this.enabled = config.enabled ?? true;

    // 启动定期清理过期缓存
    this.startCleanup();
  }

  /**
   * 生成带命名空间的完整键名
   */
  private getFullKey(key: string): string {
    return `${this.namespace}:${key}`;
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

    const fullKey = this.getFullKey(key);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (this.isExpired(entry)) {
      this.cache.delete(fullKey);
      return null;
    }

    return entry.data as T;
  }

  /**
   * 设置缓存数据
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const fullKey = this.getFullKey(key);
    const cacheTTL = ttl ?? this.defaultTTL;
    const now = Date.now();

    const entry: CacheEntry<T> = {
      data: value,
      expiresAt: now + cacheTTL,
      createdAt: now,
    };

    this.cache.set(fullKey, entry);
  }

  /**
   * 删除缓存数据
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    this.cache.delete(fullKey);
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();
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
  getStats() {
    const entries = Array.from(this.cache.entries());
    const validEntries = entries.filter(([_, entry]) => !this.isExpired(entry));
    const expiredEntries = entries.length - validEntries.length;

    return {
      total: this.cache.size,
      valid: validEntries.length,
      expired: expiredEntries,
      namespace: this.namespace,
    };
  }

  /**
   * 启动定期清理过期缓存
   * 每分钟检查一次
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000); // 每分钟清理一次

    // 确保进程退出时清理定时器
    if (typeof process !== 'undefined') {
      process.on('exit', () => this.stopCleanup());
    }
  }

  /**
   * 停止定期清理
   */
  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 清理过期的缓存项
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[MemoryCache] Cleaned ${cleanedCount} expired entries`);
    }
  }

  /**
   * 销毁缓存实例
   */
  destroy(): void {
    this.stopCleanup();
    this.cache.clear();
  }
}

// 创建默认实例
export const memoryCache = new MemoryCache();
