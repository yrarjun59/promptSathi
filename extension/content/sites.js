// promptSathi — per-site integration map.
// Sites rewrite their DOM often; when an integration stops working, the
// selectors below are the first thing to update (verify in DevTools).
// Composer order = preference; the bottom-most *visible* match wins.

var promptSathiSites = [
  {
    id: "zai",
    matches: ["chat.z.ai", "z.ai"],
    composer: ["#chat-input", "textarea[placeholder*='Message' i]"],
    send: ["button[aria-label='Send' i]", "button[type='submit']"],
  },
  {
    id: "grok",
    matches: ["grok.com"],
    composer: ["div.tiptap.ProseMirror", "div.ProseMirror[contenteditable='true']", "#composer"],
    send: ["button[aria-label='Submit' i]", "button[aria-label='Send' i]", "button[type='submit']"],
  },
  {
    id: "chatgpt",
    matches: ["chatgpt.com", "chat.openai.com"],
    // ChatGPT selectors (updated 2024/2025) - try multiple
    composer: [
      "textarea[data-id='root']",
      "textarea#prompt-textarea",
      "div[contenteditable='true'][data-testid='chat-input']",
      "textarea[placeholder*='Message']",
      "textarea[placeholder*='Chat']",
    ],
    send: [
      "button[data-testid='send-button']",
      "button[aria-label='Send prompt']",
      "button[data-testid='fruit-btn-send']",
    ],
  },
  {
    id: "claude",
    matches: ["claude.ai"],
    composer: [
      "div[contenteditable='true'].ProseMirror",
      "div.ProseMirror[contenteditable='true']",
      "div[contenteditable='true'][data-testid='composer']",
    ],
    send: [
      "button[aria-label='Send message']",
      "button[aria-label='Send']",
      "button[data-testid='send-button']",
    ],
  },
  {
    id: "gemini",
    matches: ["gemini.google.com", "bard.google.com"],
    composer: [
      "rich-textarea .ql-editor",
      "rich-textarea .text-input-field",
      ".ql-editor[contenteditable='true']",
      "div[contenteditable='true'][data-testid='user-input']",
    ],
    send: [
      "button.send-button",
      "button[aria-label='Send message']",
      "button[data-testid='send-button']",
    ],
  },
  {
    id: "grok",
    matches: ["grok.x.ai", "x.ai"],
    composer: [
      "textarea[placeholder*='Ask']",
      "textarea[placeholder*='Message']",
      "div[contenteditable='true'][data-testid='composer']",
    ],
    send: [
      "button[data-testid='send-button']",
      "button[aria-label='Send']",
      "button[type='submit']",
    ],
  },
  {
    id: "zai",
    matches: ["z.ai", "chat.z.ai"],
    composer: [
      "textarea[placeholder*='Message']",
      "textarea[placeholder*='Ask']",
      "div[contenteditable='true'].composer",
      "#chat-input",
    ],
    send: [
      "button[aria-label='Send message']",
      "button.send-button",
      "button[type='submit']",
    ],
  },
  {
    id: "deepseek",
    matches: ["chat.deepseek.com", "deepseek.com"],
    composer: [
      "textarea#chat-input",
      "textarea[placeholder*='Message']",
      "div[contenteditable='true'].chat-input",
    ],
    send: [
      "button[aria-label='Send message']",
      "button.send-btn",
      "button[type='submit']",
    ],
  },
  {
    id: "perplexity",
    matches: ["perplexity.ai"],
    composer: [
      "textarea[placeholder*='Ask']",
      "textarea[placeholder*='Search']",
      "div[contenteditable='true'][data-testid='composer']",
    ],
    send: [
      "button[aria-label='Send']",
      "button[data-testid='send-button']",
      "button[type='submit']",
    ],
  },
  {
    id: "copilot",
    matches: ["copilot.microsoft.com"],
    composer: [
      "textarea[placeholder*='Message']",
      "textarea[placeholder*='Ask']",
      "div[contenteditable='true'].composer",
    ],
    send: [
      "button[aria-label='Send message']",
      "button.send-button",
      "button[type='submit']",
    ],
  },
  {
    id: "poe",
    matches: ["poe.com"],
    composer: [
      "textarea[placeholder*='Message']",
      "div[contenteditable='true'].chat-input",
    ],
    send: [
      "button[aria-label='Send message']",
      "button.send-btn",
    ],
  },
  {
    id: "huggingface",
    matches: ["huggingface.co/chat", "hf.co/chat"],
    composer: [
      "textarea[data-testid='chat-input']",
      "textarea[placeholder*='Message']",
    ],
    send: [
      "button[data-testid='send-button']",
      "button[aria-label='Send']",
    ],
  },
  {
    id: "youdotcom",
    matches: ["you.com"],
    composer: [
      "textarea[placeholder*='Ask']",
      "textarea[placeholder*='Search']",
      "div[contenteditable='true'].composer",
    ],
    send: [
      "button[aria-label='Send']",
      "button[type='submit']",
    ],
  },
  {
    id: "phind",
    matches: ["phind.com"],
    composer: [
      "textarea[placeholder*='Ask']",
      "textarea[placeholder*='Search']",
    ],
    send: [
      "button[aria-label='Send']",
      "button[type='submit']",
    ],
  },
  {
    id: "mistral",
    matches: ["chat.mistral.ai"],
    composer: [
      "textarea[placeholder*='Message']",
      "div[contenteditable='true'].composer",
    ],
    send: [
      "button[aria-label='Send message']",
      "button[type='submit']",
    ],
  },
];

// Returns the config for the current hostname, or null when unsupported.
function psGetSiteConfig() {
  var host = location.hostname;
  for (var i = 0; i < promptSathiSites.length; i++) {
    var site = promptSathiSites[i];
    for (var j = 0; j < site.matches.length; j++) {
      if (host === site.matches[j] || host.endsWith("." + site.matches[j])) return site;
    }
  }
  return null;
}
