# is-ssr

Check if a webpage is server-side rendered (SSR) or client-side rendered (CSR). See exactly what Googlebot and AI crawlers see on first visit — before any JavaScript executes.

**Zero dependencies. Pure Node.js.**

## Why this matters

When Googlebot visits your page, it first sees only the raw HTML — before JavaScript runs. If your content isn't in that initial HTML, it goes into a rendering queue that can take hours or days.

AI crawlers (ChatGPT, Perplexity, Claude) are worse — they **never** render JavaScript. They only see raw HTML. If your React/Vue/Angular app is client-side rendered, you're invisible to AI search.

This tool shows you exactly what crawlers see.

## Usage

```bash
npx is-ssr https://react.dev
```

Check multiple URLs:

```bash
npx is-ssr https://react.dev https://linear.app https://vercel.com
```

JSON output (for CI/CD pipelines):

```bash
npx is-ssr https://example.com --json
```

## What it checks

| Check | Why it matters |
|-------|---------------|
| **Title tag** | First thing Google shows in search results |
| **Meta description** | Controls the snippet text in search results |
| **H1 heading** | Tells crawlers what the page is about |
| **Content word count** | Pages with <100 words in raw HTML are likely CSR |
| **Canonical URL** | Prevents duplicate content issues |
| **Open Graph tags** | Controls social media previews |
| **Structured data** | Enables rich snippets in search results |

## Example output

```
  https://react.dev
  ────────────────────────────────────────────────────────────
  ✅ Server-side rendered — content is in the initial HTML
  Score: 6/7

  ✓ Title tag: React
  ✓ Meta description: React is the library for web and nativ...
  ✓ H1 heading: React
  ✓ Content in HTML: 847 words
  ✓ Canonical URL: https://react.dev/
  ✓ Open Graph tags: Present
  ✗ Structured data: Missing

  Links: 45 | Images: 12 (2 missing alt) | Scripts: 8
  Detected: React, Next.js

  ⚠ No structured data (Schema.org) found
```

```
  https://linear.app
  ────────────────────────────────────────────────────────────
  ❌ Client-side rendered — minimal content in initial HTML
  Score: 2/7

  ✓ Title tag: Linear — Plan and build products
  ✗ Meta description: Missing
  ✗ H1 heading: Missing
  ✗ Content in HTML: 23 words (very thin)
  ✗ Canonical URL: Missing
  ✗ Open Graph tags: Missing
  ✗ Structured data: Missing

  Links: 2 | Images: 0 (0 missing alt) | Scripts: 4
  Detected: React

  ⚠ Googlebot may delay indexing this page (rendering queue)
  ⚠ AI crawlers (ChatGPT, Perplexity) cannot see JS-rendered content
```

## Verdicts

- **✅ SSR (Server-side rendered)** — Content is in the initial HTML. Crawlers see your page immediately.
- **⚠️ Partial** — Some content exists in HTML but key elements are missing. Crawlers get an incomplete picture.
- **❌ CSR (Client-side rendered)** — Minimal or no content in the initial HTML. Crawlers depend on JavaScript rendering.

## Framework detection

Automatically detects: React, Next.js, Vue, Nuxt.js, Angular, Svelte, Gatsby, Astro.

## Use in CI/CD

Add a rendering check to your deployment pipeline:

```bash
npx is-ssr https://yoursite.com --json | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  if (data[0].status === 'csr') {
    console.error('Page is client-side rendered — SEO risk');
    process.exit(1);
  }
"
```

## Full SEO audit

This tool checks a single page's raw HTML. For a comprehensive multi-page audit that:

- Crawls your entire site (up to 500 pages)
- Renders each page as both a user and Googlebot
- Compares screenshots side by side
- Runs 36+ SEO checks per page
- Detects orphan pages and internal linking issues
- Generates PDF reports with fix instructions

Check out **[JSVisible](https://jsvisible.com)** — free tier available, no credit card required.

## License

MIT
