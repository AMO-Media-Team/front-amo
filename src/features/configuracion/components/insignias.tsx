import { Eye, FlaskConical, Lock, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { CLASES_TONO } from "@/features/usuarios/components/distintivos"
import type { Tono } from "@/features/usuarios/presentacion"
import { cn } from "@/lib/utils"

import { ETIQUETAS_ESTADO_VERSION, type EstadoVersion } from "../terminos"
import { ETIQUETAS_VIGENCIA, type EstadoVigencia } from "../vigencias"

const INSIGNIA =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap"

/** Insignia de tono semántico: punto o icono y texto AA sobre su tinte. */
export function Insignia({
  tono,
  icono: Icono,
  children,
  title,
  className,
}: {
  tono: Tono
  icono?: LucideIcon
  children: ReactNode
  title?: string
  className?: string
}) {
  const clases = CLASES_TONO[tono]
  return (
    <span title={title} className={cn(INSIGNIA, clases.insignia, className)}>
      {Icono ? (
        <Icono aria-hidden className="size-3.5" />
      ) : (
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", clases.punto)}
        />
      )}
      {children}
    </span>
  )
}

const TONO_VIGENCIA: Readonly<Record<EstadoVigencia, Tono>> = {
  VIGENTE: "exito",
  PROGRAMADA: "info",
  FINALIZADA: "neutro",
}

export function InsigniaVigencia({
  estado,
  className,
}: {
  estado: EstadoVigencia
  className?: string
}) {
  return (
    <Insignia tono={TONO_VIGENCIA[estado]} className={className}>
      {ETIQUETAS_VIGENCIA[estado]}
    </Insignia>
  )
}

const TONO_VERSION: Readonly<Record<EstadoVersion, Tono>> = {
  BORRADOR: "aviso",
  PROGRAMADA: "info",
  VIGENTE: "exito",
  ANTERIOR: "neutro",
}

export function InsigniaVersion({ estado }: { estado: EstadoVersion }) {
  return (
    <Insignia tono={TONO_VERSION[estado]}>
      {ETIQUETAS_ESTADO_VERSION[estado]}
    </Insignia>
  )
}

/**
 * Cifra sugerida que aún no confirma negocio o el contador
 * (`pendiente_validacion`). Compacta en filas densas.
 */
export function InsigniaPendiente({
  compacta = false,
  className,
}: {
  compacta?: boolean
  className?: string
}) {
  return (
    <Insignia
      tono="aviso"
      icono={FlaskConical}
      title="Cifra sugerida: falta confirmarla con negocio o con el contador."
      className={className}
    >
      {compacta ? "Por validar" : "Pendiente de validación"}
    </Insignia>
  )
}

/** Aviso de que quien mira puede consultar pero no cambiar. */
export function InsigniaSoloLectura({ className }: { className?: string }) {
  return (
    <Insignia tono="neutro" icono={Lock} className={className}>
      Solo lectura
    </Insignia>
  )
}

/** Valor visible para todos los usuarios activos (`es_publica`). */
export function InsigniaPublica() {
  return (
    <Insignia
      tono="neutro"
      icono={Eye}
      title="Lo ven todos los usuarios activos (anunciantes y medios incluidos)."
    >
      Público
    </Insignia>
  )
}
