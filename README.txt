Como usar esta versão separada

1) Abra o arquivo index.html (na raiz) — ele aponta para:
   - dist/style.css
   - dist/script.js

2) Para editar em partes:
   - JavaScript: src/js_parts/*.js
   - CSS: src/css_parts/*.css

3) Depois de editar, você pode:
   A) Rodar o build (recomendado) para gerar dist/script.js e dist/style.css
      - Node.js:
        node build.mjs
   ou
      - Python:
        python build.py

Observação: os arquivos em dist/ são gerados por concatenação na mesma ordem do original,
então o site continua funcionando igual.

Backups do original estão em: backup/
