@AGENTS.md

## Notas para Claude Code

- Antes de usar una API de Next.js, React, Supabase o shadcn, confirma su forma actual en
  `docs/guia-desarrollo.md` y `docs/chuleta-apis.md` (o en `node_modules/next/dist/docs/`): varias
  difieren de versiones anteriores.
- Para cambios de base de datos carga la skill `supabase` y usa las herramientas MCP de Supabase
  sobre el proyecto `zygfqfvqwfvhbirmjojp`; al terminar, sincroniza `docs/modelo-datos.md`.
- Para gráficos o paletas de datos carga la skill `dataviz`.
- Si trabajas con varios agentes a la vez, sigue la sección «Desarrollo en paralelo» de
  `docs/guia-desarrollo.md` (servidor y cuenta de prueba propios por proceso).
- `context/` contiene documentos confidenciales del cliente: se pueden leer, nunca versionar.
