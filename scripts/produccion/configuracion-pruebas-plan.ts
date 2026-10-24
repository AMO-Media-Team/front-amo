/**
 * Lógica pura de `pnpm prod:config-pruebas` (`configuracion-pruebas.ts`): qué
 * cambia la configuración de prueba, cómo se guarda lo anterior y cómo se
 * revierte. Sin Supabase ni archivos, para probarla con Vitest.
 */
import type { Database, Json } from "../../src/types/database.types"

type TipoTermino = Database["public"]["Enums"]["terminos_tipo"]

/**
 * Parámetros que acortan los tiempos para que el cliente recorra los flujos en
 * minutos (decisión de Andrés, 2026-10-21): solo valores que la configuración
 * ya admite; ninguna regla de la base cambia.
 */
export const PARAMETROS_PRUEBA: Readonly<Record<string, Json>> = {
  // Una oferta puede cerrar la aceptación el mismo día en que se envía.
  "ofertas.anticipacion_minima_horas": 0,
  // Un solo corte de métricas (24 h) por defecto en las ofertas nuevas.
  "metricas.cortes_requeridos": ["H24"],
  // Cuida el 1 GB de Storage del plan gratuito.
  "archivos.max_creativo_mb": 25,
}

/** Versión de los textos legales de prueba (cumple `terminos_versiones_version_chk`). */
export const VERSION_TERMINOS_PRUEBA = "0.1-PRUEBA"

const TITULOS: Readonly<Record<TipoTermino, string>> = {
  TERMINOS_MEDIO: "Términos y condiciones para medios",
  TERMINOS_ANUNCIANTE: "Términos y condiciones para anunciantes",
  POLITICA_DATOS: "Política de tratamiento de datos personales",
  CONDICIONES_COMERCIALES: "Condiciones comerciales",
}

export const TIPOS_TERMINOS = Object.keys(TITULOS) as TipoTermino[]

/** Texto provisional, rotulado para que nadie lo tome por el definitivo. */
export function contenidoTerminosPrueba(tipo: TipoTermino): string {
  return [
    `# ${TITULOS[tipo]} — VERSIÓN DE PRUEBA`,
    "",
    "> **Texto provisional para las pruebas funcionales de la plataforma.** No tiene valor legal ni",
    "> contractual. AMO publicará la versión definitiva antes del uso real y todas las personas",
    "> deberán aceptarla de nuevo.",
    "",
    "## Para qué está aquí",
    "",
    "Esta versión permite probar el flujo de aceptación: quien ingresa con una cuenta de anunciante o de",
    "medio la lee y la acepta antes de continuar, y la plataforma guarda la versión, la fecha, la IP y el",
    "navegador de esa aceptación.",
  ].join("\n")
}

// ── Respaldo ─────────────────────────────────────────────────────────────────

export interface CambioParametro {
  /** Valor que tenía antes de la primera aplicación (se restaura al revertir). */
  anterior: Json
  /** Valor de prueba que dejó el script. */
  aplicado: Json
}

export interface RespaldoConfiguracion {
  proyecto: string
  /** ISO de la primera aplicación. */
  creado: string
  parametros: Record<string, CambioParametro>
  /** Versiones legales de prueba creadas (publicadas: solo las borra la limpieza final). */
  terminos: { id: string; tipo: TipoTermino; version: string }[]
  /** Retenciones, ReteICA y resoluciones de prueba creadas (fase 5; ausente en respaldos anteriores). */
  finanzas?: CreadoFinanzas
}

export function respaldoVacio(
  proyecto: string,
  ahora: Date
): RespaldoConfiguracion {
  return { proyecto, creado: ahora.toISOString(), parametros: {}, terminos: [] }
}

/** Igualdad estructural de valores JSON (orden de claves indiferente). */
export function mismoValor(a: Json, b: Json): boolean {
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b))
}

function normalizar(valor: Json): Json {
  if (Array.isArray(valor)) return valor.map(normalizar)
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor)
        .sort()
        .map((clave) => [clave, normalizar(valor[clave] ?? null)])
    )
  }
  return valor
}

// ── Planes ───────────────────────────────────────────────────────────────────

export interface ParametroActual {
  clave: string
  valor: Json
  updated_at: string
}

export type PasoParametro =
  | { tipo: "cambiar"; clave: string; desde: Json; hacia: Json; marca: string }
  | { tipo: "igual"; clave: string; valor: Json }
  | { tipo: "falta"; clave: string }
  | {
      tipo: "ajeno"
      clave: string
      actual: Json
      esperado: Json
    }

/** Qué hace `--aplicar` con cada parámetro de prueba. */
export function planAplicar(
  actuales: readonly ParametroActual[]
): PasoParametro[] {
  const porClave = new Map(actuales.map((fila) => [fila.clave, fila]))
  return Object.entries(PARAMETROS_PRUEBA).map(([clave, hacia]) => {
    const actual = porClave.get(clave)
    if (!actual) return { tipo: "falta", clave }
    if (mismoValor(actual.valor, hacia)) {
      return { tipo: "igual", clave, valor: hacia }
    }
    return {
      tipo: "cambiar",
      clave,
      desde: actual.valor,
      hacia,
      marca: actual.updated_at,
    }
  })
}

/**
 * Qué hace `--revertir`: vuelve al valor anterior solo si el parámetro sigue
 * con el valor de prueba; si alguien lo cambió después, lo deja («ajeno»).
 */
export function planRevertir(
  respaldo: RespaldoConfiguracion,
  actuales: readonly ParametroActual[]
): PasoParametro[] {
  const porClave = new Map(actuales.map((fila) => [fila.clave, fila]))
  return Object.entries(respaldo.parametros).map(([clave, cambio]) => {
    const actual = porClave.get(clave)
    if (!actual) return { tipo: "falta", clave }
    if (mismoValor(actual.valor, cambio.anterior)) {
      return { tipo: "igual", clave, valor: cambio.anterior }
    }
    if (!mismoValor(actual.valor, cambio.aplicado)) {
      return {
        tipo: "ajeno",
        clave,
        actual: actual.valor,
        esperado: cambio.aplicado,
      }
    }
    return {
      tipo: "cambiar",
      clave,
      desde: actual.valor,
      hacia: cambio.anterior,
      marca: actual.updated_at,
    }
  })
}

/**
 * Registra un cambio aplicado. Conserva el «anterior» de la primera
 * aplicación: reaplicar no debe perder el valor original.
 */
export function registrarCambio(
  respaldo: RespaldoConfiguracion,
  clave: string,
  anterior: Json,
  aplicado: Json
): RespaldoConfiguracion {
  const previo = respaldo.parametros[clave]
  return {
    ...respaldo,
    parametros: {
      ...respaldo.parametros,
      [clave]: { anterior: previo ? previo.anterior : anterior, aplicado },
    },
  }
}

/** Quita del respaldo lo que ya se revirtió (o ya estaba en su valor original). */
export function olvidarParametro(
  respaldo: RespaldoConfiguracion,
  clave: string
): RespaldoConfiguracion {
  const { [clave]: _quitado, ...resto } = respaldo.parametros
  return { ...respaldo, parametros: resto }
}

export interface VersionExistente {
  id: string
  tipo: TipoTermino
  version: string
  publicada: boolean
}

export type PasoTermino =
  | { tipo: "crear"; termino: TipoTermino }
  | { tipo: "publicar"; termino: TipoTermino; id: string }
  | { tipo: "ya-publicada"; termino: TipoTermino }
  /** El cliente ya publicó su propia versión: no se le pone una de prueba encima. */
  | { tipo: "hay-texto-real"; termino: TipoTermino; version: string }

export function planTerminos(
  versiones: readonly VersionExistente[]
): PasoTermino[] {
  return TIPOS_TERMINOS.map((termino) => {
    const delTipo = versiones.filter((version) => version.tipo === termino)
    const prueba = delTipo.find(
      (version) => version.version === VERSION_TERMINOS_PRUEBA
    )
    const real = delTipo.find(
      (version) =>
        version.publicada && version.version !== VERSION_TERMINOS_PRUEBA
    )
    if (real) return { tipo: "hay-texto-real", termino, version: real.version }
    if (!prueba) return { tipo: "crear", termino }
    return prueba.publicada
      ? { tipo: "ya-publicada", termino }
      : { tipo: "publicar", termino, id: prueba.id }
  })
}

// ── Finanzas de prueba (fase 5) ──────────────────────────────────────────────

type Enums = Database["public"]["Enums"]
export type TipoRetencion = Enums["retencion_tipo"]
export type TipoResolucion = Enums["documento_electronico_tipo"]

/** Retención de referencia (`retenciones_config`), siempre `pendiente_validacion`. */
export interface RetencionReferencia {
  tipo: Extract<TipoRetencion, "RETEFUENTE">
  concepto: "SERVICIOS"
  aplicaDeclarante: boolean
  tarifa: number
  baseMinimaUvt: number
}

/**
 * Retención en la fuente por servicios de referencia (decisión de la fase 5):
 * 4 % al declarante y 6 % al no declarante, desde 4 UVT. El contador de AMO
 * la valida o la reemplaza en Configuración › Tributario.
 */
export const RETENCIONES_REFERENCIA: readonly RetencionReferencia[] = [
  {
    tipo: "RETEFUENTE",
    concepto: "SERVICIOS",
    aplicaDeclarante: true,
    tarifa: 0.04,
    baseMinimaUvt: 4,
  },
  {
    tipo: "RETEFUENTE",
    concepto: "SERVICIOS",
    aplicaDeclarante: false,
    tarifa: 0.06,
    baseMinimaUvt: 4,
  },
]

/** ReteICA de referencia de una capital (`reteica_municipal`, por mil). */
export interface ReteicaReferencia {
  municipio: string
  nombre: string
  tarifaPorMil: number
}

/** Lista corta de capitales con ReteICA de referencia (pendiente de validar por el contador). */
export const RETEICA_REFERENCIA: readonly ReteicaReferencia[] = [
  { municipio: "11001", nombre: "Bogotá", tarifaPorMil: 9.66 },
  { municipio: "05001", nombre: "Medellín", tarifaPorMil: 10 },
  { municipio: "76001", nombre: "Cali", tarifaPorMil: 10 },
  { municipio: "08001", nombre: "Barranquilla", tarifaPorMil: 10 },
]

/** Resolución DIAN «PRUEBA» (sin validez fiscal: el PDF lleva la marca de agua). */
export interface ResolucionPrueba {
  tipo: TipoResolucion
  prefijo: string
  numeroResolucion: string
  rangoDesde: number
  rangoHasta: number
}

export const RESOLUCIONES_PRUEBA: Readonly<
  Record<TipoResolucion, ResolucionPrueba>
> = {
  DOCUMENTO_SOPORTE: {
    tipo: "DOCUMENTO_SOPORTE",
    prefijo: "PDS",
    numeroResolucion: "PRUEBA-DS",
    rangoDesde: 1,
    rangoHasta: 5000,
  },
  FACTURA_VENTA: {
    tipo: "FACTURA_VENTA",
    prefijo: "PFE",
    numeroResolucion: "PRUEBA-FE",
    rangoDesde: 1,
    rangoHasta: 5000,
  },
}

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

function aUtc(fecha: string): number {
  const partes = FECHA_ISO.exec(fecha)
  if (!partes) throw new RangeError(`Fecha inválida: ${fecha}`)
  return Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))
}

/** `YYYY-MM-DD` más `dias` (pueden ser negativos), sin zonas horarias. */
export function sumarDias(fecha: string, dias: number): string {
  return new Date(aUtc(fecha) + dias * 86_400_000).toISOString().slice(0, 10)
}

/** 1 de enero del año de `hoy`: la vigencia de las reglas de referencia cubre los periodos del año. */
export function inicioDeAnio(hoy: string): string {
  aUtc(hoy)
  return `${hoy.slice(0, 4)}-01-01`
}

/** El año siguiente a `hoy` (mismo día): vigencia de las resoluciones de prueba. */
export function unAnioDespues(hoy: string): string {
  aUtc(hoy)
  const siguiente = `${Number(hoy.slice(0, 4)) + 1}${hoy.slice(4)}`
  // 29 de febrero → 1 de marzo.
  return FECHA_ISO.test(siguiente) &&
    new Date(aUtc(siguiente)).toISOString().slice(0, 10) === siguiente
    ? siguiente
    : sumarDias(`${Number(hoy.slice(0, 4)) + 1}-02-28`, 1)
}

/** ¿Se cruzan dos vigencias `[desde, hasta)` (sin `hasta`: abierta)? Como las EXCLUDE de la BD. */
export function vigenciasSeCruzan(
  a: { desde: string; hasta: string | null },
  b: { desde: string; hasta: string | null }
): boolean {
  const finA = a.hasta === null ? Number.POSITIVE_INFINITY : aUtc(a.hasta)
  const finB = b.hasta === null ? Number.POSITIVE_INFINITY : aUtc(b.hasta)
  return aUtc(a.desde) < finB && aUtc(b.desde) < finA
}

export interface RetencionExistente {
  id: string
  tipo: TipoRetencion
  aplica_declarante: boolean
  vigente_desde: string
  vigente_hasta: string | null
}

export type PasoRetencion =
  | { tipo: "crear"; regla: RetencionReferencia; vigenteDesde: string }
  | { tipo: "existe"; regla: RetencionReferencia; id: string }

/**
 * Qué hace `--aplicar` con cada retención de referencia: la crea desde el 1 de
 * enero si no hay otra del mismo tipo y condición de declarante que se cruce
 * con esa vigencia (la BD admite una sola vigente: dos duplicarían el cálculo).
 */
export function planRetenciones(
  existentes: readonly RetencionExistente[],
  hoy: string
): PasoRetencion[] {
  const vigenteDesde = inicioDeAnio(hoy)
  return RETENCIONES_REFERENCIA.map((regla) => {
    const choca = existentes.find(
      (fila) =>
        fila.tipo === regla.tipo &&
        fila.aplica_declarante === regla.aplicaDeclarante &&
        vigenciasSeCruzan(
          { desde: fila.vigente_desde, hasta: fila.vigente_hasta },
          { desde: vigenteDesde, hasta: null }
        )
    )
    return choca
      ? { tipo: "existe", regla, id: choca.id }
      : { tipo: "crear", regla, vigenteDesde }
  })
}

export interface ReteicaExistente {
  id: string
  municipio_codigo: string
  vigente_desde: string
  vigente_hasta: string | null
}

export type PasoReteica =
  | { tipo: "crear"; regla: ReteicaReferencia; vigenteDesde: string }
  | { tipo: "existe"; regla: ReteicaReferencia; id: string }
  /** El municipio no está en el catálogo de esta base (se omite). */
  | { tipo: "sin-municipio"; regla: ReteicaReferencia }

export function planReteica(
  existentes: readonly ReteicaExistente[],
  municipiosDisponibles: ReadonlySet<string>,
  hoy: string
): PasoReteica[] {
  const vigenteDesde = inicioDeAnio(hoy)
  return RETEICA_REFERENCIA.map((regla) => {
    if (!municipiosDisponibles.has(regla.municipio)) {
      return { tipo: "sin-municipio", regla }
    }
    const choca = existentes.find(
      (fila) =>
        fila.municipio_codigo === regla.municipio &&
        vigenciasSeCruzan(
          { desde: fila.vigente_desde, hasta: fila.vigente_hasta },
          { desde: vigenteDesde, hasta: null }
        )
    )
    return choca
      ? { tipo: "existe", regla, id: choca.id }
      : { tipo: "crear", regla, vigenteDesde }
  })
}

export interface ResolucionExistente {
  id: string
  tipo: TipoResolucion
  prefijo: string
  numero_resolucion: string
  activa: boolean
  vigente_desde: string
  vigente_hasta: string | null
}

export type PasoResolucion =
  /** Ya hay una activa y vigente hoy: se usa esa (también si es la del cliente). */
  | {
      tipo: "vigente"
      resolucion: ResolucionPrueba
      id: string
      prefijo: string
    }
  | {
      tipo: "crear"
      resolucion: ResolucionPrueba
      fechaResolucion: string
      vigenteDesde: string
      vigenteHasta: string
    }
  /** La de prueba existe sin activar y no hay otra activa: se activa. */
  | { tipo: "activar"; resolucion: ResolucionPrueba; id: string }
  /** Hay una activa que no está vigente hoy: no se puede activar otra (una activa por tipo). */
  | { tipo: "activa-vencida"; resolucion: ResolucionPrueba; prefijo: string }

function vigenteEn(fila: ResolucionExistente, hoy: string): boolean {
  return (
    fila.vigente_desde <= hoy &&
    (fila.vigente_hasta === null || fila.vigente_hasta >= hoy)
  )
}

/**
 * Resoluciones «PRUEBA» de documento soporte y de factura: solo hacen falta si
 * no hay una activa y vigente hoy (la plataforma numera con la activa). La de
 * prueba, si ya existe, se activa en lugar de crear otra.
 */
export function planResoluciones(
  existentes: readonly ResolucionExistente[],
  hoy: string
): PasoResolucion[] {
  return Object.values(RESOLUCIONES_PRUEBA).map((resolucion) => {
    const delTipo = existentes.filter((fila) => fila.tipo === resolucion.tipo)
    const activa = delTipo.find((fila) => fila.activa)
    if (activa && vigenteEn(activa, hoy)) {
      return {
        tipo: "vigente",
        resolucion,
        id: activa.id,
        prefijo: activa.prefijo,
      }
    }
    if (activa) {
      return { tipo: "activa-vencida", resolucion, prefijo: activa.prefijo }
    }
    const prueba = delTipo.find(
      (fila) =>
        fila.prefijo === resolucion.prefijo &&
        fila.numero_resolucion === resolucion.numeroResolucion &&
        vigenteEn(fila, hoy)
    )
    if (prueba) return { tipo: "activar", resolucion, id: prueba.id }
    return {
      tipo: "crear",
      resolucion,
      fechaResolucion: hoy,
      vigenteDesde: hoy,
      vigenteHasta: unAnioDespues(hoy),
    }
  })
}

/** Lo que `--aplicar` creó en las finanzas de prueba (para revertirlo si no se usó). */
export interface CreadoFinanzas {
  retenciones: string[]
  reteica: string[]
  resoluciones: string[]
}

export function creadoFinanzasVacio(): CreadoFinanzas {
  return { retenciones: [], reteica: [], resoluciones: [] }
}

/** Agrega ids sin repetir (reaplicar no duplica el respaldo). */
export function registrarCreadoFinanzas(
  creado: CreadoFinanzas | undefined,
  tabla: keyof CreadoFinanzas,
  id: string
): CreadoFinanzas {
  const base = creado ?? creadoFinanzasVacio()
  return base[tabla].includes(id)
    ? base
    : { ...base, [tabla]: [...base[tabla], id] }
}

export type PasoRevertirFinanzas =
  | { tipo: "quitar"; tabla: keyof CreadoFinanzas; id: string }
  /** Ya se usó (una liquidación o un documento la referencian): se conserva. */
  | { tipo: "usada"; tabla: keyof CreadoFinanzas; id: string }
  /** Ya no existe (alguien la borró): solo se olvida. */
  | { tipo: "no-existe"; tabla: keyof CreadoFinanzas; id: string }

/** Qué hace `--revertir` con lo creado: quita lo que nadie usó. */
export function planRevertirFinanzas(
  creado: CreadoFinanzas | undefined,
  estado: { existentes: ReadonlySet<string>; usadas: ReadonlySet<string> }
): PasoRevertirFinanzas[] {
  if (!creado) return []
  const tablas: (keyof CreadoFinanzas)[] = [
    "retenciones",
    "reteica",
    "resoluciones",
  ]
  return tablas.flatMap((tabla) =>
    creado[tabla].map((id): PasoRevertirFinanzas => {
      if (!estado.existentes.has(id)) return { tipo: "no-existe", tabla, id }
      if (estado.usadas.has(id)) return { tipo: "usada", tabla, id }
      return { tipo: "quitar", tabla, id }
    })
  )
}

/** Olvida del respaldo un id ya revertido (o que ya no existe). */
export function olvidarCreadoFinanzas(
  creado: CreadoFinanzas | undefined,
  tabla: keyof CreadoFinanzas,
  id: string
): CreadoFinanzas {
  const base = creado ?? creadoFinanzasVacio()
  return { ...base, [tabla]: base[tabla].filter((otro) => otro !== id) }
}

// ── Argumentos ───────────────────────────────────────────────────────────────

export type Modo = "simular" | "aplicar" | "revertir"

export interface Argumentos {
  modo: Modo
  confirmarProduccion: boolean
}

export function leerArgumentos(argv: readonly string[]): Argumentos {
  const conocidos = new Set([
    "--aplicar",
    "--revertir",
    "--confirmar-produccion",
  ])
  const desconocido = argv.find((argumento) => !conocidos.has(argumento))
  if (desconocido) throw new Error(`Argumento desconocido: ${desconocido}`)
  const aplicar = argv.includes("--aplicar")
  const revertir = argv.includes("--revertir")
  if (aplicar && revertir) {
    throw new Error("Usa --aplicar o --revertir, no los dos.")
  }
  return {
    modo: aplicar ? "aplicar" : revertir ? "revertir" : "simular",
    confirmarProduccion: argv.includes("--confirmar-produccion"),
  }
}

/** Valor JSON legible en una línea para el registro del operador. */
export function mostrar(valor: Json): string {
  return JSON.stringify(valor)
}
