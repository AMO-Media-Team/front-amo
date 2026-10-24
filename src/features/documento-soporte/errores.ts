/**
 * Errores del documento soporte en voz de Finanzas (módulo puro). La BD explica casi todo en el `detail`
 * de sus `AMO_*`; aquí se da texto o destino propio a los `hint` de la fase (`numeracion_proveedor`,
 * `numeracion_plataforma`, `cuds_formato`, `cuds_registrado`, `documento_no_emitido`,
 * `archivo_no_cargado`, `requiere_nota_ajuste`) y se decide junto a qué campo mostrar cada uno. El
 * rótulo «Resolución agotada: …» lo pone `interpretarErrorBd`.
 */
import {
  codigoNegocio,
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
} from "@/lib/errores-bd"

export const MENSAJES_DOCUMENTO = {
  numeracionProveedor:
    "El proveedor tecnológico numera los documentos soporte: expídelo en su software y regístralo aquí con «Registrar documento expedido».",
  numeracionPlataforma:
    "La plataforma numera los documentos soporte: emítelo con «Emitir documento soporte».",
  cudsRegistrado:
    "El documento ya tiene otro CUDS registrado. Si ese está mal, corrígelo con una nota de ajuste.",
  documentoNoEmitido:
    "El documento ya no está emitido. Actualiza la página para ver su estado.",
  archivoNoCargado:
    "El PDF no terminó de cargarse. Elígelo de nuevo y vuelve a intentarlo.",
  requiereNotaAjuste:
    "El documento ya se transmitió a la DIAN (tiene CUDS): registra primero su nota de ajuste y después anúlalo.",
  sinDatosSensibles:
    "Necesitas también el permiso «Ver datos sensibles»: el documento lleva el nombre, el documento de identidad y la dirección del medio.",
  archivosConProveedor:
    "Con la numeración del proveedor tecnológico, el PDF es el que él expidió: aquí no se genera otro.",
  noEncontrado:
    "No encontramos ese documento soporte o ya no tienes acceso a él. Actualiza la página.",
  sinArchivo: "Ese archivo aún no existe para este documento.",
  numeracionPdfProveedor:
    "Con la numeración de la plataforma no se carga el PDF del proveedor: emite el documento desde aquí.",
  notaSinCuds:
    "La nota de ajuste aplica a un documento ya transmitido a la DIAN (con CUDS).",
  datosIlegibles:
    "No pudimos leer los datos del documento soporte. Intenta de nuevo en unos minutos.",
  documentoIlegible:
    "No pudimos leer el número de documento del medio con la llave de cifrado de este entorno. Avísale al equipo técnico.",
} as const

/** Campos de los diálogos donde se muestra un error. */
export type CampoDocumento =
  | "cuds"
  | "consecutivo"
  | "prefijo"
  | "fechaEmision"
  | "archivo"
  | "numero"
  | "cude"

export interface ErrorDocumento extends Omit<ErrorBdInterpretado, "campo"> {
  campo?: CampoDocumento
}

/** En qué operación se produjo el error (decide el campo de destino). */
export type OperacionDocumento =
  "emitir" | "generar" | "cuds" | "expedido" | "nota_ajuste" | "anular"

const HINTS: Readonly<
  Record<string, { mensaje: string | null; campo?: CampoDocumento }>
> = {
  numeracion_proveedor: { mensaje: MENSAJES_DOCUMENTO.numeracionProveedor },
  numeracion_plataforma: { mensaje: MENSAJES_DOCUMENTO.numeracionPlataforma },
  cuds_registrado: {
    mensaje: MENSAJES_DOCUMENTO.cudsRegistrado,
    campo: "cuds",
  },
  documento_no_emitido: { mensaje: MENSAJES_DOCUMENTO.documentoNoEmitido },
  archivo_no_cargado: {
    mensaje: MENSAJES_DOCUMENTO.archivoNoCargado,
    campo: "archivo",
  },
  requiere_nota_ajuste: { mensaje: MENSAJES_DOCUMENTO.requiereNotaAjuste },
  // El detalle de la BD ya lo dice bien («El CUDS son 96 caracteres…»).
  cuds_formato: { mensaje: null, campo: "cuds" },
}

/**
 * Detalles de la BD sin `hint` que corresponden a un campo, por operación. «Ese número o ese CUDS…» no
 * dice cuál de los dos: va al mensaje general.
 */
const DETALLES_CON_CAMPO: readonly {
  patron: RegExp
  campo: CampoDocumento
  operaciones: readonly OperacionDocumento[]
}[] = [
  {
    patron: /fecha de emisión/i,
    campo: "fechaEmision",
    operaciones: ["expedido"],
  },
  { patron: /^Ese CUDS ya/, campo: "cuds", operaciones: ["cuds", "expedido"] },
  {
    patron: /número de la nota de ajuste/i,
    campo: "numero",
    operaciones: ["nota_ajuste"],
  },
  { patron: /CUDE/, campo: "cude", operaciones: ["nota_ajuste"] },
]

export function interpretarErrorDocumento(
  error: ErrorBd,
  operacion: OperacionDocumento
): ErrorDocumento {
  const { campo: _, ...base } = interpretarErrorBd(error)
  const propio = HINTS[error.hint ?? ""]
  if (propio) {
    // Al generar los archivos no hay campo: el PDF lo sube el servidor.
    const campo =
      propio.campo === "archivo" && operacion === "generar"
        ? undefined
        : propio.campo
    return {
      ...base,
      esperado: true,
      mensaje: propio.mensaje ?? base.mensaje,
      ...(campo ? { campo } : {}),
    }
  }
  if (
    codigoNegocio(error) === "AMO_RESOLUCION_AGOTADA" &&
    operacion === "expedido"
  ) {
    return { ...base, campo: "consecutivo" }
  }
  const detalle = error.details ?? ""
  const conCampo = DETALLES_CON_CAMPO.find(
    ({ patron, operaciones }) =>
      operaciones.includes(operacion) && patron.test(detalle)
  )
  return conCampo ? { ...base, campo: conCampo.campo } : base
}
