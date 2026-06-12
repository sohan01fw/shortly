import { redis } from "../dependencies";

const positiveCacheTtlSeconds = 24 * 60 * 60;
const negativeCacheTtlSeconds = 60;
const missingShortUrlSentinel = "__SHORT_URL_NOT_FOUND__";

export type RedirectCache = {
  lookup(shortCode: string): Promise<RedirectCacheResult>;
  storeOriginalUrl(shortCode: string, originalUrl: string): Promise<void>;
  storeMissing(shortCode: string): Promise<void>;
};

export type PositiveRedirectCache = Pick<RedirectCache, "storeOriginalUrl">;

export type RedirectCacheResult =
  | { kind: "hit"; originalUrl: string }
  | { kind: "missing" }
  | { kind: "absent" };

const cacheKey = (shortCode: string): string => `short-url:${shortCode}`;

export const redisRedirectCache: RedirectCache = {
  async lookup(shortCode) {
    const value = await redis.get(cacheKey(shortCode));

    if (value === null) {
      return { kind: "absent" };
    }

    if (value === missingShortUrlSentinel) {
      return { kind: "missing" };
    }

    return { kind: "hit", originalUrl: value };
  },

  async storeOriginalUrl(shortCode, originalUrl) {
    await redis.set(cacheKey(shortCode), originalUrl, {
      EX: positiveCacheTtlSeconds,
    });
  },

  async storeMissing(shortCode) {
    await redis.set(cacheKey(shortCode), missingShortUrlSentinel, {
      EX: negativeCacheTtlSeconds,
    });
  },
};
