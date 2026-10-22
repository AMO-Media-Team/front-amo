/**
 * Situación de cada documento para el medio (módulo puro): a partir de todas
 * sus cargas de un tipo, qué está vigente, qué espera revisión y qué debe
 * corregir. Sigue la regla con que la BD verifica (`validar_verificacion_medio`):
 * vale un documento APROBADO cuya vigencia no ha pasado (`fecha_vencimiento`
 * nula o desde hoy en Bogotá). Una carga nueva no borra la anterior: mientras se
 * revisa, la aprobada sigue valiendo. El certificado de pago cargado antes del
 * último cambio de cuenta es de la cuenta anterior y ya no vale.
 */
import {
  type CuentaPago,
  DIAS_AVISO_VENCIMIENTO,
  diasEntre,
  esDeCuentaAnterior,
} from "@/features/mi-medio/requisitos"
import type { Tono } from "@/features/operacion/estados"

import { esVoluntario } from "./catalogo"
import type { DocumentoCargado, TipoDocumentoMedio } from "./tipos"

/**
 * Anticipación del aviso «por vencer» (días) y días entre fechas `YYYY-MM-DD`:
 * los mismos de la lista de alta de «Mi medio», para que ambas coincidan.
 */
export { DIAS_AVISO_VENCIMIENTO, diasEntre }

export type Situacion =
  | {
      tipo: "falta"
      /** Lo único cargado es el certificado de la cuenta de pago anterior. */
      deCuentaAnterior: boolean
    }
  | {
      tipo: "en-revision"
      /** La carga que espera revisión (la más reciente). */
      documento: DocumentoCargado
      /** La aprobada que sigue valiendo mientras tanto, si la hay. */
      vigente: DocumentoCargado | null
    }
  | {
      tipo: "aprobado"
      documento: DocumentoCargado
      /** Días que le quedan (0 = vence hoy); `null` sin fecha de vencimiento. */
      diasParaVencer: number | null
      porVencer: boolean
      /** Un reemplazo posterior que fue rechazado (el aprobado sigue valiendo). */
      reemplazoRechazado: DocumentoCargado | null
    }
  | { tipo: "rechazado"; documento: DocumentoCargado }
  | { tipo: "vencido"; documento: DocumentoCargado }

export type TipoSituacion = Situacion["tipo"]

const SIN_CARGAR: Situacion = { tipo: "falta", deCuentaAnterior: false }

/** Aprobado y dentro de su vigencia el día `hoy`. */
export function estaVigente(documento: DocumentoCargado, hoy: string): boolean {
  return (
    documento.estado === "APROBADO" &&
    (documento.venceEl === null || documento.venceEl >= hoy)
  )
}

function masRecientePrimero(a: DocumentoCargado, b: DocumentoCargado): number {
  return Date.parse(b.cargadoAt) - Date.parse(a.cargadoAt)
}

function aprobado(
  vigente: DocumentoCargado,
  cargas: readonly DocumentoCargado[],
  hoy: string
): Situacion {
  const diasParaVencer =
    vigente.venceEl === null ? null : diasEntre(hoy, vigente.venceEl)
  const reemplazoRechazado =
    cargas.find(
      (carga) =>
        carga.estado === "RECHAZADO" &&
        Date.parse(carga.cargadoAt) > Date.parse(vigente.cargadoAt)
    ) ?? null
  return {
    tipo: "aprobado",
    documento: vigente,
    diasParaVencer,
    porVencer:
      diasParaVencer !== null && diasParaVencer <= DIAS_AVISO_VENCIMIENTO,
    reemplazoRechazado,
  }
}

/**
 * Situación de un tipo a partir de TODAS sus cargas (en cualquier orden). Con
 * la cuenta de pago, el certificado cargado antes de su último cambio no
 * cuenta: si es lo único que hay, el certificado falta.
 */
export function situacionDe(
  cargas: readonly DocumentoCargado[],
  hoy: string,
  cuenta: CuentaPago | null = null
): Situacion {
  const validas = cuenta
    ? cargas.filter(
        (carga) => !esDeCuentaAnterior(carga.tipo, carga.cargadoAt, cuenta)
      )
    : cargas
  const ordenadas = [...validas].sort(masRecientePrimero)
  const ultima = ordenadas[0]
  if (!ultima) {
    return { tipo: "falta", deCuentaAnterior: validas.length < cargas.length }
  }
  const vigente = ordenadas.find((carga) => estaVigente(carga, hoy)) ?? null
  if (ultima.estado === "PENDIENTE") {
    return { tipo: "en-revision", documento: ultima, vigente }
  }
  if (vigente) return aprobado(vigente, ordenadas, hoy)
  if (ultima.estado === "RECHAZADO") {
    return { tipo: "rechazado", documento: ultima }
  }
  // VENCIDO, o APROBADO con la fecha ya pasada (el proceso diario aún no lo marcó).
  return { tipo: "vencido", documento: ultima }
}

export type SituacionesPorTipo = ReadonlyMap<TipoDocumentoMedio, Situacion>

/**
 * Situación de cada tipo que tiene al menos una carga. `cuenta` es el medio de
 * pago con su último cambio (`null` si aún no lo registra).
 */
export function situacionesPorTipo(
  documentos: readonly DocumentoCargado[],
  hoy: string,
  cuenta: CuentaPago | null
): SituacionesPorTipo {
  const porTipo = new Map<TipoDocumentoMedio, DocumentoCargado[]>()
  for (const documento of documentos) {
    porTipo.set(documento.tipo, [
      ...(porTipo.get(documento.tipo) ?? []),
      documento,
    ])
  }
  return new Map(
    [...porTipo].map(([tipo, cargas]) => [
      tipo,
      situacionDe(cargas, hoy, cuenta),
    ])
  )
}

export function situacionDeTipo(
  situaciones: SituacionesPorTipo,
  tipo: TipoDocumentoMedio
): Situacion {
  return situaciones.get(tipo) ?? SIN_CARGAR
}

// ── Resumen de la lista ──────────────────────────────────────────────────────

export interface ResumenDocumentos {
  /** Documentos exigidos (más el certificado de pago si aún no se sabe cuál). */
  total: number
  /** Aprobados y vigentes (también los que están por vencer). */
  aprobados: number
  enRevision: number
  /** Rechazados o vencidos: hay que cargarlos de nuevo. */
  porCorregir: number
  /** Sin ninguna carga (sin contar los voluntarios). */
  faltan: number
  /** Voluntarios sin cargar: el equipo AMO puede resolverlos por videollamada. */
  voluntarios: number
  porVencer: number
  /** Todo lo exigido está aprobado y vigente. */
  completo: boolean
  /**
   * Todo lo exigido está aprobado o en revisión, salvo lo voluntario (aunque
   * esté rechazado o vencido): ya se puede enviar el perfil a verificación.
   */
  todoCargado: boolean
}

export interface OpcionesResumen {
  /**
   * Aún no hay datos de pago: suma el certificado del medio de pago, que no
   * se puede cargar hasta registrarlos.
   */
  pagoPendiente?: boolean
}

/**
 * Cuenta la situación de los documentos exigidos. Un reemplazo en revisión de
 * un documento que sigue vigente cuenta como aprobado: no deja de valer. Un
 * documento voluntario sin cargar no frena el envío (`todoCargado`), pero
 * sí la verificación (`completo`): el equipo AMO lo resuelve por videollamada.
 */
export function resumirDocumentos(
  exigidos: readonly TipoDocumentoMedio[],
  situaciones: SituacionesPorTipo,
  { pagoPendiente = false }: OpcionesResumen = {}
): ResumenDocumentos {
  const conteo = {
    aprobados: 0,
    enRevision: 0,
    porCorregir: 0,
    faltan: pagoPendiente ? 1 : 0,
    voluntarios: 0,
    porVencer: 0,
  }
  // Lo voluntario sin cubrir (sin cargar, rechazado o vencido) no frena el
  // envío: es la regla de la lista de alta de «Mi medio» (`requisitosParaEnviar`).
  let voluntariosSinCubrir = 0
  for (const tipo of exigidos) {
    const situacion = situacionDeTipo(situaciones, tipo)
    switch (situacion.tipo) {
      case "aprobado":
        conteo.aprobados += 1
        if (situacion.porVencer) conteo.porVencer += 1
        break
      case "en-revision":
        if (situacion.vigente) conteo.aprobados += 1
        else conteo.enRevision += 1
        break
      case "rechazado":
      case "vencido":
        conteo.porCorregir += 1
        if (esVoluntario(tipo)) voluntariosSinCubrir += 1
        break
      case "falta":
        if (esVoluntario(tipo)) {
          conteo.voluntarios += 1
          voluntariosSinCubrir += 1
        } else {
          conteo.faltan += 1
        }
        break
    }
  }
  const total = exigidos.length + (pagoPendiente ? 1 : 0)
  return {
    total,
    ...conteo,
    completo: total > 0 && conteo.aprobados === total,
    todoCargado:
      total > 0 &&
      conteo.aprobados + conteo.enRevision + voluntariosSinCubrir === total,
  }
}

// ── Presentación ─────────────────────────────────────────────────────────────

export type AccionDocumento = "cargar" | "cargar-de-nuevo" | "reemplazar"

export interface PresentacionSituacion {
  etiqueta: string
  tono: Tono
  /** Botón principal de la tarjeta; `null` si no hay nada que hacer. */
  accion: AccionDocumento | null
  /** La tarjeta pide atención (falta, rechazo, vencimiento). */
  requiereAccion: boolean
}

export const TEXTO_ACCION: Readonly<Record<AccionDocumento, string>> = {
  cargar: "Cargar",
  "cargar-de-nuevo": "Cargar de nuevo",
  reemplazar: "Reemplazar",
}

function textoVencimiento(dias: number): string {
  if (dias <= 0) return "Vence hoy"
  if (dias === 1) return "Vence mañana"
  return `Vence en ${dias} días`
}

/**
 * Etiqueta, tono y acción de la tarjeta. Un documento voluntario sin cargar
 * se ofrece sin pedir atención, y una prueba de vida aprobada por
 * videollamada no tiene archivo que reemplazar.
 */
export function presentarSituacion(
  situacion: Situacion,
  { voluntario = false }: { voluntario?: boolean } = {}
): PresentacionSituacion {
  switch (situacion.tipo) {
    case "falta":
      return {
        etiqueta: voluntario ? "Opcional" : "Sin cargar",
        tono: "neutro",
        accion: "cargar",
        requiereAccion: !voluntario,
      }
    case "en-revision":
      return {
        etiqueta: situacion.vigente ? "Reemplazo en revisión" : "En revisión",
        tono: "info",
        accion: "reemplazar",
        requiereAccion: false,
      }
    case "aprobado": {
      const porVideollamada = situacion.documento.metodo === "VIDEOLLAMADA"
      return {
        etiqueta:
          situacion.porVencer && situacion.diasParaVencer !== null
            ? textoVencimiento(situacion.diasParaVencer)
            : "Aprobado",
        tono: situacion.porVencer ? "aviso" : "exito",
        accion: porVideollamada && !situacion.porVencer ? null : "reemplazar",
        requiereAccion: situacion.porVencer,
      }
    }
    case "rechazado":
      return {
        etiqueta: "Rechazado",
        tono: "peligro",
        accion: "cargar-de-nuevo",
        requiereAccion: true,
      }
    case "vencido":
      return {
        etiqueta: "Vencido",
        tono: "peligro",
        accion: "cargar-de-nuevo",
        requiereAccion: true,
      }
  }
}
