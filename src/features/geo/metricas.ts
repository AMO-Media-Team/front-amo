/**
 * Catálogo de métricas del explorador geográfico (docs/modelo-datos.md §5.9,
 * docs/kpis.md). Módulo puro: lo usan la página, el Route Handler, los
 * proveedores de datos y la interfaz.
 */
import type { ClavePermiso } from "@/lib/auth/permisos"

export const NIVELES_GEO = [
  "internacional",
  "nacional",
  "departamental",
] as const
export type NivelGeo = (typeof NIVELES_GEO)[number]

/** Nivel de la RPC `geo_metricas(p_nivel, …)` que corresponde a cada nivel del mapa. */
export const NIVEL_RPC: Readonly<
  Record<NivelGeo, "pais" | "departamento" | "municipio">
> = {
  internacional: "pais",
  nacional: "departamento",
  departamental: "municipio",
}

export const METRICAS_GEO = [
  "medios",
  "gmv",
  "alcance",
  "cumplimiento",
  "campanas",
  "asignaciones",
  "anunciantes",
  "accesos",
  "audiencia",
] as const
export type MetricaGeo = (typeof METRICAS_GEO)[number]

export type UnidadMetrica = "conteo" | "cop" | "personas" | "porcentaje"

export interface DefinicionMetrica {
  readonly clave: MetricaGeo
  readonly titulo: string
  /** Para selectores compactos, leyendas y encabezados de columna. */
  readonly tituloCorto: string
  readonly descripcion: string
  readonly unidad: UnidadMetrica
  /**
   * Conteos y montos se suman entre zonas; las tasas no (se ponderan por `n`)
   * ni admiten "por 100 mil habitantes".
   */
  readonly aditiva: boolean
  /** Foto al cierre del periodo: no crece con la duración del rango. */
  readonly foto: boolean
  readonly niveles: readonly NivelGeo[]
  /** Hay puntos reales (coordenadas) para el modo mapa de calor. */
  readonly conPuntos: boolean
  /** Permiso adicional a `analitica.mapa` para consultarla. */
  readonly permisoExtra?: ClavePermiso
  /**
   * Permiso para leer sus puntos del modo calor, que salen de la tabla con la
   * RLS del usuario (sin él, la lectura volvería vacía y el calor mentiría).
   */
  readonly permisoCalor?: ClavePermiso
}

const NIVELES_COLOMBIA: readonly NivelGeo[] = ["nacional", "departamental"]
const TODOS_LOS_NIVELES: readonly NivelGeo[] = NIVELES_GEO

export const DEFINICIONES_METRICAS: Readonly<
  Record<MetricaGeo, DefinicionMetrica>
> = {
  medios: {
    clave: "medios",
    titulo: "Medios verificados",
    tituloCorto: "Medios",
    descripcion:
      "Medios con verificación vigente al cierre del periodo, por municipio del medio.",
    unidad: "conteo",
    aditiva: true,
    foto: true,
    niveles: NIVELES_COLOMBIA,
    conPuntos: true,
    permisoCalor: "medios.ver",
  },
  gmv: {
    clave: "gmv",
    titulo: "GMV comprometido",
    tituloCorto: "GMV",
    descripcion:
      "Valor bruto de las asignaciones aceptadas en el periodo, según el municipio del medio.",
    unidad: "cop",
    aditiva: true,
    foto: false,
    niveles: NIVELES_COLOMBIA,
    conPuntos: false,
  },
  alcance: {
    clave: "alcance",
    titulo: "Alcance acumulado",
    tituloCorto: "Alcance",
    descripcion:
      "Personas alcanzadas por publicaciones verificadas en el periodo (acumulado, sin deduplicar).",
    unidad: "personas",
    aditiva: true,
    foto: false,
    niveles: NIVELES_COLOMBIA,
    conPuntos: false,
  },
  cumplimiento: {
    clave: "cumplimiento",
    titulo: "Tasa de cumplimiento",
    tituloCorto: "Cumplimiento",
    descripcion:
      "Asignaciones publicadas a tiempo y validadas sobre las comprometidas con resultado conocido. Con menos de 20 casos no se compara.",
    unidad: "porcentaje",
    aditiva: false,
    foto: false,
    niveles: NIVELES_COLOMBIA,
    conPuntos: false,
  },
  campanas: {
    clave: "campanas",
    titulo: "Campañas con pauta",
    tituloCorto: "Campañas",
    descripcion:
      "Campañas con al menos una asignación aceptada en la zona durante el periodo.",
    unidad: "conteo",
    aditiva: true,
    foto: false,
    niveles: NIVELES_COLOMBIA,
    conPuntos: false,
  },
  asignaciones: {
    clave: "asignaciones",
    titulo: "Asignaciones aceptadas",
    tituloCorto: "Asignaciones",
    descripcion:
      "Asignaciones aceptadas por medios de la zona durante el periodo.",
    unidad: "conteo",
    aditiva: true,
    foto: false,
    niveles: NIVELES_COLOMBIA,
    conPuntos: false,
  },
  anunciantes: {
    clave: "anunciantes",
    titulo: "Anunciantes activos",
    tituloCorto: "Anunciantes",
    descripcion:
      "Anunciantes verificados con al menos una asignación aceptada en el periodo, por su ubicación.",
    unidad: "conteo",
    aditiva: true,
    foto: false,
    niveles: TODOS_LOS_NIVELES,
    conPuntos: false,
  },
  accesos: {
    clave: "accesos",
    titulo: "Accesos a la plataforma",
    tituloCorto: "Accesos",
    descripcion:
      "Inicios de sesión exitosos en el periodo, según la ubicación aproximada de la conexión.",
    unidad: "conteo",
    aditiva: true,
    foto: false,
    niveles: TODOS_LOS_NIVELES,
    conPuntos: true,
    permisoExtra: "accesos.ver",
  },
  audiencia: {
    clave: "audiencia",
    titulo: "Origen de la audiencia",
    tituloCorto: "Audiencia",
    descripcion:
      "Seguidores estimados de los medios verificados según el país de origen declarado.",
    unidad: "personas",
    aditiva: true,
    foto: true,
    niveles: ["internacional"],
    conPuntos: false,
  },
}

const METRICA_POR_DEFECTO: Readonly<Record<NivelGeo, MetricaGeo>> = {
  internacional: "audiencia",
  nacional: "medios",
  departamental: "medios",
}

/** ¿El usuario puede consultar la métrica? Recibe su verificador de permisos. */
export type VerificadorPermiso = (permiso: ClavePermiso) => boolean

export function metricaPermitida(
  metrica: MetricaGeo,
  tienePermiso: VerificadorPermiso
): boolean {
  const extra = DEFINICIONES_METRICAS[metrica].permisoExtra
  return !extra || tienePermiso(extra)
}

export function metricaDisponibleEn(
  metrica: MetricaGeo,
  nivel: NivelGeo
): boolean {
  return DEFINICIONES_METRICAS[metrica].niveles.includes(nivel)
}

/** Métricas del nivel en el orden del catálogo, filtradas por las permitidas. */
export function metricasDelNivel(
  nivel: NivelGeo,
  permitidas: readonly MetricaGeo[] = METRICAS_GEO
): MetricaGeo[] {
  return METRICAS_GEO.filter(
    (metrica) =>
      permitidas.includes(metrica) && metricaDisponibleEn(metrica, nivel)
  )
}

/**
 * Métrica efectiva: la pedida si existe en el nivel y está permitida; si no,
 * la del nivel por defecto; si tampoco, la primera disponible.
 */
export function resolverMetrica(
  nivel: NivelGeo,
  solicitada: MetricaGeo | null | undefined,
  permitidas: readonly MetricaGeo[] = METRICAS_GEO
): MetricaGeo | null {
  const disponibles = metricasDelNivel(nivel, permitidas)
  if (solicitada && disponibles.includes(solicitada)) return solicitada
  const porDefecto = METRICA_POR_DEFECTO[nivel]
  return disponibles.includes(porDefecto)
    ? porDefecto
    : (disponibles[0] ?? null)
}

/** "Por 100 mil habitantes" solo en el nivel nacional (población DANE por departamento). */
export function admitePor100k(nivel: NivelGeo, metrica: MetricaGeo): boolean {
  return nivel === "nacional" && DEFINICIONES_METRICAS[metrica].aditiva
}

/** Mapa de calor solo con coordenadas reales, nunca con agregados por zona. */
export function admiteCalor(metrica: MetricaGeo): boolean {
  return DEFINICIONES_METRICAS[metrica].conPuntos
}

/** ¿El usuario puede ver los puntos del modo calor de la métrica? */
export function calorPermitido(
  metrica: MetricaGeo,
  tienePermiso: VerificadorPermiso
): boolean {
  const { permisoCalor } = DEFINICIONES_METRICAS[metrica]
  return (
    admiteCalor(metrica) &&
    metricaPermitida(metrica, tienePermiso) &&
    (!permisoCalor || tienePermiso(permisoCalor))
  )
}
