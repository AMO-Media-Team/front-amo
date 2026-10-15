/**
 * `pnpm db:permisos`: regenera supabase/seed/permisos.sql desde src/lib/auth/permisos.ts.
 *
 * Si el catálogo cambia, la semilla regenerada se copia en una migración NUEVA
 * (nunca se edita una migración aplicada) y el test de paridad debe quedar en verde.
 */
import { writeFileSync } from "node:fs"

import { generarSqlPermisos, RUTA_SEMILLA_PERMISOS } from "./permisos-sql"

writeFileSync(RUTA_SEMILLA_PERMISOS, generarSqlPermisos())
console.log(`Semilla de permisos escrita en ${RUTA_SEMILLA_PERMISOS}`)
