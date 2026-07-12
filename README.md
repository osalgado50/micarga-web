# Mi Carga — Web de marketing (micarga.es)

Sitio estático (HTML/CSS/JS, sin build) de la landing de **Mi Carga**.

- **Dominio:** https://micarga.es
- **App (PWA):** https://app.micarga.es (repositorio aparte: `descargo-app`)
- **Hosting:** Cloudflare Pages (deploy automático desde `main`).

## Estructura
- `index.html` · `styles.css` · `script.js`
- `images/` — imágenes de la landing

## Despliegue (Cloudflare Pages)
Proyecto sin framework: **Build command** vacío, **Output directory** = `/` (raíz).
El dominio `micarga.es` se asigna como *custom domain* del proyecto (DNS ya en Cloudflare).
