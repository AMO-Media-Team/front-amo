"use client"

import { ExternalLink, Images, Plus } from "lucide-react"
import type { ReactNode } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import { useAhora } from "@/components/tiempo/use-ahora"
import { rutaMetricaPersonalizada } from "@/features/ejecucion/rutas"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { CORTES } from "@/features/operacion/estados"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import {
  admiteMetricas,
  cortesObligatorios,
  resumenPublicaciones,
  situacionCorte,
  VALIDACIONES_PARA_MEDIO,
} from "../presentacion"
import { rutaEvidencia, rutaMetricas } from "../rutas"
import type {
  AsignacionMedio,
  Corte,
  EjecucionAsignacion,
  MetricaMedio,
  PublicacionMedio,
} from "../tipos"

type CorteObligatorio = Exclude<Corte, "PERSONALIZADO">

/** Un corte que aún no se cumple no es urgente: siempre en tono neutro. */
const SIN_URGENCIA = { criticaHoras: 0, prontoHoras: 0 }

function Observaciones({ texto }: { texto: string | null }) {
  if (!texto) return null
  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-xs text-pretty">
      <span className="font-medium">Observaciones del equipo AMO: </span>
      {texto}
    </p>
  )
}

function InsigniaValidacion({ estado }: { estado: MetricaMedio["estado"] }) {
  const { etiqueta, tono, descripcion } = VALIDACIONES_PARA_MEDIO[estado]
  return <InsigniaTono tono={tono} etiqueta={etiqueta} titulo={descripcion} />
}

/** Fila de un corte obligatorio: su situación y, si toca, el botón para cargarlo. */
function FilaCorte({
  asignacionId,
  estado,
  corte,
  publicacion,
  numero,
  metricas,
  plazoCargaHoras,
  ahora,
  ahoraServidor,
  puedeEjecutar,
  conNumero,
}: {
  asignacionId: string
  estado: AsignacionMedio["estado"]
  corte: CorteObligatorio
  publicacion: PublicacionMedio | null
  numero: number
  metricas: readonly MetricaMedio[]
  plazoCargaHoras: number
  ahora: Date
  ahoraServidor: number
  puedeEjecutar: boolean
  conNumero: boolean
}) {
  const situacion = situacionCorte(
    { estado, corte, publicacion, metricas, plazoCargaHoras },
    ahora
  )
  const nombre = CORTES[corte].etiqueta
  const contexto = `las métricas de ${nombre}${conNumero ? ` de la publicación ${numero}` : ""}`
  const ruta = rutaMetricas(asignacionId, numero, corte)

  let detalle: ReactNode = null
  let accion: { texto: string; principal: boolean } | null = null
  switch (situacion.tipo) {
    case "sin_publicacion":
      detalle = (
        <span className="text-xs text-muted-foreground">
          Después de publicar
        </span>
      )
      break
    case "evidencia_por_corregir":
      detalle = (
        <span className="text-xs text-muted-foreground">
          Primero corrige la evidencia
        </span>
      )
      break
    case "por_habilitar":
      detalle = (
        <CuentaRegresiva
          venceAt={situacion.desde}
          ahoraServidor={ahoraServidor}
          etiqueta={`Corte de ${nombre}`}
          textos={{ pendiente: "Se habilita en", vencido: "Habilitado hace" }}
          umbrales={SIN_URGENCIA}
        />
      )
      break
    case "por_cargar":
      detalle = (
        <CuentaRegresiva
          venceAt={situacion.vence}
          ahoraServidor={ahoraServidor}
          etiqueta={`Métricas de ${CORTES[corte].corta}`}
          textos={{ vencido: "Atrasadas hace" }}
        />
      )
      accion = { texto: "Cargar", principal: true }
      break
    case "cargada":
      detalle = <InsigniaValidacion estado={situacion.metrica.estado} />
      if (situacion.editable) {
        accion = {
          texto:
            situacion.metrica.estado === "RECHAZADA" ? "Corregir" : "Editar",
          principal: situacion.metrica.estado === "RECHAZADA",
        }
      }
      break
    case "cerrada":
      detalle = (
        <span className="text-xs text-muted-foreground">No se cargó</span>
      )
      break
  }

  return (
    <li className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="text-sm font-medium">{nombre}</span>
        <span className="flex flex-wrap items-center gap-2">
          {detalle}
          {accion && puedeEjecutar ? (
            <EnlaceBoton
              href={ruta}
              size="sm"
              variant={accion.principal ? "default" : "outline"}
            >
              {accion.texto} <span className="sr-only">{contexto}</span>
            </EnlaceBoton>
          ) : null}
        </span>
      </div>
      {situacion.tipo === "cargada" &&
      situacion.metrica.estado === "RECHAZADA" ? (
        <Observaciones texto={situacion.metrica.observaciones} />
      ) : null}
    </li>
  )
}

/**
 * Un corte personalizado ya cargado: su periodo, su revisión y, mientras se
 * pueda, el botón para corregirlo o editarlo (va por su id: una publicación
 * puede tener varios).
 */
function FilaPersonalizado({
  asignacionId,
  numero,
  metrica,
  admite,
  puedeEjecutar,
  conNumero,
}: {
  asignacionId: string
  numero: number
  metrica: MetricaMedio
  /** La asignación y la publicación aún reciben métricas. */
  admite: boolean
  puedeEjecutar: boolean
  conNumero: boolean
}) {
  const periodo =
    metrica.periodoDesde && metrica.periodoHasta
      ? `del ${formatearFecha(metrica.periodoDesde)} al ${formatearFecha(metrica.periodoHasta)}`
      : null
  const rechazada = metrica.estado === "RECHAZADA"
  const editable = admite && puedeEjecutar && metrica.estado !== "APROBADA"
  const contexto = `el corte personalizado${periodo ? ` ${periodo}` : ""}${conNumero ? ` de la publicación ${numero}` : ""}`

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          Personalizado
          {periodo ? (
            <span className="text-muted-foreground"> · {periodo}</span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <InsigniaValidacion estado={metrica.estado} />
          {editable ? (
            <EnlaceBoton
              href={rutaMetricaPersonalizada(asignacionId, numero, metrica.id)}
              size="sm"
              variant={rechazada ? "default" : "outline"}
            >
              {rechazada ? "Corregir" : "Editar"}{" "}
              <span className="sr-only">{contexto}</span>
            </EnlaceBoton>
          ) : null}
        </span>
      </div>
      {rechazada ? <Observaciones texto={metrica.observaciones} /> : null}
    </li>
  )
}

function Publicacion({
  asignacion,
  numero,
  publicacion,
  metricas,
  plazoCargaHoras,
  ahora,
  ahoraServidor,
  puedeEjecutar,
}: {
  asignacion: Pick<
    AsignacionMedio,
    "id" | "estado" | "publicaciones" | "cortesRequeridos"
  >
  numero: number
  publicacion: PublicacionMedio | null
  metricas: readonly MetricaMedio[]
  plazoCargaHoras: number
  ahora: Date
  ahoraServidor: number
  puedeEjecutar: boolean
}) {
  const varias = asignacion.publicaciones > 1
  const titulo = varias ? `Publicación ${numero}` : "Tu publicación"
  const antesDePublicar = asignacion.estado === "CONTENIDO_ENTREGADO"
  const cortes = cortesObligatorios(asignacion.cortesRequeridos)
  const personalizados = publicacion
    ? metricas.filter(
        (metrica) =>
          metrica.publicacionId === publicacion.id &&
          metrica.corte === "PERSONALIZADO"
      )
    : []
  const admite = admiteMetricas(asignacion.estado, publicacion)

  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-background/40 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {publicacion ? (
          <InsigniaValidacion estado={publicacion.estado} />
        ) : (
          <InsigniaTono tono="neutro" etiqueta="Sin evidencia" />
        )}
      </div>

      {publicacion ? (
        <div className="flex flex-col gap-2 text-sm">
          <a
            href={publicacion.urlPost}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex max-w-full items-center gap-1.5 rounded text-primary underline-offset-4 outline-none hover:underline focus-visible:anillo-foco"
          >
            <span className="truncate">Ver la publicación</span>
            <ExternalLink aria-hidden className="size-3.5 shrink-0" />{" "}
            <span className="sr-only">(abre en una pestaña nueva)</span>
          </a>
          <p className="text-xs text-muted-foreground">
            Publicada el {formatearFechaHora(publicacion.fechaPublicacion)}
            {publicacion.permanenciaHasta
              ? `. Mantenla publicada hasta el ${formatearFecha(publicacion.permanenciaHasta, "largo")}.`
              : "."}
          </p>
          {publicacion.estado === "RECHAZADA" ? (
            <>
              <Observaciones texto={publicacion.observaciones} />
              {antesDePublicar && puedeEjecutar ? (
                <EnlaceBoton
                  href={rutaEvidencia(asignacion.id, numero)}
                  size="sm"
                  className="w-fit"
                >
                  Corregir la evidencia
                  {varias ? (
                    <>
                      {" "}
                      <span className="sr-only">
                        de la publicación {numero}
                      </span>
                    </>
                  ) : null}
                </EnlaceBoton>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            {antesDePublicar
              ? "Aún no cargas la evidencia de esta publicación."
              : "No se cargó la evidencia de esta publicación."}
          </p>
          {antesDePublicar && puedeEjecutar ? (
            <EnlaceBoton
              href={rutaEvidencia(asignacion.id, numero)}
              size="sm"
              variant="outline"
            >
              Cargar la evidencia
              {varias ? (
                <>
                  {" "}
                  <span className="sr-only">de la publicación {numero}</span>
                </>
              ) : null}
            </EnlaceBoton>
          ) : null}
        </div>
      )}

      {cortes.length > 0 ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Métricas por corte
          </p>
          <ul className="flex flex-col divide-y">
            {cortes.map((corte) => (
              <FilaCorte
                key={corte}
                asignacionId={asignacion.id}
                estado={asignacion.estado}
                corte={corte as CorteObligatorio}
                publicacion={publicacion}
                numero={numero}
                metricas={metricas}
                plazoCargaHoras={plazoCargaHoras}
                ahora={ahora}
                ahoraServidor={ahoraServidor}
                puedeEjecutar={puedeEjecutar}
                conNumero={varias}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {personalizados.length > 0 || (admite && puedeEjecutar) ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          {personalizados.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {personalizados.map((metrica) => (
                <FilaPersonalizado
                  key={metrica.id}
                  asignacionId={asignacion.id}
                  numero={numero}
                  metrica={metrica}
                  admite={admite}
                  puedeEjecutar={puedeEjecutar}
                  conNumero={varias}
                />
              ))}
            </ul>
          ) : null}
          {admite && puedeEjecutar ? (
            <EnlaceBoton
              href={rutaMetricaPersonalizada(asignacion.id, numero)}
              size="sm"
              variant="ghost"
              className="-ml-2 w-fit"
            >
              <Plus data-icon="inline-start" aria-hidden />
              Agregar un corte personalizado
              {varias ? (
                <>
                  {" "}
                  <span className="sr-only">a la publicación {numero}</span>
                </>
              ) : null}
            </EnlaceBoton>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/**
 * Publicaciones y métricas de la asignación: cada publicación con su
 * evidencia (enlace, fecha, permanencia, revisión del equipo AMO) y cada
 * corte que pide la oferta con su situación —se habilita en, por cargar con
 * su plazo, en revisión, aprobado o por corregir— y el botón directo a su
 * formulario. Los plazos se actualizan solos.
 */
export function PublicacionesAsignacion({
  asignacion,
  ejecucion,
  plazoCargaHoras,
  ahoraServidor,
  puedeEjecutar,
}: {
  asignacion: Pick<
    AsignacionMedio,
    "id" | "estado" | "publicaciones" | "cortesRequeridos"
  >
  ejecucion: Pick<EjecucionAsignacion, "publicaciones" | "metricas">
  plazoCargaHoras: number
  ahoraServidor: number
  puedeEjecutar: boolean
}) {
  const ahora = useAhora(ahoraServidor)
  const numeros = Array.from(
    { length: Math.max(asignacion.publicaciones, 1) },
    (_, indice) => indice + 1
  )
  return (
    <TarjetaFicha
      titulo={
        asignacion.publicaciones > 1
          ? "Publicaciones y métricas"
          : "Publicación y métricas"
      }
      icono={Images}
      descripcion={resumenPublicaciones(
        asignacion.publicaciones,
        ejecucion.publicaciones
      )}
    >
      <ol className="flex flex-col gap-3">
        {numeros.map((numero) => (
          <Publicacion
            key={numero}
            asignacion={asignacion}
            numero={numero}
            publicacion={
              ejecucion.publicaciones.find((p) => p.numero === numero) ?? null
            }
            metricas={ejecucion.metricas}
            plazoCargaHoras={plazoCargaHoras}
            ahora={ahora}
            ahoraServidor={ahoraServidor}
            puedeEjecutar={puedeEjecutar}
          />
        ))}
      </ol>
    </TarjetaFicha>
  )
}
