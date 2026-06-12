import { config } from "./config";
import { redirectApp } from "./redirect-app";
import { startServer } from "./start-server";

await startServer(redirectApp, config.redirectPort, "Redirect Server");
