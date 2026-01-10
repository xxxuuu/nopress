/**
 * 缓存接口定义
 */
export interface Cache {
  /**
   * 获取缓存数据
   * @param key 缓存键
   * @returns 缓存的数据，如果不存在或已过期则返回 null
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * 设置缓存数据
   * @param key 缓存键
   * @param value 要缓存的数据
   * @param ttl 过期时间（毫秒），默认使用缓存实例的默认 TTL
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * 删除缓存数据
   * @param key 缓存键
   */
  delete(key: string): Promise<void>;

  /**
   * 清空所有缓存
   */
  clear(): Promise<void>;

  /**
   * 检查缓存是否存在且未过期
   * @param key 缓存键
   */
  has(key: string): Promise<boolean>;
}

/**
 * 缓存项结构
 */
export interface CacheEntry<T> {
  /** 缓存的数据 */
  data: T;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
  /** 创建时间戳（毫秒） */
  createdAt: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 默认过期时间（毫秒），默认 5 分钟 */
  defaultTTL?: number;
  /** 缓存命名空间，用于区分不同的缓存域 */
  namespace?: string;
  /** 是否启用缓存，默认 true */
  enabled?: boolean;
}

/**
 * 文件缓存配置
 */
export interface FileCacheConfig extends CacheConfig {
  /** 缓存目录路径 */
  cacheDir?: string;
  /** 是否压缩缓存文件，默认 false */
  compress?: boolean;
}
