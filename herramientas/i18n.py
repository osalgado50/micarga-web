#!/usr/bin/env python3
"""
Genera las versiones en catalán e inglés de micarga.es.

POR QUÉ UN GENERADOR Y NO TRES COPIAS A MANO
La web son 20 páginas. En tres idiomas serían 60 archivos, y cada vez que
cambie una frase —un precio, un plazo legal, el nombre de un botón— habría que
acordarse de tocar los tres. Eso no se sostiene: el día que se olvide uno, la
web empieza a decir cosas distintas según el idioma, y lo peor es que nadie se
entera hasta que lo ve un cliente.

Aquí el castellano es el ORIGINAL y lo único que se edita. El catalán y el
inglés son dos diccionarios de «frase en castellano → frase traducida», y estas
páginas se vuelven a generar enteras cada vez. Si se toca una frase del
original y no está traducida, el generador lo dice en voz alta.

    python3 herramientas/i18n.py extraer     # saca las frases a traducir
    python3 herramientas/i18n.py generar     # escribe /ca y /en
    python3 herramientas/i18n.py comprobar   # ¿qué falta por traducir?

QUÉ SE TRADUCE Y QUÉ NO
Se traduce el texto que ve una persona: los nodos de texto del HTML y unos
pocos atributos (`alt`, `title`, `placeholder`, `aria-label`, `content` de las
metaetiquetas). NO se tocan los comentarios del HTML —son notas para quien
mantiene esto, y traducirlas solo serviría para tener tres versiones de la misma
explicación—, ni el JavaScript, ni los nombres de clase.
"""

import html
import json
import os
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
IDIOMAS = ("ca", "en")

# Las páginas del sitio, relativas a la raíz. El orden manda en el sitemap.
PAGINAS = [
    "index.html", "suscripcion.html", "presupuesto.html", "gracias.html",
    "borrar-cuenta.html", "aviso-legal.html", "privacidad.html",
    "terminos.html", "cookies.html", "404.html",
    "blog/index.html",
] + sorted(
    f"blog/{p.name}" for p in (RAIZ / "blog").glob("*.html") if p.name != "index.html"
)

# Atributos cuyo valor lee una persona. `content` solo en las metaetiquetas que
# describen la página; el resto de `content` (theme-color, og:type…) son datos.
ATRIBUTOS = ("alt", "title", "placeholder", "aria-label")
METAS_TRADUCIBLES = ("description", "og:title", "og:description", "twitter:title",
                     "twitter:description", "og:image:alt")

# Zonas del HTML donde no se traduce nada.
INTOCABLES = re.compile(r"<(script|style)\b.*?</\1>", re.I | re.S)
COMENTARIOS = re.compile(r"<!--.*?-->", re.S)

# Una cadena que no merece traducción: números, símbolos, correos, URLs, y las
# palabras que son iguales en los tres idiomas (marcas, siglas).
IGUAL_EN_TODOS = {
    "Mi", "Carga", "Mi Carga", "ADR", "DeCA", "CMR", "ROTT", "PDF", "QR", "PayPal",
    "WhatsApp", "Instagram", "Facebook", "Android", "iPhone", "Blog", "Stripe",
    "RESITECH 2021, S.L.U.", "micarga.es", "soporte@micarga.es",
    # Las etiquetas del propio selector de idioma. El nombre de un idioma se
    # escribe en ese idioma, en las tres versiones: quien busca el catalán
    # busca «Català», no «Catalán» ni «Catalan».
    "ES", "CA", "EN", "Castellano", "Català", "English",
}
SIN_LETRAS = re.compile(r"^[^\wáéíóúàèìòùïüçñÁÉÍÓÚÀÈÌÒÙÏÜÇÑ]*$")


def _traducible(texto: str) -> bool:
    t = texto.strip()
    if not t or t in IGUAL_EN_TODOS or SIN_LETRAS.match(t):
        return False
    if t.startswith(("http://", "https://", "mailto:", "#", "{{")):
        return False
    # «+34 744 716 449», «10 €/mes», «2026»: cifras y símbolos, nada que traducir.
    return bool(re.search(r"[a-zA-ZáéíóúàèìòùïüçñÁÉÍÓÚÀÈÌÒÙÏÜÇÑ]{2,}", t))


def _trozos_intocables(texto: str):
    """Devuelve (texto con huecos, lista de trozos) para no tocar scripts ni comentarios."""
    guardados = []

    def guardar(m):
        guardados.append(m.group(0))
        return f"\x00{len(guardados) - 1}\x00"

    texto = INTOCABLES.sub(guardar, texto)
    texto = COMENTARIOS.sub(guardar, texto)
    return texto, guardados


def _devolver_intocables(texto: str, guardados) -> str:
    return re.sub(r"\x00(\d+)\x00", lambda m: guardados[int(m.group(1))], texto)


def cadenas(ruta: Path) -> list:
    """Todas las frases traducibles de una página, en orden de aparición."""
    crudo = ruta.read_text(encoding="utf-8")
    cuerpo, _ = _trozos_intocables(crudo)
    encontradas = []

    # Texto entre etiquetas.
    for m in re.finditer(r">([^<>\x00]+)<", cuerpo):
        t = m.group(1).strip()
        if _traducible(t):
            encontradas.append(html.unescape(t))

    # Atributos que lee una persona.
    for attr in ATRIBUTOS:
        for m in re.finditer(rf'{attr}="([^"]*)"', cuerpo):
            t = m.group(1).strip()
            if _traducible(t):
                encontradas.append(html.unescape(t))

    # Metaetiquetas de descripción y de redes sociales.
    for m in re.finditer(r"<meta\s+[^>]*>", cuerpo, re.I):
        etiqueta = m.group(0)
        clave = re.search(r'(?:name|property)="([^"]+)"', etiqueta)
        valor = re.search(r'content="([^"]*)"', etiqueta)
        if clave and valor and clave.group(1) in METAS_TRADUCIBLES:
            t = valor.group(1).strip()
            if _traducible(t):
                encontradas.append(html.unescape(t))

    # Sin duplicados pero conservando el orden.
    vistas, unicas = set(), []
    for t in encontradas:
        if t not in vistas:
            vistas.add(t)
            unicas.append(t)
    return unicas


def todas_las_cadenas() -> list:
    vistas, todas = set(), []
    for pagina in PAGINAS:
        for t in cadenas(RAIZ / pagina):
            if t not in vistas:
                vistas.add(t)
                todas.append(t)
    return todas


def diccionario(idioma: str) -> dict:
    f = RAIZ / "traducciones" / f"{idioma}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def cmd_extraer():
    todas = todas_las_cadenas()
    print(f"{len(todas)} frases distintas en {len(PAGINAS)} páginas")
    for idioma in IDIOMAS:
        d = diccionario(idioma)
        faltan = [t for t in todas if t not in d]
        destino = RAIZ / "traducciones" / f"{idioma}.pendiente.json"
        destino.write_text(
            json.dumps({t: "" for t in faltan}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"  {idioma}: {len(d)} traducidas, {len(faltan)} pendientes → {destino.name}")


def cmd_comprobar():
    todas = todas_las_cadenas()
    fallos = 0
    for idioma in IDIOMAS:
        d = diccionario(idioma)
        faltan = [t for t in todas if not d.get(t)]
        print(f"{idioma}: faltan {len(faltan)} de {len(todas)}")
        for t in faltan[:10]:
            print(f"    · {t[:90]}")
        fallos += len(faltan)
    # Frases en el diccionario que ya no están en el original: sobran y hay que
    # quitarlas, o son una frase que se editó y se quedó la traducción vieja.
    juego = set(todas)
    for idioma in IDIOMAS:
        sobran = [t for t in diccionario(idioma) if t not in juego]
        if sobran:
            print(f"{idioma}: {len(sobran)} traducciones que ya no se usan")
            for t in sobran[:5]:
                print(f"    · {t[:90]}")
    return 1 if fallos else 0


# ---------------------------------------------------------------------------
# Generación de /ca y /en
# ---------------------------------------------------------------------------

DOMINIO = "https://micarga.es"

NOMBRE_IDIOMA = {"es": "Castellano", "ca": "Català", "en": "English"}
ETIQUETA_IDIOMA = {"es": "ES", "ca": "CA", "en": "EN"}
LOCALE_OG = {"es": "es_ES", "ca": "ca_ES", "en": "en_GB"}

# Las URL NO se traducen: /ca/suscripcion, no /ca/subscripcio. Traducir los
# slugs daría una miaja de SEO más, pero a cambio cada enlace interno, cada
# redirección y el propio selector de idioma tendrían que consultar una tabla
# de equivalencias, y el día que una traducción falte se rompe el enlace en vez
# de quedarse en castellano. Con el prefijo, cambiar de idioma es cambiar tres
# letras de la ruta, y eso vale para cualquier página, presente o futura.

def url_de(pagina: str, idioma: str) -> str:
    """URL pública y limpia de una página en un idioma."""
    ruta = pagina[:-len(".html")] if pagina.endswith(".html") else pagina
    if ruta == "index":
        ruta = ""
    elif ruta.endswith("/index"):
        ruta = ruta[:-len("index")]
    prefijo = "" if idioma == "es" else f"/{idioma}"
    return f"{DOMINIO}{prefijo}/{ruta}"


def bloque_alternativas(pagina: str) -> str:
    """Las etiquetas hreflang: «esta misma página, en los otros idiomas».

    Sin esto, Google trata las tres versiones como páginas distintas que dicen
    lo mismo y se las come entre ellas. Con esto sabe que son la misma y le
    enseña a cada uno la suya. `x-default` apunta al castellano: es el idioma
    del mercado y el original del que salen los otros dos.
    """
    lineas = [f'  <link rel="alternate" hreflang="{i}" href="{url_de(pagina, i)}">'
              for i in ("es", "ca", "en")]
    lineas.append(f'  <link rel="alternate" hreflang="x-default" href="{url_de(pagina, "es")}">')
    return "\n".join(lineas)


def bloque_idiomas(pagina: str, actual: str) -> str:
    """El selector de idioma de la barra de navegación.

    Son enlaces de verdad, no un desplegable con JavaScript: así los sigue
    Google y funcionan con el botón del medio, con el teclado y sin scripts.
    """
    enlaces = []
    for i in ("es", "ca", "en"):
        activo = ' aria-current="page"' if i == actual else ""
        enlaces.append(
            f'          <a href="{url_de(pagina, i)}" hreflang="{i}" lang="{i}"'
            f' title="{NOMBRE_IDIOMA[i]}"{activo}>{ETIQUETA_IDIOMA[i]}</a>'
        )
    dentro = "\n".join(enlaces)
    return (f'      <div class="selector-idioma" role="group" aria-label="Idioma">\n'
            f'{dentro}\n      </div>')


def _entre_marcas(texto: str, marca: str, contenido: str) -> str:
    patron = re.compile(f"<!-- {marca}:inicio -->.*?<!-- {marca}:fin -->", re.S)
    assert patron.search(texto), f"falta el hueco {marca}"
    return patron.sub(f"<!-- {marca}:inicio -->\n{contenido}\n      <!-- {marca}:fin -->"
                      if marca == "IDIOMAS" else
                      f"<!-- {marca}:inicio -->\n{contenido}\n  <!-- {marca}:fin -->",
                      texto, count=1)


# Rutas de archivos que, desde /ca/ o /en/, hay que dejar absolutas. Un
# `src="images/x.webp"` dentro de /ca/index.html pide /ca/images/x.webp, que no
# existe: la imagen desaparece sin dar ningún error en pantalla.
# Ojo con el `?v=`: los .css y .js de esta web llevan el número de versión en
# la URL para saltarse la caché. Sin contemplarlo aquí, la hoja de estilos se
# quedaba relativa y /ca/ pedía /ca/styles.css, que no existe: la página salía
# sin un solo estilo y sin dar ningún error visible.
ARCHIVOS = re.compile(
    r'(src|href|poster)="(?:\.\./)*((?:images|videos)/[^"]+|[\w.-]+\.(?:css|js|png|jpg|jpeg|webp|ico|mp4|xml|txt)(?:\?[^"]*)?)"'
)


def _rutas_absolutas(texto: str) -> str:
    return ARCHIVOS.sub(lambda m: f'{m.group(1)}="/{m.group(2)}"', texto)



# Enlaces internos que empiezan por «/»: hay que meterles el idioma delante o
# el catalán acaba mandando al castellano en cuanto alguien pulsa «Inicio».
# Los que NO se tocan son los archivos —/styles.css, /images/…— que viven en la
# raíz y son los mismos para los tres idiomas.
ENLACES_RAIZ = re.compile(r'href="/(?!/)([^"]*)"')
EXTENSIONES = re.compile(r'\.(css|js|png|jpg|jpeg|webp|ico|mp4|xml|txt|pdf)$')


def _enlaces_con_idioma(texto: str, idioma: str) -> str:
    def arreglar(m):
        resto = m.group(1)
        primero = resto.split("#")[0].split("?")[0]
        if primero.startswith(("images/", "videos/")) or EXTENSIONES.search(primero):
            return m.group(0)
        return f'href="/{idioma}/{resto}"'
    return ENLACES_RAIZ.sub(arreglar, texto)


def traducir_html(crudo: str, dicc: dict, faltan: set) -> str:
    """Cambia las frases del castellano por las del diccionario."""
    cuerpo, guardados = _trozos_intocables(crudo)

    def cambia(t: str) -> str:
        clave = t.strip()
        if not _traducible(clave):
            return t
        traducida = dicc.get(clave)
        if not traducida:
            faltan.add(clave)
            return t
        # Se conservan los espacios y saltos de línea que rodeaban al texto:
        # quitarlos junta palabras con la etiqueta de al lado.
        izq = t[:len(t) - len(t.lstrip())]
        der = t[len(t.rstrip()):]
        return izq + html.escape(traducida, quote=False) + der

    cuerpo = re.sub(r">([^<>\x00]+)<", lambda m: ">" + cambia(m.group(1)) + "<", cuerpo)

    for attr in ATRIBUTOS:
        cuerpo = re.sub(rf'{attr}="([^"]*)"',
                        lambda m: f'{attr}="{html.escape(cambia(m.group(1)), quote=True)}"',
                        cuerpo)

    def meta(m):
        etiqueta = m.group(0)
        clave = re.search(r'(?:name|property)="([^"]+)"', etiqueta)
        if not clave or clave.group(1) not in METAS_TRADUCIBLES:
            return etiqueta
        return re.sub(r'content="([^"]*)"',
                      lambda c: f'content="{html.escape(cambia(c.group(1)), quote=True)}"',
                      etiqueta)

    cuerpo = re.sub(r"<meta\s+[^>]*>", meta, cuerpo, flags=re.I)
    return _devolver_intocables(cuerpo, guardados)


def cmd_generar():
    faltan_por_idioma = {}

    # El castellano no se genera —es el original— pero sí se le refrescan el
    # selector de idioma y las etiquetas hreflang, que dependen de la ruta.
    for pagina in PAGINAS:
        ruta = RAIZ / pagina
        s = ruta.read_text(encoding="utf-8")
        s = _entre_marcas(s, "ALTERNATIVAS", bloque_alternativas(pagina))
        s = _entre_marcas(s, "IDIOMAS", bloque_idiomas(pagina, "es"))
        ruta.write_text(s, encoding="utf-8")

    for idioma in IDIOMAS:
        dicc = diccionario(idioma)
        faltan = set()
        for pagina in PAGINAS:
            crudo = (RAIZ / pagina).read_text(encoding="utf-8")
            s = traducir_html(crudo, dicc, faltan)
            s = _rutas_absolutas(s)
            s = _enlaces_con_idioma(s, idioma)
            s = s.replace('<html lang="es">', f'<html lang="{idioma}">', 1)
            s = s.replace('content="es_ES"', f'content="{LOCALE_OG[idioma]}"')
            # El canónico de cada idioma apunta a SÍ MISMO. Si apuntara al
            # castellano, le estaríamos diciendo a Google que las versiones
            # traducidas no son páginas, y no saldrían nunca.
            s = re.sub(r'<link rel="canonical" href="[^"]*">',
                       f'<link rel="canonical" href="{url_de(pagina, idioma)}">', s, count=1)
            s = re.sub(r'<meta property="og:url" content="[^"]*">',
                       f'<meta property="og:url" content="{url_de(pagina, idioma)}">', s, count=1)
            s = _entre_marcas(s, "IDIOMAS", bloque_idiomas(pagina, idioma))

            destino = RAIZ / idioma / pagina
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(s, encoding="utf-8")
        faltan_por_idioma[idioma] = faltan
        print(f"{idioma}: {len(PAGINAS)} páginas escritas, {len(faltan)} frases sin traducir")
    return faltan_por_idioma


# Páginas que NO van al sitemap porque llevan `noindex`: pedirle a Google que
# las rastree y a la vez decirle que no las indexe es darle instrucciones
# contradictorias, y de esos avisos se queja en Search Console.
FUERA_DEL_SITEMAP = {"gracias.html", "404.html"}

# Cuánto vale cada página para quien busca. La portada lo primero; el blog es
# lo que trae visitas nuevas; los textos legales están porque tienen que estar.
PRIORIDAD = {"index.html": "1.0", "blog/index.html": "0.9", "suscripcion.html": "0.8",
             "presupuesto.html": "0.7", "borrar-cuenta.html": "0.3"}
PRIORIDAD_LEGAL = "0.2"
LEGALES = {"aviso-legal.html", "privacidad.html", "terminos.html", "cookies.html"}


def cmd_sitemap():
    """Un solo sitemap con los tres idiomas y sus equivalencias.

    Cada URL lleva dentro los `xhtml:link` que apuntan a sus hermanas. Es la
    forma que recomienda Google de declarar idiomas: así se entera de las tres
    versiones aunque solo rastree una, y no se arriesga a tratarlas como
    contenido duplicado.
    """
    from datetime import date
    hoy = date.today().isoformat()
    filas = []
    for pagina in PAGINAS:
        if pagina in FUERA_DEL_SITEMAP:
            continue
        prioridad = PRIORIDAD.get(pagina, PRIORIDAD_LEGAL if pagina in LEGALES else "0.6")
        frecuencia = "weekly" if pagina in ("index.html", "blog/index.html") else "monthly"
        alternativas = "\n".join(
            f'    <xhtml:link rel="alternate" hreflang="{i}" href="{url_de(pagina, i)}"/>'
            for i in ("es", "ca", "en")
        )
        alternativas += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{url_de(pagina, "es")}"/>'
        for idioma in ("es",) + IDIOMAS:
            filas.append(
                f"  <url>\n"
                f"    <loc>{url_de(pagina, idioma)}</loc>\n"
                f"{alternativas}\n"
                f"    <lastmod>{hoy}</lastmod>\n"
                f"    <changefreq>{frecuencia}</changefreq>\n"
                f"    <priority>{prioridad}</priority>\n"
                f"  </url>"
            )
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
           '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
           + "\n".join(filas) + "\n</urlset>\n")
    (RAIZ / "sitemap.xml").write_text(xml, encoding="utf-8")
    print(f"sitemap.xml: {len(filas)} URL")


if __name__ == "__main__":
    orden = sys.argv[1] if len(sys.argv) > 1 else "comprobar"
    if orden == "extraer":
        cmd_extraer()
    elif orden == "generar":
        cmd_generar()
    elif orden == "sitemap":
        cmd_sitemap()
    elif orden == "comprobar":
        sys.exit(cmd_comprobar())
    else:
        print(__doc__)
        sys.exit(2)
