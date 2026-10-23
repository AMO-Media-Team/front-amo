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
