# PocketLog

Private, local-first expense tracker for iPhone and Mac. A PWA with no backend: all data lives in IndexedDB on each device. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design and security model.

## Development

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm check        # typecheck + lint + format check + tests
pnpm build && pnpm preview   # production build with the service worker
```

## Deploying (Vercel)

1. Import this repo in the Vercel dashboard (framework: Vite, no environment variables).
2. Leave Deployment Protection on its default (Standard Protection covers previews). Production serves only code; data never leaves the device.
3. On iPhone: open the production URL in Safari → Share → **Add to Home Screen**. Always use the Home Screen app; it has its own storage, separate from Safari.
4. On Mac: Safari → File → **Add to Dock**.
