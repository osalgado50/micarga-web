#!/usr/bin/env python3
"""Mete una tanda de traducciones en el diccionario de un idioma.

    python3 herramientas/poner_tanda.py pt 0 traducciones.txt

Lee las frases ORIGINALES por su posición en la lista ordenada (la misma que
devuelve `todas_las_cadenas`), así que el fichero de traducciones solo lleva las
traducciones, una por línea, en ese mismo orden. Una línea vacía deja esa frase
sin traducir en vez de meter una cadena vacía.

Los saltos de línea dentro de una frase se escriben «\\n» en el fichero: si no,
no se podría distinguir dónde acaba una traducción y empieza la siguiente.
"""
import io, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import i18n

idioma, desde, fichero = sys.argv[1], int(sys.argv[2]), sys.argv[3]
todas = i18n.todas_las_cadenas()
lineas = io.open(fichero, encoding="utf-8").read().split("\n")
while lineas and lineas[-1] == "":
    lineas.pop()

ruta = Path(f"traducciones/{idioma}.json")
dicc = json.load(io.open(ruta, encoding="utf-8"))

puestas = saltadas = 0
for i, linea in enumerate(lineas):
    pos = desde + i
    if pos >= len(todas):
        print(f"⚠️  la línea {i+1} se sale de la lista ({pos} >= {len(todas)})")
        break
    if linea.strip() == "":
        saltadas += 1
        continue
    dicc[todas[pos]] = linea.replace("\\n", "\n")
    puestas += 1

json.dump(dicc, io.open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=2, sort_keys=True)
faltan = sum(1 for t in todas if not dicc.get(t))
print(f"{idioma}: +{puestas} puestas, {saltadas} saltadas · faltan {faltan} de {len(todas)}")
