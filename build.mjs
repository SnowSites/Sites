import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

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

const jsOut = jsOrder.map(f => readFileSync(resolve(jsDir, f), "utf8")).join("\n");
writeFileSync(resolve(distDir, "script.js"), jsOut, "utf8");

// mantém exatamente sem newline final
const cssOut = cssOrder.map(f => readFileSync(resolve(cssDir, f), "utf8").replace(/\n$/, "")).join("\n");
writeFileSync(resolve(distDir, "style.css"), cssOut, "utf8");

console.log("Build concluído: dist/script.js e dist/style.css");
