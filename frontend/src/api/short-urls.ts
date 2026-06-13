import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  headers: {
    "Content-Type": "application/json",
  },
})

export type ShortUrl = {
  code: string
  shortUrl: string
  originalUrl: string
}

export type CreateShortUrlResult = ShortUrl & {
  created: boolean
}

export type ApiErrorResponse = {
  error: {
    code: string
    message: string
  }
}

const isShortUrl = (value: unknown): value is ShortUrl => {
  if (!value || typeof value !== "object") return false

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.code === "string" &&
    typeof candidate.shortUrl === "string" &&
    typeof candidate.originalUrl === "string"
  )
}

export async function createShortUrl(url: string): Promise<CreateShortUrlResult> {
  const response = await api.post<ShortUrl>("/urls", { url })

  if (!isShortUrl(response.data)) {
    throw new Error("The server returned an invalid short URL response.")
  }

  return {
    ...response.data,
    created: response.status === 201,
  }
}
