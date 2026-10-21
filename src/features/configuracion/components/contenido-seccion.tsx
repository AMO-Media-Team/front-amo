import type { Seccion } from "../secciones"
import { SeccionCatalogos } from "./seccion-catalogos"
import { SeccionComercial } from "./seccion-comercial"
import { SeccionLegal } from "./seccion-legal"
import { SeccionMedios } from "./seccion-medios"
import { SeccionParametros } from "./seccion-parametros"
import { SeccionPlantillas } from "./seccion-plantillas"
import { SeccionPrecios } from "./seccion-precios"
import { SeccionTributario } from "./seccion-tributario"

/**
 * Contenido de la sección activa. Cada sección consulta solo sus datos (las
 * demás no se piden) y un fallo lo recoge el límite de error de la página.
 */
export function ContenidoSeccion({
  seccion,
  contarAceptaciones,
}: {
  seccion: Seccion
  /** Solo con `usuarios.ver` (ver `SeccionLegal`). */
  contarAceptaciones: boolean
}) {
  switch (seccion) {
    case "comercial":
      return <SeccionComercial />
    case "precios":
      return <SeccionPrecios />
    case "medios":
      return <SeccionMedios />
    case "metricas":
    case "calidad":
    case "seguridad":
      return <SeccionParametros seccion={seccion} />
    case "tributario":
      return <SeccionTributario />
    case "catalogos":
      return <SeccionCatalogos />
    case "legal":
      return <SeccionLegal contarAceptaciones={contarAceptaciones} />
    case "plantillas":
      return <SeccionPlantillas />
  }
}
