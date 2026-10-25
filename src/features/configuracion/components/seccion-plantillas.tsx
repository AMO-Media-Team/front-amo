import { CLAVE_CORREO_HABILITADO } from "../parametros"
import { listarParametros, listarPlantillas } from "../queries"
import { GruposParametros } from "./grupos-parametros"
import { PlantillasNotificacion } from "./plantillas-notificacion"

/**
 * Plantillas: si el envío por correo está encendido (NOT-004) y los textos de
 * los avisos en la aplicación y por correo.
 */
export async function SeccionPlantillas() {
  const [plantillas, parametros] = await Promise.all([
    listarPlantillas(),
    listarParametros(),
  ])
  const correo = parametros.find((p) => p.clave === CLAVE_CORREO_HABILITADO)
  return (
    <>
      <GruposParametros parametros={parametros} seccion="plantillas" />
      <PlantillasNotificacion
        plantillas={plantillas}
        // Sin el parámetro (lectura sin permiso o base anterior), se asume apagado.
        correoHabilitado={correo?.valor === true}
      />
    </>
  )
}
