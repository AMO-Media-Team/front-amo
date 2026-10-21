"use client"

import { ChartColumn, Download, Maximize2, Table2, X } from "lucide-react"
import { catchError, type ErrorInfo } from "next/error"
import {
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { EstadoError } from "@/components/feedback/estado-error"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { componerImagenGrafico, descargarLienzoPng } from "@/lib/export/imagen"
import { cn } from "@/lib/utils"

import { capturarLienzo } from "./captura"
import {
  ContextoRegistroGrafico,
  type GraficoRegistrado,
} from "./contexto-grafico"
import { EsqueletoAreaGrafico } from "./esqueleto-grafico"
import { TablaGrafico } from "./tabla-grafico"
import { estiloLienzo } from "./tema"
import { useTemaGraficos } from "./use-tema-graficos"

interface TarjetaGraficoProps {
  titulo: string
  descripcion?: ReactNode
  /** Controles propios (selector de métrica…), antes de las acciones estándar. */
  acciones?: ReactNode
  /** Nota al pie (definición, fuente, "alcance acumulado, sin deduplicar"). */
  pie?: ReactNode
  /**
   * Alto del área del gráfico, ejes incluidos: `min-h-*` (recomendado) o
   * `h-*`. Si la fila de la rejilla estira la tarjeta, el gráfico ocupa
   * también ese espacio.
   */
  alto?: string
  /** Nombre base del PNG exportado; por defecto, el título. */
  nombreArchivo?: string
  /** Sin datos: muestra un estado vacío en lugar del gráfico. */
  vacio?: { titulo: string; descripcion?: string } | false
  /** Primera carga: esqueleto en el área del gráfico. */
  cargando?: boolean
  /** Recarga: conserva el trazo anterior atenuado, sin saltos (dataviz). */
  actualizando?: boolean
  /** Nivel del título según la jerarquía de la página. */
  nivelTitulo?: "h2" | "h3"
  className?: string
  /** El gráfico. Se renderiza otra vez, más grande, en pantalla completa. */
  children: ReactNode
}

function FallaGrafico(
  { titulo }: { titulo: string },
  { error, retry }: ErrorInfo
) {
  const digest =
    error instanceof Error && "digest" in error
      ? String(error.digest)
      : undefined
  return (
    <EstadoError
      compacto
      nivelTitulo="h3"
      titulo={`No pudimos mostrar «${titulo}»`}
      descripcion="El resto del panel sigue disponible. Reintenta en unos segundos."
      onReintentar={() => retry()}
      digest={digest}
      className="h-full"
    />
  )
}

/** Aísla el fallo de un gráfico: el resto del panel sigue en pie. */
export const LimiteErrorGrafico = catchError(FallaGrafico)

function BotonAccion({
  etiqueta,
  onClick,
  activo,
  deshabilitado,
  children,
}: {
  /** Nombre accesible y tooltip. */
  etiqueta: string
  onClick: () => void
  /**
   * Solo visual: el botón de vista cambia de nombre ("Ver datos" ↔ "Ver
   * gráfico"), así que no usa además `aria-pressed` (el nombre de un botón
   * de alternancia no debe cambiar).
   */
  activo?: boolean
  deshabilitado?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={etiqueta}
            disabled={deshabilitado}
            onClick={onClick}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              activo && "bg-muted text-foreground"
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{etiqueta}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Contenedor estándar de un gráfico: título, descripción y acciones (ver
 * datos en tabla accesible, exportar PNG con marca, pantalla completa), límite
 * de error propio, esqueleto de carga y estado vacío.
 */
export function TarjetaGrafico({
  titulo,
  descripcion,
  acciones,
  pie,
  alto = "min-h-72",
  nombreArchivo = titulo,
  vacio = false,
  cargando = false,
  actualizando = false,
  nivelTitulo: Titulo = "h2",
  className,
  children,
}: TarjetaGraficoProps) {
  const idTitulo = useId()
  const tema = useTemaGraficos()
  const [vista, setVista] = useState<"grafico" | "tabla">("grafico")
  const [ampliado, setAmpliado] = useState(false)
  const [exportando, iniciarExportacion] = useTransition()
  const [registrado, setRegistrado] = useState<GraficoRegistrado | null>(null)
  const registroAmpliado = useRef<GraficoRegistrado | null>(null)
  const areaGrafico = useRef<HTMLDivElement>(null)
  const areaAmpliada = useRef<HTMLDivElement>(null)

  const registrarAmpliado = useCallback((grafico: GraficoRegistrado | null) => {
    registroAmpliado.current = grafico
  }, [])

  const disponible = !cargando && !vacio
  const verTabla = vista === "tabla" && registrado !== null
  const tablaVisible = vista === "tabla" ? registrado?.tabla : undefined

  /**
   * Vuelve a dibujar el gráfico fuera de pantalla (a doble densidad, sin
   * puntero ni tooltip, con leyenda y total de la dona en el lienzo); si no
   * puede, compone el lienzo visible.
   */
  async function lienzoParaExportar(
    grafico: GraficoRegistrado,
    area: HTMLElement | null
  ): Promise<HTMLCanvasElement> {
    const composicion = {
      titulo,
      descripcion: typeof descripcion === "string" ? descripcion : undefined,
      conSello: true,
    }
    try {
      return await capturarLienzo(children, {
        ...composicion,
        modo: tema.modo,
        ancho: area?.clientWidth || undefined,
        alto: area?.clientHeight || undefined,
      })
    } catch {
      const origen = grafico.instancia.current?.canvas
      if (!origen) throw new Error("Gráfico sin lienzo")
      return componerImagenGrafico(origen, {
        ...composicion,
        leyenda: grafico.leyenda,
        leyendaAlLado: grafico.leyendaAlLado,
        estilo: estiloLienzo(tema),
      })
    }
  }

  function exportar() {
    const grafico = ampliado ? registroAmpliado.current : registrado
    if (!grafico) return
    const area = ampliado ? areaAmpliada.current : areaGrafico.current
    iniciarExportacion(async () => {
      try {
        const lienzo = await lienzoParaExportar(grafico, area)
        await descargarLienzoPng(lienzo, nombreArchivo)
        toast.success("Imagen descargada", { description: titulo })
      } catch {
        toast.error("No se pudo generar la imagen. Intenta de nuevo.")
      }
    })
  }

  // Ocultas (sin perder su espacio) hasta que el gráfico se registra: si el
  // gráfico falla, la tarjeta no ofrece acciones que no harían nada.
  const accionesEstandar = disponible ? (
    <div
      className={cn(
        "flex items-center gap-0.5 transition-opacity duration-200",
        !registrado && "invisible opacity-0"
      )}
    >
      <BotonAccion
        etiqueta={verTabla ? "Ver gráfico" : "Ver datos"}
        activo={verTabla}
        deshabilitado={!registrado}
        onClick={() => setVista(verTabla ? "grafico" : "tabla")}
      >
        {verTabla ? <ChartColumn aria-hidden /> : <Table2 aria-hidden />}
      </BotonAccion>
      <BotonAccion
        etiqueta="Exportar PNG"
        deshabilitado={!registrado || exportando}
        onClick={exportar}
      >
        {exportando ? <Spinner aria-hidden /> : <Download aria-hidden />}
      </BotonAccion>
      <BotonAccion
        etiqueta="Pantalla completa"
        deshabilitado={!registrado}
        onClick={() => setAmpliado(true)}
      >
        <Maximize2 aria-hidden />
      </BotonAccion>
    </div>
  ) : null

  function cuerpo() {
    if (cargando) return <EsqueletoAreaGrafico />
    if (vacio) {
      return (
        <EstadoVacio
          variante="simple"
          icono={ChartColumn}
          titulo={vacio.titulo}
          descripcion={vacio.descripcion}
          className="h-full py-6"
        />
      )
    }
    return (
      <>
        <div className={cn("size-full", verTabla && "hidden")}>
          <ContextoRegistroGrafico value={setRegistrado}>
            {children}
          </ContextoRegistroGrafico>
        </div>
        {tablaVisible ? (
          <TablaGrafico
            tabla={tablaVisible}
            titulo={titulo}
            className="animate-in duration-200 fade-in-0 motion-reduce:animate-none"
          />
        ) : null}
      </>
    )
  }

  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "group/grafico flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 transition-colors duration-300 hover:border-foreground/15 sm:p-5",
        className
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Titulo
            id={idTitulo}
            className="font-heading text-[0.9375rem] leading-snug font-semibold"
          >
            {titulo}
          </Titulo>
          {descripcion ? (
            <p className="text-[0.8125rem] text-muted-foreground">
              {descripcion}
            </p>
          ) : null}
        </div>
        <div className="-mt-1 -mr-1.5 flex shrink-0 items-center gap-0.5">
          {acciones}
          {accionesEstandar}
        </div>
      </header>

      <div
        ref={areaGrafico}
        aria-busy={actualizando || undefined}
        className={cn(
          "relative flex-auto transition-opacity duration-300",
          actualizando && "pointer-events-none opacity-55",
          alto
        )}
      >
        {/* Posición absoluta: el contenido nunca empuja el alto (Chart.js
            mide el contenedor y crecería en bucle). */}
        <div className="absolute inset-0">
          <LimiteErrorGrafico titulo={titulo}>{cuerpo()}</LimiteErrorGrafico>
        </div>
      </div>

      {pie ? (
        <footer className="text-xs text-muted-foreground">{pie}</footer>
      ) : null}

      <Dialog open={ampliado} onOpenChange={setAmpliado}>
        {/* Fondo de tarjeta: las separaciones de 2 px y los anillos de los
            marcadores usan el color de la superficie del gráfico. */}
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(92dvh,56rem)] w-[min(96vw,80rem)] max-w-none flex-col gap-4 bg-card p-5 text-card-foreground sm:max-w-none sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="text-lg font-semibold">
                {titulo}
              </DialogTitle>
              {descripcion ? (
                <DialogDescription>{descripcion}</DialogDescription>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <BotonAccion
                etiqueta="Exportar PNG"
                deshabilitado={exportando}
                onClick={exportar}
              >
                {exportando ? (
                  <Spinner aria-hidden />
                ) : (
                  <Download aria-hidden />
                )}
              </BotonAccion>
              <DialogClose
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Cerrar" />
                }
              >
                <X aria-hidden />
              </DialogClose>
            </div>
          </div>
          <div ref={areaAmpliada} className="relative min-h-0 flex-1">
            <LimiteErrorGrafico titulo={titulo}>
              <ContextoRegistroGrafico value={registrarAmpliado}>
                {children}
              </ContextoRegistroGrafico>
            </LimiteErrorGrafico>
          </div>
          {pie ? <p className="text-xs text-muted-foreground">{pie}</p> : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
