<img width="1368" alt="TOS-Crawl Banner" src="https://github.com/user-attachments/assets/1fceb091-de15-4326-a46a-09e9283fac19" />


# 🕸️ ToS-Crawl — Terms of Service Crawler


**ToS-Crawl** is a stealth-enabled crawler that extracts and recursively collects **Terms of Service (ToS)**, **Privacy Policies**, and other legal agreements from major websites. It is designed for **academic research**, **NLP dataset creation**, and **comparative policy analysis**. 

ToS-Crawl is part of the following research paper:

> **"ToSense: We Read, You Click"**\
> *Xinzhang Chen, Hassan Ali, Arash Shaghaghi, Salil S. Kanhere, Sanjay Jha*\
> *Under review at IEEE/IFIP DSN 2025*

---

## 📌 Features

- ✅ Stealth-mode browser automation via `puppeteer-extra`
- ✅ Automatic scrolling and expansion of dynamic content
- ✅ Clean extraction using `@mozilla/readability`
- ✅ Converts HTML to structured Markdown with `turndown`
- ✅ Recursively follows TOS-related links
- ✅ Filters non-HTML and duplicate fragment URLs
- ✅ CLI support for custom URL and output path
- ✅ Crawl summary with coverage stats and result tagging

---

## 🚀 Installation

```bash
git clone https://github.com/Xinzhang-Chen/tos-crawl.git
cd tos-crawl
npm install
```

> Requires Node.js ≥ 18. Puppeteer will auto-install Chromium. No system Chrome is needed.

---

## 🧪 Usage

```bash
node tos-crawl.js --url <target_url> --output <output_file>
```

### ▶️ Example

```bash
node tos-crawl.js --url https://www.linkedin.com/legal/l/service-terms --output ./output/Linkedin.md
```

> If no parameters are provided, the script will crawl LinkedIn's Terms of Service by default and save to `./output/Linkedin.md`.

---

## ⚙️ Parameters

| Argument     | Description                                   | Default                        |
|--------------|-----------------------------------------------|--------------------------------|
| `--url`      | Starting URL to crawl                         | LinkedIn Service Terms         |
| `--output`   | Output `.md` file to store the extracted TOS  | `./output/Linkedin.md`         |

---

## 🌍 Test URLs Table

Use the following well-known platform links to test the crawler:

| Platform    | Terms of Service URL |
|-------------|----------------------|
| Facebook    | https://www.facebook.com/terms.php |
| YouTube     | https://www.youtube.com/t/terms |
| TikTok      | https://www.tiktok.com/legal/page/row/terms-of-service/en |
| LinkedIn    | https://www.linkedin.com/legal/l/service-terms |
| Google      | https://policies.google.com/terms |

> You can copy any of the above into `--url` to test the crawler on that site.

---

## 📊 Sample Crawl Summary

```
📘 Starting TOS extraction from: https://www.linkedin.com/legal/l/service-terms
🔍 Visiting: https://www.linkedin.com/legal/l/service-terms
🔍 Visiting: https://www.linkedin.com/help/recruiter/answer/50181/recruiter-inmail-policy?lang=en
🔍 Visiting: https://www.linkedin.com/help/recruiter/answer/a413279/recruiter-inmail-policy?lang=en
🔍 Visiting: https://www.linkedin.com/legal/professional-community-policies
🔍 Visiting: https://www.linkedin.com/legal/cookie-policy
🔍 Visiting: https://www.linkedin.com/legal/copyright-policy
🔍 Visiting: https://www.linkedin.com/legal/user-agreement
🔍 Visiting: https://www.linkedin.com/legal/privacy-policy
🔍 Visiting: https://www.linkedin.com/legal/l/jobs-policies
🔍 Visiting: https://www.linkedin.com/legal/user-agreement?trk=content_footer-user-agreement
🔍 Visiting: https://linkedin.com/legal/user-agreement
🔍 Visiting: https://linkedin.com/legal/user-agreement-summary
🔍 Visiting: https://linkedin.com/legal/privacy-policy
🔍 Visiting: https://linkedin.com/legal/professional-community-policies
🔍 Visiting: https://linkedin.com/legal/cookie-policy
🔍 Visiting: https://linkedin.com/legal/copyright-policy
🔍 Visiting: https://linkedin.com/legal/privacy/eu
🔍 Visiting: https://linkedin.com/legal/california-privacy-disclosure
🔍 Visiting: https://www.linkedin.com/legal/privacy/usa
🔍 Visiting: https://www.linkedin.com/help/linkedin/answer/a1341216/updates-to-user-agreement-and-privacy-policy
🔍 Visiting: https://www.linkedin.com/help/linkedin/answer/63?trk=microsites-frontend_legal_user-agreement&lang=en
🔍 Visiting: https://www.linkedin.com/help/linkedin/answer/89880?trk=microsites-frontend_legal_user-agreement&lang=en
🔍 Visiting: https://www.linkedin.com/legal/pop/terms-for-paid-services
🔍 Visiting: https://www.linkedin.com/help/linkedin/answer/50?trk=microsites-frontend_legal_user-agreement&lang=en
🔍 Visiting: https://www.linkedin.com/help/linkedin/answer/5704?trk=microsites-frontend_legal_user-agreement&lang=en
🔍 Visiting: https://www.linkedin.com/help/linkedin/answer/67?trk=microsites-frontend_legal_user-agreement&lang=en
🔍 Visiting: https://www.linkedin.com/help/linkedin/answer/86529?trk=microsites-frontend_legal_user-agreement&lang=en
🔍 Visiting: https://www.linkedin.com/help/linkedin/answer/50021?trk=microsites-frontend_legal_user-agreement&lang=en
🔍 Visiting: https://www.linkedin.com/services
🔍 Visiting: https://www.linkedin.com/help/linkedin?trk=microsites-frontend_legal_user-agreement&lang=en
🔍 Visiting: https://www.linkedin.com/help/linkedin/answer/79728?trk=microsites-frontend_legal_user-agreement&lang=en
🔍 Visiting: https://www.linkedin.com/legal/privacy-policy?trk=content_footer-privacy-policy
🔍 Visiting: https://www.linkedin.com/legal/cookie-policy?trk=content_footer-cookie-policy
🔍 Visiting: https://www.linkedin.com/legal/copyright-policy?trk=content_footer-copyright-policy
🔍 Visiting: https://brand.linkedin.com/policies?trk=content_footer-brand-policy
⏭️ Skipping non-HTML file: https://business.linkedin.com/content/dam/business/sales-solutions/global/en_US/site/pdf/ti/services.pdf
🔍 Visiting: https://www.linkedin.com/legal/l/lmsprogramterms
🔍 Visiting: https://www.linkedin.com/legal/l/sponsorship-program-terms
🔍 Visiting: https://www.linkedin.com/legal/ads-policy
🔍 Visiting: https://legal.linkedin.com/dpa
🔍 Visiting: https://www.linkedin.com/legal/l/dpa
🔍 Visiting: https://legal.linkedin.com/customer-subprocessors
🔍 Visiting: https://nam06.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.linkedin.com%2Flegal%2Fcontracting-entity-terms&data=02%7C01%7Crvolpineto%40linkedin.com%7Cfd020363a3da48a2455308d7f690fd09%7C72f988bf86f141af91ab2d7cd011db47%7C1%7C0%7C637248974895609773&sdata=oS%2B38oz5KnsRLYvzMD6i6iDjAmROwKXnJNwlbKu3kfo%3D&reserved=0
🔍 Visiting: https://www.linkedin.com/legal/contracting-entity-terms
✅ Terms of Service content saved to: ./output/Linkedin.md


📊 Crawl Summary:
      Total Pages Visited: 43
      ✅ Successfully Extracted: 43
      ⏭️ Skipped: 1
      ❌ Failed: 0
```

---

## ⚠️ Disclaimer

> This tool is intended solely for **non-commercial**, **academic research**, and **educational** purposes. It is the user’s responsibility to ensure compliance with applicable laws, website terms of service, and ethical research guidelines. This repository does **not** promote or encourage violating any platform's policies.

Additionally, the maintainers **do not guarantee the accuracy, completeness, or continued availability** of the extracted data. Websites may change their structure or access policies at any time. The responsibility for verifying the correctness and relevance of the collected content lies solely with the user.

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.  
See the [LICENSE](./LICENSE) file for more information.

---

## 👩‍💻 Maintainer

- Xinzhang Chen - xinzhang.chen@unsw.edu.au
- Hassan Ali - hassan.ali@unsw.edu.au
- Dr Arash Shaghaghi - a.shaghaghi@unsw.edu.au

🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧

This project is under **active development** 🛠️.

New features and improvements are being added continuously. **Stay tuned!**



