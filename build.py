#!/usr/bin/env python3
"""Genera brayanvera.com en _site/ a partir de site/.

    python3 build.py              # construye _site/
    python3 build.py --serve      # construye y sirve en http://localhost:8765,
                                  # reconstruyendo cuando cambia algo en site/

Cada texto vive en site/content/*.toml con sus tres idiomas juntos:

    [hero.title]
    es = "…"
    en = "…"
    de = "…"

Si falta un idioma se usa el español y el build lo avisa al final.
Dentro de un texto se puede enlazar a otra página con {{ url('hilbert') }}.
"""
import html
import http.server
import shutil
import sys
import tomllib
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "site"
OUT = ROOT / "_site"


def load_toml(path):
    with open(path, "rb") as f:
        return tomllib.load(f)


def build():
    config = load_toml(SRC / "config.toml")
    langs = config["languages"]
    default = config["default"]
    missing = []

    def is_translation(v):
        return isinstance(v, dict) and v and set(v) <= set(langs) and default in v

    def localize(v, lang, where):
        if is_translation(v):
            if lang not in v:
                missing.append(f"{where} → {lang}")
            return v.get(lang, v[default])
        if isinstance(v, dict):
            return {k: localize(x, lang, f"{where}.{k}") for k, x in v.items()}
        if isinstance(v, list):
            return [localize(x, lang, f"{where}[{i}]") for i, x in enumerate(v)]
        return v

    env = Environment(loader=FileSystemLoader(SRC / "templates"), undefined=StrictUndefined,
                      autoescape=False, trim_blocks=True, lstrip_blocks=True)
    env.filters["attr"] = lambda s: html.escape(str(s), quote=True)

    # Páginas: las fijas de config.toml y una por cada ensayo.
    pages = {pid: dict(p) for pid, p in config["pages"].items()}
    essays = []
    for f in sorted((SRC / "content" / "essays").glob("*.toml")):
        data = load_toml(f)
        pid = "essay:" + f.stem
        paths = {l: config["pages"]["notes"][l] + data["slug"][l] + "/" for l in langs}
        pages[pid] = {"template": "essay.html", "content": f"essays/{f.stem}", **paths}
        essays.append({"id": pid, "data": data})
    essays.sort(key=lambda e: e["data"].get("order", 99))

    common = load_toml(SRC / "content" / "common.toml")

    def months(lang, short=False):
        return config["months_short" if short else "months"][lang]

    def fmt_date(d, lang, short=False):
        m = months(lang, short)[d.month - 1]
        if lang == "en":
            return f"{m} {d.day}, {d.year}"
        if lang == "de":
            return f"{d.day}. {m} {d.year}"
        return f"{d.day} {m} {d.year}" if short else f"{d.day} de {m} de {d.year}"

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC / "static", OUT)

    count = 0
    for pid, page in pages.items():
        content_name = page.get("content", pid)
        raw = load_toml(SRC / "content" / f"{content_name}.toml") if content_name else {}
        for lang in langs:
            path = page[lang]
            ctx = {
                "lang": lang, "langs": langs, "default_lang": default, "config": config,
                "L": config["lang"][lang], "page_id": pid, "path": path,
                "alternates": {l: page[l] for l in langs}, "base_url": config["base_url"],
            }
            ctx["url"] = lambda target, l=lang: pages[target][l]
            ctx["date"] = lambda d, short=False, l=lang: fmt_date(d, l, short)

            def render_strings(v):
                if isinstance(v, str) and ("{{" in v or "{%" in v):
                    return env.from_string(v).render(ctx)
                if isinstance(v, dict):
                    return {k: render_strings(x) for k, x in v.items()}
                if isinstance(v, list):
                    return [render_strings(x) for x in v]
                return v

            ctx["c"] = render_strings(localize(common, lang, "common"))
            ctx["t"] = render_strings(localize(raw, lang, content_name))
            ctx["essays"] = [
                {**render_strings(localize(e["data"], lang, e["id"])), "path": pages[e["id"]][lang]}
                for e in essays
            ]
            html_out = env.get_template(page["template"]).render(ctx)
            dest = OUT / path.lstrip("/") / "index.html"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(html_out)
            count += 1

    # Una sola 404 para todo el sitio, con los tres idiomas.
    raw404 = load_toml(SRC / "content" / "404.toml")
    (OUT / "404.html").write_text(env.get_template("404.html").render(
        t={l: localize(raw404, l, "404") for l in langs}, langs=langs, default_lang=default))

    print(f"✓ {count} páginas en {OUT.relative_to(ROOT)}/")
    if missing:
        print(f"⚠ {len(missing)} textos sin traducir (se usó el español):")
        for m in missing:
            print("   ", m)
    return not missing


def serve(port=8765):
    def latest_change():
        return max(p.stat().st_mtime for p in SRC.rglob("*") if p.is_file())

    state = {"built": latest_change()}
    build()

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(OUT), **kw)

        def do_GET(self):
            changed = latest_change()
            if changed > state["built"]:
                state["built"] = changed
                try:
                    build()
                except Exception as exc:  # que un error de plantilla no tumbe el servidor
                    print("✗", exc)
            super().do_GET()

        def log_message(self, *a):
            pass

    print(f"Sirviendo en http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()


if __name__ == "__main__":
    if "--serve" in sys.argv:
        serve()
    else:
        build()
