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

### Entornos

| Entorno    | Supabase                              | Variables         | Datos                                |
| ---------- | ------------------------------------- | ----------------- | ------------------------------------ |
| Producción | `oriuuuaczpncmtglfgpv` (ca-central-1) | `.env.produccion` | Solo los reales (nació vacío)        |
| Desarrollo | `zygfqfvqwfvhbirmjojp`                | `.env.local`      | 15 meses de demo y cuentas de prueba |

`.env.produccion` (ignorado por git; Next no lo carga en local) contiene las variables que se importan
en Vercel. Los scripts de arranque apuntan a otro entorno con `AMO_ARCHIVO_ENTORNO`, p. ej.
`AMO_ARCHIVO_ENTORNO=.env.produccion pnpm bootstrap:superadmin`. Lo que crea datos de prueba (E2E,
cuentas de pista, demo, carrera de cupos) se niega a correr contra producción.

### Base de datos

Las migraciones están en `supabase/migrations/` y son inmutables. Para un proyecto nuevo (así se
montó producción):

1. URL del _Session pooler_ (_Connect → Session pooler_, usuario `postgres.<ref>`, puerto 5432;
   contraseña alfanumérica o codificada) en un archivo `.env.db` (git lo ignora). Con `--linked` no sirve: el CLI entra como
   `cli_login_*` y las migraciones de roles y tarifas exigen `session_user = 'postgres'`.
2. `supabase db push --db-url "$SUPABASE_DB_URL" --skip-vault` — las 45 migraciones, con catálogos,
   permisos, geografía, buckets y procesos programados. Sin `--include-seed`: `supabase/seed/demo`
   nunca va a producción.
3. Vault: secreto `amo_servidor_secret` con el mismo valor que `AMO_SERVIDOR_SECRET` (como
   `postgres`: `select vault.create_secret('<valor>', 'amo_servidor_secret')`).
4. Suites `supabase/tests/*.sql` (todas en `begin … rollback`) **antes** de la purga: algunas usan el
   anunciante de pruebas. `humo_roles_permisos_aplicables` exige un superadministrador activo y se corre
   tras el primer ingreso; en una base recién montada, `a02` de `humo_bitacora_indice` falla por
   volumen, no por esquema (ver su cabecera).
5. La migración `negocio_actores` crea el anunciante de pruebas `e2e00000-0000-4000-8000-00000000a001`
   (lo usan las suites SQL y E2E). En producción se purga como `postgres` en una transacción:
   `set local amo.modo_carga='on'; set local amo.purga='on'; select private.purgar_demo();` y se borra
   su fila de la bitácora (`entidad='anunciantes'`, `entidad_id` = ese id).
6. Tipos: `pnpm db:types` (o MCP `generate_typescript_types`).

### Ajustes del panel de Supabase

Un proyecto nuevo nace con registro abierto, enlaces de 1 h y Site URL en localhost: hazlos **antes
de desplegar**. Ruta base: `https://supabase.com/dashboard/project/<ref>/…`.

1. _Authentication → Sign In / Providers_: desactivar «Allow new users to sign up» y «Allow anonymous
   sign-ins». No activar CAPTCHA (la app no lo implementa y el ingreso fallaría).
2. _Authentication → Sign In / Providers → Email_: «Minimum password length» 12; «Password
   requirements» _Lowercase, uppercase letters, digits and symbols_; «Email OTP Expiration» 86400 (24 h:
   vigencia de invitaciones y recuperaciones); «Secure password change» **apagado** (sin SMTP propio
   rompería el cambio de contraseña obligatorio).
3. _Authentication → URL Configuration_: «Site URL» con el dominio del sitio; en «Redirect URLs»,
   `<sitio>/auth/callback`, `<sitio>/auth/confirm` y `<sitio>/**`.
4. _Authentication → Rate Limits_: activar «IP Address Forwarding» (si no, todos los ingresos comparten
   la IP de Vercel y su límite de intentos).
5. _Realtime → Settings_: desactivar «Allow public access».
6. Comprobar que _Authentication → Multi-Factor_ tiene TOTP habilitado y que _Storage → Settings_
   admite archivos de 50 MB.
7. Opcional: _Authentication → Sessions → Access Tokens → Access token expiry time_ en 600 s (por
   defecto 3600). No es bloqueante: la base revoca sesiones al instante (`private.acceso_valido()`).
8. En «Redirect URLs» no dejar comodines sobre `vercel.app` como `https://front-*-<equipo>.vercel.app`
   (el de las vistas previas de Vercel): cualquiera puede crear en Vercel un proyecto cuyo dominio
   encaje con el patrón y recibir allí los enlaces de sesión. Las vistas previas no usan producción.

### Primer ingreso

```bash
AMO_ARCHIVO_ENTORNO=.env.produccion pnpm bootstrap:superadmin   # en desarrollo, sin la variable
```

Imprime un enlace de un solo uso (vigente lo que diga «Email OTP Expiration»; vuelve a ejecutarlo si
venció). Al abrirlo defines tu contraseña y configuras la verificación en dos pasos con una app
autenticadora. Desde _Administración → Usuarios_ se invita al resto de superadministradores.

### Si alguien pierde su autenticador

Un superadministrador puede restablecer la verificación en dos pasos de cualquier persona desde
_Administración → Usuarios_. Si quien la perdió es el único superadministrador, quien administra el
servidor ejecuta:

```bash
AMO_ARCHIVO_ENTORNO=.env.produccion pnpm bootstrap:restablecer-mfa [correo]   # en desarrollo, sin la variable
```

Sin correo usa `SUPERADMIN_EMAIL`. Antes de usar el enlace, comprueba que la primera línea nombre el
proyecto `oriuuuaczpncmtglfgpv` (producción). Borra los factores de esa cuenta, lo registra en la
bitácora e imprime un enlace de un solo uso para definir una contraseña nueva y configurar el nuevo
dispositivo.

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

1. Importa el repositorio y, en _Settings → Environment Variables_, usa **Import .env** con
   `.env.produccion`, solo para **Production** (marca como sensibles las secretas).
   `ENABLE_EXPERIMENTAL_COREPACK=1` hace que el build use `pnpm@12.4.1` (`packageManager`). En
   _Preview_ no publiques la `SUPABASE_SECRET_KEY` de producción: o sin variables o con las de
   desarrollo.
2. `vercel.json` fija la región `yul1` (Montreal), junto a la base de datos (ca-central-1).
3. Mapbox: en el token, _URL restrictions_ → añadir `https://front-amo.vercel.app` (sin quitar
   `http://localhost:3000`). Sin esto el explorador del mapa recibe 403 en producción.
4. Dominio: `https://front-amo.vercel.app`. Si Vercel asigna otro, cámbialo en
   `NEXT_PUBLIC_SITE_URL` (y vuelve a desplegar: se incrusta al compilar), en la Site URL y las
   Redirect URLs de Supabase y en las restricciones del token de Mapbox.

### Antes de salir a producción

- [ ] Planes de pago: Supabase Pro (copias de seguridad, sin pausa por inactividad) y Vercel Pro (el
      plan Hobby no permite uso comercial).
- [ ] SMTP propio en Supabase Auth (el integrado solo envía al equipo, 2 correos por hora) y
      `AMO_SMTP_CONFIGURADO=true`.
- [ ] Validar con el contador los valores tributarios y de tarifas marcados «pendiente de validación»
      (27 tarifas; parámetros 2025–2026, falta 2027).
- [ ] Cargar desde _Configuración_ lo que nace vacío: términos y condiciones, retenciones, ReteICA
      municipal, resoluciones DIAN (antes de facturar) y comisiones de excepción.
- [ ] Guardar `AMO_CIFRADO_KEY` y `AMO_SERVIDOR_SECRET` de producción en un gestor de contraseñas: sin
      la clave de cifrado, los datos bancarios cifrados no se recuperan.

Hecho al montar producción: base sin datos demo ni cuentas de prueba, secretos propios (distintos de
los de desarrollo) y región junto a la base. Mientras siga en plan gratuito: el proyecto se pausa
tras 7 días sin uso (se reactiva desde el panel) y no hay copias descargables.
