// promptSathi popup — settings UI. Everything is saved to chrome.storage.sync.

// ⬇⬇ EDIT YOUR LINKS — shown in the popup footer.
// You can also override them without touching code, e.g. in the Service
// Worker console: chrome.storage.sync.set({ bmcUrl: "https://www.buymeacoffee.com/yourpage" })
// Crypto utilities inlined for MV3 CSP compliance
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

async function encryptForStorage(plaintext) {
  if (!plaintext) return "";
  try {
    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch (e) {
    console.warn("[promptSathi] Encryption failed, storing plaintext:", e);
    return plaintext;
  }
}

async function decryptFromStorage(ciphertext) {
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
    console.warn("[promptSathi] Decryption failed, assuming plaintext:", e);
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

async function encryptGroqKey(key) {
  return encryptForStorage(key);
}

async function decryptGroqKey(key) {
  return decryptFromStorage(key);
}

async function isEncryptedValue(value) {
  return isEncrypted(value);
}

const LINK_DEFAULTS = {
  bmcUrl: "https://www.buymeacoffee.com/", // your Buy Me a Coffee page
  bmmUrl: "https://www.buymeacoffee.com/", // your "Buy me a momo" tip link (any URL works)
  rateUrl: "https://chromewebstore.google.com/", // your Chrome Web Store listing
};

const DEFAULTS = {
  enabled: true,
  intercept: true,
  lang: "en-US",
  mode: "server",
  serverUrl: "https://promptsathi.yrarjun59.workers.dev", // baked-in free server — users need zero setup
  groqKey: "",
  openrouterKey: "",
};

const $ = (id) => document.getElementById(id);
const els = {
  enabled: $("enabled"),
  intercept: $("intercept"),
  lang: $("lang"),
  modeServer: document.querySelector('input[name="mode"][value="server"]'),
  modeByo: document.querySelector('input[name="mode"][value="byo"]'),
  modeOr: document.querySelector('input[name="mode"][value="openrouter"]'),
  serverUrl: $("serverUrl"),
  groqKey: $("groqKey"),
  openrouterKey: $("openrouterKey"),
  serverBox: $("serverBox"),
  byoBox: $("byoBox"),
  orBox: $("orBox"),
  test: $("test"),
  testResult: $("testResult"),
  connDot: $("connDot"),
  connLabel: $("connLabel"),
};

// Quiet status line on the folded Connection row: green = backend answers.
async function refreshConnStatus() {
  els.connDot.className = "dot";
  els.connLabel.textContent = "Checking connection…";
  try {
    const resp = await chrome.runtime.sendMessage({ type: "test" });
    const ok = resp && resp.ok;
    els.connDot.className = "dot " + (ok ? "ok" : "bad");
    els.connLabel.textContent = ok
      ? (els.modeByo.checked ? "Connected · Groq key" : els.modeOr.checked ? "Connected · OpenRouter" : "Connected · Sathi server")
      : "Not connected — open to fix";
  } catch {
    els.connDot.className = "dot bad";
    els.connLabel.textContent = "Not connected — open to fix";
  }
}

function currentSettings() {
  const mode = els.modeServer.checked ? "server" : els.modeOr.checked ? "openrouter" : "byo";
  return {
    enabled: els.enabled.checked,
    intercept: els.intercept.checked,
    lang: els.lang.value,
    mode,
    serverUrl: els.serverUrl.value.trim(),
    groqKey: els.groqKey.value.trim(),
    openrouterKey: els.openrouterKey.value.trim(),
  };
}

async function save() {
  const settings = currentSettings();
  // always write both key fields so clearing one actually clears it in storage
  settings.groqKey = settings.groqKey ? await encryptForStorage(settings.groqKey) : "";
  settings.openrouterKey = settings.openrouterKey ? await encryptForStorage(settings.openrouterKey) : "";
  chrome.storage.sync.set(settings);
}

function syncModeBoxes() {
  els.serverBox.hidden = !els.modeServer.checked;
  els.byoBox.hidden = !els.modeByo.checked;
  els.orBox.hidden = !els.modeOr.checked;
  els.testResult.textContent = "";
}


// ---- Custom AI sites (user-added platforms) -------------------------------
function normalizeHost(raw) {
  let v = (raw || "").trim().toLowerCase();
  v = v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\/+$/, "");
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(v)) return null;
  return v;
}

async function renderSites() {
  const { customSites = [] } = await chrome.storage.sync.get({ customSites: [] });
  const list = document.getElementById("siteList");
  list.textContent = "";
  if (!customSites.length) {
    const li = document.createElement("li");
    li.className = "site-empty";
    li.textContent = "No extra sites yet.";
    list.append(li);
    return;
  }
  for (const pattern of customSites) {
    const li = document.createElement("li");
    const host = document.createElement("span");
    host.className = "site-host";
    host.textContent = pattern.replace(/^https:\/\//, "").replace(/\/\*$/, "");
    const rm = document.createElement("button");
    rm.className = "rm";
    rm.textContent = "✕";
    rm.title = "Remove site";
    rm.addEventListener("click", async () => {
      const { customSites = [] } = await chrome.storage.sync.get({ customSites: [] });
      const next = customSites.filter((p) => p !== pattern);
      await chrome.storage.sync.set({ customSites: next });
      try { await chrome.permissions.remove({ origins: [pattern] }); } catch {}
      chrome.runtime.sendMessage({ type: "syncCustomSites" });
      renderSites();
    });
    li.append(host, rm);
    list.append(li);
  }
}

async function addCustomSite() {
  const input = document.getElementById("siteInput");
  const result = document.getElementById("siteMsg");
  const host = normalizeHost(input.value);
  if (!host) {
    result.textContent = "Enter a domain like chat.mistral.ai";
    return;
  }
  const pattern = "https://" + host + "/*";
  const { customSites = [] } = await chrome.storage.sync.get({ customSites: [] });
  if (customSites.includes(pattern)) {
    result.textContent = host + " is already added.";
    return;
  }
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [pattern] });
  } catch {
    granted = false;
  }
  if (!granted) {
    result.textContent = "Permission not granted — site not added.";
    return;
  }
  await chrome.storage.sync.set({ customSites: [...customSites, pattern] });
  chrome.runtime.sendMessage({ type: "syncCustomSites" });
  input.value = "";
  result.textContent = host + " added ✓";
  renderSites();
}

chrome.storage.sync.get(LINK_DEFAULTS).then((links) => {
  // Buy-me pills stay hidden until REAL urls replace the placeholders —
  // until then the footer shows "wait until I update".
  const PLACEHOLDERS = new Set([
    LINK_DEFAULTS.bmcUrl, LINK_DEFAULTS.bmmUrl,
    "https://www.buymeacoffee.com/",
  ]);
  const realCoffee = links.bmcUrl && !PLACEHOLDERS.has(links.bmcUrl);
  const realMomo = links.bmmUrl && !PLACEHOLDERS.has(links.bmmUrl);
  const state = document.getElementById("supportState");
  const bmc = document.getElementById("bmcLink");
  const bmm = document.getElementById("bmmLink");
  state.hidden = realCoffee || realMomo;
  bmc.hidden = !realCoffee;
  bmm.hidden = !realMomo;
  if (realCoffee) bmc.href = links.bmcUrl;
  if (realMomo) bmm.href = links.bmmUrl;

  // 5-star rate-us widget: click a star → stars fill up to it → open the store
  const stars = [...document.querySelectorAll("#rateStars .rstar")];
  const done = document.getElementById("rateDone");
  const rateUrl = links.rateUrl || LINK_DEFAULTS.rateUrl;
  const fillTo = (n) => {
    for (const s of stars) {
      const on = Number(s.dataset.star) <= n;
      s.classList.toggle("fill", on);
      s.textContent = on ? "★" : "☆";
    }
  };
  stars.forEach((s) =>
    s.addEventListener("mouseenter", () => fillTo(Number(s.dataset.star)))
  );
  document.getElementById("rateStars").addEventListener("mouseleave", () => {
    const saved = Number(document.getElementById("rateStars").dataset.saved || 0);
    fillTo(saved);
  });
  stars.forEach((s) =>
    s.addEventListener("click", () => {
      const n = Number(s.dataset.star);
      document.getElementById("rateStars").dataset.saved = String(n);
      fillTo(n);
      chrome.storage.sync.set({ userRating: n });
      // choice, not force: the user opens the store now or does it later
      done.hidden = false;
      done.classList.remove("fade");
    })
  );
  document.getElementById("rateOpen").addEventListener("click", () => {
    chrome.tabs.create({ url: rateUrl });
    done.classList.add("fade");
    setTimeout(() => { done.hidden = true; done.classList.remove("fade"); }, 600);
  });
  document.getElementById("rateLater").addEventListener("click", () => {
    done.classList.add("fade");
    setTimeout(() => { done.hidden = true; done.classList.remove("fade"); }, 600);
  });
});

chrome.storage.sync.get(DEFAULTS).then(async (s) => {
  els.enabled.checked = s.enabled;
  els.intercept.checked = s.intercept;
  if (![...els.lang.options].some((o) => o.value === s.lang)) {
    const opt = document.createElement("option");
    opt.value = s.lang;
    opt.textContent = s.lang;
    els.lang.append(opt);
  }
  els.lang.value = s.lang;
  (s.mode === "byo" ? els.modeByo : els.modeServer).checked = true;
  els.serverUrl.value = s.serverUrl;
  // Decrypt groqKey if it's encrypted
  let groqKey = s.groqKey || "";
  if (await isEncryptedValue(groqKey)) {
    groqKey = await decryptGroqKey(groqKey);
  }
  els.groqKey.value = groqKey;
  let orKey = s.openrouterKey || "";
  if (await isEncryptedValue(orKey)) orKey = await decryptFromStorage(orKey);
  els.openrouterKey.value = orKey;
  (s.mode === "byo" ? els.modeByo : s.mode === "openrouter" ? els.modeOr : els.modeServer).checked = true;
  syncModeBoxes();
  refreshConnStatus();
});

for (const el of [els.enabled, els.intercept, els.lang, els.modeServer, els.modeByo, els.modeOr]) {
  el.addEventListener("change", () => {
    syncModeBoxes();
    save();
    refreshConnStatus(); // label must follow the active mode immediately
  });
}
for (const el of [els.serverUrl, els.groqKey, els.openrouterKey]) {
  let t = 0;
  el.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(save, 400);
  });
}

document.getElementById("siteAdd").addEventListener("click", addCustomSite);
document.getElementById("siteInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addCustomSite();
});
renderSites();

els.test.addEventListener("click", async () => {
  await save(); // save encrypts the key
  els.test.disabled = true;
  els.testResult.className = "";
  els.testResult.textContent = "testing…";
  try {
    const resp = await chrome.runtime.sendMessage({ type: "test" });
    els.testResult.className = resp && resp.ok ? "ok" : "bad";
    els.testResult.textContent = (resp && resp.message) || "no response";
  } catch (e) {
    els.testResult.className = "bad";
    els.testResult.textContent = String(e && e.message ? e.message : e);
  } finally {
    els.test.disabled = false;
    refreshConnStatus();
  }
});
