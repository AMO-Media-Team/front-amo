/**
 * Registro de contenidos exportables: cada reporte convierte su conjunto de
 * datos en indicadores, gráficos, tabla, hojas y notas. Módulo puro (lo usa
 * la exportación en el navegador).
 */
import type { SlugReporte } from "../catalogo"
import type { ContenidoReporte, DatosPorReporte } from "../tipos"
import { contenidoCartera } from "./cartera"
import { contenidoCobertura } from "./cobertura-territorial"
import { contenidoCumplimiento } from "./cumplimiento-medios"
import { contenidoDesempeno } from "./desempeno-campanas"
import { contenidoFinanzas } from "./finanzas"
import { contenidoResumen } from "./resumen-ejecutivo"
import { contenidoUsuariosAccesos } from "./usuarios-accesos"

type Constructores = {
  [S in SlugReporte]: (datos: DatosPorReporte[S]) => ContenidoReporte
}

const CONSTRUCTORES: Constructores = {
  "resumen-ejecutivo": contenidoResumen,
  "desempeno-campanas": contenidoDesempeno,
  finanzas: contenidoFinanzas,
  cartera: contenidoCartera,
  "cobertura-territorial": contenidoCobertura,
  "cumplimiento-medios": contenidoCumplimiento,
  "usuarios-accesos": contenidoUsuariosAccesos,
}

export function contenidoReporte<S extends SlugReporte>(entrada: {
  reporte: S
  datos: DatosPorReporte[S]
}): ContenidoReporte {
  const construir: Constructores[S] = CONSTRUCTORES[entrada.reporte]
  return construir(entrada.datos)
}
