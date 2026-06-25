# Local LLM Chat Widget

Support-style chat widget backed by a local Ollama model. Streaming over WebSocket with a global FIFO queue.

**Stack:** Bun workspaces · React 19 + Vite + Tailwind · Bun + Hono · WebSocket · `@chatwidget/shared` · Ollama

## Background

I originally ran this on my portfolio site, exposing a single local model to
public traffic through a Cloudflare tunnel. One model serving many concurrent
strangers over an unreliable tunnel is why the queue and the timeout/error
handling exist.

## Features

- **Streaming chat** - token-by-token replies over WebSocket; supports Ollama “thinking” models (reasoning state before visible text).
- **Global queue** - server processes one request at a time; waiting clients get live position updates. Disconnecting clients are removed; dead sockets cleaned up with ping/pong. Stalled generations abort after 40s so the queue keeps moving.
- **Resilient client** — auto-reconnect with backoff; sends during reconnect queue up and go out on connect. ~8s to reach the server, ~50s backstop once you're in line. Failed replies show a **retry** button.
- **Native `<dialog>`** - desktop: non-modal corner panel (`show()`, page stays usable). Mobile: full-screen `showModal()` with focus trap and ESC.
- **Input pinned at the bottom** - fixed layout (header · scrollable messages · input). On mobile, `visualViewport` keeps header/input aligned when the on-screen keyboard opens (inner panel resized/translated; dialog shell stays `100dvh` so nothing flashes behind the keyboard).
- **Scroll while streaming** - auto-follows new tokens only if the user is already near the bottom; scrolling up pauses follow. “Scroll to latest” button when you've moved up (hidden during load/stream). Re-opens scroll to the end once.
- **Mobile scroll lock** - `position: fixed` body lock in modal mode; touch routing so only `.chat-messages` and the input scroll when needed. Swiping outside blurs the input to dismiss the keyboard.
- **Quick questions** - empty state with suggested prompts; on mobile, `visualViewport` resize resets scroll so the greeting section doesn't stay stuck after the keyboard closes.
- **Accessibility** - `aria-live` for queue status and final reply only; desktop focuses input on open, mobile focuses dialog without forcing the keyboard.

## Local development

**Prerequisites:** [Bun](https://bun.sh/) ≥ 1.3, [Ollama](https://ollama.ai/) with a model (default: `llama3.1:8b`).

```bash
ollama pull llama3.1:8b
ollama serve
bun install
bun run dev
```

**Test on a phone (same network):** open the client on your phone using your machine's LAN IP, not `localhost` (e.g. `http://192.168.1.x:5173` - `ipconfig getifaddr en0` on macOS). The widget targets the backend on that same host automatically, so no config is needed.

**Model:** `SELECTED_MODEL` in `client/src/components/chat/ChatMain.tsx`.

**Stream animation modes:** configurable visual styles for streaming replies — `fade` (per-phrase fade: whole sentences settle in), `word-queue` (fixed-cadence per-word fade), and `instant` (no animation / reduced-motion fallback). Switch via `STREAM_VISUAL_MODE` in `client/src/components/chat/stream/streamConfig.ts`.
