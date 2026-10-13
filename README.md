# brayanvera.com

Sitio personal y landings de Hilbert, Productity y Zapper, en español, inglés y alemán.

## Cómo editar

Todo el texto vive en `site/content/`, con los tres idiomas juntos:

```toml
[hero.title]
es = "Información cuántica…"
en = "Quantum information…"
de = "Quanteninformation…"
```

| Quiero cambiar… | Archivo |
|---|---|
| Portada, trayectoria, IA, software | `site/content/home.toml` |
| Menú, pie de página, textos comunes | `site/content/common.toml` |
| Índice de notas y fragmentos | `site/content/notes.toml` |
| Un ensayo | `site/content/essays/<nombre>.toml` |
| Una landing | `site/content/hilbert.toml`, `productity.toml`, `zapper.toml` |
| Rutas e idiomas | `site/config.toml` |
| Diseño (HTML) | `site/templates/` |
| CSS, JS, imágenes | `site/static/assets/` |

**Nuevo ensayo:** copia un archivo de `site/content/essays/`, cambia `slug`, `date`, `order` y los textos. Aparece solo en la portada y en Notas.

Si un texto no tiene traducción, se usa el español y el build lo avisa.

## Ver los cambios en local

```bash
python3 build.py --serve
```

Abre http://localhost:8765. Se reconstruye solo al recargar.

## Publicar

```bash
git add -A && git commit -m "Actualiza el sitio" && git push
```

GitHub Actions construye el sitio y lo publica en GitHub Pages en un par de minutos.
