# Guía bíblica · NVI

Chat en español e inglés que escucha cómo te sientes y recomienda pasajes de los
66 libros de la Biblia. Cada tarjeta distingue idea central, contexto y aplicación
personal. Usa Gemini y PostgreSQL de Supabase; no hay respuestas simuladas ni base
de datos local.

El proyecto se ejecuta con Node.js, pnpm y Vite, sin plugins de un editor ni
servicios de alojamiento obligatorios. La configuración de desarrollo y
producción se encuentra en este repositorio.

## Configuración

Requiere Node.js 20.19 o superior y pnpm 10.32.1. Se recomienda Node.js 22 o 24.

1. Ejecuta `pnpm install --frozen-lockfile`.
2. Copia `.env.example` a `.env` y completa `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, `GEMINI_API_KEY` y
   `GEMINI_MODEL` (por defecto `gemini-3.5-flash-lite`). No subas `.env` a Git.
3. Usa la URI de Supabase **Connect → Session pooler**, puerto 5432, con la
   contraseña codificada para URL. Se necesitan conexiones de sesión para los
   bloqueos que evitan respuestas simultáneas en una conversación.
4. Descarga el certificado de **Database Settings → SSL Configuration**. Guárdalo
   en la raíz como `prod-ca-2021.crt` o `prod-supabase.cer`, o indica la ruta en
   `DATABASE_SSL_CA_FILE`. La aplicación verifica el certificado y el hostname;
   no desactiva la verificación SSL.
5. En Supabase, habilita **Authentication → Sign In / Providers → Google** y el
   registro de nuevos usuarios. El Client ID y Client Secret de Google se guardan
   únicamente en Supabase. En Google Cloud, el callback autorizado es
   `https://<project-ref>.supabase.co/auth/v1/callback`; copia el que muestra Supabase.
   En **Authentication → URL Configuration**, usa `http://127.0.0.1:20874` como
   **Site URL** para desarrollo y añade como **Redirect URLs**:
   - `http://127.0.0.1:20874/auth/callback`
   - `http://127.0.0.1:8080/auth/callback` si pruebas con `pnpm start`.
   Si abres la app con `localhost`, añade también esa variante y mantén el mismo
   hostname al iniciar y terminar el acceso. Con OAuth PKCE, el navegador que
   empieza el acceso conserva el verificador necesario para completarlo.
6. Ejecuta `pnpm dev`. Aplica las migraciones y levanta el servidor en 8080 y la
   interfaz en <http://127.0.0.1:20874>. Los datos y las respuestas vienen de los
   servicios remotos configurados.

Configura también `CONTACT_EMAIL` en `.env` con un correo real que administres
para consultas de privacidad. Se mostrará públicamente; no pongas una contraseña
ni una clave en esa variable. Si está vacío o no es una dirección válida, la
política indica que el contacto está pendiente, sin inventar uno.

El arranque carga `.env`; las variables del entorno del alojamiento tienen prioridad.
Los comandos individuales de paquetes requieren que el entorno ya esté cargado.

## Producción

Ejecuta `pnpm build` y luego `pnpm start`. El servidor sirve la interfaz compilada
y `/api` desde el mismo origen, en `API_PORT` (o `PORT`, si lo proporciona el
alojamiento). Configura `HOST=0.0.0.0` y `APP_ORIGIN=https://tu-dominio.example`
con el origen público HTTPS, sin rutas, parámetros ni credenciales. `APP_ORIGIN`
se publica en la configuración de Auth para construir el callback y verificar
el origen de las escrituras de la API; se lee al arrancar el servidor y no
requiere recompilar el frontend. Si se abre un hostname distinto, el botón lleva
primero al login del origen oficial para conservar allí el verificador PKCE.

En Supabase, configura **Site URL** con `APP_ORIGIN` y añade la URL exacta
`https://tu-dominio.example/auth/callback` a **Redirect URLs**. Si usas `BASE_PATH`,
inclúyelo, por ejemplo `https://tu-dominio.example/guia/auth/callback`.
El callback de Google Cloud sigue siendo el de Supabase, no el de la app.
Si el consentimiento de Google está en modo de prueba, añade las cuentas que
probarán el acceso como usuarios de prueba de Google.

En local deja `APP_ORIGIN` vacío: `pnpm dev` vuelve a
`http://127.0.0.1:20874/auth/callback`. `pnpm start` usa el origen desde el que
abras la app, normalmente `http://127.0.0.1:8080`.

Usa `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` de **Settings → API Keys**.
También se admite `SUPABASE_ANON_KEY` como alternativa pública heredada.
Nunca uses `service_role` ni `sb_secret_`: la API rechaza esas claves y no las
expone al navegador. No necesitas un Client Secret de Google en `.env`.
El alojamiento debe permitir conexiones salientes a Supabase y Google.
La configuración de credenciales no publica la aplicación automáticamente.

`pnpm db:setup` aplica las migraciones versionadas sin iniciar los servidores.
No usa `drizzle-kit push --force` ni elimina conversaciones existentes. Las
migraciones habilitan RLS: los usuarios autenticados solo pueden leer sus propias
conversaciones y mensajes, y los visitantes anónimos no tienen acceso. Las
escrituras pasan por la API para impedir respuestas del asistente falsificadas.
El servidor conecta como dueño de las tablas y, además, verifica el token con
Supabase Auth y filtra cada operación por el UUID del usuario validado.

## Cuentas e historial

La página de acceso ofrece **Continuar con Google** con Supabase Auth y OAuth
PKCE. Supabase crea la cuenta en el primer acceso y mantiene su UUID en las
sesiones posteriores. La app no ofrece formularios de contraseña, registro,
confirmación de correo ni recuperación de contraseña, y no necesita SMTP.
Al volver a `/auth/callback`, intercambia el código por la sesión, retira los
parámetros de autenticación de la URL y vuelve al chat. Los errores o cancelaciones
permiten intentar el acceso de nuevo. El botón pide elegir la cuenta de Google.

**Cerrar sesión** elimina la sesión de esta app en el dispositivo y vacía la vista
y la caché; no cierra la cuenta de Google en otros servicios. Los historiales
siguen asociados al UUID validado por Supabase, nunca a un correo o un ID que
mande el navegador. Las cuentas existentes conservan sus datos cuando Supabase
vincula la identidad de Google al mismo usuario verificado; no se reasignan
conversaciones entre UUID distintos. Si deseas permitir exclusivamente Google
a nivel del proyecto, deshabilita Email en el panel de proveedores de Supabase.

Cada cuenta tiene un historial con búsqueda por título, paginación, selección,
cambio de nombre y eliminación con confirmación. Se crea una conversación al
enviar el primer mensaje y se titula con ese mensaje. Las más recientes aparecen
primero. Los mensajes se conservan entre dispositivos y el cierre o cambio de
cuenta vacía la vista y la caché para no mostrar datos de otra persona.

Las sesiones del SDK se conservan en el almacenamiento del navegador. Al terminar
en un dispositivo compartido, cierra la sesión. Los mensajes y las recomendaciones
se guardan en Supabase; el contexto del chat se envía a Gemini para generar la
respuesta. Privacidad entre cuentas no significa cifrado de extremo a extremo.
Las conversaciones antiguas identificadas solo por cookie se conservan sin
asignar; no se transfieren automáticamente a quien cree una cuenta en ese navegador.

## Política y aviso de privacidad

La ruta **`/privacidad` es pública y no depende de una sesión ni de la disponibilidad
de Google Auth**. Está disponible en español (`/privacidad?lang=es`, predeterminado)
e inglés (`/privacidad?lang=en`), con selector de idioma y enlaces desde el login
y el pie del chat. Bajo el botón de Google aparece «Al continuar aceptas la
política de privacidad». No se registra una aceptación por separado en la base
de datos. El login y el chat muestran además un aviso de privacidad sobre Gemini
y piden no compartir datos muy sensibles.

La política describe el nombre, correo y metadatos básicos de Google en Supabase
Auth para identificar la cuenta, el historial ligado a su UUID en Supabase y el
envío de mensajes y respuestas previas a la API de Gemini. El nivel gratuito de
Gemini puede usar ese contenido para mejorar productos de Google y permitir
revisión humana, según sus [condiciones](https://ai.google.dev/gemini-api/terms).
La app no añade automáticamente el nombre, correo o UUID al contexto de Gemini.

No se venden datos ni se comparten con terceros ajenos a los servicios descritos
en la política. Se explican expresamente Supabase, Google, las tipografías de
Google Fonts, las referencias enviadas a API.Bible si se habilita y los enlaces
externos de lectura. La privacidad entre usuarios no implica cifrado de extremo
a extremo. El usuario puede borrar conversaciones y sus mensajes desde el
historial; esto no elimina la cuenta ni revierte el procesamiento previo de los
proveedores. También se aclara que la reflexión bíblica no es consejo profesional
y que una crisis requiere ayuda humana o servicios de emergencia locales.

`GET /api/privacy/configuration` es público y devuelve únicamente
`{ "contactEmail": ... }`, con `contactEmail: null` si la variable falta o es inválida.
No publica credenciales ni datos de usuarios. Se lee desde el servidor al arrancar:
tras cambiar `.env`, reinicia la app; no requiere recompilar la interfaz.
Si falla esa petición, la política sigue legible y se informa de que el contacto
no pudo cargarse.

En producción, la URL será `https://tu-dominio.example/privacidad` (con el prefijo
de `BASE_PATH` si lo utilizas). Puedes usarla como URL de política de privacidad
en la configuración de consentimiento de Google una vez publicada la app.
`APP_ORIGIN` y el callback OAuth siguen funcionando como antes.

## Recomendaciones y NVI

Gemini recibe todos los mensajes aceptados de la conversación y puede recomendar
pasajes de cualquier libro. Se validan libros, capítulos y rangos usando metadatos
de numeración bíblica tradicional; esta validación no verifica por sí sola la
interpretación del modelo. El contexto y la reflexión se presentan como orientación.

La lectura predeterminada es **Nueva Versión Internacional (NVI)**. Sin un proveedor
de texto autorizado, las tarjetas muestran resumen, contexto, reflexión y un enlace
a Bible Gateway para leer el pasaje NVI completo. No se presentan paráfrasis del
modelo como citas literales.

Opcionalmente configura `BIBLE_API_KEY` y `BIBLE_ID_NVI` de una edición NVI a la
que tengas acceso en API.Bible para mostrar el texto y su atribución dentro de
la tarjeta. Si la fuente no responde, sigue disponible el enlace a la lectura.

Se conserva la preferencia de idioma y se recupera la conversación seleccionada
al recargar, usando una preferencia independiente para cada cuenta.

Para controlar consumo, cada mensaje admite hasta 4000 caracteres y cada sesión
hasta 100 mensajes o 120000 caracteres de contexto. Al llegar al límite se pide
empezar otra conversación; no se descarta historial silenciosamente. Hay límites
por IP y de concurrencia. Ante una cuota de Gemini agotada se informa al usuario;
no se cambia de modelo ni se activa un proveedor de pago automáticamente.

## Verificación

- `pnpm test`: referencias bíblicas, contexto de Gemini, SSE, validación de
  credenciales públicas, destinos OAuth, protección de la API y validación del
  contacto público de privacidad.
- `pnpm typecheck`: verificación de tipos de todo el workspace.
- `pnpm build`: tipos y compilación de servidor e interfaz.
- `pnpm test:privacy:browser`: después de compilar, verifica `/privacidad` sin
  sesión, ambos idiomas, contacto configurado/ausente y fallos de configuración.
  No requiere `.env`, base de datos, Google ni Gemini; mantiene Auth sin configurar,
  usa la ruta real del contacto y simula fallos de su carga.
- `pnpm test:auth`: después de compilar, comprueba el intercambio PKCE real de
  Supabase, renovación/cierre de sesión, aislamiento entre dos usuarios,
  paginación y RLS. Crea identidades temporales de Google y estados OAuth de
  prueba en la base de datos; no usa contraseñas ni envía correos ni llama a Gemini.
- `pnpm test:auth:browser`: después de compilar, prueba el botón de Google,
  callback PKCE, errores, persistencia y cierre/cambio de cuenta en escritorio y
  móvil, usando `http://127.0.0.1:20874` y un origen HTTPS de producción controlado.
  El consentimiento externo de Google se sustituye por códigos de prueba, que
  se intercambian de verdad con Supabase. Incluye comprobaciones de privacidad
  tras cerrar o cambiar la cuenta y navegación desde login/chat a la política
  sin perder el historial ni romper el acceso.

Las pruebas de Auth requieren `.env`, acceso al proyecto y permisos de migración
en PostgreSQL. Eliminan sus usuarios y datos al terminar. Las respuestas de
Gemini están controladas y no consumen cuota. La prueba de navegador usa
Playwright: instala Chromium con `pnpm exec playwright install chromium`, o usa
un Chrome existente con `CHROMIUM_EXECUTABLE_PATH=/ruta/al/chrome`. El puerto
20874 debe estar libre. Para comprobar el consentimiento real, inicia la app,
pulsa **Continuar con Google**, elige una cuenta autorizada y verifica el regreso
al chat; no se automatizan credenciales personales de Google.

Referencias: [Google con Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google),
[OAuth PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).

## Estructura

- `artifacts/api-server`: Express, autorización por cuenta e integración nativa de Gemini.
- `artifacts/psalm-chatbot`: React, chat y tarjetas bíblicas.
- `lib/api-zod/src/guide.ts`: contrato y validación de las recomendaciones.
- `lib/db/migrations`: esquema y migraciones de PostgreSQL.
- `lib/api-spec/openapi.yaml`: contrato de conversaciones y mensajes.
- `artifacts/mockup-sandbox`: entorno de diseño opcional; no es necesario para usar la app.
