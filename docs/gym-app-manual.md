# Manual del Proyecto — Gym App

Este documento explica cómo está construida la aplicación, por qué se tomaron ciertas decisiones, y cómo se usa cada pantalla. Sirve como referencia tanto para quien programa (tú o Dany) como para entender el sistema desde una vista general.

---

## 1. Resumen y stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Angular 18 (standalone components), Tailwind CSS |
| Backend / Base de datos | Supabase (Postgres + Auth + RLS + Realtime no usado aún) |
| Calendario visual | FullCalendar (`@fullcalendar/angular`) |
| Hosting de código | GitHub (repo privado `rdelfino101-jpg/gym-app`) |
| Entorno de desarrollo | Node 20 LTS (vía nvm-windows), Angular CLI 18 |

**Por qué este stack:** Angular 18 con componentes standalone evita la sobrecarga de NgModules tradicionales. Supabase se eligió porque da autenticación, base de datos relacional (Postgres) y control de acceso a nivel de fila (RLS) sin tener que construir un backend propio desde cero — ideal para un proyecto de este tamaño operado por una sola persona programando.

---

## 2. Arquitectura general

```
Angular (navegador) 
   │
   │  supabase-js (cliente JS)
   ▼
Supabase Auth  ──┐
Supabase DB (Postgres) ──┤──► Row Level Security (RLS) decide qué filas ve cada usuario
Funciones RPC (lógica de negocio atómica) ──┘
```

**Idea clave:** casi toda la lógica de negocio sensible (reservar una clase, cancelarla, aprobar una membresía) **no vive en Angular**, vive en funciones de Postgres (`security definer`) que se llaman vía RPC. Esto es intencional: evita que alguien manipule la lógica desde las herramientas de desarrollador del navegador, y garantiza que operaciones como "reservar el último cupo" sean atómicas (sin condiciones de carrera entre dos usuarios reservando al mismo tiempo).

---

## 3. Base de datos (Supabase / Postgres)

### 3.1 Tablas principales

| Tabla | Propósito |
|---|---|
| `profiles` | Extiende `auth.users` con nombre, apellido, teléfono, rol (`cliente`/`admin`), estado de cuenta |
| `planes_membresia` | Catálogo de planes: ilimitado, paquete (N clases), por clase |
| `membresias_usuario` | Membresía activa/pendiente de cada cliente, con créditos restantes si aplica |
| `pagos` | Registro de pagos (manual hoy, preparado para pasarela automática después) |
| `instructores` | Catálogo de instructores |
| `clases` | Catálogo de tipos de clase (CrossFit, Yoga, etc.) |
| `horarios` | Horario recurrente semanal (`dia_semana` + `hora`) **o** evento especial de fecha única (`fecha_especifica`) — nunca ambos a la vez (hay un `check constraint` que lo obliga) |
| `excepciones_horario` | Excepciones puntuales sobre un horario recurrente: cancelar ese día específico, o cambiar el instructor solo ese día |
| `reservas` | Reservas de clientes a horarios en una fecha específica |
| `configuracion_marca` | Nombre del gym y color de acento, editable y persistente |

### 3.2 Seguridad (RLS)

Todas las tablas tienen Row Level Security activado. La regla general:
- **Cliente**: solo ve/edita sus propios datos (su perfil, su membresía, sus reservas, sus pagos).
- **Admin**: ve y gestiona todo.

Esto se resuelve con una función auxiliar `is_admin()` (marcada `security definer` para evitar recursión infinita al consultar la propia tabla `profiles` dentro de sus propias políticas).

**Importante:** además de las políticas de RLS, cada tabla necesitó permisos base (`grant select/insert/update/delete`) para los roles `authenticated` y `anon` — RLS decide *qué filas*, pero antes de eso Postgres necesita permiso para *intentar* la operación. Si una tabla nueva aparece como "API disabled" en el dashboard de Supabase, casi siempre falta este `grant`.

### 3.3 Funciones RPC (lógica de negocio crítica)

| Función | Qué hace |
|---|---|
| `handle_new_user()` (trigger en `auth.users`) | Al registrarse un cliente, crea automáticamente su `profile` y su `membresia_usuario` (en estado `pendiente`) usando los metadatos enviados en el registro (nombre, apellido, teléfono, plan elegido) |
| `aprobar_membresia(membresia_id, monto)` | El admin aprueba una membresía pendiente: la activa, activa la cuenta del cliente, y registra el pago — todo en una sola operación atómica |
| `rechazar_membresia(membresia_id)` | Marca la membresía como rechazada (no se borra, se conserva el historial) |
| `reservar_clase(horario_id, fecha_clase)` | Verifica cupo disponible, verifica membresía activa y créditos, verifica que no haya una excepción de "cancelada" para esa fecha, descuenta crédito si aplica, y crea la reserva — todo con bloqueo de fila para evitar que dos personas reserven el mismo último cupo simultáneamente |
| `cancelar_reserva(reserva_id)` | Verifica la política de cancelación (configurable en `configuracion_marca.horas_cancelacion`, por defecto 2 horas), cancela la reserva, y devuelve el crédito si el plan era de tipo paquete |

---

## 4. Frontend (Angular)

### 4.1 Estructura de carpetas relevante

```
src/app/
├── core/
│   ├── auth.service.ts       ← Estado de sesión, login/registro/logout, señal de perfil
│   ├── supabase.service.ts   ← Cliente único de Supabase, reusado en toda la app
│   └── guards/
│       ├── auth.guard.ts     ← Bloquea rutas si no hay sesión
│       └── admin.guard.ts    ← Bloquea rutas de admin si el rol no es admin
├── shared/
│   └── app-shell/            ← Layout compartido: header con nombre del gym, navegación admin, botón cerrar sesión
├── auth/
│   ├── login/
│   └── registro/
├── admin/
│   ├── dashboard/             ← Aprobar/rechazar membresías pendientes
│   ├── instructores/
│   ├── clases/
│   └── horarios/              ← CRUD + calendario visual + excepciones
└── cliente/
    └── dashboard/              ← Reservar clases, ver/cancelar reservas propias
```

### 4.2 Rutas y guards

- `/login`, `/registro` → públicas, sin shell (tienen su propio diseño de pantalla completa)
- `/admin/*` → requiere `authGuard` + `adminGuard`, envuelto en `AppShellComponent`
- `/app/*` → requiere `authGuard`, envuelto en `AppShellComponent`

**Detalle técnico importante:** los guards son funciones **async** que hacen `await auth.ready()` antes de decidir. Esto evita un bug real que ya se presentó: al refrescar la página, la sesión tarda unos milisegundos en cargarse desde Supabase, y sin ese `await`, el guard podía rechazar a un usuario válido por evaluarse demasiado pronto.

### 4.3 AuthService

Mantiene una señal (`signal`) reactiva `profile` con los datos del usuario logueado (incluye su `rol`). Expone `signUp`, `signIn`, `signOut`, `isAdmin()`, y una promesa `ready()` que los guards esperan antes de tomar decisiones.

---

## 5. Guía de interfaz — qué hace cada pantalla

### Pantallas públicas

- **Login** (`/login`): correo + contraseña. Redirige a `/admin` o `/app` según el rol detectado tras iniciar sesión.
- **Registro** (`/registro`): nombre, apellido, correo, teléfono, contraseña, y selección de plan de membresía. Al enviarse, Supabase exige confirmar el correo antes de permitir el primer login.

### Panel de administrador (`/admin/...`)

- **Solicitudes** (`/admin`): lista de membresías pendientes de aprobación. El admin puede ajustar el monto a cobrar (por si hay descuentos) antes de aprobar, o rechazar la solicitud.
- **Instructores** (`/admin/instructores`): crear instructores y activar/desactivar (no se borran físicamente, para conservar el historial de horarios pasados).
- **Clases** (`/admin/clases`): mismo patrón para el catálogo de tipos de clase.
- **Horarios** (`/admin/horarios`): la pantalla más compleja. Permite:
  - Crear horarios **recurrentes** (ej. "CrossFit todos los lunes a las 6am") o eventos **especiales de una sola vez** (ej. una clase única de temporada).
  - Crear **excepciones puntuales** sobre un horario recurrente: cancelar una fecha específica, o cambiar el instructor solo ese día, sin afectar las demás semanas.
  - Un calendario visual (vista día/semana/mes) que refleja todo lo anterior — genera eventos concretos para las próximas 10 semanas (no es un calendario "infinito" por razones de rendimiento).

### Panel de cliente (`/app`)

- **Mis próximas reservas**: lista de reservas activas con botón de cancelar (respeta la política de horas mínimas de cancelación).
- **Próximas clases disponibles**: la próxima ocurrencia de cada horario activo (considerando excepciones y eventos especiales), con indicador de cupo ocupado y botón de reservar. Si la membresía del cliente está `pendiente` de aprobación, puede ver la pantalla pero no reservar.

---

## 6. Decisiones de diseño importantes (y por qué)

- **Aprobación manual de membresías con monto editable**: el admin siempre revisa antes de activar una cuenta, para que el pago (hoy manual) nunca sea una sorpresa.
- **Soft delete en vez de borrado físico**: instructores, clases, horarios, membresías rechazadas — todo se desactiva/marca, nunca se borra, para conservar historial y evitar romper referencias de reservas pasadas.
- **Horarios recurrentes + excepciones, no un calendario 100% manual**: se decidió así para no obligar al admin a crear cada clase manualmente semana por semana, pero sí darle control puntual cuando algo cambia (feriado, instructor enfermo).
- **Reservas y cancelaciones vía funciones RPC atómicas**, no lógica en Angular: evita condiciones de carrera y asegura que las reglas de negocio (cupo, créditos, política de cancelación) se cumplan siempre, sin importar desde dónde se llame a la API.

---

## 7. Pendientes y limitaciones conocidas

- El servicio de correo por defecto de Supabase tiene límites bajos de envío — antes de producción real con usuarios, se necesita configurar SMTP propio (Resend, SendGrid, etc.).
- La integración con Google Calendar (que el cliente/instructor vean la reserva con recordatorio) **no está construida todavía**. La opción más simple discutida es un link de "Agregar a Google Calendar" al confirmar una reserva (sin necesidad de OAuth); la integración completa vía API requeriría que cada usuario autorice la app individualmente.
- El calendario de horarios en admin solo genera eventos para las próximas 10 semanas.
- No hay pasarela de pago automática todavía — el modelo de datos ya está preparado para agregarla (campo `referencia_externa` en `pagos`) pero la integración real es trabajo futuro.
- Multi-sede no está contemplado — el sistema asume una sola ubicación física.

---

## 8. Cómo continuar / extender el proyecto

1. Clona el repo y sigue la guía de entorno (sección 9) en cualquier máquina nueva.
2. Antes de tocar una tabla o función nueva, revisa si ya existe una función RPC relacionada — la lógica de negocio sensible debe vivir ahí, no en Angular.
3. Si agregas una tabla nueva, no olvides: activar RLS, crear las políticas, y correr los `grant` de permisos — de lo contrario aparecerá como "API disabled".
4. Cualquier pantalla nueva de admin va dentro de `src/app/admin/`, se registra en `admin.routes.ts`, y se le agrega su link en el menú de navegación en `app-shell.component.html`.

## 9. Guía de entorno (para nueva laptop o colaborador)

```powershell
winget install OpenJS.NodeJS.LTS
winget install GitHub.cli
# cerrar/abrir PowerShell entre cada instalación

git config --global user.name "Tu Nombre"
git config --global user.email "tu-correo@ejemplo.com"
gh auth login

gh repo clone rdelfino101-jpg/gym-app
cd gym-app
npm install -g @angular/cli@18
npm install
```

Verifica que existan `src/environments/environment.ts` y `environment.development.ts` (no viajan en el repo por seguridad). Si faltan, créalos con:

```typescript
export const environment = {
  production: false,
  supabaseUrl: 'https://wbmcmbekoyxigedxzmrq.supabase.co',
  supabaseKey: 'TU_ANON_KEY_AQUI'
};
```

Luego `ng serve` desde la raíz del proyecto (nunca desde una subcarpeta como `src/app`, o Tailwind y Angular CLI no resolverán las rutas correctamente).
