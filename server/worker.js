// promptSathi server — a tiny stateless Cloudflare Worker that improves prompts
// via Groq. Stores nothing; free-tier friendly. Deploy:
//   npx wrangler login
//   npx wrangler secret put GROQ_API_KEY
//   npx wrangler deploy

// NOTE: SYSTEM_PROMPT and buildMessages are duplicated in
// extension/background/service-worker.js (BYO-key mode). Keep them in sync.

const MODEL = "qwen/qwen3.8-27b"; // best for Nepali (incl. romanized) + English; same free limits as gpt-oss
const FALLBACK_MODELS = [
  "openai/gpt-oss-120b", // strongest English fallback
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
];
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
// Optional second provider: set CEREBRAS_API_KEY secret (free at cloud.cerebras.ai)
// and the worker fails over automatically when Groq hits its daily/rate cap.
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";

// Groq rotates model IDs (llama-3.3-70b-versatile got retired from under us).
// When the configured model 404s, probe fallbacks, then ask /models for a
// live instruct model. Cached per isolate so we don't pay this every request.
const deadModels = new Set(); // IDs this key can't use — excluded from discovery
const aliveModels = new Set();

// Route by language for best quality:
//  - Devanagari Nepali or romanized Nepali -> qwen (strong Indic, script-safe)
//  - everything else (English etc.)        -> gpt-oss-120b (strongest English)
const NEPALI_LATIN_WORDS = new Set([
  "kina", "kasto", "kati", "malai", "hamro", "timro", "yo", "tyo", "testo", "yesto",
  "garnu", "gara", "garchu", "gare", "banaidi", "banauna", "banaune", "chaiyo",
  "parcha", "chha", "cha", "huncha", "bhayo", "bhane", "sanga", "lagi", "ra",
  "ani", "tara", "ho", "hudaina", "garam", "thap", "diyo", "dinu", "payo",
]);
function routeModel(prompt) {
  if (/[ऀ-ॿ]/.test(prompt)) return "qwen/qwen3.8-27b"; // Devanagari
  const words = prompt.toLowerCase().split(/[^a-z]+/);
  let hits = 0;
  for (const w of words) if (NEPALI_LATIN_WORDS.has(w)) hits++;
  return hits >= 2 ? "qwen/qwen3.8-27b" : "openai/gpt-oss-120b";
}

async function resolveModel(key, env, preferred) {
  const want = preferred || (env.MODEL || MODEL);
  if (aliveModels.has(want) && !deadModels.has(want)) return want;
  const chain = [want, env.MODEL || MODEL, ...FALLBACK_MODELS];
  const seen = new Set();
  for (const id of chain) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (deadModels.has(id)) continue;
    if (aliveModels.has(id)) return id;
    const probe = await callGroq(key, id, [{ role: "user", content: 'Reply with {"ready":true}' }], 16);
    if (/model_not_found|does not exist|no access|decommissioned/i.test(probe.errorText || "")) {
      deadModels.add(id);
      continue;
    }
    aliveModels.add(id);
    return id;
  }
  try {
    const res = await fetch(GROQ_MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      // Only models this key lists AND we haven't seen fail.
      const live = (data.data || [])
        .map((m) => m.id)
        .filter((i) => !deadModels.has(i) && !/whisper|tts|guard|embed/i.test(i));
      const pick =
        live.find((i) => /70b/.test(i)) ||
        live.find((i) => /instant|8b/i.test(i)) ||
        live.find((i) => /instruct|gpt-oss|qwen|kimi|gemma/i.test(i)) ||
        live[0];
      if (pick) {
        aliveModels.add(pick);
        return pick;
      }
    }
  } catch {}
  return want;
}

async function callGroq(key, model, messages, maxTokens = 1024) {
  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { status: 0, errorText: String((e && e.message) || e), text: "" };
  }
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, errorText: text, text };
}

function isQuotaError(status, errorText) {
  return (
    status === 429 ||
    status === 0 ||
    /rate.?limit|quota|exceeded|daily/i.test(errorText || "")
  );
}

// Cerebras failover — same OpenAI-compatible shape. Model resolved once per
// isolate from Cerebras's own /models list (IDs rotate there too).
let cachedCerebrasModel = null;
async function callCerebras(key, model, messages, maxTokens = 1024) {
  let res;
  try {
    res = await fetch(CEREBRAS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { status: 0, errorText: String((e && e.message) || e), text: "" };
  }
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, errorText: text, text };
}

async function resolveCerebrasModel(key) {
  if (cachedCerebrasModel) return cachedCerebrasModel;
  try {
    const res = await fetch("https://api.cerebras.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      const ids = (data.data || []).map((m) => m.id);
      const pick =
        ids.find((i) => /qwen-3.*27b|27b.*qwen/i.test(i)) ||
        ids.find((i) => /llama-3\.3-70b|70b/i.test(i)) ||
        ids.find((i) => !/embed|guard|whisper|rerank/i.test(i));
      if (pick) {
        cachedCerebrasModel = pick;
        return pick;
      }
    }
  } catch {}
  return "llama-3.3-70b";
}

// True when we should attempt the Cerebras failover (quota/rate/network).
function shouldFailover(status, errorText) {
  return isQuotaError(status, errorText);
}

// ---- OpenRouter failover (optional OPENROUTER_API_KEY secret) ------------
// Free-model IDs rotate; resolve once per isolate from the live public
// /models catalogue (":free" suffix only). Some free models reject
// response_format, so retry without JSON mode if needed.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_PREFERRED = [
  "nvidia/nemotron-3.5-lightning:free", // speed-first, fits the panel UX
  "google/gemma-4-31b-it:free",
  "inclusionai/ling-3.2-flash:free",
];
let cachedOrModel = null;
async function resolveOpenRouterModel(key) {
  if (cachedOrModel) return cachedOrModel;
  for (const id of OPENROUTER_PREFERRED) {
    const probe = await callOpenRouter(key, id, [{ role: "user", content: 'Reply with {"ready":true}' }], true);
    if (probe.status === 0) break;
    if (!probe.ok && /model_not_found|not found|no endpoints|does not exist|rate/i.test(probe.errorText || "")) continue;
    cachedOrModel = id;
    return id;
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const data = await res.json();
      const ids = (data.data || []).map((m) => m.id).filter((i) => i.endsWith(":free"));
      const pick =
        ids.find((i) => /lightning/i.test(i)) ||
        ids.find((i) => /gemma-4/i.test(i)) ||
        ids.find((i) => !/reasoning|omni|vl|vision|embed|guard|rerank/i.test(i));
      if (pick) {
        cachedOrModel = pick;
        return pick;
      }
    }
  } catch {}
  return OPENROUTER_PREFERRED[0];
}

async function callOpenRouter(key, model, messages, useJsonMode) {
  const body = { model, temperature: 0.3, max_tokens: 2048, messages };
  if (useJsonMode) body.response_format = { type: "json_object" };
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "promptSathi",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, errorText: text, text };
  } catch (e) {
    return { status: 0, errorText: String((e && e.message) || e), text: "" };
  }
}

// Returns {rating, improved, notes} or null if OpenRouter also failed.
async function tryOpenRouter(key, messages, prompt) {
  const model = await resolveOpenRouterModel(key);
  let res = await callOpenRouter(key, model, messages, true);
  if (!res.ok && res.status !== 0 && /model_not_found|not found|no endpoints/i.test(res.errorText || "")) {
    cachedOrModel = null;
    res = await callOpenRouter(key, await resolveOpenRouterModel(key), messages, true);
  }
  if (!res.ok && res.status !== 0 && /response_format|json/i.test(res.errorText || "")) {
    res = await callOpenRouter(key, model, messages, false);
  }
  if (!res.ok) return null;
  try {
    const payload = JSON.parse(res.text);
    const data = validate(extractJson(payload.choices?.[0]?.message?.content), prompt);
    return data || null;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are promptSathi ("Sathi" means friend in Nepali), a prompt-improvement assistant embedded in the user's chat box.

Your ONE job: rewrite rough prompts into clear, effective prompts. You never answer the prompt, never execute it, and never add facts the user did not state or clearly imply.

Rules:
- Language AND script: "improved" must match the user's language AND script. English stays English. Devanagari Nepali stays Devanagari Nepali.
- ROMANIZED NEPALI is promptSathi's signature case: Nepali typed in Latin letters ("kasto chha", "malai yo banaidi", "kina", "garnu", "paisa", "banauna"). If the user writes romanized Nepali, the improved prompt MUST ALSO be romanized Nepali. Never convert it to Devanagari. Never translate it into English. Fix the spelling/grammar of the romanization, make the request specific and well-structured, and keep natural romanized phrasing (mixed English tech words like "website", "app", "UI" stay as they are).
- Mixed languages stay naturally mixed; write "notes" in the same language and script as the user's prompt.
- Quality bar (never compromise): a great improved prompt makes the target AI capable of a great FIRST answer. Include, when the request implies them: the concrete deliverable, audience/purpose, key requirements, and constraints (length/tone/format).
- Structure for complex requests: short labelled lines or bullets — Task / Context / Requirements / Constraints / Output format. For short casual requests, one or two tight sentences beat a template. Never pad.
- Requirement preservation: carry over EVERY explicit requirement the user stated (features, limits, names, numbers, constraints). None may be lost, softened, or reordered away.
- Ambiguity elimination: resolve pronouns and vague references into explicit statements ("it" -> the actual thing). Where the user left a decision genuinely open, pick the most reasonable default and mark it with a bracketed placeholder like [pick a color].
- Role engineering: when expertise clearly helps answer quality, open the improved prompt with one short role line ("Act as an experienced X"). Never use roles as filler.
- Anti-padding: cut filler, repetition and buzzwords; every line must add information. A tight 3-line prompt beats a padded 15-line one.
- Clarification-first notes: if one critical detail is missing from the user's request, "notes" names that single most valuable thing to clarify (max 15 words). Otherwise "notes" names the key change.
- Concrete beats vague: replace generic words ("good", "nice", "modern") with specifics the user's intent implies; if a needed detail is genuinely unknown, use a bracketed placeholder like [your shop hours] instead of inventing facts.
- Self-check before returning: (1) serves the user's actual goal? (2) script matches the user's? (3) nothing invented? (4) zero meta-commentary? Fix silently if any fails.
- Preserve intent, tone and audience. Do not invent constraints, names, numbers, tools, or goals.
- Fix ambiguity, organise with short sections or bullets only when it genuinely helps, and state the desired output format when one is implied.
- Keep length proportionate: usually 2-4x the original, never padded. If the original is already excellent, improve it lightly and say so in "notes".
- "improved" must be ready to paste and send as-is: no preamble (e.g. "Here is your improved prompt"), no surrounding quotes, no commentary.
- "rating" is an honest 1-5 score of the quality of the ORIGINAL prompt (1=poor, 5=excellent).
- "notes" is ONE short sentence (max 15 words) naming the main weakness or the key change.
- When the request contains feedback, apply it to the current improved version; then "rating" scores the revised result and "notes" summarises what the feedback changed.

Return ONLY a JSON object: {"rating": <integer 1-5>, "improved": "<string>", "notes": "<string>"}`;

// Terminology injection for server
const TERMINOLOGY_DOMAINS = {
  software: {
    keywords: ["code", "program", "function", "class", "api", "database", "sql", "nosql", "frontend", "backend", "fullstack", "react", "vue", "angular", "svelte", "node", "python", "javascript", "typescript", "go", "rust", "java", "docker", "kubernetes", "k8s", "ci/cd", "pipeline", "deploy", "devops", "git", "github", "gitlab", "rest", "graphql", "grpc", "websocket", "auth", "oauth", "jwt", "token", "middleware", "microservice", "serverless", "lambda", "cloud", "aws", "gcp", "azure", "vercel"],
    terminology: ["async/await", "promise", "observable", "stream", "event loop", "dependency injection", "repository pattern", "cqrs", "event sourcing", "circuit breaker", "idempotency", "service mesh", "api gateway", "feature flag", "canary", "blue-green", "gitops", "observability pillars", "sli", "slo", "sla", "chaos engineering"]
  },
  business: {
    keywords: ["business", "startup", "company", "enterprise", "strategy", "roadmap", "kpi", "okr", "revenue", "profit", "growth", "market", "customer", "client", "product", "feature", "mvp", "sales", "marketing", "funnel", "conversion", "retention", "churn", "ltv", "cac", "arr", "mrr", "funding", "investor", "vc", "valuation", "equity", "ipo", "acquisition", "pricing", "packaging", "subscription", "operations", "team", "hiring", "culture", "budget", "forecast", "stakeholder", "governance", "compliance", "risk"],
    terminology: ["product-market fit", "tam", "sam", "som", "go-to-market", "sales funnel", "mql", "sql", "pql", "cohort analysis", "lifetime value", "unit economics", "burn rate", "runway", "north star metric", "jobs to be done", "value proposition", "competitive analysis", "business model canvas", "network effects", "pricing strategy", "land and expand", "customer success", "health score", "nps", "partner ecosystem", "soc2", "iso27001"]
  },
  data: {
    keywords: ["data", "analytics", "analysis", "dataset", "pipeline", "warehouse", "lake", "lakehouse", "snowflake", "bigquery", "spark", "kafka", "airflow", "dbt", "visualization", "dashboard", "tableau", "powerbi", "machine learning", "ml", "ai", "model", "training", "inference", "feature", "label", "prediction", "classification", "regression", "nlp", "deep learning", "llm", "rag", "embedding", "vector", "evaluation", "accuracy", "precision", "recall", "f1", "mlops"],
    terminology: ["data mesh", "data fabric", "data contract", "data governance", "data quality", "data lineage", "change data capture", "stream processing", "feature engineering", "shap", "model serving", "a/b testing", "causal inference", "anomaly detection", "time series", "forecasting", "recommendation system", "learning to rank", "data versioning", "reproducibility"]
  },
  design: {
    keywords: ["design", "ui", "ux", "figma", "wireframe", "mockup", "prototype", "design system", "component", "token", "color", "typography", "spacing", "layout", "responsive", "accessibility", "a11y", "html", "css", "tailwind", "styled-components", "user research", "usability", "interaction", "animation", "motion", "design thinking", "handoff", "storybook"],
    terminology: ["atomic design", "design tokens", "semantic tokens", "fluid typography", "container queries", "cascade layers", "accessibility tree", "focus management", "motion reduction", "inclusive design", "design ops", "design tokens pipeline"]
  },
  marketing: {
    keywords: ["marketing", "campaign", "brand", "content", "seo", "sem", "social media", "email", "newsletter", "copywriting", "funnel", "growth", "acquisition", "organic", "paid", "influencer", "analytics", "ga4", "mixpanel", "attribution", "utm", "conversion", "landing page"],
    terminology: ["brand positioning", "messaging framework", "content pillars", "seo strategy", "keyword research", "topic cluster", "technical seo", "core web vitals", "paid media", "ppc", "roas", "bid strategy", "attribution model", "marketing mix modeling", "email marketing", "segmentation", "personalization", "growth loops", "north star metric", "okr", "kpi"]
  }
};

function detectDomain(prompt) {
  const lower = prompt.toLowerCase();
  let bestDomain = null;
  let bestScore = 0;
  for (const [domain, config] of Object.entries(TERMINOLOGY_DOMAINS)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (lower.includes(keyword.toLowerCase())) score += keyword.length;
    }
    if (score > bestScore) { bestScore = score; bestDomain = domain; }
  }
  return bestDomain;
}

function getTerminologyHint(prompt) {
  const domain = detectDomain(prompt);
  if (!domain) return "";
  const terms = TERMINOLOGY_DOMAINS[domain].terminology;
  const shuffled = [...terms].sort(() => Math.random() - 0.5).slice(0, 8);
  if (!shuffled.length) return "";
  return `\n\n[Domain detected: ${domain}. Relevant terminology to consider: ${shuffled.join(", ")}]`;
}


function buildMessages({ prompt, improved, feedback }) {
  const terminologyHint = getTerminologyHint(prompt);
  const promptWithTerms = prompt + terminologyHint;
  
  if (feedback) {
    return [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Original prompt:\n<prompt>\n${promptWithTerms}\n</prompt>\n\n` +
          `Current improved version:\n<improved>\n${improved || prompt}\n</improved>\n\n` +
          `Feedback to apply: ${feedback}\n\nReturn the revised improved version.`,
      },
    ];
  }
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Improve this prompt:\n<prompt>\n${promptWithTerms}\n</prompt>` },
  ];
}

// ---- helpers -------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

// Soft per-isolate rate limit (best effort — workers isolates are ephemeral).
const WINDOW_MS = 60_000;
const LIMIT = 30;
const hits = new Map(); // ip -> array of timestamps
function rateAllow(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= LIMIT) {
    hits.set(ip, arr);
    return false;
  }
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

// Parse the model's reply; tolerate markdown fences or stray text around JSON.
function extractJson(content) {
  if (!content) return null;
  let text = content.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function validate(data, fallbackPrompt) {
  if (!data || typeof data !== "object") return null;
  let improved = typeof data.improved === "string" ? data.improved.trim() : "";
  if (!improved) return null;
  // If the model wrapped the whole prompt in quotes, strip them.
  if (
    improved.length > 1 &&
    ((improved.startsWith('"') && improved.endsWith('"')) ||
      (improved.startsWith("```") && improved.endsWith("```")))
  ) {
    improved = improved.replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").replace(/^"|"$/g, "").trim();
    if (!improved) improved = data.improved.trim();
  }
  let rating = Number.parseInt(data.rating, 10);
  if (!Number.isFinite(rating)) rating = null;
  else rating = Math.min(5, Math.max(1, rating));
  const notes = typeof data.notes === "string" ? data.notes.trim() : "";
  void fallbackPrompt;
  return { ok: true, rating, improved, notes };
}

// ---- worker --------------------------------------------------------------

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "promptSathi", version: "0.1.0" });
    }
    if (url.pathname === "/debug/models" && request.method === "GET") {
      if (!env.GROQ_API_KEY) return json({ ok: false, error: "server_not_configured" }, 500);
      try {
        const res = await fetch(GROQ_MODELS_URL, {
          headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
          signal: AbortSignal.timeout(10_000),
        });
        const data = await res.json();
        return json({ ok: res.ok, status: res.status, models: (data.data || []).map((m) => m.id) });
      } catch (e) {
        return json({ ok: false, error: "upstream_unreachable", message: String((e && e.message) || e) }, 502);
      }
    }
    if (url.pathname !== "/improve") {
      return json({ ok: false, error: "not_found" }, 404);
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!rateAllow(ip)) {
      return json({ ok: false, error: "rate_limited", message: "Too many requests — wait a minute and try again." }, 429);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "bad_request", message: "Body must be JSON." }, 400);
    }
    const prompt = str(body.prompt);
    const improved = str(body.improved);
    const feedback = str(body.feedback);
    if (!prompt && !improved) {
      return json({ ok: false, error: "bad_request", message: "\"prompt\" is required." }, 400);
    }
    if (!env.GROQ_API_KEY) {
      return json({ ok: false, error: "server_not_configured", message: "GROQ_API_KEY secret is not set on this worker." }, 500);
    }

    const model = await resolveModel(env.GROQ_API_KEY, env, routeModel(prompt));
    const messages = buildMessages({ prompt, improved, feedback });
    let upstream = await callGroq(env.GROQ_API_KEY, model, messages);

    // The model pool rotated between requests — mark it dead, re-resolve, retry once.
    if (!upstream.ok && /model_not_found|does not exist|no access|decommissioned/i.test(upstream.errorText || "")) {
      deadModels.add(model);
      aliveModels.delete(model);
      upstream = await callGroq(env.GROQ_API_KEY, await resolveModel(env.GROQ_API_KEY, env, routeModel(prompt)), messages);
    }

    // Groq quota/rate cap? Fail over to Cerebras / OpenRouter if configured.
    if (!upstream.ok && shouldFailover(upstream.status, upstream.errorText) && env.CEREBRAS_API_KEY) {
      const cModel = await resolveCerebrasModel(env.CEREBRAS_API_KEY);
      const cRes = await callCerebras(env.CEREBRAS_API_KEY, cModel, messages);
      if (cRes.ok) {
        try {
          const cPayload = JSON.parse(cRes.text);
          const cData = validate(extractJson(cPayload.choices?.[0]?.message?.content), prompt);
          if (cData) return json({ ...cData, provider: "cerebras" });
        } catch {}
      }
      // Cerebras also failed -> fall through to the Groq error reporting below
    }
    if (!upstream.ok && shouldFailover(upstream.status, upstream.errorText) && env.OPENROUTER_API_KEY) {
      const oData = await tryOpenRouter(env.OPENROUTER_API_KEY, messages, prompt);
      if (oData) return json({ ...oData, provider: "openrouter" });
      // OpenRouter also failed -> fall through to the Groq error reporting below
    }

    if (!upstream.ok) {
      let message = (upstream.errorText || "").slice(0, 300) || `HTTP ${upstream.status}`;
      try {
        message = JSON.parse(upstream.errorText)?.error?.message || message;
      } catch {}
      // Classify common Groq errors for better user messaging
      if (upstream.status === 429 || /rate.?limit|quota|exceeded/i.test(message)) {
        message = `Groq rate limit/quota exceeded: ${message}`;
      } else if (upstream.status === 401 || /invalid|unauthorized/i.test(message)) {
        message = `Groq authentication failed: ${message}`;
      } else if (upstream.status === 403 || /forbidden/i.test(message)) {
        message = `Groq access forbidden: ${message}`;
      }
      return json({ ok: false, error: upstream.status === 0 ? "upstream_unreachable" : "upstream_error", message }, 502);
    }

    let payload;
    try {
      payload = JSON.parse(upstream.text);
    } catch {
      return json({ ok: false, error: "upstream_error", message: "Non-JSON response from model." }, 502);
    }

    const data = validate(extractJson(payload.choices?.[0]?.message?.content), prompt);
    if (!data) {
      return json({ ok: false, error: "upstream_error", message: "Model returned unusable output." }, 502);
    }
    return json({ ...data, model });
  },
};
