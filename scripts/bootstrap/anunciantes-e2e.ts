/**
 * Anunciantes de las cuentas E2E de rol ANUNCIANTE (módulo puro: ids, datos
 * base, plan del verificado y decisión de cómo reiniciar el nuevo). Las
 * escrituras están en `aprovisionar-anunciantes.ts`.
 *
 * - «Anunciante E2E» (`E2E_ANUNCIANTE_*` y `E2E_CAMBIO_*`): VERIFICADO, con el
 *   RUT y la Cámara de Comercio aprobados y vigentes. Lo siembra la migración
 *   de actores; si la purga demo se lo llevó, el aprovisionamiento lo registra
 *   y lo verifica de nuevo con el mismo id.
 * - «Anunciante Nuevo E2E» (`E2E_ANUNCIANTE_NUEVO_*`): PENDIENTE recién
 *   registrado en Colombia, con NIT válido y sin documentos ni campañas. Cada
 *   corrida lo devuelve a ese estado.
 *
 * Los ids son fijos, como los de los medios E2E: las pruebas los ubican sin
 * consultar. Ambos son `es_demo`.
 */
import { addYears } from "date-fns"

import { digitoVerificacion } from "../../src/lib/colombia/nit"
import { serializarFecha } from "../../src/lib/fechas"
import type { Database, Json } from "../../src/types/database.types"
import { ANUNCIANTE_E2E_ID } from "./organizacion"

type Enums = Database["public"]["Enums"]
type FilaAnunciante = Database["public"]["Tables"]["anunciantes"]["Row"]
export type EstadoAnunciante = Enums["anunciante_estado"]
export type TipoDocumentoAnunciante = Enums["documento_anunciante_tipo"]

export { ANUNCIANTE_E2E_ID }
export const ANUNCIANTE_NUEVO_E2E_ID = "e2e00000-0000-4000-8000-00000000a002"

/** Lo que el equipo AMO registra al dar de alta una empresa en Colombia. */
export interface DatosBaseAnunciante {
  id: string
  razonSocial: string
  /** El nombre con que lo muestran la app y las pruebas. */
  nombreComercial: string
  nit: string
  digitoVerificacion: string
  /** Sector por nombre (los ids cambian entre entornos); si no está, el primero activo. */
  sector: string
  /** Código DIVIPOLA preferido; si ya no está activo se usa el primero activo. */
  municipioPreferido: string
}

/** NIT ficticio con DV válido (algoritmo DIAN); los datos demo usan 90 y 99… con otros dígitos. */
export const ANUNCIANTE_E2E: DatosBaseAnunciante = {
  id: ANUNCIANTE_E2E_ID,
  razonSocial: "Anunciante E2E S.A.S.",
  nombreComercial: "Anunciante E2E",
  nit: "999000001",
  digitoVerificacion: digitoVerificacion("999000001"),
  sector: "Otros",
  municipioPreferido: "11001",
}

export const ANUNCIANTE_NUEVO_E2E: DatosBaseAnunciante = {
  id: ANUNCIANTE_NUEVO_E2E_ID,
  razonSocial: "Anunciante Nuevo E2E S.A.S.",
  nombreComercial: "Anunciante Nuevo E2E",
  nit: "999000002",
  digitoVerificacion: digitoVerificacion("999000002"),
  sector: "Retail y comercio",
  municipioPreferido: "05001",
}

/** Documentos que exige verificar una empresa colombiana (`validar_verificacion_anunciante`). */
export const DOCUMENTOS_EXIGIDOS_CO = [
  "RUT",
  "CAMARA_COMERCIO",
] as const satisfies readonly TipoDocumentoAnunciante[]

export const NOMBRES_DOCUMENTO: Readonly<
  Record<(typeof DOCUMENTOS_EXIGIDOS_CO)[number], string>
> = {
  RUT: "Registro Único Tributario (RUT)",
  CAMARA_COMERCIO: "Certificado de Cámara de Comercio",
}

// ── Datos base ───────────────────────────────────────────────────────────────

export type FilaBaseAnunciante = Pick<
  FilaAnunciante,
  | "razon_social"
  | "nombre_comercial"
  | "nit"
  | "digito_verificacion"
  | "identificacion_extranjera"
  | "sector_id"
  | "pais_iso2"
  | "municipio_codigo"
  | "ciudad_extranjera"
  | "datos_facturacion"
  | "logo_path"
  | "deleted_at"
>

/** La fila base de `datos` con el sector y el municipio ya resueltos. */
export function filaBaseAnunciante(
  datos: DatosBaseAnunciante,
  sectorId: string,
  municipio: string
): FilaBaseAnunciante {
  return {
    razon_social: datos.razonSocial,
    nombre_comercial: datos.nombreComercial,
    nit: datos.nit,
    digito_verificacion: datos.digitoVerificacion,
    identificacion_extranjera: null,
    sector_id: sectorId,
    pais_iso2: "CO",
    municipio_codigo: municipio,
    ciudad_extranjera: null,
    datos_facturacion: {},
    logo_path: null,
    deleted_at: null,
  }
}

function mismoValor(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Columnas que difieren de los datos base (`null` si no hay nada que cambiar):
 * una corrida repetida no escribe ni deja ruido en la bitácora. Devuelve lo
 * que las pruebas cambian desde «Mi empresa» (datos, facturación, logo).
 */
export function cambiosAnunciante(
  fila: FilaBaseAnunciante,
  deseada: FilaBaseAnunciante
): Partial<FilaBaseAnunciante> | null {
  const columnas = (
    Object.keys(deseada) as (keyof FilaBaseAnunciante)[]
  ).filter((columna) => !mismoValor(fila[columna], deseada[columna]))
  if (columnas.length === 0) return null
  return Object.fromEntries(
    columnas.map((columna) => [
      columna,
      deseada[columna] as Json | string | null,
    ])
  ) as Partial<FilaBaseAnunciante>
}

// ── Anunciante Nuevo E2E ─────────────────────────────────────────────────────

export type FilaAnuncianteNuevo = Pick<
  FilaAnunciante,
  | "estado_verificacion"
  | "verificado_at"
  | "rechazado_at"
  | "suspendido_at"
  | "motivo_estado"
  | "deleted_at"
>

/**
 * - `CREAR`: no existe (primera corrida o tras una purga demo).
 * - `LIMPIAR`: sigue PENDIENTE y nunca pasó por una decisión del equipo AMO:
 *   basta con borrar lo que se le agregó y devolverle los datos base.
 * - `RECREAR`: se verificó, rechazó o suspendió alguna vez (ninguna
 *   transición lo devuelve a recién registrado): se borra y se registra de nuevo.
 */
export type AccionAnuncianteNuevo = "CREAR" | "LIMPIAR" | "RECREAR"

export function accionAnuncianteNuevo(
  fila: FilaAnuncianteNuevo | null
): AccionAnuncianteNuevo {
  if (!fila) return "CREAR"
  const recienRegistrado =
    fila.estado_verificacion === "PENDIENTE" &&
    fila.deleted_at === null &&
    fila.verificado_at === null &&
    fila.rechazado_at === null &&
    fila.suspendido_at === null &&
    fila.motivo_estado === null
  return recienRegistrado ? "LIMPIAR" : "RECREAR"
}

export function describirAccionAnuncianteNuevo(
  accion: AccionAnuncianteNuevo
): string {
  switch (accion) {
    case "CREAR":
      return "registrado (PENDIENTE)"
    case "LIMPIAR":
      return "reiniciado a recién registrado"
    case "RECREAR":
      return "registrado de nuevo (había pasado por una decisión del equipo AMO)"
  }
}

// ── Anunciante E2E verificado ────────────────────────────────────────────────

export interface FilaDocumentoAnunciante {
  tipo: TipoDocumentoAnunciante
  fecha_vencimiento: string | null
}

/** Tipos con algún documento aprobado que no ha vencido (`hoy` = `YYYY-MM-DD` en Bogotá). */
export function tiposVigentes(
  aprobados: readonly FilaDocumentoAnunciante[],
  hoy: string
): TipoDocumentoAnunciante[] {
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

/**
 * Vigencia que fija quien aprueba (`YYYY-MM-DD` en Bogotá): un año para la
 * Cámara de Comercio (se renueva cada año); el RUT no vence (`null`).
 */
export function vigenciaDocumentoAnunciante(
  tipo: TipoDocumentoAnunciante,
  ahora: Date
): string | null {
  return tipo === "CAMARA_COMERCIO" ? serializarFecha(addYears(ahora, 1)) : null
}

export interface EstadoAnuncianteVerificado {
  estado: EstadoAnunciante
  /** Tipos con un documento APROBADO y vigente. */
  documentosVigentes: readonly TipoDocumentoAnunciante[]
}

export type PasoAnunciante =
  | { paso: "APROBAR_DOCUMENTO"; documento: TipoDocumentoAnunciante }
  | { paso: "REENVIAR_A_VERIFICACION" }
  | { paso: "VERIFICAR" }
  | { paso: "REACTIVAR" }

/**
 * Lo que le falta al Anunciante E2E, en el orden en que se aplica: primero los
 * documentos (verificar los exige aprobados y vigentes) y después el estado.
 * RECHAZADO vuelve a PENDIENTE solo por su usuario («Enviar a verificación»).
 * Vacío = ya está listo.
 */
export function planAnuncianteVerificado(
  estado: EstadoAnuncianteVerificado
): PasoAnunciante[] {
  const vigentes = new Set(estado.documentosVigentes)
  const documentos = DOCUMENTOS_EXIGIDOS_CO.filter(
    (tipo) => !vigentes.has(tipo)
  ).map((documento): PasoAnunciante => ({
    paso: "APROBAR_DOCUMENTO",
    documento,
  }))
  const transiciones: Record<EstadoAnunciante, PasoAnunciante[]> = {
    PENDIENTE: [{ paso: "VERIFICAR" }],
    RECHAZADO: [{ paso: "REENVIAR_A_VERIFICACION" }, { paso: "VERIFICAR" }],
    SUSPENDIDO: [{ paso: "REACTIVAR" }],
    VERIFICADO: [],
  }
  return [...documentos, ...transiciones[estado.estado]]
}

export function describirPasoAnunciante(paso: PasoAnunciante): string {
  switch (paso.paso) {
    case "APROBAR_DOCUMENTO":
      return `documento ${paso.documento} aprobado`
    case "REENVIAR_A_VERIFICACION":
      return "reenviar a verificación (estaba rechazado)"
    case "VERIFICAR":
      return "verificar la empresa"
    case "REACTIVAR":
      return "reactivar (estaba suspendido)"
  }
}
