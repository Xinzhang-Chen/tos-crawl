/**
 * 🕸️ ToS-Crawl — Terms of Service Crawler
 *
 * This crawler recursively crawls a list of URLs, extracts legal documents
 * (ToS, Privacy Policies, etc.) using Readability or Unfluff, and outputs
 * structured Markdown. Designed for research and compliance tooling.
 *
 *
 * Author: Xinzhang Chen
 * License: AGPL-3.0
 */

const Turndown = require('turndown');
const { Readability } = require('@mozilla/readability');
const extractor = require('unfluff');

const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

// Async task queue with concurrency control
const PQueue = require('p-queue').default;

// Heuristic link scoring system for recursive crawling
const { scoreLink, rules } = require('./heuristics');

// -----------------------------------------------------------------------------
//  Logging Module Setup
// -----------------------------------------------------------------------------
let chalk;
try {
  chalk = require('chalk');
  if (chalk.default && !chalk.cyan) chalk = new (require('chalk').Chalk)();
} catch {
  const n = (s) => s;
  chalk = { cyan: n, green: n, yellow: n, blue: n, red: n, gray: n };
}

// -----------------------------------------------------------------------------
// CLI Argument Configuration
// -----------------------------------------------------------------------------
// Supports various crawl behaviors and extractor settings.
//
// Required:
// --urls: A JSON array of seed URLs to start crawling from.
//
//  Optional:
//  --output: Markdown output file path (default: ./output/tos.md)
//  --maxDepth: Recursion depth (default: 3)
//  --visitBudget: Maximum number of successful extractions before stopping
//  --maxPages: Maximum pages to visit (-1 = unlimited)
//  --language: Accept-Language header for HTTP requests (default: en-US)
//  --includeArchive: Whether to allow visiting archive/history pages (default: false)
//  --extractor: Extraction engine (readability or unfluff) (default: readability)
//  --quiet: Suppress console logging (default: false)
//  --headless: Run Puppeteer in headless mode (default: true)
//  --fallbackExtractor: If readability fails, automatically try unfluff (default: false)
//
// Example usages:
//   node crawler.js --urls '[...]' --output ./tos.md --extractor unfluff
//   node crawler.js --urls '[...]' --output ./tos.md --extractor readability
program
  .requiredOption('--urls <json>', 'list of URLs to crawl (JSON array)')
  .option('--output <file>', 'markdown output', './output/tos.md')
  .option('--maxDepth <n>', 'crawl depth', '3')
  .option('--visitBudget <n>', 'max successful docs before stop', '6')
  .option('--maxPages <n>', 'page budget (-1=unlimited)', '-1')
  .option('--language <lang>', 'Accept-Language', 'en-US')
  .option('--includeArchive', 'include archive/history versions', false)
  .option('--extractor <type>', 'extraction engine: readability or unfluff', 'readability')
  .option('--quiet', 'suppress console output', false)
  .option('--headless', 'run Puppeteer in headless mode', false)
  .option('--fallbackExtractor', 'fallback to unfluff if readability fails', false);
program.parse();
const opt = program.opts();

// Convert numeric options from string to number
opt.maxDepth = +opt.maxDepth;
opt.maxPages = +opt.maxPages;
opt.visitBudget = +opt.visitBudget;

// -----------------------------------------------------------------------------
//  Constants
// -----------------------------------------------------------------------------

// Keywords commonly found in ToS and privacy-related documents.
// Used later to validate that extracted Markdown content is semantically relevant.
const CORE_KW = [
  'terms',
  'service',
  'agreement',
  'conditions',
  'acceptable use',
  'user agreement',
  'eula',
  'privacy',
  'policy',
  'data protection',
  'personal information',
  'gdpr',
  'ccpa',
  'liability',
  'disclaimer',
  'arbitration',
  'termination',
  'cookie',
  'opt-out',
  'copyright',
  'intellectual property',
  'governing law',
  'jurisdiction',
  'notice',
];

// File extensions that indicate non-text/static binary files.
// Links ending with these extensions will be excluded from crawling.
const STATIC_EXT =
  /\.(pdf|png|jpe?g|gif|svg|webp|css|js|mpe?g|mp4|avi|mov|wmv|flv|mkv|zip|rar|gz|tar|7z|exe|dmg|iso)(\?|$)/i;

// Regex to detect archive or historical versions of documents.
const ARCHIVE_RE = /\b(archive|history|version|old|previous)\b/i;

// Default User-Agent string for plain Puppeteer mode.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';

// Extraction browser modes (in order of priority):
// MODE_REAL    - Real browser instance
// MODE_STEALTH - Puppeteer with stealth plugin
// MODE_PLAIN   - Standard Puppeteer
const MODE_REAL = 0;
const MODE_STEALTH = 1;
const MODE_PLAIN = 2;

// -----------------------------------------------------------------------------
//  Initialization: Load seed URLs and setup output environment
// -----------------------------------------------------------------------------
let seeds = [];

// Parse and normalize input URLs from --urls
try {
  const arr = JSON.parse(opt.urls);
  if (!Array.isArray(arr)) throw new Error('--urls must be a JSON array');

  // Track normalized URLs to avoid duplicates
  const seen = new Set();
  seeds = arr
    .map((u) => {
      try {
        const norm = normal(u);
        if (!seen.has(norm)) {
          seen.add(norm);
          return norm;
        }
      } catch {}
      return null;
    })
    .filter(Boolean);
  log(chalk.green(`Loaded ${seeds.length} unique seed URL(s)`));
} catch (e) {
  console.error('[FATAL] Invalid --urls input:', e.message);
  process.exit(1);
}

// Ensure the output directory exists before writing any Markdown
ensureDir(opt.output);

// Global crawler state
// Queue for asynchronous crawl jobs, limited to 3 concurrent tasks
const queue = new PQueue({ concurrency: 3 });
const visited = new Set();
const mdBuf = [];
const stat = { visited: 0, success: 0, skipped: 0, failed: 0 };
const successUrls = [];

// Global stop flag: becomes true if visit budget or page limit is hit
let stop = false;

// -----------------------------------------------------------------------------
//  Main Execution
// -----------------------------------------------------------------------------
(async () => {
  log(chalk.cyan(`Crawling ${seeds.length} URL(s) | depth≤${opt.maxDepth}`));

  // Enqueue initial crawl tasks from the provided seed URLs
  seeds.forEach((u) => queue.add(() => crawl(u, 0)));

  // Wait until all tasks are completed
  while (queue.size || queue.pending) await queue.onIdle();

  // Write extracted Markdown to output file, if any content was collected
  if (mdBuf.length) fs.writeFileSync(opt.output, mdBuf.join('\n'));
  log(chalk.blue(`${stat.visited} visited | succeed:${stat.success} skipped:${stat.skipped} failed:${stat.failed}`));
  successUrls.forEach((u, i) => {
    console.log(chalk.gray(`[${i + 1}]`), chalk.cyan(u));
  });
})();

// -----------------------------------------------------------------------------
//  Crawl Functions
// -----------------------------------------------------------------------------

/**
 * Launch a Puppeteer browser instance in one of three modes:
 * - MODE_REAL: Puppeteer-real-browser
 * - MODE_STEALTH: Puppeteer-extra with Stealth plugin
 * - MODE_PLAIN: Standard Puppeteer with custom headers
 * @param {number} mode - One of MODE_REAL, MODE_STEALTH, MODE_PLAIN
 * @returns {Promise<{browser: object, page: object}>}
 */
async function launchBrowser(mode) {
  console.log(chalk.gray(`[LAUNCH] mode=${mode}`));
  try {
    if (mode === MODE_REAL) {
      // Mode 0: Launch puppeteer-real-browser
      const { connect } = require('puppeteer-real-browser');
      const { browser, page } = await connect({
        headless: opt.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        customConfig: {},
        skipTarget: [],
        fingerprint: true,
        turnstile: true,
        connectOption: {
          defaultViewport: null,
        },
      });
      return { browser, page };
    } else if (mode === MODE_STEALTH) {
      // Mode 1: Launch puppeteer-extra with Stealth plugin
      const puppeteer = require('puppeteer-extra');
      const Stealth = require('puppeteer-extra-plugin-stealth');
      puppeteer.use(Stealth());
      const browser = await puppeteer.launch({
        headless: opt.headless,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      return { browser, page };
    } else {
      // Mode 2: Standard Puppeteer with custom headers
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({
        headless: opt.headless,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setUserAgent(USER_AGENT);
      await page.setExtraHTTPHeaders({ 'Accept-Language': `${opt.language},en;q=0.8` });
      return { browser, page };
    }
  } catch (e) {
    // Something went wrong during browser launch
    throw new Error(`[launchBrowser:${mode}] ${e.message}`);
  }
}

/**
 * Crawl and extract Markdown content from a given URL, with fallback modes.
 * Handles scrolling, content expansion, cookie banners, and link discovery.
 * @param {string} url - The page to crawl
 * @param {number} depth - Current crawl depth
 * @param {number} mode - Current browser mode
 */
async function crawl(url, depth, mode = MODE_REAL) {
  if (stop) return;
  let key;
  try {
    key = normal(url);
  } catch {
    return;
  }

  // ---------- Budget and Filter Checks ----------
  if (depth > opt.maxDepth) return skip(`depth>${opt.maxDepth}  ${url}`);
  if (visited.has(key)) return skip(`visited ${url}`);
  if (opt.maxPages > 0 && stat.visited >= opt.maxPages) {
    stop = true;
    return skip(`page budget hit ${url}`);
  }
  if (opt.visitBudget > 0 && stat.success >= opt.visitBudget) {
    stop = true;
    return skip(`visit budget hit ${url}`);
  }
  if (filter(key)) return skip(`filter() rules ${url}`);

  // Mark as visited and update stats
  visited.add(key);
  stat.visited++;
  log(chalk.gray(`[${depth}] ${key} | visited=${stat.visited} succeed=${stat.success} failed=${stat.failed}`));

  let browser, page;

  try {
    // ---------- Launch Browser & Visit Page ----------
    ({ browser, page } = await launchBrowser(mode));
    await safeGoto(page, url);
    await cookieDismiss(page);
    await expand(page);
    await autoscroll(page);

    const html = await page.content();

    // Convert to Markdown using selected extractor
    const md = await htmlToMarkdown(html, key);

    console.log(chalk.gray(`[EXTRACT] ${key} | mode=${mode} | depth=${depth}`));
    if (md) {
      push(md);
      stat.success++;
      successUrls.push(key);
    } else {
      // ---------- Retry in next fallback mode ----------
      if (mode < MODE_PLAIN) {
        log(chalk.yellow(`[RETRY EMPTY markdown MODE ${mode + 1}] -> ${url}`));
        visited.delete(key);
        stat.visited--;
        await closeBrowserAndPage(browser, page);
        return crawl(url, depth, mode + 1);
      } else {
        return skip(`invalid markdown ${url}`);
      }
    }

    // ---------- Discover and Enqueue Internal Links ----------
    const links = await collectLinks(page, new URL(url).hostname);
    links
      .map((l) => {
        try {
          return normal(l);
        } catch {
          return null;
        }
      })
      .filter((l) => l && !visited.has(l))
      .forEach((l) => queue.add(() => crawl(l, depth + 1)));
  } catch (e) {
    stat.failed++;
    log(chalk.red(e.message));
  } finally {
    try {
      await closeBrowserAndPage(browser, page);
    } catch {}
  }
}

// -----------------------------------------------------------------------------
//  Puppeteer helpers
// -----------------------------------------------------------------------------

/**
 * Navigate to the given URL with fallback wait strategies.
 *
 * Tries two waitUntil strategies in order:
 * - 'networkidle2': waits for network to be idle (more robust)
 * - 'domcontentloaded': waits for HTML content load
 *
 * If one fails due to timeout or navigation error, fallback to the other.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} u - URL to navigate to
 * @returns {Promise<Response|null>}
 */
async function safeGoto(page, u) {
  const modes = ['networkidle2', 'domcontentloaded'];
  for (const m of modes) {
    try {
      return await page.goto(u, { waitUntil: m, timeout: 60000 });
    } catch (e) {
      if (/Timeout|Navigation/.test(e.message)) continue;
      throw e;
    }
  }
  return null;
}

/**
 * Attempts to dismiss cookie banners or consent dialogs using common selectors.
 *
 * Looks for buttons with "agree", "accept", "got it", "okay" in id, aria-label, or text.
 * Silently fails if no match is found or interaction is blocked.
 *
 * @param {import('puppeteer').Page} page
 */
async function cookieDismiss(page) {
  try {
    await page.$$eval('button[id*="agree" i], button[aria-label*="accept" i]', (btns) =>
      btns.forEach((b) => b.click())
    );

    const acceptBtn = await page.$('button,div >> text=/^(accept|agree|got it|okay)$/i');
    if (acceptBtn) await acceptBtn.click();
  } catch {}
}

/**
 * Attempts to expand collapsed content such as:
 * - <details> tags
 * - "Read more", "Expand", etc. buttons or summaries
 *
 * Useful for loading ToS sections hidden behind toggles.
 *
 * @param {import('puppeteer').Page} page
 */
async function expand(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[aria-expanded="false"],details:not([open]),summary,button').forEach((el) => {
      const t = (el.innerText || '').toLowerCase();
      if (/more|expand|show|details|read/.test(t) || el.tagName === 'SUMMARY')
        try {
          el.click();
        } catch {}
    });
  });
}

/**
 * Scrolls the page down incrementally to trigger lazy-loading content.
 *
 * @param {import('puppeteer').Page} page
 */
async function autoscroll(page) {
  await page.evaluate(async () => {
    await new Promise((r) => {
      let y = 0,
        d = 600;
      const t = setInterval(() => {
        window.scrollBy(0, d);
        y += d;
        if (y >= document.body.scrollHeight) {
          clearInterval(t);
          r();
        }
      }, 120);
    });
  });
}

// -----------------------------------------------------------------------------
//  Extraction & validation
// -----------------------------------------------------------------------------
/**
 * Convert HTML page content into clean Markdown using the selected extractor.
 * Two modes are supported:
 * - readability: Uses Mozilla Readability to extract main content
 * - unfluff: Uses metadata and paragraph inference
 * @param {string} html - Raw HTML content
 * @param {string} url - Source URL (used for context and title)
 * @returns {string} Markdown-formatted string, or '' if extraction fails
 */
async function htmlToMarkdown(html, url) {
  const turndown = new Turndown();
  let md = '';

  // ========== Mode: Readability ==========
  if (opt.extractor === 'readability') {
    let dom;
    try {
      dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
    } catch (e) {
      log(chalk.red(`[JSDOM init fail] ${url} - ${e.message}`));
      return '';
    }

    // Strip non-content tags
    dom.window.document.querySelectorAll('script,style,noscript,template').forEach((e) => e.remove());
    try {
      const reader = new Readability(dom.window.document).parse();
      if (reader && reader.content && typeof reader.content === 'string' && reader.content.trim()) {
        md = turndown.turndown(reader.content);
      }
    } catch (e) {
      log(chalk.red(`[Readability fail] ${url} - ${e.message}`));
    }

    // Fallback to innerText if Readability returned nothing
    if (!md) {
      const txt = (dom.window.document.body.innerText || '').trim();
      if (txt) {
        md = turndown.turndown(`<pre>${txt}</pre>`);
        log(chalk.yellow(`[Fallback to innerText] ${url}`));
        log(chalk.yellow(`Tip: For better results, try --extractor unfluff`));
      }
    }
  }

  // ========== Mode: Unfluff ==========
  else if (opt.extractor === 'unfluff') {
    try {
      const data = extractor(html);

      const title = (data.title || '').trim();
      const rawText = (data.text || '').trim();

      // Clean up excessive newlines and spaces: keep paragraph structure but remove excess lines
      const cleanedText = rawText
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .join('\n\n');

      if (cleanedText) {
        md = `## ${title || 'Untitled'}\n\n` + turndown.turndown(`<pre>${cleanedText}</pre>`);
      }
    } catch (e) {
      log(chalk.red(`[Unfluff fail] ${url} - ${e.message}`));
    }
  }

  // Validate the extracted Markdown content
  if (md && isValid(md)) {
    return `\n\n---\n\n## Source: ${url}\n\n${md}`;
  }

  // ====== Fallback to unfluff if enabled ======
  if (opt.extractor === 'readability' && opt.fallbackExtractor && md.trim() === '') {
    log(chalk.yellow(`[FallbackExtractor] Trying unfluff for ${url}`));
    try {
      const data = extractor(html);
      const title = (data.title || '').trim();
      const rawText = (data.text || '').trim();

      const cleanedText = rawText
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .join('\n\n');

      if (cleanedText) {
        md = `## ${title || 'Untitled'}\n\n` + turndown.turndown(`<pre>${cleanedText}</pre>`);
        if (isValid(md)) {
          log(chalk.green(`[FallbackExtractor succeeded] ${url}`));
          return `\n\n---\n\n## Source: ${url}\n\n${md}`;
        }
      }
    } catch (e) {
      log(chalk.red(`[FallbackExtractor fail] ${url} - ${e.message}`));
    }
  }

  // If extraction failed or content is invalid, return empty string
  return '';
}

/**
 * Count how many core ToS-related keywords appear in the given text.
 *
 * @param {string} t - The text content to check
 * @returns {number} Number of keyword matches from CORE_KW
 */
function kwHits(t) {
  const l = t.toLowerCase();
  return CORE_KW.filter((k) => l.includes(k)).length;
}

/**
 * Check whether a Markdown snippet is valid for output
 * (currently just check with the word count)
 *
 * @param {string} md - The Markdown content to validate
 * @returns {boolean} Whether the content is long enough (and optionally relevant)
 */
function isValid(md) {
  const words = md.split(/\s+/).length;
  // const hits = kwHits(md);
  // return words > 120 && hits >= 2;
  return words > 120;
}

// -----------------------------------------------------------------------------
//  Link utils
// -----------------------------------------------------------------------------

/**
 * Normalize a URL by removing tracking parameters and fragment identifiers.
 * @param {string} u - Input URL
 * @returns {string} Normalized canonical URL
 */
function normal(u) {
  const x = new URL(u);
  ['hl', 'lang', 'locale', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((p) =>
    x.searchParams.delete(p)
  );
  x.hash = '';
  return x.origin + x.pathname.replace(/\/+/g, '/').replace(/\/+$/, '') + x.search;
}

/**
 * Determine whether a URL should be skipped (filtered out).
 *
 * Rules:
 * - Static resources (images, videos, scripts, archives)
 * - Login/authentication-related URLs
 * - Archive/history versions (unless --includeArchive is set)
 *
 * @param {string} u - Normalized URL
 * @returns {boolean} Whether the URL should be skipped
 */
function filter(u) {
  if (STATIC_EXT.test(u)) return true;
  if (/login|signin|auth|checkpoint/.test(u)) return true;
  if (!opt.includeArchive && ARCHIVE_RE.test(u)) return true;
  return false;
}

/**
 * Extracts and filters crawlable links from the current page.
 *
 * Steps:
 * - Collect all <a href> anchors
 * - Retain only internal links (same host)
 * - Remove anchors and JavaScript links
 * - Score links using heuristics to detect high-value legal links
 * - Return a unique, filtered list of normalized hrefs
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} host - Hostname of the original seed URL
 * @returns {Promise<string[]>} Array of normalized, score-filtered internal links
 */
async function collectLinks(page, host) {
  const raw = await page.$$eval('a[href]', (as) =>
    as.map((a) => ({
      href: a.href,
      text: (a.innerText || '').trim(),
      isFooter: !!a.closest('footer,[role=contentinfo],[class*=footer],[id*=footer]'),
    }))
  );

  const uniq = new Map();
  raw.forEach((l) => {
    try {
      const u = new URL(l.href);
      // Skip external domains or JavaScript pseudo-links
      if (u.hostname !== host || /#|javascript:/i.test(u.href)) return;
      const href = u.origin + u.pathname.replace(/\/+$/, '');
      const score = scoreLink({ pathname: u.pathname, text: l.text, isFooter: l.isFooter });
      if (score >= rules.threshold) {
        const prev = uniq.get(href);
        if (!prev || prev.score < score) uniq.set(href, { href, score });
      }
    } catch {}
  });

  return Array.from(uniq.values()).map((o) => o.href);
}

// -----------------------------------------------------------------------------
//  Helpers
// -----------------------------------------------------------------------------
// Push Markdown content to the buffer
function push(md) {
  mdBuf.push(md);
}

// Log messages to console, unless quiet mode is enabled
function log(m) {
  if (!opt.quiet) console.log(m);
}

// Ensure the output directory exists
// Creates the directory if it does not exist
function ensureDir(f) {
  const d = path.dirname(f);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// Used to track skipped URLs with a reason
function skip(reason) {
  stat.skipped++;
  log(chalk.yellow(`[SKIP] ${reason}`));
}

// Close the browser and page
async function closeBrowserAndPage(browser, page) {
  try {
    if (page && !page.isClosed?.()) {
      await page.close();
    }
  } catch (e) {
    console.error('[CLOSE PAGE ERROR]', e.message);
  }

  try {
    if (browser && browser.isConnected?.()) {
      await browser.close();
    }
  } catch (e) {
    console.error('[CLOSE BROWSER ERROR]', e.message);
  }
}
