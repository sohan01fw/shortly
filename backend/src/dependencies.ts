import { Pool } from "pg";
import { createClient } from "redis";

import { config } from "./config";

type DependencyStatus = "up" | "down";

export type DependencyHealth = {
  status: "ok" | "error";
  postgres: DependencyStatus;
  redis: DependencyStatus;
};

const postgres = new Pool({ connectionString: config.databaseUrl });
const redis = createClient({ url: config.redisUrl });

redis.on("error", (error) => {
  console.error("Redis error", error);
});

export const startDependencies = async (): Promise<void> => {
  await Promise.all([postgres.query("SELECT 1"), redis.connect()]);
};

export const stopDependencies = async (): Promise<void> => {
  await Promise.allSettled([postgres.end(), redis.quit()]);
};

export const checkDependencies = async (): Promise<DependencyHealth> => {
  const [postgresResult, redisResult] = await Promise.allSettled([
    postgres.query("SELECT 1"),
    redis.ping(),
  ]);

  const health: DependencyHealth = {
    status: "ok",
    postgres: postgresResult.status === "fulfilled" ? "up" : "down",
    redis: redisResult.status === "fulfilled" ? "up" : "down",
  };

  if (health.postgres === "down" || health.redis === "down") {
    health.status = "error";
  }

  return health;
};
