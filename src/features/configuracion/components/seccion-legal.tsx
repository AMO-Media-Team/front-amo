import { listarVersionesTerminos } from "../queries"
import { VersionesTerminos } from "./versiones-terminos"

/**
 * Legal: versiones de los términos y de la política de datos. El conteo de
 * aceptaciones solo se consulta si quien mira puede ver usuarios: sin ese
 * permiso la RLS de `aceptaciones_terminos` solo deja ver la aceptación
 * propia y la cifra sería engañosa.
 */
export async function SeccionLegal({
  contarAceptaciones,
}: {
  contarAceptaciones: boolean
}) {
  const versiones = await listarVersionesTerminos(contarAceptaciones)
  return <VersionesTerminos versiones={versiones} />
}
