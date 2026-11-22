// promptSathi content script.
// Detects the site's prompt composer, intercepts Enter to show a review
// overlay (improve / feedback / send), and adds a voice-input mic button.
// All UI lives in a shadow root so page styles can't touch it.

(() => {
  "use strict";
  if (window.__promptSathiLoaded) return;
  window.__promptSathiLoaded = true;

  // Known sites get tuned selectors; dynamically-registered custom sites run
  // in generic mode (pure heuristic composer/send detection).
  const site = (typeof psGetSiteConfig === "function" && psGetSiteConfig()) || {
    id: "custom",
    matches: [],
    composer: [],
    send: [],
  };

  // ---------- terminology (inlined for MV3 CSP) ----------
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

  function getTerminologyForDomain(domain, maxTerms = 8) {
    if (!domain || !TERMINOLOGY_DOMAINS[domain]) return [];
    const terms = TERMINOLOGY_DOMAINS[domain].terminology;
    const shuffled = [...terms].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, maxTerms);
  }

  function buildTerminologyHint(prompt) {
    const domain = detectDomain(prompt);
    if (!domain) return "";
    const terms = getTerminologyForDomain(domain);
    if (!terms.length) return "";
    return `\n\n[Domain detected: ${domain}. Relevant terminology to consider: ${terms.join(", ")}]`;
  }

  // Synchronous access - no fetch/eval needed
  function loadTerminology() {
    return {
      detectDomain,
      getTerminologyForDomain,
      buildTerminologyHint,
      TERMINOLOGY_DOMAINS
    };
  }

  // ---------- settings ----------

  const DEFAULTS = {
    enabled: true,
    intercept: true,
    micEnabled: false, // voice input parked until core flow is proven on all sites
    lang: "en-US",
    mode: "server", // "server" | "byo"
    serverUrl: "https://promptsathi.yrarjun59.workers.dev", // baked-in free server
    groqKey: "",
  };
  let settings = { ...DEFAULTS };

  function loadSettings() {
    chrome.storage.sync.get(DEFAULTS).then(
      (got) => {
        settings = { ...DEFAULTS, ...got };
        if (!settings.serverUrl) settings.serverUrl = DEFAULTS.serverUrl;
        applySettings();
      },
      () => {}
    );
  }
  loadSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") loadSettings();
  });

  function improveConfigured() {
    return settings.mode === "byo" ? !!settings.groqKey : !!settings.serverUrl;
  }
  function interceptionActive() {
    return settings.enabled && settings.intercept && improveConfigured();
  }

  // ---------- shadow UI ----------

  const host = document.createElement("div");
  host.id = "promptsathi-host";
  host.style.cssText = "all:initial;width:0;height:0;";
  const shadow = host.attachShadow({ mode: "open" });

  const styleEl = document.createElement("style");
  shadow.appendChild(styleEl);
  fetch(chrome.runtime.getURL("content/sathi.css"))
    .then((r) => r.text())
    .then((t) => {
      styleEl.textContent = t;
    })
    .catch(() => {});

  const root = document.createElement("div");
  root.className = "ps-root";
  shadow.appendChild(root);

  function h(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  // -- panel skeleton (built once, filled by renderReview) --
  const panel = h("div", "ps-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "promptSathi prompt review");
  const header = h("div", "ps-header");
  const logo = document.createElement("img");
  logo.className = "ps-logo";
  logo.alt = "";
  logo.src = chrome.runtime.getURL("icons/icon48.png");
  const titleBox = h("div", "ps-title", "promptSathi");
  const ratingBadge = h("div", "ps-rating", "");
  ratingBadge.style.display = "none";
  const closeBtn = h("button", "ps-close", "✕");
  closeBtn.title = "Keep editing (Esc)";
  closeBtn.setAttribute("aria-label", "Close review and keep editing");
  header.append(logo, titleBox, ratingBadge, closeBtn);

  const errorBanner = h("div", "ps-error");

  const loading = h("div", "ps-loading");
  const spinner = h("div", "ps-spinner");
  const loadingText = h("div", null, "Sathi is improving your prompt…");
  loading.append(spinner, loadingText);

  const body = h("div", "ps-body");
  const origBlock = h("div", "ps-block");
  origBlock.append(h("div", "ps-label", "Your prompt"));
  const origText = h("div", "ps-text ps-original");
  origBlock.append(origText);
  const imprBlock = h("div", "ps-block");
  imprBlock.append(h("div", "ps-label", "Improved ✨"));
  const imprText = h("div", "ps-text ps-improved");
  imprBlock.append(imprText);
  const notes = h("div", "ps-notes");
  body.append(origBlock, imprBlock, notes);

  const footer = h("div", "ps-footer");
  const actions = h("div", "ps-actions");
  const sendImprovedBtn = h("button", "ps-btn ps-primary", "Send improved");
  const sendOriginalBtn = h("button", "ps-btn", "No thanks, send as-is");
  sendOriginalBtn.title = "Send your original prompt unchanged";
  const regenBtn = h("button", "ps-btn ps-ghost", "↻");
  regenBtn.title = "Regenerate";
  regenBtn.setAttribute("aria-label", "Regenerate the improved prompt");
  actions.append(sendImprovedBtn, sendOriginalBtn, regenBtn);

  const feedback = h("div", "ps-feedback");
  const chips = h("div", "ps-chips");
  const CHIP_LABELS = ["Shorter", "More detail", "More formal", "Add examples", "Fix language"];
  const chipEls = CHIP_LABELS.map((label) => {
    const c = h("button", "ps-chip", label);
    chips.append(c);
    return c;
  });
  const fbRow = h("div", "ps-fb-row");
  const fbInput = document.createElement("input");
  fbInput.className = "ps-input";
  fbInput.type = "text";
  fbInput.placeholder = "Or tell Sathi what to change…";
  const fbApply = h("button", "ps-btn", "Apply");
  fbRow.append(fbInput, fbApply);
  feedback.append(chips, fbRow);
  footer.append(actions, feedback);

  panel.append(header, errorBanner, loading, body, footer);
  root.appendChild(panel);

  // -- mic + caption + toast --
  const mic = h("button", "ps-mic", "🎤");
  mic.title = "promptSathi voice input";
  mic.setAttribute("aria-label", "promptSathi voice input");
  const caption = h("div", "ps-caption");
  caption.setAttribute("aria-live", "polite");
  const captionText = h("span");
  const captionHint = h("span", "ps-caption-hint", "listening… click 🎤 to stop");
  caption.append(captionText, captionHint);
  const toast = h("div", "ps-toast");
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  root.append(mic, caption, toast);
  if (document.documentElement) document.documentElement.appendChild(host);

  let toastTimer = 0;
  function showToast(msg, ms = 4000) {
    toast.textContent = msg;
    toast.classList.add("ps-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("ps-show"), ms);
  }

  // ---------- composer detection ----------

  let composer = null;

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rects = el.getClientRects();
    if (!rects.length) return false;
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 12;
  }

  function findComposer() {
    for (const sel of site.composer) {
      let best = null;
      for (const el of document.querySelectorAll(sel)) {
        if (!isVisible(el)) continue;
        if (!best || el.getBoundingClientRect().top > best.getBoundingClientRect().top) best = el;
      }
      if (best) return best;
    }
    // Generic fallback — sites rotate their markup, but the composer stays
    // "a visible rich-text/textarea entry box in the lower half of the page".
    // Preference: role=textbox > contenteditable > textarea.
    const candidates = [
      ...document.querySelectorAll('[contenteditable="true"]'),
      ...document.querySelectorAll('textarea'),
      ...document.querySelectorAll('[role="textbox"]'),
    ];
    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      if (el.closest("#promptsathi-host")) continue;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.35) continue; // composers live low on the page
      const area = r.width * r.height;
      const score = area + Math.max(0, 20000 - Math.abs(window.innerHeight - 120 - r.bottom)); // bigger + lower wins
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function currentComposer() {
    if (composer && composer.isConnected && isVisible(composer)) return composer;
    composer = findComposer();
    return composer;
  }

  function onComposerFound() {
    positionMic();
  }

  let moScheduled = false;
  const mo = new MutationObserver(() => {
    if (moScheduled) return;
    moScheduled = true;
    requestAnimationFrame(() => {
      moScheduled = false;
      const found = currentComposer();
      if (found) onComposerFound();
      else mic.classList.remove("ps-show");
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  const foundNow = currentComposer();
  if (foundNow) onComposerFound();

  // ---------- prompt text helpers ----------

  function getPromptText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value;
    return el.innerText.replace(/\u200b/g, "");
  }

  function setPromptText(el, text) {
    if (!el) return false;
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    // contenteditable / ProseMirror: replace the element's contents via an
    // explicit Selection range (execCommand("selectAll") can select the wrong
    // element when focus lands elsewhere during SPA re-renders).
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
    } catch {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return getPromptText(el).trim() === text.trim();
  }

  function placeCaretAtEnd(el) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertAtCursor(el, text) {
    if (!el) return;
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const s = el.selectionStart ?? el.value.length;
      const e = el.selectionEnd ?? s;
      el.value = el.value.slice(0, s) + text + el.value.slice(e);
      el.selectionStart = el.selectionEnd = s + text.length;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const sel = window.getSelection();
    const inside = sel && sel.rangeCount && el.contains(sel.anchorNode);
    if (!inside) placeCaretAtEnd(el);
    document.execCommand("insertText", false, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function findSendButton() {
    for (const sel of site.send) {
      for (const btn of document.querySelectorAll(sel)) {
        if (isVisible(btn) && !btn.disabled && !btn.getAttribute("aria-disabled")) return btn;
      }
    }
    // Generic fallback: any enabled button whose test-id or label mentions
    // sending (sites rename aria-labels constantly — data-testid drifts less)
    const candidates = [
      ...document.querySelectorAll('button[data-testid*="send" i]'),
      ...document.querySelectorAll('button[aria-label*="send" i]'),
      ...document.querySelectorAll("button[aria-label], button[aria-labelledby]"),
    ];
    const seen = new Set();
    for (const btn of candidates) {
      if (seen.has(btn)) continue;
      seen.add(btn);
      const label = ((btn.getAttribute("aria-label") || "") + " " + (btn.getAttribute("data-testid") || "") + " " + (document.getElementById(btn.getAttribute("aria-labelledby") || "")?.textContent || "")).toLowerCase();
      if (/send|envoyer|發送|发送|送信/.test(label) && isVisible(btn) && !btn.disabled && !btn.getAttribute("aria-disabled")) return btn;
    }
    return null;
  }

  // ---------- Enter interception ----------

  let bypass = false;
  let panelOpen = false;

  window.addEventListener(
    "keydown",
    (e) => {
      if (bypass) return;
      if (panelOpen) {
        // panel is modal for Enter: swallow sends from the composer behind it
        if (host.contains(e.target)) return;
        const cEl = currentComposer();
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing && cEl && cEl.contains(e.target)) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (!interceptionActive()) return;
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isComposing || e.keyCode === 229) return;
      const el = currentComposer();
      if (!el || !el.contains(e.target)) return;
      if (host.contains(e.target)) return; // our own UI
      const text = getPromptText(el);
      if (!text.trim()) return;
      // already-sent prompt back in the box (e.g. send failed earlier)?
      // let the site send it natively instead of re-reviewing our own output.
      if (text.trim() === lastSentText) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openReview(text);
    },
    { capture: true }
  );

  // ---------- review flow ----------

  const review = { original: "", improved: "", notes: "", rating: null };

  function callImprove(payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "improve", payload }, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp) return reject(new Error("no response from background"));
          if (!resp.ok) {
            const err = new Error(resp.message || resp.error || "unknown error");
            err.code = resp.error;
            return reject(err);
          }
          resolve(resp);
        });
      } catch (e) {
        // "Extension context invalidated" throws synchronously in a stale
        // content script (extension reloaded while this tab stayed open)
        reject(e);
      }
    });
  }

  function openReview(originalText) {
    review.original = originalText;
    review.improved = "";
    review.notes = "";
    review.rating = null;
    origText.textContent = originalText;
    // reset every field left over from the previous review — an error
    // mid-flight must never leave the last session's improved text on screen
    imprText.textContent = "";
    notes.textContent = "";
    ratingBadge.textContent = "";
    ratingBadge.style.display = "none";
    panelOpen = true;
    panel.classList.add("ps-open");
    renderLoading("Sathi is improving your prompt…");
    positionPanel();
    runImprove();
  }

  async function runImprove(feedbackText) {
    renderLoading(feedbackText ? "Applying your feedback…" : "Sathi is improving your prompt…");
    try {
      // Build terminology hint for the prompt
      let terminologyHint = "";
      const termMod = await loadTerminology();
      if (termMod && termMod.buildTerminologyHint) {
        terminologyHint = termMod.buildTerminologyHint(review.original);
      }
      const payload = feedbackText
        ? { prompt: review.original + terminologyHint, improved: review.improved || review.original, feedback: feedbackText }
        : { prompt: review.original + terminologyHint };
      const resp = await callImprove(payload);
      review.improved = resp.improved;
      review.notes = resp.notes || "";
      review.rating = typeof resp.rating === "number" ? resp.rating : null;
      renderReview();
    } catch (err) {
      renderError(friendlyError(err));
    }
  }

  function isContextDead(err) {
    return /Extension context invalidated|context does not exist/i.test((err && err.message) || "");
  }

  function friendlyError(err) {
    if (isContextDead(err)) {
      return "Sathi was just updated or reloaded — refresh this tab (F5) once and it reconnects. Your text is safe in the box.";
    }
    const code = err && err.code;
    const msg = (err && err.message) || "";
    if (code === "rate_limited") return "Sathi is rate-limited — wait a minute and try again.";
    if (code === "server_not_configured") return "The Sathi server has no Groq key set.";
    if (code === "not_configured") return "No server configured — open the promptSathi popup to add one.";
    if (code === "upstream_error" || code === "upstream_unreachable") {
      if (/quota|limit|exceeded|429|rate.?limit/i.test(msg)) {
        return "Groq quota exceeded — wait for reset or check console.groq.com. Sending as-is.";
      }
      if (/invalid|unauthorized|401|403/i.test(msg)) {
        return "Groq key invalid or unauthorized — check your key in the popup. Sending as-is.";
      }
      return "The AI backend failed — try again or send as-is.";
    }
    if (/failed to fetch|network|ERR_/i.test(msg)) return "Couldn't reach the Sathi server — check the URL in the popup or your connection.";
    return "Sathi couldn't improve this prompt. " + msg;
  }

  function renderLoading(msg) {
    loadingText.textContent = msg;
    panel.classList.add("ps-busy");
    errorBanner.classList.remove("ps-show");
    setButtonsEnabled(false);
    positionPanel();
  }

  function setButtonsEnabled(on) {
    for (const b of [sendImprovedBtn, sendOriginalBtn, regenBtn, fbApply, ...chipEls]) b.disabled = !on;
    if (on) sendImprovedBtn.focus({ preventScroll: true });
  }

  // 5-star prompt-quality display (the rate-us stars live in the popup)
  function renderStarRating(rating) {
    ratingBadge.innerHTML = "";
    ratingBadge.style.whiteSpace = "nowrap";
    ratingBadge.title = `Sathi rates your original prompt ${rating}/5`;
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement("span");
      star.textContent = i <= rating ? "★" : "☆";
      star.style.fontSize = "13px";
      star.style.lineHeight = "1";
      star.style.color = i <= rating ? "var(--ps-gold)" : "var(--ps-dim)";
      star.style.userSelect = "none";
      ratingBadge.appendChild(star);
    }
  }

  function renderReview() {
    panel.classList.remove("ps-busy");
    errorBanner.classList.remove("ps-show");
    renderDiff(review.original, review.improved);
    notes.textContent = "";
    const b = h("b", null, "Sathi: ");
    notes.append(b, review.notes || "here's a stronger version — send it, or tell me what to change.");
    if (review.rating != null) {
      renderStarRating(review.rating);
      ratingBadge.style.display = "";
    } else {
      ratingBadge.style.display = "none";
    }
    setButtonsEnabled(true);
    positionPanel();
  }

  function renderError(msg) {
    panel.classList.remove("ps-busy");
    errorBanner.textContent = msg;
    errorBanner.classList.add("ps-show");
    ratingBadge.style.display = "none";
    notes.textContent = "";
    setButtonsEnabled(true);
    sendImprovedBtn.disabled = true;
    sendOriginalBtn.focus({ preventScroll: true });
    positionPanel();
  }

  // word-level diff: highlight words present in the improved prompt but not
  // matched in the original (LCS over whitespace-separated tokens)
  function lcsMatched(A, B) {
    const n = A.length;
    const m = B.length;
    if (n * m > 300000) return null;
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    const matched = new Set();
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) {
        matched.add(j);
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
      else j++;
    }
    return matched;
  }

  function renderDiff(original, improved) {
    imprText.textContent = "";
    const A = original.split(/(\s+)/);
    const B = improved.split(/(\s+)/);
    const matched = lcsMatched(A, B);
    if (!matched) {
      imprText.textContent = improved;
      return;
    }
    const frag = document.createDocumentFragment();
    for (let j = 0; j < B.length; j++) {
      const t = B[j];
      if (!t) continue;
      if (matched.has(j) || !t.trim()) {
        frag.appendChild(document.createTextNode(t));
      } else {
        const s = h("span", "ps-added", t);
        frag.appendChild(s);
      }
    }
    imprText.appendChild(frag);
    imprText.scrollTop = 0;
  }

  function closePanel() {
    panelOpen = false;
    panel.classList.remove("ps-open", "ps-busy");
    errorBanner.classList.remove("ps-show");
  }

  function keepEditing() {
    closePanel();
    const el = currentComposer();
    if (el) {
      el.focus();
      placeCaretAtEnd(el);
    }
  }

  // Send the chosen text through the site's own composer: write the text,
  // replay a plain Enter (bypassing our own interception), and fall back to
  // the site's send button if the composer still holds the text.
  let lastSentText = "";

  function freshComposer() {
    composer = null; // never trust a cached node across SPA renders
    return currentComposer();
  }

  function copyToClipboard(text) {
    try {
      navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  // Write the chosen text into the composer and VERIFY it stuck. Returns the
  // verified element, or null if the box is unwritable (SPA swapped nodes).
  function writeVerified(chosen) {
    let el = freshComposer();
    if (!el) return null;
    if (getPromptText(el).trim() !== chosen) {
      setPromptText(el, chosen);
      if (getPromptText(el).trim() !== chosen) {
        el = freshComposer();
        if (!el) return null;
        setPromptText(el, chosen);
        if (getPromptText(el).trim() !== chosen) return null;
      }
    }
    return el;
  }

  // Send ladder, each rung re-verifies the box RIGHT BEFORE acting (SPA
  // frameworks can revert DOM writes between our steps — that is how the
  // "sent the previous prompt" bug happened):
  //   1. synthetic Enter
  //   2. the site's own send button
  //   3. hand control to the user (box already holds the chosen text)
  //      clipboard only if the box could never be written.
  function sendChosen(text) {
    closePanel();
    const chosen = text.trim();
    let stage = "enter";
    bypass = true;

    const check = (nextStage) => {
      const el = freshComposer();
      const cur = el ? getPromptText(el).trim() : "";
      if (!el || cur === "") {            // gone from the box => sent
        lastSentText = chosen;
        bypass = false;
        return;
      }
      if (cur === chosen) {               // still sitting there un-sent
        if (nextStage) { stage = nextStage; setTimeout(attempt, 60); return; }
        bypass = false;
        el.focus();
        showToast("Press Enter to send — Sathi filled it in for you.");
        return;
      }
      // box REVERTED to other text (stale-prompt race) — never send that.
      if (nextStage) { stage = nextStage; setTimeout(attempt, 60); return; }
      bypass = false;
      copyToClipboard(text);
      showToast("The box kept reverting — prompt copied. Paste and press Enter.");
    };

    const attempt = () => {
      if (stage === "enter") {
        const el = writeVerified(chosen);
        if (!el) { bypass = false; copyToClipboard(text); showToast("Couldn't update the box — prompt copied. Paste it and press Enter."); return; }
        const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
        el.dispatchEvent(new KeyboardEvent("keydown", opts));
        el.dispatchEvent(new KeyboardEvent("keyup", opts));
        setTimeout(() => check("button"), 400);
      } else if (stage === "button") {
        const el = writeVerified(chosen); // re-verify immediately before acting
        if (!el) { bypass = false; copyToClipboard(text); showToast("Couldn't update the box — prompt copied. Paste it and press Enter."); return; }
        const btn = findSendButton();
        if (btn) {
          btn.click();
          setTimeout(() => check("manual"), 700);
        } else {
          stage = "manual";
          setTimeout(attempt, 60);
        }
      } else { // manual
        const el = writeVerified(chosen);
        bypass = false;
        if (el) {
          el.focus();
          showToast("Press Enter to send — Sathi filled it in for you.");
        } else {
          copyToClipboard(text);
          showToast("Couldn't update the box — prompt copied. Paste it and press Enter.");
        }
      }
    };

    attempt();
  }

  // panel events
  sendImprovedBtn.addEventListener("click", () => review.improved && sendChosen(review.improved));
  sendOriginalBtn.addEventListener("click", () => sendChosen(review.original));
  
  regenBtn.addEventListener("click", () => runImprove());
  closeBtn.addEventListener("click", keepEditing);
  for (let i = 0; i < CHIP_LABELS.length; i++) {
    chipEls[i].addEventListener("click", () => runImprove(CHIP_LABELS[i].toLowerCase()));
  }
  fbApply.addEventListener("click", () => {
    const v = fbInput.value.trim();
    if (v) {
      fbInput.value = "";
      runImprove(v);
    }
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.target === fbInput) {
      const v = fbInput.value.trim();
      if (v) {
        fbInput.value = "";
        runImprove(v);
      }
    } else if (!panel.classList.contains("ps-busy") && review.improved && !sendImprovedBtn.disabled) {
      sendChosen(review.improved);
    }
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && panelOpen) {
        e.preventDefault();
        e.stopPropagation();
        keepEditing();
      }
    },
    { capture: true }
  );

  // ---------- positioning ----------

  function positionPanel() {
    if (!panelOpen) return;
    const el = currentComposer();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    let top = r.top - p.height - 10;
    if (top < 8) top = Math.min(r.bottom + 10, window.innerHeight - p.height - 8);
    if (top < 8) top = 8;
    let left = r.left;
    if (left + p.width > window.innerWidth - 8) left = window.innerWidth - p.width - 8;
    if (left < 8) left = 8;
    panel.style.top = top + "px";
    panel.style.left = left + "px";
  }

  function positionMic() {
    if (!settings.enabled || !settings.micEnabled) {
      mic.classList.remove("ps-show");
      return;
    }
    const el = currentComposer();
    if (!el) {
      mic.classList.remove("ps-show");
      return;
    }
    mic.classList.add("ps-show");
    const r = el.getBoundingClientRect();
    const size = 34;
    const pad = 6;
    let left = r.right + pad;
    if (left + size > window.innerWidth - 4) left = r.right - size - pad;
    let top = r.bottom - size - 10;
    top = Math.max(4, Math.min(top, window.innerHeight - size - 4));
    mic.style.left = left + "px";
    mic.style.top = top + "px";
    positionCaption();
  }

  function positionCaption() {
    if (!caption.classList.contains("ps-show")) return;
    const mr = mic.getBoundingClientRect();
    const cr = caption.getBoundingClientRect();
    let top = mr.top - cr.height - 8;
    if (top < 4) top = mr.bottom + 8;
    let left = Math.min(Math.max(8, mr.left + mr.width / 2 - cr.width / 2), window.innerWidth - cr.width - 8);
    caption.style.top = top + "px";
    caption.style.left = left + "px";
  }

  window.addEventListener("scroll", () => { positionPanel(); positionMic(); }, { passive: true, capture: true });
  window.addEventListener("resize", () => { positionPanel(); positionMic(); }, { passive: true });
  setInterval(() => {
    if (currentComposer()) positionMic();
    else mic.classList.remove("ps-show");
  }, 1500);

  // ---------- voice input ----------

  let rec = null;
  let wantListening = false;

  function setMicUI(listening) {
    mic.classList.toggle("ps-listening", listening);
    mic.textContent = listening ? "⏹" : "🎤";
    mic.title = listening ? "Stop listening" : "promptSathi voice input";
  }

  function setCaption(text) {
    captionText.textContent = text || "";
    if (!text && !wantListening) {
      caption.classList.remove("ps-show");
      return;
    }
    caption.classList.add("ps-show");
    requestAnimationFrame(positionCaption);
  }

  function appendSpoken(text) {
    const el = currentComposer();
    if (!el) return;
    const cur = getPromptText(el);
    let piece = text.trim();
    if (!piece) return;
    if (cur && !/\s$/.test(cur)) piece = " " + piece;
    insertAtCursor(el, piece + " ");
  }

  function startMic() {
    if (!settings.micEnabled) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showToast("Speech recognition isn't available in this browser.");
      return;
    }
    try {
      rec = new SR();
    } catch {
      showToast("Couldn't start speech recognition.");
      return;
    }
    rec.lang = settings.lang || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) appendSpoken(r[0].transcript);
        else interim += r[0].transcript;
      }
      setCaption(interim || "…");
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantListening = false;
        setMicUI(false);
        setCaption("");
        showToast("Microphone blocked — click the 🔒 / 🎙 icon in the address bar and allow the mic.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        showToast("Speech error: " + e.error);
      }
    };
    rec.onend = () => {
      if (wantListening) {
        // Chrome ends the session after silence; restart while the user hasn't stopped
        setTimeout(() => {
          if (!wantListening) return;
          try {
            rec.start();
          } catch {
            wantListening = false;
            setMicUI(false);
            setCaption("");
          }
        }, 250);
      } else {
        setMicUI(false);
        setCaption("");
      }
    };
    wantListening = true;
    try {
      rec.start();
      setMicUI(true);
      setCaption("listening…");
    } catch {
      wantListening = false;
      showToast("Couldn't start the microphone.");
    }
  }

  function stopMic() {
    wantListening = false;
    setCaption("");
    setMicUI(false);
    try {
      rec && rec.stop();
    } catch {}
  }

  mic.addEventListener("click", () => (wantListening ? stopMic() : startMic()));

  // ---------- settings application ----------

  function applySettings() {
    if (!settings.enabled) {
      if (panelOpen) keepEditing();
      stopMic();
    }
    positionMic();
  }
})();
