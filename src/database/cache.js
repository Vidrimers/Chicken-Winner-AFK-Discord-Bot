/**
 * Менеджер кэширования для базы данных
 */

export class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
  }

  /**
   * Получить значение из кэша
   */
  get(key) {
    if (!this.isValid(key)) {
      return null;
    }
    return this.cache.get(key);
  }

  /**
   * Установить значение в кэш
   */
  set(key, value, ttlSeconds = 60) {
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + ttlSeconds * 1000);
  }

  /**
   * Проверить валидность кэша
   */
  isValid(key) {
    if (!this.cache.has(key)) {
      return false;
    }

    const expiry = this.ttl.get(key);
    if (Date.now() > expiry) {
      this.cache.delete(key);
      this.ttl.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Инвалидировать кэш по паттерну
   */
  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        this.ttl.delete(key);
      }
    }
  }

  /**
   * Очистить весь кэш
   */
  clear() {
    this.cache.clear();
    this.ttl.clear();
  }
}
