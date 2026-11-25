# Plantillas de correo de Supabase Auth

Supabase no lee estos archivos automáticamente: hay que copiarlos al dashboard.

## Restablecer contraseña — `reset-password.html`

1. Supabase › **Authentication › Emails › Templates › Reset Password**.
2. **Subject:** `Restablece tu contraseña de GYM ADMIN`
3. **Message body:** pega el contenido completo de `reset-password.html` y guarda.

Variables que usa: `{{ .ConfirmationURL }}` (enlace con `redirect_to` a `/restablecer`) y `{{ .Email }}`.

Requisitos para que funcione:
- `https://gym-app-bdi.pages.dev/restablecer` (y `https://*.gym-app-bdi.pages.dev/**` para previews)
  en **Authentication › URL Configuration › Redirect URLs**.
- SMTP propio en **Authentication › Emails › SMTP Settings**: con el SMTP por defecto solo llegan
  correos a miembros del equipo del proyecto y las plantillas personalizadas no se conservan.
- El texto "vence en 1 hora" asume el valor por defecto de expiración del enlace (Email OTP Expiration = 3600 s).
  Si lo cambias en Authentication › Providers › Email, actualiza el texto.
