import "server-only"

import { formatearNumero } from "@/lib/format"
import { municipiosRepresentadosPor } from "@/lib/geo/catalogo"

import { agruparPorGeometria, tasaPonderada } from "./agregacion"
import { crearLimitador, type Limitador } from "./concurrencia"
import {
  DEFINICIONES_METRICAS,
  type MetricaGeo,
  metricaDisponibleEn,
  NIVEL_RPC,
} from "./metricas"
import { CODIGO_COLOMBIA } from "./niveles"
import {
  type ClienteGeo,
  type ConsultaRpcGeo,
  geoMetricas,
  numeroONulo,
  traducirError,
} from "./rpc-geo"
import { type CubetaSerie, cubetasSerie } from "./serie"
import type {
  ConsultaDetalleGeo,
  FilaMetricaGeo,
  KpiZona,
  MotivoSinSerie,
  PuntoSerieZona,
  RespuestaDetalleGeo,
  SerieZona,
  TopZona,
} from "./tipos"

/**
 * Detalle de una zona, en una sola solicitud del cliente. La RPC
 * `detalle_zona_geo` (docs/modelo-datos.md §5.9) trae en UNA llamada los KPI
 * de todas las métricas del nivel con su comparativo, la evolución mensual y
 * los medios con más GMV. Aquí solo se añade lo que la RPC no cubre:
 *
 * - la evolución diaria o semanal de la métrica activa en periodos cortos
 *   (uno o dos meses no dan una serie mensual): una lectura de `geo_metricas`
 *   por cubeta, como máximo 15 (`CUBETAS_MAXIMAS_SERIE_FINA`);
 * - las subzonas destacadas: una lectura del nivel inferior.
 *
 * Todo con el cliente del usuario (RPC `security invoker`, RLS) y con un tope
 * de lecturas en vuelo.
 */

/** Lecturas simultáneas a PostgREST por detalle. */
const LECTURAS_EN_VUELO = 8
const TOP = 5

type Lectura<T> = () => Promise<T>

/** Ejecuta un grupo de lecturas con el limitador compartido. */
function leer<T>(limitar: Limitador, lecturas: readonly Lectura<T>[]) {
  return Promise.allSettled(lecturas.map((lectura) => limitar(lectura)))
}

// ── RPC detalle_zona_geo ─────────────────────────────────────────────────────

/**
 * Fila de la RPC. Tres secciones: `kpi` (clave = métrica), `serie` (clave =
 * métrica, `periodo` = primer día del mes) y `medio` (clave = id del medio,
 * `valor` = GMV, `n` = asignaciones, `detalle` = municipio). Los tipos
 * generados declaran las columnas no nulas; en la práctica llegan `null`.
 */
interface FilaDetalleRpc {
  seccion: string
  clave: string
  nombre: string | null
  detalle: string | null
  periodo: string | null
  valor: unknown
  n: unknown
  valor_anterior: unknown
  variacion: unknown
}

/**
 * Códigos que la RPC debe leer. La zona es un POLÍGONO: en un departamento
 * puede dibujar a más de un municipio (el de Río Viejo representa también a
 * Norosí); se lee cada uno y se funden con la regla del mapa.
 */
function codigosDeZona(consulta: ConsultaDetalleGeo): string[] {
  if (consulta.nivel !== "departamental") return [consulta.zona]
  const codigos = municipiosRepresentadosPor(consulta.zona).map(
    ({ codigo }) => codigo
  )
  return codigos.length > 0 ? codigos : [consulta.zona]
}

async function leerDetalle(
  supabase: ClienteGeo,
  consulta: ConsultaDetalleGeo,
  codigo: string
): Promise<FilaDetalleRpc[]> {
  const { data, error } = await supabase.rpc("detalle_zona_geo", {
    p_nivel: NIVEL_RPC[consulta.nivel],
    p_codigo: codigo,
    p_desde: consulta.desde,
    p_hasta: consulta.hasta,
  })
  if (error) throw traducirError(error)
  return (data ?? []) as FilaDetalleRpc[]
}

interface Medida {
  readonly valor: number | null
  readonly n: number | null
}

const SIN_MEDIDA: Medida = { valor: null, n: null }

const medidaDe = (fila: FilaDetalleRpc): Medida => ({
  valor: numeroONulo(fila.valor),
  n: numeroONulo(fila.n),
})

function sumar(valores: readonly (number | null)[]): number | null {
  const presentes = valores.filter((valor): valor is number => valor !== null)
  return presentes.length > 0
    ? presentes.reduce((suma, valor) => suma + valor, 0)
    : null
}

/** Una medida a partir de las de cada municipio del polígono: suma, o tasa ponderada por `n`. */
function fundir(medidas: readonly Medida[], aditiva: boolean): Medida {
  if (medidas.length <= 1) return medidas[0] ?? SIN_MEDIDA
  return {
    valor: aditiva
      ? sumar(medidas.map((m) => m.valor))
      : tasaPonderada(medidas),
    n: sumar(medidas.map((m) => m.n)),
  }
}

// ── KPI ──────────────────────────────────────────────────────────────────────

function variacionDe(
  valor: number | null,
  anterior: number | null
): number | null {
  return valor === null || !anterior ? null : (valor - anterior) / anterior
}

function kpiDe(metrica: MetricaGeo, filas: readonly FilaDetalleRpc[]): KpiZona {
  const propias = filas.filter(
    (fila) => fila.seccion === "kpi" && fila.clave === metrica
  )
  const { aditiva } = DEFINICIONES_METRICAS[metrica]
  const actual = fundir(propias.map(medidaDe), aditiva)
  if (propias.length === 1) {
    return {
      metrica,
      ...actual,
      anterior: numeroONulo(propias[0].valor_anterior),
      variacion: numeroONulo(propias[0].variacion),
    }
  }
  // Polígono compartido: el comparativo solo se puede fundir si la métrica se
  // suma (la tasa anterior llega sin su `n`).
  const anterior = aditiva
    ? sumar(propias.map((fila) => numeroONulo(fila.valor_anterior)))
    : null
  return {
    metrica,
    ...actual,
    anterior,
    variacion: variacionDe(actual.valor, anterior),
  }
}

// ── Serie ────────────────────────────────────────────────────────────────────

/** Fotos actuales sin ancla temporal: su valor no cambia con el periodo. */
const SIN_EVOLUCION: ReadonlySet<MetricaGeo> = new Set(["audiencia"])

function planSerie(consulta: ConsultaDetalleGeo) {
  return SIN_EVOLUCION.has(consulta.metrica)
    ? null
    : cubetasSerie(consulta.desde, consulta.hasta)
}

/** Una cubeta sin fila no tuvo movimiento (0) o, en una tasa, no tiene muestra. */
function valorSinFila(metrica: MetricaGeo): number | null {
  return DEFINICIONES_METRICAS[metrica].aditiva ? 0 : null
}

/** Evolución mensual: viene en la RPC, un punto por mes recortado al periodo. */
function puntosMensuales(
  consulta: ConsultaDetalleGeo,
  cubetas: readonly CubetaSerie[],
  filas: readonly FilaDetalleRpc[]
): PuntoSerieZona[] {
  const porMes = new Map<string, Medida[]>()
  for (const fila of filas) {
    if (
      fila.seccion !== "serie" ||
      fila.clave !== consulta.metrica ||
      !fila.periodo
    )
      continue
    const mes = fila.periodo.slice(0, 7)
    porMes.set(mes, [...(porMes.get(mes) ?? []), medidaDe(fila)])
  }
  const { aditiva } = DEFINICIONES_METRICAS[consulta.metrica]
  return cubetas.map((cubeta) => ({
    ...cubeta,
    valor:
      fundir(porMes.get(cubeta.desde.slice(0, 7)) ?? [], aditiva).valor ??
      valorSinFila(consulta.metrica),
  }))
}

/**
 * Consulta a `geo_metricas` que trae la zona con el menor trabajo posible: un
 * departamento se pide filtrado (una fila); municipios y países, con su nivel.
 */
function ambitoDeZona(
  consulta: ConsultaDetalleGeo
): Omit<ConsultaRpcGeo, "desde" | "hasta"> {
  const { nivel, metrica } = consulta
  return {
    nivel,
    metrica,
    departamento: nivel === "nacional" ? consulta.zona : consulta.departamento,
  }
}

/** Evolución diaria o semanal: una lectura de `geo_metricas` por cubeta. */
function lecturasSerieFina(
  supabase: ClienteGeo,
  consulta: ConsultaDetalleGeo,
  cubetas: readonly CubetaSerie[]
): Lectura<FilaMetricaGeo[]>[] {
  const ambito = ambitoDeZona(consulta)
  return cubetas.map(
    ({ desde, hasta }) =>
      () =>
        geoMetricas(supabase, { ...ambito, desde, hasta })
  )
}

/** Valor del polígono en una lectura de `geo_metricas` (funde a sus municipios). */
function valorDeZona(
  filas: readonly FilaMetricaGeo[],
  consulta: ConsultaDetalleGeo
): number | null {
  const [fundida] = agruparPorGeometria(
    filas.filter((fila) => fila.codigoGeometria === consulta.zona),
    { aditiva: DEFINICIONES_METRICAS[consulta.metrica].aditiva, por100k: false }
  )
  return fundida?.valor ?? null
}

function serieDe(
  consulta: ConsultaDetalleGeo,
  filas: readonly FilaDetalleRpc[],
  finas: readonly PromiseSettledResult<FilaMetricaGeo[]>[]
): { serie: SerieZona | null; sinSerie: MotivoSinSerie | null } {
  const plan = planSerie(consulta)
  if (!plan) return { serie: null, sinSerie: "foto-actual" }

  let puntos: PuntoSerieZona[]
  if (plan.granularidad === "mes") {
    puntos = puntosMensuales(consulta, plan.cubetas, filas)
  } else {
    // La evolución es complementaria: su fallo no tumba el detalle.
    if (finas.some((lectura) => lectura.status === "rejected")) {
      return { serie: null, sinSerie: "fallo" }
    }
    puntos = plan.cubetas.map((cubeta, indice) => {
      const lectura = finas[indice]
      const valor =
        lectura?.status === "fulfilled"
          ? valorDeZona(lectura.value, consulta)
          : null
      return { ...cubeta, valor: valor ?? valorSinFila(consulta.metrica) }
    })
  }
  const conValor = puntos.some(
    (punto) => punto.valor !== null && punto.valor !== 0
  )
  return conValor
    ? { serie: { granularidad: plan.granularidad, puntos }, sinSerie: null }
    : { serie: null, sinSerie: "sin-datos" }
}

// ── Subzonas destacadas ──────────────────────────────────────────────────────

function subconsulta(consulta: ConsultaDetalleGeo): ConsultaRpcGeo | null {
  const base = {
    metrica: consulta.metrica,
    desde: consulta.desde,
    hasta: consulta.hasta,
  }
  if (consulta.nivel === "nacional") {
    return { ...base, nivel: "departamental", departamento: consulta.zona }
  }
  if (consulta.nivel === "internacional" && consulta.zona === CODIGO_COLOMBIA) {
    return { ...base, nivel: "nacional", departamento: null }
  }
  return null
}

function lecturasTop(
  supabase: ClienteGeo,
  consulta: ConsultaDetalleGeo
): Lectura<FilaMetricaGeo[]>[] {
  const sub = subconsulta(consulta)
  if (!sub || !metricaDisponibleEn(consulta.metrica, sub.nivel)) return []
  return [() => geoMetricas(supabase, sub)]
}

function tituloTop(prefijo: string, metrica: MetricaGeo): string {
  const { aditiva, tituloCorto } = DEFINICIONES_METRICAS[metrica]
  return `${prefijo} con ${aditiva ? "más" : "mayor"} ${tituloCorto.toLowerCase()}`
}

function topDe(
  consulta: ConsultaDetalleGeo,
  resultados: readonly PromiseSettledResult<FilaMetricaGeo[]>[]
): TopZona | null {
  const sub = subconsulta(consulta)
  const resultado = resultados[0]
  // El top es complementario: su fallo no tumba el detalle.
  if (!sub || resultado?.status !== "fulfilled") return null
  const { aditiva } = DEFINICIONES_METRICAS[consulta.metrica]
  const filas = resultado.value
    .filter((fila) => fila.valor !== null && (!aditiva || fila.valor > 0))
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
    .slice(0, TOP)
  if (filas.length === 0) return null
  return {
    titulo: tituloTop(
      sub.nivel === "nacional" ? "Departamentos" : "Municipios",
      consulta.metrica
    ),
    metrica: consulta.metrica,
    filas: filas.map((fila) => ({
      codigo: fila.codigo,
      nombre: fila.nombre,
      valor: fila.valor,
      detalle: aditiva ? null : `n = ${formatearNumero(fila.n ?? 0)}`,
    })),
  }
}

// ── Medios destacados ────────────────────────────────────────────────────────

/**
 * Contexto de un medio: en un municipio, cuántas asignaciones suman su GMV;
 * en un departamento o en el país, su municipio (la RPC lo trae como
 * "Municipio (Departamento)").
 */
function contextoMedio(
  consulta: ConsultaDetalleGeo,
  lugar: string | null,
  asignaciones: number
): string | null {
  if (consulta.nivel === "departamental") {
    return `${formatearNumero(asignaciones)} ${asignaciones === 1 ? "asignación" : "asignaciones"}`
  }
  return lugar?.replace(/\s*\([^)]*\)$/, "") || null
}

function mediosDe(
  consulta: ConsultaDetalleGeo,
  filas: readonly FilaDetalleRpc[]
): TopZona | null {
  const medios = filas
    .filter((fila) => fila.seccion === "medio")
    .map((fila) => ({
      id: fila.clave,
      nombre: fila.nombre ?? "Medio sin nombre",
      lugar: fila.detalle,
      gmv: numeroONulo(fila.valor) ?? 0,
      asignaciones: numeroONulo(fila.n) ?? 0,
    }))
    // Con un polígono compartido llegan los cinco primeros de cada municipio.
    .sort((a, b) => b.gmv - a.gmv || b.asignaciones - a.asignaciones)
    .slice(0, TOP)
  if (medios.length === 0) return null
  return {
    titulo: "Medios con más GMV",
    descripcion:
      "GMV comprometido por sus asignaciones aceptadas en el periodo.",
    metrica: "gmv",
    filas: medios.map((medio) => ({
      codigo: medio.id,
      nombre: medio.nombre,
      valor: medio.gmv,
      detalle: contextoMedio(consulta, medio.lugar, medio.asignaciones),
    })),
  }
}

// ── Composición ──────────────────────────────────────────────────────────────

export async function componerDetalle(
  supabase: ClienteGeo,
  consulta: ConsultaDetalleGeo
): Promise<RespuestaDetalleGeo> {
  const limitar = crearLimitador(LECTURAS_EN_VUELO)
  const plan = planSerie(consulta)
  const cubetasFinas = plan && plan.granularidad !== "mes" ? plan.cubetas : []
  // Un fallo de la RPC (permiso, zona inexistente) es el error del detalle.
  const [detalle, finas, top] = await Promise.all([
    Promise.all(
      codigosDeZona(consulta).map((codigo) =>
        limitar(() => leerDetalle(supabase, consulta, codigo))
      )
    ),
    leer(limitar, lecturasSerieFina(supabase, consulta, cubetasFinas)),
    leer(limitar, lecturasTop(supabase, consulta)),
  ])
  const filas = detalle.flat()
  return {
    consulta,
    kpis: consulta.metricasKpi.map((metrica) => kpiDe(metrica, filas)),
    ...serieDe(consulta, filas, finas),
    top: topDe(consulta, top),
    medios: consulta.conMedios ? mediosDe(consulta, filas) : null,
    origen: "base-de-datos",
  }
}
