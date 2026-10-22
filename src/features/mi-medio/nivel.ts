/**
 * Nivel de verificación del medio y el camino para subir (módulo puro,
 * MED-007). El tope anual y su consumo los calcula `kpis_medio`; los umbrales
 * de aviso (80 %) y bloqueo (95 %) vienen de `niveles_verificacion`.
 */
import {
  type ProgresoTope,
  progresoTope,
  UMBRALES_TOPE_POR_DEFECTO,
} from "@/features/dashboard/medio/datos"

import { formatearPorcentaje } from "@/lib/format"

import { enAlta, situacionMedio } from "./alta"
import {
  documentosExigidos,
  type EstadoRequisito,
  estadoRequisitos,
  NIVEL_MAXIMO,
  requisitoCubierto,
  requisitosParaEnviar,
  type TipoDocumentoMedio,
} from "./requisitos"
import type { ConsumoTope, NivelVerificacion, ResumenMiMedio } from "./tipos"

/** Cómo conseguir y cargar cada documento (lo que el medio necesita saber). */
export const AYUDA_DOCUMENTO: Readonly<Record<TipoDocumentoMedio, string>> = {
  CEDULA_FRENTE:
    "Foto de la cara frontal de tu cédula, con el documento completo y legible.",
  CEDULA_REVERSO:
    "Foto de la cara posterior de tu cédula, con el documento completo y legible.",
  PRUEBA_VIDA:
    "Selfie sosteniendo tu cédula junto a la cara. Es opcional: si prefieres no enviar tu foto, el equipo de AMO te verifica en una videollamada.",
  RUT: "Tu RUT actualizado. Lo descargas gratis del portal de la DIAN con tu usuario.",
  RUT_SOCIEDAD:
    "El RUT de la empresa, descargado del portal de la DIAN con el usuario de la sociedad.",
  CAMARA_COMERCIO:
    "Certificado de existencia y representación legal reciente, expedido por la Cámara de Comercio.",
  CERT_BANCARIA:
    "Certificación del banco a tu nombre con el número de la cuenta que registraste. La descargas de la app o la página del banco.",
  CERT_BILLETERA:
    "Certificado de tu billetera digital a tu nombre con el celular que registraste. Se descarga desde la app de la billetera.",
  SEG_SOCIAL: "Planilla de pago de seguridad social (PILA) del último periodo.",
}

export interface GuiaNivel {
  /** Qué hacer fuera de AMO para conseguir el nivel. */
  tramite: string
  pasos: readonly string[]
}

/** Guía para llegar a cada nivel desde el anterior. */
export const GUIA_NIVEL: Readonly<Record<number, GuiaNivel>> = {
  1: {
    tramite:
      "No necesitas trámites: basta con tu cédula y una cuenta a tu nombre.",
    pasos: [
      "Carga las dos caras de tu cédula.",
      "Registra la cuenta donde te pagamos y carga su certificado.",
      "Verifica al menos una de tus cuentas sociales.",
      "Envía tu medio a verificación.",
    ],
  },
  2: {
    tramite:
      "Inscríbete en el RUT de la DIAN. Es gratis y lo haces en línea en dian.gov.co o en una oficina de la DIAN.",
    pasos: [
      "Tramita o actualiza tu RUT como persona natural.",
      "Descarga el RUT en PDF y cárgalo en Documentos.",
      "El equipo de AMO lo revisa y sube tu nivel.",
    ],
  },
  3: {
    tramite:
      "Constituye tu empresa (por ejemplo, una S.A.S.) y regístrala en la Cámara de Comercio. Su RUT lo expide la DIAN.",
    pasos: [
      "Carga el certificado de existencia y representación legal.",
      "Carga el RUT de la sociedad.",
      "Actualiza tus datos de pago con el NIT y la cuenta de la empresa.",
      "El equipo de AMO lo revisa y sube tu nivel.",
    ],
  },
}

export function nivelPorNumero(
  niveles: readonly NivelVerificacion[],
  nivel: number
): NivelVerificacion | null {
  return niveles.find((fila) => fila.nivel === nivel) ?? null
}

/** El siguiente nivel, o `null` en el máximo (o si no está configurado). */
export function nivelSiguiente(
  niveles: readonly NivelVerificacion[],
  nivelActual: number
): NivelVerificacion | null {
  if (nivelActual >= NIVEL_MAXIMO) return null
  return nivelPorNumero(niveles, Math.max(1, nivelActual + 1))
}

/**
 * Documentos que el nivel pide además de los del nivel actual (lo nuevo que
 * hay que cargar para subir).
 */
export function documentosNuevos(
  actual: NivelVerificacion | null,
  siguiente: NivelVerificacion
): TipoDocumentoMedio[] {
  const tenidos = new Set(actual?.documentosRequeridos ?? [])
  return siguiente.documentosRequeridos.filter((tipo) => !tenidos.has(tipo))
}

/** «Nivel 2 · Persona natural con RUT». */
export function tituloNivel(nivel: NivelVerificacion | null, numero: number) {
  if (numero < 1) return "Sin nivel"
  return nivel ? `Nivel ${numero} · ${nivel.nombre}` : `Nivel ${numero}`
}

// ── Vista de «Nivel» ────────────────────────────────────────────────────────

export interface RequisitosNivel {
  nivel: NivelVerificacion
  /** Documentos del nivel y el certificado de pago, con su estado. */
  requisitos: EstadoRequisito[]
}

export interface ObjetivoNivel extends RequisitosNivel {
  /** Lo que hay que cargar para llegar (sin lo que ya pide el nivel actual). */
  nuevos: EstadoRequisito[]
  guia: GuiaNivel | null
  /**
   * Todo lo nuevo (salvo lo facultativo) está cargado: aprobado o en
   * revisión. Solo falta que el equipo AMO decida.
   */
  cargado: boolean
}

export type EstadoConsumo =
  /** Sin verificar: aún no tiene nivel ni tope. */
  | { tipo: "sin-nivel" }
  /** Nivel sin tope anual (persona jurídica). */
  | { tipo: "sin-tope" }
  /** La consulta del consumo falló: se explica sin tumbar la página. */
  | { tipo: "sin-datos" }
  | {
      tipo: "con-tope"
      tope: number
      consumido: number
      anio: number
      progreso: ProgresoTope
      alerta: number
      bloqueo: number
    }

export interface VistaNivel {
  /** Nivel vigente (0 mientras no está verificado). */
  numero: number
  actual: RequisitosNivel | null
  /** El siguiente nivel (el 1 durante el alta); `null` en el máximo. */
  objetivo: ObjetivoNivel | null
  /** Sin método de pago aún no se sabe qué certificado se pedirá. */
  faltaMetodoPago: boolean
  consumo: EstadoConsumo
}

function tiposDe(
  requisitos: readonly EstadoRequisito[]
): Set<TipoDocumentoMedio> {
  return new Set(requisitos.map((requisito) => requisito.tipo))
}

function estadoConsumo(
  actual: NivelVerificacion | null,
  consumo: ConsumoTope | null
): EstadoConsumo {
  if (!actual) return { tipo: "sin-nivel" }
  if (actual.topeAnual === null) return { tipo: "sin-tope" }
  if (!consumo) return { tipo: "sin-datos" }
  // El tope que aplica la BD es el de `kpis_medio`; el de la tabla de niveles
  // solo lo reemplaza si la consulta no lo trajo.
  const tope = consumo.tope ?? actual.topeAnual
  if (!(tope > 0)) return { tipo: "sin-tope" }
  const alerta = actual.porcentajeAlerta || UMBRALES_TOPE_POR_DEFECTO.alerta
  const bloqueo = actual.porcentajeBloqueo || UMBRALES_TOPE_POR_DEFECTO.bloqueo
  return {
    tipo: "con-tope",
    tope,
    consumido: consumo.consumido,
    anio: consumo.anio,
    progreso: progresoTope({
      consumido: consumo.consumido,
      tope,
      alerta,
      bloqueo,
    }),
    alerta,
    bloqueo,
  }
}

/**
 * Lo que muestra «Nivel» (MED-007): el nivel vigente con sus documentos y su
 * tope consumido, y el siguiente con lo nuevo que pide y la guía para
 * llegar. Durante el alta el nivel vigente es 0 y el objetivo, el 1.
 */
export function vistaNivel(
  resumen: ResumenMiMedio,
  consumo: ConsumoTope | null
): VistaNivel {
  const { medio, niveles, documentos, hoy, pago } = resumen
  const situacion = situacionMedio({
    estado: medio.estado,
    nivel: medio.nivel,
    enviadoVerificacionAt: medio.enviadoVerificacionAt,
    motivoEstado: medio.motivoEstado,
  })
  const numero = enAlta(situacion) ? 0 : Math.max(0, medio.nivel)
  const requisitosDe = (nivel: NivelVerificacion) => {
    const exigidos = documentosExigidos(
      nivel.documentosRequeridos,
      pago.metodoPago
    )
    return {
      requisitos: estadoRequisitos(exigidos.tipos, documentos, hoy),
      faltaMetodoPago: exigidos.faltaMetodoPago,
    }
  }

  const nivelActual = numero >= 1 ? nivelPorNumero(niveles, numero) : null
  const actual = nivelActual
    ? { nivel: nivelActual, requisitos: requisitosDe(nivelActual).requisitos }
    : null

  const nivelObjetivo = nivelSiguiente(niveles, numero)
  let objetivo: ObjetivoNivel | null = null
  if (nivelObjetivo) {
    const { requisitos, faltaMetodoPago } = requisitosDe(nivelObjetivo)
    const tenidos = actual
      ? tiposDe(actual.requisitos)
      : new Set<TipoDocumentoMedio>()
    const nuevos = requisitos.filter((r) => !tenidos.has(r.tipo))
    const exigibles = requisitosParaEnviar(nuevos)
    objetivo = {
      nivel: nivelObjetivo,
      requisitos,
      nuevos,
      guia: GUIA_NIVEL[nivelObjetivo.nivel] ?? null,
      cargado:
        !faltaMetodoPago &&
        exigibles.length > 0 &&
        exigibles.every(requisitoCubierto),
    }
  }

  return {
    numero,
    actual,
    objetivo,
    faltaMetodoPago: pago.metodoPago === null,
    consumo: estadoConsumo(nivelActual, consumo),
  }
}

export interface AvisoTope {
  tono: "aviso" | "peligro"
  titulo: string
  texto: string
}

/**
 * Aviso visible desde el umbral de alerta del nivel (80 %) y, más fuerte,
 * desde el de bloqueo (95 %), cuando ya no puede aceptar ofertas nuevas en
 * el año (el consumo se cuenta por año calendario de Bogotá).
 */
export function avisoTope(
  consumo: EstadoConsumo,
  hayNivelSiguiente: boolean
): AvisoTope | null {
  if (consumo.tipo !== "con-tope") return null
  const { progreso, bloqueo, anio } = consumo
  const llevas = formatearPorcentaje(progreso.porcentaje, 0)
  switch (progreso.estado) {
    case "alerta":
      return {
        tono: "aviso",
        titulo: `Llevas el ${llevas} de tu tope anual`,
        texto: `Desde el ${formatearPorcentaje(bloqueo, 0)} no podrás aceptar ofertas nuevas en ${anio}.${hayNivelSiguiente ? " Sube de nivel para ampliar tu tope." : ""}`,
      }
    case "bloqueo":
      return {
        tono: "peligro",
        titulo: `Llegaste al ${llevas} de tu tope anual`,
        texto: `No puedes aceptar ofertas nuevas hasta el 1 de enero de ${anio + 1}${hayNivelSiguiente ? " o hasta que subas de nivel" : ""}.`,
      }
    default:
      return null
  }
}
