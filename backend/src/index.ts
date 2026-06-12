import { app } from "./app";
import { config } from "./config";
import { startDependencies, stopDependencies } from "./dependencies";

await startDependencies();

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
