/**
 * Situación de la verificación de la empresa y lo que falta para enviarla
 * (módulo puro, ANU-001 y ADM-003 del lado del anunciante).
 *
 * Tres pasos: datos de la empresa (ya registrados por AMO: solo se revisan),
 * persona de contacto y documentos. La BD (`enviar_anunciante_a_verificacion_srv`)
 * exige los documentos cargados; la persona de contacto la exige la acción,
 * porque es a quien el equipo AMO escribe durante la revisión.
 */
import type { Route } from "next"

import {
  requisitosDocumentales,
  type ResumenDocumentos,
  resumirDocumentos,
  situacionesPorTipo,
} from "@/features/documentos-anunciante/situacion"
import type { DatosDocumentosAnunciante } from "@/features/documentos-anunciante/tipos"
import { enumerar } from "@/features/mi-medio/alta"
import type { Tono } from "@/features/usuarios/presentacion"
import { formatearNit } from "@/lib/colombia/nit"
import { formatearFecha } from "@/lib/format"

import { RUTA_CONTACTO, RUTA_DATOS, RUTAS_EMPRESA } from "./rutas"
import type { ContactoEmpresa, EmpresaPropia, EstadoAnunciante } from "./tipos"

export { enumerar }

/**
 * Id del titular de la tarjeta de verificación de «Mi empresa» (`tabIndex=-1`):
 * tras enviarla, el botón desaparece y el foco va ahí, que ya dice «en revisión».
 */
export const ID_SITUACION_VERIFICACION = "situacion-verificacion"

// ── Situación ────────────────────────────────────────────────────────────────

export type SituacionEmpresa =
  | { tipo: "alta" }
  | { tipo: "en-revision"; enviadoAt: string }
  | { tipo: "rechazado"; motivo: string | null }
  | { tipo: "verificado"; verificadoAt: string | null }
  | { tipo: "suspendido"; motivo: string | null }

export interface EntradaSituacion {
  estado: EstadoAnunciante
  enviadoVerificacionAt: string | null
  motivoEstado: string | null
  verificadoAt: string | null
}

export function situacionEmpresa({
  estado,
  enviadoVerificacionAt,
  motivoEstado,
  verificadoAt,
}: EntradaSituacion): SituacionEmpresa {
  const motivo = motivoEstado?.trim() || null
  switch (estado) {
    case "PENDIENTE":
      return enviadoVerificacionAt
        ? { tipo: "en-revision", enviadoAt: enviadoVerificacionAt }
        : { tipo: "alta" }
    case "RECHAZADO":
      return { tipo: "rechazado", motivo }
    case "VERIFICADO":
      return { tipo: "verificado", verificadoAt }
    case "SUSPENDIDO":
      return { tipo: "suspendido", motivo }
  }
}

/**
 * Verificada (o suspendida), la razón social y la identificación tributaria
 * solo las corrige el equipo AMO (`trg_anunciantes_b_identificacion`).
 */
export function identificacionBloqueada(estado: EstadoAnunciante): boolean {
  return estado === "VERIFICADO" || estado === "SUSPENDIDO"
}

/** Solo se envía (o reenvía) una empresa en alta o rechazada. */
export function puedeEnviar(situacion: SituacionEmpresa): boolean {
  return situacion.tipo === "alta" || situacion.tipo === "rechazado"
}

/** Mientras no esté verificada (ni suspendida), lo principal es verificarla. */
export function enVerificacion(situacion: SituacionEmpresa): boolean {
  return (
    situacion.tipo === "alta" ||
    situacion.tipo === "en-revision" ||
    situacion.tipo === "rechazado"
  )
}

// ── Pasos ───────────────────────────────────────────────────────────────────

export type IdPasoVerificacion = "datos" | "contacto" | "documentos"

/**
 * - `completo`: listo.
 * - `en-curso`: cargado y esperando la revisión de AMO.
 * - `pendiente`: sin empezar.
 * - `atencion`: hay algo rechazado o vencido que corregir.
 */
export type EstadoPaso = "completo" | "en-curso" | "pendiente" | "atencion"

export interface PasoVerificacion {
  id: IdPasoVerificacion
  titulo: string
  /** En qué va (frase corta). */
  detalle: string
  estado: EstadoPaso
  /** Cumple lo que se exige para enviar a verificación. */
  listo: boolean
  /** Lo que falta, en frase, para el texto del botón de envío. */
  faltantes: readonly string[]
  href: Route
}

/** La persona de contacto tiene al menos nombre y correo. */
export function contactoCompleto(
  contacto: Pick<ContactoEmpresa, "nombre" | "email">
): boolean {
  return Boolean(contacto.nombre?.trim() && contacto.email?.trim())
}

export interface EntradaPasos {
  /** «Comercializadora Andina S.A.S. · NIT 900.123.456-8». */
  identificacion: string
  contacto: Pick<ContactoEmpresa, "nombre" | "email">
  documentos: ResumenDocumentos
}

function pasoDocumentos(resumen: ResumenDocumentos): PasoVerificacion {
  const base = {
    id: "documentos" as const,
    titulo: "Documentos",
    href: RUTAS_EMPRESA.documentos,
  }
  const titulos = (estado: "falta" | "por-corregir") =>
    resumen.pendientes
      .filter((requisito) => requisito.estado === estado)
      .map((requisito) => requisito.titulo)
  const faltantes = resumen.pendientes.map((requisito) => requisito.enFrase)
  if (resumen.porCorregir > 0) {
    const porCargar = titulos("falta")
    return {
      ...base,
      estado: "atencion",
      listo: false,
      faltantes,
      detalle: `Por corregir: ${enumerar(titulos("por-corregir"))}.${
        porCargar.length > 0 ? ` Falta cargar: ${enumerar(porCargar)}.` : ""
      }`,
    }
  }
  if (resumen.faltan > 0) {
    const cargados = resumen.aprobados + resumen.enRevision
    return {
      ...base,
      estado: cargados > 0 ? "en-curso" : "pendiente",
      listo: false,
      faltantes,
      detalle: `Falta cargar: ${enumerar(titulos("falta"))}.`,
    }
  }
  if (resumen.completo) {
    return {
      ...base,
      estado: "completo",
      listo: true,
      faltantes: [],
      detalle:
        resumen.porVencer > 0
          ? "Aprobados por AMO; alguno vence pronto."
          : "Aprobados por AMO.",
    }
  }
  return {
    ...base,
    estado: "en-curso",
    listo: true,
    faltantes: [],
    detalle: "Cargados: el equipo de AMO los revisa.",
  }
}

/** Los tres pasos de la verificación, en el orden en que se muestran. */
export function pasosVerificacion({
  identificacion,
  contacto,
  documentos,
}: EntradaPasos): PasoVerificacion[] {
  const conContacto = contactoCompleto(contacto)
  return [
    {
      id: "datos",
      titulo: "Datos de la empresa",
      detalle: identificacion,
      estado: "completo",
      listo: true,
      faltantes: [],
      href: RUTA_DATOS,
    },
    {
      id: "contacto",
      titulo: "Persona de contacto",
      detalle: conContacto
        ? `${contacto.nombre?.trim()} · ${contacto.email?.trim()}`
        : "A quién le escribimos sobre la verificación y la facturación.",
      estado: conContacto ? "completo" : "pendiente",
      listo: conContacto,
      faltantes: conContacto ? [] : ["los datos de la persona de contacto"],
      href: RUTA_CONTACTO,
    },
    pasoDocumentos(documentos),
  ]
}

/** «Comercializadora Andina S.A.S. · NIT 900.123.456-8». */
export function identificacionEnFrase(
  empresa: Pick<
    EmpresaPropia,
    | "razonSocial"
    | "paisIso2"
    | "nit"
    | "digitoVerificacion"
    | "identificacionExtranjera"
  >
): string {
  const identificacion =
    empresa.paisIso2 === "CO" && empresa.nit
      ? `NIT ${formatearNit(empresa.nit, empresa.digitoVerificacion)}`
      : empresa.identificacionExtranjera
        ? `Identificación ${empresa.identificacionExtranjera}`
        : null
  return identificacion
    ? `${empresa.razonSocial} · ${identificacion}`
    : empresa.razonSocial
}

/**
 * Avance de los documentos que exige la verificación (lo mismo que ve su
 * página): lo aprobado antes del último cambio de la identificación cuenta
 * como por corregir, igual que en `enviar_anunciante_a_verificacion_srv`.
 */
export function resumenDocumentosDe(
  datos: DatosDocumentosAnunciante
): ResumenDocumentos {
  return resumirDocumentos(
    requisitosDocumentales(
      datos.empresa.pais,
      situacionesPorTipo(
        datos.documentos,
        datos.hoy,
        datos.empresa.identificacionCambiadaAt
      )
    )
  )
}

/** Lo que falta para enviar, en frase («los datos de la persona de contacto», «el RUT»…). */
export function faltantesParaEnviar(
  pasos: readonly PasoVerificacion[]
): string[] {
  return pasos.flatMap((paso) => paso.faltantes)
}

export interface ProgresoVerificacion {
  completos: number
  total: number
  fraccion: number
}

export function progresoVerificacion(
  pasos: readonly PasoVerificacion[]
): ProgresoVerificacion {
  const completos = pasos.filter((paso) => paso.listo).length
  return {
    completos,
    total: pasos.length,
    fraccion: pasos.length > 0 ? completos / pasos.length : 0,
  }
}

export interface VistaVerificacion {
  situacion: SituacionEmpresa
  /** Mientras se verifica: los pasos y su avance; `null` ya verificada o suspendida. */
  pasos: PasoVerificacion[] | null
  progreso: ProgresoVerificacion | null
  /** Lo que falta para enviar, en frase. */
  faltantes: string[]
  /** Se puede enviar (o reenviar, tras un rechazo); `null` si no aplica. */
  envio: { reenvio: boolean } | null
  identificacionBloqueada: boolean
}

/** Todo lo que pinta la tarjeta de verificación de «Mi empresa». */
export function vistaVerificacion({
  empresa,
  contacto,
  documentos,
}: {
  empresa: EmpresaPropia
  contacto: Pick<ContactoEmpresa, "nombre" | "email">
  documentos: DatosDocumentosAnunciante
}): VistaVerificacion {
  const situacion = situacionEmpresa(empresa)
  const pasos = enVerificacion(situacion)
    ? pasosVerificacion({
        identificacion: identificacionEnFrase(empresa),
        contacto,
        documentos: resumenDocumentosDe(documentos),
      })
    : null
  return {
    situacion,
    pasos,
    progreso: pasos ? progresoVerificacion(pasos) : null,
    faltantes: pasos ? faltantesParaEnviar(pasos) : [],
    envio: puedeEnviar(situacion)
      ? { reenvio: situacion.tipo === "rechazado" }
      : null,
    identificacionBloqueada: identificacionBloqueada(empresa.estado),
  }
}

// ── Presentación ────────────────────────────────────────────────────────────

/** Etiqueta del paso: «en curso» es «en revisión» si ya cumple para enviar. */
export function etiquetaPaso(
  paso: Pick<PasoVerificacion, "estado" | "listo">
): { etiqueta: string; tono: Tono } {
  switch (paso.estado) {
    case "completo":
      return { etiqueta: "Listo", tono: "exito" }
    case "en-curso":
      return paso.listo
        ? { etiqueta: "En revisión", tono: "info" }
        : { etiqueta: "Incompleto", tono: "info" }
    case "pendiente":
      return { etiqueta: "Pendiente", tono: "neutro" }
    case "atencion":
      return { etiqueta: "Por corregir", tono: "aviso" }
  }
}

export interface PresentacionSituacion {
  titulo: string
  descripcion: string
  tono: Tono
}

/** Titular de la tarjeta de verificación de «Mi empresa». */
export function presentarSituacionEmpresa(
  situacion: SituacionEmpresa,
  pasosFaltantes: number
): PresentacionSituacion {
  switch (situacion.tipo) {
    case "alta":
      return pasosFaltantes === 0
        ? {
            titulo: "Todo listo para enviar",
            descripcion:
              "Envía tu empresa a verificación. El equipo de AMO revisará tus datos y documentos y te avisará el resultado.",
            tono: "exito",
          }
        : {
            titulo: "Verifica tu empresa",
            descripcion: `Te ${pasosFaltantes === 1 ? "falta 1 paso" : `faltan ${pasosFaltantes} pasos`} para enviarla a verificación. Cuando AMO la verifique podrás activar campañas y enviar ofertas a revisión.`,
            tono: "info",
          }
    case "en-revision":
      return {
        titulo: "Tu empresa está en revisión",
        descripcion: `La enviaste el ${formatearFecha(situacion.enviadoAt, "largo")}. El equipo de AMO revisa tus datos y documentos y te avisará por notificación. Mientras tanto puedes preparar campañas en borrador.`,
        tono: "info",
      }
    case "rechazado":
      return {
        titulo: "Tu verificación no fue aprobada",
        descripcion:
          "Corrige lo que te indicamos y vuelve a enviar tu empresa a verificación.",
        tono: "peligro",
      }
    case "verificado":
      return {
        titulo: "Tu empresa está verificada",
        descripcion: situacion.verificadoAt
          ? `Desde el ${formatearFecha(situacion.verificadoAt, "largo")}. Ya puedes activar campañas y enviar ofertas a revisión.`
          : "Ya puedes activar campañas y enviar ofertas a revisión.",
        tono: "exito",
      }
    case "suspendido":
      return {
        titulo: "Tu empresa está suspendida",
        descripcion:
          "Mientras siga suspendida no puedes activar campañas ni enviar ofertas a revisión, y tus ofertas publicadas no reciben aceptaciones nuevas. Si crees que es un error, escríbele al equipo de AMO.",
        tono: "aviso",
      }
  }
}
