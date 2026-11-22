# 🧠 BRAINSTORM — promptSathi Social: the social-media post improver

> STATUS: **PARKED / DRAFT** — brainstorming only. Nothing here is built.
> Parent project: promptSathi (main branch). This branch exists purely for design work.

---

## 1. The idea (user's words, expanded)

**GOAL (refined 2026-11-22): improve social media posts to HIGH QUALITY — for both
professional and personal posts.** The judge and improved version must adapt tone by
context: professional posts (LinkedIn, work X/FB accounts) get clean, outcome-focused
rewrites; personal posts (private FB/IG) keep warmth, humor and authenticity. Quality
bar is the same as the chat feature: no compromise.

On social platforms (Facebook, Instagram, X/Twitter, LinkedIn, TikTok…), add an
**"Improve post" button** near the composer that:

1. **Judges** the drafted post against what performs best *on that specific platform*.
2. Shows **suggestions** (what's weak for that platform — length, hook, hashtags, tone, CTA).
3. Produces an **improved version** of the post.
4. The user **pastes the improved text into the post box themselves** — deliberate UX choice:
   no auto-insert, no auto-send. Social posts are personal; the human keeps final control.

**Signature extension (fits promptSathi's DNA):** Romanized-Nepali posts get improved
**in Romanized Nepali** — same script-lock rule as the chat feature.

## 2. Why most of promptSathi's core is reusable

| promptSathi asset | Reuse for Social |
|---|---|
| Resilient composer detection (contenteditable/textarea heuristics) | Finds the **post box** the same way |
| Custom-sites registration (`My AI sites` pattern) | Same mechanism: user adds `facebook.com`, `instagram.com`, `x.com` → permission → inject |
| Shadow-DOM review panel (diff, rating, chips) | New variant: **Post Review panel** (suggestions list + improved post + copy button) |
| Worker `/improve` + language routing + script lock | One new endpoint (`/post`) or an extra payload field `surface: "x"\|"instagram"\|…` that swaps the system prompt |
| Romanized-Nepali script lock | Applied to posts — signature differentiator no competitor has |
| Send ladder | **Not reused** — by design we never auto-post |

## 3. Per-platform "what performs best" (judge rubric sketch)

| Platform | Length sweet spot | Conventions the judge checks |
|---|---|---|
| **X / Twitter** | 1–2 short punchy lines (≤280 chars; threads for more) | Hook in first line, 0–2 hashtags, strong opinion or question |
| **Instagram** | Caption 60–125 words max | Emoji rhythm, hashtag block (5–15, end or first comment), line breaks for readability, CTA ("save this", "comment …") |
| **Facebook** | 1–4 short paragraphs, casual | Story arc, question to audience, minimal hashtags (0–3), native tone |
| **LinkedIn** | 3–5 sentences, professional | Hook line, concrete outcome/number, 3–5 niche hashtags, no emoji spam |
| **TikTok** | Ultra-short caption | 1 hook line + 3–5 trending-style tags |

Judge output sketch (JSON, same shape as today):
```json
{ "rating": 1-5, "notes": "one-line biggest weakness",
  "suggestions": ["hook is buried", "hashtags: 12 → 5 focused"],
  "improved": "the rewritten post" }
```

## 4. Open questions for the user (bring answers to the brainstorm)

1. **Platform priority** for v1? (suggested: X → Instagram → Facebook)
2. **Hashtag policy**: auto-add? suggest-only? respect user's?
3. **Tone presets**: keep platform-default, or add chips (casual / professional / funny / salesy)?
4. **Emoji handling**: auto-add per platform norms, or never touch user's emoji?
5. **Image-blind caveat**: Sathi can't see the photo/video — judge caption only, and ask the
   user to describe the visual? (v2: pass image to a vision model)
6. **Nepali content**: romanized-Nepali posts (improved in romanized) and Devanagari posts —
   confirm both, per platform?
7. **Button placement**: floating button near composer (like today's 🎤) vs popup-triggered?
8. **Language of suggestions**: match the post's language (romanized → romanized notes)?

## 5. MVP sketch (once approved)

1. `surface` field on the improve payload + per-platform system prompts on the worker.
2. Panel variant `Post Review`: suggestions list + improved post + **Copy** button (no send).
3. Detection: post-composer heuristics per platform (contenteditable + aria-label "post").
4. Ship behind the same custom-sites permission flow; platforms pre-tuned for X/IG/FB.

## 6. Risks

- Platform DOM churn → mitigated by generic detection + user-added sites (proven on Grok/z.ai).
- Long posts + free-tier token caps → trim/summarize path needed.
- "Best practices" are opinions → keep judge suggestions humble, cite platform norms, never invent engagement numbers.
- Store review: social platforms may raise permission-review scrutiny → justify narrowly.

---

*Brainstorm started 2026-11-22 on branch `brainstorm/social-media` (worktree at
`/media/k2/SDisk/B&B/promptSathi-brainstorm`). Main branch stays clean of this until approved.*
