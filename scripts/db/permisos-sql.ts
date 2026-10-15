import {
  CLAVES_PERMISO,
  PERMISOS,
  type ClavePermiso,
  type ClaveRol,
} from "../../src/lib/auth/permisos"

export const RUTA_SEMILLA_PERMISOS = "supabase/seed/permisos.sql"

/**
 * Semilla idempotente del catálogo de permisos (docs/modelo-datos.md §6):
 * upsert de `public.permisos` y sincronización de `public.rol_permisos` de los roles de sistema
 * (inserta los que faltan y retira los que ya no están en el catálogo). Solo el owner puede
 * escribir permisos de roles de sistema (`private.fn_guardar_rol_permisos`), así que se ejecuta
 * dentro de una migración.
 */
export function generarSqlPermisos(): string {
  return [
    "-- Generado por scripts/db/permisos-seed.ts (pnpm db:permisos) desde src/lib/auth/permisos.ts — no editar.",
    "-- Idempotente: upsert del catálogo y sincronización de los permisos por defecto de los roles de sistema.",
    "",
    insertarPermisos(),
    "",
    sincronizarRolPermisos(),
    "",
  ].join("\n")
}

function insertarPermisos(): string {
  const filas = CLAVES_PERMISO.map((clave, indice) => {
    const { modulo, descripcion, esSensible } = PERMISOS[clave]
    const valores = [
      textoSql(clave),
      textoSql(modulo),
      textoSql(descripcion),
      String(esSensible),
      String(indice + 1),
    ]
    return `  (${valores.join(", ")})`
  })
  return [
    "insert into public.permisos (clave, modulo, descripcion, es_sensible, orden) values",
    filas.join(",\n"),
    "on conflict (clave) do update set",
    "  modulo = excluded.modulo,",
    "  descripcion = excluded.descripcion,",
    "  es_sensible = excluded.es_sensible,",
    "  orden = excluded.orden;",
  ].join("\n")
}

function sincronizarRolPermisos(): string {
  const filas = paresRolPermiso().map(
    ([rol, clave]) => `  (${textoSql(rol)}, ${textoSql(clave)})`
  )
  return [
    "with por_defecto (rol_clave, permiso_clave) as (values",
    filas.join(",\n"),
    "), retirados as (",
    "  delete from public.rol_permisos rp",
    "  using public.roles r",
    "  where r.id = rp.rol_id and r.es_sistema",
    "    and not exists (select 1 from por_defecto d",
    "                    where d.rol_clave = r.clave and d.permiso_clave = rp.permiso_clave)",
    ")",
    "insert into public.rol_permisos (rol_id, permiso_clave)",
    "select r.id, d.permiso_clave",
    "from por_defecto d",
    "join public.roles r on r.clave = d.rol_clave and r.es_sistema",
    "on conflict (rol_id, permiso_clave) do nothing;",
  ].join("\n")
}

function paresRolPermiso(): (readonly [ClaveRol, ClavePermiso])[] {
  return CLAVES_PERMISO.flatMap((clave) =>
    PERMISOS[clave].rolesPorDefecto.map((rol) => [rol, clave] as const)
  )
}

function textoSql(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`
}
