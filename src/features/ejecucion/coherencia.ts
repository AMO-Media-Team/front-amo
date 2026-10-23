/**
 * Coherencia de las métricas (INT-005; módulo puro, cliente y servidor). Las
 * MISMAS reglas que la BD, para bloquear en pantalla lo que ella rechazaría:
 *
 * - Por fila (CHECK `metricas_alcance_impresiones_chk` y
 *   `metricas_interacciones_chk`): impresiones ≥ alcance e interacciones ≤
 *   impresiones. En TikTok, reproducciones y espectadores únicos hacen de
 *   impresiones y alcance (`impresiones_norm`, `alcance_norm`).
 * - Entre cortes (`private.fn_metricas_coherencia`): 24 h ≤ 72 h ≤ 7 d en
 *   alcance, impresiones e interacciones, admitiendo que uno posterior baje
 *   hasta `metricas.tolerancia_cortes` (2 %) frente a uno anterior. Se compara
 *   con los cortes fijos no rechazados de la misma publicación; el
 *   personalizado no entra en esa comparación.
 *
 * Las comparaciones usan enteros exactos (`bigint`): `a < b × (1 − t)` como
 * `a × 10^k < b × (10^k − t × 10^k)`, para no diferir de `numeric` por un
 * redondeo de coma flotante en el borde de la tolerancia.
 */
import { formatearNumero, formatearPorcentaje } from "@/lib/format"

import { CAMPOS_INTERACCION } from "./campos-metricas"
import { esCorteFijo, NOMBRES_CORTE, ORDEN_CORTE } from "./cortes"
import type {
  CampoMetrica,
  CifrasCorte,
  Corte,
  CorteComparable,
  Plataforma,
  ValoresMetricas,
} from "./tipos"

/** `metricas.tolerancia_cortes` sembrada: lo que rige si no se puede leer. */
export const TOLERANCIA_CORTES_POR_DEFECTO = 0.02

/** Campo del formulario donde se muestra el problema (o la suma de interacciones). */
export type CampoCoherencia = CampoMetrica | "interacciones"

export interface ProblemaCoherencia {
  campo: CampoCoherencia
  mensaje: string
}

/** Las cifras con que la BD compara (`alcance_norm`, `impresiones_norm`, `interacciones`). */
export function cifrasDe(valores: ValoresMetricas): CifrasCorte {
  return {
    alcance: valores.alcance ?? valores.espectadoresUnicos,
    impresiones: valores.impresiones ?? valores.reproducciones,
    interacciones: CAMPOS_INTERACCION.reduce(
      (suma, campo) => suma + (valores[campo] ?? 0),
      0
    ),
  }
}

/**
 * Tolerancia de la configuración (`jsonb`: número o texto) como fracción
 * entre 0 y 0,2 (los límites de la clave); si no se entiende, la sembrada.
 */
export function leerTolerancia(valor: unknown): number {
  const numero =
    typeof valor === "number"
      ? valor
      : typeof valor === "string" && valor.trim() !== ""
        ? Number(valor)
        : Number.NaN
  return Number.isFinite(numero) && numero >= 0 && numero <= 0.2
    ? numero
    : TOLERANCIA_CORTES_POR_DEFECTO
}

/** Fracción decimal exacta: 0,02 → [2n, 100n]. */
function comoFraccion(tolerancia: number): readonly [bigint, bigint] {
  const texto = String(tolerancia)
  const decimal = /^(\d+)(?:\.(\d+))?$/.exec(texto)
  if (!decimal) {
    // Notación exponencial (muy pequeña): seis decimales bastan.
    return [BigInt(Math.round(tolerancia * 1_000_000)), BigInt(1_000_000)]
  }
  const [, entero, fraccion = ""] = decimal
  // La tolerancia tiene pocos decimales: 10^n es exacto en coma flotante.
  const escala = BigInt(10 ** fraccion.length)
  return [BigInt(entero) * escala + BigInt(fraccion || "0"), escala]
}

/** ¿`a < b × (1 − tolerancia)`? Igual que la BD (`v_alc < m.alcance_norm * v_tol`). */
export function caeBajoLaTolerancia(
  a: number,
  b: number,
  tolerancia: number
): boolean {
  const [numerador, escala] = comoFraccion(tolerancia)
  return BigInt(a) * escala < BigInt(b) * (escala - numerador)
}

type Medida = "alcance" | "impresiones" | "interacciones"

interface NombresMedida {
  /** Campo donde se muestra el problema. */
  campo: CampoCoherencia
  /** «el alcance», «las reproducciones». */
  nombre: string
}

function nombresMedida(plataforma: Plataforma, medida: Medida): NombresMedida {
  if (medida === "interacciones") {
    return { campo: "interacciones", nombre: "las interacciones" }
  }
  if (plataforma === "TIKTOK") {
    return medida === "alcance"
      ? { campo: "espectadoresUnicos", nombre: "los espectadores únicos" }
      : { campo: "reproducciones", nombre: "las reproducciones" }
  }
  return medida === "alcance"
    ? { campo: "alcance", nombre: "el alcance" }
    : { campo: "impresiones", nombre: "las impresiones" }
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1)
}

/** «el alcance fue», «las impresiones fueron». */
function fue(nombre: string): string {
  return nombre.startsWith("el ") ? "fue" : "fueron"
}

function problemasDeLaFila(
  plataforma: Plataforma,
  cifras: CifrasCorte
): ProblemaCoherencia[] {
  const problemas: ProblemaCoherencia[] = []
  const { alcance, impresiones, interacciones } = cifras
  const deImpresiones = nombresMedida(plataforma, "impresiones")
  const deAlcance = nombresMedida(plataforma, "alcance")
  if (alcance !== null && impresiones !== null && impresiones < alcance) {
    problemas.push({
      campo: deImpresiones.campo,
      mensaje: `${mayuscula(deImpresiones.nombre)} (${formatearNumero(impresiones)}) no pueden ser menos que ${deAlcance.nombre} (${formatearNumero(alcance)}).`,
    })
  }
  if (impresiones !== null && interacciones > impresiones) {
    problemas.push({
      campo: "interacciones",
      mensaje: `Las interacciones suman ${formatearNumero(interacciones)} y no pueden superar ${deImpresiones.nombre} (${formatearNumero(impresiones)}).`,
    })
  }
  return problemas
}

const MEDIDAS: readonly Medida[] = ["alcance", "impresiones", "interacciones"]

function problemasEntreCortes(
  plataforma: Plataforma,
  corte: Corte,
  cifras: CifrasCorte,
  otros: readonly CorteComparable[],
  tolerancia: number
): ProblemaCoherencia[] {
  if (!esCorteFijo(corte)) return []
  const orden = ORDEN_CORTE[corte]
  const caida = formatearPorcentaje(tolerancia, tolerancia * 100 < 1 ? 1 : 0)
  const problemas: ProblemaCoherencia[] = []
  const vistos = new Set<CampoCoherencia>()
  for (const otro of otros) {
    if (!esCorteFijo(otro.corte) || otro.estado === "RECHAZADA") continue
    const ordenOtro = ORDEN_CORTE[otro.corte]
    if (ordenOtro === orden) continue
    for (const medida of MEDIDAS) {
      const propio = cifras[medida]
      const ajeno = otro[medida]
      if (propio === null || ajeno === null) continue
      const { campo, nombre } = nombresMedida(plataforma, medida)
      if (vistos.has(campo)) continue
      const deOtro = NOMBRES_CORTE[otro.corte].largo
      if (ordenOtro < orden && caeBajoLaTolerancia(propio, ajeno, tolerancia)) {
        vistos.add(campo)
        problemas.push({
          campo,
          mensaje: `En el corte de ${deOtro}, ${nombre} ${fue(nombre)} ${formatearNumero(ajeno)}. Un corte posterior no puede quedar por debajo (se admite hasta un ${caida} menos).`,
        })
      } else if (
        ordenOtro > orden &&
        caeBajoLaTolerancia(ajeno, propio, tolerancia)
      ) {
        vistos.add(campo)
        problemas.push({
          campo,
          mensaje: `En el corte de ${deOtro}, ${nombre} ${fue(nombre)} ${formatearNumero(ajeno)}. Este corte es anterior y no puede superarlo en más del ${caida}.`,
        })
      }
    }
  }
  return problemas
}

export interface EntradaCoherencia {
  plataforma: Plataforma
  corte: Corte
  valores: ValoresMetricas
  /** Los demás cortes de la publicación (sin el que se edita). */
  otros: readonly CorteComparable[]
  tolerancia: number
}

/**
 * Todo lo que la BD rechazaría por coherencia, con el campo donde mostrarlo.
 * Vacío si las cifras cuadran.
 */
export function validarCoherencia({
  plataforma,
  corte,
  valores,
  otros,
  tolerancia,
}: EntradaCoherencia): ProblemaCoherencia[] {
  const cifras = cifrasDe(valores)
  return [
    ...problemasDeLaFila(plataforma, cifras),
    ...problemasEntreCortes(plataforma, corte, cifras, otros, tolerancia),
  ]
}
