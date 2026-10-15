<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AMO — guía para agentes

AMO (Advertising Market Optimization) es un marketplace que conecta **anunciantes** (empresas
medianas y grandes) con **medios hiperlocales** de Colombia (cuentas con más de 30.000 seguidores en
Facebook, Instagram o TikTok) para contratar, ejecutar, medir y liquidar pauta digital de forma
estandarizada. La plataforma intermedia oferta, aceptación, entrega de contenido, evidencia, métricas
y pago. Este repositorio es el front-end (Next.js) y contiene también el esquema de la base de datos
(Supabase).

## Lee esto primero

| Necesitas… | Documento |
|---|---|
| Convenciones, stack vigente, flujo de trabajo | [`docs/guia-desarrollo.md`](docs/guia-desarrollo.md) |
| Snippets verificados (Base UI, tablas, formularios, acciones) | [`docs/chuleta-apis.md`](docs/chuleta-apis.md) |
| Tablas, RLS, funciones, estados, permisos, configuración | [`docs/modelo-datos.md`](docs/modelo-datos.md) |
| Definición y fórmula de cada KPI e insight | [`docs/kpis.md`](docs/kpis.md) |
| Mapas, GeoJSON, diccionarios de países/departamentos/municipios | [`docs/geodatos.md`](docs/geodatos.md) |
| Logo, paleta, tipografías, principios de movimiento | [`docs/marca.md`](docs/marca.md) |
| Requisitos del cliente y documento de requisitos funcionales | `context/` (no versionado; confidencial) |

## Lógica de negocio en una página

- **Actores**: Anunciante (compra pauta; varios usuarios por empresa), Medio (publica; casi siempre
  desde el celular → mobile-first), equipo AMO (verifica, modera, valida, liquida).
- **Glosario** (se usa igual en código y BD): campaña → oferta de pauta → cupo → **asignación**
  (unidad transaccional: precio, estado, evidencia, métricas y liquidación propios) → publicación →
  métrica (cortes 24 h / 72 h / 7 d) → liquidación.
- **Flujo**: el anunciante crea campaña y oferta → AMO modera y publica → el medio elegible acepta
  (reserva atómica de cupo, precio congelado) → descarga el creativo → publica → sube evidencia y
  métricas → AMO valida → liquidación → pago al medio y factura al anunciante.
- **Precio**: lo calcula el sistema, nadie lo negocia:
  `tarifa base (franja × plataforma × formato) × multiplicador de calidad × multiplicador geográfico`.
  Todo es configurable por el administrador (tarifas versionadas); nada queda fijo en el código.
- **Reglas duras**: solo las asignaciones `VERIFICADA` entran a liquidación; precio y comisión se
  congelan al aceptar; un medio toma un cupo por oferta; ningún cambio de estado ocurre fuera de las
  máquinas de estado (`private.transiciones_estado`); todo cambio queda en bitácora.
- **Alcance construido (Entrega 1)**: base de plataforma (autenticación con MFA, invitaciones,
  usuarios, roles y permisos, auditoría, accesos, cuenta, notificaciones, configuración), modelo de
  datos completo del negocio, analítica (paneles por rol, explorador geográfico en 3 niveles, 7
  reportes con exportación) y consulta de operación. Los flujos operativos por rol (crear oferta,
  aceptar cupo, subir evidencia, liquidar) son las entregas siguientes; la BD ya los soporta.

## Stack

Next.js 16.3.7 (App Router, `src/`) · React 19.3 · TypeScript 5.9 estricto · Tailwind v4 · shadcn sobre
**Base UI** · motion 13 · TanStack Table 9 · react-hook-form + zod 4 · nuqs · TanStack Query ·
Chart.js 4 · Mapbox GL 3 (`react-map-gl/mapbox`) · Supabase (Auth, Postgres 17 con RLS, Storage) ·
Vitest 5 · Playwright · pnpm 12 · Node ≥ 22.12 · despliegue en Vercel (`iad1`).

## Comandos

```bash
pnpm dev                    # desarrollo
pnpm typecheck              # next typegen + tsc
pnpm lint  |  pnpm format   # ESLint 9 (flat) | Prettier
pnpm test                   # Vitest (unitarias y de componentes)
pnpm test:e2e               # Playwright contra `pnpm build && pnpm start`
pnpm geo:build              # regenera GeoJSON optimizados, diccionarios y semilla geo
pnpm brand:build            # regenera logos e iconos
pnpm db:types               # regenera src/types/database.types.ts (requiere `supabase login`)
pnpm db:permisos            # genera supabase/seed/permisos.sql desde src/lib/auth/permisos.ts
pnpm bootstrap:superadmin   # crea/recupera el superadministrador (imprime un enlace de un solo uso)
pnpm bootstrap:restablecer-mfa   # emergencia: borra los factores MFA de una cuenta y da un enlace nuevo
pnpm bootstrap:e2e          # cuentas de prueba E2E (variables E2E_* en .env.local)
pnpm demo:generar | pnpm demo:purgar   # datos demo (ver supabase/seed/demo/README.md)
```

Antes de entregar cualquier cambio: `pnpm typecheck && pnpm lint && pnpm test`. En integraciones,
además `pnpm build && pnpm test:e2e`.

## Mapa del código

```
src/proxy.ts                     Refresco de sesión Supabase, CSP con nonce, redirecciones optimistas
src/app/(auth)/                  ingresar · recuperar · restablecer · cambiar-contrasena · mfa/* · auth/{confirm,callback,salir}
src/app/(app)/                   Secciones privadas dentro del AppShell
  inicio/                        Panel según tipo de rol (interno · anunciante · medio)
  analitica/mapa/                Explorador geográfico: mundo → Colombia → departamento
  reportes/[reporte]/            7 reportes con exportación a Excel y PDF
  operacion/{medios,anunciantes,campanas,asignaciones}/   Consulta (listado y ficha)
  administracion/{usuarios,roles,auditoria,accesos,configuracion}/
  notificaciones/  cuenta/{perfil,seguridad,preferencias}/
src/app/api/                     geo/metricas (datos del mapa) · csp-report
src/components/
  ui/            shadcn (Base UI). Se compone; no se edita
  layout/        AppShell: barra lateral, barra superior, ⌘K, selector de tema
  data-table/    Tabla genérica (único lugar que importa TanStack Table)
  charts/ kpi/   Gráficos Chart.js con tema y tarjetas KPI
  maps/          Explorador Mapbox y mini-mapas SVG
  brand/ motion/ feedback/ providers/
src/features/<dominio>/          actions.ts ('use server') · queries.ts (server-only) · schemas.ts (zod) · components/ · tests
src/lib/
  auth/          dal.ts (compuertas) · permisos.ts (catálogo, fuente única) · navegacion.ts (menú y rutas públicas)
  supabase/      server.ts · client.ts · admin.ts y auth-server.ts (clave secreta, server-only) · proxy.ts · contexto.ts
  geo/           diccionarios generados, resolvers, escalas, SVG de departamentos
  export/        Excel (ExcelJS) y PDF (jsPDF) de marca
  env*.ts format.ts fechas.ts result.ts csp.ts
src/types/database.types.ts      Generado desde Supabase
scripts/                         geo · brand · db · bootstrap · demo · pruebas (carrera de cupos)
supabase/                        migrations (inmutables) · seed · tests (SQL en begin…rollback)
e2e/                             Playwright
```

## Reglas que no se rompen

1. **Autorización**: cada `page.tsx` de `(app)` y cada Server Action llama al DAL
   (`requerirUsuario` / `requerirPermiso`); un test lo exige. La autoridad final es la base de datos
   (RLS + `private.tiene_permiso` + `private.acceso_valido`). El proxy solo es optimista y los layouts
   no autorizan.
2. **Compuertas del DAL, en orden**: sesión válida → perfil activo → MFA si el rol lo exige → cambio
   de contraseña obligatorio → permiso.
3. **Clave secreta de Supabase**: solo en `src/lib/supabase/admin.ts` y `auth-server.ts`
   (`import 'server-only'`). Nada sensible en `NEXT_PUBLIC_*`, logs ni bitácora.
4. **Cambios de estado**: únicamente por `transicionar_srv` y las RPC `*_srv` (rol `service_role`,
   con actor y sesión validados). Un UPDATE directo de `estado` falla.
5. **Migraciones**: nunca se edita una aplicada; se corrige con una nueva. Toda tabla nueva lleva RLS,
   la política restrictiva de sesión, GRANT explícito mínimo, índices por FK y auditoría. Las
   funciones que usa una política necesitan `grant execute … to authenticated`; los procedimientos
   privilegiados no.
6. **Catálogo de permisos**: `src/lib/auth/permisos.ts` es la fuente única; la semilla SQL se genera
   con `pnpm db:permisos`. Los roles de sistema solo cambian por migración; los personalizados se
   gestionan desde la interfaz con protección contra escalada.
7. **Datos sensibles** (documentos, datos bancarios, NIT, contacto): viven en tablas `*_privado`; se
   revelan con `revelar_privado_srv` y cada consulta queda registrada.
8. **Fechas y dinero**: siempre zona `America/Bogota` y formato es-CO / COP mediante
   `src/lib/fechas.ts` y `src/lib/format.ts`. El servidor corre en UTC.
9. **Interfaz**: español de Colombia, tema oscuro por defecto con claro equivalente, accesible
   (WCAG 2.2 AA), responsive a 1440 / 834 / 390 px sin scroll horizontal, y respeto del movimiento
   reducido. Componer con la prop `render` de Base UI, nunca `asChild`.
10. **Colores de gráficos y mapas en HEX** (Chart.js y Mapbox no interpretan `oklch()`).

## Decisiones de arquitectura (ADR)

- **ADR-01 · `cacheComponents` desactivado.** La app es autenticada y por usuario, y aplica CSP con
  nonce, incompatible con el prerenderizado parcial.
- **ADR-02 · React Compiler desactivado.** Riesgo de incompatibilidad con react-hook-form y TanStack
  Table; se reevaluará.
- **ADR-03 · Autorización en la base de datos, no en el JWT.** `tiene_permiso` lee `perfiles` y
  `rol_permisos` en cada consulta: un cambio de rol o una suspensión surten efecto de inmediato.
- **ADR-04 · Sesión validada en BD.** `acceso_valido()` comprueba que la sesión siga en
  `auth.sessions`, la inactividad máxima por tipo de rol y el nivel MFA; cerrar sesiones o suspender
  es inmediato aunque el JWT siga vigente.
- **ADR-05 · Contexto confiable.** El servidor Next firma sus llamadas con `x-amo-srv` (secreto en
  Vault); lo que llega sin él se registra como `API_DIRECTA` y no puede escribir configuración.
- **ADR-06 · Invitaciones por enlace.** `/auth/confirm` no consume el token con GET (los
  previsualizadores de enlaces lo gastarían): muestra un botón que lo confirma con POST.
- **ADR-07 · Mapbox solo donde aporta.** El explorador usa Mapbox; los mini-mapas de paneles y
  reportes usan SVG pre-proyectado para no cargar la librería ni consumir cargas de mapa.
- **ADR-08 · Reserva de cupos con bloqueo ordenado** (campaña → oferta → cupo → asignación), probada
  con una carrera real (`scripts/pruebas/carrera-cupos.ts`).

## Entorno

Variables en `.env.local` (plantilla documentada en `.env.example`; el build falla si falta una
obligatoria): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_MAPBOX_STYLE`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SECRET_KEY`,
`AMO_CIFRADO_KEY`, `AMO_SERVIDOR_SECRET` (el mismo valor está en Supabase Vault),
`SUPERADMIN_EMAIL`, `AMO_SMTP_CONFIGURADO`, `AMO_CSP_MODO`, y opcionales `TURNSTILE_*`.

Proyecto Supabase: `baas-amo` (ref `zygfqfvqwfvhbirmjojp`). Ajustes de Auth esperados: registros
públicos cerrados, contraseña mínima de 12 con todas las clases, vigencia de enlaces de 24 h, reenvío
de IP activo y URLs de redirección del sitio (`/auth/callback`, `/auth/confirm`).

## Trazabilidad

- Requisitos del cliente → `context/AMO-estructura-del-proyecto.pdf` (secciones citadas como «EP §n»).
- Requisitos funcionales numerados (`RF-<MÓDULO>-NNN`), reglas de negocio y decisiones asumidas →
  `context/AMO-Documento-Requisitos-Funcionales-v1.0.pdf` (fuente en `context/requisitos/`).
- Decisiones de datos y desviaciones respecto a la especificación → `docs/modelo-datos.md` §11.
- Pruebas que respaldan las reglas: `supabase/tests/*.sql` (RLS, transiciones, seguridad),
  `scripts/pruebas/carrera-cupos.ts`, `e2e/*.spec.ts` y las pruebas Vitest junto a cada módulo.
- `context/` no se versiona (documentos confidenciales del cliente).
