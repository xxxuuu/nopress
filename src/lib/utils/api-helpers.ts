/**
 * API 限流器
 * 基于 p-limit 实现，支持并发控制和请求间隔控制
 */
import pLimit from 'p-limit';

export class RateLimiter {
  private limit: ReturnType<typeof pLimit>;
  private lastRequestTime = 0;
  private minDelay: number;

  /**
   * @param maxConcurrent 最大并发请求数，默认 3
   * @param minDelay 每个请求之间的最小延迟（毫秒），默认 100ms
   */
  constructor(maxConcurrent = 3, minDelay = 0) {
    this.limit = pLimit(maxConcurrent);
    this.minDelay = minDelay;
  }

  /**
   * 执行带限流的异步操作
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 请求间隔控制
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minDelay) {
      const waitTime = this.minDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // 并发控制 + 记录最后请求时间
    const result = await this.limit(fn);
    this.lastRequestTime = Date.now();

    return result;
  }

  /**
   * 获取当前状态
   */
  getStats() {
    return {
      activeCount: this.limit.activeCount,
      pendingCount: this.limit.pendingCount,
      minDelay: this.minDelay,
    };
  }
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 初始延迟时间（毫秒），默认 1000ms */
  initialDelay?: number;
  /** 延迟倍数，默认 2（指数退避） */
  backoffMultiplier?: number;
  /** 最大延迟时间（毫秒），默认 30000ms (30秒) */
  maxDelay?: number;
  /** 是否应该重试的判断函数 */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * 重试助手
 * 实现指数退避重试策略
 */
export class RetryHelper {
  private config: Required<RetryConfig>;

  constructor(config: RetryConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      initialDelay: config.initialDelay ?? 1000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      maxDelay: config.maxDelay ?? 30000,
      shouldRetry: config.shouldRetry ?? this.defaultShouldRetry,
    };
  }

  /**
   * 默认的重试判断逻辑
   * 网络错误和 5xx 服务器错误应该重试
   */
  private defaultShouldRetry(error: Error): boolean {
    // 网络错误
    if (error.message.includes('fetch failed') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('network')) {
      return true;
    }

    // Notion API 特定错误
    if (error.message.includes('rate_limited') ||
        error.message.includes('service_unavailable') ||
        error.message.includes('internal_server_error')) {
      return true;
    }

    return false;
  }

  /**
   * 执行带重试的异步操作
   */
  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // 检查是否应该重试
        if (attempt > this.config.maxRetries || !this.config.shouldRetry(lastError)) {
          break;
        }

        // 计算延迟时间（指数退避）
        const delay = Math.min(
          this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt - 1),
          this.config.maxDelay
        );

        console.warn(
          `[Retry] Attempt ${attempt}/${this.config.maxRetries} failed${context ? ` (${context})` : ''}: ${lastError.message}`
        );
        console.warn(`[Retry] Waiting ${delay}ms before retry...`);

        // 等待后重试
        await this.sleep(delay);
      }
    }

    // 所有重试都失败
    console.error(
      `[Retry] All ${this.config.maxRetries} retries failed${context ? ` (${context})` : ''}: ${lastError!.message}`
    );
    throw lastError!;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 创建全局限流器实例（用于 Notion API）
export const notionRateLimiter = new RateLimiter(5, 50);

// 创建全局重试助手实例
export const notionRetryHelper = new RetryHelper({
  maxRetries: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 10000,
});
