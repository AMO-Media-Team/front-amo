import "server-only"

import type { UsuarioSesion } from "@/lib/auth/tipos"

import { estaAbierta } from "../presentacion"
import { misAutorizaciones, misSolicitudes } from "../queries"
import { Autorizaciones } from "./autorizaciones"
import { FormularioSolicitud } from "./formulario-solicitud"
import { MisSolicitudes } from "./mis-solicitudes"

/**
 * Secciones de Cuenta → Privacidad que consultan (Server Components), cada
 * una con su esqueleto y su límite de error en la página.
 */

export async function SeccionAutorizaciones({
  usuarioId,
}: {
  usuarioId: string
}) {
  return <Autorizaciones autorizaciones={await misAutorizaciones(usuarioId)} />
}

/**
 * El formulario para radicar y la lista de solicitudes propias: comparten la
 * consulta (los tipos con una abierta no se pueden volver a radicar).
 */
export async function SeccionSolicitudesPropias({
  usuario,
  resaltada,
}: {
  usuario: UsuarioSesion
  resaltada: string | null
}) {
  const solicitudes = await misSolicitudes(usuario.id)
  const abiertas = solicitudes
    .filter((solicitud) => estaAbierta(solicitud.estado))
    .map((solicitud) => solicitud.tipo)
  return (
    <>
      <FormularioSolicitud rol={usuario.rol.tipo} abiertas={abiertas} />
      <MisSolicitudes solicitudes={solicitudes} resaltada={resaltada} />
    </>
  )
}
