import { type FormEvent, useEffect, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { AxiosError } from "axios"
import { Check, Copy, ExternalLink, Link2, LoaderCircle, Sparkles } from "lucide-react"

import {
  createShortUrl,
  type ApiErrorResponse,
  type CreateShortUrlResult,
} from "@/api/short-urls"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const validateUrl = (value: string): string | null => {
  if (!value.trim()) {
    return "Enter a URL to shorten."
  }

  try {
    const parsedUrl = new URL(value.trim())

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return "Use a URL that starts with http:// or https://."
    }
  } catch {
    return "Enter a valid URL, including http:// or https://."
  }

  return null
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError) {
    const response = error.response?.data as ApiErrorResponse | undefined

    if (response?.error?.message) {
      return response.error.message
    }

    if (!error.response) {
      return "We couldn't reach Shortly. Check that the backend is running and try again."
    }
  }

  if (error instanceof Error && error.message.includes("invalid short URL response")) {
    return "Shortly received an unexpected response. Please try again."
  }

  return "Something went wrong while shortening your URL. Please try again."
}

export function App() {
  const [url, setUrl] = useState("")
  const [validationError, setValidationError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const mutation = useMutation({
    mutationFn: createShortUrl,
    onSuccess: () => setCopied(false),
  })

  useEffect(() => {
    if (!copied) return

    const timeout = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const error = validateUrl(url)
    setValidationError(error)

    if (error) return

    mutation.mutate(url.trim())
  }

  const handleCopy = async (result: CreateShortUrlResult) => {
    try {
      await navigator.clipboard.writeText(result.shortUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,oklch(0.93_0.07_250/.7),transparent_34%),radial-gradient(circle_at_85%_20%,oklch(0.94_0.08_165/.65),transparent_28%)]" />
      <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-3xl flex-col justify-center sm:min-h-[calc(100svh-6rem)]">
        <header className="mb-10 text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-white/70 px-3 py-1.5 text-sm font-semibold text-primary shadow-sm backdrop-blur">
            <Link2 className="size-4" aria-hidden="true" />
            Shortly
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-[-0.04em] sm:text-6xl">
            Short links. <span className="text-primary">Long reach.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Turn unwieldy URLs into clean, shareable links in a second.
          </p>
        </header>

        <Card className="border-white/80 bg-white/80 shadow-[0_24px_80px_-28px_oklch(0.35_0.08_250/.35)] backdrop-blur-xl">
          <CardContent className="p-5 sm:p-8">
            <form onSubmit={handleSubmit} noValidate>
              <Label htmlFor="url" className="mb-2.5 block text-sm font-semibold">
                Paste your long URL
              </Label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  id="url"
                  name="url"
                  type="url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    if (validationError) setValidationError(null)
                  }}
                  placeholder="https://example.com/a/very/long/link"
                  aria-invalid={Boolean(validationError)}
                  aria-describedby={validationError ? "url-error" : undefined}
                  className="h-12 flex-1 bg-white/80 px-4 text-base"
                  disabled={mutation.isPending}
                  autoComplete="url"
                  autoFocus
                />
                <Button type="submit" size="lg" className="h-12 px-6" disabled={mutation.isPending}>
                  {mutation.isPending ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Shortening
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" aria-hidden="true" />
                      Shorten URL
                    </>
                  )}
                </Button>
              </div>

              {validationError && (
                <p id="url-error" className="mt-2 text-sm font-medium text-destructive" role="alert">
                  {validationError}
                </p>
              )}
            </form>

            {mutation.isError && (
              <Alert variant="destructive" className="mt-5">
                <AlertDescription>{getErrorMessage(mutation.error)}</AlertDescription>
              </Alert>
            )}

            {mutation.data && (
              <ResultCard result={mutation.data} copied={copied} onCopy={handleCopy} />
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Fast, simple, and ready to share.
        </p>
      </div>
    </main>
  )
}

type ResultCardProps = {
  result: CreateShortUrlResult
  copied: boolean
  onCopy: (result: CreateShortUrlResult) => Promise<void>
}

function ResultCard({ result, copied, onCopy }: ResultCardProps) {
  const shortUrl = String(result.shortUrl ?? "")
  const originalUrl = String(result.originalUrl ?? "")

  return (
    <section className="mt-6 border-t border-border pt-6" aria-live="polite">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-sm font-semibold">Your short link is ready</p>
        <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
          {result.created ? "New link" : "Existing link"}
        </span>
      </div>
      <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
        <a
          href={shortUrl}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-lg font-bold tracking-tight text-primary underline-offset-4 hover:underline"
        >
          {shortUrl}
        </a>
        <p className="mt-1 truncate text-sm text-muted-foreground" title={originalUrl}>
          {originalUrl}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="sm:flex-1" onClick={() => void onCopy(result)}>
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <a
            href={shortUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-1"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Open link
          </a>
        </div>
      </div>
    </section>
  )
}
