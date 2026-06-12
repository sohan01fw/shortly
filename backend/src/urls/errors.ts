export const shortUrlNotFoundError = {
  error: {
    code: "SHORT_URL_NOT_FOUND",
    message: "Short URL not found.",
  },
} as const;

export const redirectUnavailableError = {
  error: {
    code: "REDIRECT_UNAVAILABLE",
    message: "Unable to resolve the short URL right now.",
  },
} as const;
