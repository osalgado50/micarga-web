# Mi Carga — Web de marketing (micarga.es)

Sitio estático (HTML/CSS/JS, sin build) de la landing de **Mi Carga**.

- **Dominio:** https://micarga.es
- **App (PWA):** https://app.micarga.es (repositorio aparte: `descargo-app`)
- **Hosting:** Cloudflare Pages (deploy automático desde `main`).

## Estructura
- `index.html` · `styles.css` · `script.js`
- `images/` — imágenes de la landing
- `vendor/` — supabase-js y los iconos de Font Awesome, servidos desde aquí y
  no desde un CDN. Al añadir un icono: `python3 herramientas/iconos.py comprobar`.

## Despliegue (Cloudflare Pages)
Proyecto sin framework: **Build command** vacío, **Output directory** = `/` (raíz).

⚠️ Al publicarse la raíz, **todo lo que se suba al repositorio se sirve en
micarga.es**, y el repositorio es público. Las carpetas de trabajo
(`herramientas/`, `plantillas-correo/`, `traducciones/`) se cortan en
`_redirects` y los borradores del blog llevan `noindex` en `_headers`; lo
limpio sería un comando de compilación que copie solo lo público a `dist/`
(cambio en el panel de Cloudflare). No subas nada que no deba verse.
El dominio `micarga.es` se asigna como *custom domain* del proyecto (DNS ya en Cloudflare).

## Antes de subir
`python3 herramientas/comprobar.py`: traducciones (HTML y JavaScript), iconos,
el script del `<head>` que redirige los QR de julio (`?token=`, **no se quita**)
y que los precios de la portada, la compra y la página de gracias cuadren.
Las traducciones se meten con `herramientas/poner.py` (empareja por frase y
avisa si el número no cuadra).

