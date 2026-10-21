"use client"

import { ExternalLink, History, X } from "lucide-react"
import type { Route } from "next"
import { Suspense, use, useState } from "react"

import { EstadoError } from "@/components/feedback/estado-error"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  ACCIONES,
  esAccionBitacora,
  ORIGENES,
} from "@/features/auditoria/catalogo"
import {
  type CambiosPresentados,
  construirCambios,
} from "@/features/auditoria/diferencias"
import { VisorDiferencias } from "@/features/auditoria/components/visor-diferencias"
import { CLASES_TONO } from "@/features/usuarios/components/distintivos"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"
import type { Json } from "@/types/database.types"

import type { EntidadHistorial } from "../schemas"
import type { EventoHistorial } from "../tipos"

export interface ObjetivoHistorial {
  entidad: EntidadHistorial
  entidadId: string
  /** Qué se está mirando («Comisión global», «Franja F2»). */
  titulo: string
  /**
   * Presentación propia de un campo (p. ej. el valor de un parámetro según su
   * tipo y unidad). `null` deja la presentación genérica de la bitácora.
   */
  formatearCampo?: (campo: string, valor: unknown) => string | null
  /**
   * Campos que importan en la CREACIÓN del registro. La bitácora guarda la
   * fila completa (reglas, descripción, unidad…); aquí basta lo que la
   * persona puede cambiar. Sin lista, solo se ocultan las columnas técnicas
   * (id, marcas de tiempo, autor). Las ediciones siempre muestran todo lo
   * que cambió.
   */
  camposCreacion?: readonly string[]
}

/** Eventos que se muestran antes de «Ver cambios anteriores». */
const LIMITE_HISTORIAL_VISIBLE = 8

/**
 * Columnas que la bitácora guarda al CREAR o ELIMINAR un registro (la fila
 * completa) y que aquí solo estorban: el identificador, las marcas de tiempo
 * (el evento ya dice cuándo) y el autor (el evento ya dice quién).
 */
const CAMPOS_TECNICOS: ReadonlySet<string> = new Set([
  "id",
  "created_at",
  "updated_at",
  "creada_por",
])

type Pedido = {
  objetivo: ObjetivoHistorial
  promesa: Promise<ResultadoAccion<EventoHistorial[]>>
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

/** Valor crudo de un campo del evento (par antes/después en una edición). */
function crudo(
  cambios: Json | null,
  campo: string,
  lado: "antes" | "despues"
): unknown {
  if (!esObjeto(cambios)) return undefined
  const valor = cambios[campo]
  if (esObjeto(valor) && ("antes" in valor || "despues" in valor)) {
    return valor[lado]
  }
  return valor
}

function personalizar(
  presentados: CambiosPresentados,
  evento: EventoHistorial,
  { formatearCampo: formatear, camposCreacion }: ObjetivoHistorial
): CambiosPresentados {
  // Creación y eliminación traen la fila completa; una edición, solo lo que cambió.
  const filaCompleta =
    presentados.modo === "creacion" || presentados.modo === "eliminacion"
  const visibles = !filaCompleta
    ? presentados.campos
    : presentados.campos.filter((c) =>
        presentados.modo === "creacion" && camposCreacion
          ? camposCreacion.includes(c.campo)
          : !CAMPOS_TECNICOS.has(c.campo)
      )
  if (!formatear) return { ...presentados, campos: visibles }
  return {
    ...presentados,
    campos: visibles.map((campo) => {
      const reemplazo = (lado: "antes" | "despues") => {
        const actual = campo[lado]
        if (!actual || actual.tipo === "vacio") return actual
        const texto = formatear(
          campo.campo,
          crudo(evento.cambios, campo.campo, lado)
        )
        return texto === null ? actual : { tipo: "texto" as const, texto }
      }
      return {
        ...campo,
        antes: reemplazo("antes"),
        despues: reemplazo("despues"),
      }
    }),
  }
}

/** Enlace a la bitácora completa, filtrada por la entidad y el registro. */
function rutaBitacora(objetivo: ObjetivoHistorial): Route {
  const consulta = new URLSearchParams({
    entidad: objetivo.entidad,
    q: objetivo.entidadId,
  })
  return `/administracion/auditoria?${consulta.toString()}` as Route
}

/**
 * Historial de cambios de un registro de configuración, leído de la
 * bitácora inmutable (RLS: `auditoria.ver`). Cada evento muestra quién,
 * cuándo, desde dónde y qué cambió (antes → después).
 */
export function HojaHistorial({
  pedido,
  abierta,
  onAbiertaChange,
}: {
  pedido: Pedido | null
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
}) {
  return (
    <Sheet open={abierta} onOpenChange={onAbiertaChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
      >
        <SheetHeader className="flex-row items-start gap-3 border-b px-5 py-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <History className="size-5" aria-hidden />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SheetTitle className="text-base font-semibold">
              Historial de cambios
            </SheetTitle>
            <SheetDescription className="truncate">
              {pedido?.objetivo.titulo ?? ""}
            </SheetDescription>
          </div>
          <SheetClose
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Cerrar" />
            }
          >
            <X aria-hidden />
          </SheetClose>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
          {pedido ? (
            <Suspense
              key={pedido.objetivo.entidadId}
              fallback={<EsqueletoHistorial />}
            >
              <ListaEventos pedido={pedido} />
            </Suspense>
          ) : null}
        </div>

        {pedido ? (
          <div className="border-t bg-muted/30 px-5 py-3">
            <EnlaceBoton
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground"
              href={rutaBitacora(pedido.objetivo)}
            >
              <ExternalLink data-icon="inline-start" aria-hidden />
              Abrir en la bitácora de auditoría
            </EnlaceBoton>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

export type { Pedido as PedidoHistorial }

function EsqueletoHistorial() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Cargando el historial…</span>
      {Array.from({ length: 3 }, (_, indice) => (
        <div key={indice} className="flex gap-3">
          <Esqueleto className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Esqueleto className="h-4 w-40" />
            <Esqueleto className="h-3 w-56" />
            <Esqueleto className="h-14 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ListaEventos({ pedido }: { pedido: Pedido }) {
  const resultado = use(pedido.promesa)
  const [verTodos, setVerTodos] = useState(false)

  if (!resultado.ok) {
    return (
      <EstadoError
        titulo="No pudimos cargar el historial"
        descripcion={resultado.error}
        className="py-8"
      />
    )
  }
  const eventos = resultado.datos
  if (eventos.length === 0) {
    return (
      <EstadoVacio
        icono={History}
        titulo="Sin cambios registrados"
        descripcion="Este valor conserva la configuración inicial. Cada cambio futuro quedará aquí, con su autor y la hora."
        variante="simple"
        className="py-8"
      />
    )
  }
  const visibles = verTodos
    ? eventos
    : eventos.slice(0, LIMITE_HISTORIAL_VISIBLE)

  return (
    <div className="flex flex-col gap-4">
      <ol className="relative flex flex-col gap-5 before:absolute before:top-2 before:bottom-2 before:left-[0.9375rem] before:w-px before:bg-border">
        {visibles.map((evento) => (
          <EventoLinea
            key={evento.id}
            evento={evento}
            objetivo={pedido.objetivo}
          />
        ))}
      </ol>
      {eventos.length > visibles.length ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setVerTodos(true)}
        >
          Ver {eventos.length - visibles.length} cambios anteriores
        </Button>
      ) : null}
    </div>
  )
}

function EventoLinea({
  evento,
  objetivo,
}: {
  evento: EventoHistorial
  objetivo: ObjetivoHistorial
}) {
  const accion = esAccionBitacora(evento.accion)
    ? ACCIONES[evento.accion]
    : ACCIONES.OTRO
  const tono = accion.tono === "marca" ? "info" : accion.tono
  const cambios = personalizar(
    construirCambios(evento.accion, evento.cambios),
    evento,
    objetivo
  )
  const origen =
    evento.origen === "APP" ? null : ORIGENES[evento.origen].etiqueta

  return (
    <li className="relative flex gap-3">
      <span
        aria-hidden
        className={cn(
          "relative z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-popover",
          CLASES_TONO[tono].insignia
        )}
      >
        <span className={cn("size-2 rounded-full", CLASES_TONO[tono].punto)} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">
            {accion.etiqueta}
            {origen ? (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
                {origen}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {evento.actor ?? "Sistema"} ·{" "}
            <time
              dateTime={evento.at}
              title={formatearFechaHora(evento.at)}
              suppressHydrationWarning
            >
              {formatearRelativo(evento.at)}
            </time>
          </p>
        </div>
        <VisorDiferencias cambios={cambios} />
      </div>
    </li>
  )
}
