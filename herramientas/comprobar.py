#!/usr/bin/env python3
"""
Las comprobaciones de la web que no dependen de ningún servidor. Pasarlas antes
de subir nada:

    python3 herramientas/comprobar.py

Junta lo que antes no miraba nadie (auditoría 02-10-2026):

  · traducciones: `i18n.py comprobar`, que ya incluye el JavaScript (DUP-04);
  · iconos: que ninguno se vea en blanco (`iconos.py comprobar`, REN-12);
  · QR de julio: que el script del <head> que redirige `?token=` a la app
    siga en la portada de los nueve idiomas. Sin él, los DeCA impresos en
    julio dejan de abrir el documento, que es lo que exige la Resolución de
    5/6/2026. i18n.py regenera los idiomas desde la raíz, así que basta
    tocar la portada castellana para perderlo en todos (QR-36);
  · precios: que las cifras de la portada, la página de compra y la de
    gracias digan lo mismo (COB-48). Lo que cobra de verdad está en Stripe y
    en `crm_ajustes.precios_stripe`, que esta comprobación no puede leer; al
    cambiar un precio allí, hay que cambiar los `data-` de suscripcion.html y
    esto dirá qué más hay que tocar.

Sale con 1 si algo falla.
"""

import importlib.util
import io
import re
import sys
from contextlib import redirect_stdout
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def _modulo(nombre):
    spec = importlib.util.spec_from_file_location(nombre, RAIZ / "herramientas" / f"{nombre}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def traducciones() -> list:
    i18n = _modulo("i18n")
    salida = io.StringIO()
    with redirect_stdout(salida):
        i18n.cmd_comprobar()
    fallos = []
    for linea in salida.getvalue().splitlines():
        m = re.match(r"(\w\w)(?: \(JavaScript\))?: faltan (\d+)", linea)
        if m and m.group(1) in i18n.IDIOMAS_PUBLICADOS and int(m.group(2)) > 0:
            fallos.append(f"traducciones: {linea.strip()}")
    return fallos


def iconos() -> list:
    salida = io.StringIO()
    with redirect_stdout(salida):
        mal = _modulo("iconos").cmd_comprobar()
    return [f"iconos: {salida.getvalue().strip()}"] if mal else []


# Lo que tiene que seguir haciendo el script, no su texto exacto: así un cambio
# de formato no da un falso aviso, y quitarlo o romperlo sí.
QR_SCRIPT = re.compile(
    r"<script>\s*if \(location\.search\.indexOf\('token='\) !== -1\) \{\s*"
    r"location\.replace\('https://app\.micarga\.es/' \+ location\.search\);\s*\}\s*</script>")


def qr_de_julio() -> list:
    i18n = _modulo("i18n")
    fallos = []
    for carpeta in [""] + [f"{i}/" for i in i18n.IDIOMAS_PUBLICADOS]:
        ruta = RAIZ / carpeta / "index.html"
        texto = ruta.read_text(encoding="utf-8") if ruta.exists() else ""
        cabeza = texto.split("</head>", 1)[0]
        if not QR_SCRIPT.search(cabeza):
            fallos.append(f"QR de julio: falta el script de ?token= en el <head> de /{carpeta}index.html")
    return fallos


def _num(texto: str) -> float:
    return float(texto.replace(".", "").replace(",", "."))


def _euros(n: float) -> str:
    """12.1 → «12,10», 90 → «90»: como se escriben en la web."""
    return f"{n:.2f}".replace(".", ",") if n % 1 else str(int(n))


def precios() -> list:
    fallos = []
    sus = (RAIZ / "suscripcion.html").read_text(encoding="utf-8")
    m = re.search(r'data-lic-mes="([\d.]+)"\s+data-lic-ano="([\d.]+)"\s+'
                  r'data-crm-mes="([\d.]+)"\s+data-crm-ano="([\d.]+)"\s+data-iva="([\d.]+)"', sus)
    if not m:
        return ["precios: no encuentro los data-precios de suscripcion.html"]
    lic_mes, lic_ano, crm_mes, crm_ano, iva = (float(x) for x in m.groups())
    con_iva = lambda n: round(n * (1 + iva / 100) + 1e-9, 2)

    portada = (RAIZ / "index.html").read_text(encoding="utf-8")
    for atributo, valor in (("data-precio-mes", lic_mes), ("data-precio-ano", lic_ano),
                            ("data-crm-mes", crm_mes), ("data-crm-ano", crm_ano)):
        a = re.search(rf'{atributo}="([\d.]+)"', portada)
        if not a or float(a.group(1)) != valor:
            fallos.append(f"precios: index.html {atributo}={a.group(1) if a else '¿?'} y "
                          f"suscripcion.html dice {_euros(valor)}")

    # Las cifras con IVA que la portada y la compra escriben como texto.
    esperadas = {
        "index.html": [con_iva(lic_mes), con_iva(lic_ano), con_iva(crm_mes), con_iva(crm_ano)],
        "suscripcion.html": [con_iva(lic_mes), con_iva(lic_ano)],
    }
    for pagina, cifras in esperadas.items():
        texto = (RAIZ / pagina).read_text(encoding="utf-8")
        for c in cifras:
            if f"{_euros(c)} €" not in texto and f"{_euros(c)}&nbsp;€" not in texto:
                fallos.append(f"precios: {pagina} no menciona {_euros(c)} € (precio con IVA)")

    gracias = (RAIZ / "gracias.js").read_text(encoding="utf-8")
    for nombre, valor in (("PRECIO_MENSUAL", con_iva(lic_mes)), ("PRECIO_ANUAL", con_iva(lic_ano))):
        g = re.search(rf"const {nombre} = ([\d.]+);", gracias)
        if not g or abs(float(g.group(1)) - valor) > 0.001:
            fallos.append(f"precios: gracias.js {nombre}={g.group(1) if g else '¿?'} y debería ser {valor}")
    return fallos


def main() -> int:
    fallos = traducciones() + iconos() + qr_de_julio() + precios()
    for f in fallos:
        print("🚨 " + f)
    print("Todo en orden." if not fallos else f"{len(fallos)} problema(s).")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
