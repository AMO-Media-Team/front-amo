# Entregas 2 y 3 — coordinación del trabajo

Plan aprobado el 2026-10-21: construir todo lo pendiente de E2 y E3 (47 + 22 requisitos), probar cada fase en
**`baas-amo-develop`** (`depbmnlpfnrcsbqlwxxd`) y después llevarla a producción (`oriuuuaczpncmtglfgpv`), donde
el cliente hace pruebas funcionales. El estado de cada requisito vive en [`progreso.md`](progreso.md); cada
fase tiene su brief (`fase-N.md`) con los paquetes de trabajo y sus contratos.

Antes de develop, cada fase se prueba en la **pila local** de Supabase (`supabase start` en Docker/Colima): misma
versión de Postgres, migraciones aplicadas, 15 meses de datos demo y cuentas E2E. Comandos con entorno `local`:
`pnpm db:suites local`, `pnpm db:vault local`, `pnpm db:types local` (ver «Base local» en
`docs/guia-desarrollo.md`).

## Reglas para los agentes que implementan un paquete

1. **Propiedad de archivos.** Cada paquete lista los archivos y carpetas que le pertenecen. No edites nada
   fuera de esa lista. Si necesitas un cambio en un archivo ajeno o compartido, descríbelo en tu informe
   final (archivo, cambio exacto y por qué) y sigue con un stub local si hace falta.
2. **Archivos compartidos (solo el líder):** `package.json`, `pnpm-lock.yaml`, `src/lib/auth/navegacion.ts`,
   `src/lib/auth/permisos.ts`, `src/types/database.types.ts`, `src/lib/csp.ts`, `src/proxy.ts`,
   `src/lib/auth/dal-obligatorio.test.ts`, `e2e/preparacion.setup.ts`, `playwright.config.ts`,
   `supabase/migrations/**`, `supabase/config.toml`, `src/features/enlaces/**` (resolvedor `/ir`),
   `docs/modelo-datos.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `.env*`.
3. **Nada que afecte a otros procesos:** no corras `pnpm build`, `pnpm test:e2e`, `pnpm format` ni `next dev`
   en el puerto 3000; no uses `git stash`, `checkout`, `reset` ni `commit`. Verifica solo lo tuyo:
   `pnpm exec tsc --noEmit -p .` (el proyecto entero, pero reporta solo los errores de tus archivos),
   `pnpm exec eslint <tus rutas>`, `pnpm exec vitest run <tus rutas>` y `pnpm exec prettier --write <tus rutas>`.
4. **Base de datos:** la base **local** está disponible y ya tiene las migraciones de la fase, los datos demo y las
   cuentas E2E: `docker exec -i supabase_db_front-amo psql -U postgres -d postgres -tA -c "<sql>"`. Puedes
   consultarla libremente y probar escrituras **solo dentro de `begin; … rollback;`** (sigue el patrón de
   `supabase/tests/*.sql`). Nunca `supabase db reset`, `supabase stop` ni escrituras confirmadas (salvo el paquete
   que el brief autorice, p. ej. el aprovisionamiento E2E). Producción y develop: no se tocan. Las migraciones las
   escribe el líder; si te falta algo de la BD, repórtalo con el SQL que propones.
5. **Convenciones** (`AGENTS.md`, `docs/guia-desarrollo.md`, `docs/chuleta-apis.md`):
   - Español de Colombia en interfaz y dominio; tema oscuro y claro; WCAG 2.2 AA; 390 / 834 / 1440 px sin
     scroll horizontal; movimiento reducido.
   - Base UI con la prop `render` (nunca `asChild`); TanStack Table solo en `src/components/data-table`.
   - Cada `page.tsx` de `(app)` llama al DAL (`requerirPermiso`/`requerirUsuario`); cada Server Action vive en
     `src/features/<dominio>/actions.ts`, llama al DAL primero, valida con zod (mismo esquema en cliente y
     servidor) y devuelve `ResultadoAccion` (`src/lib/result.ts`), nunca lanza errores esperados.
   - Escrituras: cliente de sesión (`crearClienteServidor`, RLS + bitácora con actor) o RPC `*_srv` con
     `contextoDelActor(actor)` (`src/lib/auth/contexto-actor.ts`) y `argumentosRpc` (`src/lib/supabase/rpc.ts`).
     Errores de BD → `interpretarErrorBd` / `mensajeErrorBd` de `src/lib/errores-bd.ts` (catálogo `AMO_*`).
   - Fechas y dinero con `src/lib/fechas.ts` y `src/lib/format.ts` (America/Bogota, es-CO, COP).
   - Toda lógica pura lleva pruebas Vitest junto al archivo.
6. **Informe final** (tu respuesta): archivos creados/modificados, contratos exportados (firmas), pruebas
   corridas con su resultado, cambios que necesitas en archivos ajenos, y dudas o riesgos.
