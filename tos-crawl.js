// tos-crawl.js

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const TurndownService = require('turndown');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const { resolve: resolveUrl } = require('url');
const fs = require('fs');
const path = require('path');

// Setup puppeteer with stealth
puppeteer.use(StealthPlugin());

// ===================== CONFIGURATION =====================
const DEFAULT_URL = 'https://www.linkedin.com/legal/l/service-terms';
const DEFAULT_OUTPUT = './output/Linkedin.md';
const TOS_KEYWORDS = [/terms/i, /service/i, /legal/i, /policy/i, /user-agreement/i];
const MAX_DEPTH = 3;
const LANGUAGE = 'en-US';
const visitedLinks = new Set();

// ===================== STATISTICS =====================
let stats = {
  totalVisited: 0,
  success: 0,
  skipped: 0,
  failed: 0,
};

// ===================== MAIN FUNCTION =====================
async function extractTOS(url, depth = 0) {
  const normalizedUrl = url.split('#')[0];
  if (depth > MAX_DEPTH || visitedLinks.has(normalizedUrl)) return '';
  if (normalizedUrl.match(/\.(pdf|docx?|pptx?|xls|zip)(\?|$)/i)) {
    console.log(`⏭️ Skipping non-HTML file: ${normalizedUrl}`);
    stats.skipped++;
    return '';
  }

  visitedLinks.add(normalizedUrl);
  stats.totalVisited++;
  console.log(`🔍 Visiting: ${normalizedUrl}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [`--lang=${LANGUAGE}`, '--no-sandbox', '--disable-features=TranslateUI'],
  });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': `${LANGUAGE},en;q=0.9` });

    const response = await page.goto(normalizedUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const status = response?.status();
    if (!status || status >= 400 || [301, 302, 401, 403].includes(status)) {
      console.log(`⏭️ Skipped restricted page (HTTP ${status}): ${normalizedUrl}`);
      await browser.close();
      stats.skipped++;
      return '';
    }

    const currentUrl = page.url();
    if (isLoginRedirect(currentUrl)) {
      console.log(`⏭️ Skipped login-redirect page: ${normalizedUrl}`);
      await browser.close();
      stats.skipped++;
      return '';
    }

    await autoScroll(page);
    await expandContent(page);

    const htmlContent = await page.content();
    const markdown = await parseContentToMarkdown(htmlContent, normalizedUrl);

    const links = await collectRelatedLinks(page);
    await browser.close();

    if (!markdown.trim()) {
      stats.skipped++;
      return '';
    }

    stats.success++;

    let nestedMarkdown = '';
    for (const link of links) {
      const absoluteLink = resolveUrl(normalizedUrl, link);
      nestedMarkdown += await extractTOS(absoluteLink, depth + 1);
    }

    return markdown + nestedMarkdown;
  } catch (err) {
    await browser.close();
    console.log(`❌ Error processing: ${normalizedUrl}`);
    stats.failed++;
    return '';
  }
}

// ===================== HELPERS =====================
function isLoginRedirect(url) {
  return /checkpoint|login|signin/.test(url);
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

async function expandContent(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[aria-expanded="false"], .accordion, button').forEach((el) => {
      try {
        el.click();
      } catch (_) {}
    });
  });
}

async function parseContentToMarkdown(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.content.trim()) {
    console.warn(`⚠️  No readable Terms of Service content found at: ${url}`);
    return '';
  }

  const turndown = new TurndownService();
  const markdown = turndown.turndown(article.content);
  return `\n\n---\n\n## Terms of Service from: ${url}\n\n${markdown}`;
}

async function collectRelatedLinks(page) {
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map((a) => a.href)
      .filter(
        (href) =>
          href && /terms|service|legal|policy|user-agreement/i.test(href) && !/checkpoint|login|signin/i.test(href)
      );
  });
}

// ===================== UTILITY =====================
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {
    url: DEFAULT_URL,
    output: DEFAULT_OUTPUT,
  };

  args.forEach((arg, index) => {
    if (arg === '--url' && args[index + 1]) options.url = args[index + 1];
    if (arg === '--output' && args[index + 1]) options.output = args[index + 1];
  });

  return options;
}

function ensureOutputDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ===================== ENTRY =====================
(async () => {
  const { url, output } = parseArguments();
  console.log(`📘 Starting TOS extraction from: ${url}`);

  const content = await extractTOS(url);

  if (content.trim()) {
    ensureOutputDirectory(output);
    fs.writeFileSync(output, content);
    console.log(`✅ Terms of Service content saved to: ${output}\n\n`);

    console.log(`📊 Crawl Summary:
      Total Pages Visited: ${stats.totalVisited}
      ✅ Successfully Extracted: ${stats.success}
      ⏭️ Skipped: ${stats.skipped}
      ❌ Failed: ${stats.failed}
    `);
  } else {
    console.log(`⚠️  No Terms of Service content could be extracted from the provided URL.`);
  }
})();
