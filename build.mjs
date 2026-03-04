import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const BASE = resolve(".");
const jsDir = resolve(BASE, "src/js_parts");
const cssDir = resolve(BASE, "src/css_parts");
const distDir = resolve(BASE, "dist");
mkdirSync(distDir, { recursive: true });

const jsOrder = [
  "00_prelude.js",
  "01_layout_online.js",
  "02_core_utils_calc_history.js",
  "03_dossier_sync.js",
  "04_autofill.js",
  "05_app_core_views_history.js",
  "06_dossier_functions.js",
  "07_ui_theme_tour_events.js",
  "08_admin_panel.js",
  "09_auth_and_init.js",
];

const cssOrder = [
  "00_variables_base.css",
  "01_layout_online.css",
  "02_dossier.css",
  "03_people_hierarchy.css",
  "04_vehicle_lightbox.css",
];

const stamp = new Date().toISOString();
const sep = "\n\n;\n// ---- build separator ----\n\n";

const jsPieces = jsOrder.map((f) => {
  const p = resolve(jsDir, f);
  const txt = readFileSync(p, "utf8");
  return `// ===== ${f} =====\n${txt}`;
});

const jsOutRaw = jsPieces.join(sep);
const jsHash = createHash("sha1").update(jsOutRaw).digest("hex").slice(0, 10);
const jsBanner = `/* build: ${stamp} | sha1:${jsHash} */\n`;
writeFileSync(resolve(distDir, "script.js"), jsBanner + jsOutRaw, "utf8");

// mantém exatamente sem newline final
const cssPieces = cssOrder.map((f) => {
  const p = resolve(cssDir, f);
  return `/* ===== ${f} ===== */\n` + readFileSync(p, "utf8").replace(/\n$/, "");
});
const cssOutRaw = cssPieces.join("\n");
const cssHash = createHash("sha1").update(cssOutRaw).digest("hex").slice(0, 10);
const cssBanner = `/* build: ${stamp} | sha1:${cssHash} */\n`;
writeFileSync(resolve(distDir, "style.css"), cssBanner + cssOutRaw, "utf8");

console.log("Build concluído:");
console.log(" - dist/script.js");
console.log(" - dist/style.css");
