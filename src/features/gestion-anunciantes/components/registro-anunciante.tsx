import "server-only"

import { catalogosAnunciante } from "../queries"
import { BotonRegistrarAnunciante } from "./boton-registrar-anunciante"

/**
 * «Registrar anunciante» del encabezado del listado con sus catálogos ya
 * cargados (la hoja abre al instante). Va en `<Suspense>` con
 * `BotonRegistrarAnuncianteCargando`; la página solo lo pinta con
 * `anunciantes.editar`.
 */
export async function RegistroAnunciante({
  invitarEquipo,
  abrirUsuarios,
}: {
  /** `usuarios.invitar`: tras registrar, el siguiente paso es invitar a su equipo. */
  invitarEquipo: boolean
  /** Además `usuarios.ver`: la ficha se abre en la pestaña Usuarios. */
  abrirUsuarios: boolean
}) {
  return (
    <BotonRegistrarAnunciante
      catalogos={await catalogosAnunciante()}
      invitarEquipo={invitarEquipo}
      abrirUsuarios={abrirUsuarios}
    />
  )
}
