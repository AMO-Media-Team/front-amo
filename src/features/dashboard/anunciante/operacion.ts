/**
 * Lo que el anunciante tiene por hacer en su inicio (módulo puro): el texto y
 * el tono de cada oferta que pide atención (devuelta por la moderación o
 * borrador con el plazo de envío encima) y el tope de lo que se lista.
 */
import type { Tono } from "@/features/operacion/estados"
import type { Atencion, MotivoAtencion } from "@/features/campanas/reglas"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"

/** Ofertas por atender visibles en el panel (el resto, en «Mis campañas»). */
export const LIMITE_ATENCION = 5
/** Campañas activas visibles en el panel. */
export const LIMITE_CAMPANAS_ACTIVAS = 4

export interface PresentacionAtencion {
  titulo: string
  detalle: string
  tono: Tono
  /** Instante que acompaña al detalle (`<time>`), si lo hay. */
  instante: string | null
}

/** Primeras palabras del comentario, sin cortar a media palabra. */
export function resumirComentario(texto: string, maximo = 90): string {
  const limpio = texto.replace(/\s+/g, " ").trim()
  if (limpio.length <= maximo) return limpio
  const corte = limpio.slice(0, maximo + 1)
  const espacio = corte.lastIndexOf(" ")
  return `${(espacio > maximo * 0.6 ? corte.slice(0, espacio) : limpio.slice(0, maximo)).replace(/[\s,.;:]+$/, "")}…`
}

const TONOS: Readonly<Record<MotivoAtencion, Tono>> = {
  devuelta: "aviso",
  envio_vencido: "peligro",
  envio_proximo: "info",
}

export function presentarAtencion(
  atencion: Atencion<{
    comentarioModeracion: string | null
    devueltaAt: string | null
  }>,
  ahora: Date
): PresentacionAtencion {
  const tono = TONOS[atencion.motivo]
  switch (atencion.motivo) {
    case "devuelta": {
      const comentario = atencion.oferta.comentarioModeracion?.trim()
      return {
        titulo: "AMO te la devolvió para ajustarla",
        detalle: comentario
          ? `«${resumirComentario(comentario)}»`
          : "Revisa la oferta, ajústala y reenvíala.",
        tono,
        instante: atencion.oferta.devueltaAt,
      }
    }
    case "envio_vencido":
      return {
        titulo: "Su fecha límite ya no alcanza",
        detalle:
          "Cambia la fecha límite de aceptación para poder enviarla a revisión.",
        tono,
        instante: null,
      }
    case "envio_proximo":
      return {
        titulo: "Envíala a revisión pronto",
        detalle: `El plazo para enviarla vence ${formatearRelativo(atencion.limiteEnvio, ahora)} (${formatearFechaHora(atencion.limiteEnvio)}).`,
        tono,
        instante: atencion.limiteEnvio,
      }
  }
}
