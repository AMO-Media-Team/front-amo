"use client"

import {
  BadgeCheck,
  ExternalLink,
  History,
  ScanEye,
  TriangleAlert,
} from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { rutaDisputaInterna } from "@/features/disputas/rutas"
import {
  type CapturaAbierta,
  ErrorFirmas,
  Miniatura,
  urlCaptura,
  useFirmas,
  VisorCaptura,
} from "@/features/validacion/components/capturas"
import { HojaCorreccion } from "@/features/validacion/components/correccion-metrica"
import {
  DecisionCorte,
  DecisionEvidencia,
  idCorte,
  idPublicacion,
} from "@/features/validacion/components/decisiones-ficha"
import { EsperaDisputa } from "@/features/validacion/components/piezas"
import {
  type AccionesCorte,
  accionesCorte,
  DETALLE_EVIDENCIA_EN_DISPUTA,
  DETALLE_RECHAZO_EN_DISPUTA,
  evidenciaEsperaDisputa,
  puedeValidarEvidencia,
} from "@/features/validacion/decision"
import type { ValidacionEnFicha } from "@/features/validacion/tipos"
import {
  formatearFecha,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

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
import { alertaRevisable, tieneAlerta } from "../alertas"
import { type CorteMetrica, engagement, nombresColumnas } from "../metricas"
import type { PublicacionEvidencia } from "../tipos"
import { InsigniaEstado } from "./distintivos"
import { PorqueAlerta } from "./porque-alerta"

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

/** Lo que espera a la disputa enlaza a ella (con `disputas.ver`). */
function enlaceDisputa(validacion: ValidacionEnFicha | undefined) {
  return validacion?.disputaId
    ? {
        href: rutaDisputaInterna(validacion.disputaId),
        etiqueta: "Ver la disputa",
      }
    : null
}

function FilaCorte({
  corte,
  plataforma,
  acciones,
  validacion,
  onVerCaptura,
  onCorregir,
}: {
  corte: CorteMetrica
  plataforma: Plataforma
  acciones: AccionesCorte
  validacion: ValidacionEnFicha | undefined
  onVerCaptura: (() => void) | null
  onCorregir: () => void
}) {
  const idBloqueo = useId()
  // También la que tuvo alerta antes de corregirse: pide constancia igual.
  const alerta = alertaRevisable(corte.alerta)
  const tasa = engagement(corte.interacciones, corte.alcance)
  const conAcciones = acciones.validar || acciones.corregir
  const nombre = CORTES[corte.corte].etiqueta
  return (
    <>
      <tr className={cn("align-top", alerta && "bg-warning/6")}>
        <th
          scope="row"
          id={idCorte(corte.id)}
          tabIndex={-1}
          className="py-2.5 pr-3 pl-4 text-left font-medium whitespace-nowrap outline-none focus-visible:anillo-foco sm:pl-5"
        >
          <span className="flex items-center gap-1.5">
            {alerta ? (
              <TriangleAlert
                role="img"
                aria-label={
                  tieneAlerta(corte.alerta)
                    ? "Con alerta de integridad"
                    : "Tuvo alerta antes de corregirse"
                }
                className="size-3.5 shrink-0 text-warning"
              />
            ) : null}
            {nombre}
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
                aria-label={`Ver la captura del corte de ${nombre}`}
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
      {alerta || corte.observaciones || conAcciones ? (
        <tr className={cn(alerta && "bg-warning/6")}>
          <td colSpan={COLUMNAS_TABLA} className="px-4 pb-2.5 sm:px-5">
            {/* Fijo al borde visible y con su ancho (`cqw` de la región): el texto
                y los botones se leen completos aunque la tabla se desplace en
                pantallas angostas. */}
            <div className="sticky left-4 flex w-[calc(100cqw-2rem)] flex-col gap-2 text-xs text-pretty text-muted-foreground sm:left-5 sm:w-[calc(100cqw-2.5rem)]">
              {alerta ? (
                <PorqueAlerta
                  alerta={corte.alerta}
                  plataforma={plataforma}
                  nivelTitulo={4}
                  className="bg-card text-foreground"
                />
              ) : null}
              {corte.observaciones ? (
                <p>
                  <span className="font-medium text-foreground/80">
                    Observaciones:
                  </span>{" "}
                  {corte.observaciones}
                </p>
              ) : null}
              {acciones.bloqueoAprobar ? (
                <p id={idBloqueo}>{acciones.bloqueoAprobar}</p>
              ) : null}
              {acciones.rechazoEnDisputa ? (
                <EsperaDisputa
                  detalle={DETALLE_RECHAZO_EN_DISPUTA}
                  enlace={enlaceDisputa(validacion)}
                  className="w-fit max-w-full text-foreground"
                />
              ) : null}
              {conAcciones ? (
                <DecisionCorte
                  corte={corte}
                  plataforma={plataforma}
                  acciones={acciones}
                  idBloqueo={idBloqueo}
                  onCorregir={onCorregir}
                />
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
  validacion,
  capturaDe,
  onCorregir,
}: {
  publicacion: PublicacionEvidencia
  plataforma: Plataforma
  cortesRequeridos: readonly Corte[]
  validacion: ValidacionEnFicha | undefined
  capturaDe: (corte: CorteMetrica) => (() => void) | null
  onCorregir: (corte: CorteMetrica) => void
}) {
  const columnas = nombresColumnas(plataforma)
  const presentes = new Set(publicacion.cortes.map((corte) => corte.corte))
  const faltantes = cortesRequeridos.filter((corte) => !presentes.has(corte))
  if (publicacion.cortes.length === 0 && faltantes.length === 0) return null
  const evidenciaAprobada = publicacion.estado === "APROBADA"
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
              plataforma={plataforma}
              acciones={accionesCorte(corte, evidenciaAprobada, validacion)}
              validacion={validacion}
              onVerCaptura={capturaDe(corte)}
              onCorregir={() => onCorregir(corte)}
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
 * URL firmada de corta duración, nunca la ruta), su validación y sus métricas
 * por corte con las alertas de integridad explicadas (`PorqueAlerta`, la
 * misma explicación que la cola), también la que tuvo antes de corregirse.
 *
 * Con `validacion` (permisos de quien la ve y estado de la asignación), ofrece
 * las mismas decisiones que la cola de validación (ADM-007, ADM-008): aprobar
 * o rechazar la evidencia de cada publicación y cada corte pendiente, y, con
 * `metricas.editar_validadas`, «Corregir» un corte aprobado (formulario con
 * motivo obligatorio). En disputa, lo que la BD no deja decidir (la
 * evidencia; rechazar un corte si entró con todo cargado) se explica y enlaza
 * a la disputa. Sin `validacion`, solo se consulta.
 */
export function EvidenciasAsignacion({
  asignacionId,
  plataforma,
  publicaciones,
  cortesRequeridos,
  validacion,
}: {
  asignacionId: string
  plataforma: Plataforma
  publicaciones: readonly PublicacionEvidencia[]
  cortesRequeridos: readonly Corte[]
  /** Decisiones de la validación; sin ella la evidencia es de solo lectura. */
  validacion?: ValidacionEnFicha
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
  const [abierta, setAbierta] = useState<CapturaAbierta | null>(null)
  const [correccion, setCorreccion] = useState<{
    corte: CorteMetrica
    abierta: boolean
  } | null>(null)
  const imagenes = estado.tipo === "listo" ? estado.imagenes : null

  function abrir(imagen: CapturaAbierta) {
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

  function corregir(corte: CorteMetrica) {
    asegurarVigentes()
    setCorreccion({ corte, abierta: true })
  }

  const corteCorregido = correccion?.corte ?? null

  return (
    <div className="flex flex-col gap-5">
      {estado.tipo === "error" ? (
        <ErrorFirmas mensaje={estado.mensaje} onReintentar={firmar} />
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
                  <h3
                    id={idPublicacion(publicacion.id)}
                    tabIndex={-1}
                    className="font-semibold outline-none focus-visible:anillo-foco"
                  >
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
                  <p className="flex gap-1.5 text-xs text-pretty text-muted-foreground">
                    {publicacion.estado === "PENDIENTE" ? (
                      <History
                        aria-hidden
                        className="mt-0.5 size-3.5 shrink-0"
                      />
                    ) : null}
                    <span>
                      <span className="font-medium text-foreground/80">
                        {publicacion.estado === "PENDIENTE"
                          ? "Revisión anterior:"
                          : "Observaciones:"}
                      </span>{" "}
                      {publicacion.observaciones}
                    </span>
                  </p>
                ) : null}
                {puedeValidarEvidencia(publicacion.estado, validacion) ? (
                  <DecisionEvidencia publicacion={publicacion} />
                ) : evidenciaEsperaDisputa(publicacion.estado, validacion) ? (
                  <EsperaDisputa
                    detalle={DETALLE_EVIDENCIA_EN_DISPUTA}
                    enlace={enlaceDisputa(validacion)}
                    className="w-fit max-w-full"
                  />
                ) : null}
              </div>
            </div>
            <TablaCortes
              publicacion={publicacion}
              plataforma={plataforma}
              cortesRequeridos={cortesRequeridos}
              validacion={validacion}
              capturaDe={capturaDe}
              onCorregir={corregir}
            />
          </article>
        )
      })}

      <VisorCaptura
        abierta={abierta}
        url={urlCaptura(estado, abierta)}
        onCerrar={() => setAbierta(null)}
      />
      {corteCorregido && validacion?.corregir ? (
        <HojaCorreccion
          key={corteCorregido.id}
          metricaId={corteCorregido.id}
          corteNombre={CORTES[corteCorregido.corte].etiqueta}
          captura={{
            url: imagenes?.metricas[corteCorregido.id]?.captura ?? null,
            cargando: corteCorregido.conImagen && estado.tipo === "cargando",
          }}
          abierta={correccion?.abierta === true}
          onAbiertaChange={(valor) =>
            setCorreccion((actual) =>
              actual ? { ...actual, abierta: valor } : actual
            )
          }
          focoAlCerrar={() =>
            document.getElementById(idCorte(corteCorregido.id))
          }
        />
      ) : null}
    </div>
  )
}
