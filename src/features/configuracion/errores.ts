/**
 * Errores de la BD al escribir configuración → mensaje para la persona y, si
 * corresponde, el campo del formulario (módulo puro). Las guardas lanzan
 * `AMO_*` con un `detail` en español (§1.7); las restricciones se reconocen
 * por su nombre. Nunca se muestra el mensaje técnico.
 */
import {
  codigoNegocio,
  type ErrorBd,
  MENSAJE_INESPERADO,
} from "@/features/usuarios/errores"

import { tituloParametro } from "./parametros"

export interface ErrorInterpretado {
  mensaje: string
  campo?: string
}

export const SIN_PERMISO =
  "No tienes permiso para este cambio o tu sesión necesita verificarse de nuevo. Vuelve a ingresar si el problema continúa."

/** Edición en línea: la página ya muestra el valor vigente y basta reintentar. */
export const CAMBIO_CONCURRENTE =
  "Otra persona cambió este dato mientras lo editabas. Revisa el valor actual y vuelve a intentarlo."

/** Formularios y confirmaciones: lo abierto quedó desactualizado y hay que reabrirlo. */
export const REGISTRO_DESACTUALIZADO =
  "Otra persona cambió este registro mientras lo tenías abierto. Ciérralo, revisa los datos actuales y vuelve a intentarlo."

export const REGISTRO_INEXISTENTE =
  "El registro ya no está disponible: pudo eliminarlo otra persona. Cierra y continúa con la lista actualizada."

const MENSAJES_NEGOCIO: Readonly<Record<string, string>> = {
  AMO_NO_AUTORIZADO: SIN_PERMISO,
  AMO_CONFIG_INVALIDA: "El valor no cumple las reglas de este parámetro.",
}

const RESTRICCIONES: readonly (ErrorInterpretado & { nombre: string })[] = [
  // Tarifas
  {
    nombre: "tarifas_vigencia_excl",
    mensaje:
      "Ya hay una tarifa en ese tramo de fechas para el mismo formato y franja.",
  },
  {
    nombre: "tarifas_valor_base_chk",
    mensaje: "El valor de la tarifa debe ser mayor que cero.",
    campo: "valor",
  },
  // Franjas
  {
    nombre: "franjas_clave_key",
    mensaje: "Ya existe una franja con esa clave.",
    campo: "clave",
  },
  {
    nombre: "franjas_clave_chk",
    mensaje: "Usa F seguida de un dígito (F4).",
    campo: "clave",
  },
  {
    nombre: "franjas_nombre_chk",
    mensaje: "El nombre debe tener entre 2 y 60 caracteres.",
    campo: "nombre",
  },
  {
    nombre: "franjas_seguidores_max_chk",
    mensaje: "El máximo debe ser mayor que el mínimo.",
    campo: "seguidoresMax",
  },
  {
    nombre: "franjas_rango_excl",
    mensaje:
      "El rango se cruza con otra franja activa. Ajusta los límites o desactiva la otra franja.",
    campo: "seguidoresMin",
  },
  // Formatos
  {
    nombre: "formatos_plataforma_clave_key",
    mensaje: "Esa plataforma ya tiene un formato de ese tipo.",
    campo: "clave",
  },
  {
    nombre: "formatos_nombre_chk",
    mensaje: "El nombre debe tener entre 2 y 60 caracteres.",
    campo: "nombre",
  },
  {
    nombre: "formatos_requisitos_chk",
    mensaje: "Los requisitos del formato son demasiado extensos.",
  },
  // Comisiones de excepción
  {
    nombre: "comisiones_excepcion_anunciante_excl",
    mensaje:
      "Ese anunciante ya tiene una excepción en esas fechas. Finaliza la anterior o ajusta la vigencia.",
    campo: "desde",
  },
  {
    nombre: "comisiones_excepcion_campana_excl",
    mensaje:
      "Esa campaña ya tiene una excepción en esas fechas. Finaliza la anterior o ajusta la vigencia.",
    campo: "desde",
  },
  {
    nombre: "comisiones_excepcion_porcentaje_chk",
    mensaje: "La comisión debe estar entre 0% y 50%.",
    campo: "porcentaje",
  },
  {
    nombre: "comisiones_excepcion_vigencia_chk",
    mensaje: "El fin de la vigencia debe ser posterior al inicio.",
    campo: "hasta",
  },
  {
    nombre: "comisiones_excepcion_motivo_chk",
    mensaje: "El motivo debe tener entre 3 y 500 caracteres.",
    campo: "motivo",
  },
  {
    nombre: "comisiones_excepcion_anunciante_id_fkey",
    mensaje: "Ese anunciante ya no existe. Elige otro de la lista.",
    campo: "objetivoId",
  },
  {
    nombre: "comisiones_excepcion_campana_id_fkey",
    mensaje: "Esa campaña ya no existe. Elige otra de la lista.",
    campo: "objetivoId",
  },
  {
    nombre: "asignacion_montos_comision_excepcion_id_fkey",
    mensaje:
      "Esta excepción ya se aplicó a asignaciones: no se puede eliminar. Finalízala para que no se use más.",
  },
  // Niveles de verificación
  {
    nombre: "niveles_verificacion_porcentajes_chk",
    mensaje:
      "La alerta debe llegar antes (o a la vez) que el bloqueo, y ninguno puede pasar del 100%.",
    campo: "porcentajeAlerta",
  },
  {
    nombre: "niveles_verificacion_documentos_chk",
    mensaje: "Elige al menos un documento.",
    campo: "documentosRequeridos",
  },
  {
    nombre: "niveles_verificacion_tope_chk",
    mensaje: "El tope anual debe ser mayor que cero.",
    campo: "topeAnual",
  },
  {
    nombre: "niveles_verificacion_nombre_chk",
    mensaje: "El nombre debe tener entre 2 y 80 caracteres.",
    campo: "nombre",
  },
  // Tributario
  {
    nombre: "parametros_tributarios_pkey",
    mensaje: "Ese año ya tiene parámetros. Edítalos en lugar de crearlos.",
    campo: "anio",
  },
  {
    nombre: "parametros_tributarios_anio_chk",
    mensaje: "El año debe estar entre 2020 y 2100.",
    campo: "anio",
  },
  {
    nombre: "retenciones_config_vigencia_excl",
    mensaje:
      "Ya hay una retención del mismo tipo, concepto y condición de declarante en esas fechas.",
    campo: "desde",
  },
  {
    nombre: "retenciones_config_vigencia_chk",
    mensaje: "El fin de la vigencia debe ser posterior al inicio.",
    campo: "hasta",
  },
  {
    nombre: "reteica_municipal_vigencia_excl",
    mensaje: "Ese municipio ya tiene una tarifa de ReteICA en esas fechas.",
    campo: "desde",
  },
  {
    nombre: "reteica_municipal_vigencia_chk",
    mensaje: "El fin de la vigencia debe ser posterior al inicio.",
    campo: "hasta",
  },
  {
    nombre: "reteica_municipal_municipio_codigo_fkey",
    mensaje: "El municipio no existe.",
    campo: "municipioCodigo",
  },
  {
    nombre: "resoluciones_dian_tipo_activa_key",
    mensaje:
      "Ya hay otra resolución activa para ese documento. Desactívala primero.",
    campo: "activa",
  },
  {
    nombre: "resoluciones_dian_rango_excl",
    mensaje:
      "El rango se cruza con otra resolución del mismo documento y prefijo.",
    campo: "rangoDesde",
  },
  {
    nombre: "resoluciones_dian_consecutivo_chk",
    mensaje:
      "El rango no puede dejar por fuera números ya emitidos con esta resolución.",
    campo: "rangoHasta",
  },
  {
    nombre: "resoluciones_dian_prefijo_chk",
    mensaje: "El prefijo admite hasta 4 letras o números.",
    campo: "prefijo",
  },
  // Catálogos
  {
    nombre: "sectores_nombre_normalizado_key",
    mensaje: "Ya existe un sector con ese nombre.",
    campo: "nombre",
  },
  {
    nombre: "categorias_nombre_normalizado_key",
    mensaje: "Ya existe una categoría con ese nombre.",
    campo: "nombre",
  },
  // Legal y plantillas
  {
    nombre: "terminos_versiones_tipo_version_key",
    mensaje: "Ya existe esa versión para este documento.",
    campo: "version",
  },
  {
    nombre: "terminos_versiones_version_chk",
    mensaje: "Usa letras, números, punto o guion (máx. 20).",
    campo: "version",
  },
  {
    nombre: "plantillas_notificacion_asunto_email_chk",
    mensaje: "Un correo necesita asunto.",
    campo: "asunto",
  },
  {
    nombre: "plantillas_notificacion_cuerpo_chk",
    mensaje: "El texto debe tener entre 1 y 5.000 caracteres.",
    campo: "cuerpo",
  },
]

const DETALLE_PARAMETRO = /^El valor de «([^»]+)» (.+)$/

/** El detalle de `fn_validar_configuracion` nombra la clave; se cambia por su título. */
function detalleLegible(detalle: string): string {
  const coincidencia = DETALLE_PARAMETRO.exec(detalle)
  if (!coincidencia) return detalle
  const [, clave, resto] = coincidencia
  return `El valor de «${tituloParametro(clave)}» ${resto}`
}

export function interpretarErrorConfiguracion(
  error: ErrorBd
): ErrorInterpretado {
  const codigo = codigoNegocio(error)
  if (codigo) {
    const detalle = error.details?.trim()
    return {
      mensaje: detalle
        ? detalleLegible(detalle)
        : (MENSAJES_NEGOCIO[codigo] ?? MENSAJE_INESPERADO),
    }
  }
  const texto = `${error.message ?? ""} ${error.details ?? ""}`
  const restriccion = RESTRICCIONES.find(({ nombre }) => texto.includes(nombre))
  if (restriccion) {
    const { mensaje, campo } = restriccion
    return campo ? { mensaje, campo } : { mensaje }
  }
  if (error.code === "42501") return { mensaje: SIN_PERMISO }
  return { mensaje: MENSAJE_INESPERADO }
}

/** ¿Es una regla de negocio o una restricción conocida (no hace falta registrarla)? */
export function esErrorEsperado(error: ErrorBd): boolean {
  return interpretarErrorConfiguracion(error).mensaje !== MENSAJE_INESPERADO
}
