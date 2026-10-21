"use client"

import { useQueryClient } from "@tanstack/react-query"
import { ListOrdered, LocateFixed } from "lucide-react"
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import {
  componerImagenMapa,
  descargarMapaPng,
  type ElementoLeyendaExportacion,
} from "@/components/maps/exportar-mapa"
import type { FocoMapa } from "@/components/maps/expresiones"
import { MapaDinamico } from "@/components/maps/mapa-dinamico"
import type { ApiMapa, MargenMapa } from "@/components/maps/tipos"
import {
  TooltipFlotante,
  posicionTooltip,
} from "@/components/maps/tooltip-flotante"
import { useTemaMapa } from "@/components/maps/use-tema-mapa"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { rangoDesdePreset } from "@/lib/fechas"
import { cn } from "@/lib/utils"

import { crearDiscriminadorClic, type DiscriminadorClic } from "../clic"
import {
  ErrorConsultaGeo,
  esSesionVencida,
  precargarGeometria,
  precargarMetricasMapa,
  useDetalleZona,
} from "../consultas-cliente"
import { departamentoPorCodigo } from "../departamentos"
import { claveAmbito, encuadreDelNivel, urlGeometria } from "../encuadre"
import {
  describirPuntosCalor,
  formatearPeriodo,
  formatearValorGeo,
} from "../formato"
import {
  DEFINICIONES_METRICAS,
  type MetricaGeo,
  metricaDisponibleEn,
  metricasDelNivel,
} from "../metricas"
import {
  type EstadoNivel,
  explorar,
  puedeExplorar,
  subirNivel,
  TIPO_ZONA,
} from "../niveles"
import { useEstadoExplorador } from "../use-estado-explorador"
import type { FilaRanking } from "../agregacion"
import { codigosDeClase, type VistaMapa } from "../vista-mapa"
import {
  AvisoErrorDatos,
  AvisoErrorMapa,
  AvisoSinDatos,
  CargaLienzo,
} from "./avisos-mapa"
import { BarraCompacta, EncabezadoMapa, HerramientasMapa } from "./barra-mapa"
import { CoachmarkMapa } from "./coachmark-mapa"
import { ContenidoTooltip } from "./contenido-tooltip"
import {
  type ControlGiro,
  ControlesZoom,
  etiquetaGiro,
  IconoGiro,
  type OpcionesVista,
} from "./controles-mapa"
import type { DatosDetalle } from "./detalle-zona"
import {
  type CalorLeyenda,
  type FocoLeyenda,
  LeyendaMapa,
} from "./leyenda-mapa"
import { altoHojaDetalle, CLASE_LIENZO, CLASE_PANEL } from "./lienzo"
import { HojaDetalle, PanelDetalleLateral } from "./panel-detalle"
import { PanelRanking } from "./panel-ranking"
import {
  type CalorExplorador,
  useDatosExplorador,
} from "./use-datos-explorador"
import { useGiroPreferido } from "./use-giro-preferido"
import {
  disposicionPara,
  useFocoTrasCambioDeNivel,
  useMovimientoReducido,
  usePantallaCompleta,
  usePunteroFino,
  useTamanoElemento,
  useTeclaEscape,
} from "./use-interfaz-mapa"

export interface ExploradorGeoProps {
  readonly token: string
  readonly estilo: string
  /** Métricas que el usuario puede consultar (según sus permisos). */
  readonly metricasPermitidas: readonly MetricaGeo[]
  /** Métricas cuyo modo calor puede ver (puntos leídos con su RLS). */
  readonly metricasCalor: readonly MetricaGeo[]
}

/** Valor atado al ámbito (nivel + departamento): al cambiar de nivel se descarta solo. */
interface EnAmbito<T> {
  readonly ambito: string
  readonly valor: T
}

function enAmbito<T>(estado: EnAmbito<T> | null, ambito: string): T | null {
  return estado?.ambito === ambito ? estado.valor : null
}

/**
 * Área libre de paneles para la cámara. Escritorio: ranking (21 rem) a la
 * izquierda y, con una zona seleccionada, el detalle (22 rem) a la derecha.
 * Móvil: barra arriba y, con detalle, la hoja inferior (`altoHojaDetalle`).
 */
const MARGEN_AMPLIO: MargenMapa = { top: 84, bottom: 44, left: 376, right: 48 }
const MARGEN_DETALLE_AMPLIO = 400
const MARGEN_COMPACTO: MargenMapa = {
  top: 136,
  bottom: 88,
  left: 24,
  right: 24,
}
/** Aire entre la zona seleccionada y el borde de la hoja de detalle. */
const HOLGURA_HOJA_DETALLE_PX = 16
const ANCHO_PANEL_RANKING_PX = 336 + 32

function margenDelMapa(
  amplia: boolean,
  conDetalle: boolean,
  alto: number,
  pantallaCompleta: boolean
): MargenMapa {
  if (amplia) {
    return conDetalle
      ? { ...MARGEN_AMPLIO, right: MARGEN_DETALLE_AMPLIO }
      : MARGEN_AMPLIO
  }
  return conDetalle
    ? {
        ...MARGEN_COMPACTO,
        bottom:
          altoHojaDetalle(alto, pantallaCompleta) + HOLGURA_HOJA_DETALLE_PX,
      }
    : MARGEN_COMPACTO
}

/** Estado del modo calor para la leyenda; `null` si el modo no está activo. */
function calorDeLeyenda(calor: CalorExplorador): CalorLeyenda | null {
  if (!calor.activo || !calor.disponible) return null
  const { respuesta } = calor
  const estado: CalorLeyenda["estado"] = calor.error
    ? "error"
    : !respuesta || (calor.cargando && respuesta.puntos.length === 0)
      ? "cargando"
      : respuesta.puntos.length === 0
        ? "vacio"
        : "listo"
  return {
    estado,
    nota: respuesta ? describirPuntosCalor(respuesta) : null,
    onReintentar: calor.reintentar,
  }
}

function nombreDelAmbito(estado: EstadoNivel): string {
  if (estado.nivel === "internacional") return "Mundo"
  if (estado.nivel === "nacional") return "Colombia"
  return (
    departamentoPorCodigo(estado.departamento)?.nombreCorto ?? "Departamento"
  )
}

function focoDelMapa(foco: FocoLeyenda): FocoMapa {
  if (foco === null) return "ninguno"
  return foco === "sin-datos" ? "sin-datos" : "destacados"
}

function leyendaExportacion(
  vista: VistaMapa,
  metrica: MetricaGeo,
  por100k: boolean,
  rayada: boolean
): ElementoLeyendaExportacion[] {
  const clases = vista.escala.leyenda.map((clase) => ({
    color: clase.color,
    etiqueta: `${formatearValorGeo(clase.desde, metrica, { compacto: true, por100k })}${clase.hasta === null ? " o más" : ""}`,
  }))
  return rayada && vista.sinDatos > 0
    ? [
        ...clases,
        {
          color: vista.escala.colorSinDatos,
          etiqueta: "Sin datos",
          rayado: true,
        },
      ]
    : clases
}

/**
 * Explorador geográfico: mapa inmersivo con paneles de vidrio. Clic o toque
 * selecciona (panel lateral o hoja inferior con "Explorar"); doble clic es un
 * atajo de escritorio para bajar de nivel; Esc cierra el detalle o sube.
 */
export function ExploradorGeo({
  token,
  estilo,
  metricasPermitidas,
  metricasCalor,
}: ExploradorGeoProps) {
  const raiz = useRef<HTMLDivElement>(null)
  const refTooltip = useRef<HTMLDivElement>(null)
  const apiMapa = useRef<ApiMapa>(null)
  const clienteConsultas = useQueryClient()

  const { ancho, alto } = useTamanoElemento(raiz)
  const amplia = disposicionPara(ancho) === "amplia"
  const punteroFino = usePunteroFino()
  const tema = useTemaMapa()
  const pantalla = usePantallaCompleta()

  const explorador = useEstadoExplorador(metricasPermitidas, metricasCalor)
  const { nivel: estado, rango } = explorador
  const ambito = claveAmbito(estado)
  useFocoTrasCambioDeNivel(raiz, ambito)
  const datos = useDatosExplorador(explorador, tema)
  const { vista, metricaVista, respuesta } = datos

  // ── Estado de interacción (atado al ámbito) ──────────────────────────────
  const [seleccion, setSeleccion] = useState<EnAmbito<string> | null>(null)
  const [hover, setHover] = useState<EnAmbito<{
    codigo: string
    origen: "mapa" | "ranking"
  }> | null>(null)
  const claveLeyenda = `${ambito}|${metricaVista}|${explorador.por100k}`
  const [focoLeyenda, setFocoLeyenda] = useState<EnAmbito<FocoLeyenda> | null>(
    null
  )
  const [fijadoLeyenda, setFijadoLeyenda] =
    useState<EnAmbito<FocoLeyenda> | null>(null)
  const [rankingAbierto, setRankingAbierto] = useState(false)
  const [mapaListo, setMapaListo] = useState(false)
  const [errorMapa, setErrorMapa] = useState<string | null>(null)
  const [intentoMapa, setIntentoMapa] = useState(0)
  const [exportando, setExportando] = useState(false)
  // El globo gira solo en la vista mundial; la persona puede pausarlo. Con
  // movimiento reducido (sistema o cuenta) no gira y el control no aparece.
  const [girar, alternarGiro] = useGiroPreferido()
  const sinMovimiento = useMovimientoReducido()
  const controlGiro: ControlGiro | null =
    estado.nivel === "internacional" && !sinMovimiento
      ? { girando: girar, onAlternar: alternarGiro }
      : null

  const seleccionado = enAmbito(seleccion, ambito)
  const hoverActual = enAmbito(hover, ambito)
  const resaltado = hoverActual?.codigo ?? null
  const foco =
    enAmbito(focoLeyenda, claveLeyenda) ?? enAmbito(fijadoLeyenda, claveLeyenda)

  // ── Acciones ──────────────────────────────────────────────────────────────
  const seleccionar = (codigo: string | null) =>
    setSeleccion(codigo ? { ambito, valor: codigo } : null)

  const irA = explorador.irA
  const explorarZona = (codigo: string) => {
    const destino = explorar(estado, codigo)
    if (destino) irA(destino)
    else seleccionar(codigo)
  }

  // Clic y doble clic del mapa: el discriminador difiere la selección 250 ms
  // (con ratón) por si llega un doble clic. Se recrea por ámbito para que un
  // clic pendiente nunca se aplique al nivel siguiente.
  const discriminador = useRef<DiscriminadorClic<string | null>>(null)
  const seleccionDiferida = useEffectEvent((codigo: string | null) =>
    seleccionar(codigo)
  )
  const exploracionDiferida = useEffectEvent((codigo: string | null) => {
    if (codigo) explorarZona(codigo)
  })
  useEffect(() => {
    const actual = crearDiscriminadorClic<string | null>({
      alSeleccionar: (codigo) => seleccionDiferida(codigo),
      alExplorar: (codigo) => exploracionDiferida(codigo),
    })
    discriminador.current = actual
    return () => {
      actual.limpiar()
      discriminador.current = null
    }
  }, [ambito])

  // Esc deshace de adentro hacia afuera: detalle, pantalla completa (si el
  // navegador no la tomó para sí) y, por último, el nivel.
  useTeclaEscape(true, () => {
    if (seleccionado) {
      seleccionar(null)
      return
    }
    if (pantalla.activa) {
      pantalla.alternar()
      return
    }
    const superior = subirNivel(estado)
    if (superior) irA(superior)
  })

  // Seleccionar un departamento adelanta sus municipios y sus cifras.
  const consulta = explorador.consulta
  useEffect(() => {
    if (!seleccionado || !consulta) return
    const destino = explorar(estado, seleccionado)
    if (!destino) return
    precargarGeometria(clienteConsultas, urlGeometria(destino))
    if (metricaDisponibleEn(consulta.metrica, destino.nivel)) {
      precargarMetricasMapa(clienteConsultas, {
        ...consulta,
        nivel: destino.nivel,
        departamento: destino.departamento,
      })
    }
  }, [seleccionado, estado, consulta, clienteConsultas])

  const detalle = useDetalleZona(consulta, seleccionado)

  // ── Derivados para el mapa ────────────────────────────────────────────────
  const destacados = useMemo(
    () =>
      vista && typeof foco === "number"
        ? codigosDeClase(vista, foco)
        : undefined,
    [vista, foco]
  )
  const colores = useMemo(
    () => vista?.colores ?? new Map<string, string>(),
    [vista]
  )
  const rayarSinDatos = estado.nivel !== "internacional" && vista !== null
  const encuadre = useMemo(
    () =>
      encuadreDelNivel(estado, amplia ? ancho - ANCHO_PANEL_RANKING_PX : ancho),
    [estado, amplia, ancho]
  )
  const puntos = datos.calor.respuesta?.puntos ?? null
  const calorVisible = datos.calor.activo && !!puntos?.length
  const calorLeyenda = calorDeLeyenda(datos.calor)
  const margen = margenDelMapa(
    amplia,
    seleccionado !== null,
    alto,
    pantalla.activa
  )
  const enfoque = seleccionado ? datos.centroZona(seleccionado) : null
  const tipoZona = TIPO_ZONA[estado.nivel]
  const metricasNivel = metricasDelNivel(estado.nivel, metricasPermitidas)
  const zonaHover = hoverActual?.origen === "mapa" ? hoverActual.codigo : null

  const moverTooltip = useCallback((x: number, y: number) => {
    const tooltip = refTooltip.current
    const contenedor = raiz.current
    if (!tooltip || !contenedor) return
    tooltip.style.transform = posicionTooltip(
      x,
      y,
      tooltip.offsetWidth,
      tooltip.offsetHeight,
      { width: contenedor.clientWidth, height: contenedor.clientHeight }
    )
  }, [])

  const exportar = useCallback(async () => {
    if (!vista || !metricaVista) return
    setExportando(true)
    try {
      const lienzo = await apiMapa.current?.capturar()
      if (!lienzo) throw new Error("Sin lienzo")
      const definicion = DEFINICIONES_METRICAS[metricaVista]
      const lugar = nombreDelAmbito(estado)
      const imagen = componerImagenMapa({
        mapa: lienzo,
        titulo: `${definicion.titulo} · ${lugar}`,
        subtitulo: `Por ${tipoZona.plural}${explorador.por100k ? " · por 100 mil habitantes" : ""} · ${formatearPeriodo(rango.desde, rango.hasta)}`,
        leyenda: leyendaExportacion(
          vista,
          metricaVista,
          explorador.por100k,
          rayarSinDatos
        ),
        tema,
        escala: window.devicePixelRatio || 1,
      })
      await descargarMapaPng(imagen, [definicion.tituloCorto, lugar])
      toast.success("Imagen del mapa descargada")
    } catch {
      toast.error("No pudimos exportar el mapa. Intenta de nuevo.")
    } finally {
      setExportando(false)
    }
  }, [
    vista,
    metricaVista,
    estado,
    tipoZona,
    explorador.por100k,
    rango,
    rayarSinDatos,
    tema,
  ])

  const opcionesVista: OpcionesVista = {
    admitePor100k: explorador.admitePor100k,
    por100k: explorador.por100k,
    onPor100k: explorador.cambiarPor100k,
    admiteCalor: datos.calor.disponible,
    calor: explorador.calor,
    onCalor: explorador.cambiarCalor,
    pantallaCompleta: pantalla.activa,
    onPantallaCompleta: pantalla.alternar,
    exportando: exportando || !vista || !mapaListo,
    onExportar: () => void exportar(),
  }

  const datosDetalle: DatosDetalle | null =
    seleccionado && metricaVista
      ? {
          codigo: seleccionado,
          nombre: datos.nombreZona(seleccionado),
          fila: vista?.porCodigo.get(seleccionado) ?? null,
          totalZonas: vista?.ranking.conDatos ?? 0,
          estado,
          metrica: metricaVista,
          por100k: explorador.por100k,
          explorable: puedeExplorar(estado, seleccionado),
          detalle: detalle.data,
          cargando: detalle.isFetching,
          error: detalle.error,
        }
      : null

  const accionesDetalle = {
    onCerrar: () => seleccionar(null),
    onExplorar: () => seleccionado && explorarZona(seleccionado),
    onCambiarMetrica: explorador.cambiarMetrica,
    onReintentar: () => void detalle.refetch(),
  }

  const enFocoLeyenda =
    foco === null
      ? null
      : foco === "sin-datos"
        ? (fila: FilaRanking) => fila.valor === null
        : (fila: FilaRanking) => destacados?.has(fila.codigo) ?? false

  const propsRanking = {
    vista,
    enFoco: enFocoLeyenda,
    cargando: datos.cargando,
    estado,
    metrica: metricaVista ?? "medios",
    por100k: explorador.por100k,
    seleccionado,
    resaltado,
    puedeExplorar: (codigo: string) => puedeExplorar(estado, codigo),
    onResaltar: (codigo: string | null) =>
      setHover(
        codigo ? { ambito, valor: { codigo, origen: "ranking" } } : null
      ),
    onSeleccionar: (codigo: string) => {
      seleccionar(codigo)
      setRankingAbierto(false)
    },
    onExplorar: (codigo: string) => {
      setRankingAbierto(false)
      explorarZona(codigo)
    },
  } as const

  const propsBarra = {
    estado,
    onIr: irA,
    metrica: explorador.metrica ?? "medios",
    metricas: metricasNivel,
    onMetrica: explorador.cambiarMetrica,
    rango,
    onRango: explorador.cambiarRango,
    opciones: opcionesVista,
    simulado: respuesta?.origen === "simulado",
    cargando: datos.cargando && mapaListo,
  } as const

  // Con una zona seleccionada, su detalle ya lo dice (y el aviso la taparía).
  const sinDatos =
    vista !== null &&
    vista.ranking.conDatos === 0 &&
    !datos.cargando &&
    seleccionado === null
  const errorDatos = datos.error
  const esFoto =
    metricaVista !== null && DEFINICIONES_METRICAS[metricaVista].foto
  // Sin datos por zona ni puntos de calor, el aviso central ya lo dice todo.
  const leyenda =
    vista &&
    metricaVista &&
    (vista.ranking.conDatos > 0 ||
      (calorLeyenda !== null && calorLeyenda.estado !== "vacio")) ? (
      <LeyendaMapa
        escala={vista.escala}
        tema={tema}
        metrica={metricaVista}
        por100k={explorador.por100k}
        conteos={vista.conteos}
        sinDatos={rayarSinDatos ? vista.sinDatos : 0}
        zonaPlural={tipoZona.plural}
        foco={enAmbito(focoLeyenda, claveLeyenda)}
        fijado={enAmbito(fijadoLeyenda, claveLeyenda)}
        onFoco={(valor) => setFocoLeyenda({ ambito: claveLeyenda, valor })}
        onFijar={(valor) => setFijadoLeyenda({ ambito: claveLeyenda, valor })}
        calor={calorLeyenda}
        compacta={!amplia}
      />
    ) : null

  const filaHover = zonaHover ? (vista?.porCodigo.get(zonaHover) ?? null) : null
  const mapaUsable = !errorMapa && !datos.errorCapa

  const aviso = errorMapa ? (
    <AvisoErrorMapa
      mensaje={errorMapa}
      onReintentar={() => {
        setErrorMapa(null)
        setMapaListo(false)
        setIntentoMapa((intento) => intento + 1)
      }}
    />
  ) : datos.errorCapa ? (
    <AvisoErrorDatos
      mensaje={datos.errorCapa.message}
      onReintentar={datos.reintentarCapa}
    />
  ) : errorDatos ? (
    <AvisoErrorDatos
      mensaje={errorDatos.message}
      pista={
        errorDatos instanceof ErrorConsultaGeo ? errorDatos.pista : undefined
      }
      sesionVencida={esSesionVencida(errorDatos)}
      onReintentar={datos.reintentar}
    />
  ) : sinDatos ? (
    <AvisoSinDatos
      zonaSingular={tipoZona.singular}
      foto={esFoto}
      onAmpliar={
        // Una foto al cierre (medios, audiencia) no crece al ampliar el periodo.
        esFoto || rango.preset === "esteAno"
          ? null
          : () => explorador.cambiarRango(rangoDesdePreset("esteAno"))
      }
    />
  ) : null

  // Orden del DOM = orden del tabulador: avisos y paneles antes que el lienzo
  // (que Mapbox hace enfocable); el apilado lo deciden los `z-index`.
  return (
    <div
      ref={raiz}
      data-disposicion={amplia ? "amplia" : "compacta"}
      className={cn(
        "@container/mapa relative isolate overflow-hidden bg-background",
        pantalla.activa ? "fixed inset-0 z-40 h-dvh" : CLASE_LIENZO
      )}
    >
      {/* ── Avisos centrados ──────────────────────────────────────────── */}
      {aviso}

      {/* ── Paneles ───────────────────────────────────────────────────── */}
      {amplia ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <EncabezadoMapa
              estado={estado}
              onIr={irA}
              simulado={propsBarra.simulado}
              cargando={propsBarra.cargando}
              className="w-[21rem] shrink-0"
            />
            <HerramientasMapa {...propsBarra} />
          </div>
          <div className="flex min-h-0 flex-1 items-start gap-3">
            <div
              className={cn(
                CLASE_PANEL,
                "flex h-full w-[21rem] shrink-0 flex-col"
              )}
            >
              <PanelRanking {...propsRanking} className="flex-1" />
            </div>
            <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-3">
              <CoachmarkMapa
                habilitado={mapaListo && mapaUsable}
                tactil={!punteroFino}
              />
              <div className="flex w-full items-end justify-between gap-3">
                <div className="pointer-events-auto">{leyenda}</div>
              </div>
            </div>
            <div className="flex h-full max-h-[calc(100%-1.75rem)] shrink-0 flex-col items-end">
              <PanelDetalleLateral datos={datosDetalle} {...accionesDetalle} />
            </div>
          </div>
          {mapaUsable ? (
            <ControlesZoom
              onAcercar={() => apiMapa.current?.acercar()}
              onAlejar={() => apiMapa.current?.alejar()}
              onRecentrar={() => apiMapa.current?.recentrar()}
              giro={controlGiro}
              className={cn(
                "absolute bottom-11 transition-[right] duration-300 ease-out",
                datosDetalle ? "right-[24.5rem]" : "right-4"
              )}
            />
          ) : null}
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between gap-3 p-3">
          <div className="flex flex-col items-center gap-3">
            <BarraCompacta {...propsBarra} className="w-full max-w-xl" />
            <CoachmarkMapa
              habilitado={mapaListo && mapaUsable}
              tactil={!punteroFino}
            />
          </div>
          {/* Bajo la hoja de detalle: oculto también para el tabulador (`inert`). */}
          <div
            inert={datosDetalle !== null}
            className={cn(
              "flex items-end justify-between gap-2 transition-opacity duration-200",
              datosDetalle && "pointer-events-none opacity-0"
            )}
          >
            <div className="pointer-events-auto mb-1 min-w-0">{leyenda}</div>
            {/* Por encima del logotipo y la atribución de Mapbox (obligatorios). */}
            <div className="pointer-events-auto mb-[4.25rem] flex shrink-0 flex-col items-end gap-2">
              {mapaUsable && controlGiro ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={controlGiro.onAlternar}
                  aria-label={etiquetaGiro(controlGiro.girando)}
                  className={cn(
                    CLASE_PANEL,
                    "size-10 rounded-xl text-muted-foreground"
                  )}
                >
                  <IconoGiro girando={controlGiro.girando} />
                </Button>
              ) : null}
              {mapaUsable ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => apiMapa.current?.recentrar()}
                  aria-label="Volver al encuadre"
                  className={cn(
                    CLASE_PANEL,
                    "size-10 rounded-xl text-muted-foreground"
                  )}
                >
                  <LocateFixed aria-hidden />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => setRankingAbierto(true)}
                className={cn(
                  CLASE_PANEL,
                  "h-10 gap-2 rounded-xl px-3.5 font-medium"
                )}
              >
                <ListOrdered
                  data-icon="inline-start"
                  aria-hidden
                  className="text-primary"
                />
                Ranking
              </Button>
            </div>
          </div>
          <Drawer open={rankingAbierto} onOpenChange={setRankingAbierto}>
            <DrawerContent className="mx-auto max-w-xl data-[swipe-axis=y]:[--drawer-content-max-height:min(80dvh,44rem)] sm:rounded-t-2xl">
              <span
                aria-hidden
                className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-foreground/20"
              />
              <DrawerTitle className="sr-only">
                Ranking de {tipoZona.plural}
              </DrawerTitle>
              <PanelRanking
                {...propsRanking}
                className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]"
              />
            </DrawerContent>
          </Drawer>
          <HojaDetalle datos={datosDetalle} {...accionesDetalle} />
        </div>
      )}

      {/* ── Lienzo ─────────────────────────────────────────────────────── */}
      {ancho > 0 && datos.capa && metricaVista ? (
        <MapaDinamico
          key={intentoMapa}
          token={token}
          estilo={estilo}
          capa={{ clave: datos.capa.url, datos: datos.capa.coleccion }}
          encuadre={encuadre}
          margen={margen}
          tema={tema}
          colores={colores}
          circulos={datos.circulos?.circulos}
          radios={datos.circulos?.radios}
          puntos={puntos}
          calor={calorVisible}
          rayarSinDatos={rayarSinDatos}
          seleccionado={seleccionado}
          enfoque={enfoque}
          resaltado={resaltado}
          foco={focoDelMapa(foco)}
          destacados={destacados}
          giro={controlGiro?.girando ?? false}
          etiqueta={`Mapa de ${nombreDelAmbito(estado)} por ${tipoZona.plural}: ${DEFINICIONES_METRICAS[metricaVista].titulo}. El ranking contiene los mismos datos.`}
          onZonaHover={(codigo) =>
            setHover(
              codigo ? { ambito, valor: { codigo, origen: "mapa" } } : null
            )
          }
          onPuntero={moverTooltip}
          onZonaClic={(codigo, puntero) =>
            discriminador.current?.clic(codigo, puntero)
          }
          onZonaDobleClic={(codigo, puntero) =>
            discriminador.current?.dobleClic(codigo, puntero)
          }
          onListo={() => setMapaListo(true)}
          onError={setErrorMapa}
          refApi={apiMapa}
        />
      ) : null}
      <CargaLienzo visible={!mapaListo && mapaUsable} />

      {punteroFino && metricaVista ? (
        <TooltipFlotante ref={refTooltip} visible={zonaHover !== null}>
          {zonaHover ? (
            <ContenidoTooltip
              nombre={datos.nombreZona(zonaHover)}
              fila={filaHover}
              color={vista?.colores.get(zonaHover) ?? null}
              metrica={metricaVista}
              por100k={explorador.por100k}
              totalConDatos={vista?.ranking.conDatos ?? 0}
              explorable={puedeExplorar(estado, zonaHover)}
            />
          ) : null}
        </TooltipFlotante>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {datos.cargando
          ? "Cargando datos del mapa…"
          : vista && metricaVista
            ? `${DEFINICIONES_METRICAS[metricaVista].titulo}: ${vista.ranking.conDatos} ${tipoZona.plural} con datos.`
            : ""}
      </p>
    </div>
  )
}
