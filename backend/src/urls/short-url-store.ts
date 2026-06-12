import { postgres } from "../dependencies";

export type ShortUrlStore = {
  findOriginalUrl(shortCode: string): Promise<string | undefined>;
};

type UrlRow = {
  original_url: string;
};

export const postgresShortUrlStore: ShortUrlStore = {
  async findOriginalUrl(shortCode) {
    const result = await postgres.query<UrlRow>(
      `SELECT original_url
       FROM urls
       WHERE short_code = $1`,
      [shortCode],
    );

    return result.rows[0]?.original_url;
  },
};
