/**
 * Nivel de verificación del medio y el camino para subir (módulo puro,
 * MED-007). El tope anual y su consumo los calcula `kpis_medio`; los umbrales
 * de aviso (80 %) y bloqueo (95 %) vienen de `niveles_verificacion`.
 */
import type { TipoDocumentoMedio } from "./requisitos"
import { NIVEL_MAXIMO } from "./requisitos"
import type { NivelVerificacion } from "./tipos"

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
  SEG_SOCIAL:
    "Planilla de pago de seguridad social (PILA) del último periodo.",
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
