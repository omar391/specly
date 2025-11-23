# Specly UI (React + Rsbuild + Tailwind)

This package contains the Specly web UI built with React 19, Rsbuild, TypeScript, and Tailwind CSS.

## Quickstart

1) Install dependencies

```bash
bun install
```

2) Start the dev server

```bash
bun run dev
```

3) Production build

```bash
bun run build
```

- pnpm: `pnpm install` then `pnpm run dev`

## Environment variables

- `VITE_API_BASE_URL` (optional): Base URL for REST API. Defaults to `http://localhost:8989`.
- `VITE_MCP_SSE_URL` (optional): Base URL for SSE endpoint. Defaults to `${VITE_API_BASE_URL}/mcp`.

Example (macOS/Linux):

```bash
export VITE_API_BASE_URL=http://localhost:8989
export VITE_MCP_SSE_URL=http://localhost:8989/mcp
bun run dev
```

## Tech stack

- React 19 + TypeScript 5
- Rsbuild + @rsbuild/plugin-react
- Tailwind CSS 4
- @tanstack/react-router
- lucide-react icons, Radix UI primitives

## Routing overview

- Home: `/`
- Workspace tasks: `/workspace/:workspaceId/tasks`
- Specs: `/specs`
- Tools: `/tools`

## Scripts

- `bun run dev` — start the Rsbuild dev server
- `bun run build` — production build (outputs to `dist/`)

## Notes

- Legacy Tool Flows and Feedback Steps pages/components were removed in favor of a simpler Tasks-first UI.
- API client is located at `src/lib/api-client.ts`.

## Troubleshooting

- API requests failing (4xx/5xx): verify `VITE_API_BASE_URL` points to your running backend.
- SSE connection errors: check `VITE_MCP_SSE_URL` and that the backend SSE endpoint is enabled.
- Type errors or missing types: ensure dependencies are installed (`bun install`) and you’re on the UI workspace directory before running commands.
- Theme storage key changed to `specly-theme`. If your browser had a previous Specly theme value, it won’t be reused (by design).

## Branding tokens

- Core design tokens live in `src/lib/design-system.ts` and `src/design-system.json`. The design system is now named “Specly Design System”.
