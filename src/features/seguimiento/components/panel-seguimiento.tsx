"use client"

import {
  CircleAlert,
  ListFilter,
  RefreshCw,
  SearchX,
  Users,
} from "lucide-react"
import { unstable_rethrow } from "next/navigation"
import { parseAsString, useQueryState } from "nuqs"
import { useCallback, useEffect, useRef, useState } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { rutaMiCampana } from "@/features/campanas/rutas"
import type { EstadoCampana } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"

import { consultarSeguimiento } from "../actions"
import {
  contarPorGrupo,
  GRUPOS,
  grupoDe,
  type GrupoSeguimiento,
} from "../estados"
import {
  anuncioCambios,
  type CambiosSeguimiento,
  cambiosEntre,
  horaDe,
  ordenarSeguimiento,
  ordenEstable,
} from "../presentacion"
import {
  ID_TITULO_SEGUIMIENTO,
  idTarjetaAsignacion,
  PARAMETRO_ASIGNACION,
} from "../rutas"
import type { SeguimientoCampana } from "../tipos"
import { type Consulta, useSondeo } from "../use-sondeo"
import { ResumenGrupos } from "./resumen-grupos"
import { type Novedad, TarjetaAsignacion } from "./tarjeta-asignacion"

/** Tarjetas que se pintan de una vez; «Ver más» suma otras tantas. */
export const TARJETAS_POR_TRAMO = 20

const SIN_CAMBIOS: CambiosSeguimiento = { nuevas: [], cambiadas: [] }

const MENSAJE_SIN_CONEXION =
  "No pudimos conectar con el servidor. Lo intentaremos de nuevo en un minuto."

/**
 * Lo último que se consultó de cada campaña en este navegador. Base UI
 * desmonta la pestaña oculta: al volver a ella se parte de aquí y no de los
 * datos (más viejos) con que se pintó la página. Solo se escribe desde el
 * navegador (tras una consulta), nunca durante el render del servidor.
 */
const ultimasConsultas = new Map<string, SeguimientoCampana>()

function masReciente(inicial: SeguimientoCampana): SeguimientoCampana {
  const guardada = ultimasConsultas.get(inicial.campanaId)
  return guardada &&
    Date.parse(guardada.consultadoAt) > Date.parse(inicial.consultadoAt)
    ? guardada
    : inicial
}

function novedadDe(cambios: CambiosSeguimiento, id: string): Novedad {
  if (cambios.nuevas.includes(id)) return "nueva"
  return cambios.cambiadas.includes(id) ? "cambiada" : null
}

/**
 * Seguimiento de la campaña (ANU-011): cada asignación con el medio, su
 * estado y fechas, la evidencia y los cortes aprobados. Se actualiza sola
 * cada 60 segundos mientras la pestaña está a la vista (y al recargar o tocar
 * «Actualizar»); lo que cambió se marca en la tarjeta y se anuncia de forma
 * cortés a los lectores de pantalla. `?asignacion=` abre y resalta una.
 */
export function PanelSeguimiento({
  inicial,
  estadoCampana,
  puedeDisputar = false,
}: {
  inicial: SeguimientoCampana
  estadoCampana: EstadoCampana
  /** `disputas.abrir`: cada tarjeta ofrece reportar un problema (ver su disputa no lo pide). */
  puedeDisputar?: boolean
}) {
  const [datos, setDatos] = useState(() => masReciente(inicial))
  const actuales = useRef(datos)
  // Las tarjetas no saltan al actualizarse: solo las nuevas entran arriba.
  const [orden, setOrden] = useState<readonly string[]>(() =>
    ordenarSeguimiento(datos.asignaciones).map((asignacion) => asignacion.id)
  )
  const ordenActual = useRef(orden)
  const [ahoraServidor] = useState(() => Date.parse(inicial.consultadoAt))
  const [error, setError] = useState<string | null>(null)
  const [cambios, setCambios] = useState(SIN_CAMBIOS)
  const [anuncio, setAnuncio] = useState("")
  const [grupo, setGrupo] = useState<GrupoSeguimiento | null>(null)
  const [pedida] = useQueryState(PARAMETRO_ASIGNACION, parseAsString)
  const pedidaAlMontar = useRef(pedida)
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(
    () => new Set(pedida ? [pedida] : [])
  )
  const [limite, setLimite] = useState(TARJETAS_POR_TRAMO)
  const enfocarDespues = useRef<string | null>(null)

  const consultar = useCallback(
    async (consulta: Consulta) => {
      let resultado: Awaited<ReturnType<typeof consultarSeguimiento>>
      try {
        resultado = await consultarSeguimiento({ campanaId: inicial.campanaId })
      } catch (fallo) {
        // Sesión vencida o permiso retirado: Next redirige o muestra el 403.
        unstable_rethrow(fallo)
        setError(MENSAJE_SIN_CONEXION)
        return
      }
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      const nuevos = resultado.datos
      const diferencia = cambiosEntre(
        actuales.current.asignaciones,
        nuevos.asignaciones
      )
      const siguienteOrden = ordenEstable(
        ordenActual.current,
        nuevos.asignaciones
      ).map((asignacion) => asignacion.id)
      actuales.current = nuevos
      ordenActual.current = siguienteOrden
      ultimasConsultas.set(nuevos.campanaId, nuevos)
      setDatos(nuevos)
      setOrden(siguienteOrden)
      setError(null)
      setCambios(diferencia)
      setAnuncio(
        anuncioCambios(diferencia) ||
          // Se lee al terminar: «Actualizar» pudo hacer suya una automática.
          (consulta.aMano ? "El seguimiento ya estaba al día." : "")
      )
    },
    [inicial.campanaId]
  )

  const { consultando, actualizandoAMano, consultarAhora } = useSondeo(
    consultar,
    {
      ultimaConsulta: Date.parse(datos.consultadoAt),
    }
  )

  const ordenadas = ordenEstable(orden, datos.asignaciones)
  const conteo = contarPorGrupo(ordenadas)
  const filtradas = grupo
    ? ordenadas.filter((asignacion) => grupoDe(asignacion.estado) === grupo)
    : ordenadas
  const indicePedida = pedida
    ? filtradas.findIndex((asignacion) => asignacion.id === pedida)
    : -1
  const visibles = filtradas.slice(0, Math.max(limite, indicePedida + 1))
  const restantes = filtradas.length - visibles.length
  const pedidaAusente =
    pedida !== null && !ordenadas.some((asignacion) => asignacion.id === pedida)

  // La asignación del enlace (`/ir`) se lleva a la vista y recibe el foco
  // solo al montar: después la persona navega a su gusto.
  useEffect(() => {
    const id = pedidaAlMontar.current
    if (!id) return
    const tarjeta = document.getElementById(idTarjetaAsignacion(id))
    tarjeta?.scrollIntoView({ block: "start" })
    tarjeta?.focus({ preventScroll: true })
  }, [])

  // Tras «Ver más», el foco pasa a la primera tarjeta nueva (el botón puede desaparecer).
  useEffect(() => {
    const id = enfocarDespues.current
    if (!id) return
    enfocarDespues.current = null
    document.getElementById(idTarjetaAsignacion(id))?.focus()
  }, [limite])

  function alternar(id: string, abierta: boolean) {
    setAbiertas((previas) => {
      const siguientes = new Set(previas)
      if (abierta) siguientes.add(id)
      else siguientes.delete(id)
      return siguientes
    })
  }

  function verMas() {
    enfocarDespues.current = filtradas[visibles.length]?.id ?? null
    setLimite(visibles.length + TARJETAS_POR_TRAMO)
  }

  function elegirGrupo(siguiente: GrupoSeguimiento | null) {
    setGrupo(siguiente)
    setLimite(TARJETAS_POR_TRAMO)
  }

  const total = ordenadas.length

  return (
    <section
      aria-labelledby={ID_TITULO_SEGUIMIENTO}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          {/* Destino del foco al llegar desde «Ver el seguimiento» (Métricas). */}
          <h2
            id={ID_TITULO_SEGUIMIENTO}
            tabIndex={-1}
            className="w-fit rounded-sm font-heading text-lg font-semibold outline-none focus-visible:anillo-foco"
          >
            Seguimiento de los medios
          </h2>
          <p className="text-[0.8125rem] text-pretty text-muted-foreground">
            Quién aceptó, en qué va cada publicación y sus métricas aprobadas.
            Se actualiza cada minuto mientras ves esta pestaña.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs cifras text-muted-foreground">
            {consultando ? (
              "Actualizando…"
            ) : (
              <>
                Actualizado a las{" "}
                <time dateTime={datos.consultadoAt}>
                  {horaDe(datos.consultadoAt)}
                </time>
              </>
            )}
          </p>
          {/*
           * Solo la consulta pedida lo bloquea, y sigue enfocable: el sondeo
           * de cada minuto no lo toca, así no le quita el foco a nadie.
           */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={actualizandoAMano}
            focusableWhenDisabled
            aria-busy={actualizandoAMano || undefined}
            className="aria-disabled:cursor-progress"
            onClick={consultarAhora}
          >
            {actualizandoAMano ? (
              <Spinner data-icon="inline-start" aria-hidden />
            ) : (
              <RefreshCw data-icon="inline-start" aria-hidden />
            )}
            Actualizar
          </Button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {anuncio}
      </p>

      {error ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/6 px-3 py-2 text-sm"
        >
          <span className="flex items-start gap-2 text-pretty">
            <CircleAlert
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-warning"
            />
            {error} Mientras tanto ves lo último que cargó.
          </span>
        </div>
      ) : null}

      {pedidaAusente ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-pretty"
        >
          <SearchX
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          No encontramos esa asignación en esta campaña. Puede que el medio aún
          no haya aceptado o que pertenezca a otra campaña.
        </p>
      ) : null}

      {total === 0 ? (
        <EstadoVacio
          icono={Users}
          titulo={
            estadoCampana === "ACTIVA" || estadoCampana === "BORRADOR"
              ? "Aún ningún medio acepta tus ofertas"
              : "Esta campaña no tuvo medios participantes"
          }
          descripcion="Cuando un medio acepte un cupo, aquí verás su perfil, el estado de su publicación, la evidencia y las métricas que apruebe el equipo AMO."
        >
          <EnlaceBoton
            variant="outline"
            href={rutaMiCampana(inicial.campanaId, "ofertas")}
          >
            Ver las ofertas
          </EnlaceBoton>
        </EstadoVacio>
      ) : (
        <>
          <ResumenGrupos
            conteo={conteo}
            total={total}
            seleccionado={grupo}
            onElegir={elegirGrupo}
          />
          {filtradas.length === 0 ? (
            <EstadoVacio
              icono={ListFilter}
              titulo={`No hay asignaciones en «${grupo ? GRUPOS[grupo].etiqueta : ""}»`}
              descripcion={grupo ? GRUPOS[grupo].descripcion : undefined}
            >
              <Button variant="outline" onClick={() => elegirGrupo(null)}>
                Ver todas
              </Button>
            </EstadoVacio>
          ) : (
            <ul
              aria-label={
                grupo
                  ? `Asignaciones: ${GRUPOS[grupo].etiqueta}`
                  : "Asignaciones de la campaña"
              }
              className="flex flex-col gap-3"
            >
              {visibles.map((asignacion) => (
                <li key={asignacion.id}>
                  <TarjetaAsignacion
                    asignacion={asignacion}
                    abierta={abiertas.has(asignacion.id)}
                    onAbiertaChange={(abierta) =>
                      alternar(asignacion.id, abierta)
                    }
                    destacada={asignacion.id === pedida}
                    novedad={novedadDe(cambios, asignacion.id)}
                    ahoraServidor={ahoraServidor}
                    campanaId={inicial.campanaId}
                    puedeDisputar={puedeDisputar}
                  />
                </li>
              ))}
            </ul>
          )}
          {restantes > 0 ? (
            <Button variant="outline" className="self-center" onClick={verMas}>
              Ver {formatearNumero(Math.min(restantes, TARJETAS_POR_TRAMO))} más
              <span className="sr-only">
                {" "}
                de {formatearNumero(restantes)} asignaciones sin mostrar
              </span>
            </Button>
          ) : null}
        </>
      )}
    </section>
  )
}
