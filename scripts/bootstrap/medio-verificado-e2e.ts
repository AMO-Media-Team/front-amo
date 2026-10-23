/**
 * Plan de un medio E2E verificado (módulo puro): qué le falta para ser el
 * medio que esperan las pruebas y en qué orden se completa. Cada corrida
 * agrega solo lo que falte y no borra lo que las pruebas le hayan sumado.
 * Sirve para el «Medio E2E» (por omisión) y para el «Medio Suspensión E2E»
 * (`MEDIO_SUSPENSION_VERIFICADO_E2E`): cada uno con sus datos base, su cuenta
 * de Instagram y sus datos de pago (la huella del documento es única).
 */
import { addYears, subDays } from "date-fns"

import {
  type ColumnaCifrada,
  contextoCifrado,
  type CuentaPago,
  leerCuentaPago,
  type TipoCuenta,
  normalizarNumeroDocumento,
  serializarCuentaPago,
} from "../../src/features/mi-medio/datos-pago"
import { serializarFecha } from "../../src/lib/fechas"
import type { Database } from "../../src/types/database.types"
import {
  CUENTA_INSTAGRAM_E2E,
  CUENTA_INSTAGRAM_SUSPENSION_E2E,
  type CuentaSocialE2E,
  type DatosBaseMedio,
  MEDIO_E2E,
  MEDIO_SUSPENSION_E2E,
  NIVEL_MEDIO_E2E,
} from "./medios-e2e"

type Enums = Database["public"]["Enums"]
type Tablas = Database["public"]["Tables"]
export type EstadoMedio = Enums["medio_estado"]
export type TipoDocumentoMedio = Enums["documento_medio_tipo"]
export type MetodoPago = Enums["metodo_pago"]

// ── Datos de pago ────────────────────────────────────────────────────────────

/** Datos de pago y condición tributaria de un medio E2E (ficticios; siempre por banco). */
export interface PagoMedioE2E {
  titular: string
  tipoDocumento: Enums["documento_identidad_tipo"]
  numeroDocumento: string
  metodo: Extract<MetodoPago, "BANCARIO">
  banco: string
  tipoCuenta: TipoCuenta
  numeroCuenta: string
  celular: string
  email: string
  direccion: string
}

/** Datos de pago y condición tributaria del Medio E2E (ficticios). */
export const PAGO_MEDIO_E2E = {
  titular: "Titular Medio E2E",
  tipoDocumento: "CC",
  numeroDocumento: "1099000001",
  metodo: "BANCARIO",
  banco: "Bancolombia",
  tipoCuenta: "AHORROS",
  numeroCuenta: "40900012345",
  celular: "+57 3000000001",
  email: "pagos.medio.e2e@amo.test",
  direccion: "Calle 10 # 20-30, Medellín",
} as const satisfies PagoMedioE2E

/** Datos de pago del Medio Suspensión E2E: otro documento (la huella es única). */
export const PAGO_MEDIO_SUSPENSION_E2E = {
  titular: "Titular Medio Suspensión E2E",
  tipoDocumento: "CC",
  numeroDocumento: "1099000002",
  metodo: "BANCARIO",
  banco: "Bancolombia",
  tipoCuenta: "AHORROS",
  numeroCuenta: "40900012346",
  celular: "+57 3000000002",
  email: "pagos.medio.suspension.e2e@amo.test",
  direccion: "Carrera 50 # 70-10, Barranquilla",
} as const satisfies PagoMedioE2E

/**
 * Cuenta que va cifrada en `datos_pago_cifrados`, con el contrato del paquete
 * «Mi medio» (`serializarCuentaPago`): la revisión de AMO y la dispersión la
 * leen igual que la de un medio real.
 */
export function cuentaPagoDe(pago: PagoMedioE2E): CuentaPago {
  return {
    metodo: pago.metodo,
    banco: pago.banco,
    tipoCuenta: pago.tipoCuenta,
    numero: pago.numeroCuenta,
  }
}

/** La cuenta de pago del Medio E2E. */
export const CUENTA_PAGO_E2E: CuentaPago = cuentaPagoDe(PAGO_MEDIO_E2E)

// ── Medios verificados ───────────────────────────────────────────────────────

/** Lo que distingue a un medio E2E verificado: sus datos, nivel, cuenta y pago. */
export interface MedioVerificadoE2E {
  datos: DatosBaseMedio
  nivel: number
  cuenta: CuentaSocialE2E
  pago: PagoMedioE2E
}

/** «Medio E2E»: el de la pauta del medio. */
export const MEDIO_VERIFICADO_E2E: MedioVerificadoE2E = {
  datos: MEDIO_E2E,
  nivel: NIVEL_MEDIO_E2E,
  cuenta: CUENTA_INSTAGRAM_E2E,
  pago: PAGO_MEDIO_E2E,
}

/** «Medio Suspensión E2E»: el que suspenden y reactivan las pruebas del equipo AMO. */
export const MEDIO_SUSPENSION_VERIFICADO_E2E: MedioVerificadoE2E = {
  datos: MEDIO_SUSPENSION_E2E,
  nivel: NIVEL_MEDIO_E2E,
  cuenta: CUENTA_INSTAGRAM_SUSPENSION_E2E,
  pago: PAGO_MEDIO_SUSPENSION_E2E,
}

/** Las funciones de `src/lib/cifrado.ts` que necesita el aprovisionamiento. */
export interface CifradorPago {
  cifrar(texto: string, contexto: string): string
  descifrar(valor: string, contexto: string): string
  huella(texto: string): string
  enmascarar(texto: string, etiqueta?: string): string
}

/**
 * Lo que se guarda en claro o derivado sin descifrar: la huella del documento
 * (`${tipo}:${número normalizado}`, convención del brief) y los resúmenes
 * `•••• 1234`.
 */
function camposPlanosPago(
  cifrador: Pick<CifradorPago, "huella" | "enmascarar">,
  pago: PagoMedioE2E
) {
  const numeroDocumento = normalizarNumeroDocumento(pago.numeroDocumento)
  return {
    titular_nombre: pago.titular,
    tipo_documento: pago.tipoDocumento,
    numero_documento_hash: cifrador.huella(
      `${pago.tipoDocumento}:${numeroDocumento}`
    ),
    numero_documento_resumen: cifrador.enmascarar(numeroDocumento),
    metodo_pago: pago.metodo,
    datos_pago_resumen: cifrador.enmascarar(pago.numeroCuenta, pago.banco),
    es_declarante: false,
    obligado_facturar: false,
    responsable_iva: false,
    celular: pago.celular,
    email_contacto: pago.email,
    direccion: pago.direccion,
  }
}

/** `p_datos` de `guardar_datos_pago_medio_srv`: completos, cifrados y con huella y resúmenes. */
export function datosPagoE2E(
  medioId: string,
  cifrador: CifradorPago,
  pago: PagoMedioE2E = PAGO_MEDIO_E2E
) {
  return {
    ...camposPlanosPago(cifrador, pago),
    numero_documento_cifrado: cifrador.cifrar(
      normalizarNumeroDocumento(pago.numeroDocumento),
      contextoCifrado(medioId, "numero_documento_cifrado")
    ),
    datos_pago_cifrados: cifrador.cifrar(
      serializarCuentaPago(cuentaPagoDe(pago)),
      contextoCifrado(medioId, "datos_pago_cifrados")
    ),
  }
}

export type FilaPagoMedio = Pick<
  Tablas["medios_privado"]["Row"],
  | "titular_nombre"
  | "tipo_documento"
  | "numero_documento_cifrado"
  | "numero_documento_hash"
  | "numero_documento_resumen"
  | "metodo_pago"
  | "datos_pago_cifrados"
  | "datos_pago_resumen"
  | "es_declarante"
  | "obligado_facturar"
  | "responsable_iva"
  | "celular"
  | "email_contacto"
  | "direccion"
>

/** Texto claro de una columna cifrada, o `null` si falta o no se descifra (otra llave u otro contexto). */
function textoClaro(
  valor: string | null,
  medioId: string,
  columna: ColumnaCifrada,
  cifrador: CifradorPago
): string | null {
  if (!valor) return null
  try {
    return cifrador.descifrar(valor, contextoCifrado(medioId, columna))
  } catch {
    return null
  }
}

function esCuentaDe(texto: string | null, pago: PagoMedioE2E): boolean {
  const cuenta = texto === null ? null : leerCuentaPago(texto)
  return (
    cuenta !== null &&
    serializarCuentaPago(cuenta) === serializarCuentaPago(cuentaPagoDe(pago))
  )
}

/**
 * ¿La fila guardada ya es la del medio (por omisión, el Medio E2E) y se
 * descifra con la llave actual? Así una corrida repetida no vuelve a cifrar
 * (ni avisa a la cola de verificación de un cambio de datos de pago que no hubo).
 */
export function pagoAlDia(
  fila: FilaPagoMedio | null,
  medioId: string,
  cifrador: CifradorPago,
  pago: PagoMedioE2E = PAGO_MEDIO_E2E
): boolean {
  if (!fila) return false
  const esperado = camposPlanosPago(cifrador, pago)
  const planosIguales = (
    Object.keys(esperado) as (keyof typeof esperado)[]
  ).every((columna) => fila[columna] === esperado[columna])
  if (!planosIguales) return false
  const numero = textoClaro(
    fila.numero_documento_cifrado,
    medioId,
    "numero_documento_cifrado",
    cifrador
  )
  const cuenta = textoClaro(
    fila.datos_pago_cifrados,
    medioId,
    "datos_pago_cifrados",
    cifrador
  )
  return (
    numero === normalizarNumeroDocumento(pago.numeroDocumento) &&
    esCuentaDe(cuenta, pago)
  )
}

// ── Cuenta social ────────────────────────────────────────────────────────────

export type FilaCuentaSocial = Pick<
  Tablas["cuentas_sociales"]["Row"],
  "verificada" | "fecha_ultima_verificacion"
>

/**
 * ¿La verificación sigue fresca? Se exige que no haya entrado aún en
 * reverificación (`medios.reverificacion_dias`), no solo que siga vigente con
 * la gracia: así, tras aprovisionar, la cuenta aguanta al menos el periodo de
 * gracia completo sin que las pruebas la encuentren vencida.
 */
export function cuentaAlDia(
  cuenta: FilaCuentaSocial,
  diasReverificacion: number,
  ahora: Date
): boolean {
  if (!cuenta.verificada || !cuenta.fecha_ultima_verificacion) return false
  return (
    Date.parse(cuenta.fecha_ultima_verificacion) >
    subDays(ahora, diasReverificacion).getTime()
  )
}

// ── Documentos ───────────────────────────────────────────────────────────────

/** Documentos del nivel más el certificado de su medio de pago (`validar_verificacion_medio`). */
export function documentosExigidos(
  requeridosDelNivel: readonly TipoDocumentoMedio[],
  metodo: MetodoPago
): TipoDocumentoMedio[] {
  const certificado: TipoDocumentoMedio =
    metodo === "BANCARIO" ? "CERT_BANCARIA" : "CERT_BILLETERA"
  return [...new Set([...requeridosDelNivel, certificado])]
}

export type FilaDocumentoAprobado = Pick<
  Tablas["documentos_medio"]["Row"],
  "tipo" | "fecha_vencimiento"
>

/** Tipos con algún documento aprobado que no ha vencido (`hoy` = `YYYY-MM-DD` en Bogotá). */
export function tiposVigentes(
  aprobados: readonly FilaDocumentoAprobado[],
  hoy: string
): TipoDocumentoMedio[] {
  return [
    ...new Set(
      aprobados
        .filter(
          (documento) =>
            documento.fecha_vencimiento === null ||
            documento.fecha_vencimiento >= hoy
        )
        .map((documento) => documento.tipo)
    ),
  ]
}

/** Las fotos de la cédula van como imagen; los certificados y registros, en PDF. */
export function formatoDocumento(
  tipo: TipoDocumentoMedio
): "image/png" | "application/pdf" {
  return tipo === "CEDULA_FRENTE" || tipo === "CEDULA_REVERSO"
    ? "image/png"
    : "application/pdf"
}

/**
 * Vigencia que fija quien aprueba (`YYYY-MM-DD` en Bogotá): un año para los
 * certificados de pago; la cédula y los registros no vencen (`null`).
 */
export function vigenciaDocumento(
  tipo: TipoDocumentoMedio,
  ahora: Date
): string | null {
  return tipo === "CERT_BANCARIA" || tipo === "CERT_BILLETERA"
    ? serializarFecha(addYears(ahora, 1))
    : null
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export interface EstadoMedioVerificado {
  estado: EstadoMedio
  nivel: number
  /** La cuenta de Instagram del medio (`null` si no existe o se borró). */
  cuenta: {
    alDia: boolean
    seguidores: number | null
    /** Verificación en curso (solo puede haber una por cuenta). */
    verificacionPendienteId: string | null
  } | null
  pagoAlDia: boolean
  /** Tipos con un documento APROBADO y vigente. */
  documentosVigentes: readonly TipoDocumentoMedio[]
  documentosExigidos: readonly TipoDocumentoMedio[]
}

export type PasoMedio =
  | { paso: "REGISTRAR_CUENTA" }
  | { paso: "DESCARTAR_VERIFICACION"; verificacionId: string }
  | { paso: "VERIFICAR_CUENTA" }
  | { paso: "GUARDAR_PAGO" }
  | { paso: "APROBAR_DOCUMENTO"; documento: TipoDocumentoMedio }
  | { paso: "VIDEOLLAMADA" }
  | { paso: "REENVIAR_A_VERIFICACION" }
  | { paso: "REACTIVAR" }
  | { paso: "VERIFICAR_MEDIO"; nivel: number }
  | { paso: "CAMBIAR_NIVEL"; nivel: number }

function pasosCuenta(
  cuenta: EstadoMedioVerificado["cuenta"],
  seguidores: number
): PasoMedio[] {
  if (!cuenta) {
    return [{ paso: "REGISTRAR_CUENTA" }, { paso: "VERIFICAR_CUENTA" }]
  }
  if (cuenta.alDia && cuenta.seguidores === seguidores) {
    return []
  }
  // La que quedó a medias (p. ej. una prueba de reverificación) cede su lugar.
  const descartar: PasoMedio[] = cuenta.verificacionPendienteId
    ? [
        {
          paso: "DESCARTAR_VERIFICACION",
          verificacionId: cuenta.verificacionPendienteId,
        },
      ]
    : []
  return [...descartar, { paso: "VERIFICAR_CUENTA" }]
}

/** La prueba de vida se registra como videollamada: no hace falta una foto biométrica. */
function pasosDocumentos(estado: EstadoMedioVerificado): PasoMedio[] {
  const vigentes = new Set(estado.documentosVigentes)
  return estado.documentosExigidos
    .filter((tipo) => !vigentes.has(tipo))
    .map((tipo): PasoMedio =>
      tipo === "PRUEBA_VIDA"
        ? { paso: "VIDEOLLAMADA" }
        : { paso: "APROBAR_DOCUMENTO", documento: tipo }
    )
}

/**
 * Transiciones (máquina de estados de `medios`) para llegar a VERIFICADO en
 * `nivel`: RECHAZADO vuelve a PENDIENTE solo por el propio medio (lo reenvía
 * a verificación), SUSPENDIDO se reactiva y un nivel distinto se cambia.
 */
export function pasosEstadoMedio(
  estado: EstadoMedio,
  nivelActual: number,
  nivel: number
): PasoMedio[] {
  const cambiarNivel: PasoMedio[] =
    nivelActual === nivel ? [] : [{ paso: "CAMBIAR_NIVEL", nivel }]
  switch (estado) {
    case "PENDIENTE":
      return [{ paso: "VERIFICAR_MEDIO", nivel }]
    case "RECHAZADO":
      return [
        { paso: "REENVIAR_A_VERIFICACION" },
        { paso: "VERIFICAR_MEDIO", nivel },
      ]
    case "SUSPENDIDO":
      return [{ paso: "REACTIVAR" }, ...cambiarNivel]
    case "VERIFICADO":
      return cambiarNivel
  }
}

/**
 * Lo que falta para que el medio (por omisión, el Medio E2E) sea el que
 * esperan las pruebas, en el orden en que se aplica: cuenta, pago y documentos
 * antes del estado (verificar un medio exige los tres). Vacío = ya está listo.
 */
export function planMedioVerificado(
  estado: EstadoMedioVerificado,
  medio: Pick<MedioVerificadoE2E, "cuenta" | "nivel"> = MEDIO_VERIFICADO_E2E
): PasoMedio[] {
  return [
    ...pasosCuenta(estado.cuenta, medio.cuenta.seguidores),
    ...(estado.pagoAlDia ? [] : [{ paso: "GUARDAR_PAGO" } as const]),
    ...pasosDocumentos(estado),
    ...pasosEstadoMedio(estado.estado, estado.nivel, medio.nivel),
  ]
}

/** Resumen legible de un paso para el registro del aprovisionamiento. */
export function describirPaso(
  paso: PasoMedio,
  cuenta: Pick<CuentaSocialE2E, "handle" | "seguidores"> = CUENTA_INSTAGRAM_E2E
): string {
  switch (paso.paso) {
    case "REGISTRAR_CUENTA":
      return `cuenta de Instagram @${cuenta.handle}`
    case "DESCARTAR_VERIFICACION":
      return "descartar una verificación de cuenta a medias"
    case "VERIFICAR_CUENTA":
      return `verificar la cuenta con ${cuenta.seguidores} seguidores`
    case "GUARDAR_PAGO":
      return "datos de pago cifrados"
    case "APROBAR_DOCUMENTO":
      return `documento ${paso.documento} aprobado`
    case "VIDEOLLAMADA":
      return "prueba de vida por videollamada"
    case "REENVIAR_A_VERIFICACION":
      return "reenviar a verificación (estaba rechazado)"
    case "REACTIVAR":
      return "reactivar (estaba suspendido)"
    case "VERIFICAR_MEDIO":
      return `verificar el medio en nivel ${paso.nivel}`
    case "CAMBIAR_NIVEL":
      return `cambiar al nivel ${paso.nivel}`
  }
}
