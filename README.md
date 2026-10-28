# Guía bíblica · NVI

Chat en español e inglés que escucha cómo te sientes y recomienda pasajes de los
66 libros de la Biblia. Cada tarjeta distingue idea central, contexto y aplicación
personal. Usa Gemini y PostgreSQL de Supabase; no hay respuestas simuladas ni base
de datos local.

El proyecto se ejecuta con Node.js, pnpm y Vite, sin plugins de un editor ni
servicios de alojamiento obligatorios. La configuración de desarrollo y
producción se encuentra en este repositorio.

## Configuración

Requiere Node.js 20.19 o superior (también funciona con Node 24) y pnpm 10.32.1.

1. Ejecuta `pnpm install --frozen-lockfile`.
2. Copia `.env.example` a `.env` y completa `DATABASE_URL`, `GEMINI_API_KEY` y
   `GEMINI_MODEL` (por defecto `gemini-3.5-flash-lite`). No subas `.env` a Git.
3. Usa la URI de Supabase **Connect → Session pooler**, puerto 5432, con la
   contraseña codificada para URL. Se necesitan conexiones de sesión para los
   bloqueos que evitan respuestas simultáneas en una conversación.
4. Descarga el certificado de **Database Settings → SSL Configuration**. Guárdalo
   en la raíz como `prod-ca-2021.crt` o `prod-supabase.cer`, o indica la ruta en
   `DATABASE_SSL_CA_FILE`. La aplicación verifica el certificado y el hostname;
   no desactiva la verificación SSL.
5. Ejecuta `pnpm dev`. Aplica las migraciones y levanta el servidor en 8080 y la
   interfaz en <http://127.0.0.1:20874>. Los datos y las respuestas vienen de los
   servicios remotos configurados.

El arranque carga `.env`; las variables del entorno del alojamiento tienen prioridad.
Los comandos individuales de paquetes requieren que el entorno ya esté cargado.

## Producción

Ejecuta `pnpm build` y luego `pnpm start`. El servidor sirve la interfaz compilada
y `/api` desde el mismo origen, en `API_PORT` (o `PORT`, si lo proporciona el
alojamiento). Configura `HOST=0.0.0.0`, `APP_ORIGIN` con la URL pública y
`COOKIE_SECURE=true` cuando el alojamiento use HTTPS. El servicio de alojamiento
debe permitir conexiones salientes a Supabase y a Google. La aplicación no se
publica automáticamente al configurar las credenciales.

`pnpm db:setup` aplica las migraciones versionadas sin iniciar los servidores.
No usa `drizzle-kit push --force` ni elimina conversaciones existentes. Las
migraciones habilitan RLS sin políticas públicas: el servidor accede como dueño
de las tablas, y las claves públicas de Supabase no permiten leer los chats.

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

Se conserva la preferencia de idioma y se recupera la conversación al recargar.
Una cookie HttpOnly identifica al navegador y cada consulta comprueba la propiedad
del chat. No es un sistema de cuentas ni permite recuperar conversaciones desde
otro navegador. Las conversaciones anteriores sin propietario permanecen en la
base, pero no se asignan a visitantes nuevos.

Para controlar consumo, cada mensaje admite hasta 4000 caracteres y cada sesión
hasta 100 mensajes o 120000 caracteres de contexto. Al llegar al límite se pide
empezar otra conversación; no se descarta historial silenciosamente. Hay límites
por IP y de concurrencia. Ante una cuota de Gemini agotada se informa al usuario;
no se cambia de modelo ni se activa un proveedor de pago automáticamente.

## Verificación

- `pnpm test`: referencias, contexto enviado a Gemini, cuotas y respuestas SSE.
- `pnpm typecheck`: verificación de tipos de todo el workspace.
- `pnpm build`: tipos y compilación de servidor e interfaz.

Las pruebas automáticas usan respuestas controladas y no consumen la cuota de
Gemini. Las comprobaciones reales contra los servicios se realizan por separado.

## Estructura

- `artifacts/api-server`: Express, sesiones privadas e integración nativa de Gemini.
- `artifacts/psalm-chatbot`: React, chat y tarjetas bíblicas.
- `lib/api-zod/src/guide.ts`: contrato y validación de las recomendaciones.
- `lib/db/migrations`: esquema y migraciones de PostgreSQL.
- `lib/api-spec/openapi.yaml`: contrato de conversaciones y mensajes.
- `artifacts/mockup-sandbox`: entorno de diseño opcional; no es necesario para usar la app.
