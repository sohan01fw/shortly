import { app } from "./app";
import { config } from "./config";
import { postgres, startDependencies, stopDependencies } from "./dependencies";
import { runMigrations } from "./database/migrations";

await startDependencies();
await runMigrations(postgres);

const server = app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});

const shutdown = async (): Promise<void> => {
  server.close(async () => {
    await stopDependencies();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
