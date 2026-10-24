"use client"

import {
  ChevronDown,
  CircleAlert,
  FileClock,
  FileText,
  ReceiptText,
  Upload,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { formatearCOP } from "@/lib/format"
import { cn } from "@/lib/utils"

import { cargarPagos } from "../actions"
import {
  archivosDescargables,
  avisoSegSocial,
  contarPublicaciones,
  documentoParaMedio,
  estadoParaMedio,
  fechaEstimada,
  rutaCargarFactura,
  textoPeriodo,
} from "../presentacion"
import { rutaLiquidacionMedio } from "../rutas"
import type { LiquidacionMedio, PaginaLiquidaciones } from "../tipos"
import { BotonDescargaLiquidacion } from "./descarga-liquidacion"

// ── Piezas comunes ───────────────────────────────────────────────────────────

/** Qué respalda el pago, en una línea: número, «en preparación» o «Carga tu factura». */
function DocumentoDelPago({
  liquidacion,
  compacto = false,
}: {
  liquidacion: LiquidacionMedio
  compacto?: boolean
}) {
  const documento = documentoParaMedio(liquidacion)
  switch (documento.tipo) {
    case "documento":
      return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <FileText aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">
            Documento soporte <span className="cifras">{documento.numero}</span>
          </span>
        </span>
      )
    case "documento-en-preparacion":
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <FileClock aria-hidden className="size-3.5 shrink-0" />
          Documento soporte en preparación
        </span>
      )
    case "factura":
      return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <ReceiptText aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">
            Factura <span className="cifras">{documento.numero}</span>
          </span>
        </span>
      )
    case "factura-pendiente":
      return (
        <EnlaceBoton
          href={rutaCargarFactura(liquidacion.id)}
          size="sm"
          className={cn("relative z-10", compacto ? "" : "w-full sm:w-fit")}
        >
          <Upload data-icon="inline-start" aria-hidden />
          Carga tu factura{" "}
          <span className="sr-only">
            del periodo{" "}
            {textoPeriodo(liquidacion.periodoInicio, liquidacion.periodoFin)}
          </span>
        </EnlaceBoton>
      )
    case "factura-sin-registrar":
      return (
        <span className="text-muted-foreground">Sin factura registrada</span>
      )
  }
}

function Descargas({
  liquidacion,
  className,
}: {
  liquidacion: LiquidacionMedio
  className?: string
}) {
  const archivos = archivosDescargables(liquidacion)
  if (archivos.length === 0) return null
  const contexto = `del periodo ${textoPeriodo(liquidacion.periodoInicio, liquidacion.periodoFin)}`
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {archivos.map((archivo) => (
        <BotonDescargaLiquidacion
          key={archivo}
          liquidacionId={liquidacion.id}
          archivo={archivo}
          contexto={contexto}
        />
      ))}
    </div>
  )
}

/** Fecha del pago o, mientras no se paga, hasta cuándo se espera. */
function FechaDelPago({
  liquidacion,
  hoy,
}: {
  liquidacion: LiquidacionMedio
  hoy: string
}) {
  const estimada = fechaEstimada(liquidacion, hoy)
  if (!estimada) return null
  return (
    <span
      className={cn(
        "text-xs",
        estimada.atrasada ? "text-warning" : "text-muted-foreground"
      )}
    >
      {estimada.texto}
    </span>
  )
}

// ── Celular: una tarjeta por liquidación ─────────────────────────────────────

function TarjetaPago({
  liquidacion,
  hoy,
  indice,
}: {
  liquidacion: LiquidacionMedio
  hoy: string
  indice: number
}) {
  const idTitulo = useId()
  const estado = estadoParaMedio(liquidacion)
  const aviso = avisoSegSocial(liquidacion)
  const periodo = textoPeriodo(
    liquidacion.periodoInicio,
    liquidacion.periodoFin
  )
  return (
    <li>
      <article
        aria-labelledby={idTitulo}
        style={{ animationDelay: `${Math.min(indice, 8) * 40}ms` }}
        className="group relative flex animate-aparecer-arriba flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 has-[a[data-titulo]:focus-visible]:ring-3 has-[a[data-titulo]:focus-visible]:ring-ring/50"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Periodo</span>
            <h3 id={idTitulo} className="text-base leading-snug font-semibold">
              <Link
                data-titulo
                data-pago={liquidacion.id}
                href={rutaLiquidacionMedio(liquidacion.id)}
                className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:underline hover:underline-offset-4"
              >
                {periodo}
              </Link>
            </h3>
          </div>
          <InsigniaTono
            tono={estado.tono}
            etiqueta={estado.etiqueta}
            titulo={estado.descripcion}
          />
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground">
              {liquidacion.estado === "PAGADA" ? "Recibiste" : "Recibes"} (neto)
            </span>
            <span className="text-2xl leading-tight font-bold cifras tracking-tight">
              {formatearCOP(liquidacion.montoNeto)}
            </span>
          </div>
          <span className="text-right text-xs text-muted-foreground">
            {contarPublicaciones(liquidacion.cantidadAsignaciones)}
            {liquidacion.montoRetenciones > 0 ? (
              <>
                <br />
                <span className="cifras">
                  Retenciones {formatearCOP(liquidacion.montoRetenciones)}
                </span>
              </>
            ) : null}
          </span>
        </div>

        <FechaDelPago liquidacion={liquidacion} hoy={hoy} />

        {aviso ? (
          <p className="flex items-start gap-1.5 text-xs text-pretty text-warning">
            <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            {aviso.texto}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 border-t pt-3 text-sm">
          <DocumentoDelPago liquidacion={liquidacion} />
          <Descargas liquidacion={liquidacion} />
        </div>
      </article>
    </li>
  )
}

// ── Desde 42 rem de ancho útil (tablet y escritorio): tabla ──────────────────

function TablaPagos({
  liquidaciones,
  hoy,
}: {
  liquidaciones: readonly LiquidacionMedio[]
  hoy: string
}) {
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card @2xl/pagos:block">
      <Table>
        <TableCaption className="sr-only">
          Tus liquidaciones, de la más reciente a la más antigua
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Periodo</TableHead>
            <TableHead scope="col">Estado</TableHead>
            <TableHead scope="col" className="text-right">
              Neto
            </TableHead>
            <TableHead scope="col">Documento</TableHead>
            <TableHead scope="col">
              <span className="sr-only">Descargas</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {liquidaciones.map((liquidacion) => {
            const estado = estadoParaMedio(liquidacion)
            const aviso = avisoSegSocial(liquidacion)
            return (
              <TableRow key={liquidacion.id} className="align-top">
                <TableCell className="py-3 whitespace-normal">
                  <div className="flex flex-col gap-0.5">
                    <Link
                      data-pago={liquidacion.id}
                      href={rutaLiquidacionMedio(liquidacion.id)}
                      className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                    >
                      {textoPeriodo(
                        liquidacion.periodoInicio,
                        liquidacion.periodoFin
                      )}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {contarPublicaciones(liquidacion.cantidadAsignaciones)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-3 whitespace-normal">
                  <div className="flex flex-col items-start gap-1">
                    <InsigniaTono
                      tono={estado.tono}
                      etiqueta={estado.etiqueta}
                      titulo={estado.descripcion}
                    />
                    <FechaDelPago liquidacion={liquidacion} hoy={hoy} />
                    {aviso ? (
                      <span className="max-w-52 text-xs text-pretty text-warning">
                        {aviso.texto}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="py-3 text-right font-semibold cifras">
                  {formatearCOP(liquidacion.montoNeto)}
                </TableCell>
                <TableCell className="max-w-56 py-3 text-sm whitespace-normal">
                  <DocumentoDelPago liquidacion={liquidacion} compacto />
                </TableCell>
                <TableCell className="py-3 whitespace-normal">
                  <Descargas
                    liquidacion={liquidacion}
                    className="justify-end"
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Lista con «Ver pagos anteriores» ─────────────────────────────────────────

/** Destino del foco cuando ya no quedan pagos por agregar: el aviso final. */
const FIN = "fin"

/**
 * Enfoca el enlace del pago en la vista visible: cada pago está en la tarjeta
 * y en la fila de la tabla, y el de la vista oculta (`display: none`) no toma
 * el foco, así que se prueba en orden hasta que uno lo tome.
 */
function enfocarPago(raiz: HTMLElement | null, id: string): boolean {
  if (!raiz) return false
  const enlaces = raiz.querySelectorAll<HTMLElement>("[data-pago]")
  for (const enlace of enlaces) {
    if (enlace.dataset.pago !== id) continue
    enlace.focus()
    if (document.activeElement === enlace) return true
  }
  return false
}

/**
 * Tus pagos (MED-015): una tarjeta por liquidación en el celular y una tabla
 * cuando hay ancho (se mide el contenedor: la barra lateral abierta le quita
 * espacio). «Ver pagos anteriores» pide la página que sigue a la última
 * mostrada (cursor por `id`) y la agrega encima del botón: mientras carga, el
 * botón sigue enfocable, y al terminar el foco pasa al primer pago agregado
 * (con Tab se sigue por los demás) o, si no llegó ninguno, al aviso final.
 */
export function ListaPagos({
  inicial,
  hoy,
}: {
  inicial: PaginaLiquidaciones
  /** Día de Bogotá del servidor ('YYYY-MM-DD'): decide si un pago va con retraso. */
  hoy: string
}) {
  const [liquidaciones, setLiquidaciones] = useState(inicial.liquidaciones)
  const [siguiente, setSiguiente] = useState(inicial.siguiente)
  const [paginado, setPaginado] = useState(false)
  const [cargando, iniciar] = useTransition()
  const [anuncio, setAnuncio] = useState("")
  const contenedor = useRef<HTMLDivElement>(null)
  const avisoFinal = useRef<HTMLParagraphElement>(null)
  /** Tras una carga: el `id` del primer pago agregado o `FIN`. */
  const focoPendiente = useRef<string | null>(null)

  // El foco se mueve cuando termina la carga: ya están pintados los pagos
  // nuevos (o el aviso final, si el botón desapareció).
  useEffect(() => {
    const destino = focoPendiente.current
    if (cargando || destino === null) return
    focoPendiente.current = null
    if (destino !== FIN && enfocarPago(contenedor.current, destino)) return
    avisoFinal.current?.focus()
  }, [cargando])

  if (liquidaciones.length === 0) {
    return (
      <EstadoVacio
        icono={Wallet}
        titulo="Aún no tienes pagos"
        descripcion="Cuando liquidemos tus publicaciones verificadas verás aquí cada pago, su estado y sus soportes."
        className="flex-none py-12"
      />
    )
  }

  function verMas() {
    if (siguiente === null || cargando) return
    iniciar(async () => {
      const resultado = await cargarPagos({ antesId: siguiente })
      if (!resultado.ok) {
        toast.error("No pudimos cargar más pagos", {
          description: resultado.error,
        })
        return
      }
      const nuevas = resultado.datos.liquidaciones
      const primera = nuevas.at(0)
      // Sin pagos nuevos y con más páginas, el foco sigue en el botón.
      focoPendiente.current = primera
        ? primera.id
        : resultado.datos.siguiente === null
          ? FIN
          : null
      setLiquidaciones((actuales) => [...actuales, ...nuevas])
      setSiguiente(resultado.datos.siguiente)
      setPaginado(true)
      setAnuncio(
        nuevas.length === 1
          ? "Se agregó 1 pago anterior."
          : `Se agregaron ${nuevas.length} pagos anteriores.`
      )
    })
  }

  return (
    <div ref={contenedor} className="@container/pagos flex flex-col gap-4">
      <ol
        aria-label="Tus pagos"
        className="flex flex-col gap-3 @2xl/pagos:hidden"
      >
        {liquidaciones.map((liquidacion, indice) => (
          <TarjetaPago
            key={liquidacion.id}
            liquidacion={liquidacion}
            hoy={hoy}
            indice={indice}
          />
        ))}
      </ol>
      <TablaPagos liquidaciones={liquidaciones} hoy={hoy} />
      {siguiente !== null ? (
        <Button
          type="button"
          variant="outline"
          className="self-center data-disabled:cursor-not-allowed data-disabled:opacity-50"
          onClick={verMas}
          disabled={cargando}
          // Deshabilitado de forma nativa, el navegador le quitaría el foco.
          focusableWhenDisabled
          aria-busy={cargando || undefined}
        >
          {cargando ? (
            <Spinner data-icon="inline-start" role={undefined} aria-hidden />
          ) : (
            <ChevronDown data-icon="inline-start" aria-hidden />
          )}
          {cargando ? "Cargando…" : "Ver pagos anteriores"}
        </Button>
      ) : paginado || liquidaciones.length > 3 ? (
        <p
          ref={avisoFinal}
          tabIndex={-1}
          className="self-center rounded-md px-1 text-center text-xs text-muted-foreground outline-none focus-visible:anillo-foco"
        >
          Estos son todos tus pagos.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {anuncio}
      </p>
    </div>
  )
}
