import { AccionesSuspensionMedio } from "@/features/suspension-medios/components/acciones-suspension"
import type { AccionSuspension } from "@/features/suspension-medios/tipos"
import { BotonCrearUsuario } from "@/features/usuarios/components/hoja-crear-usuario"
import type { OrganizacionFija } from "@/features/usuarios/tipos"

import type { MedioEditable, OpcionCategoria } from "../tipos"
import { BotonEditarMedio } from "./botones-medio"

export interface EdicionMedio {
  medio: MedioEditable
  categorias: readonly OpcionCategoria[]
}

/** «Suspender» o «Reactivar» (`medios.suspender`, ADM-002). */
export interface SuspensionMedio {
  medio: { id: string; nombre: string }
  accion: AccionSuspension
  /** Con `asignaciones.ver`, el diálogo lista las asignaciones en curso. */
  verAsignaciones: boolean
  verDisputas: boolean
}

/**
 * Acciones de gestión de la ficha del medio: «Editar datos» (con
 * `medios.editar`), «Invitar usuario» (con `usuarios.invitar`; requiere
 * `<ProveedorGestionUsuarios>` arriba) y «Suspender»/«Reactivar» (con
 * `medios.suspender`). Sin ninguna, no pinta nada.
 */
export function AccionesFichaMedio({
  edicion,
  invitarA,
  suspension = null,
}: {
  edicion: EdicionMedio | null
  invitarA: OrganizacionFija | null
  suspension?: SuspensionMedio | null
}) {
  if (!edicion && !invitarA && !suspension) return null
  return (
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      {edicion ? (
        <BotonEditarMedio
          medio={edicion.medio}
          categorias={edicion.categorias}
        />
      ) : null}
      {invitarA ? (
        <BotonCrearUsuario
          organizacion={invitarA}
          texto="Invitar usuario"
          variante="outline"
        />
      ) : null}
      {suspension ? <AccionesSuspensionMedio {...suspension} /> : null}
    </div>
  )
}
