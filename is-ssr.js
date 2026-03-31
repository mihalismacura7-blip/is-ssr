#!/usr/bin/env node

const https = require('https');
const http = require('http');
const { URL } = require('url');

// ─── Colors (no dependencies) ───────────────────────────────────
const c = {
  red: (t) => `\x1b[31m${t}\x1b[0m`,
  green: (t) => `\x1b[32m${t}\x1b[0m`,
  yellow: (t) => `\x1b[33m${t}\x1b[0m`,
  blue: (t) => `\x1b[34m${t}\x1b[0m`,
  cyan: (t) => `\x1b[36m${t}\x1b[0m`,
  bold: (t) => `\x1b[1m${t}\x1b[0m`,
  dim: (t) => `\x1b[2m${t}\x1b[0m`,
  gray: (t) => `\x1b[90m${t}\x1b[0m`,
};

// ─── Help ────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
${c.bold('is-ssr')} — Check if a webpage is server-side rendered

${c.bold('Usage:')}
  ${c.cyan('npx is-ssr')} ${c.dim('<url>')}
  ${c.cyan('npx is-ssr')} ${c.dim('<url> <url> ...')}

${c.bold('Examples:')}
  ${c.cyan('npx is-ssr https://react.dev')}
  ${c.cyan('npx is-ssr https://linear.app https://vercel.com')}

${c.bold('Options:')}
  ${c.dim('--json')}     Output results as JSON
  ${c.dim('--help')}     Show this help message

${c.bold('What it does:')}
  Fetches the raw HTML of a page (no JavaScript execution)
  and checks if meaningful content exists in the initial
  response. This is exactly what Googlebot sees on first
  pass and what AI crawlers (ChatGPT, Perplexity) see.

${c.dim('For a full multi-page SEO audit: https://jsvisible.com')}
`);
}

// ─── Fetch URL (follows redirects, zero deps) ───────────────────
function fetchUrl(urlStr, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

    let parsedUrl;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get(
      urlStr,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; is-ssr-checker/1.0; +https://jsvisible.com)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 15000,
      },
      (res) => {
        // Follow redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, urlStr).toString();
          return fetchUrl(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(body));
        res.on('error', reject);
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out (15s)'));
    });
  });
}

// ─── HTML Analysis ──────────────────────────────────────────────
function analyzeHtml(html) {
  const result = {
    title: null,
    metaDescription: null,
    h1: null,
    h1Count: 0,
    canonical: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    lang: null,
    wordCount: 0,
    linkCount: 0,
    imageCount: 0,
    imagesWithAlt: 0,
    imagesWithoutAlt: 0,
    hasStructuredData: false,
    structuredDataTypes: [],
    hasViewport: false,
    scripts: 0,
    frameworks: [],
  };

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  result.title = titleMatch ? titleMatch[1].trim() : null;

  // Meta description
  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  result.metaDescription = metaDescMatch ? metaDescMatch[1].trim() : null;

  // H1
  const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  if (h1Matches) {
    result.h1Count = h1Matches.length;
    result.h1 = h1Matches[0].replace(/<[^>]*>/g, '').trim();
  }

  // Canonical
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i);
  result.canonical = canonicalMatch ? canonicalMatch[1] : null;

  // Open Graph
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i);
  result.ogTitle = ogTitleMatch ? ogTitleMatch[1] : null;

  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i);
  result.ogDescription = ogDescMatch ? ogDescMatch[1] : null;

  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i);
  result.ogImage = ogImageMatch ? ogImageMatch[1] : null;

  // Language
  const langMatch = html.match(/<html[^>]*lang=["']([^"']*)["']/i);
  result.lang = langMatch ? langMatch[1] : null;

  // Body content word count (strip tags, scripts, styles)
  let bodyContent = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) bodyContent = bodyMatch[1];
  bodyContent = bodyContent
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = bodyContent.split(/\s+/).filter((w) => w.length > 0);
  result.wordCount = words.length;

  // Links
  const linkMatches = html.match(/<a\s[^>]*href=["'][^"']*["'][^>]*>/gi);
  result.linkCount = linkMatches ? linkMatches.length : 0;

  // Images
  const imgMatches = html.match(/<img\s[^>]*>/gi);
  if (imgMatches) {
    result.imageCount = imgMatches.length;
    imgMatches.forEach((img) => {
      if (/alt=["'][^"']+["']/i.test(img)) {
        result.imagesWithAlt++;
      } else {
        result.imagesWithoutAlt++;
      }
    });
  }

  // Structured data
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    result.hasStructuredData = true;
    jsonLdMatches.forEach((match) => {
      try {
        const content = match.replace(/<[^>]*>/g, '');
        const parsed = JSON.parse(content);
        const type = parsed['@type'] || (parsed['@graph'] ? 'Multiple' : 'Unknown');
        if (Array.isArray(type)) {
          result.structuredDataTypes.push(...type);
        } else {
          result.structuredDataTypes.push(type);
        }
      } catch {}
    });
  }

  // Viewport
  result.hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);

  // Script count
  const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi);
  result.scripts = scriptMatches ? scriptMatches.length : 0;

  // Framework detection
  if (/next/i.test(html) || /__next/i.test(html) || /_next/i.test(html)) {
    result.frameworks.push('Next.js');
  }
  if (/__nuxt/i.test(html) || /_nuxt/i.test(html)) {
    result.frameworks.push('Nuxt.js');
  }
 if (/data-reactroot/i.test(html) || /react-app|reactDOM|__react/i.test(html)) {
    result.frameworks.push('React');
  }
  if (/ng-version/i.test(html) || /ng-app/i.test(html)) {
    result.frameworks.push('Angular');
  }
 if (/data-v-[a-f0-9]/i.test(html) || /vue\.js|vuejs|__vue/i.test(html)) {
    result.frameworks.push('Vue');
  }
  if (/svelte/i.test(html) || /sveltekit/i.test(html)) {
    result.frameworks.push('Svelte');
  }
 if (/___gatsby|gatsby-/i.test(html)) {
    result.frameworks.push('Gatsby');
  }
  if (/astro/i.test(html)) {
    result.frameworks.push('Astro');
  }

  // Deduplicate frameworks
  result.frameworks = [...new Set(result.frameworks)];

  return result;
}

// ─── Scoring ────────────────────────────────────────────────────
function getVerdict(analysis) {
  let score = 0;
  const maxScore = 7;
  const checks = [];

  // Title
  if (analysis.title && analysis.title.length > 5) {
    score++;
    checks.push({ label: 'Title tag', pass: true, value: truncate(analysis.title, 50) });
  } else {
    checks.push({ label: 'Title tag', pass: false, value: analysis.title || 'Missing' });
  }

  // Meta description
  if (analysis.metaDescription && analysis.metaDescription.length > 10) {
    score++;
    checks.push({ label: 'Meta description', pass: true, value: truncate(analysis.metaDescription, 60) });
  } else {
    checks.push({ label: 'Meta description', pass: false, value: analysis.metaDescription || 'Missing' });
  }

  // H1
  if (analysis.h1) {
    score++;
    checks.push({ label: 'H1 heading', pass: true, value: truncate(analysis.h1, 50) });
  } else {
    checks.push({ label: 'H1 heading', pass: false, value: 'Missing' });
  }

  // Word count (meaningful content)
  if (analysis.wordCount > 100) {
    score++;
    checks.push({ label: 'Content in HTML', pass: true, value: `${analysis.wordCount} words` });
  } else {
    checks.push({ label: 'Content in HTML', pass: false, value: `${analysis.wordCount} words (very thin)` });
  }

  // Canonical
  if (analysis.canonical) {
    score++;
    checks.push({ label: 'Canonical URL', pass: true, value: truncate(analysis.canonical, 50) });
  } else {
    checks.push({ label: 'Canonical URL', pass: false, value: 'Missing' });
  }

  // Open Graph
  if (analysis.ogTitle) {
    score++;
    checks.push({ label: 'Open Graph tags', pass: true, value: 'Present' });
  } else {
    checks.push({ label: 'Open Graph tags', pass: false, value: 'Missing' });
  }

  // Structured data
  if (analysis.hasStructuredData) {
    score++;
    checks.push({ label: 'Structured data', pass: true, value: analysis.structuredDataTypes.join(', ') });
  } else {
    checks.push({ label: 'Structured data', pass: false, value: 'Missing' });
  }

  // Determine SSR status
  let status;
  if (score >= 5 && analysis.wordCount > 100) {
    status = 'ssr';
  } else if (score >= 3 && analysis.wordCount > 30) {
    status = 'partial';
  } else {
    status = 'csr';
  }

  return { score, maxScore, status, checks };
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

// ─── Output ─────────────────────────────────────────────────────
function printResult(url, analysis, verdict, isJson) {
  if (isJson) return; // handled separately

  console.log('');
  console.log(c.bold(`  ${url}`));
  console.log(c.dim(`  ${'─'.repeat(60)}`));

  // Status line
  if (verdict.status === 'ssr') {
    console.log(`  ${c.green('✅ Server-side rendered')} — content is in the initial HTML`);
  } else if (verdict.status === 'partial') {
    console.log(`  ${c.yellow('⚠️  Partially rendered')} — some content in HTML, some missing`);
  } else {
    console.log(`  ${c.red('❌ Client-side rendered')} — minimal content in initial HTML`);
  }

  console.log(`  ${c.dim(`Score: ${verdict.score}/${verdict.maxScore}`)}`);
  console.log('');

  // Checks
  for (const check of verdict.checks) {
    const icon = check.pass ? c.green('✓') : c.red('✗');
    const label = check.pass ? check.label : c.red(check.label);
    console.log(`  ${icon} ${label}: ${c.dim(check.value)}`);
  }

  // Extra info
  console.log('');
  console.log(c.dim(`  Links: ${analysis.linkCount} | Images: ${analysis.imageCount} (${analysis.imagesWithoutAlt} missing alt) | Scripts: ${analysis.scripts}`));

  if (analysis.frameworks.length > 0) {
    console.log(c.dim(`  Detected: ${analysis.frameworks.join(', ')}`));
  }

  // Warnings
  if (verdict.status !== 'ssr') {
    console.log('');
    console.log(c.yellow('  ⚠ Googlebot may delay indexing this page (rendering queue)'));
    console.log(c.yellow('  ⚠ AI crawlers (ChatGPT, Perplexity) cannot see JS-rendered content'));
  }

  if (analysis.imagesWithoutAlt > 0) {
    console.log(c.yellow(`  ⚠ ${analysis.imagesWithoutAlt} image(s) missing alt text`));
  }

  if (!analysis.hasStructuredData) {
    console.log(c.yellow('  ⚠ No structured data (Schema.org) found'));
  }

  console.log('');
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const urls = args.filter((a) => !a.startsWith('--'));

  if (args.includes('--help') || urls.length === 0) {
    showHelp();
    process.exit(0);
  }

  // Normalize URLs
  const normalizedUrls = urls.map((u) => {
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      return 'https://' + u;
    }
    return u;
  });

  const results = [];

  for (const url of normalizedUrls) {
    process.stdout.write(c.dim(`  Checking ${url}...`));

    try {
      const html = await fetchUrl(url);
      const analysis = analyzeHtml(html);
      const verdict = getVerdict(analysis);

      // Clear the "Checking..." line
      process.stdout.write('\r' + ' '.repeat(80) + '\r');

      printResult(url, analysis, verdict, isJson);

      results.push({
        url,
        status: verdict.status,
        score: `${verdict.score}/${verdict.maxScore}`,
        title: analysis.title,
        metaDescription: analysis.metaDescription,
        h1: analysis.h1,
        wordCount: analysis.wordCount,
        links: analysis.linkCount,
        images: analysis.imageCount,
        imagesWithoutAlt: analysis.imagesWithoutAlt,
        structuredData: analysis.hasStructuredData,
        structuredDataTypes: analysis.structuredDataTypes,
        frameworks: analysis.frameworks,
        checks: verdict.checks,
      });
    } catch (err) {
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      console.log('');
      console.log(`  ${c.red('✗')} ${c.bold(url)}`);
      console.log(`  ${c.red(`Error: ${err.message}`)}`);
      console.log('');

      results.push({ url, error: err.message });
    }
  }

  // Summary for multiple URLs
  if (normalizedUrls.length > 1) {
    console.log(c.bold('  Summary'));
    console.log(c.dim(`  ${'─'.repeat(60)}`));
    const ssr = results.filter((r) => r.status === 'ssr').length;
    const partial = results.filter((r) => r.status === 'partial').length;
    const csr = results.filter((r) => r.status === 'csr').length;
    const errors = results.filter((r) => r.error).length;
    console.log(`  ${c.green(`${ssr} SSR`)} | ${c.yellow(`${partial} Partial`)} | ${c.red(`${csr} CSR`)} | ${errors > 0 ? c.red(`${errors} Errors`) : ''}`);
    console.log('');
  }

  // JSON output
  if (isJson) {
    console.log(JSON.stringify(results, null, 2));
  }

  // Footer
  if (!isJson) {
    console.log(c.dim('  ─────────────────────────────────────────────────────────'));
    console.log(c.dim('  For a full multi-page SEO audit with rendering comparison:'));
    console.log(c.cyan('  https://jsvisible.com'));
    console.log('');
  }
}

main().catch((err) => {
  console.error(c.red(`Error: ${err.message}`));
  process.exit(1);
});
