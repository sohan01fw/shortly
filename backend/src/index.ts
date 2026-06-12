import { app } from "./app";
import { config } from "./config";
import { startServer } from "./start-server";

await startServer(app, config.creationPort, "Creation Server");
