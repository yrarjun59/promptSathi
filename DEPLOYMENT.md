# promptSathi — Deployment & Testing Guide

## 🎯 Quick Overview

| Approach | Best For | Effort | Cost |
|----------|----------|--------|------|
| **With Account (Recommended)** | Production, auto-updates, reviews, analytics | Medium | Free |
| **Without Account (Local Only)** | Personal use, testing, no store listing | Low | Free |

---

## 📦 Option A: With Chrome Web Store Account (Production)

### Prerequisites
- Google account (can be personal or dedicated developer account)
- One-time **$5 USD** developer registration fee
- Chrome Web Store Developer Dashboard access

### Step 1: Prepare Extension Package
```bash
cd /media/k2/SDisk/B&B/promptSathi/extension

# 1. Update YOUR_EXTENSION_ID in content/content.js (line with storeUrl)
#    Replace "YOUR_EXTENSION_ID" with actual ID after first upload

# 2. Verify manifest.json has correct version
# 3. Zip the extension folder (not the parent folder)
zip -r promptsathi-v0.1.0.zip . -x "*.DS_Store" "icons/src/*" ".git/*"
```

### Step 2: Register as Developer
1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with Google account
3. Pay $5 registration fee (one-time)
4. Accept developer agreement

### Step 3: Upload & Publish
1. Click **"New Item"** → Upload `promptsathi-v0.1.0.zip`
2. Fill in store listing:
   - **Name**: promptSathi — your prompt friend
   - **Short description**: Improves prompts on ChatGPT, Claude, Gemini + 10 more AI sites. Adds terminology, 5-star rating, voice input. Free, no accounts.
   - **Detailed description**: (copy from README.md)
   - **Category**: Productivity → Tools
   - **Language**: English
   - **Icon**: 128x128 (extension/icons/icon128.png)
   - **Screenshots**: Take 3-5 screenshots of overlay on ChatGPT/Claude/Gemini
   - **Privacy policy**: Required — create a simple page (GitHub Pages, Notion, etc.) stating: "No data collected. Prompts sent only to user's configured Groq endpoint on Enter press."
3. **Visibility**: Public (or Unlisted for testing)
4. Click **"Submit for review"**

### Step 4: Get Extension ID & Update
1. After approval (typically <24h), open the listing
2. Copy the **Extension ID** from URL: `https://chromewebstore.google.com/detail/abcdefghijklmnopqrstuvwxyz`
3. Update `extension/content/content.js`:
   ```js
   const storeUrl = "https://chromewebstore.google.com/detail/promptSathi/REAL_EXTENSION_ID";
   ```
4. Re-zip and upload new version

### Step 5: Post-Publish
- Share the store link
- Monitor reviews in Developer Dashboard
- Update version in `manifest.json` for each release

---

## 📦 Option B: Without Account (Local / Unpacked Only)

### For Personal Use
```bash
# 1. Open Chrome
chrome://extensions/

# 2. Enable "Developer mode" (top right toggle)

# 3. Click "Load unpacked" → Select /media/k2/SDisk/B&B/promptSathi/extension/

# 4. Done! Extension loads with a generated local ID
```

### For Sharing (No Store)
```bash
# 1. Package as .crx (requires local key)
cd /media/k2/SDisk/B&B/promptSathi/extension

# Generate key (first time only)
# In chrome://extensions/ → "Pack extension" → select extension folder → creates .pem key

# Pack with key
chrome --pack-extension=/media/k2/SDisk/B&B/promptSathi/extension        --pack-extension-key=/path/to/key.pem

# Creates promptsathi.crx — can drag into chrome://extensions/ on other machines
# ⚠️ Users must enable "Developer mode" to install .crx outside store
```

### Limitations Without Account
- ❌ No auto-updates
- ❌ No Chrome Web Store reviews/ratings
- ❌ No store discovery
- ❌ Must manually reload on each update
- ❌ "No thanks" star click won't redirect to real store (use placeholder URL)
- ✅ Full functionality works locally

---

## 🧪 Testing Checklist (Both Options)

### Pre-Deploy Testing
```bash
# 1. Test server locally
cd /media/k2/SDisk/B&B/promptSathi/server
npx wrangler dev
# → Points to http://127.0.0.1:8787
# In popup: set Server URL to http://127.0.0.1:8787 → Test connection
```

### Functional Tests (Run on Each Site)
| Test | ChatGPT | Claude | Gemini | Grok | DeepSeek | Others |
|------|---------|--------|--------|------|----------|--------|
| Mic button appears | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Enter intercepts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Overlay opens | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Shows improved prompt | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **5-star rating shows** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Stars clickable** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Send improved works | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Send original works | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| No thanks works | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Feedback chips work | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Terminology injected | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Groq error handling | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Voice input (if enabled) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Error Scenario Tests
- [ ] Stop server → Enter sends normally (fail-open)
- [ ] Invalid Groq key → Shows "Groq authentication failed"
- [ ] Rate limit (429) → Shows "Groq rate limit/quota exceeded"
- [ ] Network offline → Shows connection error, sends original
- [ ] Empty prompt → Enter sends normally (no intercept)
- [ ] Shift+Enter → New line (no intercept)

---

## 🔧 Configuration for Testing

### Popup Settings
| Setting | Test Value |
|---------|------------|
| Enable promptSathi | ON |
| Pause on Enter | ON |
| Voice language | en-US (or ne-NP for Nepali test) |
| Mode | **Server** (for local wrangler) or **BYO** |
| Server URL | `http://127.0.0.1:8787` (local) or your worker URL |
| Groq Key | (if BYO) paste from console.groq.com |

### Test Prompts by Domain
```
Software: "make a react component for login"
Business: "write a business plan for a coffee shop"
Data: "analyze this csv and find trends"
Design: "create a landing page hero section"
Marketing: "write seo article about email marketing"
General: "hello world" (should get low rating)
```

---

## 📋 Versioning & Updates

### manifest.json Version Bump
```json
{
  "version": "0.1.1",  // increment for each release
  ...
}
```

### Release Checklist
- [ ] Update version in manifest.json
- [ ] Update CHANGELOG (create if needed)
- [ ] Test all 13 sites
- [ ] Zip extension folder
- [ ] Upload to Chrome Web Store (if published)
- [ ] Or re-load unpacked locally

---

## 🔐 Security Notes for Deployment

1. **GROQ_API_KEY** — Only in Cloudflare Worker secret (`wrangler secret put GROQ_API_KEY`), never in extension code
2. **BYO Key** — Encrypted in `chrome.storage.sync` via AES-GCM (extension ID derived key)
3. **No analytics/tracking** — Extension sends nothing unless user presses Enter
4. **Content Security Policy** — MV3 enforces strict CSP; no inline scripts, no eval (except our controlled terminology/crypto modules)

---

## 📞 Support Links (Update in popup/popup.js)

```js
const LINK_DEFAULTS = {
  bmcUrl: "https://www.buymeacoffee.com/yourusername",
  bmmUrl: "https://your-tip-link.example.com",
  rateUrl: "https://chromewebstore.google.com/detail/promptSathi/YOUR_EXTENSION_ID",
};
```

Or set via console without code changes:
```js
chrome.storage.sync.set({
  bmcUrl: "https://www.buymeacoffee.com/you",
  bmmUrl: "https://tip.example.com",
  rateUrl: "https://chromewebstore.google.com/detail/promptSathi/EXTENSION_ID",
});
```

---

## 🎉 You're Ready!

**For personal use**: Load unpacked → test → done.

**For public release**: Register → upload → wait for review → update Extension ID in code → re-upload → share link.

The star rating widget will redirect users to your actual Chrome Web Store listing once published.
