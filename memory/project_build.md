---
name: project-build
description: Sonescape Electron+TanStack Start app — how the production .app build pipeline works
metadata:
  type: project
---

TanStack Start is an SSR framework (Vinxi-based), but for Electron we bypass it entirely for production.

**Two build pipelines exist side-by-side:**
- `bun run dev` + `electron .` → dev mode, Electron loads http://localhost:8080 (TanStack Start dev server)
- `bun run build:app` → production .app, Electron loads local file

**Production pipeline (`bun run build:app`):**
1. `vite build --config vite.electron.ts` → outputs static SPA to `dist/renderer/`
2. `electron-builder --mac` → packages into `release/Sonescape.app` + `release/Sonescape-1.0.0-universal.dmg`

**Key files:**
- `vite.electron.ts` — standalone Vite config (no Vinxi/TanStack Start), uses `@vitejs/plugin-react` + `@tailwindcss/vite`, `base: './'` for file:// compat, outputs to `dist/renderer/`
- `src/electron-main.tsx` — CSR entry; creates TanStack Router with `createHashHistory()` (needed for file:// protocol), mounts to `#root`
- `index.html` — Vite SPA HTML entry (separate from the SSR pipeline)
- `main.js` — uses `loadFile(dist/renderer/index.html)` when `app.isPackaged`, `loadURL(localhost:8080)` in dev
- `build/entitlements.mac.plist` — JIT + microphone entitlements; Screen Recording is granted via System Settings at runtime
- `package.json` `"build"` field — electron-builder config; `identity: null` (unsigned/local), universal arch, outputs to `release/`

**Why hash history:** TanStack Router's browser history doesn't work with `file://` URLs. Hash history (`#/`) works.

**Why separate Vite config:** TanStack Start's config (`@lovable.dev/vite-tanstack-config`) uses Vinxi SSR mode and can't emit a static SPA bundle.

**Screen Recording:** Not an entitlement — granted by user in System Settings → Privacy & Security → Screen Recording. The `desktopCapturer` API triggers the prompt on first use.
