# Site (modularizado)

Este projeto está organizado em **src/** (código fonte) e **dist/** (arquivos finais usados pelo GitHub Pages).

## Como publicar no GitHub Pages
1. Suba **tudo** para o repositório (incluindo `index.html` e a pasta `dist/`).
2. No GitHub: **Settings → Pages → Deploy from a branch**.
3. Selecione a branch (`main`) e a pasta (`/root`).

> O site usa `dist/style.css` e `dist/script.js`.

## Como editar
- CSS: edite arquivos em `src/css_parts/`
- JS: edite arquivos em `src/js_parts/`
Depois gere o `dist/` com um build.

## Build (recomendado - Node)
Requer Node 18+.

```bash
npm install
npm run build
```

## Build (alternativo - Python)
Requer Python 3.

```bash
python build.py
```

## Dica de cache (GitHub Pages)
Se você atualizar e não aparecer, faça:
- **Ctrl+F5** (hard refresh)  
- ou limpe o cache do navegador
