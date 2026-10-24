/**
 * Errores de la facturación en voz de Finanzas (módulo puro). La BD explica
 * casi todo en el `detail` de sus `AMO_*`; aquí se decide en qué campo del
 * formulario va cada error según su `hint` (`total_distinto`, `cufe_formato`,
 * `cude_formato`, `archivo_no_cargado`, `soporte_no_cargado`, `fecha_pago`,
 * `monto_invalido`), se da texto y acción propios a los que no son de un
 * campo (`sin_asignaciones`, `borrador_desactualizado`,
 * `requiere_nota_credito`) y se traducen las restricciones únicas.
 */
import {
  codigoNegocio,
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

export const HINT_SIN_ASIGNACIONES = "sin_asignaciones"
export const HINT_BORRADOR_DESACTUALIZADO = "borrador_desactualizado"
export const HINT_REQUIERE_NOTA_CREDITO = "requiere_nota_credito"

export const MENSAJES_FACTURACION = {
  sinAsignaciones:
    "No hay asignaciones verificadas sin facturar hasta esa fecha para lo que elegiste. Cambia la fecha de corte o la campaña.",
  borradorDesactualizado:
    "Alguna asignación de este borrador ya no está verificada (entró en disputa o se canceló). Anula el borrador y genera otro con lo que sí se puede facturar.",
  requiereNotaCredito:
    "Una factura expedida no se anula: registra la nota crédito emitida en el software de facturación.",
  noEncontrada:
    "No encontramos esa factura o ya no tienes acceso a ella. Actualiza la página.",
  soloBorrador:
    "Solo se anula un borrador. Una factura expedida se corrige con una nota crédito.",
  yaNoEsBorrador:
    "Esta factura ya no es un borrador: la página ya muestra su estado actual.",
  sinCobro:
    "Esta factura ya no tiene saldo por cobrar: la página ya muestra su estado actual.",
  archivoAjeno:
    "El archivo no corresponde a esta factura. Vuelve a cargarlo desde este formulario.",
  sinPermisoArchivo: "No tienes permiso para cargar ese archivo.",
  sinArchivo: "Esta factura no tiene ese archivo.",
  borradorConLineasCaidas:
    "Alguna asignación de este borrador ya no está verificada: anúlalo y genera otro antes de preparar el archivo de carga.",
  sinLineas:
    "Este borrador no tiene asignaciones a la vista: no hay nada que cargar en el software de facturación.",
  sinRegistroExportacion:
    "No pudimos registrar la descarga en la bitácora, así que no se generó el archivo. Inténtalo de nuevo.",
} as const

/** Campo del formulario donde se muestra el error de cada `hint`. */
const CAMPO_POR_HINT: Readonly<Record<string, string>> = {
  total_distinto: "total",
  cufe_formato: "cufe",
  cude_formato: "cude",
  archivo_no_cargado: "archivo",
  soporte_no_cargado: "archivo",
  fecha_pago: "fecha",
  monto_invalido: "monto",
  sin_asignaciones: "hasta",
}

/** Texto propio de los `hint` que no se arreglan en un campo. */
const MENSAJE_POR_HINT: Readonly<Record<string, string>> = {
  [HINT_SIN_ASIGNACIONES]: MENSAJES_FACTURACION.sinAsignaciones,
  [HINT_BORRADOR_DESACTUALIZADO]: MENSAJES_FACTURACION.borradorDesactualizado,
  [HINT_REQUIERE_NOTA_CREDITO]: MENSAJES_FACTURACION.requiereNotaCredito,
}

const RESTRICCIONES: Restricciones = {
  facturas_numero_key: {
    mensaje: "Ese número ya está registrado en otra factura.",
    campo: "consecutivo",
  },
  facturas_cufe_key: {
    mensaje: "Ese CUFE ya está registrado en otra factura.",
    campo: "cufe",
  },
  facturas_vencimiento_chk: {
    mensaje: "El vencimiento no puede ser anterior a la emisión.",
    campo: "fechaVencimiento",
  },
  notas_credito_numero_key: {
    mensaje: "Esa nota crédito ya está registrada.",
    campo: "numero",
  },
  notas_credito_cude_key: {
    mensaje: "Ese CUDE ya está registrado en otra nota crédito.",
    campo: "cude",
  },
  notas_credito_motivo_chk: {
    mensaje: "Cuenta el motivo (de 10 a 1.000 caracteres).",
    campo: "motivo",
  },
  pagos_anunciante_referencia_chk: {
    mensaje: "La referencia admite hasta 120 caracteres.",
    campo: "referencia",
  },
}

/** Campo de cada código de negocio cuando no trae `hint`. */
const CAMPO_POR_CODIGO: Readonly<Record<string, string>> = {
  AMO_RESOLUCION_AGOTADA: "consecutivo",
  AMO_MOTIVO_REQUERIDO: "motivo",
}

/** Lo que la persona debe hacer además de leer el mensaje. */
export type AccionSugerida = "anular_borrador" | "actualizar"

export interface ErrorFacturacion extends ErrorBdInterpretado {
  accion: AccionSugerida | null
}

/**
 * Mensaje, campo (si el formulario lo tiene) y acción sugerida de un error de
 * la BD. Los `AMO_TRANSICION_INVALIDA` sin `hint` (otro cambió el estado)
 * piden actualizar la página.
 */
export function interpretarErrorFacturacion(error: ErrorBd): ErrorFacturacion {
  const base = interpretarErrorBd(error, RESTRICCIONES)
  const hint = error.hint?.trim() ?? ""
  const propio = MENSAJE_POR_HINT[hint]
  const codigo = codigoNegocio(error)
  const campo =
    CAMPO_POR_HINT[hint] ??
    (codigo ? CAMPO_POR_CODIGO[codigo] : undefined) ??
    base.campo
  const accion: AccionSugerida | null =
    hint === HINT_BORRADOR_DESACTUALIZADO
      ? "anular_borrador"
      : codigo === "AMO_TRANSICION_INVALIDA" && !hint
        ? "actualizar"
        : null
  return {
    ...base,
    mensaje: propio ?? base.mensaje,
    ...(campo ? { campo } : {}),
    accion,
  }
}
