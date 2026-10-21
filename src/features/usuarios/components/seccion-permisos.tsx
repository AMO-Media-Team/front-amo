import { Check, Crown, ListChecks, Lock, ShieldAlert } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Badge } from "@/components/ui/badge"
import { CLAVES_PERMISO, PERMISOS } from "@/lib/auth/permisos"
import { formatearNumero } from "@/lib/format"

import { agruparPorModulo, MODULOS_PERMISO } from "../presentacion"
import { permisosDelRol } from "../queries"
import type { RolResumen } from "../tipos"
import { TarjetaFicha } from "./tarjeta-ficha"

/**
 * Pestaña Permisos: lo que el rol del usuario le permite hacer (permisos
 * efectivos). La RLS de `rol_permisos` exige `roles.ver` o que sea el rol propio.
 */
export async function SeccionPermisos({
  rol,
  puedeVerRol,
}: {
  rol: RolResumen | null
  puedeVerRol: boolean
}) {
  if (!rol) {
    return (
      <EstadoVacio
        icono={ShieldAlert}
        titulo="Sin rol asignado"
        descripcion="Sin rol no tiene ningún permiso: no puede operar en AMO."
        className="flex-none py-12"
      />
    )
  }
  if (!puedeVerRol) {
    return (
      <EstadoVacio
        icono={Lock}
        titulo="Necesitas el permiso para ver roles"
        descripcion="Pide a un administrador el permiso «Ver roles y sus permisos»."
        className="flex-none py-12"
      />
    )
  }

  const grupos = agruparPorModulo(await permisosDelRol(rol.id))
  const total = grupos.reduce((suma, grupo) => suma + grupo.permisos.length, 0)
  const sensibles = grupos
    .flatMap((grupo) => grupo.permisos)
    .filter((clave) => PERMISOS[clave].esSensible).length

  return (
    <TarjetaFicha
      titulo={`Permisos del rol ${rol.nombre}`}
      icono={rol.clave === "SUPERADMIN" ? Crown : ListChecks}
      descripcion={
        <>
          {formatearNumero(total)} de {formatearNumero(CLAVES_PERMISO.length)}{" "}
          permisos
          {sensibles > 0 ? ` · ${formatearNumero(sensibles)} sensibles` : ""}
          {rol.clave === "SUPERADMIN"
            ? " · el superadministrador los tiene todos"
            : ""}
        </>
      }
    >
      {grupos.length === 0 ? (
        <EstadoVacio
          variante="simple"
          icono={ListChecks}
          titulo="El rol no tiene permisos"
          className="py-6"
        />
      ) : (
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
          {grupos.map(({ modulo, permisos }) => (
            <section
              key={modulo}
              aria-labelledby={`modulo-${modulo}`}
              className="flex flex-col gap-2"
            >
              <h3
                id={`modulo-${modulo}`}
                className="flex items-center justify-between text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {MODULOS_PERMISO[modulo] ?? modulo}
                <span className="font-normal cifras">{permisos.length}</span>
              </h3>
              <ul className="flex flex-col gap-1.5">
                {permisos.map((clave) => (
                  <li key={clave} className="flex items-start gap-2 text-sm">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      {PERMISOS[clave].descripcion}
                      {PERMISOS[clave].esSensible ? (
                        <Badge
                          variant="outline"
                          className="ml-2 h-4.5 border-warning/40 px-1.5 align-middle text-[0.6875rem] text-warning"
                        >
                          Sensible
                        </Badge>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </TarjetaFicha>
  )
}
