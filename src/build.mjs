// Builds public/index.html (tools + email gate) and public/admin.html. Run: node src/build.mjs
import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const SRC = dirname(fileURLToPath(import.meta.url)), OUT = join(SRC, "..", "public");
const read = (f) => readFileSync(join(SRC, f), "utf8");
const icon = `<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">`;
const head = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Asbarix: قوالب أكواب SVG بالأبعاد الفعلية، وحاسبات توزيع الأفرخ والاستيكرات والأكريليك للمصممين والمطابع.">
<meta name="theme-color" content="#7C1E33">
<meta property="og:title" content="Asbarix — أدوات المصمم للمطبعة">
<meta property="og:description" content="قوالب الأكواب، وحاسبات الأفرخ والاستيكرات والأكريليك.">
${icon}
<script>try{if(!localStorage.getItem("montage_user"))document.documentElement.classList.add("gated")}catch(e){document.documentElement.classList.add("gated")}</script>
</head>
<body>
`;
mkdirSync(OUT, { recursive: true });
cpSync(join(SRC, "assets"), join(OUT, "assets"), { recursive: true });
writeFileSync(join(OUT, "index.html"), head + read("app.html") + "\n" + read("gate.html") + "\n</body>\n</html>\n");
writeFileSync(join(OUT, "admin.html"), read("admin.html").replace("</title>", "</title>\n" + icon));
console.log("built public/index.html and public/admin.html");
