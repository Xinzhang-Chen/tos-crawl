/**
 * Heuristic scoring rules for evaluating the relevance of hyperlinks.
 *
 * Links are assigned scores based on their path, visible text, and page location.
 * Higher scores indicate a higher likelihood of being a ToS, Privacy Policy, or Legal page.
 *
 * Scoring categories:
 * - positive: features that increase confidence
 * - negative: features that suggest promotional or irrelevant content
 * - threshold: minimum score required to consider the link relevant
 */

const rules = {
  positive: {
    path: 3, // strong match in URL path
    text: 2, // match in anchor text
    footer: 1, // located inside a <footer>
  },
  negative: {
    promo: -2, // promotional or irrelevant content
  },
  threshold: 4, // minimum score required to follow a link
};

// -----------------------------------------------------------------------------
// Regular expressions for scoring link features
// -----------------------------------------------------------------------------

/**
 * Matches legal document URLs (e.g. /terms, /privacy-policy, /cookie-policy).
 * Allows for common variations and nested paths.
 *
 * Examples matched:
 *   - /terms
 *   - /privacy-policy
 *   - /discover/legal/terms/
 */
const PATH_RE =
  /\/(?:about|discover|legal|info|help)?\/?(terms(?:-and-conditions|-of-use)?|privacy(?:-policy)?|cookie-policy|legal(?:-notice)?)\/?$/i;

/**
 * Matches anchor text that clearly indicates legal or privacy documents.
 * Case-insensitive, allows flexible spacing and ampersands.
 *
 * Examples matched:
 *   - Terms & Conditions
 *   - Terms of Service
 *   - Privacy Policy
 */
const TEXT_RE = /\b(terms\s*&?\s*conditions|terms\s*of\s*service|privacy\s*policy|cookie\s*policy|legal\s*notice)\b/i;

/**
 * Matches promotional phrases or marketing content that should be downweighted.
 *
 * Examples matched:
 *   - "Offer ends soon"
 *   - "10/31/2025"
 */
const PROMO_RE = /\b(offer|sale|save|ends|exclusions|bonus|xpts|boost|wk\d+|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i;

// -----------------------------------------------------------------------------
// Link scoring function
// -----------------------------------------------------------------------------

/**
 * Computes a heuristic score for a hyperlink.
 *
 * Scoring features:
 * - +3 if path matches known legal patterns
 * - +2 if visible text matches legal document terms
 * - +1 if the link is located in the footer
 * - -2 if path or text includes promotional keywords
 *
 * @param {{ pathname: string, text: string, isFooter: boolean }} link
 * @returns {number} heuristic score for the link
 */
function scoreLink(link) {
  let score = 0;
  if (PATH_RE.test(link.pathname)) score += rules.positive.path;
  if (TEXT_RE.test(link.text)) score += rules.positive.text;
  if (link.isFooter) score += rules.positive.footer;
  if (PROMO_RE.test(link.pathname) || PROMO_RE.test(link.text)) score += rules.negative.promo;
  return score;
}

module.exports = { scoreLink, rules };
