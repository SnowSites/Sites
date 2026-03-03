#!/usr/bin/env python3
from pathlib import Path

BASE = Path(__file__).resolve().parent
js_dir = BASE / "src" / "js_parts"
css_dir = BASE / "src" / "css_parts"
dist_dir = BASE / "dist"
dist_dir.mkdir(exist_ok=True)

js_order = [
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
]

css_order = [
  "00_variables_base.css",
  "01_layout_online.css",
  "02_dossier.css",
  "03_people_hierarchy.css",
  "04_vehicle_lightbox.css",
]

(dist_dir / "script.js").write_text(
  "\n".join((js_dir / f).read_text(encoding="utf-8") for f in js_order),
  encoding="utf-8"
)

# mantém exatamente sem newline final (igual ao original)
css_text = "\n".join((css_dir / f).read_text(encoding="utf-8").rstrip("\n") for f in css_order)
(dist_dir / "style.css").write_text(css_text, encoding="utf-8")

print("Build concluído: dist/script.js e dist/style.css")
