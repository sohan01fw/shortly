# Shortly Frontend

React and TypeScript frontend built with Vite, Tailwind CSS, shadcn/ui,
TanStack React Query, and Axios.

## Development

```sh
bun install
bun run dev
```

The development server is available at `http://localhost:5173`.
Requests to `/api` are proxied to the backend gateway at
`http://localhost:5000`. Set `VITE_API_BASE_URL` to use a different API base.

## Verify

```sh
bun run lint
bun run typecheck
bun run test
bun run build
```
