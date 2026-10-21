import { listarNiveles, listarParametros } from "../queries"
import { GruposParametros } from "./grupos-parametros"
import { NivelesVerificacion } from "./niveles-verificacion"

/** Medios: elegibilidad, reverificación, actividad y niveles de verificación con sus topes. */
export async function SeccionMedios() {
  const [parametros, niveles] = await Promise.all([
    listarParametros(),
    listarNiveles(),
  ])
  return (
    <>
      <GruposParametros
        parametros={parametros}
        seccion="medios"
        soloGrupos={["elegibilidad"]}
      />
      <NivelesVerificacion niveles={niveles} />
      <GruposParametros
        parametros={parametros}
        seccion="medios"
        excluirGrupos={["elegibilidad"]}
      />
    </>
  )
}
