import type { Express } from "express";

import { postgres, startDependencies, stopDependencies } from "./dependencies";
import { runMigrations } from "./database/migrations";

export const startServer = async (
  app: Express,
  port: number,
  serverName: string,
): Promise<void> => {
  await startDependencies();
  await runMigrations(postgres);

  const server = app.listen(port, () => {
    console.log(`${serverName} listening on port ${port}`);
  });

  const shutdown = (): void => {
    server.close(async () => {
      await stopDependencies();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};
