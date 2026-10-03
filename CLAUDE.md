## Reglas para cualquier sesión de IA en MiCarga (léelas antes de tocar nada)

Ecosistema de tres repositorios que comparten **una sola base de Supabase en
producción** (`yrwletmszkfvnpbkngek`), con clientes y cobros reales:

| Repo | Qué es | Se publica en |
|---|---|---|
| `descargo-app` | App del conductor (web + Capacitor) **y todo el backend**: migraciones, Edge Functions, cron | app.micarga.es (Cloudflare Pages) |
| `micarga-crm` | CRM de empresas y panel de plataforma (superadmin, campañas) | crm.micarga.es (Cloudflare Worker) |
| `micarga-web` | Web pública estática | micarga.es (Cloudflare Pages) |

### Cómo hablar con el propietario
- En español, claro y sin jerga. No es programador.
- **Cada comando de terminal dice en qué ordenador se ejecuta** (por ejemplo
  «en tu Mac, dentro de `~/micarga_despliegue/descargo-app`»).
- Si algo no se puede comprobar, se dice; no se supone.
- Pocas idas y vueltas: arregla lo que te pida, sin sugerir cambiar de
  proveedor (correo, pagos, hosting) salvo que lo pregunte.

### Secretos (innegociable)
- Nunca escribas el valor de una clave, token o contraseña en código, docs,
  commits ni mensajes. Si encuentras uno, indica solo archivo, línea y commit.
- La contraseña de la cuenta demo **no aparece en ningún archivo ni mensaje**.
- No pidas al propietario que pegue contraseñas en el chat. Para guardarlas usa
  `read -rs VAR` y `supabase secrets set NOMBRE="$VAR"` en su Mac.
- No muestres correos, teléfonos ni tokens de clientes en el chat.

### Producción: nada sin permiso explícito en ESE chat
- No apliques migraciones, no despliegues funciones, no escribas en la base,
  no cambies ajustes de Supabase, Stripe, Cloudflare ni Hostinger sin que el
  propietario lo diga en la conversación actual. Leer sí se puede.
- `main` publica sola en producción. Trabaja en una rama y abre PR; no hagas
  push a `main`.
- Antes de cada push: `npm test`, `npm run lint` y `npm run build` en verde
  (en `descargo-app`, además `deno test` de las funciones tocadas).

### Cambios que cruzan repositorios
- Las tablas, RPC y funciones las usan las tres piezas. Antes de cambiar o
  quitar una columna, RPC o función, búscala en los tres repos.
- Las migraciones (también las del CRM) viven **solo** en
  `descargo-app/supabase/migrations/`.

### Decisiones ya tomadas (no las reabras)
- El panel de administración y la pestaña «Campaña» están en el **CRM**. No
  vuelvas a meter un panel de admin en la app.
- Correo: Hostinger, remitente `noreply@micarga.es` (smtp.hostinger.com:465).
  Si sale `535 authentication failed`, la contraseña de ese buzón está
  desincronizada entre Hostinger, el secreto `SMTP_PASS` y el SMTP de Supabase
  Auth.
- Stripe: quedan **2 Payment Links activos** a propósito y los secretos
  `STRIPE_PAYMENT_LINK_*` **no se borran** (los usa `enviar-enlace-pago`).
- Captcha: el widget Turnstile ya está en web, CRM y app, pero el captcha de
  Supabase Auth **sigue apagado** hasta que la app nueva esté en las tiendas.
- Licencias: solo ocupan licencia los conductores (quien emite DeCA); las
  empresas con CRM incluyen 2 plazas de conductor; las bajadas y cancelaciones
  se aplican al final del periodo; 14 días de gracia en impagos.

### Dónde está el estado
- Lo pendiente y el último despliegue:
  `descargo-app/docs/DESPLIEGUE_ARREGLOS_2026-10-02.md` (sección «Pendiente»).
- Estado general: `descargo-app/docs/ESTADO.md`. Al terminar algo importante,
  anótalo ahí.

## Específico de este repositorio (micarga-web)
- **Repositorio público**: todo lo que se sube aquí lo ve cualquiera. Nada de
  datos internos, borradores con información privada ni claves.
- La web está en 9 idiomas (raíz = español, más `ca de en fr it pl pt ro`). Un
  cambio de texto o de script se replica en todas las copias.
- Al cambiar un `.js`, sube el parámetro de caché en los `<script src=…?v=…>`.
- No quites el script del `<head>` que redirige los QR antiguos
  (`micarga.es/?token=…`) a `app.micarga.es`.
