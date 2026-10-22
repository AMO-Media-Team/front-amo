import { BotonCrearUsuario } from "@/features/usuarios/components/hoja-crear-usuario"
import type { OrganizacionFija } from "@/features/usuarios/tipos"

import type { AnuncianteEditable, CatalogosAnunciante } from "../tipos"
import { BotonEditarAnunciante } from "./boton-editar-anunciante"

/**
 * Acciones de la ficha del anunciante para el equipo AMO: «Editar datos»
 * (`anunciantes.editar`) e «Invitar usuario» (`usuarios.invitar`, con la
 * empresa fija; requiere `<ProveedorGestionUsuarios>` alrededor). Sin
 * ninguna de las dos no pinta nada.
 */
export function AccionesAnunciante({
  edicion,
  catalogos,
  invitarA,
}: {
  /** `null` sin `anunciantes.editar`. */
  edicion: AnuncianteEditable | null
  catalogos: CatalogosAnunciante | null
  /** `null` sin `usuarios.invitar` o sin roles de anunciante asignables. */
  invitarA: OrganizacionFija | null
}) {
  if (!edicion && !invitarA) return null
  return (
    <div className="flex flex-wrap items-center gap-2 max-sm:*:flex-1 sm:justify-end">
      {edicion ? (
        <BotonEditarAnunciante anunciante={edicion} catalogos={catalogos} />
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
