#!/usr/bin/env python3
"""
Los iconos de Font Awesome de la web, servidos desde aquí y solo los que se usan.

POR QUÉ
Cada una de las 257 páginas cargaba Font Awesome 6.4.0 ENTERO desde cdnjs:
una hoja de 100 KB que bloquea el pintado, servida por un tercero y sin
integridad, más dos fuentes de unos 270 KB, para 45 iconos (auditoría
02-10-2026, REN-12 y SEG-53). Ahora la hoja y las fuentes viven en
vendor/fontawesome/ y llevan solo esos iconos: unos pocos KB en total.

    python3 herramientas/iconos.py comprobar
        ¿Hay algún icono en las páginas o los scripts que no esté en la hoja?
        No necesita nada instalado. 🚨 Pasarlo al añadir un icono: uno que
        falte se ve como un hueco en blanco, sin ningún error.

    python3 herramientas/iconos.py generar <carpeta del paquete>
        Rehace la hoja y las fuentes con los iconos que se usan hoy. Necesita
        el paquete de Font Awesome y fonttools, fuera del repositorio:
            npm pack @fortawesome/fontawesome-free@6.4.0 && tar xzf fortawesome-*.tgz
            pip install fonttools brotli
            python3 herramientas/iconos.py generar ./package
        Después, subir el ?v= de la hoja en las páginas (el nombre de las
        fuentes lleva una huella, así que esas cambian solas).

Licencias de Font Awesome Free: iconos CC BY 4.0, fuentes SIL OFL 1.1,
código MIT. Se citan en la cabecera de la hoja generada.
"""

import hashlib
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "vendor" / "fontawesome"
HOJA = DESTINO / "iconos.css"

# Clases de Font Awesome que NO son iconos: estilos y utilidades.
NO_ICONOS = {"fa-solid", "fa-brands", "fa-regular", "fa-classic"}

# Iconos que solo pone el JavaScript con classList (el menú del móvil cambia
# las tres rayas por la equis). Se buscan también en los .js, pero se dejan
# escritos para que nadie los quite por no verlos en el HTML.
DEL_JAVASCRIPT = {"fa-xmark", "fa-bars"}


def ficheros_fuente():
    for ruta in RAIZ.rglob("*"):
        partes = ruta.relative_to(RAIZ).parts
        if partes and partes[0] in (".git", "vendor", "herramientas", "node_modules"):
            continue
        if ruta.suffix in (".html", ".js") and ruta.is_file():
            yield ruta


def iconos_usados() -> dict:
    """{icono: 'solid' | 'brands'} según la clase de estilo que lo acompaña."""
    usados = {}
    for ruta in ficheros_fuente():
        texto = ruta.read_text(encoding="utf-8", errors="ignore")
        # En HTML, el estilo va en la misma clase: class="fa-brands fa-whatsapp".
        for clases in re.findall(r'class="([^"]*\bfa-[^"]*)"', texto):
            nombres = clases.split()
            estilo = "brands" if "fa-brands" in nombres else "solid"
            for n in nombres:
                if n.startswith("fa-") and n not in NO_ICONOS:
                    usados.setdefault(n, estilo)
        # En JS, cualquier 'fa-…' entre comillas (siempre sólidos hoy).
        if ruta.suffix == ".js":
            for n in re.findall(r"['\"`](fa-[a-z0-9-]+)['\"`]", texto):
                if n not in NO_ICONOS:
                    usados.setdefault(n, "solid")
    for n in DEL_JAVASCRIPT:
        usados.setdefault(n, "solid")
    return usados


def codigos_de_las_hojas() -> set:
    """
    Los iconos que las hojas de estilo pintan por su cuenta, con `content:`.

    styles.css dibuja algunos (la marca de las listas, la flecha de los
    desplegables) con la fuente de Font Awesome y un código, sin ninguna clase
    `fa-`. Si la fuente recortada no los trae, salen en blanco.
    """
    codigos = set()
    for ruta in RAIZ.rglob("*.css"):
        partes = ruta.relative_to(RAIZ).parts
        if partes and partes[0] in (".git", "vendor", "node_modules"):
            continue
        for cuerpo in re.findall(r"\{([^}]*)\}", ruta.read_text(encoding="utf-8")):
            if "Font Awesome 6 Free" in cuerpo:
                codigos.update(re.findall(r'content:\s*"\\([0-9a-f]+)"', cuerpo))
    return codigos


def codigos_de_la_hoja() -> set:
    if not HOJA.exists():
        return set()
    m = re.search(r"/\* códigos desde CSS: ([0-9a-f, ]*) \*/", HOJA.read_text(encoding="utf-8"))
    return {c.strip() for c in m.group(1).split(",") if c.strip()} if m else set()


def iconos_de_la_hoja() -> set:
    if not HOJA.exists():
        return set()
    return set(re.findall(r"\.(fa-[a-z0-9-]+)::before", HOJA.read_text(encoding="utf-8")))


def cmd_comprobar() -> int:
    usados = iconos_usados()
    hay = iconos_de_la_hoja()
    faltan = sorted(set(usados) - hay)
    sobran = sorted(hay - set(usados))
    print(f"{len(usados)} iconos en uso, {len(hay)} en la hoja.")
    if sobran:
        print("En la hoja sin usar (no hacen daño): " + ", ".join(sobran))
    faltan_css = sorted(codigos_de_las_hojas() - codigos_de_la_hoja())
    if faltan_css:
        print("🚨 FALTAN en la fuente los códigos que usa el CSS: " + ", ".join(faltan_css))
    if faltan or faltan_css:
        if faltan:
            print("🚨 FALTAN en la hoja (se verían en blanco): " + ", ".join(faltan))
        print("   Regenera: python3 herramientas/iconos.py generar <paquete>")
        return 1
    return 0


def _codigos(css_completo: str) -> dict:
    """{icono: código} sacado del all.css del paquete, alias incluidos."""
    codigos = {}
    for selectores, codigo in re.findall(
            r"((?:\.fa-[a-z0-9-]+::?before,?\s*)+)\{\s*content:\s*\"\\\\?([0-9a-f]+)\"", css_completo):
        # Los sólidos van con `::before` y las marcas con `:before`.
        for n in re.findall(r"\.(fa-[a-z0-9-]+)::?before", selectores):
            codigos[n] = codigo
    return codigos


def cmd_generar(paquete: Path) -> int:
    from fontTools import subset  # solo aquí: comprobar no necesita nada instalado

    css = (paquete / "css" / "all.css").read_text(encoding="utf-8")
    codigos = _codigos(css)
    usados = iconos_usados()
    desconocidos = sorted(n for n in usados if n not in codigos)
    if desconocidos:
        print("🚨 No existen en Font Awesome 6.4.0: " + ", ".join(desconocidos))
        return 1

    DESTINO.mkdir(parents=True, exist_ok=True)
    for viejo in DESTINO.glob("*.woff2"):
        viejo.unlink()

    fuentes = {}
    for estilo, origen in (("solid", "fa-solid-900"), ("brands", "fa-brands-400")):
        puntos = {int(codigos[n], 16) for n, e in usados.items() if e == estilo}
        if estilo == "solid":
            puntos |= {int(c, 16) for c in codigos_de_las_hojas()}
        puntos = sorted(puntos)
        if not puntos:
            continue
        temporal = DESTINO / f"{origen}.tmp.woff2"
        subset.main([
            str(paquete / "webfonts" / f"{origen}.ttf"),
            "--unicodes=" + ",".join(f"U+{p:04X}" for p in puntos),
            "--flavor=woff2", "--layout-features=*", "--no-hinting",
            f"--output-file={temporal}",
        ])
        huella = hashlib.sha256(temporal.read_bytes()).hexdigest()[:10]
        final = DESTINO / f"{origen}-{huella}.woff2"
        temporal.rename(final)
        fuentes[estilo] = final.name

    lineas = [
        "/*!",
        " * Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com",
        " * License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License)",
        " * Copyright 2023 Fonticons, Inc.",
        " *",
        " * Recorte para micarga.es: solo los iconos que usa la web. NO SE EDITA A MANO:",
        " * se genera con `python3 herramientas/iconos.py generar` (ver allí).",
        " */",
        "/* códigos desde CSS: " + ", ".join(sorted(codigos_de_las_hojas())) + " */",
        ".fa-solid,.fa-brands{-moz-osx-font-smoothing:grayscale;-webkit-font-smoothing:antialiased;"
        "display:var(--fa-display,inline-block);font-style:normal;font-variant:normal;line-height:1;text-rendering:auto}",
    ]
    if "solid" in fuentes:
        lineas += [
            "@font-face{font-family:'Font Awesome 6 Free';font-style:normal;font-weight:900;font-display:block;"
            f"src:url(\"{fuentes['solid']}\") format(\"woff2\")}}",
            ".fa-solid{font-family:'Font Awesome 6 Free';font-weight:900}",
        ]
    if "brands" in fuentes:
        lineas += [
            "@font-face{font-family:'Font Awesome 6 Brands';font-style:normal;font-weight:400;font-display:block;"
            f"src:url(\"{fuentes['brands']}\") format(\"woff2\")}}",
            ".fa-brands{font-family:'Font Awesome 6 Brands';font-weight:400}",
        ]
    for n in sorted(usados):
        lineas.append(f'.{n}::before{{content:"\\{codigos[n]}"}}')
    HOJA.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(f"{HOJA.relative_to(RAIZ)}: {len(usados)} iconos; fuentes: {', '.join(fuentes.values())}")
    return 0


if __name__ == "__main__":
    orden = sys.argv[1] if len(sys.argv) > 1 else "comprobar"
    if orden == "comprobar":
        sys.exit(cmd_comprobar())
    if orden == "generar" and len(sys.argv) > 2:
        sys.exit(cmd_generar(Path(sys.argv[2])))
    print(__doc__)
    sys.exit(2)
