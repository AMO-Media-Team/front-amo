/**
 * `pnpm exec tsx scripts/pruebas/rendimiento-geo.ts [local|develop] [--n 20] [--url http://localhost:3000]
 *   [--cuenta .cuentas-pista/rendimiento.json] [--sin-e2e] [--sin-explain] [--json <ruta>]`
 *
 * Rendimiento del explorador geográfico (GEO-010, criterio de la Entrega 3: «el percentil 95 es inferior a 300 ms»,
 * RNF-REN-02) con los datos de la base del entorno (en local, los 15 meses de demo de `pnpm db:local`):
 *
 * 1. **En la base**: `geo_metricas` en los 3 niveles × cada métrica del nivel, y `detalle_zona_geo` de una zona por nivel
 *    (Colombia, Antioquia, Medellín), con el periodo por defecto del explorador (últimos 30 días), 12 meses y el máximo
 *    que admite (731 días, el peor caso del detalle). Cada combinación corre N ≥ 20 veces (más una de calentamiento que
 *    no cuenta) como un administrador con aal2, dentro de una transacción que siempre se revierte (el usuario y la sesión
 *    de la medición no quedan). El tiempo se toma en el servidor (`clock_timestamp()`), sin la red. **Falla si algún
 *    p95 llega a 300 ms**; marca «cerca» desde el 80 %. Mide con la máquina en reposo: avisa si está ocupada.
 * 2. **De extremo a extremo** (informativo, solo en local): `GET /api/geo/metricas` contra el servidor de `--url`, con la
 *    sesión de una cuenta de pista ADMIN con TOTP propio (`pnpm exec tsx scripts/bootstrap/cuenta-pista.ts rendimiento
 *    ADMIN`; verificar el TOTP cierra las demás sesiones de esa cuenta y de ninguna otra). Si no hay servidor o cuenta,
 *    se omite. Mide con `pnpm build && pnpm start`: `pnpm dev` compila en la primera solicitud y es más lento.
 * 3. **EXPLAIN ANALYZE de `detalle_zona_geo('pais', 'CO', …)`** con `auto_explain` (sentencias anidadas) y las
 *    estadísticas por función de la transacción: dónde se va el tiempo y si conviene un índice (no crea ninguno).
 *
 * Nunca contra producción (crea un usuario temporal, aunque se revierta). No imprime claves ni contraseñas.
 */
import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { availableParallelism, loadavg } from "node:os"
import { parseEnv } from "node:util"

import { createServerClient } from "@supabase/ssr"
import postgres from "postgres"

import {
  metricasDelNivel,
  type MetricaGeo,
  NIVEL_RPC,
  NIVELES_GEO,
  type NivelGeo,
  resolverMetrica,
} from "../../src/features/geo/metricas"
import {
  parsearFecha,
  rangoDesdePreset,
  serializarFecha,
} from "../../src/lib/fechas"
import { formatearNumero } from "../../src/lib/format"
import type { Database } from "../../src/types/database.types"
import { codigoTotpNuevo, marcarTotpUsado } from "../bootstrap/mfa"
import { esProduccion } from "../bootstrap/produccion"
import { type EntornoDb, redactar, sslDe, urlDb } from "../db/entorno-db"

// ── Parámetros ───────────────────────────────────────────────────────────────

/** GEO-010 (E3): el p95 de una consulta del explorador debe ser inferior a esto. */
export const UMBRAL_P95_MS = 300
/** Repeticiones mínimas por combinación (y las de omisión). */
export const N_MINIMO = 20
/** Ejecuciones previas que no cuentan: compilan los planes de PL/pgSQL y calientan la caché. */
export const CALENTAMIENTO = 1
/** Variable de la transacción donde el bloque de medición deja los tiempos. */
const VARIABLE_TIEMPOS = "amo.rendimiento_ms"

/** Una zona representativa por nivel (la de más actividad en la demo). */
export const ZONAS: Readonly<
  Record<NivelGeo, { zona: string; departamento: string | null }>
> = {
  internacional: { zona: "CO", departamento: null },
  nacional: { zona: "05", departamento: null },
  departamental: { zona: "05001", departamento: "05" },
}

export type EntornoRendimiento = Exclude<EntornoDb, "produccion">

const ENTORNOS_RENDIMIENTO: readonly EntornoRendimiento[] = ["local", "develop"]

export interface ArgumentosRendimiento {
  entorno: EntornoRendimiento
  n: number
  url: string
  cuenta: string
  e2e: boolean
  explain: boolean
  json: string | null
}

export const USO =
  "Uso: pnpm exec tsx scripts/pruebas/rendimiento-geo.ts [local|develop] [--n 20] [--url http://localhost:3000] [--cuenta .cuentas-pista/rendimiento.json] [--sin-e2e] [--sin-explain] [--json <ruta>]"

const CON_VALOR = new Set(["--n", "--url", "--cuenta", "--json"])
const SIN_VALOR = new Set(["--sin-e2e", "--sin-explain"])

export function leerArgumentos(argv: readonly string[]): ArgumentosRendimiento {
  const valores = new Map<string, string>()
  const banderas = new Set<string>()
  const posicionales: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const argumento = argv[i] ?? ""
    if (CON_VALOR.has(argumento)) {
      const valor = argv[i + 1]
      if (valor === undefined || valor.startsWith("--")) {
        throw new Error(`${argumento} necesita un valor. ${USO}`)
      }
      valores.set(argumento, valor)
      i += 1
    } else if (SIN_VALOR.has(argumento)) {
      banderas.add(argumento)
    } else if (argumento.startsWith("-")) {
      throw new Error(`Argumento desconocido: ${argumento}. ${USO}`)
    } else {
      posicionales.push(argumento)
    }
  }
  const [pedido = "local", ...sobrantes] = posicionales
  if (pedido === "produccion") {
    throw new Error(
      "El rendimiento se mide en local o develop, nunca en producción (la medición crea un usuario temporal)."
    )
  }
  const entorno = ENTORNOS_RENDIMIENTO.find((valor) => valor === pedido)
  if (!entorno || sobrantes.length > 0) {
    throw new Error(`Indica un solo entorno: local o develop. ${USO}`)
  }
  const n = Number(valores.get("--n") ?? N_MINIMO)
  if (!Number.isInteger(n) || n < N_MINIMO || n > 500) {
    throw new Error(`--n debe ser un entero entre ${N_MINIMO} y 500.`)
  }
  const url = (valores.get("--url") ?? "http://localhost:3000").replace(
    /\/+$/,
    ""
  )
  if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) {
    throw new Error(`--url no es una URL http(s) válida: ${url}`)
  }
  return {
    entorno,
    n,
    url,
    cuenta: valores.get("--cuenta") ?? ".cuentas-pista/rendimiento.json",
    e2e: !banderas.has("--sin-e2e"),
    explain: !banderas.has("--sin-explain"),
    json: valores.get("--json") ?? null,
  }
}

// ── Combinaciones ────────────────────────────────────────────────────────────

export interface Periodo {
  etiqueta: string
  desde: string
  hasta: string
}

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Periodo máximo del explorador: `DIAS_MAXIMOS_RANGO` de `src/features/geo/estado-url.ts` (copiado para no cargar nuqs
 * ni el catálogo geográfico en el script; la prueba exige que coincidan).
 */
export const DIAS_PERIODO_MAXIMO = 731

/**
 * Hasta hoy en Bogotá: el periodo por defecto del explorador (últimos 30 días), 12 meses y el máximo que admite
 * (`DIAS_MAXIMOS_RANGO`), que es el peor caso del detalle: su serie mensual crece con el periodo.
 */
export function periodosDe(ahora: Date): Periodo[] {
  const treinta = rangoDesdePreset("ultimos30", ahora)
  const hasta = serializarFecha(treinta.hasta)
  // Bogotá no tiene horario de verano: restar días en milisegundos es exacto.
  const atras = (dias: number) =>
    serializarFecha(new Date(treinta.hasta.getTime() - (dias - 1) * DIA_MS))
  return [
    { etiqueta: "30 días", desde: serializarFecha(treinta.desde), hasta },
    { etiqueta: "12 meses", desde: atras(365), hasta },
    { etiqueta: "máximo", desde: atras(DIAS_PERIODO_MAXIMO), hasta },
  ]
}

export type FuncionGeo = "geo_metricas" | "detalle_zona_geo"

export interface Consulta {
  funcion: FuncionGeo
  nivel: NivelGeo
  /** Métrica de `geo_metricas`; en el detalle, la activa del explorador (la RPC trae todas). */
  metrica: MetricaGeo
  periodo: Periodo
}

/** Cada métrica de cada nivel con `geo_metricas` y el detalle de la zona de cada nivel, por periodo. */
export function consultasDe(periodos: readonly Periodo[]): Consulta[] {
  return periodos.flatMap((periodo) =>
    NIVELES_GEO.flatMap((nivel) => {
      const mapa = metricasDelNivel(nivel).map((metrica): Consulta => ({
        funcion: "geo_metricas",
        nivel,
        metrica,
        periodo,
      }))
      const metrica = resolverMetrica(nivel, null) ?? mapa[0]?.metrica
      return metrica
        ? [
            ...mapa,
            {
              funcion: "detalle_zona_geo" as const,
              nivel,
              metrica,
              periodo,
            },
          ]
        : mapa
    })
  )
}

export function etiquetaConsulta(consulta: Consulta): string {
  return consulta.funcion === "geo_metricas"
    ? `geo_metricas · ${consulta.nivel} · ${consulta.metrica}`
    : `detalle_zona_geo · ${consulta.nivel} (${ZONAS[consulta.nivel].zona})`
}

const LITERAL_SEGURO = /^[A-Za-z0-9_-]+$/

/** Literal SQL de un valor del catálogo (niveles, métricas, códigos DANE o ISO, fechas): nunca texto libre. */
function literal(valor: string): string {
  if (!LITERAL_SEGURO.test(valor)) {
    throw new Error(`Valor inesperado para la consulta: ${valor}`)
  }
  return `'${valor}'`
}

function fecha(valor: string): string {
  if (!parsearFecha(valor)) throw new Error(`Fecha inválida: ${valor}`)
  return `${literal(valor)}::date`
}

/** La llamada a la RPC, igual a la que hace PostgREST para el explorador (`count(*)` consume todas las filas). */
export function sqlDe(consulta: Consulta): string {
  const { periodo } = consulta
  const nivel = literal(NIVEL_RPC[consulta.nivel])
  const zona = ZONAS[consulta.nivel]
  if (consulta.funcion === "detalle_zona_geo") {
    return `select count(*) from public.detalle_zona_geo(${nivel}, ${literal(zona.zona)}, ${fecha(periodo.desde)}, ${fecha(periodo.hasta)})`
  }
  const departamento =
    consulta.nivel === "departamental" && zona.departamento
      ? literal(zona.departamento)
      : "null"
  return `select count(*) from public.geo_metricas(${nivel}, ${literal(consulta.metrica)}, ${fecha(periodo.desde)}, ${fecha(periodo.hasta)}, ${departamento})`
}

/**
 * Bloque anónimo que ejecuta la consulta `calentamiento` veces sin medir y luego hasta juntar `n` tiempos (ms, en el
 * servidor) con la sesión del administrador; los deja en una variable de la transacción. `clock_timestamp()` es el
 * reloj de pared: si retrocede (un ajuste de hora de la máquina), esa vuelta no cuenta y se repite.
 */
export function bloqueMedicion(
  sql: string,
  n: number,
  calentamiento = CALENTAMIENTO
): string {
  if (sql.includes("$medicion$")) throw new Error("Consulta inesperada.")
  return `do $medicion$
declare
  v_inicio timestamptz;
  v_ms float8;
  v_vueltas integer := 0;
  v_tiempos float8[] := '{}';
begin
  for i in 1..${calentamiento} loop
    perform (${sql});
  end loop;
  while coalesce(array_length(v_tiempos, 1), 0) < ${n} loop
    v_vueltas := v_vueltas + 1;
    if v_vueltas > ${n * 2} then
      raise exception 'El reloj de la base retrocedió demasiadas veces durante la medición.';
    end if;
    v_inicio := clock_timestamp();
    perform (${sql});
    v_ms := extract(epoch from clock_timestamp() - v_inicio) * 1000;
    if v_ms >= 0 then
      v_tiempos := v_tiempos || v_ms;
    end if;
  end loop;
  perform set_config('${VARIABLE_TIEMPOS}', array_to_string(v_tiempos, ','), true);
end
$medicion$`
}

export function leerTiempos(texto: string | null, esperados: number): number[] {
  const partes = (texto ?? "").split(",").filter((parte) => parte.trim() !== "")
  if (partes.length !== esperados) {
    throw new Error(
      `Se esperaban ${esperados} tiempos y llegaron ${partes.length}.`
    )
  }
  const invalido = partes.find((parte) => !(Number(parte) >= 0))
  if (invalido !== undefined) {
    throw new Error(`Tiempo inválido en la medición: ${invalido}.`)
  }
  return partes.map(Number)
}

// ── Estadística ──────────────────────────────────────────────────────────────

/** Percentil por rango más cercano: el menor valor con al menos `p` % de las muestras a su izquierda o igual. */
export function percentil(valores: readonly number[], p: number): number {
  if (valores.length === 0) return Number.NaN
  const ordenados = [...valores].sort((a, b) => a - b)
  const posicion = Math.min(
    ordenados.length,
    Math.max(1, Math.ceil((p / 100) * ordenados.length))
  )
  return ordenados[posicion - 1] ?? Number.NaN
}

export interface Resumen {
  n: number
  p50: number
  p95: number
  max: number
}

export function resumir(tiempos: readonly number[]): Resumen {
  return {
    n: tiempos.length,
    p50: percentil(tiempos, 50),
    p95: percentil(tiempos, 95),
    max: tiempos.length > 0 ? Math.max(...tiempos) : Number.NaN,
  }
}

export interface Resultado {
  consulta: string
  periodo: string
  resumen: Resumen | null
  /** Por qué no hay medición (permiso, servidor, sesión). */
  error: string | null
}

/** Resultados que incumplen el criterio (o que no se pudieron medir), del peor al mejor. */
export function incumplidos(
  resultados: readonly Resultado[],
  umbral = UMBRAL_P95_MS
): Resultado[] {
  return resultados
    .filter(
      (resultado) =>
        resultado.error !== null ||
        !resultado.resumen ||
        !(resultado.resumen.p95 < umbral)
    )
    .sort((a, b) => (b.resumen?.p95 ?? Infinity) - (a.resumen?.p95 ?? Infinity))
}

export function peor(resultados: readonly Resultado[]): Resultado | null {
  return resultados.reduce<Resultado | null>(
    (actual, resultado) =>
      resultado.resumen &&
      (!actual?.resumen || resultado.resumen.p95 > actual.resumen.p95)
        ? resultado
        : actual,
    null
  )
}

/** Fracción del umbral desde la que una combinación se marca «cerca» (poco margen para el crecimiento de datos). */
export const MARGEN_AVISO = 0.8

/** Combinaciones que cumplen pero con poco margen. */
export function cercaDelUmbral(
  resultados: readonly Resultado[],
  umbral = UMBRAL_P95_MS
): Resultado[] {
  return resultados.filter(
    (resultado) =>
      resultado.resumen !== null &&
      resultado.resumen.p95 < umbral &&
      resultado.resumen.p95 >= umbral * MARGEN_AVISO
  )
}

/**
 * Aviso si la máquina está ocupada (carga media de 1 minuto por encima de 3/4 de los núcleos): con la base en Docker
 * en la misma máquina, otros procesos (pruebas, compilaciones) inflan los tiempos.
 */
export function avisoCarga(carga: number, nucleos: number): string | null {
  if (!(nucleos > 0) || !(carga > nucleos * 0.75)) return null
  return `La máquina está ocupada (carga ${formatearNumero(carga, 1)} con ${nucleos} núcleos): los tiempos pueden salir inflados; repite la medición en reposo antes de concluir.`
}

export function ms(valor: number): string {
  return Number.isFinite(valor) ? formatearNumero(valor, 1) : "—"
}

export function tablaResultados(
  resultados: readonly Resultado[],
  umbral = UMBRAL_P95_MS
): string[] {
  const ancho = Math.max(
    8,
    ...resultados.map((resultado) => resultado.consulta.length)
  )
  const encabezado = `  ${"Consulta".padEnd(ancho)}  ${"Periodo".padEnd(8)}  ${"p50".padStart(8)}  ${"p95".padStart(8)}  ${"máx".padStart(8)}`
  return [
    encabezado,
    ...resultados.map((resultado) => {
      const inicio = `  ${resultado.consulta.padEnd(ancho)}  ${resultado.periodo.padEnd(8)}`
      if (!resultado.resumen)
        return `${inicio}  ✗ ${resultado.error ?? "sin datos"}`
      const { p50, p95, max } = resultado.resumen
      const marca =
        p95 >= umbral ? "  ✗" : p95 >= umbral * MARGEN_AVISO ? "  ⚠ cerca" : ""
      return `${inicio}  ${ms(p50).padStart(8)}  ${ms(p95).padStart(8)}  ${ms(max).padStart(8)}${marca}`
    }),
  ]
}

// ── Extremo a extremo ────────────────────────────────────────────────────────

/** Ruta de la API del explorador para la consulta (lo que pide el navegador). */
export function rutaApi(base: string, consulta: Consulta): string {
  const zona = ZONAS[consulta.nivel]
  const parametros = new URLSearchParams({
    vista: consulta.funcion === "geo_metricas" ? "mapa" : "detalle",
    nivel: consulta.nivel,
    metrica: consulta.metrica,
    desde: consulta.periodo.desde,
    hasta: consulta.periodo.hasta,
  })
  if (zona.departamento) parametros.set("depto", zona.departamento)
  if (consulta.funcion === "detalle_zona_geo") parametros.set("zona", zona.zona)
  return `${base}/api/geo/metricas?${parametros.toString()}`
}

/** Aplica las cabeceras `Set-Cookie` de una respuesta (el proxy refresca la sesión) al tarro de cookies. */
export function aplicarSetCookie(
  tarro: Map<string, string>,
  cabeceras: readonly string[]
): void {
  for (const cabecera of cabeceras) {
    const [par = "", ...atributos] = cabecera.split(";")
    const separador = par.indexOf("=")
    if (separador <= 0) continue
    const nombre = par.slice(0, separador).trim()
    const valor = par.slice(separador + 1).trim()
    const vence = atributos.some((atributo) => {
      const [clave = "", dato = ""] = atributo.split("=").map((x) => x.trim())
      if (clave.toLowerCase() === "max-age") return Number(dato) <= 0
      if (clave.toLowerCase() === "expires") {
        const instante = Date.parse(dato)
        return Number.isFinite(instante) && instante <= Date.now()
      }
      return false
    })
    if (vence || valor === "") tarro.delete(nombre)
    else tarro.set(nombre, valor)
  }
}

export function cabeceraCookie(tarro: ReadonlyMap<string, string>): string {
  return [...tarro].map(([nombre, valor]) => `${nombre}=${valor}`).join("; ")
}

// ── EXPLAIN (auto_explain y estadísticas por función) ───────────────────────

export interface FuncionMedida {
  funcion: string
  lenguaje: string
  /** Tiene cláusulas `SET` (p. ej. `search_path`): una función SQL así no se integra (inline) en la consulta. */
  conSet: boolean
  llamadas: number
  totalMs: number
  propioMs: number
}

export interface EstadisticaFuncion {
  funcion: string
  lenguaje: string
  conSet: boolean
  llamadas: number
  total: number
  propio: number
}

/** Lo que sumó una ejecución: diferencia entre dos lecturas de `pg_stat_xact_user_functions`. */
export function diferenciaFunciones(
  antes: readonly EstadisticaFuncion[],
  despues: readonly EstadisticaFuncion[]
): FuncionMedida[] {
  const previas = new Map(antes.map((fila) => [fila.funcion, fila]))
  return despues
    .map((fila) => {
      const previa = previas.get(fila.funcion)
      return {
        funcion: fila.funcion,
        lenguaje: fila.lenguaje,
        conSet: fila.conSet,
        llamadas: fila.llamadas - (previa?.llamadas ?? 0),
        totalMs: fila.total - (previa?.total ?? 0),
        propioMs: fila.propio - (previa?.propio ?? 0),
      }
    })
    .filter((fila) => fila.llamadas > 0)
    .sort((a, b) => b.totalMs - a.totalMs || a.funcion.localeCompare(b.funcion))
}

export interface SentenciaPlan {
  duracionMs: number
  consulta: string
  nodos: string[]
  /** `Seq Scan` con las filas que descartó el filtro (por todas sus vueltas). */
  barridos: { tabla: string; descartadas: number }[]
}

const DURACION = /duration:\s*([\d.]+)\s*ms/

/** Un mensaje de `auto_explain` (formato de texto): duración, texto de la consulta y nodos del plan. */
export function leerMensajeAutoExplain(mensaje: string): SentenciaPlan | null {
  const duracion = DURACION.exec(mensaje)
  const indiceTexto = mensaje.indexOf("Query Text:")
  if (!duracion || indiceTexto < 0) return null
  const lineas = mensaje.slice(indiceTexto + "Query Text:".length).split("\n")
  const inicioPlan = lineas.findIndex((linea) => /\(cost=/.test(linea))
  const texto = (inicioPlan < 0 ? lineas : lineas.slice(0, inicioPlan))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
  const plan = inicioPlan < 0 ? [] : lineas.slice(inicioPlan)
  const nodos: string[] = []
  const barridos: SentenciaPlan["barridos"] = []
  plan.forEach((linea, indice) => {
    const nodo =
      /(Seq Scan on \S+|Index Only Scan using \S+|Index Scan using \S+|Bitmap Index Scan on \S+|Function Scan on \S+)/.exec(
        linea
      )?.[1]
    if (nodo) nodos.push(nodo)
    const barrido = /Seq Scan on (\S+).*?loops=(\d+)\)/.exec(linea)
    if (barrido?.[1]) {
      // Los detalles del nodo (Filter, Rows Removed…) siguen hasta el próximo nodo.
      const fin = plan.findIndex(
        (otra, posterior) => posterior > indice && /\(cost=/.test(otra)
      )
      const detalles = plan.slice(indice + 1, fin < 0 ? undefined : fin)
      const descartadas = Number(
        detalles
          .map((detalle) => /Rows Removed by Filter: (\d+)/.exec(detalle)?.[1])
          .find(Boolean) ?? 0
      )
      barridos.push({
        tabla: barrido[1],
        descartadas: descartadas * Number(barrido[2] ?? 1),
      })
    }
  })
  return { duracionMs: Number(duracion[1]), consulta: texto, nodos, barridos }
}

export interface SentenciaAgrupada {
  consulta: string
  veces: number
  totalMs: number
  maxMs: number
  nodos: string[]
}

/** Agrupa por texto de la consulta (las de PL/pgSQL se repiten por cada llamada), de la más costosa a la menos. */
export function agruparSentencias(
  sentencias: readonly SentenciaPlan[],
  largo = 110
): SentenciaAgrupada[] {
  const grupos = new Map<string, SentenciaAgrupada>()
  for (const sentencia of sentencias) {
    const clave = sentencia.consulta.slice(0, largo)
    const grupo = grupos.get(clave) ?? {
      consulta: clave,
      veces: 0,
      totalMs: 0,
      maxMs: 0,
      nodos: [],
    }
    grupo.veces += 1
    grupo.totalMs += sentencia.duracionMs
    grupo.maxMs = Math.max(grupo.maxMs, sentencia.duracionMs)
    for (const nodo of sentencia.nodos) {
      if (!grupo.nodos.includes(nodo)) grupo.nodos.push(nodo)
    }
    grupos.set(clave, grupo)
  }
  return [...grupos.values()].sort(
    (a, b) => b.totalMs - a.totalMs || a.consulta.localeCompare(b.consulta)
  )
}

/** A partir de cuántas filas descartadas por un `Seq Scan` vale la pena pensar en un índice. */
export const DESCARTE_SIGNIFICATIVO = 1000
/** A partir de cuántas llamadas por consulta pesa una función SQL que no se integra en la consulta. */
export const LLAMADAS_SIGNIFICATIVAS = 1000
/** Llamadas a `geo_valores` en un detalle desde las que la serie mensual domina el tiempo. */
export const LLAMADAS_SERIE = 50

/** Conclusiones para el líder: si conviene un índice y qué otra cosa pesa (no cambia nada). */
export function conclusiones(
  funciones: readonly FuncionMedida[],
  sentencias: readonly SentenciaPlan[]
): string[] {
  const salida: string[] = []
  const porTabla = new Map<string, number>()
  for (const sentencia of sentencias) {
    for (const barrido of sentencia.barridos) {
      if (barrido.tabla.startsWith("pg_")) continue
      porTabla.set(
        barrido.tabla,
        (porTabla.get(barrido.tabla) ?? 0) + barrido.descartadas
      )
    }
  }
  const candidatas = [...porTabla]
    .filter(([, descartadas]) => descartadas >= DESCARTE_SIGNIFICATIVO)
    .sort(([, a], [, b]) => b - a)
  salida.push(
    candidatas.length > 0
      ? `Índice: candidatas por Seq Scan que descarta muchas filas: ${candidatas.map(([tabla, filas]) => `${tabla} (${formatearNumero(filas)} filas descartadas)`).join(", ")}. Revisa el filtro de esas sentencias antes de crear un índice.`
      : "Índice: no conviene uno nuevo; los planes leen las tablas grandes por índice y ningún Seq Scan descarta filas en volumen."
  )
  const sinIntegrar = funciones.filter(
    (funcion) =>
      funcion.lenguaje === "sql" &&
      funcion.conSet &&
      funcion.llamadas >= LLAMADAS_SIGNIFICATIVAS
  )
  if (sinIntegrar.length > 0) {
    salida.push(
      `Funciones SQL evaluadas fila a fila: ${sinIntegrar.map((funcion) => `${funcion.funcion} (${formatearNumero(funcion.llamadas)} llamadas, ${ms(funcion.totalMs)} ms)`).join(", ")}. Su cláusula SET search_path impide que Postgres las integre en la consulta; sin ella (ya califican los nombres) o con el predicado escrito en línea, ese costo desaparece.`
    )
  }
  const valores = funciones.find(
    (funcion) =>
      funcion.funcion === "private.geo_valores" &&
      funcion.llamadas >= LLAMADAS_SERIE
  )
  if (valores) {
    salida.push(
      `private.geo_valores: ${formatearNumero(valores.llamadas)} llamadas en una sola consulta (${ms(valores.totalMs)} ms, el grueso del tiempo). La serie mensual la invoca por cada mes y métrica (y cada una relee el rango y vuelve a validar la sesión por la RLS); calcular la serie agrupada por mes en una lectura por métrica la reduciría a una por métrica.`
    )
  }
  return salida
}

// ── Base de datos ────────────────────────────────────────────────────────────

class Revertir extends Error {}

function informar(linea = ""): void {
  process.stderr.write(`${linea}\n`)
}

function imprimir(linea = ""): void {
  process.stdout.write(`${linea}\n`)
}

type Tx = postgres.TransactionSql

/** Usuario ADMIN temporal con una sesión aal2 (todo dentro de la transacción que se revierte). */
async function prepararAdministrador(tx: Tx): Promise<void> {
  const usuario = randomUUID()
  const sesion = randomUUID()
  const email = `rendimiento.geo.${usuario.slice(0, 8)}@amo.test`
  await tx`select set_config('amo.modo_carga', 'on', true)`
  await tx`
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    values (${usuario}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email},
            now(), now(), now())`
  const perfiles = await tx`
    update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'), estado = 'ACTIVO',
           debe_cambiar_password = false
    where id = ${usuario}::uuid
    returning id`
  if (perfiles.length !== 1) {
    throw new Error("No se creó el perfil del administrador de la medición.")
  }
  await tx`
    insert into auth.sessions (id, user_id, created_at, updated_at, aal)
    values (${sesion}::uuid, ${usuario}::uuid, now(), now(), 'aal2')`
  await tx`select set_config('amo.modo_carga', '', true)`
  const claims = JSON.stringify({
    sub: usuario,
    role: "authenticated",
    aal: "aal2",
    session_id: sesion,
  })
  await tx`select set_config('request.jwt.claims', ${claims}, true)`
}

function mensajeError(error: unknown): string {
  if (error instanceof Error) {
    const detalle = (error as { detail?: string }).detail
    return detalle ? `${error.message}: ${detalle}` : error.message
  }
  return String(error)
}

async function medirEnBase(
  tx: Tx,
  consultas: readonly Consulta[],
  n: number
): Promise<Resultado[]> {
  const resultados: Resultado[] = []
  for (const consulta of consultas) {
    const etiqueta = etiquetaConsulta(consulta)
    process.stderr.write(`  ${etiqueta} · ${consulta.periodo.etiqueta}…`)
    // Un error (p. ej. sin permiso para la métrica) no aborta la transacción: se vuelve al punto de guardado.
    await tx`savepoint medicion`
    try {
      await tx.unsafe(bloqueMedicion(sqlDe(consulta), n))
      const [fila] = await tx<{ tiempos: string | null }[]>`
        select current_setting(${VARIABLE_TIEMPOS}, true) as tiempos`
      const resumen = resumir(leerTiempos(fila?.tiempos ?? null, n))
      await tx`release savepoint medicion`
      resultados.push({
        consulta: etiqueta,
        periodo: consulta.periodo.etiqueta,
        resumen,
        error: null,
      })
      process.stderr.write(` p95 ${ms(resumen.p95)} ms\n`)
    } catch (error) {
      await tx`rollback to savepoint medicion`
      resultados.push({
        consulta: etiqueta,
        periodo: consulta.periodo.etiqueta,
        resumen: null,
        error: mensajeError(error),
      })
      process.stderr.write(` ✗ ${mensajeError(error)}\n`)
    }
  }
  return resultados
}

async function leerEstadisticasFunciones(
  tx: Tx
): Promise<EstadisticaFuncion[]> {
  const filas = await tx<
    {
      funcion: string
      lenguaje: string
      con_set: boolean
      llamadas: number
      total: number
      propio: number
    }[]
  >`
    select s.schemaname || '.' || s.funcname as funcion, l.lanname::text as lenguaje, p.proconfig is not null as con_set,
           s.calls::int as llamadas, s.total_time::float8 as total, s.self_time::float8 as propio
    from pg_stat_xact_user_functions s
    join pg_proc p on p.oid = s.funcid
    join pg_language l on l.oid = p.prolang`
  return filas.map((fila) => ({
    funcion: fila.funcion,
    lenguaje: fila.lenguaje,
    conSet: fila.con_set,
    llamadas: fila.llamadas,
    total: fila.total,
    propio: fila.propio,
  }))
}

interface ResultadoExplain {
  periodo: Periodo
  plan: string[]
  funciones: FuncionMedida[]
  sentencias: SentenciaAgrupada[]
  conclusiones: string[]
}

/**
 * EXPLAIN ANALYZE de `detalle_zona_geo('pais', 'CO', …)` con `auto_explain` para ver las sentencias anidadas de
 * PL/pgSQL (sus mensajes LOG llegan al cliente) y `track_functions` para contar llamadas por función. La
 * instrumentación encarece la ejecución: aquí importa dónde se va el tiempo, no el total.
 */
async function explicar(
  tx: Tx,
  periodo: Periodo,
  mensajes: string[]
): Promise<ResultadoExplain> {
  const consulta: Consulta = {
    funcion: "detalle_zona_geo",
    nivel: "internacional",
    metrica: "anunciantes",
    periodo,
  }
  const llamada = sqlDe(consulta).replace(
    /^select count\(\*\) from /,
    "select * from "
  )
  await tx.unsafe("reset role")
  const antes = await leerEstadisticasFunciones(tx)
  await tx.unsafe(`set local track_functions = 'all'`)
  await tx.unsafe(`set local auto_explain.log_min_duration = 1`)
  await tx.unsafe(`set local auto_explain.log_analyze = on`)
  await tx.unsafe(`set local auto_explain.log_buffers = on`)
  await tx.unsafe(`set local auto_explain.log_nested_statements = on`)
  await tx.unsafe(`set local client_min_messages = log`)
  await tx.unsafe("set local role authenticated")
  mensajes.length = 0
  const plan = await tx.unsafe<{ "QUERY PLAN": string }[]>(
    `explain (analyze, buffers) ${llamada}`
  )
  await tx.unsafe("reset role")
  await tx.unsafe(`set local client_min_messages = notice`)
  await tx.unsafe(`set local auto_explain.log_min_duration = -1`)
  const despues = await leerEstadisticasFunciones(tx)
  await tx.unsafe(`set local track_functions = 'none'`)
  await tx.unsafe("set local role authenticated")

  const sentencias = mensajes
    .map(leerMensajeAutoExplain)
    .filter((sentencia): sentencia is SentenciaPlan => sentencia !== null)
    .filter((sentencia) => !/^explain\b/i.test(sentencia.consulta))
  const funciones = diferenciaFunciones(antes, despues)
  return {
    periodo,
    plan: plan.map((fila) => fila["QUERY PLAN"]),
    funciones,
    sentencias: agruparSentencias(sentencias),
    conclusiones: conclusiones(funciones, sentencias),
  }
}

// ── Extremo a extremo ────────────────────────────────────────────────────────

interface CredencialesPista {
  email: string
  password: string
  totpSecreto: string | null
}

interface SesionApi {
  tarro: Map<string, string>
  cerrar: () => Promise<void>
}

function variablesApp(): { url: string; clave: string } {
  const archivo = process.env.AMO_ARCHIVO_ENTORNO ?? ".env.local"
  const variables = existsSync(archivo)
    ? parseEnv(readFileSync(archivo, "utf8"))
    : {}
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? variables.NEXT_PUBLIC_SUPABASE_URL
  const clave =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    variables.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !clave) {
    throw new Error(
      `Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en ${archivo}.`
    )
  }
  if (esProduccion(url)) {
    throw new Error(
      `${archivo} apunta a producción: la medición de extremo a extremo no corre ahí.`
    )
  }
  return { url, clave }
}

/** Ingresa con contraseña y TOTP (aal2) y deja las cookies de `@supabase/ssr` en un tarro, como en el navegador. */
async function abrirSesion(
  credenciales: CredencialesPista
): Promise<SesionApi> {
  const { url, clave } = variablesApp()
  const tarro = new Map<string, string>()
  const cliente = createServerClient<Database>(url, clave, {
    cookies: {
      getAll: () => [...tarro].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) tarro.set(name, value)
          else tarro.delete(name)
        }
      },
    },
  })
  const ingreso = await cliente.auth.signInWithPassword({
    email: credenciales.email,
    password: credenciales.password,
  })
  if (ingreso.error) {
    throw new Error(`No se pudo ingresar: ${ingreso.error.message}`)
  }
  if (credenciales.totpSecreto) {
    const factores = await cliente.auth.mfa.listFactors()
    const factor = factores.data?.totp.find(
      (candidato) => candidato.status === "verified"
    )
    if (!factor) throw new Error("La cuenta no tiene un TOTP verificado.")
    // Un código ya usado (p. ej. al crear la cuenta de pista hace segundos) se rechaza: se reintenta con el siguiente.
    let verificacion = await cliente.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: await codigoTotpNuevo(credenciales.totpSecreto),
    })
    if (verificacion.error) {
      marcarTotpUsado(credenciales.totpSecreto)
      verificacion = await cliente.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: await codigoTotpNuevo(credenciales.totpSecreto),
      })
    }
    if (verificacion.error) {
      throw new Error(
        `No se pudo verificar el TOTP: ${verificacion.error.message}`
      )
    }
  }
  const nivel = await cliente.auth.mfa.getAuthenticatorAssuranceLevel()
  if (nivel.data?.currentLevel !== "aal2") {
    throw new Error("La sesión no quedó en aal2 (el rol ADMIN exige TOTP).")
  }
  return {
    tarro,
    cerrar: async () => {
      await cliente.auth.signOut({ scope: "local" })
    },
  }
}

async function hayServidor(base: string, consulta: Consulta): Promise<boolean> {
  try {
    await fetch(rutaApi(base, consulta), {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    })
    return true
  } catch {
    return false
  }
}

async function medirExtremo(
  base: string,
  sesion: SesionApi,
  consultas: readonly Consulta[],
  n: number
): Promise<Resultado[]> {
  const resultados: Resultado[] = []
  for (const consulta of consultas) {
    const etiqueta = etiquetaConsulta(consulta)
    process.stderr.write(`  ${etiqueta} · ${consulta.periodo.etiqueta}…`)
    const tiempos: number[] = []
    let error: string | null = null
    for (let i = 0; i < CALENTAMIENTO + n && !error; i += 1) {
      const inicio = performance.now()
      const respuesta = await fetch(rutaApi(base, consulta), {
        headers: { Cookie: cabeceraCookie(sesion.tarro) },
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      })
      const cuerpo = await respuesta.text()
      const duracion = performance.now() - inicio
      aplicarSetCookie(sesion.tarro, respuesta.headers.getSetCookie())
      if (!respuesta.ok) {
        let mensaje = cuerpo.slice(0, 160)
        try {
          mensaje =
            (JSON.parse(cuerpo) as { error?: { mensaje?: string } }).error
              ?.mensaje ?? mensaje
        } catch {
          // No era JSON (p. ej. una redirección del proxy): queda el texto recortado.
        }
        error = `HTTP ${respuesta.status}: ${mensaje}`
      } else if (i >= CALENTAMIENTO) {
        tiempos.push(duracion)
      }
    }
    const resumen = error ? null : resumir(tiempos)
    resultados.push({
      consulta: etiqueta,
      periodo: consulta.periodo.etiqueta,
      resumen,
      error,
    })
    process.stderr.write(
      resumen ? ` p95 ${ms(resumen.p95)} ms\n` : ` ✗ ${error}\n`
    )
  }
  return resultados
}

// ── Flujo ────────────────────────────────────────────────────────────────────

interface Informe {
  entorno: EntornoRendimiento
  generado: string
  n: number
  calentamiento: number
  umbralP95Ms: number
  periodos: Periodo[]
  base: Resultado[]
  extremo: { url: string; resultados: Resultado[] } | { omitido: string }
  explainNoDisponible: string | null
  explain: {
    periodo: string
    plan: string[]
    funciones: FuncionMedida[]
    sentencias: SentenciaAgrupada[]
    conclusiones: string[]
  }[]
}

function imprimirExplain(resultado: ResultadoExplain): void {
  imprimir(
    `\nEXPLAIN ANALYZE de detalle_zona_geo('pais', 'CO', ${resultado.periodo.desde}, ${resultado.periodo.hasta}) · ${resultado.periodo.etiqueta} (con instrumentación: los tiempos se inflan)`
  )
  for (const linea of resultado.plan) imprimir(`  ${linea}`)
  imprimir("  Funciones (llamadas · total · propio, ms):")
  for (const funcion of resultado.funciones.slice(0, 12)) {
    imprimir(
      `    ${funcion.funcion.padEnd(36)} ${formatearNumero(funcion.llamadas).padStart(8)} · ${ms(funcion.totalMs).padStart(8)} · ${ms(funcion.propioMs).padStart(8)}  ${funcion.lenguaje}${funcion.conSet ? " con SET" : ""}`
    )
  }
  imprimir(
    "  Sentencias anidadas más costosas (≥ 1 ms; veces · total · máx, ms):"
  )
  for (const sentencia of resultado.sentencias.slice(0, 8)) {
    imprimir(
      `    ${formatearNumero(sentencia.veces).padStart(5)} · ${ms(sentencia.totalMs).padStart(8)} · ${ms(sentencia.maxMs).padStart(7)}  ${sentencia.consulta}`
    )
    if (sentencia.nodos.length > 0) {
      imprimir(`            ${sentencia.nodos.slice(0, 6).join(" · ")}`)
    }
  }
  imprimir("  Conclusión:")
  for (const conclusion of resultado.conclusiones)
    imprimir(`    - ${conclusion}`)
}

async function main(): Promise<void> {
  const argumentos = leerArgumentos(process.argv.slice(2))
  const url = urlDb(argumentos.entorno)
  const periodos = periodosDe(new Date())
  const consultas = consultasDe(periodos)
  const mensajes: string[] = []
  const sql = postgres(url, {
    ssl: sslDe(argumentos.entorno),
    max: 1,
    prepare: false,
    idle_timeout: 20,
    onnotice: (aviso) => {
      if (aviso.severity === "LOG" && typeof aviso.message === "string") {
        mensajes.push(aviso.message)
      }
    },
    connection: { application_name: "amo-rendimiento-geo" },
  })

  imprimir(
    `Rendimiento del explorador geográfico · ${argumentos.entorno} · ${serializarFecha(new Date())} · N = ${argumentos.n} por combinación (+${CALENTAMIENTO} de calentamiento) · criterio p95 < ${UMBRAL_P95_MS} ms`
  )
  imprimir(
    `Periodos: ${periodos.map((periodo) => `${periodo.etiqueta} (${periodo.desde} a ${periodo.hasta})`).join(", ")}`
  )

  const carga = avisoCarga(loadavg()[0] ?? 0, availableParallelism())
  if (carga) imprimir(`⚠ ${carga}`)

  const salida: {
    base: Resultado[]
    explain: ResultadoExplain[]
    sinExplain: string | null
  } = { base: [], explain: [], sinExplain: null }
  try {
    const [conexion] = await sql<{ usuario: string }[]>`
      select session_user::text as usuario`
    if (conexion?.usuario !== "postgres") {
      throw new Error(
        "La conexión debe entrar como postgres (Session pooler de .env.db.<entorno>)."
      )
    }
    informar("En la base (administrador con aal2, transacción revertida)…")
    await sql
      .begin(async (tx) => {
        await tx`select set_config('statement_timeout', '600s', true), set_config('lock_timeout', '10s', true)`
        await prepararAdministrador(tx)
        await tx.unsafe("set local role authenticated")
        salida.base = await medirEnBase(tx, consultas, argumentos.n)
        if (argumentos.explain) {
          informar("EXPLAIN ANALYZE de detalle_zona_geo('pais', 'CO', …)…")
          // El periodo por defecto y el peor caso (el máximo).
          for (const periodo of new Set([periodos[0], periodos.at(-1)])) {
            if (!periodo) continue
            // auto_explain y track_functions son ajustes privilegiados: si la base no los permite, se informa y
            // las mediciones ya hechas se conservan.
            await tx`savepoint explicacion`
            try {
              salida.explain.push(await explicar(tx, periodo, mensajes))
              await tx`release savepoint explicacion`
            } catch (error) {
              await tx`rollback to savepoint explicacion`
              salida.sinExplain = mensajeError(error)
              break
            }
          }
        }
        throw new Revertir()
      })
      .catch((error: unknown) => {
        if (!(error instanceof Revertir)) throw error
      })
  } catch (error) {
    throw new Error(redactar(mensajeError(error), url))
  } finally {
    await sql.end({ timeout: 5 })
  }

  imprimir("\nEn la base (tiempo en el servidor, ms):")
  for (const linea of tablaResultados(salida.base)) imprimir(linea)
  const fallas = incumplidos(salida.base)
  const peorBase = peor(salida.base)
  imprimir(
    fallas.length === 0
      ? `✓ p95 < ${UMBRAL_P95_MS} ms en las ${salida.base.length} combinaciones (el mayor: ${ms(peorBase?.resumen?.p95 ?? Number.NaN)} ms, ${peorBase?.consulta ?? "—"} · ${peorBase?.periodo ?? "—"}).`
      : `✗ ${fallas.length === 1 ? "1 combinación no cumple" : `${fallas.length} combinaciones no cumplen`} p95 < ${UMBRAL_P95_MS} ms: ${fallas.map((falla) => `${falla.consulta} · ${falla.periodo}`).join("; ")}.`
  )
  const cerca = cercaDelUmbral(salida.base)
  if (cerca.length > 0) {
    imprimir(
      `⚠ Con poco margen (p95 ≥ ${formatearNumero(MARGEN_AVISO * 100)} % del umbral): ${cerca.map((resultado) => `${resultado.consulta} · ${resultado.periodo} (${ms(resultado.resumen?.p95 ?? Number.NaN)} ms)`).join("; ")}. Con más datos que la demo puede pasar el umbral: mira la conclusión del EXPLAIN.`
    )
  }

  let extremo: Informe["extremo"] = { omitido: "--sin-e2e" }
  if (argumentos.e2e) {
    extremo = await extremoAExtremo(argumentos, consultas)
  }

  for (const resultado of salida.explain) imprimirExplain(resultado)
  if (salida.sinExplain) {
    imprimir(
      `\nEXPLAIN ANALYZE: no disponible en esta base (${salida.sinExplain}).`
    )
  }

  if (argumentos.json) {
    const informe: Informe = {
      entorno: argumentos.entorno,
      generado: new Date().toISOString(),
      n: argumentos.n,
      calentamiento: CALENTAMIENTO,
      umbralP95Ms: UMBRAL_P95_MS,
      periodos,
      base: salida.base,
      extremo,
      explainNoDisponible: salida.sinExplain,
      explain: salida.explain.map((resultado) => ({
        periodo: resultado.periodo.etiqueta,
        plan: resultado.plan,
        funciones: resultado.funciones,
        sentencias: resultado.sentencias,
        conclusiones: resultado.conclusiones,
      })),
    }
    writeFileSync(argumentos.json, `${JSON.stringify(informe, null, 2)}\n`)
    imprimir(`\nInforme: ${argumentos.json}`)
  }
  if (fallas.length > 0) process.exitCode = 1
}

async function extremoAExtremo(
  argumentos: ArgumentosRendimiento,
  consultas: readonly Consulta[]
): Promise<Informe["extremo"]> {
  const omitir = (motivo: string): Informe["extremo"] => {
    imprimir(`\nDe extremo a extremo: se omite (${motivo}).`)
    return { omitido: motivo }
  }
  if (argumentos.entorno !== "local") {
    return omitir("solo en local: el servidor usa la base de .env.local")
  }
  const [primera] = consultas
  if (!primera || !(await hayServidor(argumentos.url, primera))) {
    return omitir(
      `no responde ${argumentos.url}; inicia pnpm build && pnpm start o indica --url`
    )
  }
  if (!existsSync(argumentos.cuenta)) {
    return omitir(
      `falta ${argumentos.cuenta}; créala con pnpm exec tsx scripts/bootstrap/cuenta-pista.ts rendimiento ADMIN`
    )
  }
  const credenciales = JSON.parse(
    readFileSync(argumentos.cuenta, "utf8")
  ) as CredencialesPista
  informar(`De extremo a extremo (${argumentos.url})…`)
  const sesion = await abrirSesion(credenciales)
  try {
    const resultados = await medirExtremo(
      argumentos.url,
      sesion,
      consultas,
      argumentos.n
    )
    imprimir(
      `\nDe extremo a extremo (GET /api/geo/metricas en ${argumentos.url}, ms; informativo):`
    )
    for (const linea of tablaResultados(resultados)) imprimir(linea)
    const peorExtremo = peor(resultados)
    if (peorExtremo?.resumen) {
      imprimir(
        `El mayor p95: ${ms(peorExtremo.resumen.p95)} ms (${peorExtremo.consulta} · ${peorExtremo.periodo}). Incluye el proxy, la autorización del DAL, PostgREST y la red local; el detalle hace además las lecturas de la serie corta y las subzonas.`
      )
    }
    return { url: argumentos.url, resultados }
  } finally {
    await sesion.cerrar()
  }
}

if (process.argv[1]?.endsWith("rendimiento-geo.ts")) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `rendimiento-geo falló: ${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exitCode = 1
  })
}
