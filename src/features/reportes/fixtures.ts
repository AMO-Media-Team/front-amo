/**
 * Conjuntos de datos de ejemplo de los siete reportes para las pruebas (no se
 * usan en la aplicación): cifras deterministas con la forma exacta que
 * entregan las consultas, ya normalizadas. `datosEjemplo` trae un mes con
 * actividad; `datosVacios`, el mismo periodo sin un solo movimiento.
 */
import type { FilaKpi } from "@/components/kpi/tipos"
import { CLAVES_KPIS_ADMIN } from "@/components/kpi/definiciones-kpi"
import { CONFIG_INSIGHTS_POR_DEFECTO } from "@/features/dashboard/insights/tipos"
import { listarDepartamentosCliente } from "@/features/geo/departamentos"

import { REPORTES, type SlugReporte } from "./catalogo"
import { totalesCartera } from "./definiciones/cartera"
import { totalesCobertura } from "./definiciones/cobertura-territorial"
import { totalesCumplimiento } from "./definiciones/cumplimiento-medios"
import { totalesDesempeno } from "./definiciones/desempeno-campanas"
import { totalesFinanzas } from "./definiciones/finanzas"
import { totalesAccesos } from "./definiciones/usuarios-accesos"
import {
  contextoDatos,
  type FiltrosReporte,
  filtrosDesdeValores,
  type NombresFiltros,
  type ValoresFiltros,
} from "./filtros"
import type {
  ContextoDatos,
  DatosCartera,
  DatosCobertura,
  DatosCumplimiento,
  DatosDesempeno,
  DatosFinanzas,
  DatosPorReporte,
  DatosResumen,
  DatosUsuariosAccesos,
  FilaCampana,
  FilaCartera,
  FilaCobertura,
  FilaCumplimiento,
  FilaFinanzas,
  FilaMezcla,
  FilaPlataforma,
  FilaUsuarioAcceso,
  FilaZona,
  PuntoSerieGmv,
} from "./tipos"

/** 5 de octubre de 2026, 11:00 a. m. en Bogotá. */
export const AHORA_EJEMPLO = new Date("2026-10-05T16:00:00Z")
export const N_MINIMO_EJEMPLO = 20

const VALORES_BASE: ValoresFiltros = {
  periodo: "mesAnterior",
  desde: null,
  hasta: null,
  departamento: null,
  anunciante: null,
  sector: null,
  agrupacion: "anunciante",
  corte: null,
}

/** Filtros resueltos: septiembre de 2026 frente a agosto, salvo que se indique otra cosa. */
export function filtrosEjemplo(
  parcial: Partial<ValoresFiltros> = {}
): FiltrosReporte {
  return filtrosDesdeValores({ ...VALORES_BASE, ...parcial }, AHORA_EJEMPLO)
}

export function contextoEjemplo(
  slug: SlugReporte,
  filtros: FiltrosReporte = filtrosEjemplo(),
  nombres: NombresFiltros = {}
): ContextoDatos {
  return contextoDatos(REPORTES[slug], filtros, N_MINIMO_EJEMPLO, nombres)
}

/** Generador determinista (LCG) en [0, 1): las pruebas no dependen del azar. */
function generador(semilla: number): () => number {
  let estado = semilla >>> 0
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0
    return estado / 2 ** 32
  }
}

const redondear = (valor: number, multiplo: number) =>
  Math.round(valor / multiplo) * multiplo

function dia(inicio: string, desplazamiento: number): string {
  const fecha = new Date(`${inicio}T12:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento)
  return fecha.toISOString().slice(0, 10)
}

// ── Resumen ejecutivo ────────────────────────────────────────────────────────

type KpiEjemplo = readonly [
  clave: (typeof CLAVES_KPIS_ADMIN)[number],
  valor: number,
  anterior: number,
  unidad: string,
  n: number,
]

const KPIS: readonly KpiEjemplo[] = [
  ["gmv_comprometido", 412_600_000, 371_900_000, "COP", 742],
  ["gmv_verificado", 356_800_000, 318_200_000, "COP", 655],
  ["comision", 69_930_000, 63_640_000, "COP", 655],
  ["take_rate", 0.196, 0.2, "%", 655],
  ["negocios_cerrados", 655, 601, "conteo", 655],
  ["ofertas_publicadas", 96, 88, "conteo", 96],
  ["tasa_llenado", 0.78, 0.74, "%", 90],
  ["tiempo_medio_llenado_h", 31.4, 36.9, "h", 61],
  ["tasa_aceptacion", 0.41, 0.44, "%", 1810],
  ["tasa_cumplimiento", 0.912, 0.934, "%", 702],
  ["alcance_total", 9_840_000, 8_910_000, "personas", 655],
  ["medios_activos", 214, 201, "conteo", 214],
  ["medios_nuevos", 18, 12, "conteo", 18],
  ["medios_en_riesgo", 23, 19, "conteo", 23],
  ["anunciantes_activos", 31, 29, "conteo", 31],
  ["ticket_promedio", 13_309_677, 12_824_137, "COP", 31],
]

function serieKpi(valor: number, semilla: number): number[] {
  const azar = generador(semilla)
  return Array.from({ length: 30 }, (_, i) =>
    Math.max(0, (valor / 30) * (0.7 + azar() * 0.5 + i * 0.006))
  )
}

export function kpisEjemplo(): FilaKpi[] {
  return KPIS.map(([kpi, valor, anterior, unidad, n], indice) => ({
    kpi,
    valor,
    valor_anterior: anterior,
    variacion: (valor - anterior) / anterior,
    n,
    n_anterior: Math.round(n * 0.92),
    unidad,
    serie: kpi === "medios_en_riesgo" ? null : serieKpi(valor, indice + 1),
  }))
}

function serieGmv(
  inicio: string,
  dias: number,
  total: number,
  semilla: number
): PuntoSerieGmv[] {
  const azar = generador(semilla)
  const pesos = Array.from({ length: dias }, (_, i) => {
    // Menos movimiento el fin de semana, como en la operación real.
    const finDeSemana =
      new Date(`${dia(inicio, i)}T12:00:00Z`).getUTCDay() % 6 === 0
    return (finDeSemana ? 0.45 : 1) * (0.75 + azar() * 0.5)
  })
  const suma = pesos.reduce((a, b) => a + b, 0)
  return pesos.map((peso, i) => {
    const verificado = redondear((total * peso) / suma, 10_000)
    return {
      periodo: dia(inicio, i),
      gmvComprometido: redondear(verificado * 1.16, 10_000),
      gmvVerificado: verificado,
      comision: redondear(verificado * 0.196, 1_000),
      negocios: Math.max(1, Math.round(verificado / 545_000)),
    }
  })
}

const MEZCLA: readonly FilaMezcla[] = [
  {
    plataforma: "INSTAGRAM",
    formatoClave: "reel",
    formatoNombre: "Reel",
    asignaciones: 212,
    gmv: 131_400_000,
    alcance: 3_920_000,
    participacion: 0.368,
    cpm: 14_200,
  },
  {
    plataforma: "INSTAGRAM",
    formatoClave: "historia",
    formatoNombre: "Historia",
    asignaciones: 148,
    gmv: 52_300_000,
    alcance: 1_260_000,
    participacion: 0.147,
    cpm: 21_800,
  },
  {
    plataforma: "FACEBOOK",
    formatoClave: "publicacion",
    formatoNombre: "Publicación",
    asignaciones: 161,
    gmv: 88_700_000,
    alcance: 2_480_000,
    participacion: 0.249,
    cpm: 19_600,
  },
  {
    plataforma: "FACEBOOK",
    formatoClave: "video",
    formatoNombre: "Video",
    asignaciones: 58,
    gmv: 34_900_000,
    alcance: 890_000,
    participacion: 0.098,
    cpm: 22_400,
  },
  {
    plataforma: "TIKTOK",
    formatoClave: "video",
    formatoNombre: "Video",
    asignaciones: 76,
    gmv: 49_500_000,
    alcance: 1_290_000,
    participacion: 0.139,
    cpm: 17_300,
  },
]

const ZONAS_GMV: readonly (readonly [string, string, number, number])[] = [
  ["05", "Antioquia", 96_400_000, 71_800_000],
  ["11", "Bogotá, D.C.", 84_900_000, 82_300_000],
  ["76", "Valle del Cauca", 58_200_000, 55_100_000],
  ["08", "Atlántico", 41_700_000, 38_900_000],
  ["68", "Santander", 33_500_000, 36_200_000],
  ["25", "Cundinamarca", 27_800_000, 24_100_000],
  ["13", "Bolívar", 22_300_000, 19_800_000],
  ["66", "Risaralda", 17_900_000, 16_400_000],
  ["17", "Caldas", 15_200_000, 15_900_000],
  ["54", "Norte de Santander", 14_700_000, 11_400_000],
]

function zonas(
  filas: readonly (readonly [string, string, number, number])[],
  total: number
): FilaZona[] {
  return filas.map(([codigo, nombre, valor, anterior]) => ({
    codigo,
    nombre,
    valor,
    valorAnterior: anterior,
    participacion: valor / total,
    variacion: (valor - anterior) / anterior,
  }))
}

export function datosResumenEjemplo(): DatosResumen {
  return {
    contexto: contextoEjemplo("resumen-ejecutivo"),
    config: CONFIG_INSIGHTS_POR_DEFECTO,
    kpis: kpisEjemplo(),
    granularidad: "dia",
    serie: serieGmv("2026-09-01", 30, 356_800_000, 11),
    serieAnterior: serieGmv("2026-08-01", 31, 318_200_000, 12),
    mezcla: [...MEZCLA],
    zonas: zonas(ZONAS_GMV, 412_600_000),
  }
}

// ── Cobertura territorial ────────────────────────────────────────────────────

/** Departamentos con más peso en el ejemplo (el resto recibe valores pequeños). */
const PESO_DEPARTAMENTO: Readonly<Record<string, number>> = {
  "05": 46,
  "11": 52,
  "76": 31,
  "08": 22,
  "68": 18,
  "25": 14,
  "13": 12,
  "66": 9,
  "17": 8,
  "54": 8,
  "73": 7,
  "41": 6,
  "15": 6,
  "52": 5,
  "23": 5,
}

/** Territorios sin medios en el ejemplo (cobertura incompleta). */
const SIN_MEDIOS = new Set(["94", "97", "99", "91", "95"])

function filaCobertura(
  codigo: string,
  nombre: string,
  azar: () => number
): FilaCobertura {
  const medios = SIN_MEDIOS.has(codigo)
    ? 0
    : (PESO_DEPARTAMENTO[codigo] ?? 1 + Math.floor(azar() * 4))
  const activos = Math.round(medios * (0.45 + azar() * 0.4))
  const poblacion = redondear(
    180_000 + medios * 150_000 * (0.7 + azar() * 0.6),
    1_000
  )
  const gmv = redondear(activos * 1_850_000 * (0.8 + azar() * 0.5), 10_000)
  return {
    codigo,
    departamentoCodigo: codigo,
    departamento: nombre,
    municipio: null,
    poblacion,
    medios,
    mediosActivos: activos,
    mediosPor100k: medios === 0 ? 0 : (medios / poblacion) * 100_000,
    asignaciones: Math.round(activos * (2.4 + azar() * 1.6)),
    gmv,
    alcance: redondear(gmv / 36, 1_000),
    gmvAnterior: redondear(gmv * (0.78 + azar() * 0.4), 10_000),
  }
}

const TOP_MUNICIPIOS: readonly (readonly [string, string, number, number])[] = [
  ["11001", "Bogotá, D.C.", 52, 49],
  ["05001", "Medellín", 21, 19],
  ["76001", "Cali", 17, 17],
  ["08001", "Barranquilla", 14, 12],
  ["68001", "Bucaramanga", 9, 9],
  ["13001", "Cartagena de Indias", 8, 7],
  ["66001", "Pereira", 6, 6],
  ["05360", "Itagüí", 5, 4],
  ["17001", "Manizales", 5, 5],
  ["54001", "San José de Cúcuta", 5, 4],
]

export function datosCoberturaEjemplo(): DatosCobertura {
  const azar = generador(21)
  const filas = listarDepartamentosCliente().map((departamento) =>
    filaCobertura(departamento.codigo, departamento.nombre, azar)
  )
  const anteriores = filas.map((fila) => ({
    ...fila,
    medios: Math.max(0, fila.medios - (fila.medios > 10 ? 2 : 0)),
    mediosActivos: Math.round(fila.mediosActivos * 0.9),
    asignaciones: Math.round(fila.asignaciones * 0.88),
    gmv: fila.gmvAnterior ?? 0,
    alcance: Math.round(fila.alcance * 0.9),
    gmvAnterior: null,
  }))
  const totalMedios = filas.reduce((suma, fila) => suma + fila.medios, 0)
  return {
    contexto: contextoEjemplo("cobertura-territorial"),
    nivel: "departamento",
    departamento: null,
    filas,
    departamentos: filas,
    totales: totalesCobertura(filas),
    anterior: totalesCobertura(anteriores),
    topMunicipios: zonas(TOP_MUNICIPIOS, totalMedios),
  }
}

// ── Usuarios y accesos ───────────────────────────────────────────────────────

type UsuarioEjemplo = readonly [
  nombre: string,
  rol: string,
  estado: FilaUsuarioAcceso["estado"],
  exitosos: number,
  fallidos: number,
  paises: number,
  sospechosos: number,
  mfa: boolean,
]

const USUARIOS: readonly UsuarioEjemplo[] = [
  ["Laura Restrepo", "Administrador", "ACTIVO", 64, 2, 1, 0, true],
  ["Camilo Ortiz", "Operaciones", "ACTIVO", 58, 1, 1, 0, true],
  ["Valentina Gómez", "Finanzas", "ACTIVO", 41, 0, 1, 0, true],
  ["Andrés Ramírez", "Superadministrador", "ACTIVO", 37, 3, 2, 1, true],
  ["Juliana Peña", "Operaciones", "ACTIVO", 33, 0, 1, 0, true],
  ["Supermercados La Rebaja", "Anunciante", "ACTIVO", 22, 4, 1, 0, false],
  ["Clínica del Norte", "Anunciante", "ACTIVO", 17, 1, 1, 0, false],
  ["Felipe Cárdenas", "Administrador", "ACTIVO", 12, 6, 3, 2, false],
  ["Ferretería El Tornillo", "Anunciante", "ACTIVO", 9, 0, 1, 0, false],
  ["Mariana Duque", "Finanzas", "ACTIVO", 0, 0, 0, 0, true],
  ["Óscar Beltrán", "Operaciones", "SUSPENDIDO", 0, 5, 0, 1, true],
  ["Paula Montoya", "Administrador", "INVITADO", 0, 0, 0, 0, false],
]

function usuariosEjemplo(factor: number): FilaUsuarioAcceso[] {
  return USUARIOS.map(
    (
      [nombre, rol, estado, exitosos, fallidos, paises, sospechosos, mfa],
      i
    ) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      nombre,
      email: `${nombre.toLocaleLowerCase("es-CO").replace(/[^a-z]+/g, ".")}@amo.test`,
      rol,
      estado,
      ultimoAccesoAt:
        exitosos > 0
          ? `2026-09-${String(30 - i).padStart(2, "0")}T14:${10 + i}:00Z`
          : null,
      exitosos: Math.round(exitosos * factor),
      fallidos: Math.round(fallidos * factor),
      paises,
      sospechosos: Math.round(sospechosos * factor),
      mfaActivo: mfa,
    })
  )
}

/** Ingresos concentrados en horario laboral de lunes a viernes. */
function actividadEjemplo(): DatosUsuariosAccesos["actividad"] {
  const azar = generador(31)
  return Array.from({ length: 7 * 24 }, (_, i) => {
    const diaSemana = Math.floor(i / 24) + 1
    const hora = i % 24
    const laboral = diaSemana <= 5 && hora >= 7 && hora <= 18
    const base = laboral ? 2 + azar() * 6 : azar() < 0.12 ? 1 : 0
    return { diaSemana, hora, cantidad: Math.round(base) }
  })
}

export function datosUsuariosAccesosEjemplo(): DatosUsuariosAccesos {
  const filas = usuariosEjemplo(1)
  return {
    contexto: contextoEjemplo("usuarios-accesos"),
    filas,
    totales: totalesAccesos(filas),
    anterior: totalesAccesos(usuariosEjemplo(0.8)),
    actividad: actividadEjemplo(),
  }
}

// ── Desempeño de campañas ────────────────────────────────────────────────────

const CAMPANAS: readonly (readonly [
  campana: string,
  anunciante: string,
  cupos: number,
])[] = [
  ["Regreso a clases 2026", "Supermercados La Rebaja", 60],
  ["Jornada de vacunación", "Clínica del Norte", 48],
  ["Feria de la construcción", "Ferretería El Tornillo", 40],
  ["Créditos de libre inversión", "Cooperativa Confiar Más", 36],
  ["Temporada de cosecha", "Agroinsumos del Campo", 30],
  ["Matrículas abiertas", "Universidad del Oriente", 28],
  ["Aniversario 25 años", "Supermercados La Rebaja", 24],
  ["Planes de internet rural", "Conecta Fibra", 20],
  ["Festival gastronómico", "Alcaldía de Rionegro", 16],
  ["Seguro para motos", "Aseguradora Andina", 12],
  ["Lanzamiento tienda Tunja", "Ferretería El Tornillo", 10],
  ["Turismo en el Eje", "Cámara de Comercio de Pereira", 8],
]

function campanasEjemplo(factor: number): FilaCampana[] {
  const azar = generador(41)
  return CAMPANAS.map(([campana, anunciante, cupos], i) => {
    const ocupados = Math.round(cupos * (0.55 + azar() * 0.45))
    // Las dos últimas campañas aún no tienen negocios verificados.
    const verificadas =
      i >= CAMPANAS.length - 2 ? 0 : Math.round(ocupados * 0.8 * factor)
    const gmvVerificado = redondear(
      verificadas * 540_000 * (0.85 + azar() * 0.4),
      10_000
    )
    const impresiones = redondear(gmvVerificado / (13 + azar() * 10), 100)
    const alcance = redondear(impresiones * 0.72, 100)
    const interacciones = Math.round(alcance * (0.02 + azar() * 0.035))
    const conDatos = verificadas > 0
    return {
      id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      campana,
      anunciante,
      ofertas: Math.max(1, Math.round(cupos / 12)),
      cupos,
      cuposOcupados: ocupados,
      tasaLlenado: ocupados / cupos,
      gmvComprometido: redondear(ocupados * 560_000 * factor, 10_000),
      gmvVerificado,
      alcance,
      impresiones,
      interacciones,
      reproducciones: Math.round(impresiones * 0.4),
      clics: Math.round(alcance * 0.006),
      cpm: conDatos ? (gmvVerificado / impresiones) * 1000 : null,
      costoPorInteraccion: conDatos ? gmvVerificado / interacciones : null,
      engagement: conDatos ? interacciones / alcance : null,
      costoPorAlcance: conDatos ? gmvVerificado / alcance : null,
      tasaCumplimiento: conDatos ? 0.82 + azar() * 0.16 : null,
      nVerificadas: verificadas,
    }
  })
}

const POR_PLATAFORMA: readonly FilaPlataforma[] = [
  {
    plataforma: "INSTAGRAM",
    nombre: "Instagram",
    asignaciones: 138,
    gmv: 76_400_000,
    alcance: 3_180_000,
    impresiones: 4_410_000,
    cpm: 17_324,
    engagement: 0.041,
    n: 138,
  },
  {
    plataforma: "FACEBOOK",
    nombre: "Facebook",
    asignaciones: 96,
    gmv: 51_900_000,
    alcance: 1_870_000,
    impresiones: 2_540_000,
    cpm: 20_433,
    engagement: 0.027,
    n: 96,
  },
  // Muestra pequeña: no entra en la comparación de CPM.
  {
    plataforma: "TIKTOK",
    nombre: "TikTok",
    asignaciones: 14,
    gmv: 9_200_000,
    alcance: 610_000,
    impresiones: 830_000,
    cpm: 11_084,
    engagement: 0.063,
    n: 14,
  },
]

export function datosDesempenoEjemplo(): DatosDesempeno {
  const filas = campanasEjemplo(1)
  return {
    contexto: contextoEjemplo("desempeno-campanas"),
    unAnunciante: false,
    filas,
    totales: totalesDesempeno(filas),
    anterior: totalesDesempeno(campanasEjemplo(0.86)),
    porPlataforma: [...POR_PLATAFORMA],
  }
}

// ── Cumplimiento de medios ───────────────────────────────────────────────────

const MEDIOS: readonly (readonly [
  medio: string,
  municipio: string,
  departamento: string,
])[] = [
  ["Noticias de Envigado", "Envigado", "Antioquia"],
  ["El Informativo de Suba", "Bogotá, D.C.", "Bogotá, D.C."],
  ["Cali al Día", "Cali", "Valle del Cauca"],
  ["La Voz de Soledad", "Soledad", "Atlántico"],
  ["Girón Informa", "Girón", "Santander"],
  ["Rionegro Hoy", "Rionegro", "Antioquia"],
  ["Chía Noticias", "Chía", "Cundinamarca"],
  ["Dosquebradas en Línea", "Dosquebradas", "Risaralda"],
  ["Turbaco Te Cuenta", "Turbaco", "Bolívar"],
  ["Palmira Primero", "Palmira", "Valle del Cauca"],
  ["Bello Informado", "Bello", "Antioquia"],
  ["Soacha Digital", "Soacha", "Cundinamarca"],
  ["Piedecuesta al Instante", "Piedecuesta", "Santander"],
  ["Villamaría Noticias", "Villamaría", "Caldas"],
]

function mediosEjemplo(factor: number): FilaCumplimiento[] {
  const azar = generador(51)
  return MEDIOS.map(([medio, municipio, departamento], i) => {
    const comprometidas = Math.max(2, Math.round((26 - i * 1.6) * factor))
    const vencidas =
      i % 4 === 1 ? 2 + Math.floor(azar() * 3) : i % 5 === 0 ? 1 : 0
    const otras = i % 6 === 2 ? 1 : 0
    const cumplidas = Math.max(0, comprometidas - vencidas - otras)
    return {
      id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      medio,
      departamento,
      municipio,
      nivel: (i % 3) + 1,
      comprometidas,
      cumplidas,
      vencidas,
      canceladas: otras,
      enDisputa: i % 7 === 3 ? 1 : 0,
      tasa: cumplidas / comprometidas,
      alertas: i % 4 === 2 ? 1 + Math.floor(azar() * 3) : 0,
      multiplicador: 0.85 + Math.round(azar() * 45) / 100,
    }
  })
}

export function datosCumplimientoEjemplo(): DatosCumplimiento {
  const filas = mediosEjemplo(1)
  return {
    contexto: contextoEjemplo("cumplimiento-medios"),
    departamento: null,
    filas,
    totales: totalesCumplimiento(filas),
    anterior: totalesCumplimiento(mediosEjemplo(0.9)),
  }
}

// ── Finanzas ─────────────────────────────────────────────────────────────────

function filaFinanzas(
  id: string,
  grupo: string,
  gmvVerificado: number,
  semilla: number
): FilaFinanzas {
  const azar = generador(semilla * 7919)
  // Los primeros valores de semillas vecinas se parecen: se descartan.
  azar()
  azar()
  const comision = redondear(gmvVerificado * (0.16 + azar() * 0.05), 1_000)
  const facturado = redondear(gmvVerificado * 1.19, 1_000)
  const recaudado = redondear(facturado * (0.6 + azar() * 0.35), 1_000)
  return {
    id,
    grupo,
    gmvComprometido: redondear(gmvVerificado * 1.15, 10_000),
    gmvVerificado,
    comision,
    takeRate: comision / gmvVerificado,
    pagadoMedios: redondear((gmvVerificado - comision) * 0.82, 1_000),
    facturado,
    recaudado,
    cartera: facturado - recaudado,
  }
}

const SECTORES: readonly (readonly [string, number])[] = [
  ["Comercio y retail", 98_400_000],
  ["Salud", 71_200_000],
  ["Servicios financieros", 58_900_000],
  ["Educación", 44_300_000],
  ["Gobierno y entidades públicas", 39_700_000],
  ["Agroindustria", 26_100_000],
  ["Telecomunicaciones", 18_200_000],
]

const ANUNCIANTES: readonly (readonly [string, number])[] = [
  ["Supermercados La Rebaja", 61_800_000],
  ["Clínica del Norte", 48_300_000],
  ["Cooperativa Confiar Más", 39_600_000],
  ["Universidad del Oriente", 33_100_000],
  ["Ferretería El Tornillo", 29_400_000],
  ["Alcaldía de Rionegro", 24_700_000],
  ["Agroinsumos del Campo", 22_900_000],
  ["Aseguradora Andina", 19_300_000],
  ["Conecta Fibra", 18_200_000],
  ["Droguerías Bienestar", 16_800_000],
  ["Cámara de Comercio de Pereira", 15_000_000],
  ["Óptica Visión Clara", 11_200_000],
  ["Lácteos La Pradera", 9_400_000],
  ["Gimnasio Vital", 7_100_000],
]

const MESES: readonly (readonly [string, string, number])[] = [
  ["2026-07", "julio 2026", 301_400_000],
  ["2026-08", "agosto 2026", 318_200_000],
  ["2026-09", "septiembre 2026", 356_800_000],
]

export function datosFinanzasEjemplo(
  agrupacion: FiltrosReporte["agrupacion"] = "anunciante"
): DatosFinanzas {
  // Tercer trimestre de 2026 (julio a septiembre), como rango personalizado.
  const filtros = filtrosEjemplo({
    periodo: "personalizado",
    desde: "2026-07-01",
    hasta: "2026-09-30",
    agrupacion,
  })
  const porMes = MESES.map(([id, grupo, gmv], i) =>
    filaFinanzas(id, grupo, gmv, 61 + i)
  )
  const porSector = SECTORES.map(([grupo, gmv], i) =>
    filaFinanzas(
      `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      grupo,
      gmv,
      71 + i
    )
  )
  const porAnunciante = ANUNCIANTES.map(([grupo, gmv], i) =>
    filaFinanzas(
      `40000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      grupo,
      gmv,
      81 + i
    )
  )
  const sectorAnterior = SECTORES.map(([grupo, gmv], i) =>
    filaFinanzas(
      `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      grupo,
      redondear(gmv * 0.88, 10_000),
      91 + i
    )
  )
  const filas = { anunciante: porAnunciante, sector: porSector, mes: porMes }
  return {
    contexto: contextoEjemplo("finanzas", filtros),
    agrupacion,
    sector: null,
    filas: filas[agrupacion],
    porMes,
    porSector,
    porAnunciante,
    totales: totalesFinanzas(porSector),
    anterior: totalesFinanzas(sectorAnterior),
  }
}

// ── Cartera ──────────────────────────────────────────────────────────────────

type CarteraEjemplo = readonly [
  anunciante: string,
  al0a30: number,
  de31a60: number,
  de61a90: number,
  mas90: number,
  vencidas: number,
]

const CARTERA: readonly CarteraEjemplo[] = [
  ["Supermercados La Rebaja", 28_400_000, 6_200_000, 0, 0, 1],
  ["Clínica del Norte", 19_700_000, 0, 0, 0, 0],
  ["Cooperativa Confiar Más", 9_300_000, 7_800_000, 4_100_000, 0, 2],
  ["Universidad del Oriente", 14_600_000, 0, 0, 0, 0],
  ["Alcaldía de Rionegro", 0, 5_900_000, 6_400_000, 8_200_000, 4],
  ["Ferretería El Tornillo", 7_100_000, 2_300_000, 0, 0, 1],
  ["Aseguradora Andina", 6_800_000, 0, 0, 0, 0],
  ["Conecta Fibra", 0, 0, 3_900_000, 5_600_000, 3],
  ["Lácteos La Pradera", 3_200_000, 0, 0, 0, 0],
]

function carteraEjemplo(factor: number): FilaCartera[] {
  return CARTERA.map(
    ([anunciante, al0a30, de31a60, de61a90, mas90, vencidas], i) => {
      const tramos = [al0a30, de31a60, de61a90, mas90].map((valor) =>
        redondear(valor * factor, 1_000)
      )
      const saldo = tramos.reduce((a, b) => a + b, 0)
      return {
        id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        anunciante,
        facturado: redondear(saldo * 2.6, 1_000),
        pagado: redondear(saldo * 1.6, 1_000),
        saldo,
        saldo0a30: tramos[0],
        saldo31a60: tramos[1],
        saldo61a90: tramos[2],
        saldoMas90: tramos[3],
        facturasVencidas: vencidas,
      }
    }
  )
}

export function datosCarteraEjemplo(): DatosCartera {
  const filtros = filtrosEjemplo()
  const filas = carteraEjemplo(1)
  return {
    contexto: contextoEjemplo("cartera", filtros),
    corte: "2026-10-05",
    filas,
    totales: totalesCartera(filas),
    anterior: totalesCartera(carteraEjemplo(0.9)),
  }
}

// ── Registro ─────────────────────────────────────────────────────────────────

const EJEMPLOS: { [S in SlugReporte]: () => DatosPorReporte[S] } = {
  "resumen-ejecutivo": datosResumenEjemplo,
  "desempeno-campanas": datosDesempenoEjemplo,
  finanzas: datosFinanzasEjemplo,
  cartera: datosCarteraEjemplo,
  "cobertura-territorial": datosCoberturaEjemplo,
  "cumplimiento-medios": datosCumplimientoEjemplo,
  "usuarios-accesos": datosUsuariosAccesosEjemplo,
}

/** Un mes con actividad para el reporte pedido. */
export function datosEjemplo<S extends SlugReporte>(
  slug: S
): DatosPorReporte[S] {
  const crear: () => DatosPorReporte[S] = EJEMPLOS[slug]
  return crear()
}

const SIN_KPI = (clave: string, unidad: string): FilaKpi => ({
  kpi: clave,
  valor: unidad === "%" || unidad === "h" ? null : 0,
  valor_anterior: unidad === "%" || unidad === "h" ? null : 0,
  variacion: null,
  n: 0,
  n_anterior: 0,
  unidad,
  serie: null,
})

const VACIOS: { [S in SlugReporte]: () => DatosPorReporte[S] } = {
  "resumen-ejecutivo": () => ({
    contexto: contextoEjemplo("resumen-ejecutivo"),
    config: CONFIG_INSIGHTS_POR_DEFECTO,
    kpis: KPIS.map(([clave, , , unidad]) => SIN_KPI(clave, unidad)),
    granularidad: "dia",
    serie: serieGmv("2026-09-01", 30, 0, 1).map((punto) => ({
      ...punto,
      negocios: 0,
    })),
    serieAnterior: [],
    mezcla: [],
    zonas: [],
  }),
  "desempeno-campanas": () => ({
    contexto: contextoEjemplo("desempeno-campanas"),
    unAnunciante: false,
    filas: [],
    totales: totalesDesempeno([]),
    anterior: totalesDesempeno([]),
    porPlataforma: [],
  }),
  finanzas: () => ({
    contexto: contextoEjemplo("finanzas"),
    agrupacion: "anunciante",
    sector: null,
    filas: [],
    porMes: [],
    porSector: [],
    porAnunciante: [],
    totales: totalesFinanzas([]),
    anterior: totalesFinanzas([]),
  }),
  cartera: () => ({
    contexto: contextoEjemplo("cartera"),
    corte: "2026-10-05",
    filas: [],
    totales: totalesCartera([]),
    anterior: totalesCartera([]),
  }),
  "cobertura-territorial": () => {
    const filas = listarDepartamentosCliente().map(
      (departamento): FilaCobertura => ({
        codigo: departamento.codigo,
        departamentoCodigo: departamento.codigo,
        departamento: departamento.nombre,
        municipio: null,
        poblacion: 500_000,
        medios: 0,
        mediosActivos: 0,
        mediosPor100k: 0,
        asignaciones: 0,
        gmv: 0,
        alcance: 0,
        gmvAnterior: 0,
      })
    )
    return {
      contexto: contextoEjemplo("cobertura-territorial"),
      nivel: "departamento",
      departamento: null,
      filas,
      departamentos: filas,
      totales: totalesCobertura(filas),
      anterior: totalesCobertura(filas),
      topMunicipios: [],
    }
  },
  "cumplimiento-medios": () => ({
    contexto: contextoEjemplo("cumplimiento-medios"),
    departamento: null,
    filas: [],
    totales: totalesCumplimiento([]),
    anterior: totalesCumplimiento([]),
  }),
  "usuarios-accesos": () => ({
    contexto: contextoEjemplo("usuarios-accesos"),
    filas: [],
    totales: totalesAccesos([]),
    anterior: totalesAccesos([]),
    actividad: [],
  }),
}

/** El mismo periodo sin un solo movimiento (estados vacíos). */
export function datosVacios<S extends SlugReporte>(
  slug: S
): DatosPorReporte[S] {
  const crear: () => DatosPorReporte[S] = VACIOS[slug]
  return crear()
}
