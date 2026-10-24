/**
 * Lista de alta del medio y situación de su verificación (módulo puro, MED-002).
 *
 * Cinco pasos: perfil, documentos, pago, cuentas y términos; todos cuentan
 * para enviar a verificación. La BD (`enviar_medio_a_verificacion_srv`)
 * vuelve a exigir al menos una cuenta social, documentos del nivel y datos de
 * pago completos, y el equipo AMO decide el resto.
 */
import type { Route } from "next"

import {
  DOCUMENTO_FACULTATIVO,
  type EstadoMedio,
  type EstadoRequisito,
  requisitoCubierto,
  requisitosParaEnviar,
  TEXTO_CERTIFICADO_CUENTA_ANTERIOR,
} from "./requisitos"

// ── Rutas de «Mi medio» (contrato con el resolvedor `/ir` y los demás paquetes) ─

const ruta = (valor: `/${string}`): Route => valor as Route

export const RUTAS_MI_MEDIO = {
  inicio: ruta("/mi-medio"),
  perfil: ruta("/mi-medio/perfil"),
  documentos: ruta("/mi-medio/documentos"),
  pago: ruta("/mi-medio/pago"),
  cuentas: ruta("/mi-medio/cuentas"),
  nivel: ruta("/mi-medio/nivel"),
  reputacion: ruta("/mi-medio/reputacion"),
} as const

/**
 * `?nivel=1|2|3` de «Mis documentos»: el nivel cuyos documentos se consultan.
 * Lo lee la lista de documentos y lo escribe «Nivel» al enlazarla.
 */
export const PARAMETRO_NIVEL_DOCUMENTOS = "nivel"

/** «Mis documentos» abierta en los documentos de un nivel. */
export function rutaDocumentosDelNivel(nivel: number): Route {
  return ruta(`/mi-medio/documentos?${PARAMETRO_NIVEL_DOCUMENTOS}=${nivel}`)
}

/** Pantalla de la compuerta de términos, de regreso a «Mi medio». */
export const RUTA_TERMINOS = ruta(
  `/aceptar-terminos?next=${encodeURIComponent(RUTAS_MI_MEDIO.inicio)}`
)

// ── Situación de la verificación ────────────────────────────────────────────

export type SituacionMedio =
  | { tipo: "alta" }
  | { tipo: "en-revision"; enviadoAt: string }
  | { tipo: "rechazado"; motivo: string | null; enviadoAt: string | null }
  | { tipo: "verificado"; nivel: number }
  | { tipo: "suspendido"; motivo: string | null }

export interface EntradaSituacion {
  estado: EstadoMedio
  nivel: number
  enviadoVerificacionAt: string | null
  motivoEstado: string | null
}

export function situacionMedio({
  estado,
  nivel,
  enviadoVerificacionAt,
  motivoEstado,
}: EntradaSituacion): SituacionMedio {
  const motivo = motivoEstado?.trim() || null
  switch (estado) {
    case "PENDIENTE":
      return enviadoVerificacionAt
        ? { tipo: "en-revision", enviadoAt: enviadoVerificacionAt }
        : { tipo: "alta" }
    case "RECHAZADO":
      return { tipo: "rechazado", motivo, enviadoAt: enviadoVerificacionAt }
    case "VERIFICADO":
      return { tipo: "verificado", nivel }
    case "SUSPENDIDO":
      return { tipo: "suspendido", motivo }
  }
}

/** Mientras no esté verificado (ni suspendido), el alta es lo principal. */
export function enAlta(situacion: SituacionMedio): boolean {
  return (
    situacion.tipo === "alta" ||
    situacion.tipo === "en-revision" ||
    situacion.tipo === "rechazado"
  )
}

// ── Pasos ───────────────────────────────────────────────────────────────────

export type IdPasoAlta =
  "perfil" | "documentos" | "pago" | "cuentas" | "terminos"

/**
 * - `completo`: listo.
 * - `en-curso`: empezado o enviado, falta algo o espera revisión.
 * - `pendiente`: sin empezar.
 * - `atencion`: hay algo rechazado o vencido que corregir.
 */
export type EstadoPaso = "completo" | "en-curso" | "pendiente" | "atencion"

export interface PasoAlta {
  id: IdPasoAlta
  titulo: string
  /** Qué se pide en el paso. */
  descripcion: string
  /** En qué va (frase corta, en segunda persona). */
  detalle: string
  estado: EstadoPaso
  /**
   * Cumple lo que se exige para enviar. Puede estar listo y pedir atención a
   * la vez (un documento aprobado que vence pronto).
   */
  listo: boolean
  /** Dónde se completa; `null` si no hay nada que hacer ahí. */
  href: Route | null
}

export interface DatosAlta {
  perfil: {
    tieneDescripcion: boolean
    categorias: number
    paisesAudiencia: number
  }
  documentos: {
    nivel: number
    requisitos: readonly EstadoRequisito[]
    faltaMetodoPago: boolean
  }
  pago: {
    titular: boolean
    documentoIdentidad: boolean
    cuentaPago: boolean
  }
  cuentas: {
    registradas: number
    verificadas: number
    /** Con la captura cargada, esperando la revisión de AMO. */
    enRevision: number
    /** Verificación iniciada sin captura: aún no le llega a AMO. */
    sinCaptura: number
    rechazadas: number
  }
  terminos: { pendientes: number }
}

function plural(cantidad: number, singular: string, varios: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : varios}`
}

function pasoPerfil({ perfil }: DatosAlta): PasoAlta {
  const completo = perfil.tieneDescripcion && perfil.categorias > 0
  const faltan = [
    perfil.categorias > 0 ? null : "tus categorías",
    perfil.tieneDescripcion ? null : "la descripción de tu audiencia",
  ].filter((texto) => texto !== null)
  return {
    id: "perfil",
    titulo: "Perfil del medio",
    descripcion:
      "Nombre, tipo, municipio, temas y a quién le llega tu contenido.",
    detalle: completo
      ? perfil.paisesAudiencia > 0
        ? "Completo, con el origen de tu audiencia."
        : "Completo. Puedes sumar el origen de tu audiencia por país."
      : `Agrega ${faltan.join(" y ")}.`,
    estado: completo ? "completo" : "en-curso",
    listo: completo,
    href: RUTAS_MI_MEDIO.perfil,
  }
}

function pasoDocumentos({ documentos }: DatosAlta): PasoAlta {
  const exigibles = requisitosParaEnviar(documentos.requisitos)
  const cubiertos = exigibles.filter(requisitoCubierto)
  const conProblema = documentos.requisitos.filter(
    (r) =>
      r.situacion === "rechazado" ||
      r.situacion === "vencido" ||
      r.deCuentaAnterior
  )
  const enRevision = cubiertos.filter((r) => r.situacion === "en-revision")
  const porVencer = cubiertos.filter(
    (r) => r.porVencer && !r.renovacionEnRevision
  )
  const faltan = exigibles.length - cubiertos.length
  const completo =
    !documentos.faltaMetodoPago && faltan === 0 && exigibles.length > 0

  let estado: EstadoPaso
  let detalle: string
  if (conProblema.length === 1 && conProblema[0].deCuentaAnterior) {
    estado = "atencion"
    detalle = TEXTO_CERTIFICADO_CUENTA_ANTERIOR
  } else if (conProblema.length > 0) {
    estado = "atencion"
    detalle = `${plural(conProblema.length, "documento necesita que lo cargues", "documentos necesitan que los cargues")} de nuevo.`
  } else if (completo && porVencer.length > 0) {
    estado = "atencion"
    detalle = `${plural(porVencer.length, "documento vence", "documentos vencen")} pronto: carga uno vigente.`
  } else if (completo) {
    estado = "completo"
    detalle =
      enRevision.length > 0
        ? `Cargados. ${plural(enRevision.length, "está", "están")} en revisión.`
        : "Aprobados y al día."
  } else if (cubiertos.length === 0) {
    estado = "pendiente"
    detalle = documentos.faltaMetodoPago
      ? "Carga tu cédula. El certificado de pago se pide cuando registres tu cuenta."
      : `Carga los ${plural(exigibles.length, "documento", "documentos")} del nivel ${documentos.nivel}.`
  } else {
    estado = "en-curso"
    detalle = documentos.faltaMetodoPago
      ? "Falta el certificado de tu cuenta de pago: registra primero la cuenta."
      : `${plural(faltan, "documento por cargar", "documentos por cargar")}.`
  }
  const facultativo = documentos.requisitos.find(
    (r) => r.tipo === DOCUMENTO_FACULTATIVO
  )
  const conVida = facultativo && requisitoCubierto(facultativo)
  return {
    id: "documentos",
    titulo: "Documentos",
    descripcion: conVida
      ? `Los que pide el nivel ${documentos.nivel} y el certificado de tu cuenta de pago.`
      : `Los que pide el nivel ${documentos.nivel} y el certificado de tu cuenta de pago. La prueba de vida es opcional: puede hacerse por videollamada.`,
    detalle,
    estado,
    listo: completo,
    href: RUTAS_MI_MEDIO.documentos,
  }
}

function pasoPago({ pago }: DatosAlta): PasoAlta {
  const completos = [pago.titular, pago.documentoIdentidad, pago.cuentaPago]
  const listos = completos.filter(Boolean).length
  const completo = listos === completos.length
  const faltan = [
    pago.titular && pago.documentoIdentidad ? null : "tu documento",
    pago.cuentaPago ? null : "la cuenta donde te pagamos",
  ].filter((texto) => texto !== null)
  return {
    id: "pago",
    titulo: "Pago y condición tributaria",
    descripcion:
      "Titular, documento, cuenta bancaria o billetera y tu situación ante la DIAN.",
    detalle: completo
      ? "Registrados y cifrados."
      : `Registra ${faltan.join(" y ")}.`,
    estado: completo ? "completo" : listos === 0 ? "pendiente" : "en-curso",
    listo: completo,
    href: RUTAS_MI_MEDIO.pago,
  }
}

function pasoCuentas({ cuentas }: DatosAlta): PasoAlta {
  let estado: EstadoPaso
  let detalle: string
  if (cuentas.registradas === 0) {
    estado = "pendiente"
    detalle = "Registra al menos una cuenta y verifica que es tuya."
  } else if (cuentas.verificadas > 0) {
    estado = "completo"
    detalle = `${plural(cuentas.verificadas, "cuenta verificada", "cuentas verificadas")}.`
  } else if (cuentas.enRevision > 0) {
    estado = "completo"
    detalle = `${plural(cuentas.enRevision, "cuenta en revisión", "cuentas en revisión")}.`
  } else if (cuentas.sinCaptura > 0) {
    estado = "en-curso"
    detalle = "Termina de verificar tu cuenta: falta cargar la captura."
  } else if (cuentas.rechazadas > 0) {
    estado = "atencion"
    detalle = "La verificación no fue aprobada: vuelve a intentarlo."
  } else {
    estado = "en-curso"
    detalle = "Falta verificar que la cuenta es tuya."
  }
  return {
    id: "cuentas",
    titulo: "Cuentas sociales",
    descripcion:
      "Facebook, Instagram o TikTok, con la verificación de que son tuyas.",
    detalle,
    estado,
    listo: estado === "completo",
    href: RUTAS_MI_MEDIO.cuentas,
  }
}

function pasoTerminos({ terminos }: DatosAlta): PasoAlta {
  const completo = terminos.pendientes === 0
  return {
    id: "terminos",
    titulo: "Términos y tratamiento de datos",
    descripcion:
      "Términos del medio, política de datos y condiciones comerciales vigentes.",
    detalle: completo
      ? "Aceptaste las versiones vigentes."
      : `${plural(terminos.pendientes, "documento por aceptar", "documentos por aceptar")}.`,
    estado: completo ? "completo" : "pendiente",
    listo: completo,
    href: completo ? null : RUTA_TERMINOS,
  }
}

export function pasosAlta(datos: DatosAlta): PasoAlta[] {
  return [
    pasoPerfil(datos),
    pasoDocumentos(datos),
    pasoPago(datos),
    pasoCuentas(datos),
    pasoTerminos(datos),
  ]
}

export interface ProgresoAlta {
  completos: number
  total: number
  /** 0–1 para la barra. */
  fraccion: number
}

export function progresoAlta(pasos: readonly PasoAlta[]): ProgresoAlta {
  const completos = pasos.filter((paso) => paso.listo).length
  return {
    completos,
    total: pasos.length,
    fraccion: pasos.length === 0 ? 0 : completos / pasos.length,
  }
}

/** Pasos que aún no cumplen lo exigido (lo que impide enviar). */
export function pasosPorCompletar(pasos: readonly PasoAlta[]): PasoAlta[] {
  return pasos.filter((paso) => !paso.listo)
}

/**
 * Se ofrece enviar en el alta y tras un rechazo, con todo lo obligatorio
 * completo. En revisión no: volver a enviar lo mandaría al final de la cola.
 */
export function puedeEnviar(
  situacion: SituacionMedio,
  pasos: readonly PasoAlta[]
): boolean {
  return (
    (situacion.tipo === "alta" || situacion.tipo === "rechazado") &&
    pasosPorCompletar(pasos).length === 0
  )
}

/** Cómo se nombra cada paso dentro de una frase («completa tu perfil…»). */
export const NOMBRE_EN_FRASE: Readonly<Record<IdPasoAlta, string>> = {
  perfil: "tu perfil",
  documentos: "tus documentos",
  pago: "tus datos de pago",
  cuentas: "tus cuentas sociales",
  terminos: "la aceptación de los términos",
}

/** «tu perfil, tus documentos y tus datos de pago» → para explicar qué falta. */
export function enumerar(textos: readonly string[]): string {
  if (textos.length <= 1) return textos.join("")
  return `${textos.slice(0, -1).join(", ")} y ${textos.at(-1)}`
}
