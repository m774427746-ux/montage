// Builds public/index.html (tools + email gate) and public/admin.html. Run: node src/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const SRC = dirname(fileURLToPath(import.meta.url)), OUT = join(SRC, "..", "public");
const read = (f) => readFileSync(join(SRC, f), "utf8");
const logo = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect width='48' height='48' rx='12' fill='#15233F'/><g fill='#F29A1E'><rect x='13' y='13' width='9.6' height='9.6' rx='1.6'/><rect x='25.4' y='25.4' width='9.6' height='9.6' rx='1.6'/><rect x='25.4' y='13' width='9.6' height='9.6' rx='1.6' opacity='.55'/><rect x='13' y='25.4' width='9.6' height='9.6' rx='1.6' opacity='.55'/></g></svg>";
const icon = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(logo)}">`;
const head = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="مونتاج: قوالب أكواب SVG بالأبعاد الفعلية، وحاسبات توزيع الأفرخ والاستيكرات والأكريليك للمصممين والمطابع.">
<meta name="theme-color" content="#15233F">
<meta property="og:title" content="مونتاج — أدوات المصمم للمطبعة">
<meta property="og:description" content="قوالب الأكواب، وحاسبات الأفرخ والاستيكرات والأكريليك.">
${icon}
<script>try{if(!localStorage.getItem("montage_user"))document.documentElement.classList.add("gated")}catch(e){document.documentElement.classList.add("gated")}</script>
</head>
<body>
`;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), head + read("app.html").replace("<!-- ACRYLIC_TOOLS -->", () => read("acrylic-tools.html")) + "\n" + read("gate.html") + "\n</body>\n</html>\n");
writeFileSync(join(OUT, "admin.html"), read("admin.html").replace("</title>", "</title>\n" + icon));
console.log("built public/index.html and public/admin.html");
