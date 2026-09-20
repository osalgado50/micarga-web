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
# Los idiomas que EXISTEN como diccionario y se pueden ir rellenando.
IDIOMAS = ("ca", "en", "pt", "fr", "de", "it", "pl", "ro", "bg")

# Los que SALEN A LA WEB.
#
# ⚠️ UN IDIOMA NO SE PUBLICA HASTA QUE ESTÁ TRADUCIDO, y no es una manía: el
# generador cae al castellano en cada frase que falte, así que publicar un
# idioma a medias pone 22 páginas de texto castellano bajo `hreflang="pt"`.
# Para Google eso es contenido duplicado a gran escala y una señal de baja
# calidad sobre TODO el dominio, no solo sobre esas páginas. Se gana menos que
# se pierde.
#
# Un idioma se añade aquí cuando `comprobar` dice 0 frases sin traducir.
IDIOMAS_PUBLICADOS = ("ca", "en", "pt", "fr", "de", "it", "pl", "ro")

# Las páginas del sitio, relativas a la raíz. El orden manda en el sitemap.
PAGINAS = [
    "index.html", "suscripcion.html", "presupuesto.html", "contacto.html",
    "gracias.html",
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
    # El nombre de cada idioma en su propio idioma. Idéntico en las nueve
    # versiones a propósito —«Português» es «Português» también en la página
    # polaca—, así que no pasa por el diccionario. Va como literal y no como
    # `NOMBRE_IDIOMA.values()` porque ese diccionario se define más abajo.
    "Castellano", "Català", "English", "Português", "Français", "Deutsch",
    "Italiano", "Polski", "Română", "Български",
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

# El nombre de cada idioma EN SU PROPIO IDIOMA. Quien busca el suyo en una
# lista lo reconoce por cómo se escribe, no por cómo lo llamemos nosotros.
NOMBRE_IDIOMA = {
    "es": "Castellano", "ca": "Català", "en": "English", "pt": "Português",
    "fr": "Français", "de": "Deutsch", "it": "Italiano", "pl": "Polski",
    "bg": "Български",
    "ro": "Română",
}
ETIQUETA_IDIOMA = {
    "es": "ES", "ca": "CA", "en": "EN", "pt": "PT", "fr": "FR",
    "de": "DE", "it": "IT", "pl": "PL", "ro": "RO",
}

# La bandera de cada idioma.
#
# ⚠️ DOS TRAMPAS, y las dos se ven en cuanto se prueba en otro ordenador:
#   1. EL CATALÁN NO TIENE BANDERA EN UNICODE. Los emoji de bandera son pares
#      de letras de país (ES, PT…) y Cataluña no tiene código ISO de país. Por
#      eso el catalán lleva una senyera dibujada en SVG: ponerle la de España
#      sería decir que catalán = España.
#   2. WINDOWS NO PINTA LOS EMOJI DE BANDERA. Chrome en Windows enseña las dos
#      letras dentro de una cajita. Por eso al lado va SIEMPRE el nombre del
#      idioma escrito: si el emoji no sale, la lista se sigue leyendo igual.
#
# Y el aviso de fondo: una bandera NO es un idioma. El portugués no es solo de
# Portugal ni el alemán solo de Alemania. Se usan porque se reconocen de un
# vistazo, pero lo que manda es el nombre escrito al lado.
SENYERA = (
    '<svg class="bandera-svg" viewBox="0 0 9 6" aria-hidden="true">'
    '<rect width="9" height="6" fill="#FCDD09"/>'
    '<path stroke="#DA121A" stroke-width=".67" '
    'd="M0 1h9M0 2.33h9M0 3.67h9M0 5h9"/>'
    '</svg>'
)
BANDERA = {
    "es": "\U0001F1EA\U0001F1F8", "ca": SENYERA, "en": "\U0001F1EC\U0001F1E7",
    "pt": "\U0001F1F5\U0001F1F9", "fr": "\U0001F1EB\U0001F1F7",
    "de": "\U0001F1E9\U0001F1EA", "it": "\U0001F1EE\U0001F1F9",
    "pl": "\U0001F1F5\U0001F1F1", "ro": "\U0001F1F7\U0001F1F4",
    "bg": "\U0001F1E7\U0001F1EC",
}

LOCALE_OG = {
    "es": "es_ES", "ca": "ca_ES", "en": "en_GB", "pt": "pt_PT",
    "fr": "fr_FR", "de": "de_DE", "it": "it_IT", "pl": "pl_PL",
    "ro": "ro_RO", "bg": "bg_BG",
}

# Todos, con el castellano delante: es el original del que salen los demás.
TODOS_LOS_IDIOMAS = ("es",) + IDIOMAS_PUBLICADOS

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

    Sin esto, Google trata las versiones como páginas distintas que dicen lo
    mismo y se las come entre ellas. Con esto sabe que son la misma y le enseña
    a cada uno la suya. `x-default` apunta al castellano: es el idioma del
    mercado y el original del que salen los demás.
    """
    lineas = [f'  <link rel="alternate" hreflang="{i}" href="{url_de(pagina, i)}">'
              for i in TODOS_LOS_IDIOMAS]
    lineas.append(f'  <link rel="alternate" hreflang="x-default" href="{url_de(pagina, "es")}">')
    return "\n".join(lineas)


def bloque_idiomas(pagina: str, actual: str) -> str:
    """El selector de idioma de la barra de navegación.

    ES UN `<details>`, NO UN MENÚ DE JAVASCRIPT, y eso es deliberado: dentro
    van enlaces de verdad, así que Google los sigue, funcionan con el botón del
    medio, con el teclado y con el JavaScript caído. Un desplegable hecho a
    mano con scripts habría dejado ocho idiomas invisibles para el buscador,
    que es justo lo contrario de para lo que se traduce una web.

    Con tres idiomas cabían en fila. Con nueve, no: de ahí el desplegable.
    """
    enlaces = []
    for i in TODOS_LOS_IDIOMAS:
        if i == actual:
            continue
        enlaces.append(
            f'            <a href="{url_de(pagina, i)}" hreflang="{i}" lang="{i}">'
            f'<span class="bandera">{BANDERA[i]}</span>{NOMBRE_IDIOMA[i]}</a>'
        )
    dentro = "\n".join(enlaces)
    return (
        '      <details class="selector-idioma">\n'
        f'        <summary aria-label="{NOMBRE_IDIOMA[actual]}" '
        f'title="{NOMBRE_IDIOMA[actual]}">'
        f'<span class="bandera">{BANDERA[actual]}</span>'
        f'<span class="selector-idioma-codigo">{ETIQUETA_IDIOMA[actual]}</span></summary>\n'
        '        <div class="selector-idioma-lista">\n'
        f'{dentro}\n'
        '        </div>\n'
        '      </details>'
    )


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
# `data-video` va en la lista por lo mismo: es el atributo con el que las
# tarjetas de la sección de vídeos le dicen al reproductor qué archivo abrir, y
# dejarlo relativo hace que desde /ca/ se pida /ca/videos/… y el vídeo no
# arranque.
ARCHIVOS = re.compile(
    r'(src|href|poster|data-video)="(?:\.\./)*((?:images|videos)/[^"]+|[\w.-]+\.(?:css|js|png|jpg|jpeg|webp|ico|mp4|xml|txt)(?:\?[^"]*)?)"'
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
        # `html.unescape` porque las claves del diccionario se extraen ya
        # desescapadas: en el HTML pone «10&nbsp;€» y en el diccionario está
        # «10 €» con el espacio duro de verdad. Sin esto, ni el símbolo del
        # copyright ni ninguna frase con un espacio duro casaban con su
        # traducción, y se quedaban en castellano sin avisar.
        clave = html.unescape(t).strip()
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



# Los cuatro textos legales. Se traducen porque quien firma un contrato tiene
# derecho a leerlo en su idioma, pero la traducción no puede convertirse en una
# segunda versión del contrato: si un día alguien discute una cláusula, tiene
# que haber UN texto que mande, y es el original.
PAGINAS_LEGALES = ("aviso-legal.html", "privacidad.html", "terminos.html", "cookies.html")

AVISO_IDIOMA = {
    "ca": ("Aquesta és una traducció de cortesia. En cas de discrepància entre "
           "versions, preval el text en castellà, que és l'original i el que "
           "té efectes legals."),
    "en": ("This is a courtesy translation. In the event of any discrepancy "
           "between versions, the Spanish text prevails: it is the original and "
           "the one with legal effect."),
    "pt": ("Esta é uma tradução de cortesia. Em caso de divergência entre as "
           "versões, prevalece o texto em espanhol, que é o original e o que "
           "tem efeitos legais."),
    "fr": ("Ceci est une traduction de courtoisie. En cas de divergence entre "
           "les versions, le texte espagnol prévaut : il s'agit de l'original "
           "et de la version ayant valeur juridique."),
    "de": ("Dies ist eine unverbindliche Übersetzung. Bei Abweichungen zwischen "
           "den Fassungen ist der spanische Text maßgeblich: Er ist das "
           "Original und die rechtlich verbindliche Fassung."),
    "it": ("Questa è una traduzione di cortesia. In caso di discrepanza tra le "
           "versioni, prevale il testo in spagnolo, che è l'originale e quello "
           "con effetti legali."),
    "pl": ("To tłumaczenie ma charakter informacyjny. W razie rozbieżności "
           "między wersjami rozstrzygający jest tekst hiszpański, który jest "
           "oryginałem i ma moc prawną."),
    "ro": ("Aceasta este o traducere de curtoazie. În caz de neconcordanță "
           "între versiuni, prevalează textul în spaniolă, care este originalul "
           "și cel cu efecte juridice."),
}


def _aviso_de_traduccion(texto: str, idioma: str) -> str:
    """Mete el aviso justo debajo del título, donde se lee antes de nada."""
    aviso = AVISO_IDIOMA.get(idioma)
    if not aviso:
        return texto
    m = re.search(r"</h1>\n", texto)
    assert m, "no encuentro el <h1> de la página legal"
    corte = m.end()
    return (texto[:corte]
            + f'      <p class="legal-traduccion">{html.escape(aviso, quote=False)}</p>\n'
            + texto[corte:])



# ---------------------------------------------------------------------------
# Los mensajes que viven dentro del JavaScript
# ---------------------------------------------------------------------------
#
# Las páginas de suscripción, presupuesto y borrado hablan con quien las usa
# desde el JavaScript: «ese correo no parece válido», «no hemos podido enviar
# el código». Si solo se tradujera el HTML, una persona que entra en inglés
# vería la página en inglés hasta el primer error, y a partir de ahí en
# castellano — justo en el momento en que algo va mal y más necesita entender
# qué le están diciendo.
#
# Se traducen SOLO las cadenas que aparecen tal cual en el diccionario de cada
# idioma. Todo lo demás del archivo —selectores, nombres de campo, códigos de
# error de Supabase— se queda intacto, que es justo lo que tiene que pasar: un
# `id` traducido rompería la página en silencio.

SCRIPTS = ("suscripcion.js", "presupuesto.js", "borrar-cuenta.js", "gracias.js", "turnstile.js")

# Una cadena entre comillas simples, dobles o invertidas, sin escapes dentro.
# Los escapes se dejan fuera a propósito: una cadena con \' o \n partida a
# trozos por el regex se reconstruiría mal, y es preferible no tocarla.
LITERAL_JS = re.compile(r"""(['"`])([^'"`\\\n]{4,})\1""")


def diccionario_js(idioma: str) -> dict:
    f = RAIZ / "traducciones" / f"{idioma}.js.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def cadenas_js(nombre: str) -> list:
    """Las cadenas candidatas de un script, sin comentarios."""
    s = (RAIZ / nombre).read_text(encoding="utf-8")
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"^\s*//.*$", "", s, flags=re.M)
    vistas, salida = set(), []
    for _, texto in LITERAL_JS.findall(s):
        t = texto.strip()
        if len(t) < 12 or t in vistas:
            continue
        # Solo lo que parece una frase para una persona.
        if not re.search(r"[áéíóúñ¿¡]|\b(el|la|los|las|tu|te|no|se|que|con|para|sin|una|hemos)\b", t, re.I):
            continue
        vistas.add(t)
        salida.append(t)
    return salida


def _lineas_de_codigo(crudo: str):
    """Recorre el archivo diciendo, por cada línea, si es código o comentario.

    Hace falta porque la búsqueda de cadenas se hace con una expresión regular
    que empareja comillas, y un apóstrofo suelto dentro de un comentario
    —«l'app», «d'aquí», «¿qué pasa si...»— abre una comilla que se cierra
    muchísimo más abajo. Eso descoloca todos los emparejamientos posteriores:
    unas cadenas se traducen y otras no, sin ningún patrón aparente. Es
    exactamente lo que pasó la primera vez.
    """
    en_bloque = False
    for linea in crudo.split("\n"):
        recortada = linea.strip()
        if en_bloque:
            if "*/" in linea:
                en_bloque = False
            yield linea, False
            continue
        if recortada.startswith("/*"):
            en_bloque = "*/" not in linea
            yield linea, False
            continue
        if recortada.startswith("//") or recortada.startswith("*"):
            yield linea, False
            continue
        yield linea, True


def traducir_js(crudo: str, dicc: dict) -> str:
    def cambia(m):
        comilla, texto = m.group(1), m.group(2)
        traducida = dicc.get(texto.strip())
        if not traducida:
            return m.group(0)
        # En inglés casi toda frase lleva apóstrofo —«we couldn't», «you're»—,
        # y el apóstrofo es justo la comilla que delimita la cadena. Se escapa
        # en vez de descartar la traducción: descartarla dejaba media página en
        # castellano y, lo peor, sin decir nada.
        traducida = traducida.replace("\\", "\\\\").replace(comilla, "\\" + comilla)
        # Se respeta el espacio de los extremos: alguna cadena se concatena con
        # la de al lado y sin él se pegarían las palabras.
        izq = texto[:len(texto) - len(texto.lstrip())]
        der = texto[len(texto.rstrip()):]
        return f"{comilla}{izq}{traducida}{der}{comilla}"

    salida = []
    for linea, es_codigo in _lineas_de_codigo(crudo):
        salida.append(LITERAL_JS.sub(cambia, linea) if es_codigo else linea)
    return "\n".join(salida)


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

    # Solo los PUBLICADOS. Un idioma a medias no se escribe en disco siquiera:
    # si la carpeta existe, Cloudflare la sirve, y Google acaba encontrándola
    # aunque no esté ni en el sitemap ni en los hreflang.
    for idioma in IDIOMAS_PUBLICADOS:
        dicc = diccionario(idioma)
        dicc_js = diccionario_js(idioma)
        faltan = set()

        for nombre in SCRIPTS:
            destino = RAIZ / idioma / nombre
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(
                traducir_js((RAIZ / nombre).read_text(encoding="utf-8"), dicc_js),
                encoding="utf-8",
            )
        for pagina in PAGINAS:
            crudo = (RAIZ / pagina).read_text(encoding="utf-8")
            s = traducir_html(crudo, dicc, faltan)
            s = _rutas_absolutas(s)
            s = _enlaces_con_idioma(s, idioma)
            # Los scripts traducidos viven junto a las páginas traducidas.
            for nombre in SCRIPTS:
                s = s.replace(f'"/{nombre}', f'"/{idioma}/{nombre}')
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
            if pagina in PAGINAS_LEGALES:
                s = _aviso_de_traduccion(s, idioma)

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
            for i in TODOS_LOS_IDIOMAS
        )
        alternativas += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{url_de(pagina, "es")}"/>'
        # Solo los publicados: meter en el sitemap un idioma sin traducir es
        # invitar a Google a indexar 22 páginas de castellano con otra etiqueta.
        for idioma in TODOS_LOS_IDIOMAS:
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
