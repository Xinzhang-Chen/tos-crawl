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
async function extractTOS(url, depth = 0, browser = null) {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'chrome',
      args: [
        '--lang=en-US',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--single-process',
      ],
    });
  }
  const normalizedUrl = url.split('#')[0];
  if (depth > MAX_DEPTH || visitedLinks.has(normalizedUrl)) return '';

  // Check if the URL is a download page
  if (isDownloadPage(normalizedUrl)) {
    console.log(`⏭️ Skipping download page: ${normalizedUrl}`);
    stats.skipped++;
    visitedLinks.add(normalizedUrl);
    return '';
  }

  visitedLinks.add(normalizedUrl);
  stats.totalVisited++;
  console.log(`🔍 Visiting: ${normalizedUrl}`);
  const page = await browser.newPage();

  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'deny' });

  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      const type = req.resourceType();

      const isDownloadLike =
        /\.(pdf|docx?|pptx?|xls|zip|rar|gz|tar|7z)(\?|$)/i.test(url) ||
        /download=|\.aspx|\.ashx|\.do\?|attachment=true/i.test(url);

      const blockedTypes = ['image', 'stylesheet', 'font', 'media'];

      if (blockedTypes.includes(type) || isDownloadLike) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setExtraHTTPHeaders({ 'Accept-Language': `${LANGUAGE},en;q=0.9` });

    const response = await page.goto(normalizedUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    if (!response || !response.ok() || [301, 302, 401, 403].includes(response.status())) {
      console.log(`⏭️ Skipped restricted page (HTTP ${response?.status()}): ${normalizedUrl}`);
      stats.skipped++;
      return '';
    }

    const currentUrl = page.url();
    if (isLoginRedirect(currentUrl)) {
      console.log(`⏭️ Skipped login-redirect page: ${normalizedUrl}`);
      stats.skipped++;
      visitedLinks.add(normalizedUrl);
      return '';
    }

    if (!(await isEnglishPage(page))) {
      console.log(`⏭️ Skipping non-English page: ${normalizedUrl}`);
      stats.skipped++;
      return '';
    }

    await autoScroll(page);
    await expandContent(page);

    const htmlContent = await page.content();
    const markdown = await parseContentToMarkdown(htmlContent, normalizedUrl);

    if (!isValidTOSContent(markdown)) {
      console.log(`⚠️ Skipping invalid TOS content at ${normalizedUrl}`);
      stats.skipped++;
      visitedLinks.add(normalizedUrl);
      return '';
    }

    const links = await collectRelatedLinks(page);

    stats.success++;

    let nestedMarkdown = '';
    for (const link of links) {
      const absoluteLink = resolveUrl(normalizedUrl, link);
      nestedMarkdown += await extractTOS(absoluteLink, depth + 1, browser);
    }

    return markdown + nestedMarkdown;
  } catch (err) {
    logError(normalizedUrl, err);
    stats.failed++;
    return '';
  } finally {
    if (page && !page.isClosed()) await page.close();
  }
}

// ===================== HELPERS =====================
function isLoginRedirect(url) {
  return /checkpoint|login|signin/.test(url);
}

async function isEnglishPage(page) {
  const lang = await page.evaluate(() => document.documentElement.lang || '');
  return /^en(-|$)/i.test(lang);
}

function isDownloadPage(url) {
  return (
    /\.(pdf|docx?|pptx?|xls|zip|rar|gz|tar|7z)(\?|$)/i.test(url) ||
    /download=|\.aspx|\.ashx|\.do\?|attachment=true/i.test(url)
  );
}

function isValidTOSContent(content) {
  const indicators = [
    'terms',
    'service',
    'agreement',
    'conditions',
    'privacy',
    'policy',
    'liability',
    'user agreement',
    'termination',
    'rights',
    'right',
    'data collection',
    'personal information',
    'GDPR',
    'consent',
    'data protection',
    'third-party',
    'tracking',
    'opt-out',
  ];

  const matchedIndicators = indicators.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(content));

  return matchedIndicators.length >= 1 && content.length > 200;
}

const logError = (url, err) => {
  console.error(`❌ Error at ${url}: ${err.message}`);
  fs.appendFileSync('./logs/error.log', `${new Date().toISOString()} - ${url} - ${err.stack}\n`);
};

function saveStructuredData(output, url, markdown) {
  const data = {
    url,
    fetchedAt: new Date().toISOString(),
    contentLength: markdown.length,
  };
  fs.writeFileSync(output.replace('.md', '.json'), JSON.stringify(data, null, 2));
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      let totalHeight = 0;
      const distance = 800;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function expandContent(page) {
  await page.evaluate(() => {
    ['button', '[aria-expanded="false"]', '.accordion'].forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => el.click());
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
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
          href &&
          /terms|privacy|service|legal|policy|user-agreement/i.test(href) &&
          !/checkpoint|login|signin/i.test(href)
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
  ensureOutputDirectory(output);
  ensureOutputDirectory('./logs/error.log');

  console.log(`📘 Starting TOS extraction from: ${url}`);

  const browser = await puppeteer.launch({
    headless: 'chrome',
    args: [
      '--lang=en-US',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--single-process',
    ],
  });

  try {
    const content = await extractTOS(url, 0, browser);

    if (content.trim()) {
      fs.writeFileSync(output, content);
      saveStructuredData(output, url, content);
      console.log(`✅ Terms of Service content saved to: ${output}\n`);
    } else {
      console.log(`⚠️  No Terms of Service content extracted.`);
    }

    console.log(`📊 Crawl Summary:
      Total Pages Visited: ${stats.totalVisited}
      ✅ Successfully Extracted: ${stats.success}
      ⏭️ Skipped: ${stats.skipped}
      ❌ Failed: ${stats.failed}
    `);
  } catch (error) {
    console.error(error);
  } finally {
    await browser.close();
  }
})();
