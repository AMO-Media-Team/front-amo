/**
 * Alertas de integridad de una métrica (INT-003, INT-004; módulo puro): qué
 * calculó la BD (`private.fn_metricas_alertas`) y por qué se marcó, en
 * lenguaje llano y con las cifras para compararlas con la captura (ADM-008
 * c1: mediana histórica, factor, seguidores, múltiplo y límite).
 *
 * - Múltiplo (INT-004): el alcance supera `multiplo × seguidores` de la
 *   cuenta al aceptar (Facebook 3, Instagram 2, TikTok 20).
 * - Desviación (INT-003): con al menos `metricas.minimo_historial` métricas
 *   aprobadas de la misma cuenta y el mismo corte, el alcance o las
 *   impresiones quedan fuera de `mediana × factor` o `mediana ÷ factor`.
 *
 * Una alerta no se borra corrigiendo las cifras: `alerta_previa` guarda la que
 * tuvo antes, con sus cifras de entonces. Estas columnas solo las lee el
 * equipo AMO (`alertas_metricas`, `cola_metricas`): nunca viajan al medio.
 */
import type { Plataforma } from "@/features/operacion/estados"
import { nombresColumnas } from "@/features/operacion/metricas"
import { formatearNumero, formatearPorcentaje } from "@/lib/format"

/** Lo que guardó la BD en `detalle_alertas` al calcular la alerta. */
export interface CifrasAlerta {
  /** Mediana histórica del alcance (en TikTok, espectadores únicos). */
  medianaAlcance: number | null
  /** Mediana histórica de las impresiones (en TikTok, reproducciones). */
  medianaImpresiones: number | null
  /** Métricas aprobadas de la cuenta en ese corte con que se calculó. */
  nHistorial: number | null
  factor: number | null
  /** Seguidores de la cuenta al aceptar la oferta. */
  seguidores: number | null
  multiplo: number | null
  /** Alcance e impresiones reportados (normalizados) al calcular. */
  alcance: number | null
  impresiones: number | null
  /** `multiplo × seguidores`. */
  limiteAlcance: number | null
}

export interface AlertaPrevia {
  desviacion: boolean
  multiplo: boolean
  cifras: CifrasAlerta
}

export interface AlertaMetrica {
  desviacion: boolean
  multiplo: boolean
  cifras: CifrasAlerta
  /** La alerta que tuvo antes de que el medio corrigiera las cifras. */
  previa: AlertaPrevia | null
}

export const SIN_ALERTA: AlertaMetrica = {
  desviacion: false,
  multiplo: false,
  cifras: {
    medianaAlcance: null,
    medianaImpresiones: null,
    nHistorial: null,
    factor: null,
    seguidores: null,
    multiplo: null,
    alcance: null,
    impresiones: null,
    limiteAlcance: null,
  },
  previa: null,
}

function numeroDe(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor
  if (typeof valor === "string" && valor.trim() !== "") {
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : null
  }
  return null
}

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function leerCifras(objeto: Record<string, unknown>): CifrasAlerta {
  return {
    medianaAlcance: numeroDe(objeto.mediana_historica),
    medianaImpresiones: numeroDe(objeto.mediana_impresiones),
    nHistorial: numeroDe(objeto.n_historial),
    factor: numeroDe(objeto.factor),
    seguidores: numeroDe(objeto.seguidores),
    multiplo: numeroDe(objeto.multiplo),
    alcance: numeroDe(objeto.alcance),
    impresiones: numeroDe(objeto.impresiones),
    limiteAlcance: numeroDe(objeto.limite_alcance),
  }
}

/**
 * Fila de `alertas_metricas` o `cola_metricas` → alerta tipada, tolerante a
 * faltantes (`detalle_alertas` es `jsonb`).
 */
export function leerAlerta(fila: {
  alerta_desviacion: boolean | null
  alerta_multiplo: boolean | null
  detalle_alertas: unknown
}): AlertaMetrica {
  const detalle = comoObjeto(fila.detalle_alertas)
  const previa = comoObjeto(detalle.alerta_previa)
  const conPrevia =
    previa.desviacion === true || previa.multiplo_superado === true
  return {
    desviacion: fila.alerta_desviacion === true,
    multiplo: fila.alerta_multiplo === true,
    cifras: leerCifras(detalle),
    previa: conPrevia
      ? {
          desviacion: previa.desviacion === true,
          multiplo: previa.multiplo_superado === true,
          cifras: leerCifras(previa),
        }
      : null,
  }
}

export function tieneAlerta(
  alerta: Pick<AlertaMetrica, "desviacion" | "multiplo">
): boolean {
  return alerta.desviacion || alerta.multiplo
}

/** Tiene alerta ahora o la tuvo antes de corregirse. */
export function tuvoAlerta(alerta: AlertaMetrica): boolean {
  return tieneAlerta(alerta) || alerta.previa !== null
}

// ── Por qué ──────────────────────────────────────────────────────────────────

export type MedidaAlerta = "alcance" | "impresiones"

export type MotivoAlerta =
  | {
      tipo: "multiplo"
      /** «Alcance» o «Espectadores únicos». */
      nombre: string
      reportado: number | null
      limite: number | null
      seguidores: number | null
      multiplo: number | null
    }
  | {
      tipo: "desviacion"
      medida: MedidaAlerta
      nombre: string
      reportado: number
      mediana: number
      factor: number
      /** `mediana ÷ factor` y `mediana × factor`: fuera de ahí se alerta. */
      minimo: number
      maximo: number
      sentido: "sobre" | "bajo"
      /** `reportado ÷ mediana`. */
      proporcion: number
      nHistorial: number | null
    }
  /** La BD marcó desviación pero el detalle no permite reconstruirla. */
  | { tipo: "desviacion-sin-detalle"; nHistorial: number | null }

function desviacionDe(
  medida: MedidaAlerta,
  nombre: string,
  reportado: number | null,
  mediana: number | null,
  factor: number | null,
  nHistorial: number | null
): MotivoAlerta | null {
  if (reportado === null || mediana === null || factor === null) return null
  if (mediana <= 0 || factor <= 0) return null
  const maximo = mediana * factor
  const minimo = mediana / factor
  if (reportado <= maximo && reportado >= minimo) return null
  return {
    tipo: "desviacion",
    medida,
    nombre,
    reportado,
    mediana,
    factor,
    minimo,
    maximo,
    sentido: reportado > maximo ? "sobre" : "bajo",
    proporcion: reportado / mediana,
    nHistorial,
  }
}

function motivosDe(
  marcas: { desviacion: boolean; multiplo: boolean },
  cifras: CifrasAlerta,
  plataforma: Plataforma
): MotivoAlerta[] {
  const columnas = nombresColumnas(plataforma)
  const motivos: MotivoAlerta[] = []
  if (marcas.multiplo) {
    motivos.push({
      tipo: "multiplo",
      nombre: columnas.alcance,
      reportado: cifras.alcance,
      limite:
        cifras.limiteAlcance ??
        (cifras.multiplo !== null && cifras.seguidores !== null
          ? cifras.multiplo * cifras.seguidores
          : null),
      seguidores: cifras.seguidores,
      multiplo: cifras.multiplo,
    })
  }
  if (marcas.desviacion) {
    const desviaciones = [
      desviacionDe(
        "alcance",
        columnas.alcance,
        cifras.alcance,
        cifras.medianaAlcance,
        cifras.factor,
        cifras.nHistorial
      ),
      desviacionDe(
        "impresiones",
        columnas.impresiones,
        cifras.impresiones,
        cifras.medianaImpresiones,
        cifras.factor,
        cifras.nHistorial
      ),
    ].filter((motivo): motivo is MotivoAlerta => motivo !== null)
    motivos.push(
      ...(desviaciones.length > 0
        ? desviaciones
        : [
            {
              tipo: "desviacion-sin-detalle",
              nHistorial: cifras.nHistorial,
            } as const,
          ])
    )
  }
  return motivos
}

/** Cada razón por la que la métrica tiene alerta hoy, con sus cifras. */
export function motivosAlerta(
  alerta: AlertaMetrica,
  plataforma: Plataforma
): MotivoAlerta[] {
  return motivosDe(alerta, alerta.cifras, plataforma)
}

/** Las razones de la alerta que tuvo antes de corregirse (vacío si no la tuvo). */
export function motivosAlertaPrevia(
  alerta: AlertaMetrica,
  plataforma: Plataforma
): MotivoAlerta[] {
  return alerta.previa
    ? motivosDe(alerta.previa, alerta.previa.cifras, plataforma)
    : []
}

interface Sujeto {
  /** «El alcance», «Las impresiones», «Los espectadores únicos». */
  texto: string
  plural: boolean
}

/** El nombre de la cifra con su artículo, para concordar el verbo. */
function sujeto(nombre: string): Sujeto {
  const minuscula =
    nombre.charAt(0).toLocaleLowerCase("es-CO") + nombre.slice(1)
  if (!minuscula.endsWith("s"))
    return { texto: `El ${minuscula}`, plural: false }
  const femenino =
    minuscula.startsWith("impresiones") ||
    minuscula.startsWith("reproducciones")
  return { texto: `${femenino ? "Las" : "Los"} ${minuscula}`, plural: true }
}

function factorTexto(factor: number): string {
  return formatearNumero(factor, factor % 1 === 0 ? 0 : 1)
}

/** «3 veces» / «1,5 veces»: proporción frente a la mediana. */
function veces(proporcion: number): string {
  return `${formatearNumero(proporcion, proporcion >= 10 ? 0 : 1)} veces`
}

/** Explicación de una razón, lista para leer (también para lectores de pantalla). */
export function explicarMotivo(motivo: MotivoAlerta): string {
  switch (motivo.tipo) {
    case "multiplo": {
      const { texto, plural } = sujeto(motivo.nombre)
      const reportado =
        motivo.reportado !== null
          ? ` (${formatearNumero(motivo.reportado)})`
          : ""
      const limite =
        motivo.limite !== null
          ? ` de ${formatearNumero(motivo.limite)}${
              motivo.multiplo !== null && motivo.seguidores !== null
                ? `: ${factorTexto(motivo.multiplo)} × los ${formatearNumero(motivo.seguidores)} seguidores que tenía la cuenta al aceptar`
                : ""
            }`
          : ""
      return `${texto}${reportado} ${plural ? "superan" : "supera"} el límite${limite}.`
    }
    case "desviacion": {
      const { texto, plural } = sujeto(motivo.nombre)
      const reportado = formatearNumero(motivo.reportado)
      const mediana = formatearNumero(motivo.mediana)
      const factor = factorTexto(motivo.factor)
      return motivo.sentido === "sobre"
        ? `${texto} (${reportado}) ${plural ? "son" : "es"} ${veces(motivo.proporcion)} la mediana de la cuenta en este corte (${mediana}); se alerta por encima de ${formatearNumero(motivo.maximo)} (${factor} × la mediana).`
        : `${texto} (${reportado}) ${plural ? "equivalen" : "equivale"} al ${formatearPorcentaje(motivo.proporcion, 0)} de la mediana de la cuenta en este corte (${mediana}); se alerta por debajo de ${formatearNumero(motivo.minimo)} (la mediana ÷ ${factor}).`
    }
    case "desviacion-sin-detalle":
      return "Las cifras se desvían del histórico de la cuenta en este corte."
  }
}

/** Etiqueta corta de una razón para las tarjetas de la cola. */
export function resumirMotivo(motivo: MotivoAlerta): string {
  switch (motivo.tipo) {
    case "multiplo":
      return `${motivo.nombre} sobre el límite por seguidores`
    case "desviacion":
      return motivo.sentido === "sobre"
        ? `${motivo.nombre}: ${veces(motivo.proporcion)} su mediana`
        : `${motivo.nombre}: ${formatearPorcentaje(motivo.proporcion, 0)} de su mediana`
    case "desviacion-sin-detalle":
      return "Fuera de su histórico"
  }
}

/** Con cuántas métricas aprobadas se calculó la mediana (o `null`). */
export function textoHistorial(nHistorial: number | null): string | null {
  if (nHistorial === null || nHistorial <= 0) return null
  return `Mediana calculada con ${formatearNumero(nHistorial)} ${
    nHistorial === 1 ? "métrica aprobada" : "métricas aprobadas"
  } de la misma cuenta en este corte.`
}

/**
 * Campos del formulario de métricas que la alerta señala (se resaltan junto
 * a la captura): el alcance (en TikTok, espectadores únicos) y, si se
 * desvían, las impresiones (en TikTok, reproducciones).
 */
export function camposSenalados(
  alerta: AlertaMetrica,
  plataforma: Plataforma
): string[] {
  const alcance = plataforma === "TIKTOK" ? "espectadoresUnicos" : "alcance"
  const impresiones = plataforma === "TIKTOK" ? "reproducciones" : "impresiones"
  const campos = new Set<string>()
  for (const motivo of motivosAlerta(alerta, plataforma)) {
    if (motivo.tipo === "multiplo") campos.add(alcance)
    if (motivo.tipo === "desviacion") {
      campos.add(motivo.medida === "alcance" ? alcance : impresiones)
    }
  }
  return [...campos]
}
