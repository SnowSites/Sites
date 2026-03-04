#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timezone
import hashlib

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

stamp = datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
sep = "\n\n;\n// ---- build separator ----\n\n"

js_pieces = []
for f in js_order:
  txt = (js_dir / f).read_text(encoding="utf-8")
  js_pieces.append(f"// ===== {f} =====\n{txt}")

js_out_raw = sep.join(js_pieces)
js_hash = hashlib.sha1(js_out_raw.encode("utf-8")).hexdigest()[:10]
js_banner = f"/* build: {stamp} | sha1:{js_hash} */\n"
(dist_dir / "script.js").write_text(js_banner + js_out_raw, encoding="utf-8")

css_pieces = []
for f in css_order:
  txt = (css_dir / f).read_text(encoding="utf-8").rstrip("\n")
  css_pieces.append(f"/* ===== {f} ===== */\n{txt}")

css_out_raw = "\n".join(css_pieces)
css_hash = hashlib.sha1(css_out_raw.encode("utf-8")).hexdigest()[:10]
css_banner = f"/* build: {stamp} | sha1:{css_hash} */\n"
(dist_dir / "style.css").write_text(css_banner + css_out_raw, encoding="utf-8")

print("Build concluído:")
print(" - dist/script.js")
print(" - dist/style.css")
