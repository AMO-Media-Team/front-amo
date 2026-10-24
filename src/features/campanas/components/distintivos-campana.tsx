import {
  InsigniaEstado,
  InsigniaTono,
} from "@/features/operacion/components/distintivos"
import { CLASES_TONO } from "@/features/usuarios/components/distintivos"
import { cn } from "@/lib/utils"

import {
  conteosDeOfertas,
  ESTADOS_MI_CAMPANA,
  textoFase,
  type VozGestion,
} from "../presentacion"
import type { EstadoCampana, OfertasPorEstado } from "../tipos"

export function InsigniaCampana({
  estado,
  className,
}: {
  estado: EstadoCampana
  className?: string
}) {
  return (
    <InsigniaEstado
      catalogo={ESTADOS_MI_CAMPANA}
      estado={estado}
      className={className}
    />
  )
}

/**
 * La campaña o la oferta la creó el equipo AMO por cuenta de la empresa
 * (ADM-014; `gestion_asistida`, la fija la BD). El título se le dirige al
 * anunciante (`voz="propio"`) o al equipo.
 */
export function InsigniaGestionAsistida({
  voz = "asistido",
  className,
}: {
  voz?: VozGestion
  className?: string
}) {
  return (
    <InsigniaTono
      tono="info"
      etiqueta="Creada por el equipo AMO"
      titulo={
        voz === "propio"
          ? "El equipo AMO la creó por cuenta de tu empresa; cada cambio que hace te llega como aviso."
          : "El equipo AMO la creó por cuenta del anunciante (gestión asistida)."
      }
      className={className}
    />
  )
}

/** «En curso · faltan 12 días» junto al estado de una campaña activa. */
export function FaseCampana({
  campana,
  hoy,
}: {
  campana: { estado: EstadoCampana; fechaInicio: string; fechaFin: string }
  /** Hoy en Bogotá, del servidor: mismo texto en SSR e hidratación. */
  hoy: string
}) {
  const fase = textoFase(campana, hoy)
  return fase ? <InsigniaTono tono={fase.tono} etiqueta={fase.texto} /> : null
}

/**
 * Ofertas de una campaña contadas por estado («1 devuelta · 2 publicadas»),
 * lo que pide atención primero. El punto de color acompaña al texto: el
 * color nunca es el único canal.
 */
export function ConteosOfertas({
  porEstado,
  vacio = "Sin ofertas",
  className,
}: {
  porEstado: OfertasPorEstado
  vacio?: string
  className?: string
}) {
  const conteos = conteosDeOfertas(porEstado)
  if (conteos.length === 0) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        {vacio}
      </span>
    )
  }
  return (
    <ul
      aria-label="Ofertas por estado"
      className={cn("flex flex-wrap gap-x-3 gap-y-1", className)}
    >
      {conteos.map((conteo) => (
        <li
          key={conteo.estado}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
            conteo.estado === "DEVUELTA"
              ? "font-semibold text-warning"
              : "text-muted-foreground"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              CLASES_TONO[conteo.tono].punto
            )}
          />
          <span className="cifras">{conteo.texto}</span>
        </li>
      ))}
    </ul>
  )
}
