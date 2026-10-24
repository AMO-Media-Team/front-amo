/**
 * Presentación del documento soporte (módulo puro): estados, cómo se arma la ficha a partir de las filas
 * de la liquidación, qué acciones se ofrecen según el estado, la numeración y el permiso, y qué le toca
 * hacer a Finanzas en cada momento.
 */
import type {
  EstadoLiquidacion,
  PresentacionEstado,
} from "@/features/operacion/estados"
import type { Json } from "@/types/database.types"

import type { ArchivoDocumento } from "./schemas"
import type {
  DocumentoSoporteFicha,
  EstadoDocumentoSoporte,
  NumeracionDocumentoSoporte,
} from "./tipos"

export const ESTADOS_DOCUMENTO_SOPORTE: Readonly<
  Record<EstadoDocumentoSoporte, PresentacionEstado>
> = {
  BORRADOR: {
    etiqueta: "Sin emitir",
    tono: "neutro",
    descripcion: "Aún no tiene número de la resolución.",
  },
  EMITIDO: {
    etiqueta: "Emitido",
    tono: "exito",
    descripcion: "Numerado con la resolución de documento soporte.",
  },
  ANULADO: {
    etiqueta: "Anulado",
    tono: "neutro",
    descripcion: "Se anuló; su número no se vuelve a usar.",
  },
}

export const NOMBRES_ARCHIVO: Readonly<Record<ArchivoDocumento, string>> = {
  pdf: "PDF del documento",
  proveedor: "Archivo para el proveedor",
  nota_ajuste: "Nota de ajuste",
}

/** Nombre del archivo que se descarga: «Documento soporte DS1234.pdf». */
export function nombreDescargaArchivo(
  archivo: ArchivoDocumento,
  numero: string | null
): string {
  const sufijo = numero ? ` ${numero}` : ""
  switch (archivo) {
    case "pdf":
      return `Documento soporte${sufijo}.pdf`
    case "proveedor":
      return `Documento soporte${sufijo} para el proveedor.json`
    case "nota_ajuste":
      return `Nota de ajuste del documento soporte${sufijo}.pdf`
  }
}

/** «a1b2c3d4…e5f6a1»: para nombrarlo sin ocupar tres líneas. */
export function abreviarCodigo(codigo: string): string {
  return codigo.length <= 16
    ? codigo
    : `${codigo.slice(0, 8)}…${codigo.slice(-6)}`
}

/** `"PROVEEDOR"` solo si la configuración lo dice; cualquier otro valor (o sin lectura) es la plataforma. */
export function leerNumeracion(
  valor: Json | undefined
): NumeracionDocumentoSoporte {
  return valor === "PROVEEDOR" ? "PROVEEDOR" : "PLATAFORMA"
}

// ── Ficha a partir de las filas de la liquidación ────────────────────────────

/** Columnas de `documentos_soporte` que lee la ficha. */
export interface FilaDocumentoSoporte {
  id: string
  estado: EstadoDocumentoSoporte
  numero: string | null
  fecha_emision: string | null
  valor_total: number
  cuds: string | null
  cuds_registrado_at: string | null
  archivo_path: string | null
  archivo_proveedor_path: string | null
  nota_ajuste_numero: string | null
  nota_ajuste_cude: string | null
  nota_ajuste_path: string | null
  nota_ajuste_at: string | null
  anulado_at: string | null
  created_at: string
}

export const COLUMNAS_DOCUMENTO =
  "id, estado, numero, fecha_emision, valor_total, cuds, cuds_registrado_at, archivo_path, archivo_proveedor_path, nota_ajuste_numero, nota_ajuste_cude, nota_ajuste_path, nota_ajuste_at, anulado_at, created_at"

function masReciente(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? 1 : -1
}

/**
 * El vigente (no anulado) o, si todos se anularon, el último; los demás anulados van en `anteriores`, del
 * más reciente al más antiguo. Sin filas, `null`.
 */
export function fichaDocumentoSoporte(
  filas: readonly FilaDocumentoSoporte[]
): DocumentoSoporteFicha | null {
  const recientes = [...filas].sort(
    (a, b) => masReciente(a.created_at, b.created_at) || masReciente(a.id, b.id)
  )
  const principal =
    recientes.find((fila) => fila.estado !== "ANULADO") ?? recientes[0]
  if (!principal) return null
  const anteriores = recientes
    .filter((fila) => fila.estado === "ANULADO" && fila.id !== principal.id)
    .sort(
      (a, b) =>
        masReciente(a.anulado_at, b.anulado_at) ||
        masReciente(a.created_at, b.created_at)
    )
  const nota =
    principal.nota_ajuste_numero &&
    principal.nota_ajuste_path &&
    principal.nota_ajuste_at
      ? {
          numero: principal.nota_ajuste_numero,
          cude: principal.nota_ajuste_cude,
          archivoPath: principal.nota_ajuste_path,
          registradaAt: principal.nota_ajuste_at,
        }
      : null
  return {
    id: principal.id,
    estado: principal.estado,
    numero: principal.numero,
    fechaEmision: principal.fecha_emision,
    valorTotal: Number(principal.valor_total),
    cuds: principal.cuds,
    cudsRegistradoAt: principal.cuds_registrado_at,
    archivoPath: principal.archivo_path,
    archivoProveedorPath: principal.archivo_proveedor_path,
    notaAjuste: nota,
    anteriores: anteriores.map((fila) => ({
      id: fila.id,
      numero: fila.numero,
      anuladoAt: fila.anulado_at,
      notaAjusteNumero: fila.nota_ajuste_numero,
    })),
  }
}

// ── Acciones según estado, numeración y permiso ──────────────────────────────

export interface ContextoDocumento {
  estadoLiquidacion: EstadoLiquidacion
  documento: DocumentoSoporteFicha | null
  numeracion: NumeracionDocumentoSoporte
  puedeGestionar: boolean
}

export interface AccionesDocumento {
  /** Numeración de la plataforma: asignar el consecutivo y generar los archivos. */
  emitir: boolean
  /** Numeración del proveedor: registrar el que él expidió. */
  registrarExpedido: boolean
  /** `faltan`: el documento emitido no tiene sus archivos; `regenerar`: volver a generarlos. */
  generarArchivos: "faltan" | "regenerar" | null
  registrarCuds: boolean
  registrarNotaAjuste: boolean
  anular: boolean
  descargas: ArchivoDocumento[]
}

/** La liquidación aprobada aún no tiene un documento emitido (no hay, es borrador o se anuló). */
export function faltaEmitir({
  estadoLiquidacion,
  documento,
}: Pick<ContextoDocumento, "estadoLiquidacion" | "documento">): boolean {
  return estadoLiquidacion === "APROBADA" && documento?.estado !== "EMITIDO"
}

function archivosDe(documento: DocumentoSoporteFicha): ArchivoDocumento[] {
  return [
    ...(documento.archivoPath ? (["pdf"] as const) : []),
    ...(documento.archivoProveedorPath ? (["proveedor"] as const) : []),
    ...(documento.notaAjuste ? (["nota_ajuste"] as const) : []),
  ]
}

/** Lo que se puede descargar del documento; nada si sus archivos están reservados para la sesión. */
export function descargasDocumento(
  documento: DocumentoSoporteFicha | null
): ArchivoDocumento[] {
  if (!documento || documento.archivosReservados) return []
  return archivosDe(documento)
}

/**
 * El documento (o uno anterior) tiene archivos que la sesión no puede descargar por no tener
 * `datos_sensibles.ver`: la sección lo explica en lugar de ofrecerlos.
 */
export function descargasReservadas(
  documento: DocumentoSoporteFicha | null
): boolean {
  if (!documento?.archivosReservados) return false
  return (
    archivosDe(documento).length > 0 ||
    documento.anteriores.some(
      (anterior) =>
        anterior.numero !== null || anterior.notaAjusteNumero !== null
    )
  )
}

export function accionesDocumentoSoporte(
  contexto: ContextoDocumento
): AccionesDocumento {
  const { estadoLiquidacion, documento, numeracion, puedeGestionar } = contexto
  const ninguna: AccionesDocumento = {
    emitir: false,
    registrarExpedido: false,
    generarArchivos: null,
    registrarCuds: false,
    registrarNotaAjuste: false,
    anular: false,
    descargas: descargasDocumento(documento),
  }
  if (!puedeGestionar) return ninguna
  if (faltaEmitir(contexto)) {
    return {
      ...ninguna,
      emitir: numeracion === "PLATAFORMA",
      registrarExpedido: numeracion === "PROVEEDOR",
    }
  }
  const vigente =
    documento?.estado === "EMITIDO" &&
    (estadoLiquidacion === "APROBADA" || estadoLiquidacion === "PAGADA")
  if (!documento || !vigente) return ninguna
  const conCuds = documento.cuds !== null
  const aprobada = estadoLiquidacion === "APROBADA"
  return {
    ...ninguna,
    generarArchivos:
      numeracion !== "PLATAFORMA"
        ? null
        : documento.archivoPath && documento.archivoProveedorPath
          ? "regenerar"
          : "faltan",
    registrarCuds: !conCuds,
    // D38 del RF: con CUDS se corrige con nota de ajuste antes de anular. Una liquidación pagada no anula su
    // documento (D77: el pago necesita su soporte), pero sí registra la nota de ajuste que lo corrige.
    registrarNotaAjuste: conCuds && documento.notaAjuste === null,
    anular: aprobada && (!conCuds || documento.notaAjuste !== null),
  }
}

// ── Qué le toca hacer a Finanzas ─────────────────────────────────────────────

export interface SituacionDocumento {
  tono: "neutro" | "info" | "aviso" | "exito"
  titulo: string
  detalle: string
}

export function situacionDocumento(
  contexto: ContextoDocumento
): SituacionDocumento {
  const { estadoLiquidacion, documento, numeracion, puedeGestionar } = contexto
  const quien = puedeGestionar
    ? ""
    : " Lo hace quien puede aprobar liquidaciones."

  if (estadoLiquidacion === "ANULADA") {
    return {
      tono: "neutro",
      titulo: "Liquidación anulada",
      detalle:
        "Esta liquidación no lleva documento soporte vigente: sus publicaciones vuelven a quedar por liquidar.",
    }
  }
  if (estadoLiquidacion === "BORRADOR") {
    return {
      tono: "neutro",
      titulo: "Se emite al aprobar la liquidación",
      detalle: `Cuando la liquidación esté aprobada, el documento soporte se ${
        numeracion === "PLATAFORMA"
          ? "emite desde aquí con el siguiente número de la resolución"
          : "registra aquí con el número que asigne el proveedor tecnológico"
      }.`,
    }
  }
  if (faltaEmitir(contexto)) {
    const anulado =
      documento?.estado === "ANULADO" && documento.numero
        ? `El documento ${documento.numero} se anuló. `
        : ""
    return {
      tono: "aviso",
      titulo: "Documento soporte requerido",
      detalle:
        anulado +
        (numeracion === "PLATAFORMA"
          ? "Emítelo para poder registrar el pago: se numera con la resolución vigente y se generan el PDF y el archivo para el proveedor tecnológico."
          : "Expídelo en el software del proveedor tecnológico y registra aquí su número, fecha, CUDS y PDF para poder registrar el pago.") +
        quien,
    }
  }
  if (!documento || documento.estado !== "EMITIDO") {
    return {
      tono: "neutro",
      titulo: "Sin documento soporte",
      detalle: "Esta liquidación no tiene un documento soporte emitido.",
    }
  }
  if (documento.notaAjuste) {
    return {
      tono: "aviso",
      titulo: "Nota de ajuste registrada",
      detalle:
        estadoLiquidacion === "APROBADA"
          ? `Anula este documento para emitir uno nuevo con el valor correcto.${quien}`
          : "La liquidación ya se pagó: el documento y su nota de ajuste quedan como soporte.",
    }
  }
  if (documento.cuds) {
    return {
      tono: "exito",
      titulo: "Transmitido a la DIAN",
      detalle:
        estadoLiquidacion === "APROBADA"
          ? "Si hay un error, se corrige con una nota de ajuste antes de anularlo."
          : "El documento soporta el pago de esta liquidación. Si hay un error, se corrige con una nota de ajuste.",
    }
  }
  return {
    tono: "info",
    titulo: "Pendiente de transmisión a la DIAN",
    detalle: `Envía el archivo al proveedor tecnológico para transmitirlo y registra aquí el CUDS que te devuelva.${quien}`,
  }
}
