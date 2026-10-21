"use client"

import {
  BadgeCheck,
  CircleAlert,
  ExternalLink,
  ImageOff,
  RefreshCw,
  ScanEye,
  TriangleAlert,
  X,
} from "lucide-react"
import Image from "next/image"
import { useCallback, useEffect, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  formatearFecha,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { firmarEvidencias, type ImagenesEvidencia } from "../actions"
import {
  CORTES,
  type Corte,
  ESTADOS_VALIDACION,
  type Plataforma,
} from "../estados"
import {
  cerrarFrase,
  formatearDiaMes,
  formatearFechaHoraFija,
} from "../formato"
import {
  type CorteMetrica,
  describirAlertas,
  engagement,
  nombresColumnas,
  tieneAlerta,
} from "../metricas"
import type { PublicacionEvidencia } from "../tipos"
import { InsigniaEstado } from "./distintivos"

/** Las URL firmadas se vuelven a pedir al consumir esta parte de su vigencia. */
const FRACCION_RENOVACION = 0.8

/** Qué captura muestra el visor: la URL se resuelve con las firmas vigentes. */
interface ImagenAbierta {
  origen: "publicaciones" | "metricas"
  id: string
  titulo: string
  descripcion: string
}

type EstadoFirmas =
  | { tipo: "cargando" }
  | { tipo: "listo"; imagenes: ImagenesEvidencia; firmadoEn: number }
  | { tipo: "error"; mensaje: string }

/** Firma las capturas de la asignación al montar y bajo demanda. */
function useFirmas(asignacionId: string, conImagenes: boolean) {
  const [estado, setEstado] = useState<EstadoFirmas>({ tipo: "cargando" })
  const [, iniciar] = useTransition()

  const firmar = useCallback(() => {
    iniciar(async () => {
      setEstado({ tipo: "cargando" })
      const resultado = await firmarEvidencias({ asignacionId })
      setEstado(
        resultado.ok
          ? { tipo: "listo", imagenes: resultado.datos, firmadoEn: Date.now() }
          : { tipo: "error", mensaje: resultado.error }
      )
    })
  }, [asignacionId])

  useEffect(() => {
    if (conImagenes) firmar()
  }, [conImagenes, firmar])

  /** Vuelve a firmar si las URL están por caducar (se llama al abrir el visor). */
  const asegurarVigentes = useCallback(() => {
    const caducan =
      estado.tipo !== "listo" ||
      Date.now() - estado.firmadoEn >=
        estado.imagenes.vigenciaSegundos * 1000 * FRACCION_RENOVACION
    if (caducan) firmar()
  }, [estado, firmar])

  return { estado, firmar, asegurarVigentes }
}

function Miniatura({
  url,
  cargando,
  etiqueta,
  onAbrir,
}: {
  url: string | null
  cargando: boolean
  etiqueta: string
  onAbrir: () => void
}) {
  if (cargando) {
    return (
      <div
        role="status"
        aria-label="Cargando captura"
        className="aspect-[4/5] w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
      />
    )
  }
  if (!url) {
    return (
      <div className="grid aspect-[4/5] w-full place-items-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
        <span className="flex flex-col items-center gap-1.5 px-3 text-center text-xs">
          <ImageOff aria-hidden className="size-5" />
          Captura no disponible
        </span>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group/miniatura relative block aspect-[4/5] w-full overflow-hidden rounded-lg border bg-muted focus-visible:anillo-foco"
    >
      <Image
        src={url}
        alt={etiqueta}
        fill
        unoptimized
        sizes="(min-width: 1024px) 12rem, 40vw"
        className="object-cover transition-transform duration-500 ease-suave group-hover/miniatura:scale-[1.03] motion-reduce:transition-none"
      />
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover/miniatura:opacity-100 group-focus-visible/miniatura:opacity-100">
        <ScanEye aria-hidden className="size-3.5" />
        Ampliar
      </span>
    </button>
  )
}

/** Cifra exacta: quien valida compara contra la captura del panel. */
function Cifra({ valor }: { valor: number | null }) {
  return valor === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <>{formatearNumero(valor)}</>
  )
}

const CELDA_CIFRA = "px-3 py-2.5 text-right whitespace-nowrap cifras"
const COLUMNAS_TABLA = 6

function FilaCorte({
  corte,
  onVerCaptura,
}: {
  corte: CorteMetrica
  onVerCaptura: (() => void) | null
}) {
  const alerta = tieneAlerta(corte)
  const motivos = alerta ? describirAlertas(corte) : []
  const tasa = engagement(corte.interacciones, corte.alcance)
  return (
    <>
      <tr className={cn("align-top", alerta && "bg-warning/6")}>
        <th
          scope="row"
          className="py-2.5 pr-3 pl-4 text-left font-medium whitespace-nowrap sm:pl-5"
        >
          <span className="flex items-center gap-1.5">
            {alerta ? (
              <TriangleAlert
                role="img"
                aria-label="Con alerta de integridad"
                className="size-3.5 shrink-0 text-warning"
              />
            ) : null}
            {CORTES[corte.corte].etiqueta}
            <time
              dateTime={corte.fechaCorte}
              title={formatearFecha(corte.fechaCorte)}
              className="text-[0.6875rem] font-normal cifras text-muted-foreground"
            >
              · {formatearDiaMes(corte.fechaCorte)}
            </time>
          </span>
          <span className="mt-1 flex items-center gap-1">
            {/* Fondo propio: sobre la fila teñida la insignia perdería contraste. */}
            <span className="inline-flex rounded-full bg-card">
              <InsigniaEstado
                catalogo={ESTADOS_VALIDACION}
                estado={corte.estado}
                className="h-5 px-2 text-[0.6875rem]"
              />
            </span>
            {onVerCaptura ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Ver la captura del corte de ${CORTES[corte.corte].etiqueta}`}
                title="Ver la captura del panel"
                onClick={onVerCaptura}
              >
                <ScanEye aria-hidden />
              </Button>
            ) : null}
          </span>
        </th>
        <td className={CELDA_CIFRA}>
          <Cifra valor={corte.alcance} />
        </td>
        <td className={CELDA_CIFRA}>
          <Cifra valor={corte.impresiones} />
        </td>
        <td className={CELDA_CIFRA}>
          <Cifra valor={corte.interacciones} />
        </td>
        <td className={CELDA_CIFRA}>
          <Cifra valor={corte.clics} />
        </td>
        <td className={cn(CELDA_CIFRA, "pr-4 sm:pr-5")}>
          {tasa === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            formatearPorcentaje(tasa, 1)
          )}
        </td>
      </tr>
      {motivos.length > 0 || corte.observaciones ? (
        <tr className={cn(alerta && "bg-warning/6")}>
          <td colSpan={COLUMNAS_TABLA} className="px-4 pb-2.5 sm:px-5">
            {/* Fijo al borde visible y con su ancho (`cqw` de la región): el texto
                se lee completo aunque la tabla se desplace en pantallas angostas. */}
            <div className="sticky left-4 w-[calc(100cqw-2rem)] text-xs text-pretty text-muted-foreground sm:left-5 sm:w-[calc(100cqw-2.5rem)]">
              {motivos.map((motivo) => (
                <span key={motivo} className="flex gap-1.5 text-warning">
                  <CircleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
                  {motivo}
                </span>
              ))}
              {corte.observaciones ? (
                <span className="mt-1 block">
                  <span className="font-medium text-foreground/80">
                    Observaciones:
                  </span>{" "}
                  {corte.observaciones}
                </span>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}

function TablaCortes({
  publicacion,
  plataforma,
  cortesRequeridos,
  capturaDe,
}: {
  publicacion: PublicacionEvidencia
  plataforma: Plataforma
  cortesRequeridos: readonly Corte[]
  capturaDe: (corte: CorteMetrica) => (() => void) | null
}) {
  const columnas = nombresColumnas(plataforma)
  const presentes = new Set(publicacion.cortes.map((corte) => corte.corte))
  const faltantes = cortesRequeridos.filter((corte) => !presentes.has(corte))
  if (publicacion.cortes.length === 0 && faltantes.length === 0) return null
  const cabecera = "px-3 py-2 text-right font-medium whitespace-nowrap"
  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={`Métricas por corte de la publicación ${publicacion.numero} (tabla desplazable)`}
      className="@container -mx-5 overflow-x-auto focus-visible:anillo-foco"
    >
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">
          Métricas por corte de la publicación {publicacion.numero}
        </caption>
        <thead>
          <tr className="border-y bg-muted/40 text-xs text-muted-foreground">
            <th
              scope="col"
              className="py-2 pr-3 pl-4 text-left font-medium sm:pl-5"
            >
              Corte y validación
            </th>
            <th scope="col" className={cabecera}>
              {columnas.alcance}
            </th>
            <th scope="col" className={cabecera}>
              {columnas.impresiones}
            </th>
            <th scope="col" className={cabecera}>
              Interacciones
            </th>
            <th scope="col" className={cabecera}>
              Clics
            </th>
            <th scope="col" className={cn(cabecera, "pr-4 sm:pr-5")}>
              Engagement
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {publicacion.cortes.map((corte) => (
            <FilaCorte
              key={corte.id}
              corte={corte}
              onVerCaptura={capturaDe(corte)}
            />
          ))}
          {faltantes.map((corte) => (
            <tr key={corte} className="text-muted-foreground">
              <th
                scope="row"
                className="py-2.5 pr-3 pl-4 text-left font-medium sm:pl-5"
              >
                {CORTES[corte].etiqueta}
              </th>
              <td colSpan={COLUMNAS_TABLA - 1} className="px-3 py-2.5 text-xs">
                Aún sin cargar
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DatosPublicacion({
  publicacion,
}: {
  publicacion: PublicacionEvidencia
}) {
  const filas: {
    etiqueta: string
    valor: string
    titulo?: string
    destacado?: boolean
  }[] = [
    {
      etiqueta: "Publicada",
      valor: formatearFechaHoraFija(publicacion.fechaPublicacion),
    },
    {
      etiqueta: "Debe seguir publicada hasta",
      valor: formatearFecha(publicacion.permanenciaHasta),
      titulo: formatearFechaHoraFija(publicacion.permanenciaHasta),
    },
    {
      etiqueta: "Permanencia",
      valor: publicacion.permanenciaVerificadaAt
        ? `Comprobada el ${formatearFecha(publicacion.permanenciaVerificadaAt)}`
        : "Por comprobar",
    },
    {
      etiqueta: "Etiqueta de publicidad",
      valor: publicacion.etiquetaVerificada
        ? "Verificada por AMO"
        : publicacion.etiquetaConfirmada
          ? "Declarada por el medio"
          : "No declarada",
      destacado: !publicacion.etiquetaConfirmada,
    },
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
      {filas.map((fila) => (
        <div key={fila.etiqueta} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{fila.etiqueta}</dt>
          <dd
            title={fila.titulo}
            className={cn(
              "cifras",
              fila.destacado && "font-medium text-warning"
            )}
          >
            {fila.valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Evidencia de la asignación: cada publicación con su captura (miniatura con
 * URL firmada de corta duración, nunca la ruta), su validación y sus métricas por
 * corte con las alertas de integridad explicadas.
 */
export function EvidenciasAsignacion({
  asignacionId,
  plataforma,
  publicaciones,
  cortesRequeridos,
}: {
  asignacionId: string
  plataforma: Plataforma
  publicaciones: readonly PublicacionEvidencia[]
  cortesRequeridos: readonly Corte[]
}) {
  const conImagenes = publicaciones.some(
    (publicacion) =>
      publicacion.conImagen ||
      publicacion.cortes.some((corte) => corte.conImagen)
  )
  const { estado, firmar, asegurarVigentes } = useFirmas(
    asignacionId,
    conImagenes
  )
  const [abierta, setAbierta] = useState<ImagenAbierta | null>(null)
  const imagenes = estado.tipo === "listo" ? estado.imagenes : null
  const urlAbierta = abierta
    ? (imagenes?.[abierta.origen][abierta.id]?.captura ?? null)
    : null

  function abrir(imagen: ImagenAbierta) {
    asegurarVigentes()
    setAbierta(imagen)
  }

  function capturaDe(corte: CorteMetrica): (() => void) | null {
    if (!corte.conImagen || !imagenes?.metricas[corte.id]?.captura) return null
    return () =>
      abrir({
        origen: "metricas",
        id: corte.id,
        titulo: `Captura del corte de ${CORTES[corte.corte].etiqueta}`,
        descripcion: `Cargada para el corte del ${formatearFecha(corte.fechaCorte)}.`,
      })
  }

  return (
    <div className="flex flex-col gap-5">
      {estado.tipo === "error" ? (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm">
          <span className="flex items-center gap-2">
            <CircleAlert aria-hidden className="size-4 text-destructive" />
            {estado.mensaje}
          </span>
          <Button variant="outline" size="sm" onClick={firmar}>
            <RefreshCw data-icon="inline-start" aria-hidden />
            Reintentar
          </Button>
        </p>
      ) : null}

      {publicaciones.map((publicacion) => {
        const imagen = imagenes?.publicaciones[publicacion.id]
        return (
          <article key={publicacion.id} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)]">
              <div className="mx-auto w-40 sm:mx-0 sm:w-full">
                <Miniatura
                  url={
                    publicacion.conImagen ? (imagen?.miniatura ?? null) : null
                  }
                  cargando={
                    publicacion.conImagen &&
                    estado.tipo === "cargando" &&
                    !imagen
                  }
                  etiqueta={`Captura de la publicación ${publicacion.numero}`}
                  onAbrir={() =>
                    abrir({
                      origen: "publicaciones",
                      id: publicacion.id,
                      titulo: `Publicación ${publicacion.numero}`,
                      descripcion: cerrarFrase(
                        `Publicada el ${formatearFechaHoraFija(publicacion.fechaPublicacion)}`
                      ),
                    })
                  }
                />
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {publicaciones.length > 1
                      ? `Publicación ${publicacion.numero}`
                      : "Publicación"}
                  </h3>
                  <InsigniaEstado
                    catalogo={ESTADOS_VALIDACION}
                    estado={publicacion.estado}
                  />
                </div>
                <a
                  href={publicacion.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex w-fit max-w-full items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
                >
                  <span className="truncate">
                    {publicacion.url.replace(/^https?:\/\//, "")}
                  </span>
                  <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                  <span className="sr-only"> (abre en una pestaña nueva)</span>
                </a>
                <DatosPublicacion publicacion={publicacion} />
                {publicacion.retiradaDetectadaAt ? (
                  <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm">
                    <TriangleAlert
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                    />
                    Se detectó retirada el{" "}
                    {formatearFechaHoraFija(publicacion.retiradaDetectadaAt)},
                    antes de cumplir la permanencia.
                  </p>
                ) : null}
                {publicacion.estado === "APROBADA" && publicacion.validadaAt ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BadgeCheck aria-hidden className="size-3.5 text-success" />
                    Evidencia validada el{" "}
                    {formatearFecha(publicacion.validadaAt)}
                  </p>
                ) : null}
                {publicacion.observaciones ? (
                  <p className="text-xs text-pretty text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      Observaciones:
                    </span>{" "}
                    {publicacion.observaciones}
                  </p>
                ) : null}
              </div>
            </div>
            <TablaCortes
              publicacion={publicacion}
              plataforma={plataforma}
              cortesRequeridos={cortesRequeridos}
              capturaDe={capturaDe}
            />
          </article>
        )
      })}

      <Dialog
        open={abierta !== null}
        onOpenChange={(abrirDialogo) => !abrirDialogo && setAbierta(null)}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[92vh] gap-3 overflow-hidden sm:max-w-2xl"
        >
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2"
                aria-label="Cerrar"
              />
            }
          >
            <X aria-hidden />
          </DialogClose>
          <DialogHeader className="pr-8">
            <DialogTitle>{abierta?.titulo}</DialogTitle>
            <DialogDescription>
              {abierta?.descripcion} El enlace de la imagen caduca en pocos
              minutos.
            </DialogDescription>
          </DialogHeader>
          {abierta ? (
            <div
              className={cn(
                "relative h-[70vh] w-full overflow-hidden rounded-lg bg-muted",
                !urlAbierta && "animate-pulse motion-reduce:animate-none"
              )}
            >
              {urlAbierta ? (
                <Image
                  src={urlAbierta}
                  alt={abierta.titulo}
                  fill
                  unoptimized
                  sizes="(min-width: 640px) 42rem, 100vw"
                  className="object-contain"
                />
              ) : (
                <span className="sr-only" role="status">
                  Cargando la captura…
                </span>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
