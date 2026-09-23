#!/usr/bin/env python3
"""
Publica LA SIGUIENTE entrada del blog que toque, y solo esa.

    python3 herramientas/publicar_blog.py            # publica la que toca hoy
    python3 herramientas/publicar_blog.py --ensayo   # dice cuál sería, sin tocar nada
    python3 herramientas/publicar_blog.py --forzar   # publica la siguiente aunque no toque

Lo pensado para ir por rutina: se llama cada día, y el propio calendario
decide. Si hoy no toca, no hace nada y sale con un mensaje; si toca, mueve el
borrador a `blog/`, lo enlaza en el índice, regenera los idiomas y el sitemap,
y lo sube.

🚨 UNA SOLA ENTRADA POR EJECUCIÓN, PASE LO QUE PASE.
Es lo que se pidió: «uno hoy, mañana no, al día siguiente otro». Y si la rutina
se queda parada una semana, al volver NO se publican las cuatro atrasadas de
golpe: se publica una y las demás siguen esperando su turno. Un blog que
escupe cuatro entradas el mismo día se lee como lo que es, un volcado, y es
justo lo contrario de lo que le sirve al posicionamiento.
"""

import datetime as dt
import html
import json
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
BORRADORES = RAIZ / "borradores-blog"
COLA = BORRADORES / "cola.json"
INDICE = RAIZ / "blog" / "index.html"


def correr(*orden: str) -> str:
    r = subprocess.run(orden, cwd=RAIZ, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"Falló «{' '.join(orden)}»:\n{r.stderr.strip() or r.stdout.strip()}")
    return r.stdout


def idiomas_pendientes(ruta_articulo: Path):
    """
    Qué idiomas le faltan a un artículo, con cuántas frases cada uno.

    Se pregunta a `i18n.py`, que es quien sabe de esto, en vez de repetir aquí
    la lógica: duplicarla significaría que el día que cambie una, la otra
    seguiría diciendo que todo está bien.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "i18n", RAIZ / "herramientas" / "i18n.py")
    i18n = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(i18n)

    frases = i18n.cadenas(ruta_articulo)
    pendientes = []
    for idioma in i18n.IDIOMAS_PUBLICADOS:
        dicc = i18n.diccionario(idioma)
        n = sum(1 for f in frases if not dicc.get(f))
        if n:
            pendientes.append((idioma, n))
    return pendientes


def siguiente(cola, forzar: bool):
    """La primera sin publicar cuya fecha ya ha llegado."""
    hoy = dt.date.today().isoformat()
    for e in cola:
        if e["publicado"]:
            continue
        if forzar or e["fecha"] <= hoy:
            return e
        return None  # La cola va en orden: si esta no toca, ninguna posterior.
    return None


def meter_en_indice(entrada: dict) -> None:
    """
    Añade la tarjeta al grupo que le toca en `blog/index.html`, creando el
    grupo si aún no existe.

    La tarjeta se mete la PRIMERA de su grupo: lo último publicado es lo más
    fresco y es lo que tiene que ver quien entra.
    """
    t = INDICE.read_text(encoding="utf-8")
    # La marca ARTICULO ata la tarjeta a su artículo: el generador la quita
    # del índice de cada idioma mientras ese artículo no esté traducido ahí, y
    # la deja aparecer en cuanto lo esté. Sin ella habría que elegir entre una
    # tarjeta traducida que lleva a un texto en castellano o una tarjeta en
    # castellano en el índice alemán.
    tarjeta_desnuda = (
        f'          <a href="{entrada["slug"]}" class="blog-card">\n'
        f'            <img src="../images/blog/{entrada["slug"]}.webp" alt="" '
        f'class="blog-card-image" width="1200" height="675" loading="lazy">\n'
        f'            <h3>{html.escape(entrada["titulo"])}</h3>\n'
        f'            <p>{html.escape(entrada["resumen"])}</p>\n'
        f'          </a>\n'
    )
    tarjeta = (
        f'          <!-- ARTICULO:{entrada["slug"]}:inicio -->\n'
        f'{tarjeta_desnuda}'
        f'          <!-- ARTICULO:{entrada["slug"]}:fin -->\n'
    )

    marca = f"<h2>{html.escape(entrada['grupo'])}</h2>"
    if marca in t:
        i = t.index(marca)
        j = t.index('<div class="blog-card-grid">', i) + len('<div class="blog-card-grid">') + 1
        t = t[:j] + tarjeta + t[j:]
    else:
        # Grupo nuevo. No se marca el grupo entero: el generador ya borra
        # solo los grupos que se quedan sin ninguna tarjeta en ese idioma, así
        # que esto vale igual cuando el primer artículo del grupo se traduzca.
        bloque = (
            f'      <div class="blog-cluster">\n'
            f'        {marca}\n'
            f'        <div class="blog-card-grid">\n'
            f'{tarjeta}'
            f'        </div>\n'
            f'      </div>\n\n'
        )
        cierre = t.rindex("    </div>\n  </main>")
        t = t[:cierre] + bloque + t[cierre:]

    INDICE.write_text(t, encoding="utf-8")


def main():
    forzar = "--forzar" in sys.argv
    ensayo = "--ensayo" in sys.argv

    if not COLA.exists():
        raise SystemExit("No hay cola. Ejecuta antes: python3 herramientas/blog_paquete.py preparar")

    cola = json.loads(COLA.read_text(encoding="utf-8"))
    entrada = siguiente(cola, forzar)

    if entrada is None:
        quedan = sum(1 for e in cola if not e["publicado"])
        print(f"Hoy no toca. Quedan {quedan} en cola." if quedan else "Cola terminada: no queda ninguna.")
        return

    if ensayo:
        print(f"Tocaría: [{entrada['fecha']}] {entrada['titulo']}")
        return

    borrador = BORRADORES / f"{entrada['slug']}.html"
    if not borrador.exists():
        raise SystemExit(f"Falta el borrador {borrador}. ¿Se ha regenerado la cola sin los ficheros?")

    # 🚨 NO SE PUBLICA NADA SIN TRADUCIR. Regla del propietario, 23-09-2026:
    # primero los ocho idiomas, y cuando está listo, se publica.
    #
    # El artículo sale a la vez en los nueve idiomas o no sale. Publicarlo solo
    # en castellano y traducirlo después significa que durante días Google
    # indexa una página que luego cambia de vecindario —le aparecen ocho
    # hermanas de golpe— y que quien entra desde Alemania ve el blog sin esa
    # entrada y vuelve más tarde a encontrársela. Es ruido evitable.
    faltan = idiomas_pendientes(borrador)
    if faltan:
        detalle = ", ".join(f"{i} ({n})" for i, n in faltan)
        raise SystemExit(
            f"NO SE PUBLICA: «{entrada['titulo']}» todavía no está traducido.\n"
            f"  Frases pendientes por idioma: {detalle}\n"
            f"  Se traduce primero y se publica después. Para ver qué falta:\n"
            f"    python3 herramientas/i18n.py pendientes blog/{entrada['slug']}.html"
        )

    destino = RAIZ / "blog" / f"{entrada['slug']}.html"
    destino.write_text(borrador.read_text(encoding="utf-8"), encoding="utf-8")
    borrador.unlink()
    meter_en_indice(entrada)

    entrada["publicado"] = True
    entrada["publicado_el"] = dt.date.today().isoformat()
    COLA.write_text(json.dumps(cola, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # El índice del blog SÍ se traduce —es una página del sitio— así que hay
    # que regenerar. La entrada nueva no: está en SOLO_CASTELLANO.
    correr("python3", "herramientas/i18n.py", "generar")
    correr("python3", "herramientas/i18n.py", "sitemap")

    quedan = sum(1 for e in cola if not e["publicado"])
    correr("git", "add", "-A")
    correr("git", "commit", "-m",
           f"Blog: «{entrada['titulo']}»\n\n"
           f"Entrada {entrada['orden']} de {len(cola)} del paquete editorial. "
           f"Quedan {quedan} en cola.\n"
           f"Publicada por la rutina de herramientas/publicar_blog.py.\n\n"
           f"Traducida a los ocho idiomas antes de publicarla.\n\n"
           f"Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>")
    correr("git", "push")

    print(f"Publicada: {entrada['titulo']}")
    print(f"https://micarga.es/blog/{entrada['slug']}")
    print(f"Quedan {quedan} en cola.")


if __name__ == "__main__":
    main()
