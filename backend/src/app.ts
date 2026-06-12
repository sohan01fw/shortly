import express from "express";

import { config } from "./config";
import { checkDependencies } from "./dependencies";
import {
  createShortCode,
  createShortUrl,
  ShortCodeGenerationError,
  type ShortCodeSource,
} from "./urls/create-short-url";
import {
  invalidUrlError,
  isValidOriginalUrl,
} from "./urls/validate-original-url";

const shortCodeGenerationFailedError = {
  error: {
    code: "SHORT_CODE_GENERATION_FAILED",
    message: "Unable to generate a unique short URL.",
  },
} as const;

const internalServerError = {
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Unable to create the short URL.",
  },
} as const;

export const createApp = (
  codeSource: ShortCodeSource = createShortCode,
): express.Express => {
  const app = express();

  app.use(express.json());

  app.get("/", (_request, response) => {
    response.status(200).send("Hello World");
  });

  app.get("/health", async (_request, response) => {
    const health = await checkDependencies();
    response.status(health.status === "ok" ? 200 : 503).json(health);
  });

  app.post("/urls", async (request, response) => {
    const originalUrl = request.body.url;

    if (!isValidOriginalUrl(originalUrl)) {
      response.status(400).json(invalidUrlError);
      return;
    }

    try {
      const result = await createShortUrl(
        originalUrl,
        config.shortUrlBaseUrl,
        codeSource,
      );
      response.status(result.created ? 201 : 200).json(result.shortUrl);
    } catch (error) {
      if (error instanceof ShortCodeGenerationError) {
        response.status(500).json(shortCodeGenerationFailedError);
        return;
      }

      console.error("Unexpected URL creation error", error);
      response.status(500).json(internalServerError);
    }
  });

  return app;
};

export const app = createApp();
