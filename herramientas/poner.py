#!/usr/bin/env python3
"""
Mete traducciones en el diccionario de un idioma SIN volver a escribir el
castellano.

Copiar a mano la frase original para usarla de clave es la forma más fácil de
equivocarse: basta un espacio duro, una tilde o un salto de línea distinto para
que la clave no case con nada y la traducción no se aplique... sin que nadie
avise. Aquí se pasan solo las traducciones, en el mismo orden en que salen las
frases pendientes de la página, y el script empareja.

    from herramientas.poner import pendientes, guardar
"""
import importlib.util
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("i18n", RAIZ / "herramientas" / "i18n.py")
i18n = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(i18n)


def diccionario(idioma):
    f = RAIZ / "traducciones" / f"{idioma}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def pendientes(pagina, idioma):
    """Frases de esa página que aún no tienen traducción, en orden."""
    d = diccionario(idioma)
    return [t for t in i18n.cadenas(RAIZ / pagina) if t not in d]


def guardar(idioma, pares):
    d = diccionario(idioma)
    d.update(pares)
    f = RAIZ / "traducciones" / f"{idioma}.json"
    f.write_text(json.dumps(d, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                 encoding="utf-8")
    return len(d)


def emparejar(pagina, idioma, traducciones, pendientes_previas=None):
    """Empareja por orden y avisa si el número no cuadra.

    `pendientes_previas` es para traducir VARIAS páginas de una tacada: las
    listas pendientes se sacan todas a la vez, antes de guardar nada, y hay
    frases que salen en más de una página (el menú, el pie). Si se recalculara
    lo pendiente después de cada guardado, la segunda lista ya no cuadraría con
    la que se escribió, y el emparejamiento se iría una posición — con lo que
    cada frase acabaría con la traducción de la de al lado.
    """
    faltan = pendientes_previas if pendientes_previas is not None else pendientes(pagina, idioma)
    assert len(faltan) == len(traducciones), (
        f"{pagina} [{idioma}]: hay {len(faltan)} frases pendientes y me das "
        f"{len(traducciones)} traducciones"
    )
    return dict(zip(faltan, traducciones))


def por_lotes(idioma, lotes):
    """{página: [traducciones]} → todo emparejado contra la foto de ahora."""
    foto = {pagina: pendientes(pagina, idioma) for pagina in lotes}
    pares = {}
    for pagina, traducciones in lotes.items():
        pares.update(emparejar(pagina, idioma, traducciones, foto[pagina]))
    return guardar(idioma, pares)
