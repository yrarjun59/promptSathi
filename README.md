# promptSathi ✨🎤

<p align="center">
  <img src="extension/icons/icon128.png" width="96" alt="promptSathi logo">
</p>

<h3 align="center">Your prompt friend — improves your AI prompts the moment you hit Enter</h3>

**promptSathi** is a free, open Chrome extension for **ChatGPT, Claude, Gemini, Grok, z.ai** (and any AI-chat site you add) that:

1. **Improves your prompt when you press Enter.** Sathi pauses the send, shows your original vs. an improved version side-by-side (with a 1–5 quality rating and a one-line note). Send the improved one, send your original, or refine it with feedback chips (*Shorter · More detail · More formal · Add examples · Fix language*) or free text — as many times as you like.
2. **Understands Romanized Nepali.** Type Nepali in Latin letters ("malai momo shop ko lagi website banaidi…") and Sathi improves it **in romanized Nepali** — never converting to Devanagari, never translating to English. This is promptSathi's signature feature.
3. **Language-routed AI.** English prompts are improved by `GPT-OSS-120b`; Nepali (Devanagari or romanized) by `Qwen 3.8` — the best model for each script, on free tiers.
4. **Adds nothing you didn't say.** Unknown details become bracketed placeholders like `[your shop hours]` — the AI is never allowed to invent facts about you.

No accounts. No tracking. No prompt history. Nothing stored anywhere.

---

## Table of contents

- [How it works](#how-it-works)
- [Install (any device, ~3 minutes)](#install-any-device-3-minutes)
- [Connection modes](#connection-modes)
- [Deploy your own server (optional)](#deploy-your-own-server-optional)
- [Add any AI site](#add-any-ai-site)
- [Voice input](#voice-input)
- [Command reference](#command-reference)
- [Privacy](#privacy)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Support](#support)

---

## How it works

```
you type (or dictate) a lazy prompt
        │
        ▼  Enter
┌───────────────────────────────────────────┐
│ ✨ promptSathi               ★★☆☆☆        │
│ YOUR PROMPT   "make me a website…"        │
│ IMPROVED ✨   Task: … Context: … Require… │
│               (additions highlighted)     │
│ Sathi: names the one thing to clarify     │
│                                           │
│ [Send improved] [No thanks, send as-is] ↻ │
│ (Shorter)(More detail)(More formal)(…)    │
│ Or tell Sathi what to change…   [Apply]   │
└───────────────────────────────────────────┘
        │ you choose
        ▼
the site sends exactly what you picked
```

**Fail-open by design:** if the AI backend is unreachable, slow, or unconfigured, **Enter just sends normally** — Sathi never blocks you. If a send can't be completed automatically, Sathi fills the box and asks you to press Enter; your original prompt is never sent by mistake.

## Install (any device, ~3 minutes)

Works on any OS (Windows / macOS / Linux / ChromeOS) with any Chromium browser: **Chrome, Edge, Brave, Arc, Opera, Vivaldi**.

### Step 0 — clone the repository

```bash
git clone https://github.com/yrarjun59/promptSathi.git
cd promptSathi
```

(No git? Click **Code → Download ZIP** on GitHub, then unzip it.)

### Step 1 — get a free AI key

Create a free key at **[console.groq.com](https://console.groq.com/keys)** (no credit card) — it starts with `gsk_…`. Copy it.

### Step 2 — load the extension

1. Open your browser and go to `chrome://extensions`
   (Edge: `edge://extensions`, Brave: `brave://extensions`, Vivaldi: `vivaldi://extensions`)
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the **`extension/`** folder from the cloned repository

### Step 3 — connect the AI

1. Click the **promptSathi icon** in your browser toolbar
2. Open the connection row and pick a mode:

| Mode | What you need | Best for |
|---|---|---|
| **Sathi server** *(default — already configured)* | nothing | everyone; uses the project's shared free worker |
| **Groq key** | your `gsk_…` key | your own free Groq quota (1,000 improves/day) |
| **OpenRouter key** | your `sk-or-…` key from [openrouter.ai/keys](https://openrouter.ai/keys) | free OpenRouter models |

3. Click **Test connection** → the status row turns 🟢 **Connected**

### Step 4 — use it

Open **chatgpt.com**, **claude.ai**, **gemini.google.com**, **grok.com** or **chat.z.ai** → type a lazy prompt → press **Enter** → review → send. That's it.

## Connection modes

- **Sathi server** (default): prompts are improved by a stateless Cloudflare Worker (Groq's free tier). Zero setup — the URL is baked into the extension.
- **Groq key** (private): your key stays encrypted in your browser and calls Groq directly. The extension auto-heals if Groq retires a model.
- **OpenRouter key** (private): same, but through OpenRouter's free-model catalog (auto-discovers a live `:free` model).

**Prefer maximum privacy?** Deploy your own worker (below) — then even the shared server is out of the picture.

## Deploy your own server (optional)

Requires Node.js 18+ and a free Cloudflare account.

```bash
# 1. install the Cloudflare CLI (one time)
npm install -g wrangler

# 2. from the server folder, log in to Cloudflare (opens your browser)
cd server
npx wrangler login

# 3. attach your free Groq key as an encrypted secret
npx wrangler secret put GROQ_API_KEY
#    → paste your gsk_… key when prompted

# 4. deploy
npx wrangler deploy
#    → prints https://promptsathi.<your-name>.workers.dev

# 5. (optional) automatic failover to OpenRouter when Groq caps out
npx wrangler secret put OPENROUTER_API_KEY
```

Then paste your `workers.dev` URL into the extension popup → **Test connection**.

## Add any AI site

Sathi ships with tuned support for ChatGPT, Claude, Gemini, Grok and z.ai — but it also works on **any AI-chat site**:

1. popup → **My AI sites** → type a domain like `chat.mistral.ai` → **Add**
2. approve the permission once
3. done — Sathi auto-detects that site's chat box and send button

Remove anytime with the ✕ next to the site.

## Voice input

A 🎤 button next to the chat box dictates into the composer (English US/India, नेपाली, and any Web-Speech locale — add options in `popup/popup.html`). Voice is currently **parked behind a setting** (`micEnabled: false` in `extension/content/content.js`) while the core flow is being hardened — flip it to `true` to enable.

## Command reference

| Task | Command |
|---|---|
| Clone | `git clone https://github.com/yrarjun59/promptSathi.git` |
| Run the server locally | `cd server && npx wrangler dev` |
| Run the server test-suite | `cd server && npm test` |
| Deploy the server | `cd server && npx wrangler deploy` |
| Set the Groq secret | `cd server && npx wrangler secret put GROQ_API_KEY` |
| Set the OpenRouter failover secret | `cd server && npx wrangler secret put OPENROUTER_API_KEY` |
| Check which models your key can use | `curl https://promptsathi.<you>.workers.dev/debug/models` |
| Improve a prompt from the terminal | `curl -X POST https://promptsathi.<you>.workers.dev/improve -H "Content-Type: application/json" -d '{"prompt":"your lazy prompt"}'` |
| Regenerate extension icons | `cd extension/icons/src && bash make-icons.sh` |
| Full browser test-suite | see `server/smoke-test.mjs` + the E2E harness notes in `docs/` |

After changing extension code: `chrome://extensions` → **↻** on promptSathi → refresh your AI tabs (F5).
After changing server code: `npx wrangler deploy` — no extension reload needed.

## Privacy

- Prompts are sent to the AI backend **only when you press Enter**.
- The worker is **stateless**: no database, no logging, no analytics. Rate limiting is a short-lived in-memory counter.
- Your own keys (Groq/OpenRouter) are **AES-GCM-encrypted** in your browser's sync storage and never touch any server.
- Nothing is stored anywhere else. No accounts.

## Project structure

```
promptSathi/
├── extension/                  ← the Chrome extension (load this unpacked)
│   ├── manifest.json           MV3 manifest (permissions, sites, modes)
│   ├── content/
│   │   ├── sites.js            per-site composer/send selectors (+ generic fallback)
│   │   ├── content.js          Enter-interception, review panel, send ladder, voice
│   │   └── sathi.css           panel styles (shadow-DOM isolated)
│   ├── background/
│   │   └── service-worker.js   AI providers: Groq direct + OpenRouter (BYO modes)
│   ├── popup/                  settings UI (connection modes, sites, rating, support)
│   └── icons/                  artwork + generator script
├── server/                     ← the stateless Cloudflare Worker (Groq proxy)
│   ├── worker.js               /improve endpoint, model self-healing, language routing
│   ├── smoke-test.mjs          9 automated tests (npm test)
│   └── wrangler.toml           deployment config
└── README.md
```

## Testing

```bash
cd server
npm test
```

runs 9 automated tests against the worker logic (health, CORS, validation, error paths, live Groq error handling). The browser E2E suite drives a real Chromium with the loaded extension through the full flow (interception, no-leak, improvement round-trip, send ladder, dedupe, feedback chips).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Extension context invalidated" | The extension was reloaded — **refresh (F5) the open AI tabs** once |
| Enter sends without the panel | Popup → check the status row is 🟢 and the mode is right |
| Panel shows an error banner | Read it: rate-limit (wait a minute), auth (re-paste key), or network |
| Site not covered | Popup → **My AI sites** → add the domain |
| Voice 🎤 missing | Voice is parked (`micEnabled` in `content/content.js`) — flip to `true` |
| Groq model error | The worker self-heals by discovering live models; make sure `server/worker.js` is deployed (`npx wrangler deploy`) |

## Support

If promptSathi saves you time, the classic Nepali way to say thanks:

<a href="https://www.buymeacoffee.com/">☕ Buy me a coffee</a> · <a href="https://www.buymeacoffee.com/">🥟 Buy me a momo</a> · ⭐ Rate it on the Chrome Web Store (coming soon)

*(links will go live with the first store release)*

## License

MIT © 2026 Arjun Thapa — see [LICENSE](LICENSE).
