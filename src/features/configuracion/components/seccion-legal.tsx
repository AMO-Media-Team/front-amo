import { listarParametros, listarVersionesTerminos } from "../queries"
import { GruposParametros } from "./grupos-parametros"
import { VersionesTerminos } from "./versiones-terminos"

/**
 * Legal: versiones de los términos y de la política de datos, y los plazos
 * para atender a los titulares de datos (CTA-007). El conteo de aceptaciones
 * solo se consulta si quien mira puede ver usuarios: sin ese permiso la RLS
 * de `aceptaciones_terminos` solo deja ver la aceptación propia y la cifra
 * sería engañosa.
 */
export async function SeccionLegal({
  contarAceptaciones,
}: {
  contarAceptaciones: boolean
}) {
  const [versiones, parametros] = await Promise.all([
    listarVersionesTerminos(contarAceptaciones),
    listarParametros(),
  ])
  return (
    <>
      <VersionesTerminos versiones={versiones} />
      <GruposParametros parametros={parametros} seccion="legal" />
    </>
  )
}
