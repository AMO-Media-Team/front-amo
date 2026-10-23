/**
 * Alertas de integridad de las métricas de un medio (INT-003, INT-004 en su
 * ficha, ADM-002), módulo puro: de `alertas_metricas(p_medio_id)` a por qué se
 * marcó cada una, con la cifra reportada al lado de lo esperable para su
 * cuenta. Las alertas son una herramienta del equipo AMO: ni el medio ni el
 * anunciante las ven (D67).
 *
 * Reglas de la BD (`private.fn_metricas_alertas`):
 *
 * - **Múltiplo:** el alcance (en TikTok, espectadores únicos) supera
 *   `múltiplo de la plataforma × seguidores al aceptar`.
 * - **Desviación:** con al menos `metricas.minimo_historial` métricas aprobadas
 *   de la MISMA cuenta y el mismo corte, el alcance o las impresiones (en
 *   TikTok, reproducciones) quedan por encima de `mediana × factor` o por
 *   debajo de `mediana ÷ factor`.
 * - Corregir las cifras no borra la alerta: queda la anterior en `alerta_previa`.
 */
import {
  type EstadoValidacion,
  PLATAFORMAS,
  type Plataforma,
} from "@/features/operacion/estados"
import { contar } from "@/features/operacion/formato"
import { nombresColumnas } from "@/features/operacion/metricas"
import { formatearNumero } from "@/lib/format"

import type { AlertaDelMedio, AlertaPrevia, DetalleAlerta } from "./tipos"

function objetoDe(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

function numeroDe(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor
  if (typeof valor === "string" && valor.trim() !== "") {
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : null
  }
  return null
}

function previaDe(valor: unknown): AlertaPrevia | null {
  const previa = objetoDe(valor)
  if (!previa) return null
  return {
    desviacion: previa.desviacion === true,
    multiploSuperado: previa.multiplo_superado === true,
    alcance: numeroDe(previa.alcance),
    impresiones: numeroDe(previa.impresiones),
  }
}

/** `metricas.detalle_alertas` (jsonb) → objeto tipado y tolerante a faltantes. */
export function leerDetalleAlerta(valor: unknown): DetalleAlerta {
  const detalle = objetoDe(valor) ?? {}
  const seguidores = numeroDe(detalle.seguidores)
  const multiplo = numeroDe(detalle.multiplo)
  return {
    alcance: numeroDe(detalle.alcance),
    impresiones: numeroDe(detalle.impresiones),
    medianaAlcance: numeroDe(detalle.mediana_historica),
    medianaImpresiones: numeroDe(detalle.mediana_impresiones),
    nHistorial: numeroDe(detalle.n_historial),
    factor: numeroDe(detalle.factor),
    seguidores,
    multiplo,
    limiteAlcance:
      numeroDe(detalle.limite_alcance) ??
      (seguidores !== null && multiplo !== null ? seguidores * multiplo : null),
    previa: previaDe(detalle.alerta_previa),
  }
}

/** Una cifra reportada frente a lo que la regla considera esperable. */
export interface Comparacion {
  /** Nombre según la plataforma: «Alcance», «Espectadores únicos»… */
  cifra: string
  reportado: number | null
  /** Lo esperable: `minimo` null = solo un tope. */
  minimo: number | null
  maximo: number | null
  /** La referencia de la regla: «Mediana de la cuenta: 1.193», «2 × 44.792 seguidores». */
  referencia: string
  fuera: boolean
}

export interface MotivoAlerta {
  clave: "multiplo" | "desviacion"
  titulo: string
  explicacion: string
  comparaciones: Comparacion[]
}

/** «2», «2,5»: el múltiplo y el factor se configuran con un decimal. */
function veces(valor: number): string {
  return formatearNumero(valor, 1)
}

function motivoMultiplo(
  detalle: DetalleAlerta,
  plataforma: Plataforma | null
): MotivoAlerta {
  const nombres = nombresColumnas(plataforma ?? "INSTAGRAM")
  const { multiplo, seguidores, limiteAlcance, alcance } = detalle
  const seEspera = plataforma
    ? `En ${PLATAFORMAS[plataforma]} se espera`
    : "Se espera"
  return {
    clave: "multiplo",
    titulo: `${nombres.alcance} por encima de sus seguidores`,
    explicacion:
      multiplo !== null && seguidores !== null
        ? `${seEspera} como máximo ${veces(multiplo)} × los ${formatearNumero(seguidores)} seguidores que tenía la cuenta al aceptar.`
        : "Supera lo esperable para los seguidores de la cuenta.",
    comparaciones:
      limiteAlcance !== null
        ? [
            {
              cifra: nombres.alcance,
              reportado: alcance,
              minimo: null,
              maximo: limiteAlcance,
              referencia:
                multiplo !== null && seguidores !== null
                  ? `${veces(multiplo)} × ${formatearNumero(seguidores)} seguidores`
                  : "Límite por seguidores",
              fuera: alcance !== null && alcance > limiteAlcance,
            },
          ]
        : [],
  }
}

function comparacionHistorica(
  cifra: string,
  reportado: number | null,
  mediana: number | null,
  factor: number
): Comparacion | null {
  if (mediana === null || mediana <= 0) return null
  const minimo = mediana / factor
  const maximo = mediana * factor
  return {
    cifra,
    reportado,
    minimo,
    maximo,
    referencia: `Mediana de la cuenta: ${formatearNumero(mediana)}`,
    fuera: reportado !== null && (reportado > maximo || reportado < minimo),
  }
}

function motivoDesviacion(
  detalle: DetalleAlerta,
  plataforma: Plataforma | null
): MotivoAlerta {
  const nombres = nombresColumnas(plataforma ?? "INSTAGRAM")
  const { factor, nHistorial } = detalle
  const comparaciones =
    factor !== null && factor > 0
      ? [
          comparacionHistorica(
            nombres.alcance,
            detalle.alcance,
            detalle.medianaAlcance,
            factor
          ),
          comparacionHistorica(
            nombres.impresiones,
            detalle.impresiones,
            detalle.medianaImpresiones,
            factor
          ),
        ].filter((comparacion): comparacion is Comparacion =>
          Boolean(comparacion)
        )
      : []
  const base =
    nHistorial !== null && nHistorial > 0
      ? `Se compara con la mediana de ${contar(nHistorial, "métrica aprobada", "métricas aprobadas")} de la misma cuenta en el mismo corte`
      : "Se compara con el histórico de la misma cuenta en el mismo corte"
  return {
    clave: "desviacion",
    titulo: "Fuera del histórico de la cuenta",
    explicacion:
      factor !== null && factor > 0
        ? `${base}: se marca cuando una cifra pasa de ${veces(factor)} veces la mediana o no llega a la mediana dividida entre ${veces(factor)}.`
        : `${base}.`,
    comparaciones,
  }
}

/** Por qué se marcó la métrica: un motivo por regla, con sus cifras lado a lado. */
export function motivosAlerta(
  alerta: Pick<
    AlertaDelMedio,
    "desviacion" | "multiplo" | "detalle" | "plataforma"
  >
): MotivoAlerta[] {
  return [
    ...(alerta.multiplo
      ? [motivoMultiplo(alerta.detalle, alerta.plataforma)]
      : []),
    ...(alerta.desviacion
      ? [motivoDesviacion(alerta.detalle, alerta.plataforma)]
      : []),
  ]
}

/** «Entre 398 y 3.578», «Hasta 89.584». */
export function textoEsperado(
  comparacion: Pick<Comparacion, "minimo" | "maximo">
): string {
  const maximo = formatearNumero(comparacion.maximo)
  return comparacion.minimo === null
    ? `Hasta ${maximo}`
    : `Entre ${formatearNumero(comparacion.minimo)} y ${maximo}`
}

/**
 * La alerta que tenía antes de que el medio corrigiera las cifras (la BD la
 * conserva para que nadie la borre corrigiendo): `null` si no la hubo.
 */
export function textoAlertaPrevia(
  previa: AlertaPrevia | null,
  plataforma: Plataforma | null
): string | null {
  if (!previa || (!previa.desviacion && !previa.multiploSuperado)) return null
  const nombres = nombresColumnas(plataforma ?? "INSTAGRAM")
  const reglas = [
    previa.multiploSuperado ? "por encima de sus seguidores" : null,
    previa.desviacion ? "fuera del histórico de la cuenta" : null,
  ].filter(Boolean)
  const cifras = [
    previa.alcance !== null
      ? `${nombres.alcance.toLocaleLowerCase("es-CO")} ${formatearNumero(previa.alcance)}`
      : null,
    previa.impresiones !== null
      ? `${nombres.impresiones.toLocaleLowerCase("es-CO")} ${formatearNumero(previa.impresiones)}`
      : null,
  ].filter(Boolean)
  return `Antes de que el medio corrigiera las cifras ya tenía alerta (${reglas.join(" y ")})${
    cifras.length > 0 ? `: ${cifras.join(", ")}` : ""
  }.`
}

/** Qué dejó anotado quien la validó, o que aún espera validación. */
export function notaValidacion(
  alerta: Pick<AlertaDelMedio, "estado" | "observaciones">
): { etiqueta: string; texto: string } {
  const observaciones = alerta.observaciones?.trim() || null
  switch (alerta.estado) {
    case "PENDIENTE":
      return {
        etiqueta: "Por validar",
        texto:
          "Espera la validación del equipo AMO: aprobarla exige anotar qué se revisó.",
      }
    case "APROBADA":
      return {
        etiqueta: "Lo que se revisó",
        texto: observaciones ?? "Se aprobó sin anotaciones.",
      }
    case "RECHAZADA":
      return {
        etiqueta: "Motivo del rechazo",
        texto: observaciones ?? "Se rechazó sin anotaciones.",
      }
  }
}

const ORDEN_ESTADO: Readonly<Record<EstadoValidacion, number>> = {
  PENDIENTE: 0,
  RECHAZADA: 1,
  APROBADA: 1,
}

/** Primero las que esperan validación; después, de la más reciente a la más antigua. */
export function ordenarAlertas<
  T extends Pick<AlertaDelMedio, "estado" | "creadaAt" | "metricaId">,
>(alertas: readonly T[]): T[] {
  return [...alertas].sort(
    (a, b) =>
      ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
      b.creadaAt.localeCompare(a.creadaAt) ||
      a.metricaId.localeCompare(b.metricaId)
  )
}

export interface ResumenAlertas {
  total: number
  porValidar: number
  aprobadas: number
  rechazadas: number
}

export function resumirAlertas(
  alertas: readonly Pick<AlertaDelMedio, "estado">[]
): ResumenAlertas {
  const contarEstado = (estado: EstadoValidacion) =>
    alertas.filter((alerta) => alerta.estado === estado).length
  return {
    total: alertas.length,
    porValidar: contarEstado("PENDIENTE"),
    aprobadas: contarEstado("APROBADA"),
    rechazadas: contarEstado("RECHAZADA"),
  }
}
