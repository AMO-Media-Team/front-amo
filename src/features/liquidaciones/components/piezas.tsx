import Link from "next/link"

import {
  InsigniaEstado,
  InsigniaTono,
} from "@/features/operacion/components/distintivos"
import { ESTADOS_LIQUIDACION } from "@/features/operacion/estados"
import {
  formatearFechaCompacta,
  instanteDeDia,
} from "@/features/operacion/formato"
import {
  formatearCOP,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  AYUDA_ALERTA,
  ETIQUETAS_ALERTA,
  periodoCompacto,
  situacionSoporte,
} from "../presentacion"
import { rutaLiquidacion } from "../rutas"
import type {
  AlertaPendiente,
  DocumentoResumen,
  EstadoLiquidacion,
} from "../tipos"

/**
 * Piezas de presentación que comparten las tablas y la ficha de las
 * liquidaciones (sin estado: se pintan igual en el servidor y en el cliente).
 */

export function InsigniaEstadoLiquidacion({
  estado,
  className,
}: {
  estado: EstadoLiquidacion
  className?: string
}) {
  return (
    <InsigniaEstado
      catalogo={ESTADOS_LIQUIDACION}
      estado={estado}
      className={className}
    />
  )
}

export function InsigniaAlerta({ alerta }: { alerta: AlertaPendiente }) {
  return (
    <InsigniaTono
      tono="aviso"
      etiqueta={ETIQUETAS_ALERTA[alerta]}
      titulo={AYUDA_ALERTA[alerta]}
    />
  )
}

/** Documento soporte emitido / por emitir, o factura del medio registrada / faltante. */
export function InsigniaSoporte({
  fila,
}: {
  fila: {
    requiereDocumentoSoporte: boolean
    documento: DocumentoResumen | null
    numeroFacturaMedio: string | null
  }
}) {
  const situacion = situacionSoporte(fila)
  return <InsigniaTono tono={situacion.tono} etiqueta={situacion.etiqueta} />
}

/** Medio y periodo, con enlace a la ficha (celda principal de las tablas). */
export function CeldaLiquidacion({
  id,
  medio,
  periodoInicio,
  periodoFin,
  esDemo = false,
}: {
  id: string
  medio: string | null
  periodoInicio: string
  periodoFin: string
  esDemo?: boolean
}) {
  const periodo = periodoCompacto(periodoInicio, periodoFin)
  return (
    <span className="flex min-w-0 flex-col">
      <Link
        href={rutaLiquidacion(id)}
        className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
      >
        {medio ?? "Medio no visible"}
        <span className="sr-only">, periodo {periodo}</span>
      </Link>
      <span
        aria-hidden
        className="truncate text-xs cifras text-muted-foreground"
      >
        {periodo}
        {esDemo ? " · demo" : ""}
      </span>
    </span>
  )
}

/** Cifra en pesos alineada a la derecha (columnas de dinero). */
export function Pesos({
  valor,
  className,
}: {
  valor: number
  className?: string
}) {
  return (
    <span className={cn("cifras whitespace-nowrap", className)}>
      {formatearCOP(valor)}
    </span>
  )
}

/** Fecha compacta con la distancia relativa debajo (instante). */
export function FechaConDistancia({
  instante,
  ahora,
  relativa = true,
}: {
  instante: string | null
  /** Instante del servidor: la misma distancia en SSR e hidratación. */
  ahora: number
  relativa?: boolean
}) {
  if (!instante) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className="flex flex-col leading-tight"
      title={formatearFechaHora(instante)}
    >
      <time dateTime={instante} className="cifras whitespace-nowrap">
        {formatearFechaCompacta(instante)}
      </time>
      {relativa ? (
        <span
          suppressHydrationWarning
          className="text-[0.6875rem] whitespace-nowrap text-muted-foreground"
        >
          {formatearRelativo(instante, new Date(ahora))}
        </span>
      ) : null}
    </span>
  )
}

/** Un día de calendario (`AAAA-MM-DD`) en formato compacto. */
export function Dia({ dia }: { dia: string | null }) {
  if (!dia) return <span className="text-muted-foreground">—</span>
  return (
    <time dateTime={dia} className="cifras whitespace-nowrap">
      {formatearFechaCompacta(instanteDeDia(dia))}
    </time>
  )
}
