// Smoke test for worker.js using Node's built-in web APIs — no wrangler needed.
// Run: node smoke-test.mjs   (test 8 makes one real network call to Groq)
import worker from "./worker.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + " " + extra); }
}

// 1. health
let r = await worker.fetch(new Request("https://x/"), {});
let j = await r.json();
check("GET / -> 200 ok:true", r.status === 200 && j.ok === true);
check("GET / has CORS *", r.headers.get("access-control-allow-origin") === "*");

// 2. OPTIONS preflight
r = await worker.fetch(new Request("https://x/improve", { method: "OPTIONS" }));
check("OPTIONS /improve -> 204", r.status === 204);

// 3. wrong path
r = await worker.fetch(new Request("https://x/nope", { method: "POST" }));
check("POST /nope -> 404", r.status === 404);

// 4. wrong method
r = await worker.fetch(new Request("https://x/improve"));
check("GET /improve -> 405", r.status === 405);

// 5. invalid JSON body
r = await worker.fetch(new Request("https://x/improve", { method: "POST", body: "not json" }), {});
j = await r.json();
check("bad body -> 400", r.status === 400 && j.error === "bad_request");

// 6. missing prompt
r = await worker.fetch(new Request("https://x/improve", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({}),
}), {});
j = await r.json();
check("empty payload -> 400", r.status === 400 && j.error === "bad_request");

// 7. no GROQ_API_KEY configured
r = await worker.fetch(new Request("https://x/improve", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: "make me a website" }),
}), {});
j = await r.json();
check("no key -> 500 server_not_configured", r.status === 500 && j.error === "server_not_configured");

// 8. fake key -> Groq rejects -> 502 upstream_error (real network call)
r = await worker.fetch(new Request("https://x/improve", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: "make me a website" }),
}), { GROQ_API_KEY: "gsk_fake_invalid_key_for_error_path_test" });
j = await r.json();
check("fake key -> 502 upstream_error", r.status === 502 && j.error === "upstream_error", JSON.stringify(j));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
