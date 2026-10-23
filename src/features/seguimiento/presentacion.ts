/**
 * Lecturas del seguimiento que deciden la presentación (módulo puro): el
 * último corte aprobado de cada publicación y los resultados de la asignación
 * (docs/kpis.md §0.3), el orden de la lista, los hitos de su línea de tiempo,
 * qué cambió entre dos consultas y cómo se anuncia.
 */
import { CORTES } from "@/features/operacion/estados"
import { contar } from "@/features/operacion/formato"
import { ZONA } from "@/lib/fechas"

import { esperaPublicacion, type Tono } from "./estados"
import type {
  AsignacionSeguimiento,
  CorteAprobado,
  PublicacionSeguimiento,
} from "./tipos"

// ── Resultados ───────────────────────────────────────────────────────────────

/**
 * El corte más tardío aprobado (7 días > 72 horas > 24 horas): la misma regla
 * que `private.desempeno_verificadas`. `null` sin cortes aprobados.
 */
export function ultimoCorte(
  cortes: readonly CorteAprobado[]
): CorteAprobado | null {
  return cortes.reduce<CorteAprobado | null>(
    (mejor, corte) =>
      !mejor || CORTES[corte.corte].orden > CORTES[mejor.corte].orden
        ? corte
        : mejor,
    null
  )
}

export interface ResultadosAsignacion {
  alcance: number
  impresiones: number
  interacciones: number
  reproducciones: number
  clics: number
  /** Publicaciones con al menos un corte aprobado. */
  publicacionesConCortes: number
}

/**
 * Suma, por publicación, su último corte aprobado. Los nulos cuentan como 0
 * (como en la BD); `null` si ninguna publicación tiene cortes aprobados.
 */
export function resultadosAsignacion(
  publicaciones: readonly Pick<PublicacionSeguimiento, "cortes">[]
): ResultadosAsignacion | null {
  const ultimos = publicaciones.flatMap((publicacion) => {
    const corte = ultimoCorte(publicacion.cortes)
    return corte ? [corte] : []
  })
  if (ultimos.length === 0) return null
  const sumar = (campo: keyof Omit<CorteAprobado, "corte" | "fechaCorte">) =>
    ultimos.reduce((total, corte) => total + (corte[campo] ?? 0), 0)
  return {
    alcance: sumar("alcance"),
    impresiones: sumar("impresiones"),
    interacciones: sumar("interacciones"),
    reproducciones: sumar("reproducciones"),
    clics: sumar("clics"),
    publicacionesConCortes: ultimos.length,
  }
}

// ── Orden ────────────────────────────────────────────────────────────────────

const MARCAS: readonly (keyof AsignacionSeguimiento)[] = [
  "aceptadaAt",
  "contenidoDescargadoAt",
  "publicadaAt",
  "evidenciaValidadaAt",
  "metricasCargadasAt",
  "verificadaAt",
  "vencidaAt",
  "enDisputaAt",
  "canceladaAt",
]

/** El instante más reciente en que pasó algo (estado, publicación o corte). */
export function ultimaActividad(asignacion: AsignacionSeguimiento): string {
  const instantes = [
    ...MARCAS.map((marca) => asignacion[marca]),
    ...asignacion.publicaciones.flatMap((publicacion) => [
      publicacion.fechaPublicacion,
      ...publicacion.cortes.map((corte) => corte.fechaCorte),
    ]),
  ].filter((valor): valor is string => typeof valor === "string" && !!valor)
  return instantes.reduce(
    (mayor, instante) =>
      Date.parse(instante) > Date.parse(mayor) ? instante : mayor,
    asignacion.aceptadaAt
  )
}

/** Lo último que pasó, arriba; a igual actividad, el orden de aceptación. */
export function ordenarSeguimiento(
  asignaciones: readonly AsignacionSeguimiento[]
): AsignacionSeguimiento[] {
  return asignaciones
    .map((asignacion, indice) => ({
      asignacion,
      indice,
      at: Date.parse(ultimaActividad(asignacion)),
    }))
    .sort((a, b) => b.at - a.at || a.indice - b.indice)
    .map(({ asignacion }) => asignacion)
}

/**
 * Orden de la lista tras una actualización automática: las tarjetas que ya
 * estaban conservan su lugar (no saltan mientras se leen; su novedad se marca
 * en la propia tarjeta) y las nuevas entran arriba, por actividad.
 */
export function ordenEstable(
  ordenPrevio: readonly string[],
  asignaciones: readonly AsignacionSeguimiento[]
): AsignacionSeguimiento[] {
  const porId = new Map(asignaciones.map((a) => [a.id, a]))
  const previas = new Set(ordenPrevio)
  const nuevas = ordenarSeguimiento(
    asignaciones.filter((asignacion) => !previas.has(asignacion.id))
  )
  const conservadas = ordenPrevio.flatMap((id) => {
    const asignacion = porId.get(id)
    return asignacion ? [asignacion] : []
  })
  return [...nuevas, ...conservadas]
}

// ── Línea de tiempo ──────────────────────────────────────────────────────────

export interface Hito {
  clave: string
  titulo: string
  /** ISO; `null` en el paso pendiente. */
  at: string | null
  tono: Tono
  pendiente: boolean
}

const HITOS: readonly {
  marca: keyof AsignacionSeguimiento
  titulo: string
  tono: Tono
}[] = [
  { marca: "aceptadaAt", titulo: "Aceptó el cupo", tono: "info" },
  {
    marca: "contenidoDescargadoAt",
    titulo: "Descargó tu contenido",
    tono: "info",
  },
  {
    marca: "publicadaAt",
    titulo: "Publicó y cargó la evidencia",
    tono: "info",
  },
  {
    marca: "evidenciaValidadaAt",
    titulo: "El equipo AMO validó la publicación",
    tono: "exito",
  },
  {
    marca: "metricasCargadasAt",
    titulo: "Cargó todos los cortes de métricas",
    tono: "info",
  },
  {
    marca: "verificadaAt",
    titulo: "Cumplida: métricas verificadas",
    tono: "exito",
  },
  { marca: "vencidaAt", titulo: "Venció sin publicar", tono: "peligro" },
  { marca: "enDisputaAt", titulo: "Se abrió una disputa", tono: "aviso" },
  { marca: "canceladaAt", titulo: "El equipo AMO la canceló", tono: "peligro" },
]

/**
 * Hitos con fecha, en orden cronológico, y el siguiente paso pendiente
 * mientras el medio no ha publicado («Publica a más tardar…»).
 */
export function hitosAsignacion(asignacion: AsignacionSeguimiento): Hito[] {
  const hechos: Hito[] = HITOS.flatMap(({ marca, titulo, tono }) => {
    const at = asignacion[marca]
    return typeof at === "string" && at
      ? [{ clave: marca, titulo, at, tono, pendiente: false }]
      : []
  }).sort((a, b) => Date.parse(a.at ?? "") - Date.parse(b.at ?? ""))
  if (
    esperaPublicacion(asignacion.estado) &&
    asignacion.fechaLimitePublicacion
  ) {
    hechos.push({
      clave: "pendiente",
      titulo: "Publicar a más tardar",
      at: asignacion.fechaLimitePublicacion,
      tono: "neutro",
      pendiente: true,
    })
  }
  return hechos
}

// ── Cambios entre consultas ──────────────────────────────────────────────────

/** Huella de lo que el anunciante ve cambiar en una tarjeta. */
function huella(asignacion: AsignacionSeguimiento): string {
  return [
    asignacion.estado,
    ...asignacion.publicaciones.map(
      (p) => `${p.id}:${p.estadoValidacion}:${p.urlPost}:${p.cortes.length}`
    ),
  ].join("|")
}

export interface CambiosSeguimiento {
  /** Asignaciones que no estaban en la consulta anterior. */
  nuevas: string[]
  /** Asignaciones con otro estado, otra publicación u otro corte aprobado. */
  cambiadas: string[]
}

export function cambiosEntre(
  anterior: readonly AsignacionSeguimiento[],
  actual: readonly AsignacionSeguimiento[]
): CambiosSeguimiento {
  const previas = new Map(anterior.map((a) => [a.id, huella(a)]))
  const nuevas: string[] = []
  const cambiadas: string[] = []
  for (const asignacion of actual) {
    const previa = previas.get(asignacion.id)
    if (previa === undefined) nuevas.push(asignacion.id)
    else if (previa !== huella(asignacion)) cambiadas.push(asignacion.id)
  }
  return { nuevas, cambiadas }
}

/** Aviso para lectores de pantalla; vacío si nada cambió (no se anuncia ruido). */
export function anuncioCambios(cambios: CambiosSeguimiento): string {
  const partes = [
    cambios.nuevas.length > 0
      ? contar(cambios.nuevas.length, "medio nuevo", "medios nuevos")
      : null,
    cambios.cambiadas.length > 0
      ? contar(
          cambios.cambiadas.length,
          "asignación con novedades",
          "asignaciones con novedades"
        )
      : null,
  ].filter(Boolean)
  return partes.length > 0
    ? `Seguimiento actualizado: ${partes.join(" y ")}.`
    : ""
}

// ── Textos ───────────────────────────────────────────────────────────────────

const formatoHora = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  hour: "numeric",
  minute: "2-digit",
})

/** "3:45 p. m." (hora de Bogotá) de un instante ISO; "—" si no es legible. */
export function horaDe(instante: string): string {
  const fecha = new Date(instante)
  return Number.isNaN(fecha.getTime()) ? "—" : formatoHora.format(fecha)
}

/** "Publicación 2" solo si hay varias; si no, "Publicación". */
export function tituloPublicacion(
  publicacion: Pick<PublicacionSeguimiento, "numero">,
  total: number
): string {
  return total > 1 ? `Publicación ${publicacion.numero}` : "Publicación"
}

/** "instagram.com/p/Cx1…" sin el protocolo ni la barra final, para leerlo de un vistazo. */
export function urlLegible(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")
}
