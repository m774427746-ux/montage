// Builds public/index.html (tools), public/admin.html and public/login.html. Run: node src/build.mjs
import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const SRC = dirname(fileURLToPath(import.meta.url)), OUT = join(SRC, "..", "public");
const read = (f) => readFileSync(join(SRC, f), "utf8");
const icon = `<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">`;
const socialMeta="<meta name=\"description\" content=\"مساحة أسبار للمصممين: قوالب الأكواب، توزيع الأوراق والاستيكرات، وتسعير الأكريليك بالسنتيمتر.\"><meta name=\"theme-color\" content=\"#7C1E33\"><meta property=\"og:type\" content=\"website\"><meta property=\"og:locale\" content=\"ar_SA\"><meta property=\"og:site_name\" content=\"Asbarix | أسبار\"><meta property=\"og:title\" content=\"أسبار — مساحة المصممين\"><meta property=\"og:description\" content=\"من أول مقاس إلى عرض سعر مضبوط. قوالب، توزيع وتسعير في مساحة واحدة.\"><meta property=\"og:url\" content=\"https://asbarix.vercel.app/\"><meta property=\"og:image\" content=\"https://asbarix.vercel.app/assets/og.png\"><meta property=\"og:image:secure_url\" content=\"https://asbarix.vercel.app/assets/og.png\"><meta property=\"og:image:type\" content=\"image/png\"><meta property=\"og:image:width\" content=\"1200\"><meta property=\"og:image:height\" content=\"630\"><meta property=\"og:image:alt\" content=\"أسبار — مساحة المصممين، قوالب وتوزيع وتسعير\"><meta name=\"twitter:card\" content=\"summary_large_image\"><meta name=\"twitter:title\" content=\"أسبار — مساحة المصممين\"><meta name=\"twitter:description\" content=\"من أول مقاس إلى عرض سعر مضبوط.\"><meta name=\"twitter:image\" content=\"https://asbarix.vercel.app/assets/og.png\"><link rel=\"canonical\" href=\"https://asbarix.vercel.app/\">";
const head = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${socialMeta}
${icon}
</head>
<body>
`;
mkdirSync(OUT, { recursive: true });
cpSync(join(SRC, "assets"), join(OUT, "assets"), { recursive: true });
// The acrylic section lives inside <main>, right before its closing tag.
const withSection = (app) => app.replace("</main>", read("catalog-panels.html") + "\n</main>"); // Keep acrylic shape generators hidden.
const workspace = '<link rel="stylesheet" href="/assets/product-pricing.css"><script src="/assets/onboarding.js" defer></script>\n<link rel="stylesheet" href="/assets/workspace.css">\n<script src="/assets/workspace.js" defer></script>\n<script src="/assets/offset.js" defer></script>\n<link rel="stylesheet" href="/assets/catalog-ux.css">\n<script src="/assets/barcode.js" defer></script>\n<script src="/assets/catalog-ux.js" defer></script>\n<link rel="stylesheet" href="/assets/product-scanner.css">\n<script src="/assets/product-scanner.js" defer></script>\n<link rel="stylesheet" href="/assets/ubc-tools.css">\n<script src="/assets/ubc-tools.js" defer></script>\n</body>\n</html>\n';
writeFileSync(join(OUT, "index.html"), head + withSection(read("app.html")) + workspace);
writeFileSync(join(OUT, "admin.html"), read("admin.html").replace("</title>", "</title>\n" + icon).replace("</body>", '<link rel="stylesheet" href="/assets/ubc-tools.css"><script src="/assets/ubc-tools.js" defer></script></body>'));
writeFileSync(join(OUT, "login.html"), read("login.html").replace("</head>", socialMeta + "</head>"));
console.log("built public/index.html, admin.html and login.html");

writeFileSync(join(OUT, 'suppliers.html'), read('suppliers.html'));

writeFileSync(join(OUT, 'product-pricing.html'), read('product-pricing.html'));

writeFileSync(join(OUT, 'retail-prices.html'), read('retail-prices.html'));
