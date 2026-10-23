/**
 * Métricas por corte de una publicación (módulo puro): nombres de las
 * columnas según la plataforma (TikTok no reporta alcance ni impresiones),
 * engagement y la explicación en lenguaje llano de las alertas de integridad
 * que calcula la BD (`private.fn_metricas_alertas`, docs/modelo-datos.md §3.12):
 *
 * - Múltiplo (INT-004): el alcance supera `metricas.multiplo_alcance_seguidores`
 *   de la plataforma × los seguidores con que la cuenta aceptó el cupo.
 * - Desviación (INT-003): con al menos `metricas.minimo_historial` métricas
 *   aprobadas del mismo corte y la MISMA cuenta, el alcance o las impresiones
 *   quedan por encima de la mediana × factor o por debajo de mediana ÷ factor.
 *
 * Las alertas persisten: si el medio corrige las cifras, el detalle guarda la
 * que tuvo (`alerta_previa`). Medio y anunciante no las ven; el equipo AMO
 * las lee con `alertas_metricas` (las columnas ya no se leen por PostgREST).
 */
import { formatearNumero } from "@/lib/format"

import {
  CORTES,
  type Corte,
  type EstadoValidacion,
  type Plataforma,
} from "./estados"

/** Referencias con que la BD evaluó las cifras (claves de `detalle_alertas`). */
export interface ReferenciasAlerta {
  /** Mediana del alcance (o espectadores únicos) del histórico de la cuenta. */
  medianaHistorica: number | null
  /** Mediana de las impresiones (o reproducciones) del mismo histórico. */
  medianaImpresiones: number | null
  /** Métricas aprobadas que forman ese histórico. */
  nHistorial: number | null
  /** Factor de desviación (`metricas.factor_desviacion`). */
  factor: number | null
  /** Seguidores de la cuenta al aceptar el cupo. */
  seguidores: number | null
  /** Múltiplo de seguidores permitido en la plataforma. */
  multiplo: number | null
  /** Alcance (o espectadores únicos) evaluado. */
  alcance: number | null
  /** Impresiones (o reproducciones) evaluadas. */
  impresiones: number | null
  /** `multiplo × seguidores`: por encima, alerta de múltiplo. */
  limiteAlcance: number | null
}

/** La alerta que tuvo la métrica antes de que el medio corrigiera las cifras. */
export interface AlertaPrevia extends ReferenciasAlerta {
  desviacion: boolean
  multiploSuperado: boolean
}

export interface DetalleAlertas extends ReferenciasAlerta {
  alertaPrevia: AlertaPrevia | null
}

export interface CorteMetrica {
  id: string
  publicacionId: string
  corte: Corte
  fechaCorte: string
  /** `alcance_norm` (en TikTok, espectadores únicos). */
  alcance: number | null
  /** `impresiones_norm` (en TikTok, reproducciones). */
  impresiones: number | null
  interacciones: number | null
  clics: number | null
  estado: EstadoValidacion
  alertaDesviacion: boolean
  alertaMultiplo: boolean
  detalleAlertas: DetalleAlertas
  observaciones: string | null
  validadaAt: string | null
  /** Hay captura que firmar (la ruta no viaja al navegador). */
  conImagen: boolean
}

export interface NombresColumnas {
  alcance: string
  impresiones: string
}

export function nombresColumnas(plataforma: Plataforma): NombresColumnas {
  return plataforma === "TIKTOK"
    ? { alcance: "Espectadores únicos", impresiones: "Reproducciones" }
    : { alcance: "Alcance", impresiones: "Impresiones" }
}

/** Interacciones sobre alcance (docs/kpis.md: engagement); `null` sin alcance. */
export function engagement(
  interacciones: number | null,
  alcance: number | null
): number | null {
  if (interacciones === null || !alcance) return null
  return interacciones / alcance
}

/** Cortes en el orden en que ocurren (24 h → 72 h → 7 días → personalizado). */
export function ordenarCortes<
  T extends Pick<CorteMetrica, "corte" | "fechaCorte">,
>(cortes: readonly T[]): T[] {
  return [...cortes].sort(
    (a, b) =>
      CORTES[a.corte].orden - CORTES[b.corte].orden ||
      a.fechaCorte.localeCompare(b.fechaCorte)
  )
}

function numeroDe(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor
  if (typeof valor === "string" && valor.trim() !== "") {
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : null
  }
  return null
}

function objetoDe(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

function leerReferencias(objeto: Record<string, unknown>): ReferenciasAlerta {
  return {
    medianaHistorica: numeroDe(objeto.mediana_historica),
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

/** `detalle_alertas` (jsonb de `alertas_metricas`) → objeto tipado y tolerante a faltantes. */
export function leerDetalleAlertas(valor: unknown): DetalleAlertas {
  const objeto = objetoDe(valor) ?? {}
  const previa = objetoDe(objeto.alerta_previa)
  return {
    ...leerReferencias(objeto),
    alertaPrevia: previa
      ? {
          ...leerReferencias(previa),
          desviacion: previa.desviacion === true,
          multiploSuperado: previa.multiplo_superado === true,
        }
      : null,
  }
}

/** Fila de `alertas_metricas` (las columnas que la interfaz necesita). */
export interface FilaAlertaMetrica {
  metrica_id: string
  alerta_desviacion: boolean
  alerta_multiplo: boolean
  detalle_alertas: unknown
}

export type AlertasDeMetrica = Pick<
  CorteMetrica,
  "alertaDesviacion" | "alertaMultiplo" | "detalleAlertas"
>

const SIN_ALERTAS: AlertasDeMetrica = {
  alertaDesviacion: false,
  alertaMultiplo: false,
  detalleAlertas: leerDetalleAlertas(null),
}

/**
 * Índice por métrica de lo que devuelve `alertas_metricas(p_asignacion_id)`.
 * Una métrica que no aparece (rol sin permiso, fila nueva) queda sin alertas.
 */
export function indexarAlertas(
  filas: readonly FilaAlertaMetrica[]
): (metricaId: string) => AlertasDeMetrica {
  const porMetrica = new Map(
    filas.map((fila) => [
      fila.metrica_id,
      {
        alertaDesviacion: fila.alerta_desviacion,
        alertaMultiplo: fila.alerta_multiplo,
        detalleAlertas: leerDetalleAlertas(fila.detalle_alertas),
      } satisfies AlertasDeMetrica,
    ])
  )
  return (metricaId) => porMetrica.get(metricaId) ?? SIN_ALERTAS
}

// ── Explicación ──────────────────────────────────────────────────────────────

type Desvio = "alto" | "bajo"

/** Hacia dónde se sale `valor` de la banda mediana ÷ factor … mediana × factor. */
export function desvioFrente(
  valor: number | null,
  mediana: number | null,
  factor: number | null
): Desvio | null {
  if (valor === null || mediana === null || factor === null) return null
  if (mediana <= 0 || factor <= 0) return null
  if (valor > mediana * factor) return "alto"
  if (valor < mediana / factor) return "bajo"
  return null
}

/** Cómo se nombra cada cifra en una frase (TikTok: espectadores y reproducciones). */
interface Sujeto {
  texto: string
  plural: boolean
}

function sujetos(plataforma: Plataforma): {
  alcance: Sujeto
  impresiones: Sujeto
} {
  return plataforma === "TIKTOK"
    ? {
        alcance: { texto: "los espectadores únicos", plural: true },
        impresiones: { texto: "las reproducciones", plural: true },
      }
    : {
        alcance: { texto: "el alcance", plural: false },
        impresiones: { texto: "las impresiones", plural: true },
      }
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1)
}

function minusculaInicial(texto: string): string {
  return texto.charAt(0).toLocaleLowerCase("es-CO") + texto.slice(1)
}

function motivoMultiplo(
  referencias: ReferenciasAlerta,
  alcanceCorte: number | null,
  sujeto: Sujeto
): string {
  const alcance = referencias.alcance ?? alcanceCorte
  const cifra = alcance !== null ? ` (${formatearNumero(alcance)})` : ""
  const limite =
    referencias.multiplo !== null && referencias.seguidores !== null
      ? ` (límite: ${formatearNumero(referencias.multiplo, 1)} × ${formatearNumero(referencias.seguidores)} seguidores${
          referencias.limiteAlcance !== null
            ? ` = ${formatearNumero(referencias.limiteAlcance)}`
            : ""
        })`
      : ""
  const reportado = sujeto.plural ? "reportados" : "reportado"
  const supera = sujeto.plural ? "superan" : "supera"
  return `${capitalizar(sujeto.texto)} ${reportado}${cifra} ${supera} lo esperable para sus seguidores${limite}.`
}

function frasesDesvio(
  referencias: ReferenciasAlerta,
  cifras: { alcance: number | null; impresiones: number | null },
  nombres: { alcance: Sujeto; impresiones: Sujeto }
): string[] {
  const { factor } = referencias
  if (factor === null) return []
  const veces = formatearNumero(factor, 1)
  const candidatos = [
    {
      sujeto: nombres.alcance,
      valor: referencias.alcance ?? cifras.alcance,
      mediana: referencias.medianaHistorica,
    },
    {
      sujeto: nombres.impresiones,
      valor: referencias.impresiones ?? cifras.impresiones,
      mediana: referencias.medianaImpresiones,
    },
  ]
  return candidatos.flatMap(({ sujeto, valor, mediana }) => {
    const desvio = desvioFrente(valor, mediana, factor)
    if (!desvio || valor === null || mediana === null) return []
    const verbo = sujeto.plural ? "son" : "es"
    return [
      desvio === "alto"
        ? `${sujeto.texto} (${formatearNumero(valor)}) ${verbo} más de ${veces} veces la mediana (${formatearNumero(mediana)})`
        : `${sujeto.texto} (${formatearNumero(valor)}) ${verbo} menos que la mediana (${formatearNumero(mediana)}) dividida entre ${veces}`,
    ]
  })
}

function motivoDesviacion(
  referencias: ReferenciasAlerta,
  cifras: { alcance: number | null; impresiones: number | null },
  nombres: { alcance: Sujeto; impresiones: Sujeto }
): string {
  const frases = frasesDesvio(referencias, cifras, nombres)
  if (frases.length > 0) {
    const historial =
      referencias.nHistorial !== null
        ? ` (${formatearNumero(referencias.nHistorial)} ${referencias.nHistorial === 1 ? "métrica aprobada" : "métricas aprobadas"} de la cuenta en este corte)`
        : ""
    return `Se desvía del histórico de la cuenta${historial}: ${frases.join("; ")}.`
  }
  // Sin las cifras evaluadas (detalle anterior a E3): la referencia general.
  const referencia =
    referencias.medianaHistorica !== null
      ? ` (mediana de sus publicaciones aprobadas: ${formatearNumero(referencias.medianaHistorica)}${
          referencias.factor !== null
            ? `; se alerta fuera de ${formatearNumero(referencias.factor, 1)} ×`
            : ""
        })`
      : ""
  return `Se desvía del histórico de la cuenta${referencia}.`
}

function motivos(
  alertas: { desviacion: boolean; multiplo: boolean },
  referencias: ReferenciasAlerta,
  cifras: { alcance: number | null; impresiones: number | null },
  plataforma: Plataforma
): string[] {
  const nombres = sujetos(plataforma)
  const lista: string[] = []
  if (alertas.multiplo) {
    lista.push(motivoMultiplo(referencias, cifras.alcance, nombres.alcance))
  }
  if (alertas.desviacion) {
    lista.push(motivoDesviacion(referencias, cifras, nombres))
  }
  return lista
}

/**
 * Por qué se marcó el corte, para quien valida (ADM-008 c1). Con la
 * plataforma, TikTok habla de espectadores únicos y reproducciones.
 */
export function describirAlertas(
  corte: Pick<
    CorteMetrica,
    "alertaDesviacion" | "alertaMultiplo" | "detalleAlertas" | "alcance"
  > &
    Partial<Pick<CorteMetrica, "impresiones">>,
  plataforma?: Plataforma
): string[] {
  return motivos(
    { desviacion: corte.alertaDesviacion, multiplo: corte.alertaMultiplo },
    corte.detalleAlertas,
    { alcance: corte.alcance, impresiones: corte.impresiones ?? null },
    plataforma ?? "INSTAGRAM"
  )
}

/**
 * La alerta que tuvo antes de que el medio corrigiera las cifras (persiste
 * para quien valida aunque las cifras nuevas ya no la disparen); `null` si
 * nunca la tuvo.
 */
export function describirAlertaPrevia(
  corte: Pick<CorteMetrica, "detalleAlertas">,
  plataforma?: Plataforma
): string | null {
  const previa = corte.detalleAlertas.alertaPrevia
  if (!previa || !(previa.desviacion || previa.multiploSuperado)) return null
  const lista = motivos(
    { desviacion: previa.desviacion, multiplo: previa.multiploSuperado },
    previa,
    { alcance: previa.alcance, impresiones: previa.impresiones },
    plataforma ?? "INSTAGRAM"
  )
  return `Antes de que el medio corrigiera las cifras tuvo alerta. ${lista.join(" ")}`
}

export function tieneAlerta(
  corte: Pick<CorteMetrica, "alertaDesviacion" | "alertaMultiplo">
): boolean {
  return corte.alertaDesviacion || corte.alertaMultiplo
}

/** Tuvo una alerta que la corrección del medio ya no dispara. */
export function tuvoAlertaPrevia(
  corte: Pick<CorteMetrica, "detalleAlertas">
): boolean {
  const previa = corte.detalleAlertas.alertaPrevia
  return previa !== null && (previa.desviacion || previa.multiploSuperado)
}

export interface DatoAlerta {
  etiqueta: string
  valor: string
}

/**
 * Las cifras del cálculo lado a lado (ADM-008 c1: mediana histórica, factor,
 * seguidores, múltiplo y límite), solo las que aplican a las alertas que
 * tiene. Para la vista de quien valida y la pestaña de alertas del medio.
 */
export function datosAlerta(
  corte: Pick<
    CorteMetrica,
    "alertaDesviacion" | "alertaMultiplo" | "detalleAlertas" | "alcance"
  > &
    Partial<Pick<CorteMetrica, "impresiones">>,
  plataforma?: Plataforma
): DatoAlerta[] {
  const tiktok = plataforma === "TIKTOK"
  const nombres = nombresColumnas(plataforma ?? "INSTAGRAM")
  const detalle = corte.detalleAlertas
  const alcance = detalle.alcance ?? corte.alcance
  const impresiones = detalle.impresiones ?? corte.impresiones ?? null
  const datos: DatoAlerta[] = []
  const agregar = (etiqueta: string, valor: string | null) => {
    if (valor !== null) datos.push({ etiqueta, valor })
  }
  const cifra = (valor: number | null) =>
    valor === null ? null : formatearNumero(valor)
  const veces = (valor: number | null) =>
    valor === null ? null : `${formatearNumero(valor, 1)} ×`

  if (corte.alertaMultiplo || corte.alertaDesviacion) {
    agregar(
      tiktok ? "Espectadores únicos reportados" : "Alcance reportado",
      cifra(alcance)
    )
  }
  if (corte.alertaMultiplo) {
    agregar("Seguidores al aceptar", cifra(detalle.seguidores))
    agregar("Múltiplo permitido", veces(detalle.multiplo))
    agregar(
      `Límite de ${minusculaInicial(nombres.alcance)}`,
      cifra(detalle.limiteAlcance)
    )
  }
  if (corte.alertaDesviacion) {
    agregar(
      tiktok ? "Reproducciones reportadas" : "Impresiones reportadas",
      cifra(impresiones)
    )
    agregar(
      `Mediana histórica (${minusculaInicial(nombres.alcance)})`,
      cifra(detalle.medianaHistorica)
    )
    agregar(
      `Mediana histórica (${minusculaInicial(nombres.impresiones)})`,
      cifra(detalle.medianaImpresiones)
    )
    agregar("Factor de desviación", veces(detalle.factor))
    agregar("Métricas en el histórico", cifra(detalle.nHistorial))
  }
  return datos
}
