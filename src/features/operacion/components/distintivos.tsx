import { BadgeCheck, CircleDashed } from "lucide-react"
import type { CSSProperties } from "react"

import { CLASES_TONO } from "@/features/usuarios/components/distintivos"
import { formatearCompacto, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  etiquetaNivel,
  PLATAFORMAS,
  type Plataforma,
  type PresentacionEstado,
  type Tono,
} from "../estados"
import { formatearHandle } from "../formato"
import type { CuentaCompacta } from "../tipos"

export { CLASES_TONO }

const INSIGNIA =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap"

/**
 * Estado de cualquier máquina de la operación (medio, oferta, asignación…)
 * con su tono; la descripción queda como ayuda al pasar el cursor.
 */
export function InsigniaEstado<E extends string>({
  catalogo,
  estado,
  className,
}: {
  catalogo: Readonly<Record<E, PresentacionEstado>>
  estado: E
  className?: string
}) {
  const { etiqueta, tono, descripcion } = catalogo[estado]
  return (
    <InsigniaTono
      tono={tono}
      etiqueta={etiqueta}
      titulo={descripcion}
      className={className}
    />
  )
}

export function InsigniaTono({
  tono,
  etiqueta,
  titulo,
  className,
}: {
  tono: Tono
  etiqueta: string
  titulo?: string
  className?: string
}) {
  const clases = CLASES_TONO[tono]
  return (
    <span title={titulo} className={cn(INSIGNIA, clases.insignia, className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", clases.punto)} />
      {etiqueta}
    </span>
  )
}

/** Registro de los datos demo (se purgan antes de producción). */
export function InsigniaDemo({ className }: { className?: string }) {
  return (
    <span
      title="Dato de demostración: se elimina antes de producción."
      className={cn(
        INSIGNIA,
        "h-5 border border-dashed px-2 text-[0.6875rem] text-muted-foreground",
        className
      )}
    >
      Demo
    </span>
  )
}

/** Nivel de verificación del medio (0–3) como un medidor de tres barras. */
export function InsigniaNivel({
  nivel,
  compacta = false,
  className,
}: {
  nivel: number
  /** Solo el medidor y "N2" (tablas angostas). */
  compacta?: boolean
  className?: string
}) {
  const etiqueta = etiquetaNivel(nivel)
  return (
    <span
      title={etiqueta}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm whitespace-nowrap",
        nivel === 0 && "text-muted-foreground",
        className
      )}
    >
      <span aria-hidden className="flex h-3.5 items-end gap-0.5">
        {[1, 2, 3].map((paso) => (
          <span
            key={paso}
            style={{ height: `${35 + paso * 21}%` }}
            className={cn(
              "w-1 rounded-full",
              paso <= nivel ? "bg-primary" : "bg-muted-foreground/25"
            )}
          />
        ))}
      </span>
      {compacta ? (
        <>
          <span aria-hidden className="cifras">
            {nivel > 0 ? `N${nivel}` : "—"}
          </span>
          <span className="sr-only">{etiqueta}</span>
        </>
      ) : (
        etiqueta
      )}
    </span>
  )
}

/**
 * Identidad visual de cada plataforma sin logotipos de marca: monograma
 * sobre un tinte propio (el texto mezcla el color con el primer plano para
 * conservar el contraste en ambos temas).
 */
const ESTILO_PLATAFORMA: Readonly<
  Record<Plataforma, { abreviatura: string; color: string }>
> = {
  INSTAGRAM: { abreviatura: "IG", color: "var(--chart-5)" },
  FACEBOOK: { abreviatura: "FB", color: "var(--chart-7)" },
  TIKTOK: { abreviatura: "TT", color: "var(--foreground)" },
}

export function MarcaPlataforma({
  plataforma,
  conNombre = false,
  className,
}: {
  plataforma: Plataforma
  conNombre?: boolean
  className?: string
}) {
  const { abreviatura, color } = ESTILO_PLATAFORMA[plataforma]
  const nombre = PLATAFORMAS[plataforma]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        className
      )}
      title={conNombre ? undefined : nombre}
    >
      <span
        aria-hidden
        style={{ "--color-plataforma": color } as CSSProperties}
        className="inline-grid size-5 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--color-plataforma)_15%,transparent)] text-[0.5625rem] font-bold tracking-wide text-[color-mix(in_oklab,var(--color-plataforma)_62%,var(--foreground))] ring-1 ring-[color-mix(in_oklab,var(--color-plataforma)_32%,transparent)] ring-inset"
      >
        {abreviatura}
      </span>
      {conNombre ? (
        <span className="text-sm">{nombre}</span>
      ) : (
        <span className="sr-only">{nombre}</span>
      )}
    </span>
  )
}

/** Cuenta social compacta: plataforma, seguidores verificados y franja. */
export function ChipCuenta({ cuenta }: { cuenta: CuentaCompacta }) {
  const descripcion = `${PLATAFORMAS[cuenta.plataforma]} ${formatearHandle(cuenta.handle)}: ${
    cuenta.seguidores === null
      ? "sin seguidores verificados"
      : `${formatearNumero(cuenta.seguidores)} seguidores`
  }${cuenta.franja ? `, franja ${cuenta.franja}` : ""}${cuenta.verificada ? "" : ", sin verificar"}`
  return (
    <span
      title={descripcion}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border bg-background/60 py-0.5 pr-2 pl-0.5 text-xs whitespace-nowrap",
        !cuenta.verificada && "border-dashed text-muted-foreground"
      )}
    >
      <MarcaPlataforma
        plataforma={cuenta.plataforma}
        className="[&>span:first-child]:size-4.5 [&>span:first-child]:rounded-full"
      />
      <span aria-hidden className="font-medium cifras">
        {formatearCompacto(cuenta.seguidores)}
      </span>
      {cuenta.franja ? (
        <span aria-hidden className="text-[0.6875rem] text-muted-foreground">
          {cuenta.franja}
        </span>
      ) : null}
      <span className="sr-only">{descripcion}</span>
    </span>
  )
}

/** Verificada o no, con ícono (la palabra queda para lectores en modo compacto). */
export function IndicadorVerificada({
  verificada,
  compacto = false,
}: {
  verificada: boolean
  compacto?: boolean
}) {
  const Icono = verificada ? BadgeCheck : CircleDashed
  const texto = verificada ? "Verificada" : "Sin verificar"
  return (
    <span
      title={texto}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        verificada ? "text-success" : "text-muted-foreground"
      )}
    >
      <Icono aria-hidden className="size-3.5" />
      <span className={cn(compacto && "sr-only")}>{texto}</span>
    </span>
  )
}

const TONOS_BARRA: Readonly<Record<Tono | "primario", string>> = {
  primario: "bg-primary",
  exito: "bg-success",
  info: "bg-info",
  aviso: "bg-warning",
  peligro: "bg-destructive",
  neutro: "bg-muted-foreground/60",
}

/**
 * Barra de llenado decorativa (0–1). La cifra siempre va en texto al lado:
 * la barra solo la refuerza.
 */
export function BarraLlenado({
  fraccion,
  tono = "primario",
  className,
}: {
  fraccion: number | null
  tono?: Tono | "primario"
  className?: string
}) {
  const ancho = Math.round(Math.min(1, Math.max(0, fraccion ?? 0)) * 100)
  return (
    <span
      aria-hidden
      className={cn(
        "block h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <span
        className={cn(
          "block h-full rounded-full transition-[width] duration-700 ease-suave motion-reduce:transition-none",
          TONOS_BARRA[tono]
        )}
        style={{ width: `${ancho}%` }}
      />
    </span>
  )
}
