// Builds public/index.html (tools), public/admin.html and public/login.html. Run: node src/build.mjs
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
<meta name="description" content="Asbarix — أدوات الطباعة للمصممين والمطابع: قوالب الأكواب، وتوزيع الأفرخ والكروت، والاستيكر، والأكريليك، مع أسعار قابلة للتعديل.">
<meta name="theme-color" content="#7C1E33">
<meta property="og:title" content="Asbarix — أدوات الطباعة للمصممين والمطابع">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Asbarix">
<meta property="og:image" content="https://asbarix.vercel.app/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:description" content="مساحة واحدة تجمع حسابات المصمم وتسعير الإدارة: قوالب الأكواب، وتوزيع الأفرخ والكروت، والاستيكر، والأكريليك.">
${icon}
</head>
<body>
`;
mkdirSync(OUT, { recursive: true });
cpSync(join(SRC, "assets"), join(OUT, "assets"), { recursive: true });
writeFileSync(join(OUT, "index.html"), head + read("app.html") + "\n" + "\n</body>\n</html>\n");
writeFileSync(join(OUT, "admin.html"), read("admin.html").replace("</title>", "</title>\n" + icon));
writeFileSync(join(OUT, "login.html"), read("login.html"));
console.log("built public/index.html and public/admin.html");
