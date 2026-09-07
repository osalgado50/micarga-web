# Plantillas de correo de Supabase

Estas plantillas **no se despliegan solas**. Viven en el panel de Supabase
(Authentication → Emails) y se copian a mano. Están aquí porque una
configuración que solo existe dentro de un panel no se puede revisar, ni
comparar, ni recuperar si alguien la toca: los dos fallos que se corrigieron el
7 de septiembre de 2026 llevaban meses en producción sin que nadie los viera.

| Fichero | Plantilla de Supabase | Quién la recibe |
|---|---|---|
| `confirmar-cuenta.html` | **Confirm signup** | Quien se da de alta desde `micarga.es/suscripcion` |
| `enlace-acceso.html` | **Magic Link** | Quien ya tiene cuenta y entra con código |

## Los dos fallos que corrigen

**1. Faltaba `{{ .Token }}`.** Las plantillas solo llevaban
`{{ .ConfirmationURL }}`, o sea un enlace y ningún número. Pero
`micarga.es/suscripcion` pide **un código de seis dígitos**: el cliente recibía
un correo sin código y se quedaba mirando una casilla que no podía rellenar.

Es exactamente donde se atascó el socio del propietario el 7 de septiembre: creó
la cuenta a las 10:56, el correo llegó, no traía código, y a las 11:02 los
registros muestran un `403: el enlace del correo no es válido o ha caducado`
—había pulsado el enlace por segunda vez—. Nunca llegó a pagar.

**2. Los datos de la empresa eran marcadores sin sustituir.** El pie decía
literalmente `RAZON_SOCIAL · CIF CIF_EMPRESA`, la dirección era
`DIRECCION_FISCAL` y el correo de ayuda, `CORREO_SOPORTE`. Salía así en cada
correo de alta. Ahora llevan los datos reales, que son los mismos del
[aviso legal](../aviso-legal.html): RESITECH 2021, S.L.U., CIF B67419168, Gran
Vía de Carles III, número 98, planta 10, 08028 Barcelona.

## Cómo se aplican

1. Panel de Supabase → el proyecto → **Authentication** → **Emails**.
2. Elegir la plantilla de la tabla de arriba.
3. Pegar el contenido del fichero **entero** y guardar.
4. Comprobarlo de verdad: pedir un código en `micarga.es/suscripcion` con un
   correo cualquiera y mirar que llegan los seis dígitos.

## Al tocarlas

- `{{ .Token }}` es el código de seis dígitos y `{{ .ConfirmationURL }}` el
  enlace. **Los dos tienen que seguir estando**: el código porque es lo que
  pide la página, y el enlace como alternativa para quien no quiera teclear.
- Si se cambia algo en el panel, traerlo también a estos ficheros. Si no, esto
  vuelve a ser papel mojado y el siguiente fallo tardará otros meses en verse.
