// promptSathi background service worker.
// The only place that talks to the network: forwards improve requests to the
// user's promptSathi Cloudflare Worker, or straight to Groq in BYO-key mode.
// (Service-worker fetches with host_permissions bypass CORS entirely.)

// Crypto utilities for decrypting GROQ key in background (inline for service worker)
async function getEncryptionKey() {
  const encoder = new TextEncoder();
  const extensionId = chrome.runtime.id;
  const salt = encoder.encode("promptSathi-v1-salt-" + extensionId);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(extensionId + "-promptSathi-key-material"),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function decryptGroqKey(ciphertext) {
  if (!ciphertext) return "";
  try {
    const key = await getEncryptionKey();
    const combined = new Uint8Array(atob(ciphertext).split("").map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // If decryption fails, assume it's plaintext (migration from old version)
    return ciphertext;
  }
}

function isEncrypted(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const decoded = atob(value);
    return decoded.length >= 28;
  } catch {
    return false;
  }
}

// NOTE: SYSTEM_PROMPT and buildMessages are duplicated in server/worker.js.
// Keep the two copies in sync.

const MODEL = "qwen/qwen3.8-27b"; // best for Nepali (incl. romanized) + English
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

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
// Terminology injection for BYO mode
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

function validate(data) {
  if (!data || typeof data !== "object") return null;
  let improved = typeof data.improved === "string" ? data.improved.trim() : "";
  if (!improved) return null;
  if (improved.length > 1 && improved.startsWith('"') && improved.endsWith('"')) {
    improved = improved.slice(1, -1).trim() || data.improved.trim();
  }
  let rating = Number.parseInt(data.rating, 10);
  rating = Number.isFinite(rating) ? Math.min(5, Math.max(1, rating)) : null;
  const notes = typeof data.notes === "string" ? data.notes.trim() : "";
  return { ok: true, rating, improved, notes };
}


// OpenRouter storage decryption (same scheme as the popup)
async function decryptFromStorage(ciphertext) {
  if (!ciphertext) return "";
  try {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(chrome.runtime.id + "-promptSathi-key-material"),
      { name: "PBKDF2" }, false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode("promptSathi-v1-salt-" + chrome.runtime.id), iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: combined.slice(0, 12) }, key, combined.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return ciphertext; // plaintext or wrong scheme — pass through
  }
}

async function getSettings() {
  const s = await chrome.storage.sync.get({ mode: "server", serverUrl: "https://promptsathi.yrarjun59.workers.dev", groqKey: "", openrouterKey: "" });
  if (!s.serverUrl) s.serverUrl = "https://promptsathi.yrarjun59.workers.dev"; // migration for older installs
  if (s.groqKey && isEncrypted(s.groqKey)) {
    s.groqKey = await decryptGroqKey(s.groqKey);
  }
  if (s.openrouterKey && isEncrypted(s.openrouterKey)) {
    s.openrouterKey = await decryptFromStorage(s.openrouterKey);
  }
  return s;
}

async function viaWorker(base, payload) {
  const url = base.replace(/\/+$/, "") + "/improve";
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { ok: false, error: "network", message: "Couldn't reach " + url };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || "http_" + res.status, message: data.message || "" };
  }
  return data;
}

// Groq rotates model IDs (llama-3.3-70b-versatile was retired under us).
// Same self-healing approach as server/worker.js: probe fallbacks, then ask
// /models what exists. Cached for the SW lifetime.
let cachedModel = null;
async function callGroqChat(key, model, messages) {
  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { status: 0, text: "", errorText: "" };
  }
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text, errorText: text };
}

async function resolveModel(key) {
  if (cachedModel) return cachedModel;
  const candidates = [MODEL, "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  for (const id of candidates) {
    const probe = await callGroqChat(key, id, [{ role: "user", content: 'Reply with {"ready":true}' }]);
    if (/model_not_found|does not exist|no access|decommissioned/i.test(probe.errorText || "")) {
      continue;
    }
    cachedModel = id;
    return id;
  }
  try {
    const res = await fetch(GROQ_URL.replace(/\/chat\/completions$/, "/models"), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      const ids = (data.data || []).map((m) => m.id);
      const pick =
        ids.find((i) => /70b.*versatile|versatile.*70b/i.test(i)) ||
        ids.find((i) => /70b/.test(i)) ||
        ids.find((i) => /instant|8b/i.test(i)) ||
        ids.find((i) => !/whisper|tts|guard|embed/i.test(i));
      if (pick) {
        cachedModel = pick;
        return pick;
      }
    }
  } catch {}
  return MODEL;
}

async function groqDirect(key, payload) {
  const messages = buildMessages(payload);
  let res = await callGroqChat(key, await resolveModel(key), messages);

  // Model pool rotated between requests — re-resolve once and retry.
  if (!res.ok && /model_not_found|does not exist|no access|decommissioned/i.test(res.errorText || "")) {
    cachedModel = null;
    res = await callGroqChat(key, await resolveModel(key), messages);
  }

  if (res.status === 0) return { ok: false, error: "network", message: "Couldn't reach api.groq.com" };
  if (!res.ok) {
    let message = (res.errorText || "").slice(0, 300);
    try {
      message = JSON.parse(res.errorText)?.error?.message || message;
    } catch {}
    // Classify common Groq errors
    if (res.status === 429 || /rate.?limit|quota|exceeded/i.test(message)) {
      return { ok: false, error: "upstream_error", message: `Groq rate limit/quota exceeded: ${message}` };
    }
    if (res.status === 401 || /invalid|unauthorized/i.test(message)) {
      return { ok: false, error: "upstream_error", message: `Groq authentication failed: ${message}` };
    }
    if (res.status === 403 || /forbidden/i.test(message)) {
      return { ok: false, error: "upstream_error", message: `Groq access forbidden: ${message}` };
    }
    return { ok: false, error: "upstream_error", message };
  }
  let completion = null;
  try {
    completion = JSON.parse(res.text);
  } catch {}
  const data = validate(extractJson(completion?.choices?.[0]?.message?.content));
  if (!data) return { ok: false, error: "upstream_error", message: "Model returned unusable output." };
  return data;
}


// ---- OpenRouter (BYO key) ------------------------------------------------
// Free-model IDs rotate; resolve once per SW lifetime from the preferred list,
// then from the live /models catalogue (":free" suffix only). OpenRouter is
// strict about response_format on some free models, so retry without it.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_PREFERRED = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-26b-a4b-it:free",
  "inclusionai/ling-3.2-flash:free",
];
let cachedOrModel = null;
async function resolveOpenRouterModel(key) {
  if (cachedOrModel) return cachedOrModel;
  for (const id of OPENROUTER_PREFERRED) {
    const probe = await callOpenRouter(key, id, [{ role: "user", content: 'Reply with {"ready":true}' }], true);
    if (probe.status === 0) break; // offline — don't hammer
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
        ids.find((i) => /gemma-4-31b/i.test(i)) ||
        ids.find((i) => /lightning/i.test(i)) ||
        ids.find((i) => /gemma/i.test(i)) ||
        ids.find((i) => !/reasoning|omni|vl|vision/i.test(i));
      if (pick) {
        cachedOrModel = pick;
        return pick;
      }
    }
  } catch {}
  return OPENROUTER_PREFERRED[0];
}

async function callOpenRouter(key, model, messages, useJsonMode) {
  const body = {
    model,
    temperature: 0.3,
    max_tokens: 2048,
    messages,
  };
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
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text, errorText: text };
  } catch (e) {
    return { status: 0, text: "", errorText: String((e && e.message) || e) };
  }
}

async function openRouterDirect(key, payload) {
  const messages = buildMessages(payload);
  let model = await resolveOpenRouterModel(key);
  let res = await callOpenRouter(key, model, messages, true);

  // Model rotated → re-resolve and retry once
  if (!res.ok && res.status !== 0 && /model_not_found|not found|no endpoints|rate/i.test(res.errorText || "")) {
    cachedOrModel = null;
    model = await resolveOpenRouterModel(key);
    res = await callOpenRouter(key, model, messages, true);
  }
  // Some free models reject response_format — retry without JSON mode
  if (!res.ok && res.status !== 0 && /response_format|json/i.test(res.errorText || "")) {
    res = await callOpenRouter(key, model, messages, false);
  }

  if (res.status === 0) return { ok: false, error: "network", message: "Couldn't reach openrouter.ai" };
  if (!res.ok) {
    let message = (res.errorText || "").slice(0, 300);
    try { message = JSON.parse(res.errorText)?.error?.message || message; } catch {}
    if (res.status === 429 || /rate.?limit|quota/i.test(message)) {
      return { ok: false, error: "rate_limited", message: `OpenRouter free limit reached: ${message}` };
    }
    if (res.status === 401) {
      return { ok: false, error: "upstream_error", message: `OpenRouter rejected the key: ${message}` };
    }
    return { ok: false, error: "upstream_error", message };
  }
  let completion = null;
  try { completion = JSON.parse(res.text); } catch {}
  const data = validate(extractJson(completion?.choices?.[0]?.message?.content));
  if (!data) return { ok: false, error: "upstream_error", message: "Model returned unusable output." };
  return data;
}

async function handleImprove(payload) {
  const s = await getSettings();
  if (s.mode === "byo" && s.groqKey) return groqDirect(s.groqKey, payload);
  if (s.mode === "openrouter" && s.openrouterKey) return openRouterDirect(s.openrouterKey, payload);
  if (s.serverUrl) return viaWorker(s.serverUrl, payload);
  return { ok: false, error: "not_configured", message: "Pick a connection mode in the promptSathi popup." };
}

// Popup "Test connection" — checks whichever mode is active.
async function handleTest() {
  const s = await getSettings();
  if (s.mode === "openrouter") {
    if (!s.openrouterKey) return { ok: false, message: "Enter your OpenRouter key first." };
    try {
      const res = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${s.openrouterKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const model = await resolveOpenRouterModel(s.openrouterKey);
        return { ok: true, message: `OpenRouter works ✓ (${model})` };
      }
      return { ok: false, message: "OpenRouter rejected the key (HTTP " + res.status + ")." };
    } catch {
      return { ok: false, message: "Couldn't reach openrouter.ai." };
    }
  }
  if (s.mode === "byo") {
    if (!s.groqKey) return { ok: false, message: "Enter a Groq API key first." };
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${s.groqKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return { ok: true, message: "Groq key works ✓" };
      return { ok: false, message: "Groq rejected the key (HTTP " + res.status + ")." };
    } catch {
      return { ok: false, message: "Couldn't reach api.groq.com." };
    }
  }
  if (!s.serverUrl) return { ok: false, message: "Enter your worker URL first." };
  try {
    const res = await fetch(s.serverUrl.replace(/\/+$/, "") + "/health", { signal: AbortSignal.timeout(10_000) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true, message: "Sathi server is live ✓" };
    return { ok: false, message: "Server responded but not as a promptSathi worker." };
  } catch {
    return { ok: false, message: "Couldn't reach " + s.serverUrl };
  }
}


// ---- Custom sites (user-added platforms) ----------------------------------
// The popup requests the per-origin permission (user gesture required) and
// stores patterns in storage; this worker owns the registration diff:
// register scripts for new patterns, unregister removed ones. Registered
// scripts persist across browser restarts, but we re-sync on startup anyway.
const CUSTOM_JS = ["content/sites.js", "content/content.js"];

function customSiteId(pattern) {
  let h = 7;
  for (let i = 0; i < pattern.length; i++) h = ((h * 31 + pattern.charCodeAt(i)) >>> 0);
  return "custom-" + h.toString(36);
}

async function syncCustomScripts() {
  const { customSites = [] } = await chrome.storage.sync.get({ customSites: [] });
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const want = new Map(customSites.map((p) => [customSiteId(p), p]));
  // unregister removed
  const stale = registered.filter((s) => s.id.startsWith("custom-") && !want.has(s.id)).map((s) => s.id);
  if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });
  // register new
  const have = new Set(registered.map((s) => s.id));
  for (const [sid, pattern] of want) {
    if (have.has(sid)) continue;
    try {
      await chrome.scripting.registerContentScripts([{
        id: sid,
        matches: [pattern],
        js: CUSTOM_JS,
        runAt: "document_idle",
        persistAcrossSessions: true,
      }]);
    } catch (e) {
      console.warn("[promptSathi] register failed for", pattern, e?.message || e);
    }
  }
}

chrome.runtime.onStartup?.addListener(() => syncCustomScripts());
chrome.runtime.onInstalled?.addListener(() => syncCustomScripts());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "syncCustomSites") {
    syncCustomScripts().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, message: String(e?.message || e) }));
    return true;
  }
  if (msg.type === "improve") {
    handleImprove(msg.payload || {}).then(sendResponse);
    return true; // async response
  }
  if (msg.type === "test") {
    handleTest().then(sendResponse);
    return true;
  }
  return false;
});
