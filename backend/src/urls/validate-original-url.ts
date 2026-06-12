const maximumUrlLength = 2048;

export const invalidUrlError = {
  error: {
    code: "INVALID_URL",
    message: "A valid HTTP or HTTPS URL is required.",
  },
} as const;

export const isValidOriginalUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > maximumUrlLength) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
