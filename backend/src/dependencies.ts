import { Pool } from "pg";
import { createClient } from "redis";

import { config } from "./config";

type DependencyStatus = "up" | "down";

export type DependencyHealth = {
  status: "ok" | "degraded" | "error";
  postgres: DependencyStatus;
  redis: DependencyStatus;
};

export type DependencyHealthCheck = () => Promise<DependencyHealth>;

type PostgresLifecycleDependency = {
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
};

type RedisLifecycleDependency = {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
};

type DependencyLifecycle = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

export const postgres = new Pool({ connectionString: config.databaseUrl });
export const redis = createClient({
  url: config.redisUrl,
  socket: { reconnectStrategy: false },
});

redis.on("error", (error) => {
  console.error("Redis error", error);
});

export const createDependencyLifecycle = (
  postgresDependency: PostgresLifecycleDependency,
  redisDependency: RedisLifecycleDependency,
  logError: (message: string, error: unknown) => void = console.error,
): DependencyLifecycle => ({
  async start() {
    await postgresDependency.query("SELECT 1");

    try {
      await redisDependency.connect();
    } catch (error) {
      logError("Unable to connect to Redis", error);
    }
  },

  async stop() {
    const redisStop = redisDependency.isOpen
      ? redisDependency.quit()
      : Promise.resolve();

    await Promise.allSettled([postgresDependency.end(), redisStop]);
  },
});

const dependencyLifecycle = createDependencyLifecycle(postgres, redis);

export const startDependencies = dependencyLifecycle.start;
export const stopDependencies = dependencyLifecycle.stop;

export const checkDependencies: DependencyHealthCheck = async () => {
  const [postgresResult, redisResult] = await Promise.allSettled([
    postgres.query("SELECT 1"),
    redis.ping(),
  ]);

  const health: DependencyHealth = {
    status: "ok",
    postgres: postgresResult.status === "fulfilled" ? "up" : "down",
    redis: redisResult.status === "fulfilled" ? "up" : "down",
  };

  if (health.postgres === "down") {
    health.status = "error";
  } else if (health.redis === "down") {
    health.status = "degraded";
  }

  return health;
};
