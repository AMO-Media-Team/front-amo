# AMO — Advertising Market Optimization

Plataforma web que conecta **anunciantes** con **medios hiperlocales** de Colombia para contratar,
ejecutar, medir y liquidar pauta digital de forma estandarizada. Este repositorio contiene el
front-end (Next.js) y el esquema de la base de datos (Supabase).

> Si vas a desarrollar con un agente de IA, empieza por [`AGENTS.md`](AGENTS.md).

## Qué incluye hoy

- **Acceso seguro**: ingreso solo por invitación, verificación en dos pasos (TOTP) obligatoria para el
  equipo interno, recuperación de contraseña, cierre por inactividad y límite de intentos.
- **Administración**: usuarios, roles personalizados con matriz de permisos, bitácora de auditoría
  inmutable con visor de diferencias, registro de accesos y configuración del sistema (tarifas
  versionadas, comisiones, umbrales, parámetros tributarios).
- **Analítica**: paneles de inicio por rol, explorador geográfico en tres niveles (mundo → Colombia →
  municipios), siete reportes con exportación a Excel y PDF, e insights automáticos.
- **Operación (consulta)**: medios, anunciantes, campañas, ofertas y asignaciones con su línea de
  tiempo.
- **Base de datos completa del negocio**: máquinas de estado, motor de precios configurable, reserva
  atómica de cupos, liquidaciones, disputas, notificaciones y procesos programados.
- **Identidad visual propia**: tema oscuro (principal) y claro, logo e iconos, animaciones y diseño
  responsive para escritorio, tablet y móvil.

## Requisitos

- Node.js ≥ 22.12 y pnpm 12
- Un proyecto de Supabase (Postgres 17) y un token público de Mapbox
- Opcional: CLI de Supabase (`supabase login`) para regenerar tipos y aplicar migraciones

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local      # completa las variables (cada una está documentada en el archivo)
pnpm dev                        # http://localhost:3000
```

### Variables de entorno

| Variable                                                           | Uso                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Conexión pública a Supabase                                                       |
| `SUPABASE_SECRET_KEY`                                              | Clave secreta (solo servidor): gestión de usuarios y procedimientos privilegiados |
| `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_MAPBOX_STYLE`             | Mapas (restringe el token por URL)                                                |
| `NEXT_PUBLIC_SITE_URL`                                             | URL pública del sitio (enlaces de invitación y recuperación)                      |
| `AMO_SERVIDOR_SECRET`                                              | Secreto compartido servidor ↔ base de datos (también guardado en Supabase Vault)  |
| `AMO_CIFRADO_KEY`                                                  | Clave de cifrado de datos sensibles (`k1:<base64 de 32 bytes>`)                   |
| `SUPERADMIN_EMAIL`                                                 | Correo del primer superadministrador                                              |
| `AMO_SMTP_CONFIGURADO`                                             | `true` cuando Supabase Auth tenga SMTP propio                                     |
| `AMO_CSP_MODO`                                                     | `enforce` (por defecto) o `report`                                                |

El build falla con un mensaje claro si falta una variable obligatoria.

### Base de datos

Las migraciones están en `supabase/migrations/` y son inmutables. Para un proyecto nuevo:

```bash
supabase link --project-ref <ref>
supabase db push                 # aplica todas las migraciones
pnpm db:types                    # regenera src/types/database.types.ts
```

Guarda en Supabase Vault el mismo valor de `AMO_SERVIDOR_SECRET` con el nombre `amo_servidor_secret`.

Ajustes de **Authentication** en el panel de Supabase:

1. _Sign In / Providers_: desactivar «Allow new users to sign up» y los ingresos anónimos.
2. _Email_: contraseña mínima de 12 caracteres con minúsculas, mayúsculas, dígitos y símbolos;
   «Email OTP Expiration» en 86400 s.
3. _Sessions_: «Access token expiry» en 600 s (recomendado).
4. _URL Configuration_: Site URL y Redirect URLs del sitio (`/auth/callback`, `/auth/confirm`).
5. _Rate Limits_: activar «IP Address Forwarding».
6. _Realtime → Settings_: desactivar «Allow public access».

### Primer ingreso

```bash
pnpm bootstrap:superadmin
```

Imprime un enlace de un solo uso (vigente 24 h). Al abrirlo defines tu contraseña y configuras la
verificación en dos pasos con una app autenticadora.

### Si alguien pierde su autenticador

Un superadministrador puede restablecer la verificación en dos pasos de cualquier persona desde
_Administración → Usuarios_. Si quien la perdió es el único superadministrador, quien administra el
servidor ejecuta:

```bash
pnpm bootstrap:restablecer-mfa            # usa SUPERADMIN_EMAIL; admite otro correo como argumento
```

Borra los factores de esa cuenta, lo registra en la bitácora e imprime un enlace de un solo uso para
definir una contraseña nueva y configurar el nuevo dispositivo.

### Datos de demostración

La base incluye 15 meses de operación simulada (40 anunciantes, 300 medios, 5.396 asignaciones,
liquidaciones, facturas y accesos desde 15 países), toda marcada como `es_demo`, y una cuenta por rol
(`demo.admin`, `demo.operaciones`, `demo.finanzas`, `demo.anunciante`, `demo.medio`, todas
`@amo.test`; credenciales `DEMO_*` en `.env.local`).

Se genera en dos partes porque los interruptores de carga solo funcionan como propietario de la base
de datos: las cuentas con `pnpm demo:generar usuarios` y los datos ejecutando en orden los SQL de
`supabase/seed/demo/`. El detalle, y cómo purgarlos con `pnpm demo:purgar`, está en
[`supabase/seed/demo/README.md`](supabase/seed/demo/README.md).

## Comandos

| Comando                                            | Qué hace                                                        |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`           | Desarrollo, compilación y servidor de producción                |
| `pnpm typecheck` · `pnpm lint` · `pnpm format`     | Tipos, ESLint y Prettier                                        |
| `pnpm test` · `pnpm test:e2e`                      | Pruebas unitarias (Vitest) y de extremo a extremo (Playwright)  |
| `pnpm geo:build`                                   | Regenera GeoJSON optimizados, diccionarios y semilla geográfica |
| `pnpm brand:build`                                 | Regenera logos e iconos                                         |
| `pnpm db:types` · `pnpm db:permisos`               | Tipos de la base de datos · semilla del catálogo de permisos    |
| `pnpm bootstrap:superadmin` · `pnpm bootstrap:e2e` | Superadministrador · cuentas de prueba                          |

## Estructura

```
src/app/            Rutas: (auth) acceso · (app) secciones privadas · api
src/components/     ui (shadcn/Base UI), layout, data-table, charts, kpi, maps, brand, motion, feedback
src/features/       Un directorio por dominio: acciones, consultas, esquemas, componentes y pruebas
src/lib/            auth (DAL, permisos, navegación), supabase, geo, export, utilidades
scripts/            geo, brand, db, bootstrap, demo, pruebas
supabase/           migrations, seed, tests
e2e/                Playwright
docs/               Guía de desarrollo, modelo de datos, KPIs, geodatos, marca
public/data/geo/    GeoJSON optimizados (países, departamentos y municipios por departamento)
```

## Documentación

- [`docs/guia-desarrollo.md`](docs/guia-desarrollo.md) — convenciones, stack y flujo de trabajo
- [`docs/chuleta-apis.md`](docs/chuleta-apis.md) — patrones verificados del código
- [`docs/modelo-datos.md`](docs/modelo-datos.md) — tablas, seguridad, funciones, estados y permisos
- [`docs/kpis.md`](docs/kpis.md) — indicadores e insights
- [`docs/geodatos.md`](docs/geodatos.md) — mapas y diccionarios geográficos
- [`docs/marca.md`](docs/marca.md) — identidad visual

## Seguridad

- Autorización en la base de datos (RLS por tabla, permisos por rol, sesión validada en cada
  consulta) y verificada otra vez en el servidor antes de cada página y acción.
- Content Security Policy con nonce, cabeceras de seguridad y cookies de sesión con caducidad corta.
- Datos sensibles en tablas privadas con acceso registrado; bitácora de solo inserción.
- Archivos en buckets privados con URLs firmadas de corta vigencia.
- La carpeta `context/` (documentos del cliente) y `.env.local` no se versionan.

## Despliegue en Vercel

1. Importa el repositorio y define las variables de entorno (las de la tabla anterior) para
   **Production**. En _Preview_ no publiques `SUPABASE_SECRET_KEY` salvo que uses un proyecto de
   Supabase separado.
2. `vercel.json` fija la región `iad1`, junto a la base de datos.
3. Actualiza en Supabase la Site URL y las Redirect URLs con el dominio final, y añade el dominio a
   las restricciones del token de Mapbox.

### Antes de salir a producción

- [ ] Planes de pago: Supabase Pro (copias de seguridad, sin pausa por inactividad) y Vercel Pro (el
      plan Hobby no permite uso comercial).
- [ ] SMTP propio en Supabase Auth (el integrado solo envía al equipo, 2 correos por hora) y
      `AMO_SMTP_CONFIGURADO=true`.
- [ ] Purgar datos y cuentas de demostración y de pruebas (`pnpm demo:purgar`; cuentas `e2e.*`).
- [ ] Validar con el contador los valores tributarios y de tarifas marcados «pendiente de validación».
- [ ] Rotar los secretos usados durante el desarrollo.
