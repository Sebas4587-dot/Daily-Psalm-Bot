export const PRIVACY_NOTICE = {
  es: "Tus mensajes se envían a Gemini. Su nivel gratuito puede usarlos para mejorar productos de Google y permitir revisión humana. No compartas datos muy sensibles.",
  en: "Your messages are sent to Gemini. Its free tier may use them to improve Google products and allow human review. Do not share highly sensitive data.",
} as const;

export const PRIVACY_CONTENT = {
  es: {
    title: "Política de privacidad",
    brand: "Guía bíblica",
    back: "Volver a la app",
    language: "Idioma de la política",
    updated: "Última actualización: 28 de octubre de 2026",
    intro:
      "Esta política explica cómo Guía bíblica trata tus datos cuando accedes con Google y conversas para encontrar una reflexión bíblica. Puedes leerla sin crear una cuenta ni iniciar sesión.",
    notice: "Antes de compartir",
    sections: [
      {
        title: "Tu cuenta de Google",
        paragraphs: [
          "Supabase Auth guarda el nombre y el correo de tu cuenta de Google para identificarte, mostrar tu perfil y asociar tu historial a tu cuenta. También mantiene tu identificador de usuario, los metadatos básicos de perfil que entrega Google y los datos de sesión necesarios para autenticarte.",
          "La app no pide acceso a Gmail, Drive ni tus contactos. No añade automáticamente tu nombre, correo ni identificador de cuenta a las solicitudes de Gemini; si los escribes en el chat, formarán parte del mensaje enviado.",
        ],
      },
      {
        title: "Tus conversaciones en Supabase",
        paragraphs: [
          "Los mensajes que envías, las respuestas generadas, los títulos y las fechas de las conversaciones se guardan en la base de datos de Supabase, asociados al identificador de tu cuenta. El título inicial se forma con el comienzo de tu primer mensaje.",
          "La app restringe el acceso al historial a su propietario mediante la sesión verificada y políticas de acceso en la base de datos. Esa privacidad entre cuentas no es cifrado de extremo a extremo: el servidor y los proveedores necesarios procesan los datos para ofrecer el servicio.",
        ],
      },
      {
        title: "Mensajes enviados a Gemini de Google",
        paragraphs: [
          "Para generar una respuesta, el servidor envía a la API de Gemini los mensajes y las respuestas anteriores de la conversación, junto con el idioma y las instrucciones de reflexión bíblica.",
          "En el nivel gratuito de Gemini, Google puede usar los mensajes y las respuestas para mejorar sus productos, y personas revisoras pueden leer y procesar ese contenido, según las condiciones aplicables de Google. Evita información personal, confidencial o muy sensible.",
        ],
      },
      {
        title: "Proveedores y otras conexiones",
        paragraphs: [
          "No vendemos tus datos ni los compartimos con terceros ajenos a los servicios descritos aquí. Supabase proporciona la autenticación y el almacenamiento; Google proporciona el acceso con tu cuenta y Gemini. Esos proveedores tratan los datos de acuerdo con sus propias condiciones y políticas.",
          "La interfaz descarga tipografías de Google Fonts, lo que comunica datos técnicos de conexión, como tu dirección IP. Si se habilita la fuente opcional API.Bible, solo se le envían referencias de pasajes, nunca el contenido del chat. Al abrir una lectura en Bible Gateway sales a un sitio con sus propias prácticas de privacidad.",
        ],
      },
      {
        title: "Conservación y eliminación",
        paragraphs: [
          "Tus conversaciones se conservan para que puedas retomarlas. Puedes borrar cualquiera desde el historial, con la opción de eliminar y su confirmación; esto elimina la conversación y sus mensajes de la base de datos activa de la app. Cerrar sesión no borra el historial.",
          "Borrar una conversación no borra tu cuenta de Google o Supabase ni revierte el tratamiento que Google ya haya realizado. Los registros y copias de seguridad de los proveedores están sujetos a sus propias políticas de conservación. Para consultas sobre tus datos o tu cuenta, utiliza el contacto indicado abajo cuando esté configurado.",
        ],
      },
      {
        title: "Datos en tu navegador",
        paragraphs: [
          "El navegador conserva los tokens de la sesión de Supabase para mantener el acceso, la preferencia de idioma y el identificador de la última conversación elegida para cada cuenta. La app no usa esos datos para publicidad. Cierra tu sesión al terminar en un dispositivo compartido.",
        ],
      },
      {
        title: "Comparte con cuidado y busca apoyo humano",
        paragraphs: [
          "No compartas contraseñas, documentos de identidad, datos financieros, información médica detallada ni datos personales de otras personas. Expresa lo que sientes sin incluir detalles que te identifiquen o que sean confidenciales.",
          "La app ofrece reflexión bíblica generada con inteligencia artificial y puede equivocarse. No ofrece consejo profesional ni sustituye atención médica, psicológica, legal u otra ayuda especializada. En una crisis o si hay peligro inmediato, contacta los servicios de emergencia locales o una persona de confianza; no esperes una respuesta del chat para pedir ayuda.",
        ],
      },
    ],
    contactTitle: "Contacto de privacidad",
    contactIntro:
      "Para preguntas sobre esta política o el tratamiento de tus datos:",
    contactMissing:
      "El correo de contacto todavía no está configurado. Se publicará aquí cuando la persona responsable de la app lo indique.",
    contactUnavailable:
      "No pudimos cargar el correo de contacto. La política sigue disponible; vuelve a cargar la página para intentarlo de nuevo.",
    contactLoading: "Cargando el contacto…",
    providersTitle: "Políticas de los proveedores",
    geminiTerms: "Condiciones de la API de Gemini",
    googlePrivacy: "Privacidad de Google",
    supabasePrivacy: "Privacidad de Supabase",
  },
  en: {
    title: "Privacy policy",
    brand: "BibleGuide",
    back: "Back to the app",
    language: "Policy language",
    updated: "Last updated: October 28, 2026",
    intro:
      "This policy explains how BibleGuide handles your data when you sign in with Google and chat to find a biblical reflection. You can read it without creating an account or signing in.",
    notice: "Before you share",
    sections: [
      {
        title: "Your Google account",
        paragraphs: [
          "Supabase Auth stores your Google account name and email to identify you, display your profile and link your history to your account. It also keeps your user identifier, the basic profile metadata provided by Google and the session data needed to authenticate you.",
          "The app does not request access to Gmail, Drive or your contacts. It does not automatically add your name, email or account identifier to Gemini requests; if you type them in the chat, they become part of the message sent.",
        ],
      },
      {
        title: "Your conversations in Supabase",
        paragraphs: [
          "The messages you send, generated responses, conversation titles and dates are stored in the Supabase database, linked to your account identifier. The initial title comes from the beginning of your first message.",
          "The app restricts history access to its owner through a verified session and database access policies. Privacy between accounts is not end-to-end encryption: the server and necessary providers process data to deliver the service.",
        ],
      },
      {
        title: "Messages sent to Google Gemini",
        paragraphs: [
          "To generate a response, the server sends the messages and earlier responses in the conversation to the Gemini API, along with the language and instructions for biblical reflection.",
          "On Gemini’s free tier, Google may use messages and responses to improve its products, and human reviewers may read and process that content, subject to Google’s applicable terms. Avoid personal, confidential or highly sensitive information.",
        ],
      },
      {
        title: "Providers and other connections",
        paragraphs: [
          "We do not sell your data or share it with third parties outside the services described here. Supabase provides authentication and storage; Google provides account sign-in and Gemini. These providers process data under their own terms and privacy policies.",
          "The interface downloads fonts from Google Fonts, which receives technical connection data such as your IP address. If the optional API.Bible source is enabled, it receives passage references only, never chat content. Opening a reading on Bible Gateway takes you to a site with its own privacy practices.",
        ],
      },
      {
        title: "Retention and deletion",
        paragraphs: [
          "Conversations are kept so you can return to them. You can delete any conversation from the history using the delete option and its confirmation; this removes the conversation and its messages from the app’s active database. Signing out does not delete your history.",
          "Deleting a conversation does not delete your Google or Supabase account or undo processing Google has already performed. Provider logs and backups follow their own retention policies. For questions about your data or account, use the contact below when it is configured.",
        ],
      },
      {
        title: "Data in your browser",
        paragraphs: [
          "Your browser keeps Supabase session tokens to maintain sign-in, your language preference and the identifier of the last conversation selected for each account. The app does not use this data for advertising. Sign out when you finish on a shared device.",
        ],
      },
      {
        title: "Share carefully and seek human support",
        paragraphs: [
          "Do not share passwords, identity documents, financial data, detailed medical information or other people’s personal data. Express your feelings without including identifying or confidential details.",
          "The app offers biblical reflection generated by artificial intelligence and can make mistakes. It does not provide professional advice or replace medical, psychological, legal or other specialist support. In a crisis or immediate danger, contact local emergency services or a trusted person; do not wait for a chat response before seeking help.",
        ],
      },
    ],
    contactTitle: "Privacy contact",
    contactIntro:
      "For questions about this policy or how your data is handled:",
    contactMissing:
      "A contact email has not been configured yet. It will appear here when the person responsible for the app provides it.",
    contactUnavailable:
      "We could not load the contact email. The policy is still available; reload the page to try again.",
    contactLoading: "Loading contact…",
    providersTitle: "Provider policies",
    geminiTerms: "Gemini API terms",
    googlePrivacy: "Google privacy policy",
    supabasePrivacy: "Supabase privacy policy",
  },
} as const;
