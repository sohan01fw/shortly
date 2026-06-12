const requiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 5000),
  databaseUrl: requiredEnv("DATABASE_URL"),
  redisUrl: requiredEnv("REDIS_URL"),
  shortUrlBaseUrl: process.env.SHORT_URL_BASE_URL ?? "http://localhost:5000",
};
