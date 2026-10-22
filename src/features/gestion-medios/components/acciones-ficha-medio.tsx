import { BotonCrearUsuario } from "@/features/usuarios/components/hoja-crear-usuario"
import type { OrganizacionFija } from "@/features/usuarios/tipos"

import type { MedioEditable, OpcionCategoria } from "../tipos"
import { BotonEditarMedio } from "./botones-medio"

export interface EdicionMedio {
  medio: MedioEditable
  categorias: readonly OpcionCategoria[]
}

/**
 * Acciones de gestión de la ficha del medio: «Editar datos» (con
 * `medios.editar`) e «Invitar usuario» (con `usuarios.invitar`; requiere
 * `<ProveedorGestionUsuarios>` arriba). Sin ninguna, no pinta nada.
 */
export function AccionesFichaMedio({
  edicion,
  invitarA,
}: {
  edicion: EdicionMedio | null
  invitarA: OrganizacionFija | null
}) {
  if (!edicion && !invitarA) return null
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
    </div>
  )
}
