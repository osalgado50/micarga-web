#!/usr/bin/env python3
"""
Convierte el paquete editorial de 34 artículos en entradas de blog listas para
publicar, y las deja EN COLA, no publicadas.

    python3 herramientas/blog_paquete.py preparar   # genera los borradores
    python3 herramientas/blog_paquete.py cola       # enseña la cola

POR QUÉ LOS BORRADORES NO VIVEN EN `blog/`
`herramientas/i18n.py` recoge `blog/*.html` con un comodín. Un borrador dentro
de esa carpeta se traduciría y se publicaría solo en la siguiente generación,
que es exactamente lo contrario de lo que se quiere: uno cada dos días, no los
34 de golpe. Los borradores viven en `borradores-blog/`, que no existe para
nadie, y `publicar_blog.py` los va moviendo.

🚨 ESTOS 34 SALEN SOLO EN CASTELLANO, y es una decisión deliberada.
El paquete dice traerlos en diez idiomas; comprobado el 23-09-2026, trae
**34 ficheros en castellano, 12 a medias en catalán y cero en los otros ocho**
(`paquete-editorial/content/<idioma>/` vacías, y su propio manifest.json dice
`generated_version_count: 34` de 340). Traducirlos son ~2.450 frases por ocho
idiomas, casi 20.000 cadenas, y el generador cae al castellano en cada frase
que falte: publicar a medias pondría 34 artículos castellanos bajo
`hreflang="pl"`, que para Google es contenido duplicado a gran escala sobre
TODO el dominio. Un artículo que solo existe en castellano no es contenido
duplicado: simplemente no existe en polaco. Ver SOLO_CASTELLANO en i18n.py.
"""

import csv
import datetime as dt
import html
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PAQUETE = RAIZ.parent / "Blogs MiCarga" / "paquete-editorial"
BORRADORES = RAIZ / "borradores-blog"
COLA = BORRADORES / "cola.json"
PORTADAS = RAIZ / "images" / "blog"

# Una entrada cada DOS días. Lo pidió así el propietario: «publicas uno hoy,
# mañana no, al día siguiente otro». El calendario del paquete empezaba el
# 28-09 y se recalcula desde el día en que se preparan, que es lo que se pidió.
CADA_CUANTOS_DIAS = 2

# El orden, la ruta, el grupo del índice y la foto de fondo de la portada.
#
# Las rutas se escriben A MANO y no se sacan del nombre del PDF: los del
# paquete venían con las tildes comidas —«formacin», «autobs»— porque salían
# del nombre de archivo. Una ruta es lo único de una entrada que no se puede
# cambiar después sin romper enlaces y perder el posicionamiento.
ARTICULOS = [
    # (nº, ruta, grupo, foto de fondo)
    (1,  "historia-del-transporte-en-espana",          "Historia del transporte",        "highway_truck.jpg"),
    (2,  "historia-del-camion",                        "Historia del transporte",        "truck_cabin.jpg"),
    (3,  "transporte-internacional-documentos",        "Internacional y multimodal",     "truck_loading.jpg"),
    (4,  "carta-de-porte-cmr-cuando-es-obligatoria",   "Internacional y multimodal",     "documentos.jpg"),
    (5,  "transporte-multimodal-como-funciona",        "Internacional y multimodal",     "truck_loading.jpg"),
    (6,  "transporte-maritimo-bill-of-lading",         "Internacional y multimodal",     "documentos.jpg"),
    (7,  "transporte-aereo-carta-de-porte-awb",        "Internacional y multimodal",     "documentos.jpg"),
    (8,  "futuro-transporte-terrestre-mercancias",     "El transporte que viene",        "highway_truck.jpg"),
    (9,  "transporte-sostenible-descarbonizacion",     "El transporte que viene",        "highway_truck.jpg"),
    (10, "futuro-movilidad-transporte-europeo",        "El transporte que viene",        "truck_loading.jpg"),
    (11, "camion-electrico-espana-recarga",            "El transporte que viene",        "truck_cabin.jpg"),
    (12, "montar-empresa-de-transporte-requisitos",    "Montar y llevar la empresa",     "truck_loading.jpg"),
    (13, "autonomo-transporte-mercancias-2026",        "Montar y llevar la empresa",     "conductora.webp"),
    (14, "titulo-de-transportista-como-obtenerlo",     "Montar y llevar la empresa",     "documentos.jpg"),
    (15, "asociacion-de-transportistas-ventajas",      "Montar y llevar la empresa",     "truck_loading.jpg"),
    (16, "convenio-transporte-jornada-descansos",      "Montar y llevar la empresa",     "truck_cabin.jpg"),
    (17, "formacion-cap-mercancias-reciclaje",         "Montar y llevar la empresa",     "conductora.webp"),
    (18, "cap-viajeros-autobus-autocar",               "Montar y llevar la empresa",     "conductora.webp"),
    (19, "cabotaje-transporte-carretera-limites",      "Internacional y multimodal",     "officer_check.jpg"),
    (20, "normativa-megatrailer-autorizacion",         "Cargas y permisos especiales",   "highway_truck.jpg"),
    (21, "transporte-especial-autorizaciones",         "Cargas y permisos especiales",   "truck_loading.jpg"),
    (22, "transporte-en-frio-atp-2026",                "Cargas y permisos especiales",   "truck_loading.jpg"),
    (23, "transporte-en-cisterna-inspecciones",        "Cargas y permisos especiales",   "adr-placas.webp"),
    (24, "cisterna-adr-ampliacion-permiso",            "Mercancías peligrosas (ADR)",    "adr-placas.webp"),
    (25, "consejero-de-seguridad-adr-obligacion",      "Mercancías peligrosas (ADR)",    "adr-placas.webp"),
    (26, "obligaciones-consejero-seguridad-adr",       "Mercancías peligrosas (ADR)",    "documentos.jpg"),
    (27, "reciclaje-adr-renovar-certificado",          "Mercancías peligrosas (ADR)",    "conductora.webp"),
    (28, "rimp-adr-itinerarios-mercancias-peligrosas", "Mercancías peligrosas (ADR)",    "highway_truck.jpg"),
    (29, "estiba-norma-en-12195",                      "Tacógrafo y estiba",             "truck_loading.jpg"),
    (30, "sanciones-por-estiba-inmovilizacion",        "Tacógrafo y estiba",             "officer_check.jpg"),
    (31, "sanciones-mas-comunes-transporte",           "Sanciones y controles",          "officer_check.jpg"),
    (32, "multas-tacografo-2026",                      "Sanciones y controles",          "truck_cabin.jpg"),
    (33, "sanciones-adr-2026",                         "Sanciones y controles",          "adr-placas.webp"),
    (34, "sanciones-deca-2026",                        "Sanciones y controles",          "control_digital.webp"),
]

# Las frases que en el PDF eran un botón naranja y aquí llegan como un párrafo
# suelto. No se borran: se convierten en el bloque de llamada a la acción del
# final. Dejarlas como párrafo deja frases huérfanas en mitad del texto.
LLAMADAS = re.compile(
    r"^(genera tus|empieza ahora|prueba|crea tu|empieza gratis|descubre|hazlo)\b",
    re.I,
)


def limpiar(texto: str) -> str:
    """Deshace los cortes de palabra del PDF: «multimodali- dad» → «multimodalidad»."""
    return re.sub(r"(\w)- (\w)", r"\1\2", texto)


def frontmatter(crudo: str):
    if not crudo.startswith("---"):
        return {}, crudo
    fin = crudo.index("\n---", 3)
    cabecera = {}
    for linea in crudo[3:fin].splitlines():
        m = re.match(r'^(\w+):\s*"?([^"]*)"?\s*$', linea)
        if m:
            cabecera[m.group(1)] = m.group(2)
    return cabecera, crudo[fin + 4:]


def a_html(cuerpo: str):
    """
    Markdown muy justito a HTML. No hace falta una librería: el paquete solo
    usa títulos, párrafos y listas, y una dependencia nueva para esto sería
    pagar mantenimiento por seis expresiones regulares.

    Devuelve (html, resumen, llamadas) — el resumen es el primer párrafo, que
    es lo que va en la metaetiqueta y en la tarjeta del índice.
    """
    partes, lista, resumen, llamadas = [], [], "", []

    def cerrar_lista():
        if lista:
            partes.append("      <ul>\n" + "\n".join(lista) + "\n      </ul>")
            lista.clear()

    for bruto in cuerpo.split("\n"):
        linea = limpiar(bruto.strip())
        if not linea:
            cerrar_lista()
            continue
        if linea.startswith("# "):
            continue  # El título ya va en el <h1> de la cabecera.
        if linea.startswith("## "):
            cerrar_lista()
            partes.append(f"      <h2>{html.escape(linea[3:].strip())}</h2>")
            continue
        if linea.startswith("### "):
            cerrar_lista()
            partes.append(f"      <h3>{html.escape(linea[4:].strip())}</h3>")
            continue
        if linea.startswith("- "):
            lista.append(f"        <li>{html.escape(linea[2:].strip())}</li>")
            continue
        cerrar_lista()
        if LLAMADAS.match(linea):
            llamadas.append(linea)
            continue
        if not resumen:
            # El primer párrafo se convierte en la entradilla que va bajo el
            # titular, y NO se repite en el cuerpo: salía dos veces seguidas,
            # una debajo de la otra, que es de las cosas que más cantan.
            resumen = linea
            continue
        partes.append(f"      <p>{html.escape(linea)}</p>")

    cerrar_lista()
    return "\n".join(partes), resumen, llamadas


def portada(ruta_salida: Path, titulo: str, grupo: str, foto: Path):
    """
    La imagen de portada: la foto de fondo oscurecida y el titular encima, en
    la tipografía y el naranja de la marca.

    Se genera una por artículo en vez de repetir las seis fotos del sitio: en
    el índice, treinta y cuatro tarjetas con seis fotos repetidas se leen como
    relleno.
    """
    from PIL import Image, ImageDraw, ImageEnhance, ImageFont

    ANCHO, ALTO = 1200, 675
    NARANJA = (249, 115, 22)

    fondo = Image.open(foto).convert("RGB")
    # Recorte centrado a 16:9 sin deformar.
    prop = ANCHO / ALTO
    w, h = fondo.size
    if w / h > prop:
        nuevo = int(h * prop)
        fondo = fondo.crop(((w - nuevo) // 2, 0, (w - nuevo) // 2 + nuevo, h))
    else:
        nuevo = int(w / prop)
        fondo = fondo.crop((0, (h - nuevo) // 2, w, (h - nuevo) // 2 + nuevo))
    fondo = fondo.resize((ANCHO, ALTO), Image.LANCZOS)
    fondo = ImageEnhance.Brightness(fondo).enhance(0.38)
    fondo = ImageEnhance.Color(fondo).enhance(0.55)

    # Un velo oscuro de abajo arriba para que el texto se lea siempre, caiga
    # sobre lo que caiga de la foto.
    velo = Image.new("L", (1, ALTO))
    for y in range(ALTO):
        velo.putpixel((0, y), int(40 + 175 * (y / ALTO) ** 1.4))
    velo = velo.resize((ANCHO, ALTO))
    fondo = Image.composite(Image.new("RGB", (ANCHO, ALTO), (11, 15, 25)), fondo, velo)

    lienzo = ImageDraw.Draw(fondo)
    fuente = RAIZ / "herramientas" / "Outfit-Bold.ttf"
    f_titulo = ImageFont.truetype(str(fuente), 58)
    f_grupo = ImageFont.truetype(str(fuente), 26)

    # El grupo, arriba, en naranja y con letra espaciada.
    lienzo.text((70, 70), grupo.upper(), font=f_grupo, fill=NARANJA)

    # El titular, partido a mano para que no se salga.
    palabras, lineas, actual = titulo.split(), [], ""
    for p in palabras:
        prueba = f"{actual} {p}".strip()
        if lienzo.textlength(prueba, font=f_titulo) > ANCHO - 140:
            lineas.append(actual)
            actual = p
        else:
            actual = prueba
    if actual:
        lineas.append(actual)
    lineas = lineas[:4]

    y = ALTO - 90 - len(lineas) * 72
    for linea in lineas:
        lienzo.text((70, y), linea, font=f_titulo, fill=(255, 255, 255))
        y += 72

    # La barra naranja de la marca, abajo del todo.
    lienzo.rectangle([(0, ALTO - 10), (ANCHO, ALTO)], fill=NARANJA)

    ruta_salida.parent.mkdir(parents=True, exist_ok=True)
    fondo.save(ruta_salida, "WEBP", quality=78, method=6)


def plantilla(datos: dict) -> str:
    """La entrada entera, con la misma estructura que las diez que ya existen."""
    molde = (RAIZ / "blog" / "deca-vs-carta-de-porte.html").read_text(encoding="utf-8")

    # De la entrada que sirve de molde se conservan cabecera, menú y pie: son
    # los que el propietario quiere idénticos en todas las páginas.
    cabeza = molde[: molde.index("  <main")]
    pie = molde[molde.index("  <footer"):]

    cabeza = cabeza.replace(
        "<link rel=\"canonical\" href=\"https://micarga.es/blog/deca-vs-carta-de-porte\">",
        f"<link rel=\"canonical\" href=\"https://micarga.es/blog/{datos['slug']}\">",
    )
    cabeza = re.sub(
        r'<meta name="description" content="[^"]*">',
        f'<meta name="description" content="{html.escape(datos["resumen_corto"], quote=True)}">',
        cabeza, count=1,
    )
    cabeza = re.sub(r"<title>.*?</title>",
                    f"<title>{html.escape(datos['titulo'])} | Mi Carga</title>",
                    cabeza, count=1, flags=re.S)

    # Las alternativas arrancan con una sola: el castellano. Un artículo recién
    # preparado no existe en ningún otro idioma, y prometerle a Google nueve
    # versiones que no están es mandarlo a nueve 404.
    #
    # ⚠️ SE CONSERVAN LOS HUECOS `<!-- ALTERNATIVAS:… -->`. Son los que usa
    # i18n.py para ir añadiendo cada idioma según se vaya traduciendo; sin
    # ellos el generador se para en seco («falta el hueco ALTERNATIVAS»).
    cabeza = re.sub(
        r"<!-- ALTERNATIVAS:inicio -->.*?<!-- ALTERNATIVAS:fin -->",
        '<!-- ALTERNATIVAS:inicio -->\n'
        f'  <link rel="alternate" hreflang="es" href="https://micarga.es/blog/{datos["slug"]}">\n'
        '  <!-- ALTERNATIVAS:fin -->',
        cabeza, flags=re.S)

    llamada = datos["llamadas"][0] if datos["llamadas"] else (
        "Genera tus 10 primeros documentos gratis con Mi Carga")

    return f"""{cabeza}  <main class="blog-post">
    <div class="container">
      <p class="blog-breadcrumb"><a href="./">Blog</a> / {html.escape(datos['grupo'])}</p>

      <div class="blog-post-header">
        <span class="blog-kicker">{html.escape(datos['grupo'])}</span>
        <h1>{html.escape(datos['titulo'])}</h1>
        <p class="blog-post-meta">{html.escape(datos['entradilla'])}</p>
      </div>

      <img src="../images/blog/{datos['slug']}.webp" alt="{html.escape(datos['titulo'], quote=True)}" class="blog-post-image" width="1200" height="675" loading="lazy">

{datos['cuerpo']}

      <div class="blog-cta">
        <h3>{html.escape(llamada)}</h3>
        <p>DeCA, carta de porte y ADR, en PDF, con QR y archivo automático en la nube.</p>
        <a href="https://app.micarga.es/?registro" class="btn btn-primary">Empezar con 10 documentos gratis</a>
      </div>

      <p class="blog-source-note">Artículo informativo. Consulta siempre el caso concreto de tu operación. ¿Dudas? <a href="/contacto">Escríbenos</a>.</p>
    </div>
  </main>

{pie}"""


def preparar():
    calendario = {
        int(f["sequence"]): f
        for f in csv.DictReader((PAQUETE / "editorial-calendar.csv").open(encoding="utf-8"))
    }
    BORRADORES.mkdir(exist_ok=True)
    hoy = dt.date.today()
    cola = []

    # 🚨 Si ya hay cola, se RESPETAN sus fechas y lo ya publicado. Volver a
    # preparar es normal —se corrige la plantilla y se regeneran los 34— y sin
    # esto cada regeneración recolocaría el calendario desde hoy y daría por no
    # publicado lo que ya está en la web.
    anterior = {}
    if COLA.exists():
        try:
            anterior = {e["slug"]: e for e in json.loads(COLA.read_text(encoding="utf-8"))}
        except (ValueError, KeyError):
            anterior = {}

    for i, (num, slug, grupo, foto) in enumerate(ARTICULOS):
        fila = calendario[num]
        origen = PAQUETE / "content" / "es" / f"{fila['slug']}.md"
        cabecera, cuerpo_md = frontmatter(origen.read_text(encoding="utf-8"))
        titulo = limpiar(cabecera.get("title") or fila["title_es"])
        cuerpo, resumen, llamadas = a_html(cuerpo_md)

        corto = resumen if len(resumen) <= 155 else resumen[:152].rsplit(" ", 1)[0] + "…"

        portada(PORTADAS / f"{slug}.webp", titulo, grupo,
                RAIZ / "images" / foto)

        datos = dict(slug=slug, titulo=titulo, grupo=grupo, cuerpo=cuerpo,
                     entradilla=resumen, resumen_corto=corto, llamadas=llamadas)
        pagina = plantilla(datos)
        previo = anterior.get(slug, {})

        if previo.get("publicado"):
            # Ya está en la web: se actualiza ALLÍ, no se devuelve a borradores.
            (RAIZ / "blog" / f"{slug}.html").write_text(pagina, encoding="utf-8")
        else:
            (BORRADORES / f"{slug}.html").write_text(pagina, encoding="utf-8")

        entrada = {
            "orden": num,
            "slug": slug,
            "titulo": titulo,
            "grupo": grupo,
            "resumen": corto,
            "fecha": previo.get(
                "fecha", (hoy + dt.timedelta(days=i * CADA_CUANTOS_DIAS)).isoformat()),
            "publicado": bool(previo.get("publicado")),
        }
        if previo.get("publicado_el"):
            entrada["publicado_el"] = previo["publicado_el"]
        cola.append(entrada)

    COLA.write_text(json.dumps(cola, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(cola)} borradores en {BORRADORES.relative_to(RAIZ)}/")
    print(f"Del {cola[0]['fecha']} al {cola[-1]['fecha']}, uno cada {CADA_CUANTOS_DIAS} días.")


def ver_cola():
    if not COLA.exists():
        print("No hay cola. Ejecuta primero: python3 herramientas/blog_paquete.py preparar")
        return
    hoy = dt.date.today().isoformat()
    for e in json.loads(COLA.read_text(encoding="utf-8")):
        estado = "publicado" if e["publicado"] else ("HOY" if e["fecha"] <= hoy else "en cola")
        print(f"{e['orden']:>2} {e['fecha']}  {estado:<9} {e['titulo'][:60]}")


if __name__ == "__main__":
    orden = sys.argv[1] if len(sys.argv) > 1 else ""
    if orden == "preparar":
        preparar()
    elif orden == "cola":
        ver_cola()
    else:
        print(__doc__)
