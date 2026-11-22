// promptSathi — domain-aware terminology injection
// Analyzes prompt to detect domain, then injects relevant terminology
// into the improvement prompt sent to the LLM.

const TERMINOLOGY_DOMAINS = {
  software: {
    keywords: [
      "code", "program", "function", "class", "api", "database", "sql", "nosql",
      "frontend", "backend", "fullstack", "react", "vue", "angular", "svelte",
      "node", "python", "javascript", "typescript", "go", "rust", "java",
      "docker", "kubernetes", "k8s", "ci/cd", "pipeline", "deploy", "devops",
      "git", "github", "gitlab", "rest", "graphql", "grpc", "websocket",
      "auth", "oauth", "jwt", "token", "middleware", "microservice",
      "serverless", "lambda", "cloud", "aws", "gcp", "azure", "vercel",
      "algorithm", "data structure", "complexity", "big-o", "recursion",
      "design pattern", "solid", "dry", "kiss", "tdd", "testing",
      "unit test", "integration test", "e2e", "jest", "vitest", "cypress",
      "debug", "bug", "error", "exception", "stack trace", "log",
      "performance", "optimization", "cache", "redis", "memcached",
      "message queue", "kafka", "rabbitmq", "pub/sub", "event-driven",
      "orm", "prisma", "drizzle", "mongoose", "sequelize", "knex",
      "webpack", "vite", "rollup", "esbuild", "bundler", "transpiler",
      "linter", "eslint", "prettier", "typescript", "tsconfig",
      "package.json", "npm", "yarn", "pnpm", "bun", "deno",
      "monorepo", "turborepo", "nx", "workspace", "dependency",
      "version", "semver", "changelog", "release", "hotfix",
      "migration", "schema", "model", "entity", "repository",
      "controller", "service", "dto", "mapper", "validator",
      "swagger", "openapi", "postman", "insomnia", "curl",
      "environment", "dotenv", "config", "secret", "credential",
      "load balancing", "reverse proxy", "nginx", "apache", "caddy",
      "cdn", "edge", "latency", "throughput", "bandwidth",
      "monitoring", "observability", "metrics", "tracing", "logging",
      "prometheus", "grafana", "datadog", "newrelic", "sentry",
      "security", "vulnerability", "penetration", "xss", "csrf",
      "sql injection", "cors", "csp", "helmet", "rate limiting"
    ],
    terminology: [
      "async/await", "promise", "observable", "stream", "event loop",
      "closure", "hoisting", "prototype", "inheritance", "composition",
      "dependency injection", "inversion of control", "factory", "singleton",
      "observer", "pub/sub", "mediator", "command", "strategy",
      "repository pattern", "unit of work", "active record", "data mapper",
      "cqrs", "event sourcing", "saga", "circuit breaker", "retry",
      "idempotency", "distributed transaction", "two-phase commit",
      "cap theorem", "eventual consistency", "strong consistency",
      "sharding", "partitioning", "replication", "leader election",
      "raft", "paxos", "consensus", "distributed lock", "lease",
      "service mesh", "istio", "linkerd", "envoy", "sidecar",
      "api gateway", "rate limiter", "circuit breaker", "bulkhead",
      "feature flag", "canary", "blue-green", "rolling deploy",
      "infrastructure as code", "terraform", "pulumi", "crossplane",
      "gitops", "argocd", "flux", "helm", "kustomize",
      "observability pillars", "metrics", "logs", "traces", "profiles",
      "sli", "slo", "sla", "error budget", "burn rate",
      "chaos engineering", "game day", "fault injection", "blast radius"
    ]
  },

  business: {
    keywords: [
      "business", "startup", "company", "enterprise", "corporate",
      "strategy", "roadmap", "vision", "mission", "objective", "kpi",
      "okr", "revenue", "profit", "margin", "growth", "scale",
      "market", "customer", "client", "user", "segment", "persona",
      "product", "feature", "mvp", "prototype", "validation",
      "sales", "marketing", "funnel", "conversion", "acquisition",
      "retention", "churn", "ltv", "cac", "arr", "mrr", "arpu",
      "funding", "investor", "vc", "angel", "seed", "series a",
      "valuation", "equity", "cap table", "dilution", "exit",
      "ipo", "acquisition", "merger", "partnership", "alliance",
      "competitor", "differentiation", "moat", "advantage",
      "pricing", "packaging", "tier", "freemium", "subscription",
      "operations", "process", "workflow", "automation", "efficiency",
      "team", "hiring", "culture", "leadership", "management",
      "budget", "forecast", "planning", "quarterly", "annual",
      "stakeholder", "board", "governance", "compliance", "risk",
      "legal", "contract", "nd", "ip", "patent", "trademark"
    ],
    terminology: [
      "product-market fit", "tam", "sam", "som", "beachhead market",
      "go-to-market", "gtm", "sales funnel", "pipeline", "lead",
      "mql", "sql", "pql", "conversion rate", "activation", "a-ha moment",
      "cohort analysis", "retention curve", "lifetime value", "payback period",
      "unit economics", "contribution margin", "gross margin", "net margin",
      "burn rate", "runway", "cash flow", "working capital", "capex", "opex",
      "board deck", "investor update", "kpi dashboard", "north star metric",
      "jobs to be done", "jtbd", "value proposition", "positioning",
      "competitive analysis", "swot", "porter five forces", "blue ocean",
      "business model canvas", "lean canvas", "value chain", "flywheel",
      "network effects", "viral coefficient", "k-factor", "referral loop",
      "pricing strategy", "price elasticity", "willingness to pay",
      "packaging", "tiering", "bundling", "unbundling", "land and expand",
      "account expansion", "upsell", "cross-sell", "renewal", "expansion revenue",
      "customer success", "health score", "nps", "csat", "ces",
      "churn prediction", "intervention", "win-back", "advocacy",
      "partner ecosystem", "channel sales", "reseller", "marketplace",
      "internationalization", "localization", "compliance", "gdpr", "ccpa",
      "soc2", "iso27001", "hipaa", "pci-dss", "audit", "attestation"
    ]
  },

  data: {
    keywords: [
      "data", "analytics", "analysis", "dataset", "dataframe", "pandas",
      "numpy", "sql", "query", "etl", "elt", "pipeline", "warehouse",
      "lake", "lakehouse", "snowflake", "bigquery", "redshift", "databricks",
      "spark", "flink", "kafka", "airflow", "dbt", "fivetran", "stitch",
      "visualization", "dashboard", "chart", "graph", "tableau", "powerbi",
      "looker", "metabase", "superset", "grafana", "kpi", "metric",
      "dimension", "measure", "fact", "star schema", "snowflake schema",
      "normalization", "denormalization", "slowly changing dimension",
      "machine learning", "ml", "ai", "model", "training", "inference",
      "feature", "label", "target", "prediction", "classification",
      "regression", "clustering", "recommendation", "nlp", "cv",
      "deep learning", "neural network", "transformer", "llm", "rag",
      "embedding", "vector", "similarity", "search", "retrieval",
      "evaluation", "accuracy", "precision", "recall", "f1", "auc",
      "overfitting", "underfitting", "bias", "variance", "regularization",
      "cross validation", "hyperparameter", "tuning", "experiment",
      "mlops", "model registry", "feature store", "monitoring", "drift"
    ],
    terminology: [
      "data mesh", "data fabric", "data contract", "data product",
      "data governance", "data quality", "data lineage", "data catalog",
      "master data management", "mdm", "reference data", "golden record",
      "data observability", "data freshness", "data completeness",
      "schema evolution", "backward compatibility", "forward compatibility",
      "change data capture", "cdc", "debezium", "kafka connect",
      "stream processing", "event streaming", "windowing", "watermark",
      "exactly once", "at least once", "idempotent processing",
      "feature engineering", "feature selection", "feature importance",
      "shap", "lime", "interpretability", "explainability",
      "model serving", "online inference", "batch inference", "real-time",
      "a/b testing", "multi-armed bandit", "contextual bandit",
      "causal inference", "counterfactual", "uplift modeling",
      "anomaly detection", "outlier", "isolation forest", "dbscan",
      "time series", "forecasting", "arima", "prophet", "seasonality",
      "recommendation system", "collaborative filtering", "content-based",
      "matrix factorization", "embedding", "two-tower", "retrieval",
      "ranking", "learning to rank", "ndcg", "map", "mrr",
      "data versioning", "dvc", "mlflow", "kubeflow", "zenml",
      "reproducibility", "provenance", "artifact", "lineage tracking"
    ]
  },

  design: {
    keywords: [
      "design", "ui", "ux", "user interface", "user experience",
      "figma", "sketch", "adobe", "xd", "framer", "webflow",
      "wireframe", "mockup", "prototype", "design system", "component",
      "token", "color", "typography", "spacing", "layout", "grid",
      "responsive", "mobile", "desktop", "tablet", "breakpoint",
      "accessibility", "a11y", "wcag", "contrast", "screen reader",
      "aria", "semantic", "html", "css", "scss", "tailwind",
      "styled-components", "emotion", "css-in-js", "design token",
      "user research", "usability", "testing", "interview", "survey",
      "persona", "journey map", "flow", "wireframe", "hi-fi",
      "interaction", "animation", "transition", "micro-interaction",
      "motion", "easing", "duration", "choreography", "delight",
      "design thinking", "double diamond", "ideate", "prototype", "test",
      "handoff", "developer", "spec", "redline", "zeplin", "storybook"
    ],
    terminology: [
      "atomic design", "atoms", "molecules", "organisms", "templates", "pages",
      "design tokens", "semantic tokens", "alias tokens", "component tokens",
      "spacing scale", "type scale", "color palette", "semantic colors",
      "light mode", "dark mode", "color scheme", "prefers-color-scheme",
      "responsive design", "fluid typography", "clamp", "container queries",
      "css grid", "flexbox", "subgrid", "container queries", "has()",
      "cascade layers", "@layer", "custom properties", "css variables",
      "design system governance", "contribution model", "versioning",
      "component library", "storybook", "chromatic", "visual regression",
      "accessibility tree", "focus management", "keyboard navigation",
      "skip links", "landmarks", "heading hierarchy", "color contrast",
      "motion reduction", "prefers-reduced-motion", "animation safety",
      "inclusive design", "universal design", "equitable use",
      "design critique", "design review", "stakeholder alignment",
      "design ops", "design tokens pipeline", "figma tokens", "style dictionary",
      "token studio", "specify", "supernova", "knapsack", "zeroheight"
    ]
  },

  marketing: {
    keywords: [
      "marketing", "campaign", "brand", "content", "seo", "sem",
      "social media", "instagram", "twitter", "x", "linkedin", "tiktok",
      "youtube", "facebook", "email", "newsletter", "copywriting",
      "copy", "headline", "cta", "conversion", "landing page",
      "funnel", "awareness", "consideration", "decision", "retention",
      "growth", "acquisition", "organic", "paid", "influencer",
      "affiliate", "referral", "viral", "word of mouth", "community",
      "event", "webinar", "podcast", "video", "blog", "article",
      "whitepaper", "case study", "testimonial", "review", "social proof",
      "analytics", "ga4", "mixpanel", "amplitude", "heap", "segment",
      "attribution", "utm", "channel", "campaign", "source", "medium"
    ],
    terminology: [
      "brand positioning", "brand architecture", "brand voice", "tone of voice",
      "messaging framework", "value proposition", "unique selling proposition",
      "content pillars", "content calendar", "editorial calendar",
      "seo strategy", "keyword research", "search intent", "topic cluster",
      "pillar page", "topic cluster", "internal linking", "backlink",
      "domain authority", "page authority", "core web vitals", "lc", "fid", "cls",
      "technical seo", "crawl budget", "indexation", "sitemap", "robots.txt",
      "schema markup", "structured data", "rich snippets", "featured snippet",
      "paid media", "ppc", "cpc", "cpm", "cpa", "roas", "roas",
      "bid strategy", "smart bidding", "automated rules", "audience",
      "lookalike", "retargeting", "remarketing", "custom audience",
      "conversion tracking", "pixel", "tag manager", "gtm", "events",
      "attribution model", "first touch", "last touch", "linear", "time decay",
      "marketing mix modeling", "mmm", "incrementality", "geo experiment",
      "email marketing", "deliverability", "open rate", "click rate",
      "segmentation", "personalization", "dynamic content", "automation",
      "drip campaign", "nurture", "lead scoring", "marketing qualified lead",
      "growth loops", "viral loop", "content loop", "paid loop", "sales loop",
      "north star metric", "leading indicator", "lagging indicator",
      "okr", "kpi", "dashboard", "reporting", "executive summary"
    ]
  }
};

function detectDomain(prompt) {
  const lower = prompt.toLowerCase();
  let bestDomain = null;
  let bestScore = 0;

  for (const [domain, config] of Object.entries(TERMINOLOGY_DOMAINS)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score += keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { detectDomain, getTerminologyForDomain, buildTerminologyHint, TERMINOLOGY_DOMAINS };
}
