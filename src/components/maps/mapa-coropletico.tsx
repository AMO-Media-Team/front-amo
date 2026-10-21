"use client"

import "mapbox-gl/dist/mapbox-gl.css"

import type { Feature, FeatureCollection, Geometry, Point } from "geojson"
import type { MapSourceDataEvent, Map as MapaMapbox } from "mapbox-gl"
import { useReducedMotionConfig } from "motion/react"
import {
  type Ref,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import MapGL, {
  type FogSpecification,
  Layer,
  type MapMouseEvent,
  type MapRef,
  Source,
} from "react-map-gl/mapbox"

import { tipoPuntero, type TipoPuntero } from "@/features/geo/clic"
import { COLOR_SIN_DATOS, type TemaMapa } from "@/lib/geo/escalas"
import type { Posicion } from "@/lib/geo/tipos"

import { animarColores } from "./animacion-colores"
import { encuadreDeZona } from "./area-libre"
import { estaALaVista } from "./cara-visible"
import { esErrorFatalMapa, mensajeErrorMapa } from "./error-mapa"
import {
  COLORES_MAPA,
  type FocoMapa,
  imagenRayado,
  pinturaBorde,
  pinturaCalor,
  pinturaCirculos,
  pinturaRealce,
  pinturaRelleno,
  pinturaResplandor,
  pinturaSinDatos,
} from "./expresiones"
import { crearPatronRayado } from "./patron-rayado"
import type {
  ApiMapa,
  CirculoMapa,
  Encuadre,
  MargenMapa,
  PuntoPeso,
} from "./tipos"
import { useGiroGlobo } from "./use-giro-globo"

export interface MapaCoropleticoProps {
  readonly token: string
  readonly estilo: string
  /**
   * Polígonos del nivel (GeoJSON con propiedad `codigo`, o su URL); `clave`
   * identifica la capa y cambia al cambiar de nivel.
   */
  readonly capa: {
    readonly clave: string
    readonly datos: FeatureCollection<Geometry> | string
  }
  readonly encuadre: Encuadre
  readonly margen: MargenMapa
  readonly tema: TemaMapa
  /** Color por código de zona; las zonas ausentes se dibujan como "sin datos". */
  readonly colores: ReadonlyMap<string, string>
  /** Zonas sin polígono dibujadas como círculos proporcionales (radio en px). */
  readonly circulos?: readonly CirculoMapa[]
  readonly radios?: ReadonlyMap<string, number>
  readonly puntos?: readonly PuntoPeso[] | null
  readonly calor: boolean
  /** Rayar las zonas sin dato (ver `pinturaSinDatos`). */
  readonly rayarSinDatos: boolean
  readonly seleccionado: string | null
  /** Punto de la zona seleccionada: si queda tapado por un panel, se centra. */
  readonly enfoque?: Posicion | null
  readonly resaltado: string | null
  /** Foco de la leyenda: zonas destacadas o las zonas sin dato. */
  readonly foco: FocoMapa
  readonly destacados?: ReadonlySet<string>
  /**
   * Giro automático del globo sobre su eje (vista mundial). Se detiene solo
   * mientras la persona usa el mapa, apunta a una zona o tiene una elegida.
   */
  readonly giro?: boolean
  /** Nombre accesible del lienzo. */
  readonly etiqueta: string
  readonly onZonaHover: (codigo: string | null) => void
  /** Posición del puntero en px relativos al mapa (para el tooltip). */
  readonly onPuntero?: (x: number, y: number) => void
  readonly onZonaClic: (codigo: string | null, puntero: TipoPuntero) => void
  readonly onZonaDobleClic: (codigo: string, puntero: TipoPuntero) => void
  readonly onListo?: () => void
  readonly onError?: (mensaje: string) => void
  readonly refApi?: Ref<ApiMapa>
}

const CAPAS_INTERACTIVAS = ["zonas-relleno", "circulos"]

const LOCALE_MAPA = {
  "AttributionControl.ToggleAttribution": "Mostrar u ocultar créditos",
  "LogoControl.Title": "Logotipo de Mapbox",
  "Map.Title": "Mapa",
  "ScrollZoomBlocker.CtrlMessage": "Usa Ctrl + desplazamiento para acercar",
  "ScrollZoomBlocker.CmdMessage": "Usa ⌘ + desplazamiento para acercar",
  "TouchPanBlocker.Message": "Usa dos dedos para mover el mapa",
}

/** Colombia en el globo: se centra siempre en el país. */
const ZOOM_MINIMO = 0.8
const ZOOM_MAXIMO = 11
const DURACION_CAMARA_MS = 1400
const DURACION_COLOR_MS = 480
const DURACION_MARGEN_MS = 520

/**
 * El tema monocromo del mapa base (tabla de color de Standard) también
 * desatura la atmósfera: sin esto el espacio se ve gris medio, no el fondo
 * de la marca.
 */
const ATMOSFERA_SIN_TEMA = {
  "color-use-theme": "none",
  "high-color-use-theme": "none",
  "space-color-use-theme": "none",
} as const

/**
 * Atmósfera del globo con los fondos de la marca: el espacio se funde con la
 * interfaz (casi negro lila de noche, lila muy claro de día).
 */
const ATMOSFERA: Readonly<Record<TemaMapa, FogSpecification>> = {
  oscuro: {
    ...ATMOSFERA_SIN_TEMA,
    color: "#1C1729",
    "high-color": "#261848",
    "horizon-blend": 0.05,
    "space-color": "#0E0B16",
    "star-intensity": 0.28,
  },
  claro: {
    ...ATMOSFERA_SIN_TEMA,
    color: "#FFFFFF",
    "high-color": "#DCD0FD",
    "horizon-blend": 0.06,
    "space-color": "#F1EEF8",
    "star-intensity": 0,
  },
}

/** Límites administrativos en gris lila, discretos bajo el coroplético. */
const COLOR_LIMITES: Readonly<Record<TemaMapa, string>> = {
  oscuro: "hsl(258, 22%, 42%)",
  claro: "hsl(258, 16%, 68%)",
}

/**
 * Opciones de Mapbox Standard (importado como `basemap` por el estilo): sin
 * puntos de interés, vías ni objetos 3D, y sin nombres de lugares: sobre el
 * coroplético sus halos ensucian los colores, y el nombre de cada zona ya
 * está en el tooltip, el ranking y el detalle.
 */
function configuracionBase(tema: TemaMapa) {
  return {
    lightPreset: tema === "oscuro" ? "night" : "day",
    theme: "monochrome",
    showPlaceLabels: false,
    showPointOfInterestLabels: false,
    showTransitLabels: false,
    showRoadLabels: false,
    showPedestrianRoads: false,
    show3dObjects: false,
    colorAdminBoundaries: COLOR_LIMITES[tema],
  }
}

function aplicarConfiguracion(mapa: MapaMapbox, tema: TemaMapa): void {
  for (const [clave, valor] of Object.entries(configuracionBase(tema))) {
    try {
      mapa.setConfigProperty("basemap", clave, valor)
    } catch {
      // Un estilo sin esa opción (o sin `basemap`) no debe romper el mapa.
    }
  }
}

function registrarPatrones(mapa: MapaMapbox): void {
  for (const tema of ["oscuro", "claro"] as const) {
    const nombre = imagenRayado(tema)
    if (!mapa.hasImage(nombre)) {
      mapa.addImage(nombre, crearPatronRayado(COLORES_MAPA[tema].rayado))
    }
  }
}

function vistaInicial(encuadre: Encuadre, margen: MargenMapa) {
  return encuadre.tipo === "limites"
    ? {
        bounds: [
          [encuadre.bbox[0], encuadre.bbox[1]],
          [encuadre.bbox[2], encuadre.bbox[3]],
        ] as [[number, number], [number, number]],
        fitBoundsOptions: { padding: margen },
      }
    : {
        longitude: encuadre.centro[0],
        latitude: encuadre.centro[1],
        zoom: encuadre.zoom,
        padding: margen,
      }
}

type Escritor = (codigo: string, estado: Record<string, unknown>) => void

/** Marca una sola zona con `clave` (selección, hover) y desmarca la anterior. */
function useEstadoUnico(
  clave: string,
  codigo: string | null,
  activo: boolean,
  escribir: Escritor
): void {
  const previo = useRef<string | null>(null)
  useEffect(() => {
    if (!activo) return
    if (previo.current && previo.current !== codigo) {
      escribir(previo.current, { [clave]: false })
    }
    if (codigo) escribir(codigo, { [clave]: true })
    previo.current = codigo
  }, [activo, clave, codigo, escribir])
}

/** Marca un conjunto de zonas con `clave` y desmarca las que salen. */
function useEstadoConjunto(
  clave: string,
  codigos: ReadonlySet<string> | ReadonlyMap<string, number> | undefined,
  valor: (codigo: string) => unknown,
  apagado: unknown,
  activo: boolean,
  escribir: Escritor
): void {
  const previos = useRef(new Set<string>())
  const valorDe = useEffectEvent(valor)
  useEffect(() => {
    if (!activo) return
    const nuevos = new Set(codigos?.keys() ?? [])
    for (const codigo of previos.current) {
      if (!nuevos.has(codigo)) escribir(codigo, { [clave]: apagado })
    }
    for (const codigo of nuevos) escribir(codigo, { [clave]: valorDe(codigo) })
    previos.current = nuevos
  }, [activo, apagado, clave, codigos, escribir])
}

const claveEncuadre = (encuadre: Encuadre) =>
  encuadre.tipo === "limites"
    ? `l:${encuadre.bbox.join(",")}`
    : `c:${encuadre.centro.join(",")}:${encuadre.zoom}`

function codigoDelEvento(evento: MapMouseEvent): string | null {
  const codigo = evento.features?.[0]?.properties?.codigo
  return typeof codigo === "string" ? codigo : null
}

function coleccionPuntos(
  puntos: readonly PuntoPeso[]
): FeatureCollection<Point, { peso: number }> {
  return {
    type: "FeatureCollection",
    features: puntos.map(
      ([lon, lat, peso]): Feature<Point, { peso: number }> => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { peso },
      })
    ),
  }
}

function coleccionCirculos(
  circulos: readonly CirculoMapa[]
): FeatureCollection<Point, { codigo: string }> {
  return {
    type: "FeatureCollection",
    features: circulos.map(({ codigo, centro }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [centro[0], centro[1]] },
      properties: { codigo },
    })),
  }
}

/**
 * Mapa coroplético sobre Mapbox (react-map-gl). Genérico: recibe colores por
 * código y avisa hover, clic y doble clic; la lógica de niveles vive en el
 * explorador. Solo se carga en el cliente (ver `mapa-dinamico.tsx`).
 */
export default function MapaCoropletico({
  token,
  estilo,
  capa,
  encuadre,
  margen,
  tema,
  colores,
  circulos,
  radios,
  puntos,
  calor,
  rayarSinDatos,
  seleccionado,
  enfoque = null,
  resaltado,
  foco,
  destacados,
  giro = false,
  etiqueta,
  onZonaHover,
  onPuntero,
  onZonaClic,
  onZonaDobleClic,
  onListo,
  onError,
  refApi,
}: MapaCoropleticoProps) {
  const refMapa = useRef<MapRef>(null)
  // Movimiento reducido del sistema o de la cuenta (MotionConfig).
  const reducido = useReducedMotionConfig() ?? false
  const [listo, setListo] = useState(false)
  const [capaCargada, setCapaCargada] = useState<string | null>(null)
  const [sobreZona, setSobreZona] = useState(false)
  // Solo el ratón "apunta": tras un toque no hay `mouseleave` que lo suelte.
  const [ratonSobreZona, setRatonSobreZona] = useState(false)
  const punteroRef = useRef<TipoPuntero>("mouse")
  const hoverRef = useRef<string | null>(null)
  const coloresActuales = useRef(new Map<string, string>())
  const capaAnimada = useRef<string | null>(null)
  const encuadreAplicado = useRef(claveEncuadre(encuadre))
  const [vistaDeInicio] = useState(() => vistaInicial(encuadre, margen))

  const fuenteZonas = `zonas-${capa.clave}`
  const fuenteCirculos = `circulos-${capa.clave}`
  const fuentes = useMemo(
    () => (circulos?.length ? [fuenteZonas, fuenteCirculos] : [fuenteZonas]),
    [circulos, fuenteZonas, fuenteCirculos]
  )
  const capaLista = capaCargada === fuenteZonas

  // Copia de todo el estado escrito por zona: si Mapbox recarga una fuente
  // (cambio de tema del mapa base, fuente que se vuelve a agregar) se
  // reaplica tal cual en lugar de esperar al siguiente cambio de datos.
  const estadoEscrito = useRef(new Map<string, Record<string, unknown>>())

  const escribirEstado = useCallback(
    (codigo: string, estado: Record<string, unknown>) => {
      estadoEscrito.current.set(codigo, {
        ...estadoEscrito.current.get(codigo),
        ...estado,
      })
      const mapa = refMapa.current?.getMap()
      if (!mapa) return
      for (const fuente of fuentes) {
        if (mapa.getSource(fuente)) {
          mapa.setFeatureState({ source: fuente, id: codigo }, estado)
        }
      }
    },
    [fuentes]
  )

  useEffect(() => {
    const mapa = refMapa.current?.getMap()
    if (!capaLista || !mapa) return
    let pendiente = 0
    const reaplicar = () => {
      pendiente = 0
      for (const fuente of fuentes) {
        if (!mapa.getSource(fuente)) continue
        for (const [codigo, estado] of estadoEscrito.current) {
          mapa.setFeatureState({ source: fuente, id: codigo }, estado)
        }
      }
    }
    const programar = (evento: MapSourceDataEvent) => {
      const propia = evento.sourceId && fuentes.includes(evento.sourceId)
      if (!propia || !evento.isSourceLoaded) return
      if (!pendiente) pendiente = requestAnimationFrame(reaplicar)
    }
    mapa.on("sourcedata", programar)
    return () => {
      mapa.off("sourcedata", programar)
      cancelAnimationFrame(pendiente)
    }
  }, [capaLista, fuentes])

  // ── Carga del estilo ──────────────────────────────────────────────────────
  // Los patrones se registran en cada `styledata`: las capas que los usan se
  // agregan antes del evento `load`.
  const alCambiarEstilo = useCallback(() => {
    const mapa = refMapa.current?.getMap()
    if (mapa) registrarPatrones(mapa)
  }, [])
  const alCargar = useCallback(() => setListo(true), [])
  const avisarListo = useEffectEvent(() => onListo?.())

  useEffect(() => {
    if (listo) avisarListo()
  }, [listo])

  useEffect(() => {
    const mapa = refMapa.current?.getMap()
    if (listo && mapa) mapa.getCanvas().setAttribute("aria-label", etiqueta)
  }, [listo, etiqueta])

  // Tipo de puntero del último toque/clic (el evento `click` de Mapbox no lo trae).
  useEffect(() => {
    const mapa = refMapa.current?.getMap()
    if (!listo || !mapa) return
    const contenedor = mapa.getCanvasContainer()
    const registrar = (evento: PointerEvent) => {
      punteroRef.current = tipoPuntero(evento.pointerType)
    }
    contenedor.addEventListener("pointerdown", registrar, { passive: true })
    return () => contenedor.removeEventListener("pointerdown", registrar)
  }, [listo])

  // El contenedor cambia de tamaño con la barra lateral y la pantalla completa.
  useEffect(() => {
    const mapa = refMapa.current?.getMap()
    if (!listo || !mapa) return
    const observador = new ResizeObserver(() => mapa.resize())
    observador.observe(mapa.getContainer())
    return () => observador.disconnect()
  }, [listo])

  // Tema: día o noche sin recargar el estilo.
  useEffect(() => {
    const mapa = refMapa.current?.getMap()
    if (listo && mapa) aplicarConfiguracion(mapa, tema)
  }, [listo, tema])

  // ── Capa de zonas ─────────────────────────────────────────────────────────
  // El estado por zona se puede escribir en cuanto la fuente existe (Mapbox lo
  // aplica a cada tesela al cargarla), sin esperar al evento `load` del mapa
  // base, que con el estilo Standard puede tardar segundos más.
  // Que la fuente propia ya reporte datos implica un estilo cargado: el mapa
  // se puede mostrar y usar aunque el mapa base siga descargando teselas.
  const alDatosFuente = useCallback(
    (evento: MapSourceDataEvent) => {
      if (evento.sourceId !== fuenteZonas) return
      setCapaCargada(fuenteZonas)
      setListo(true)
    },
    [fuenteZonas]
  )

  // ── Colores (animados) ────────────────────────────────────────────────────
  const colorBase = useEffectEvent(() => COLOR_SIN_DATOS[tema])
  useEffect(() => {
    if (!capaLista) return
    if (capaAnimada.current !== fuenteZonas) {
      coloresActuales.current = new Map()
      estadoEscrito.current = new Map()
      capaAnimada.current = fuenteZonas
    }
    return animarColores({
      actuales: coloresActuales.current,
      destino: colores,
      colorBase: colorBase(),
      duracionMs: reducido ? 0 : DURACION_COLOR_MS,
      escribir: (codigo, color) => escribirEstado(codigo, { color }),
    })
  }, [capaLista, colores, escribirEstado, fuenteZonas, reducido])

  useEstadoConjunto(
    "radio",
    radios,
    (codigo) => radios?.get(codigo) ?? 0,
    0,
    capaLista,
    escribirEstado
  )
  useEstadoConjunto(
    "destacado",
    destacados,
    () => true,
    false,
    capaLista,
    escribirEstado
  )
  useEstadoUnico("seleccionado", seleccionado, capaLista, escribirEstado)
  useEstadoUnico("hover", resaltado, capaLista, escribirEstado)

  // ── Cámara ────────────────────────────────────────────────────────────────
  const encuadrar = useCallback(
    (animado: boolean) => {
      const mapa = refMapa.current?.getMap()
      if (!mapa) return
      const duracion = animado && !reducido ? DURACION_CAMARA_MS : 0
      if (encuadre.tipo === "limites") {
        const [oeste, sur, este, norte] = encuadre.bbox
        mapa.fitBounds(
          [
            [oeste, sur],
            [este, norte],
          ],
          { padding: margen, duration: duracion, essential: true }
        )
      } else {
        mapa.flyTo({
          center: [encuadre.centro[0], encuadre.centro[1]],
          zoom: encuadre.zoom,
          padding: margen,
          duration: duracion,
          essential: true,
        })
      }
    },
    [encuadre, margen, reducido]
  )

  // Un nivel nuevo vuela a su encuadre (con los márgenes vigentes); si solo
  // cambian los márgenes (se abre o cierra el detalle), la vista se desliza
  // sin cambiar el zoom que haya elegido la persona.
  const claveMargen = `${margen.top},${margen.right},${margen.bottom},${margen.left}`
  const margenAplicado = useRef(claveMargen)
  useEffect(() => {
    const mapa = refMapa.current?.getMap()
    if (!listo || !mapa) return
    const clave = claveEncuadre(encuadre)
    if (encuadreAplicado.current !== clave) {
      encuadreAplicado.current = clave
      margenAplicado.current = claveMargen
      encuadrar(true)
      return
    }
    if (margenAplicado.current !== claveMargen) {
      margenAplicado.current = claveMargen
      mapa.easeTo({
        padding: margen,
        duration: reducido ? 0 : DURACION_MARGEN_MS,
        essential: true,
      })
    }
  }, [listo, encuadre, encuadrar, claveMargen, margen, reducido])

  // La zona seleccionada (desde el ranking, por ejemplo) se trae a la vista
  // si quedó fuera del área libre de paneles: la cámara se corre lo justo,
  // sin recentrar (el resto del mapa sigue siendo el contexto). Solo al
  // cambiar de zona: si luego la persona mueve el mapa, no se la devuelve.
  const claveEnfoque = enfoque ? `${enfoque[0]},${enfoque[1]}` : null
  const traerALaVista = useEffectEvent(() => {
    const mapa = refMapa.current?.getMap()
    if (!mapa || !enfoque) return
    // En el borde o en la cara oculta del globo no hay nada que "correr" (la
    // zona se proyecta a través del planeta): se trae al centro.
    const centro = mapa.getCenter()
    if (!estaALaVista([centro.lng, centro.lat], enfoque)) {
      mapa.easeTo({
        center: [enfoque[0], enfoque[1]],
        padding: margen,
        duration: reducido ? 0 : DURACION_CAMARA_MS,
        essential: true,
      })
      return
    }
    const { clientWidth: ancho, clientHeight: alto } = mapa.getContainer()
    // Los márgenes aún en pantalla: el efecto anterior apenas empezó a
    // deslizarlos (abrir el detalle) y esta animación reemplaza a esa.
    const previo = mapa.getPadding()
    const encuadreZona = encuadreDeZona(
      mapa.project([enfoque[0], enfoque[1]]),
      { ancho, alto },
      {
        top: previo.top ?? 0,
        bottom: previo.bottom ?? 0,
        left: previo.left ?? 0,
        right: previo.right ?? 0,
      },
      margen
    )
    if (!encuadreZona) return
    mapa.easeTo({
      center: [enfoque[0], enfoque[1]],
      padding: margen,
      offset: encuadreZona.offset,
      duration: reducido ? 0 : DURACION_MARGEN_MS * 1.4,
      essential: true,
    })
  })
  useEffect(() => {
    if (listo && claveEnfoque) traerALaVista()
  }, [listo, claveEnfoque])

  useImperativeHandle(
    refApi,
    (): ApiMapa => ({
      recentrar: () => encuadrar(true),
      acercar: () => refMapa.current?.getMap().zoomIn(),
      alejar: () => refMapa.current?.getMap().zoomOut(),
      // Se captura sin los márgenes de los paneles (que en la imagen no
      // existen) y se restauran en el mismo cuadro.
      capturar: () =>
        new Promise((resolver) => {
          const mapa = refMapa.current?.getMap()
          if (!mapa) {
            resolver(null)
            return
          }
          const margenActual = mapa.getPadding()
          mapa.setPadding({ top: 0, bottom: 0, left: 0, right: 0 })
          mapa.once("render", () => {
            const origen = mapa.getCanvas()
            const copia = document.createElement("canvas")
            copia.width = origen.width
            copia.height = origen.height
            copia.getContext("2d")?.drawImage(origen, 0, 0)
            mapa.setPadding(margenActual)
            resolver(copia)
          })
          mapa.triggerRepaint()
        }),
    }),
    [encuadrar]
  )

  // ── Eventos de puntero ───────────────────────────────────────────────────
  const alMover = useCallback(
    (evento: MapMouseEvent) => {
      const codigo = codigoDelEvento(evento)
      onPuntero?.(evento.point.x, evento.point.y)
      if (codigo !== hoverRef.current) {
        hoverRef.current = codigo
        setSobreZona(codigo !== null)
        setRatonSobreZona(codigo !== null && punteroRef.current === "mouse")
        onZonaHover(codigo)
      }
    },
    [onPuntero, onZonaHover]
  )

  const alSalir = useCallback(() => {
    hoverRef.current = null
    setSobreZona(false)
    setRatonSobreZona(false)
    onZonaHover(null)
  }, [onZonaHover])

  // ── Giro del globo ───────────────────────────────────────────────────────
  // Una zona bajo el puntero o elegida no debe escaparse mientras se lee.
  useGiroGlobo(refMapa, {
    listo,
    activo:
      giro &&
      !reducido &&
      capaLista &&
      !ratonSobreZona &&
      seleccionado === null,
  })

  const alClic = useCallback(
    (evento: MapMouseEvent) =>
      onZonaClic(codigoDelEvento(evento), punteroRef.current),
    [onZonaClic]
  )

  const alDobleClic = useCallback(
    (evento: MapMouseEvent) => {
      const codigo = codigoDelEvento(evento)
      if (codigo) onZonaDobleClic(codigo, punteroRef.current)
    },
    [onZonaDobleClic]
  )

  // El rayado espera a los colores: antes, todas las zonas parecerían "sin datos".
  const opcionesPintura = { calor, foco, rayar: rayarSinDatos && capaLista }
  const datosPuntos = useMemo(
    () => (puntos?.length ? coleccionPuntos(puntos) : null),
    [puntos]
  )
  const pesoMaximo = useMemo(
    () =>
      (puntos ?? []).reduce((maximo, [, , peso]) => Math.max(maximo, peso), 0),
    [puntos]
  )
  const datosCirculos = useMemo(
    () => (circulos?.length ? coleccionCirculos(circulos) : null),
    [circulos]
  )

  return (
    <MapGL
      ref={refMapa}
      mapboxAccessToken={token}
      mapStyle={estilo}
      reuseMaps
      initialViewState={vistaDeInicio}
      projection="globe"
      config={{ basemap: configuracionBase(tema) }}
      fog={ATMOSFERA[tema]}
      language="es"
      doubleClickZoom={false}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      maxPitch={0}
      minZoom={ZOOM_MINIMO}
      maxZoom={ZOOM_MAXIMO}
      logoPosition="bottom-right"
      performanceMetricsCollection={false}
      locale={LOCALE_MAPA}
      interactiveLayerIds={CAPAS_INTERACTIVAS}
      cursor={sobreZona ? "pointer" : undefined}
      onLoad={alCargar}
      onStyleData={alCambiarEstilo}
      onSourceData={alDatosFuente}
      onError={(evento) => {
        // Solo es fatal si el estilo nunca cargó (token, red o WebGL); una
        // fuente o tesela del mapa base que falla deja el coroplético en pie.
        if (!listo && esErrorFatalMapa(evento)) {
          onError?.(mensajeErrorMapa(evento.error))
        }
      }}
      onMouseMove={alMover}
      onMouseLeave={alSalir}
      onClick={alClic}
      onDblClick={alDobleClic}
      style={{ position: "absolute", inset: 0 }}
    >
      <Source
        key={fuenteZonas}
        id={fuenteZonas}
        type="geojson"
        data={capa.datos}
        promoteId="codigo"
      >
        <Layer
          id="zonas-relleno"
          type="fill"
          slot="middle"
          paint={pinturaRelleno(tema, opcionesPintura)}
        />
        <Layer
          id="zonas-sin-datos"
          type="fill"
          slot="middle"
          paint={pinturaSinDatos(tema, opcionesPintura)}
        />
        <Layer
          id="zonas-borde"
          type="line"
          slot="middle"
          paint={pinturaBorde(tema)}
        />
        <Layer
          id="zonas-resplandor"
          type="line"
          slot="middle"
          paint={pinturaResplandor(tema)}
        />
        <Layer
          id="zonas-realce"
          type="line"
          slot="middle"
          paint={pinturaRealce(tema)}
        />
      </Source>

      {datosCirculos ? (
        <Source
          key={fuenteCirculos}
          id={fuenteCirculos}
          type="geojson"
          data={datosCirculos}
          promoteId="codigo"
        >
          <Layer
            id="circulos"
            type="circle"
            slot="middle"
            paint={pinturaCirculos(tema, opcionesPintura)}
          />
        </Source>
      ) : null}

      {calor && datosPuntos ? (
        <Source
          key={`calor-${capa.clave}`}
          id={`calor-${capa.clave}`}
          type="geojson"
          data={datosPuntos}
        >
          <Layer
            id="calor"
            type="heatmap"
            slot="middle"
            paint={pinturaCalor(tema, pesoMaximo)}
          />
        </Source>
      ) : null}
    </MapGL>
  )
}
