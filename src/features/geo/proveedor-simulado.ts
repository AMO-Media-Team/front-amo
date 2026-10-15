/**
 * Proveedor simulado y determinista del explorador: mismas entradas, mismas
 * cifras. Sirve para desarrollar sin datos (AMO_GEO_MOCK=1, nunca en
 * producción: ver `proveedor-servidor.ts`), para las pruebas unitarias y
 * para interceptar la API en las pruebas E2E.
 *
 * Las cifras son coherentes entre niveles: el valor de un departamento es la
 * suma de sus municipios y Colombia en el mapa mundial es la suma de sus
 * departamentos. La población DANE guía la escala.
 */
import {
  listarDepartamentos,
  municipiosDeDepartamento,
  obtenerDepartamento,
  obtenerMunicipio,
  obtenerPais,
} from "@/lib/geo/catalogo"
import {
  diasEnRango,
  parsearFecha,
  periodoAnterior,
  rangoPersonalizado,
  serializarFecha,
} from "@/lib/fechas"
import type { Departamento, Municipio } from "@/lib/geo/tipos"

import { tasaPonderada } from "./agregacion"
import { azar, generador, puntosAlrededor } from "./azar"
import { DEFINICIONES_METRICAS, type MetricaGeo } from "./metricas"
import { CODIGO_COLOMBIA } from "./niveles"
import { cubetasSerie } from "./serie"
import { centrosSinPoligono } from "./sin-poligono"
import type {
  ConsultaDetalleGeo,
  ConsultaMapaGeo,
  FilaMetricaGeo,
  FilaTopZona,
  KpiZona,
  ProveedorMetricasGeo,
  PuntoGeo,
  RespuestaDetalleGeo,
  RespuestaMapaGeo,
  RespuestaPuntosGeo,
  SerieZona,
  TopZona,
} from "./tipos"

/** Reparte `total` entero según pesos, con el método del mayor residuo. */
function repartirEntero(total: number, pesos: readonly number[]): number[] {
  const sumaPesos = pesos.reduce((s, p) => s + p, 0)
  if (sumaPesos <= 0 || total <= 0) return pesos.map(() => 0)
  const exactos = pesos.map((p) => (p / sumaPesos) * total)
  const enteros = exactos.map(Math.floor)
  let resto = total - enteros.reduce((s, v) => s + v, 0)
  const porResiduo = exactos
    .map((valor, indice) => ({ indice, residuo: valor - Math.floor(valor) }))
    .sort((a, b) => b.residuo - a.residuo)
  for (const { indice } of porResiduo) {
    if (resto <= 0) break
    enteros[indice]++
    resto--
  }
  return enteros
}

// ── Periodo ──────────────────────────────────────────────────────────────────

interface Periodo {
  readonly desde: string
  readonly hasta: string
  readonly dias: number
}

function periodoDe(consulta: ConsultaMapaGeo): Periodo {
  const desde = parsearFecha(consulta.desde)
  const hasta = parsearFecha(consulta.hasta)
  const dias =
    desde && hasta ? diasEnRango(rangoPersonalizado(desde, hasta)) : 30
  return { desde: consulta.desde, hasta: consulta.hasta, dias }
}

/** Escala temporal: las fotos no cambian con el rango; los flujos sí (con ±12 % de ruido). */
function factorPeriodo(
  metrica: MetricaGeo,
  periodo: Periodo,
  zona: string
): number {
  if (DEFINICIONES_METRICAS[metrica].foto) return 1
  const ruido =
    0.88 +
    0.24 * azar(`periodo|${metrica}|${zona}|${periodo.desde}|${periodo.hasta}`)
  return (periodo.dias / 30) * ruido
}

// ── Departamentos (nivel nacional) ───────────────────────────────────────────

const MINIMO_TASAS = 20

/** Conteos y montos de 30 días por departamento, guiados por la población. */
function baseDepartamento(d: Departamento, metrica: MetricaGeo): number {
  const millones = d.poblacion / 1_000_000
  const r = azar(`base|${metrica}|${d.codigo}`)
  const medios = Math.round(20 * millones ** 0.85 * (0.6 + 0.8 * r))
  const asignaciones = Math.round(
    medios * (2.2 + 1.6 * azar(`asig|${d.codigo}`))
  )
  switch (metrica) {
    case "medios":
      return medios
    case "asignaciones":
      return asignaciones
    case "gmv":
      return Math.round((asignaciones * (380_000 + 260_000 * r)) / 1000) * 1000
    case "alcance":
      return Math.round(asignaciones * (9_000 + 22_000 * r))
    case "campanas":
      return Math.round(asignaciones ** 0.78 * (0.35 + 0.3 * r))
    case "anunciantes":
      return Math.round(1.6 * millones ** 1.35 * (0.5 + r))
    case "accesos":
      return Math.round((medios + 6 * millones ** 1.2) * (9 + 8 * r))
    case "cumplimiento":
    case "audiencia":
      return 0
  }
}

/** Pesos para repartir un departamento entre sus municipios: capital dominante, cola larga con ceros. */
function pesosMunicipales(
  municipios: readonly Municipio[],
  metrica: MetricaGeo
): number[] {
  return municipios.map((m) => {
    if (m.esCapital) return 6 + 4 * azar(`capital|${metrica}|${m.codigo}`)
    const r = azar(`peso|${metrica}|${m.codigo}`)
    // Los medios existen en ~65 % de municipios; el resto de métricas los sigue.
    const hayMedios = azar(`presencia|${m.codigo}`) > 0.35
    return hayMedios ? r ** 2.2 : 0
  })
}

interface ValorSimulado {
  readonly valor: number | null
  readonly n: number | null
}

function tasaSimulada(zona: string, n: number, semilla: string): ValorSimulado {
  const valor = 0.7 + 0.27 * azar(`cumpl|${semilla}|${zona}`)
  return {
    valor: n >= MINIMO_TASAS ? Math.round(valor * 1000) / 1000 : null,
    n,
  }
}

function valorDepartamento(
  d: Departamento,
  metrica: MetricaGeo,
  periodo: Periodo
): ValorSimulado {
  if (metrica === "cumplimiento") {
    const n = Math.round(
      baseDepartamento(d, "asignaciones") *
        0.8 *
        factorPeriodo("asignaciones", periodo, d.codigo)
    )
    return tasaSimulada(d.codigo, n, "dpto")
  }
  const valor = Math.round(
    baseDepartamento(d, metrica) * factorPeriodo(metrica, periodo, d.codigo)
  )
  return { valor, n: null }
}

function valoresMunicipales(
  d: Departamento,
  metrica: MetricaGeo,
  periodo: Periodo
): Map<string, ValorSimulado> {
  const municipios = municipiosDeDepartamento(d.codigo)
  const resultado = new Map<string, ValorSimulado>()

  if (metrica === "cumplimiento") {
    const { n } = valorDepartamento(d, "cumplimiento", periodo)
    const ns = repartirEntero(
      n ?? 0,
      pesosMunicipales(municipios, "asignaciones")
    )
    municipios.forEach((m, i) => {
      if (ns[i] > 0)
        resultado.set(m.codigo, tasaSimulada(m.codigo, ns[i], "mpio"))
    })
    return resultado
  }

  const total = valorDepartamento(d, metrica, periodo).valor ?? 0
  const pesos = pesosMunicipales(municipios, metrica)
  const valores =
    DEFINICIONES_METRICAS[metrica].unidad === "cop"
      ? repartirEntero(Math.round(total / 1000), pesos).map((v) => v * 1000)
      : repartirEntero(total, pesos)

  municipios.forEach((m, i) => {
    // Sin presencia: la mitad reporta cero y la otra mitad no tiene fila ("sin datos").
    if (pesos[i] === 0 && azar(`fila|${metrica}|${m.codigo}`) < 0.5) return
    resultado.set(m.codigo, { valor: valores[i], n: null })
  })
  return resultado
}

// ── Países (nivel internacional) ─────────────────────────────────────────────

/** Peso relativo de cada país por métrica (Colombia se calcula aparte). */
const PAISES_SIMULADOS: Readonly<
  Record<
    "accesos" | "audiencia" | "anunciantes",
    Readonly<Record<string, number>>
  >
> = {
  audiencia: {
    VE: 180_000,
    US: 240_000,
    MX: 95_000,
    ES: 120_000,
    EC: 70_000,
    PE: 55_000,
    PA: 40_000,
    AR: 30_000,
    CL: 28_000,
    BR: 20_000,
    CA: 18_000,
    GB: 12_000,
    DE: 9_000,
    FR: 8_000,
    IT: 7_000,
    CR: 9_000,
    DO: 11_000,
    GT: 5_000,
    AW: 6_000,
    CW: 4_500,
    SX: 1_200,
    BQ: 800,
    KY: 900,
    BB: 600,
    SG: 1_500,
    HK: 900,
    MT: 700,
    GP: 500,
    MQ: 400,
    AD: 300,
    LC: 350,
    AU: 6_500,
  },
  accesos: {
    US: 120,
    ES: 60,
    MX: 35,
    PA: 25,
    EC: 18,
    PE: 12,
    CL: 8,
    DE: 5,
    AW: 6,
    CW: 3,
    GB: 4,
    CA: 5,
    AR: 3,
    VE: 7,
  },
  anunciantes: {
    US: 8,
    MX: 5,
    ES: 4,
    PA: 3,
    PE: 2,
    EC: 2,
    CL: 2,
    AR: 1,
    BR: 1,
    CA: 1,
    DE: 1,
    GB: 1,
    KY: 1,
  },
}

function valoresPaises(
  metrica: "accesos" | "audiencia" | "anunciantes",
  periodo: Periodo
): Map<string, ValorSimulado> {
  const resultado = new Map<string, ValorSimulado>()
  const colombia =
    metrica === "audiencia"
      ? Math.round(3_200_000 * (0.9 + 0.2 * azar("audiencia|CO")))
      : listarDepartamentos().reduce(
          (suma, d) =>
            suma + (valorDepartamento(d, metrica, periodo).valor ?? 0),
          0
        )
  resultado.set(CODIGO_COLOMBIA, { valor: colombia, n: null })
  for (const [iso2, base] of Object.entries(PAISES_SIMULADOS[metrica])) {
    const factor = factorPeriodo(metrica, periodo, iso2)
    const variacion = 0.75 + 0.5 * azar(`pais|${metrica}|${iso2}`)
    resultado.set(iso2, {
      valor: Math.max(0, Math.round(base * variacion * factor)),
      n: null,
    })
  }
  return resultado
}

// ── Filas por nivel ──────────────────────────────────────────────────────────

interface ZonaSimulada {
  readonly codigo: string
  readonly codigoGeometria: string
  readonly nombre: string
  readonly poblacion: number | null
  readonly centro: readonly [number, number]
  readonly valor: ValorSimulado
}

function zonasDelNivel(consulta: ConsultaMapaGeo): ZonaSimulada[] {
  const periodo = periodoDe(consulta)
  const { metrica } = consulta

  switch (consulta.nivel) {
    case "internacional": {
      if (
        metrica !== "accesos" &&
        metrica !== "audiencia" &&
        metrica !== "anunciantes"
      ) {
        return []
      }
      return [...valoresPaises(metrica, periodo)].flatMap(([iso2, valor]) => {
        const pais = obtenerPais(iso2)
        return pais
          ? [
              {
                codigo: iso2,
                codigoGeometria: iso2,
                nombre: pais.nombre,
                poblacion: null,
                centro: pais.centroide,
                valor,
              },
            ]
          : []
      })
    }
    case "nacional":
      return listarDepartamentos().flatMap((d) => {
        const valor = valorDepartamento(d, metrica, periodo)
        // Accesos y anunciantes no existen en departamentos pequeños: sin fila.
        if (
          valor.valor === 0 &&
          (metrica === "accesos" || metrica === "anunciantes")
        ) {
          return []
        }
        return [
          {
            codigo: d.codigo,
            codigoGeometria: d.codigo,
            nombre: d.nombre,
            poblacion: d.poblacion,
            centro: d.centroide,
            valor,
          },
        ]
      })
    case "departamental": {
      const departamento = obtenerDepartamento(consulta.departamento ?? "")
      if (!departamento) return []
      return [...valoresMunicipales(departamento, metrica, periodo)].flatMap(
        ([codigo, valor]) => {
          const municipio = obtenerMunicipio(codigo)
          return municipio
            ? [
                {
                  codigo,
                  codigoGeometria: municipio.codigoGeometria,
                  nombre: municipio.nombre,
                  poblacion: null,
                  centro: municipio.centroide,
                  valor,
                },
              ]
            : []
        }
      )
    }
  }
}

function aFila(zona: ZonaSimulada, metrica: MetricaGeo): FilaMetricaGeo {
  const { valor, n } = zona.valor
  const aditiva = DEFINICIONES_METRICAS[metrica].aditiva
  return {
    codigo: zona.codigo,
    codigoGeometria: zona.codigoGeometria,
    nombre: zona.nombre,
    valor,
    n,
    poblacion: zona.poblacion,
    valorPor100k:
      aditiva && valor !== null && zona.poblacion
        ? Math.round((valor / zona.poblacion) * 100_000 * 100) / 100
        : null,
  }
}

// ── Puntos para el mapa de calor ─────────────────────────────────────────────

function puntosDeZonas(
  zonas: readonly ZonaSimulada[],
  metrica: MetricaGeo,
  radioGrados: number
): PuntoGeo[] {
  return zonas.flatMap((zona) =>
    puntosAlrededor(
      zona.centro,
      zona.valor.valor ?? 0,
      `${metrica}|${zona.codigo}`,
      radioGrados
    )
  )
}

/** Puntos a escala municipal: en nacional se recorren todos los departamentos. */
function puntosMunicipales(consulta: ConsultaMapaGeo): PuntoGeo[] {
  const departamentos =
    consulta.nivel === "departamental"
      ? [consulta.departamento ?? ""]
      : listarDepartamentos().map((d) => d.codigo)
  const radio = consulta.metrica === "medios" ? 0.05 : 0.025
  return departamentos.flatMap((codigo) =>
    puntosDeZonas(
      zonasDelNivel({
        ...consulta,
        nivel: "departamental",
        departamento: codigo,
      }),
      consulta.metrica,
      radio
    )
  )
}

function puntosSimulados(consulta: ConsultaMapaGeo): PuntoGeo[] {
  if (!DEFINICIONES_METRICAS[consulta.metrica].conPuntos) return []
  if (consulta.nivel !== "internacional") return puntosMunicipales(consulta)
  const extranjeros = zonasDelNivel(consulta).filter(
    (zona) => zona.codigo !== CODIGO_COLOMBIA
  )
  return [
    ...puntosDeZonas(extranjeros, consulta.metrica, 1.2),
    ...puntosMunicipales({ ...consulta, nivel: "nacional" }),
  ]
}

// ── Detalle de una zona ──────────────────────────────────────────────────────

function serieSimulada(
  consulta: ConsultaDetalleGeo,
  valor: number | null
): SerieZona | null {
  const plan = cubetasSerie(consulta.desde, consulta.hasta)
  if (valor === null || !plan || consulta.metrica === "audiencia") return null
  const { cubetas } = plan
  const aleatorio = generador(
    `serie|${consulta.metrica}|${consulta.zona}|${consulta.desde}|${consulta.hasta}`
  )
  const definicion = DEFINICIONES_METRICAS[consulta.metrica]

  let valores: (number | null)[]
  if (!definicion.aditiva) {
    // Algunas cubetas no alcanzan la muestra mínima.
    valores = cubetas.map(() =>
      aleatorio() < 0.15
        ? null
        : Math.min(1, Math.max(0, valor + (aleatorio() - 0.5) * 0.12))
    )
  } else if (definicion.foto) {
    // Stock que crece hasta el valor al cierre.
    valores = cubetas.map((_, i) =>
      Math.round(
        valor *
          (0.86 +
            (0.14 * (i + 1)) / cubetas.length +
            (aleatorio() - 0.5) * 0.015)
      )
    )
    valores[cubetas.length - 1] = valor
  } else {
    // Flujo: las cubetas parciales reciben menos; ruido de ±40 %.
    const pesos = cubetas.map(
      (cubeta) => (cubeta.parcial ? 0.45 : 1) * (0.6 + 0.8 * aleatorio())
    )
    valores = repartirEntero(Math.round(valor), pesos)
  }
  return {
    granularidad: plan.granularidad,
    puntos: cubetas.map((cubeta, i) => ({ ...cubeta, valor: valores[i] })),
  }
}

const PREFIJOS_MEDIO = [
  "Radio",
  "Noticias",
  "Estéreo",
  "Canal",
  "Diario",
  "La Voz de",
  "Onda",
  "Visión",
  "Contacto",
  "Enlace",
] as const
const SUFIJOS_MEDIO = [
  "Digital",
  "TV",
  "Al Día",
  "Informa",
  "Hoy",
  "Stereo",
] as const

function nombresMedios(
  lugar: string,
  semilla: string,
  cantidad: number
): string[] {
  const aleatorio = generador(`medios|${semilla}`)
  const corto = lugar.split(",")[0]
  const nombres = new Set<string>()
  while (nombres.size < cantidad) {
    const prefijo =
      PREFIJOS_MEDIO[Math.floor(aleatorio() * PREFIJOS_MEDIO.length)]
    const sufijo = SUFIJOS_MEDIO[Math.floor(aleatorio() * SUFIJOS_MEDIO.length)]
    nombres.add(
      aleatorio() < 0.5 ? `${prefijo} ${corto}` : `${corto} ${sufijo}`
    )
    if (nombres.size < cantidad && aleatorio() < 0.2) {
      nombres.add(`${prefijo} ${corto} ${sufijo}`)
    }
  }
  return [...nombres].slice(0, cantidad)
}

/** Municipio donde se ubica cada medio destacado (la capital pesa más). */
function lugaresDeMedios(
  consulta: ConsultaDetalleGeo,
  aleatorio: () => number,
  cantidad: number
): string[] {
  const departamentos =
    consulta.nivel === "nacional"
      ? [consulta.zona]
      : listarDepartamentos().map((d) => d.codigo)
  return Array.from({ length: cantidad }, () => {
    const codigo = departamentos[Math.floor(aleatorio() * departamentos.length)]
    const municipios = municipiosDeDepartamento(codigo)
    const capital = municipios.find((m) => m.esCapital)
    const elegido =
      capital && aleatorio() < 0.6
        ? capital
        : municipios[Math.floor(aleatorio() * municipios.length)]
    return elegido?.nombre ?? "Colombia"
  })
}

/** Medios con más GMV comprometido en la zona (como la sección `medio` de `detalle_zona_geo`). */
function mediosSimulados(consulta: ConsultaDetalleGeo): TopZona | null {
  const lugar =
    consulta.nivel === "departamental"
      ? obtenerMunicipio(consulta.zona)?.nombre
      : consulta.nivel === "nacional"
        ? obtenerDepartamento(consulta.zona)?.nombre
        : consulta.zona === CODIGO_COLOMBIA
          ? "Colombia"
          : undefined
  if (!consulta.conMedios || !lugar) return null
  const colombia = consulta.nivel === "internacional"
  const gmvZona = colombia
    ? listarDepartamentos().reduce(
        (suma, d) =>
          suma + (valorDepartamento(d, "gmv", periodoDe(consulta)).valor ?? 0),
        0
      )
    : (valorDeZona({ ...consulta, metrica: "gmv" }, consulta.zona).valor ?? 0)
  if (gmvZona <= 0) return null

  const semilla = `${consulta.nivel}|${consulta.zona}|${consulta.desde}|${consulta.hasta}`
  const aleatorio = generador(`medios-gmv|${semilla}`)
  const nombres = nombresMedios(lugar, semilla, 5)
  // Los cinco primeros concentran una parte del GMV de la zona.
  const concentrado = Math.round((gmvZona * (colombia ? 0.04 : 0.3)) / 1000)
  const gmv = repartirEntero(
    concentrado,
    nombres.map((_, i) => 1 / (i + 1.4))
  ).map((miles) => miles * 1000)
  const lugares = lugaresDeMedios(consulta, aleatorio, nombres.length)
  return {
    titulo: "Medios con más GMV",
    descripcion:
      "GMV comprometido por sus asignaciones aceptadas en el periodo.",
    metrica: "gmv",
    filas: nombres.map((nombre, i) => {
      const asignaciones = Math.max(
        1,
        Math.round(gmv[i] / (380_000 + 260_000 * aleatorio()))
      )
      return {
        codigo: null,
        nombre,
        valor: gmv[i],
        detalle:
          consulta.nivel === "departamental"
            ? `${asignaciones} ${asignaciones === 1 ? "asignación" : "asignaciones"}`
            : lugares[i],
      }
    }),
  }
}

function topSubzonas(
  consulta: ConsultaMapaGeo,
  titulo: string
): TopZona | null {
  const aditiva = DEFINICIONES_METRICAS[consulta.metrica].aditiva
  const filas = zonasDelNivel(consulta)
    .filter(
      (z) => z.valor.valor !== null && (aditiva ? z.valor.valor > 0 : true)
    )
    .sort((a, b) => (b.valor.valor ?? 0) - (a.valor.valor ?? 0))
    .slice(0, 5)
    .map((z): FilaTopZona => ({
      codigo: z.codigo,
      nombre: z.nombre,
      valor: z.valor.valor,
      detalle: aditiva ? null : `n = ${z.valor.n ?? 0}`,
    }))
  return filas.length ? { titulo, metrica: consulta.metrica, filas } : null
}

function titulo(prefijo: string, metrica: MetricaGeo): string {
  return DEFINICIONES_METRICAS[metrica].aditiva
    ? `${prefijo} con más ${DEFINICIONES_METRICAS[metrica].tituloCorto.toLowerCase()}`
    : `${prefijo} con mayor ${DEFINICIONES_METRICAS[metrica].tituloCorto.toLowerCase()}`
}

function topSimulado(consulta: ConsultaDetalleGeo): TopZona | null {
  if (consulta.nivel === "internacional") {
    return consulta.zona === CODIGO_COLOMBIA && consulta.metrica !== "audiencia"
      ? topSubzonas(
          { ...consulta, nivel: "nacional" },
          titulo("Departamentos", consulta.metrica)
        )
      : null
  }
  if (consulta.nivel === "nacional") {
    return topSubzonas(
      { ...consulta, nivel: "departamental", departamento: consulta.zona },
      titulo("Municipios", consulta.metrica)
    )
  }
  return null
}

function valorDeZona(consulta: ConsultaMapaGeo, zona: string) {
  const zonas = zonasDelNivel(consulta).filter((z) => z.codigo === zona)
  if (zonas.length === 0) return { valor: null, n: null }
  return DEFINICIONES_METRICAS[consulta.metrica].aditiva
    ? { valor: zonas[0].valor.valor, n: zonas[0].valor.n }
    : { valor: tasaPonderada(zonas.map((z) => z.valor)), n: zonas[0].valor.n }
}

/** La misma consulta en el periodo anterior de igual duración. */
function consultaAnterior(consulta: ConsultaMapaGeo): ConsultaMapaGeo | null {
  const desde = parsearFecha(consulta.desde)
  const hasta = parsearFecha(consulta.hasta)
  if (!desde || !hasta) return null
  const anterior = periodoAnterior(rangoPersonalizado(desde, hasta))
  return {
    ...consulta,
    desde: serializarFecha(anterior.desde),
    hasta: serializarFecha(anterior.hasta),
  }
}

/** KPI con su comparativo: los flujos varían con el periodo; las fotos crecen despacio. */
function kpiSimulado(
  consulta: ConsultaDetalleGeo,
  metrica: MetricaGeo
): KpiZona {
  const actual = valorDeZona({ ...consulta, metrica }, consulta.zona)
  const previa = consultaAnterior({ ...consulta, metrica })
  let anterior: number | null = null
  if (metrica !== "audiencia" && actual.valor !== null && previa) {
    anterior = DEFINICIONES_METRICAS[metrica].foto
      ? Math.round(
          actual.valor *
            (0.9 + 0.08 * azar(`anterior|${metrica}|${consulta.zona}`))
        )
      : valorDeZona(previa, consulta.zona).valor
  }
  return {
    metrica,
    ...actual,
    anterior,
    variacion:
      actual.valor === null || !anterior
        ? null
        : (actual.valor - anterior) / anterior,
  }
}

// ── Proveedor ────────────────────────────────────────────────────────────────

/** Latencia artificial opcional para ver estados de carga en desarrollo. */
export interface OpcionesProveedorSimulado {
  readonly latenciaMs?: number
}

const esperar = (ms: number) =>
  ms > 0
    ? new Promise<void>((resolver) => setTimeout(resolver, ms))
    : Promise.resolve()

export function crearProveedorSimulado({
  latenciaMs = 0,
}: OpcionesProveedorSimulado = {}): ProveedorMetricasGeo {
  return {
    async mapa(consulta): Promise<RespuestaMapaGeo> {
      await esperar(latenciaMs)
      const filas = zonasDelNivel(consulta).map((z) =>
        aFila(z, consulta.metrica)
      )
      return {
        consulta,
        filas,
        sinPoligono: centrosSinPoligono(consulta.nivel, filas),
        origen: "simulado",
      }
    },

    async puntos(consulta): Promise<RespuestaPuntosGeo> {
      await esperar(latenciaMs)
      const puntos = puntosSimulados(consulta)
      const total = Math.round(
        puntos.reduce((suma, [, , peso]) => suma + peso, 0)
      )
      return {
        consulta,
        puntos,
        total,
        muestra: total,
        pasoGrados: 0.01,
        origen: "simulado",
      }
    },

    async detalle(consulta): Promise<RespuestaDetalleGeo> {
      await esperar(latenciaMs)
      const kpis = consulta.metricasKpi.map((metrica) =>
        kpiSimulado(consulta, metrica)
      )
      const actual =
        kpis.find((k) => k.metrica === consulta.metrica)?.valor ?? null
      const serie = serieSimulada(consulta, actual)
      return {
        consulta,
        kpis,
        serie,
        sinSerie: serie
          ? null
          : consulta.metrica === "audiencia"
            ? "foto-actual"
            : "sin-datos",
        top: topSimulado(consulta),
        medios: mediosSimulados(consulta),
        origen: "simulado",
      }
    },
  }
}
