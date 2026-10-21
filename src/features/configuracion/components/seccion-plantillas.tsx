import { listarPlantillas } from "../queries"
import { PlantillasNotificacion } from "./plantillas-notificacion"

/** Plantillas: textos de los avisos en la aplicación y por correo. */
export async function SeccionPlantillas() {
  const plantillas = await listarPlantillas()
  return <PlantillasNotificacion plantillas={plantillas} />
}
