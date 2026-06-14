import { postgres, redis, startDependencies, stopDependencies } from "../dependencies";

const loadTestUrlPrefix = "https://load-test.example.com/";

type LoadTestUrlRow = {
  short_code: string;
};

const cleanup = async (): Promise<void> => {
  await startDependencies();

  const matchingUrls = await postgres.query<LoadTestUrlRow>(
    `SELECT short_code
     FROM urls
     WHERE normalized_url LIKE $1`,
    [`${loadTestUrlPrefix}%`],
  );

  const cacheKeys = matchingUrls.rows.map(
    ({ short_code }) => `short-url:${short_code}`,
  );
  let deletedCacheKeys = 0;

  for (let index = 0; index < cacheKeys.length; index += 1_000) {
    deletedCacheKeys += await redis.del(cacheKeys.slice(index, index + 1_000));
  }

  const deletedUrls = await postgres.query(
    `DELETE FROM urls
     WHERE normalized_url LIKE $1`,
    [`${loadTestUrlPrefix}%`],
  );

  console.log(
    `Removed ${deletedUrls.rowCount ?? 0} load-test URLs from PostgreSQL `
      + `and ${deletedCacheKeys} cache entries from Redis.`,
  );
};

try {
  await cleanup();
} finally {
  await stopDependencies();
}
