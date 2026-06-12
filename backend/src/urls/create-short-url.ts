import { randomInt } from "node:crypto";

import { postgres } from "../dependencies";
import { normalizeOriginalUrl } from "./normalize-original-url";

const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const maximumCodeAttempts = 5;

export type ShortCodeSource = () => string;

export const createShortCode: ShortCodeSource = () =>
  Array.from({ length: 7 }, () => base62[randomInt(base62.length)]).join("");

export class ShortCodeGenerationError extends Error {
  constructor() {
    super("Unable to generate a unique short URL.");
    this.name = "ShortCodeGenerationError";
  }
}

export type ShortUrl = {
  code: string;
  shortUrl: string;
  originalUrl: string;
};

export type CreateShortUrlResult = {
  shortUrl: ShortUrl;
  created: boolean;
};

export const createShortUrl = async (
  originalUrl: string,
  shortUrlBaseUrl: string,
  codeSource: ShortCodeSource = createShortCode,
): Promise<CreateShortUrlResult> => {
  const normalizedUrl = normalizeOriginalUrl(originalUrl);
  const existing = await findByNormalizedUrl(normalizedUrl);

  if (existing) {
    return buildResult(existing, shortUrlBaseUrl, false);
  }

  for (let attempt = 0; attempt < maximumCodeAttempts; attempt += 1) {
    const code = codeSource();

    try {
      const inserted = await postgres.query<UrlRow>(
        `INSERT INTO urls (short_code, original_url, normalized_url)
         VALUES ($1, $2, $2)
         ON CONFLICT (normalized_url) DO NOTHING
         RETURNING short_code, original_url`,
        [code, normalizedUrl],
      );

      if (inserted.rowCount === 1) {
        return buildResult(inserted.rows[0], shortUrlBaseUrl, true);
      }

      const winningRow = await findByNormalizedUrl(normalizedUrl);

      if (!winningRow) {
        throw new Error("Normalized URL conflict did not produce a stored row");
      }

      return buildResult(winningRow, shortUrlBaseUrl, false);
    } catch (error) {
      if (!isShortCodeConflict(error)) {
        throw error;
      }
    }
  }

  throw new ShortCodeGenerationError();
};

type UrlRow = {
  short_code: string;
  original_url: string;
};

const findByNormalizedUrl = async (
  normalizedUrl: string,
): Promise<UrlRow | undefined> => {
  const result = await postgres.query<UrlRow>(
    `SELECT short_code, original_url
     FROM urls
     WHERE normalized_url = $1`,
    [normalizedUrl],
  );

  return result.rows[0];
};

const buildResult = (
  row: UrlRow,
  shortUrlBaseUrl: string,
  created: boolean,
): CreateShortUrlResult => ({
  created,
  shortUrl: {
    code: row.short_code,
    shortUrl: `${shortUrlBaseUrl.replace(/\/$/, "")}/${row.short_code}`,
    originalUrl: row.original_url,
  },
});

const isShortCodeConflict = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const postgresError = error as { code?: string; constraint?: string };
  return postgresError.code === "23505"
    && postgresError.constraint === "urls_short_code_key";
};
