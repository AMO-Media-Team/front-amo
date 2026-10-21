# Guía de desarrollo — AMO front-amo

> Léela completa antes de escribir código. Complementa a `AGENTS.md` (visión general),
> `docs/chuleta-apis.md` (snippets verificados), `docs/modelo-datos.md` (base de datos),
> `docs/kpis.md`, `docs/geodatos.md` y `docs/marca.md`.

## Contexto

- **Producto**: AMO (Advertising Market Optimization), marketplace de pauta en medios hiperlocales
  de Colombia (Anunciante ↔ Plataforma ↔ Medio).
- **Repo**: Next.js 16.3.7 (App Router, `src/`), React 19.3.0, Tailwind v4, TypeScript 5.9, pnpm 12,
  Node ≥ 22.12. Despliegue en Vercel (región `iad1`).
- **Backend**: Supabase `baas-amo` (ref `zygfqfvqwfvhbirmjojp`, Postgres 17): Auth, Postgres con RLS,
  Storage. Migraciones en `supabase/migrations/`.
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
scripts/{geo,brand,db,bootstrap,demo,pruebas}/
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

1. Escribir la migración y aplicarla (MCP `apply_migration` o `supabase db push`).
2. Guardar el SQL exacto como `supabase/migrations/<versión>_<nombre>.sql`.
3. **Nunca** editar una migración aplicada: se corrige con una nueva.
4. Pruebas en `supabase/tests/*.sql` dentro de `begin … rollback`.
5. Revisar advisors (0 ERROR) y regenerar `src/types/database.types.ts` (`pnpm db:types`).
6. Mantener `docs/modelo-datos.md` sincronizado (las desviaciones están en su §11.2).

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
