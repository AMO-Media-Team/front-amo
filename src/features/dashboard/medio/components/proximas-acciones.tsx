"use client"

import {
  CalendarCheck,
  ChartColumn,
  ChevronRight,
  Download,
  LockKeyhole,
  type LucideIcon,
  PencilLine,
  RefreshCw,
  Send,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { calcularPlazo, type UrgenciaPlazo } from "@/components/tiempo/plazo"
import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import { useAhora } from "@/components/tiempo/use-ahora"
import { rutaAsignacionMedio } from "@/features/mis-campanas/rutas"
import { disponibilidadAccion } from "@/features/mis-campanas/siguiente-accion"
import type {
  AccionMedio,
  TipoAccionMedio,
} from "@/features/mis-campanas/tipos"
import { formatearFechaHora, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { TarjetaPanel } from "../../components/tarjeta-panel"
import { claveAccion } from "../datos"

const ICONOS: Readonly<Record<TipoAccionMedio, LucideIcon>> = {
  DESCARGAR: Download,
  DESCARGAR_NUEVA_VERSION: RefreshCw,
  PUBLICAR: Send,
  CORREGIR_EVIDENCIA: PencilLine,
  CARGAR_METRICA: ChartColumn,
  CORREGIR_METRICAS: PencilLine,
}

type Tinte = UrgenciaPlazo | "bloqueada"

const TINTES: Readonly<Record<Tinte, { chip: string; barra: string }>> = {
  vencida: {
    chip: "bg-destructive/12 text-destructive",
    barra: "bg-destructive",
  },
  critica: {
    chip: "bg-destructive/12 text-destructive",
    barra: "bg-destructive",
  },
  pronto: { chip: "bg-warning/10 text-warning", barra: "bg-warning" },
  holgada: { chip: "bg-primary/10 text-primary", barra: "bg-primary/40" },
  bloqueada: { chip: "bg-muted text-muted-foreground", barra: "bg-border" },
}

/**
 * A dónde lleva cada acción: su pantalla (`accion`, con `asignaciones.ejecutar`),
 * la ficha de la asignación (`ficha`, solo con `asignaciones.ver_propias`) o
 * ninguna (sin esos permisos la lista solo informa).
 */
export type DestinoAcciones = "accion" | "ficha" | null

function rutaDe(accion: AccionMedio, destino: DestinoAcciones): Route | null {
  if (destino === "accion") return accion.ruta
  if (destino === "ficha") return rutaAsignacionMedio(accion.asignacionId)
  return null
}

/**
 * Tres líneas apiladas (acción, oferta, plazo): en la columna angosta de
 * escritorio y a 390 px, el plazo a la derecha partía la acción en dos líneas
 * y recortaba la oferta a unas pocas letras. La tarjeta entera es el enlace
 * (`after:inset-0`); su nombre accesible es la acción y la oferta, y el plazo
 * queda fuera del enlace para que su aviso no se repita al recorrer enlaces.
 */
function Accion({
  accion,
  ahora,
  ahoraServidor,
  destino,
}: {
  accion: AccionMedio
  ahora: Date
  ahoraServidor: number
  destino: DestinoAcciones
}) {
  const bloqueada = disponibilidadAccion(accion, ahora) === "bloqueada"
  const plazo = calcularPlazo(accion.venceAt, ahora)
  const tinte = TINTES[bloqueada ? "bloqueada" : plazo.urgencia]
  const Icono = ICONOS[accion.tipo]
  const ruta = rutaDe(accion, destino)
  return (
    <li
      className={cn(
        "relative flex items-start gap-3 overflow-hidden rounded-lg border bg-background/40 p-3 pl-3.5",
        ruta &&
          "transition-colors duration-200 hover:border-foreground/20 hover:bg-accent/40 has-[a:focus-visible]:anillo-foco motion-reduce:transition-none"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-2 left-0 w-0.5 rounded-full",
          tinte.barra
        )}
      />
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          tinte.chip
        )}
      >
        <Icono className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {ruta ? (
          <Link
            href={ruta}
            aria-label={`${accion.etiqueta}: ${accion.ofertaTitulo}`}
            className="text-[0.8125rem] leading-snug font-semibold outline-none after:absolute after:inset-0 after:content-['']"
          >
            {accion.etiqueta}
          </Link>
        ) : (
          <span className="text-[0.8125rem] leading-snug font-semibold">
            {accion.etiqueta}
          </span>
        )}
        <span
          aria-hidden={ruta ? true : undefined}
          className="truncate text-xs text-muted-foreground"
          title={accion.ofertaTitulo}
        >
          {accion.ofertaTitulo}
        </span>
        {bloqueada ? (
          <time
            dateTime={accion.disponibleDesde ?? undefined}
            title={
              accion.disponibleDesde
                ? `Se habilita el ${formatearFechaHora(accion.disponibleDesde)}`
                : undefined
            }
            className="mt-1 inline-flex items-center gap-1.5 text-xs cifras text-muted-foreground"
          >
            <LockKeyhole aria-hidden className="size-3.5 shrink-0" />
            {
              calcularPlazo(accion.disponibleDesde, ahora, {
                textos: { pendiente: "Se habilita en" },
              }).texto
            }
          </time>
        ) : (
          <CuentaRegresiva
            venceAt={accion.venceAt}
            ahoraServidor={ahoraServidor}
            etiqueta={`${accion.etiquetaPlazo} de «${accion.ofertaTitulo}»`}
            variante="texto"
            className="mt-1"
          />
        )}
      </span>
      {ruta ? (
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 self-center text-muted-foreground"
        />
      ) : null}
    </li>
  )
}

/**
 * Lo que el medio debe hacer (DSH-006): primero lo que ya puede hacer, del
 * plazo más cercano al más lejano, y luego los cortes que aún no se
 * habilitan. Cada acción lleva directo a su pantalla y su cuenta regresiva
 * se actualiza sola, coloreada por urgencia (además del texto: el color nunca
 * es el único canal). El orden llega fijo del servidor: la lista no salta
 * mientras se lee.
 */
export function ProximasAcciones({
  acciones,
  ahoraServidor,
  destino = "accion",
  restantes = 0,
  enlaceTodas,
  enlaceOfertas,
  enCurso = 0,
  className,
}: {
  acciones: readonly AccionMedio[]
  /** `Date.now()` del servidor al pintar (hidratación sin desajustes). */
  ahoraServidor: number
  destino?: DestinoAcciones
  /** Pendientes que no caben en el panel (`null`: hay más, sin contar). */
  restantes?: number | null
  /** «Mis campañas», donde están todas. */
  enlaceTodas?: Route | null
  /** «Ofertas», para el estado vacío de quien aún no acepta ninguna. */
  enlaceOfertas?: Route | null
  /** Negocios en curso: sin pendientes, esperan la revisión del equipo AMO. */
  enCurso?: number
  className?: string
}) {
  const ahora = useAhora(ahoraServidor)
  const pie =
    restantes === null
      ? "Tienes más pendientes en Mis campañas."
      : restantes > 0
        ? `Y ${formatearNumero(restantes)} ${restantes === 1 ? "pendiente más" : "pendientes más"} en Mis campañas.`
        : null
  return (
    <TarjetaPanel
      titulo="Próximas acciones"
      descripcion="Lo que tienes por hacer, del plazo más cercano al más lejano."
      icono={CalendarCheck}
      className={className}
      pie={pie}
      enlace={
        enlaceTodas && acciones.length > 0
          ? { href: enlaceTodas, texto: "Ver mis campañas" }
          : undefined
      }
    >
      {acciones.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-background/40 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/12 text-success">
            <CalendarCheck aria-hidden className="size-4.5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-semibold">Nada pendiente</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              {enCurso > 0
                ? "Lo que tienes en curso está en revisión del equipo AMO. Te avisamos si hay algo por hacer."
                : "Cuando aceptes una oferta verás aquí qué hacer y para cuándo."}
            </p>
            {enlaceOfertas && enCurso === 0 ? (
              <Link
                href={enlaceOfertas}
                className="mt-1 w-fit rounded-sm text-[0.8125rem] font-medium text-primary underline-offset-4 hover:underline focus-visible:anillo-foco"
              >
                Ver las ofertas de hoy
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <ol
          className="grid gap-2 @xl/bloque:grid-cols-2"
          aria-label="Acciones pendientes"
        >
          {acciones.map((accion) => (
            <Accion
              key={claveAccion(accion)}
              accion={accion}
              ahora={ahora}
              ahoraServidor={ahoraServidor}
              destino={destino}
            />
          ))}
        </ol>
      )}
    </TarjetaPanel>
  )
}
