/**
 * Estado del paquete creativo de cada oferta al reabrir el asistente (módulo
 * puro): la versión vigente evaluada con `evaluarPaquete` del paquete CR, con
 * los mismos textos de «faltan» que la BD al enviar a revisión. Marca el paso
 * «Paquete creativo» antes de que cargue el panel, que lo vuelve a calcular
 * con lo que solo sabe el navegador (subidas en curso, textos sin guardar).
 */
import { evaluarPaquete, FALTAS } from "@/features/creativos/paquete"
import type {
  EstadoCreativo,
  FormatoOferta,
  VersionCreativo,
} from "@/features/creativos/tipos"

export function estadoCreativoInicial(
  versiones: readonly VersionCreativo[],
  formato: FormatoOferta | undefined
): EstadoCreativo {
  // En borrador o devuelta, la versión que se edita es la vigente.
  const vigente = versiones.find((version) => version.vigente) ?? null
  const archivos = vigente?.archivos ?? []
  if (!formato) {
    // Formato retirado del catálogo: el asistente no monta su panel.
    return {
      listo: archivos.length > 0,
      archivos: archivos.length,
      faltan: archivos.length > 0 ? [] : [FALTAS.sinArchivos],
    }
  }
  return evaluarPaquete({ formato, tipo: vigente?.tipo ?? null, archivos })
}
