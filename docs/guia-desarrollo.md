# Guía de desarrollo — AMO front-amo

> Léela completa antes de escribir código. Complementa a `AGENTS.md` (visión general),
> `docs/chuleta-apis.md` (snippets verificados), `docs/modelo-datos.md` (base de datos),
> `docs/kpis.md`, `docs/geodatos.md` y `docs/marca.md`.

## Contexto

- **Producto**: AMO (Advertising Market Optimization), marketplace de pauta en medios hiperlocales
  de Colombia (Anunciante ↔ Plataforma ↔ Medio).
- **Repo**: Next.js 16.3.7 (App Router, `src/`), React 19.3.0, Tailwind v4, TypeScript 5.9, pnpm 12,
  Node ≥ 22.12. Despliegue en Vercel (región `yul1`, Montreal), dominio `https://front-amo.vercel.app`.
- **Backend**: Supabase (Postgres 17): Auth, Postgres con RLS, Storage. Producción
  `oriuuuaczpncmtglfgpv` (ca-central-1; `.env.produccion`), develop `depbmnlpfnrcsbqlwxxd`
  (`baas-amo-develop`) y la base local de Docker (`.env.local`, datos demo). Migraciones en `supabase/migrations/`.
- **Documentación oficial de Next instalada**: `node_modules/next/dist/docs/` — consúltala antes de
  usar una API de Next; esta versión difiere de versiones anteriores.

## Reglas de trabajo

- **Idioma**: UI y dominio en español (es-CO). Nombres de dominio y BD en español según el glosario
  del cliente (campana, oferta, cupo, asignacion, liquidacion, medio, anunciante, perfil, rol, permiso,
  bitacora…). La infraestructura genérica puede ir en inglés (`lib/supabase`, `components/ui`).
- **Dependencias**: no se agregan sin necesidad real; `package.json` y el lockfile tienen un único
  responsable por cambio.
- **`src/components/ui/*`** son componentes generados por shadcn (Base UI): se componen, no se editan
  salvo correcciones puntuales de accesibilidad o idioma.
- **Clean Code**: funciones pequeñas, nombres expresivos, sin `any`, sin código muerto, comentarios solo
  donde explican el porqué. TypeScript estricto.
- **Tests**: toda lógica pura lleva pruebas Vitest junto al archivo (`*.test.ts`). Los flujos se cubren
  con Playwright en `e2e/`.
- **Secretos**: jamás en `NEXT_PUBLIC_*`, en archivos del repo, en logs ni en bitácora.
- **Verificación mínima antes de entregar**: `pnpm typecheck && pnpm lint && pnpm test`
  (y `pnpm build` + `pnpm test:e2e` en integraciones).

## Stack y APIs vigentes (verificadas)

- **Next 16**: `src/proxy.ts` (export `proxy`, runtime Node; ya no existe `middleware.ts`).
  `cookies()`, `headers()`, `params` y `searchParams` son asíncronos. `PageProps<'/ruta'>`,
  `LayoutProps<'/ruta'>` y `RouteContext<'/ruta'>` son globales. `error.tsx` recibe `{ error, retry }`.
  `catchError` de `next/error` aísla fallos de un componente. `forbidden()` de `next/navigation`
  (requiere `experimental.authInterrupts`). `typedRoutes: true`. `revalidateTag(tag, 'max')`,
  `updateTag`, `refresh` desde `next/cache`. `next/image`: `preload` (no `priority`).
  Metadatos de tema con `export const viewport`.
- **ADR-01 — `cacheComponents` desactivado**: la app es autenticada y por usuario, y usa CSP con
  nonce (incompatible con PPR).
- **ADR-02 — React Compiler desactivado**: riesgo de incompatibilidades con RHF y TanStack Table.
- **React 19.3**: `ViewTransition` solo se importa en `src/components/motion/transicion-vista.tsx`
  (envoltorio con respaldo y respeto de movimiento reducido).
- **shadcn con Base UI**: se compone con la prop `render` (no `asChild`). `cn` viene de `@/lib/utils`.
  Drawer de Base UI (no vaul). Toaster en `@/components/ui/sonner`.
- **Iconos**: `lucide-react` v1 (nombres nuevos, p. ej. `CircleCheck`).
- **Animación**: `motion` v13 (`motion/react`); respetar movimiento reducido (sistema y preferencia
  de la cuenta).
- **Tablas**: TanStack Table v9, solo dentro de `src/components/data-table/*` (ESLint lo impone).
- **Formularios**: react-hook-form + zod 4 con el mismo esquema en cliente y servidor. Login y MFA con
  `<form action>` + `useActionState`.
- **Estado en URL**: `nuqs` (adaptador en el layout raíz).
- **Fechas y cifras**: `date-fns` + `@date-fns/tz` siempre en `America/Bogota`; moneda y números con
  `src/lib/format.ts` (es-CO, COP). Vercel corre en UTC. Cifras abreviadas con una sola regla (escala larga):
  «mil», «M» = millones, «mil M» = miles de millones, «B» = billones, un decimal (`$1,3 M`, `96,2 mil`,
  `$2,6 mil M`); nunca la notación compacta de `Intl`.
- **Gráficos**: Chart.js 4.5 **no interpreta `oklch()`**: las paletas de gráficos y mapas van en HEX
  (`src/components/charts`).
- **Mapas**: `react-map-gl/mapbox` + `mapbox-gl` 3.32. El estilo (`NEXT_PUBLIC_MAPBOX_STYLE`) importa
  `mapbox/standard` como `basemap`; el tema se cambia con
  `map.setConfigProperty('basemap', 'lightPreset', oscuro ? 'night' : 'day')`; las capas propias van en
  `slot: 'middle'`. Mapbox solo se carga en `/analitica/mapa` y vistas que lo requieran; los mini-mapas
  usan el SVG pre-proyectado de `src/lib/geo/svg-departamentos.ts`.
- **Supabase**: `@supabase/ssr` 0.12 (`cookies: { getAll, setAll(cookies, headers) }` aplicando los
  headers anti-caché); `auth.getClaims()` para verificar el JWT; `auth.admin.*` solo con
  `SUPABASE_SECRET_KEY` en servidor. Las tablas nuevas no se exponen solas: GRANT explícito + RLS.

## Arquitectura de carpetas

```
src/proxy.ts                 # refresco de sesión, CSP con nonce, redirecciones optimistas
src/app/(auth)/…             # ingreso, recuperación, MFA, confirmación de enlaces
src/app/(app)/…              # secciones privadas dentro del AppShell
src/components/{ui,brand,layout,data-table,charts,kpi,maps,feedback,motion,providers}/
src/features/<dominio>/{actions.ts,queries.ts,schemas.ts,components/,*.test.ts}
src/lib/{supabase,auth,geo,export}/  src/lib/{env,format,fechas,result,csp}.ts
src/types/database.types.ts  # generado desde Supabase (no editar a mano)
scripts/{geo,brand,db,bootstrap,demo,pruebas,produccion}/
supabase/{migrations,seed,tests}/   e2e/   docs/
```

## Seguridad (resumen operativo)

- La autorización real vive en la BD: RLS + `private.tiene_permiso` + política restrictiva
  `private.acceso_valido()` (sesión viva, perfil activo, MFA cuando el rol lo exige).
- **DAL** (`src/lib/auth/dal.ts`, `server-only`): cada `page.tsx` de `(app)` y cada Server Action
  llama a `requerirUsuario` / `requerirPermiso` (hay un test que lo exige). El proxy solo hace
  comprobaciones optimistas. No se autoriza en layouts.
- Los cambios de estado pasan por `transicionar_srv` / `*_srv` (solo `service_role`); nunca por
  UPDATE directo.
- La clave secreta solo se usa en `src/lib/supabase/admin.ts` y `auth-server.ts`.
- El servidor envía el contexto confiable (`x-amo-srv` + IP/país/UA); las escrituras directas a la API
  quedan marcadas `API_DIRECTA` en bitácora.
- PII en tablas `*_privado`; se revela con `revelar_privado_srv` y queda registrado.

## Flujo de base de datos

1. Crear el archivo con `supabase migration new <nombre>` (queda como
   `supabase/migrations/<versión>_<nombre>.sql`) y escribir el SQL.
2. Probarlo en la **base local** (ver «Base local» abajo): `supabase migration up --local` o `pnpm db:local`,
   y `pnpm db:suites local`.
3. Aplicarlo en **develop** y luego en **producción** con `pnpm db:push <develop|produccion>` (`--dry-run` lista
   lo pendiente; producción exige `--confirmar-produccion`). Antes de producción, respaldo de esquema y datos con
   `pnpm db:respaldo produccion --etiqueta antes-<migración>` (queda en `context/respaldos/`, 0600, fuera de git). Por dentro es
   `supabase db push --db-url` con la URL del _Session pooler_ de cada proyecto (usuario `postgres.<ref>`,
   contraseña alfanumérica) guardada en `.env.db.<entorno>` (0600, git lo ignora). Así `session_user` es
   `postgres`, como exigen `private.modo_carga()` y las guardas de roles; con `--linked` el CLI entra como
   `cli_login_*` y esas migraciones fallan. No se usa MCP `apply_migration`: numera por su cuenta y desalinea
   el historial con los archivos. El MCP del repositorio ve producción y develop; en producción es solo para
   leer.
4. **Nunca** editar una migración aplicada en un proyecto remoto: se corrige con una nueva. (Una migración que
   solo existe en local puede corregirse mientras no se haya aplicado en develop ni en producción.)
5. Pruebas en `supabase/tests/*.sql` dentro de `begin … rollback`: `pnpm db:suites <local|develop|produccion>`.
   `humo_bitacora_indice` a02 depende del volumen (falla en bases casi vacías sin que haya defecto).
6. Revisar advisors (0 ERROR) y regenerar `src/types/database.types.ts` (`pnpm db:types`, o
   `pnpm db:types local` para migraciones que aún no están en ningún proyecto remoto).
7. Mantener `docs/modelo-datos.md` sincronizado (las desviaciones están en su §11.2).

### Base local

Pila completa de Supabase en Docker (Colima en macOS): Postgres 17, Auth, PostgREST y Storage, configurados por
`supabase/config.toml` (registro público cerrado, contraseña ≥ 12 con todas las clases, MFA TOTP, JWT de 10 min).

```bash
colima start                       # una vez por sesión del equipo
supabase start -x studio,logflare,vector,edge-runtime,imgproxy,mailpit,postgres-meta
pnpm db:local                      # reset + Vault + superadmin + 15 meses de demo + cuentas E2E (~1 min)
pnpm db:local --sin-demo           # igual, sin datos demo
pnpm db:suites local               # suites SQL
supabase stop                      # al terminar (conserva los datos); colima stop apaga la VM
```

- `.env.local` debe apuntar a la pila (`supabase status -o env`: `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY`); esas
  claves son las públicas por defecto de la CLI. `pnpm db:local` se niega a correr si `.env.local` apunta a otro
  proyecto.
- En local no hay correo: `AMO_SMTP_CONFIGURADO=false` (la app muestra los enlaces) y `pnpm db:local` activa al
  superadministrador sin el enlace de confirmación. El correo de avisos (NOT-004) está construido y apagado
  (`correo.habilitado = false`); con `AMO_CORREO_PROVEEDOR=registro` el despachador `/api/correos/procesar` reclama la cola
  sin enviar nada.
- La pila incluye **Realtime**: la campana se suscribe al canal privado `usuario:<id>` (NOT-007). Sin Realtime el
  navegador escribe errores de WebSocket en la consola y la guardia de consola de las E2E falla.
- La base (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) acepta `psql` dentro del contenedor:
  `docker exec -i supabase_db_front-amo psql -U postgres -d postgres`.
- `pnpm build && pnpm test:e2e` corre contra la pila local igual que contra develop. En `config.toml` la pila local admite
  500 ingresos y 500 verificaciones de código cada 5 minutos por IP (la suite y sus fábricas ingresan cientos de veces);
  cambiar `[auth.rate_limit]` exige `supabase stop` y volver a `supabase start` (los datos se conservan).

### Producción como entorno de pruebas del cliente

Hasta nueva orden, producción es donde el cliente hace sus pruebas funcionales. `pnpm prod:config-pruebas`
(`scripts/produccion/configuracion-pruebas.ts`) deja una configuración rotulada para que los flujos se recorran en
minutos: anticipación mínima de la oferta en 0 h, un solo corte de métricas (`["H24"]`), creativos de hasta 25 MB
(cuida el 1 GB del plan gratuito) y términos, condiciones y política de datos publicados como versión `0.1-PRUEBA`
(«VERSIÓN DE PRUEBA», sin valor legal; si el cliente ya publicó un texto propio de un tipo, ese tipo no se toca).

```bash
AMO_ARCHIVO_ENTORNO=.env.produccion pnpm prod:config-pruebas                    # simulación: muestra el plan
AMO_ARCHIVO_ENTORNO=.env.produccion pnpm prod:config-pruebas --aplicar --confirmar-produccion
AMO_ARCHIVO_ENTORNO=.env.produccion pnpm prod:config-pruebas --revertir --confirmar-produccion
```

- Escribe como servicio con contexto confiable a nombre del superadministrador de `SUPERADMIN_EMAIL`: la bitácora
  registra cada cambio con ese actor y origen `APP`.
- Guarda lo que cambia en `context/respaldos/configuracion-pruebas-<ref>.json` (0600, fuera de git). `--revertir`
  devuelve cada parámetro a su valor anterior solo si sigue con el de prueba. Las versiones legales publicadas son
  inmutables: las retira la limpieza final, que no se ejecuta sin orden de Andrés:

```bash
pnpm db:respaldo produccion --etiqueta antes-limpieza                 # respaldo del mismo día (obligatorio)
AMO_ARCHIVO_ENTORNO=.env.produccion pnpm prod:limpiar-pruebas produccion   # simulación (rollback): qué se borraría
# solo con orden expresa: … prod:limpiar-pruebas produccion --ejecutar --confirmar-produccion (pide escribir el ref)
```

Conserva exactamente a los superadministradores activos (con MFA), catálogos, configuración, tarifas, roles y
permisos; borra negocio, usuarios, bitácora, accesos, avisos y archivos de Storage; luego revierte la configuración de
prueba. Exige que los cuatro textos legales tengan una versión definitiva (o `--sin-textos-definitivos`).

- Es idempotente y sin argumentos no cambia nada. Sin `AMO_ARCHIVO_ENTORNO` actúa sobre `.env.local` (la base
  local), útil para probarlo antes.

## Identidad visual

Paleta «Lila AMO» (HEX): 50 `#F6F3FF` · 100 `#EDE7FE` · 200 `#DCD0FD` · 300 `#C3AEFB` · 400 `#A788F6` ·
500 `#8C66EE` · 600 `#7549DE` · 700 `#6238BF` · 800 `#4F2F98` · 900 `#3F2A76` · 950 `#261848`.
Primario: 400 en tema oscuro (principal) y 600 en claro. Tipografías: Plus Jakarta Sans (títulos),
Geist (UI), Geist Mono / `tabular-nums` (cifras). Detalle completo en `docs/marca.md`.

## Desarrollo en paralelo (varios procesos a la vez)

- Servidor de desarrollo aislado: `AMO_DIST_DIR=.next-<nombre> pnpm exec next dev -p <puerto>`
  (al terminar, detenerlo, borrar `.next-<nombre>` y quitar de `tsconfig.json` las líneas que
  `next dev` agregue para ese directorio).
- Cuenta de prueba aislada con TOTP: `pnpm exec tsx scripts/bootstrap/cuenta-pista.ts <nombre> SUPERADMIN`
  (credenciales en `.cuentas-pista/<nombre>.json`, ignorado por git). Roles: `SUPERADMIN`, `ADMIN`, `ANUNCIANTE` y
  `MEDIO` (este se vincula al medio de `demo.medio@amo.test` o al id que se pase como tercer argumento). Verificar un factor MFA cierra
  las demás sesiones del mismo usuario: cada proceso necesita su propia cuenta.
- `pnpm build` y `pnpm test:e2e` usan `.next/`: solo un proceso a la vez.
- `pnpm test:e2e` levanta `pnpm build && pnpm start` en el puerto 3000 (o reutiliza lo que ya escuche ahí: que no
  sea un `next dev`). Con un `next dev` en uso en el 3000, `AMO_E2E_PUERTO=3100 pnpm test:e2e` prueba el build de
  producción en otro puerto (`next dev` y `next build` no comparten carpeta: `.next/dev` y `.next/`); el token de
  Mapbox está restringido por URL a `localhost:3000`, así que en otro puerto las pruebas del mapa fallan (403 de
  las teselas) mientras no se añada ese origen al token. Antes de la primera vez: `pnpm bootstrap:e2e` y los datos
  demo (`pnpm demo:generar`). El proyecto `preparacion` guarda las sesiones compartidas en `playwright/.auth/`
  (ignorado por git).
- Proyectos E2E que escriben, en serie (un worker): `alta-medio` (`onboarding-medio-*`, «Medio Nuevo E2E»), `anunciante`
  (`anunciante-*`, «Anunciante E2E» y «Anunciante Nuevo E2E») y `pauta-medio` (`pauta-medio-*`, a 390 px, «Medio E2E»). Sus
  pruebas de solo lectura corren también en escritorio, tablet y móvil. Fábricas: `e2e/utilidades/negocio.ts` (campañas y
  ofertas con creativo real), `e2e/utilidades/pauta.ts` (aceptar, descargar, evidencia, métricas y validación por el camino
  real; `restablecerPautaMedioE2E()` en el `beforeAll` de cada `pauta-medio-*`; las campañas de esos specs llevan el prefijo
  «Pauta E2E» y las de los specs del anunciante, «Seguimiento E2E» con `borrarPautaE2E`). Una asignación que descargó
  contenido no se puede borrar por la API (`descargas_contenido` es de solo inserción): la limpieza la cancela.
- `page.goto`, `page.reload` y los ingresos de `e2e/utilidades` esperan a que React revele el contenido que llegó por
  streaming (`esperarStreaming`): mientras tanto la copia del servidor sigue oculta en `div#S:n` y `getByLabel` o
  `getByText` la cuentan. Para lo demás, busca por rol o dentro de un contenedor visible (`getByRole("main")`, el formulario).
- Proyecto `validacion` (`validacion-*` y `disputas-*`, en serie, después de `pauta-medio` y `anunciante`): el equipo AMO
  valida, verifica, cancela, suspende y resuelve disputas. Fábricas en `e2e/utilidades/validacion.ts` (colas, disputas,
  cancelar, suspender, `ingresarComoOperaciones`, `vencerAsignacionE2E` —solo contra la base local: lleva el plazo al pasado y
  corre `private.vencer_asignaciones()`— y `restablecerValidacionE2E()` en el `beforeAll` y el `afterAll`, con campañas
  «Validación E2E»). Cuentas propias: OPERACIONES con TOTP (`E2E_OPERACIONES_*`) y «Medio Suspensión E2E»
  (`E2E_MEDIO_SUSPENSION_*`, verificado en Barranquilla para no recibir las ofertas del «Medio E2E»). Las limpiezas cierran
  las disputas y los reclamos pendientes; una disputa con mensajes, igual que una descarga, no se puede borrar. Los specs de
  `pauta-medio-*` y `anunciante-*` no llaman a `restablecerValidacionE2E()`.
- Proyecto `finanzas` (`finanzas-*`, en serie, al final): liquidaciones, documento soporte, archivo de pagos, facturas y notas
  crédito, y lo que ven el medio (Ganancias) y el anunciante (Facturas). Fábricas en `e2e/utilidades/finanzas.ts`
  (`ingresarComoFinanzas`, `campanaFinanzasE2E`, `asignacionVerificadaFinanzasE2E`, `liquidacionFinanzasE2E({ hasta })`,
  `facturaFinanzasE2E`, `restablecerFinanzasE2E()` —solo local o develop: borra en modo carga y purga lo de las campañas
  «Finanzas E2E» y de los dos medios de finanzas para que cada corrida genere su corte sin traslapes—). La liquidación la
  genera el ADMIN E2E y la aprueba Finanzas (segregación). Cuentas propias: FINANZAS con TOTP (`E2E_FINANZAS_*`), «Medio
  Finanzas E2E» (no factura: documento soporte, `E2E_MEDIO_FINANZAS_*`) y «Medio Factura E2E» (factura,
  `E2E_MEDIO_FACTURA_*`). «Generar corte» en la interfaz liquida también a los medios de la demo: los specs no lo ejecutan.
- Proyecto `cierre` (`cierre-*`, en serie, al final): gestión asistida (`cierre-asistida`, campañas «Campaña GA E2E»),
  derechos del titular con un medio desechable que se suprime (`cierre-privacidad`, fábrica `e2e/utilidades/privacidad.ts`),
  reputación y confirmación de parámetros (`cierre-reputacion`) y aviso en vivo con dos navegadores (`cierre-tiempo-real`).
- Accesibilidad: el criterio común de axe (WCAG 2.0, 2.1 y 2.2 A y AA; sin infracciones serias ni críticas) vive en
  `e2e/utilidades/axe.ts`. `accesibilidad-portales.spec.ts` audita las pantallas clave de cada portal en los dos temas y
  en escritorio, tablet y móvil; `preparacion` guarda también la sesión `finanzas` (cuenta de solo lectura con TOTP,
  `E2E_LECTURA_FINANZAS_*`).
- Matriz de navegadores (RNF-COM-01): `pnpm test:e2e:navegadores` corre humo, navegación, inicio, mapa y accesibilidad en
  Firefox, Safari de escritorio, Safari de iOS y Chrome para Android (Edge usa el motor de Chrome). Antes de la primera
  vez: `pnpm exec playwright install webkit firefox`.
- `pnpm pruebas:pauta-e2e`, `pnpm pruebas:validacion-e2e` y `pnpm pruebas:finanzas-e2e` comprueban las fábricas contra la base local y `pnpm pruebas:carrera` corre la prueba de carrera
  de cupos (CUP-006: 20 medios simultáneos, presupuestos, topes, desistir e idempotencia). `pnpm pruebas:rendimiento-geo
local` mide el p95 del explorador (GEO-010 y RNF-REN-02: < 300 ms en la base).
