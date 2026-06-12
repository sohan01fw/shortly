import express from "express";

import { checkDependencies } from "./dependencies";

export const app = express();

app.get("/", (_request, response) => {
  response.status(200).send("Hello World");
});

app.get("/health", async (_request, response) => {
  const health = await checkDependencies();
  response.status(health.status === "ok" ? 200 : 503).json(health);
});
