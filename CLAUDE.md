@AGENTS.md

## Notas para Claude Code

- Antes de usar una API de Next.js, React, Supabase o shadcn, confirma su forma actual en
  `docs/guia-desarrollo.md` y `docs/chuleta-apis.md` (o en `node_modules/next/dist/docs/`): varias
  difieren de versiones anteriores.
- Para cambios de base de datos carga la skill `supabase`. Entornos: la **base local** (`supabase start` en
  Docker; `pnpm db:local` la reconstruye con demo y cuentas E2E), **develop** `baas-amo-develop`
  (`depbmnlpfnrcsbqlwxxd`, banco de pruebas en la nube) y **producción** `oriuuuaczpncmtglfgpv` (el de
  `.env.produccion` y Vercel). El proyecto viejo `zygfqfvqwfvhbirmjojp` está retirado. **En producción el MCP de
  Supabase es solo para leer y verificar** (consultas, `list_migrations`, `get_advisors`,
  `generate_typescript_types`), nunca `apply_migration` ni `execute_sql` que escriba. Las migraciones se
  prueban en local y se aplican con `pnpm db:push develop` y luego `pnpm db:push produccion
  --confirmar-produccion` («Flujo de base de datos» en `docs/guia-desarrollo.md`); al terminar, sincroniza
  `docs/modelo-datos.md`.
- Para gráficos o paletas de datos carga la skill `dataviz`.
- Si trabajas con varios agentes a la vez, sigue la sección «Desarrollo en paralelo» de
  `docs/guia-desarrollo.md` (servidor y cuenta de prueba propios por proceso).
- `context/` contiene documentos confidenciales del cliente: se pueden leer, nunca versionar.
