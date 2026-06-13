import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios"
import { afterEach, describe, expect, test, vi } from "vitest"

import { App } from "@/App"

const postMock = vi.hoisted(() => vi.fn())

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>()

  return {
    ...actual,
    default: {
      ...actual.default,
      create: () => ({ post: postMock }),
    },
  }
})

const shortUrl = {
  code: "ABC1234",
  shortUrl: "http://localhost:5000/ABC1234",
  originalUrl: "https://example.com/a-long-link",
}

const renderApp = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

const submitUrl = async (url = shortUrl.originalUrl) => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/paste your long url/i), url)
  await user.click(screen.getByRole("button", { name: /shorten url/i }))
  return user
}

const response = (status: number): AxiosResponse => ({
  data: shortUrl,
  status,
  statusText: status === 201 ? "Created" : "OK",
  headers: {},
  config: {} as InternalAxiosRequestConfig,
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("URL shortener", () => {
  test("creates and displays a new short URL", async () => {
    postMock.mockResolvedValue(response(201))
    renderApp()

    await submitUrl()

    expect(await screen.findByRole("link", { name: shortUrl.shortUrl })).toBeInTheDocument()
    expect(screen.getByText("New link")).toBeInTheDocument()
    expect(postMock).toHaveBeenCalledWith("/urls", { url: shortUrl.originalUrl })
  })

  test("marks a reused URL as an existing link", async () => {
    postMock.mockResolvedValue(response(200))
    renderApp()

    await submitUrl()

    expect(await screen.findByText("Existing link")).toBeInTheDocument()
  })

  test("validates missing and unsupported URLs before requesting", async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole("button", { name: /shorten url/i }))
    expect(screen.getByText("Enter a URL to shorten.")).toBeInTheDocument()

    await user.type(screen.getByLabelText(/paste your long url/i), "ftp://example.com/file")
    await user.click(screen.getByRole("button", { name: /shorten url/i }))
    expect(screen.getByText(/starts with http:\/\/ or https:\/\//i)).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalled()
  })

  test("shows the backend validation message", async () => {
    const apiResponse = {
      data: { error: { code: "INVALID_URL", message: "A valid HTTP or HTTPS URL is required." } },
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    }
    postMock.mockRejectedValue(new AxiosError("Bad Request", "ERR_BAD_REQUEST", undefined, undefined, apiResponse))
    renderApp()

    await submitUrl()

    expect(await screen.findByText("A valid HTTP or HTTPS URL is required.")).toBeInTheDocument()
  })

  test("does not crash when a 400 response has no structured error", async () => {
    const apiResponse = {
      data: {},
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    }
    postMock.mockRejectedValue(new AxiosError("Bad Request", "ERR_BAD_REQUEST", undefined, undefined, apiResponse))
    renderApp()

    await submitUrl()

    expect(await screen.findByText(/something went wrong while shortening/i)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /short links/i })).toBeInTheDocument()
  })

  test("shows a useful message when the backend is unreachable", async () => {
    postMock.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"))
    renderApp()

    await submitUrl()

    expect(await screen.findByText(/couldn't reach Shortly/i)).toBeInTheDocument()
  })

  test("shows an error instead of crashing on an invalid backend response", async () => {
    postMock.mockResolvedValue({ ...response(201), data: {} })
    renderApp()

    await submitUrl()

    expect(await screen.findByText(/unexpected response/i)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /short links/i })).toBeInTheDocument()
  })

  test("disables the form while shortening", async () => {
    let resolveRequest: (value: AxiosResponse) => void = () => undefined
    postMock.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    renderApp()

    await submitUrl()

    expect(screen.getByRole("button", { name: /shortening/i })).toBeDisabled()
    expect(screen.getByLabelText(/paste your long url/i)).toBeDisabled()
    resolveRequest(response(201))
    expect(await screen.findByText("New link")).toBeInTheDocument()
  })

  test("copies the short URL and confirms it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    postMock.mockResolvedValue(response(201))
    renderApp()
    const user = await submitUrl()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    await user.click(await screen.findByRole("button", { name: /copy link/i }))

    expect(writeText).toHaveBeenCalledWith(shortUrl.shortUrl)
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument()
  })

  test("can submit another URL after a successful result", async () => {
    postMock.mockResolvedValueOnce(response(201)).mockResolvedValueOnce({
      ...response(201),
      data: { ...shortUrl, code: "XYZ7890", shortUrl: "http://localhost:5000/XYZ7890" },
    })
    renderApp()
    const user = await submitUrl()
    await screen.findByText("New link")

    const input = screen.getByLabelText(/paste your long url/i)
    await user.clear(input)
    await user.type(input, "https://example.com/another")
    await user.click(screen.getByRole("button", { name: /shorten url/i }))

    expect(await screen.findByRole("link", { name: "http://localhost:5000/XYZ7890" })).toBeInTheDocument()
    expect(postMock).toHaveBeenCalledTimes(2)
  })

  test("keeps native submission behavior accessible", () => {
    renderApp()
    fireEvent.submit(screen.getByLabelText(/paste your long url/i).closest("form")!)
    expect(screen.getByText("Enter a URL to shorten.")).toBeInTheDocument()
  })
})
