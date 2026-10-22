/**
 * Errores de la BD al registrar o editar un anunciante → mensaje para la
 * persona y, si corresponde, el campo del formulario (módulo puro). Los
 * triggers lanzan `AMO_*` con un `detail` en español (§1.7): el del NIT
 * (`trg_anunciantes_b_identificacion`) va al dígito de verificación y el del
 * municipio inactivo (`fn_validar_municipio_activo`) al municipio. Las
 * restricciones se reconocen por su nombre. Nunca se muestra el mensaje técnico.
 */
import {
  codigoNegocio,
  type ErrorBd,
  MENSAJE_INESPERADO,
  mensajeErrorBd,
} from "@/lib/errores-bd"

import type { CampoAnunciante } from "./schemas"

export interface ErrorAnunciante {
  mensaje: string
  campo?: CampoAnunciante
}

export const SIN_PERMISO =
  "No tienes permiso para registrar o editar anunciantes, o tu sesión necesita verificarse de nuevo. Vuelve a ingresar si el problema continúa."

export const ANUNCIANTE_DESACTUALIZADO =
  "Otra persona actualizó este anunciante mientras lo editabas. Cierra la hoja, revisa los datos actuales y vuelve a intentarlo."

export const ANUNCIANTE_INEXISTENTE =
  "Este anunciante ya no está disponible: pudo darlo de baja otra persona."

export const NIT_REPETIDO = "Ya hay un anunciante registrado con ese NIT."

/** El sector elegido ya no está activo o se dio de baja (la FK no lo impide). */
export const SECTOR_NO_DISPONIBLE =
  "Ese sector ya no está disponible. Elige otro de la lista."

/** Restricción única del NIT (índice parcial sobre los no borrados). */
export const RESTRICCION_NIT_UNICO = "anunciantes_nit_key"

const RESTRICCIONES: readonly (Required<ErrorAnunciante> & {
  nombre: string
})[] = [
  { nombre: RESTRICCION_NIT_UNICO, campo: "nit", mensaje: NIT_REPETIDO },
  {
    nombre: "anunciantes_razon_social_chk",
    campo: "razonSocial",
    mensaje: "La razón social debe tener entre 2 y 200 caracteres.",
  },
  {
    nombre: "anunciantes_nombre_comercial_chk",
    campo: "nombreComercial",
    mensaje: "El nombre comercial debe tener entre 2 y 120 caracteres.",
  },
  {
    nombre: "anunciantes_nit_co_chk",
    campo: "nit",
    mensaje: "Escribe el NIT de la empresa.",
  },
  {
    nombre: "anunciantes_nit_chk",
    campo: "nit",
    mensaje:
      "El NIT tiene entre 6 y 15 dígitos, sin el dígito de verificación.",
  },
  {
    nombre: "anunciantes_digito_verificacion_chk",
    campo: "digitoVerificacion",
    mensaje: "Es un solo dígito, del 0 al 9.",
  },
  {
    nombre: "anunciantes_municipio_co_chk",
    campo: "municipioCodigo",
    mensaje: "Elige el municipio de la sede principal.",
  },
  {
    nombre: "anunciantes_municipio_pais_chk",
    campo: "paisIso2",
    mensaje: "Una empresa de otro país no lleva municipio colombiano.",
  },
  {
    nombre: "anunciantes_municipio_codigo_fkey",
    campo: "municipioCodigo",
    mensaje: "Elige un municipio de la lista.",
  },
  {
    nombre: "anunciantes_identificacion_extranjera_chk",
    campo: "identificacionExtranjera",
    mensaje: "La identificación tributaria debe tener entre 2 y 40 caracteres.",
  },
  {
    nombre: "anunciantes_ciudad_extranjera_chk",
    campo: "ciudadExtranjera",
    mensaje: "La ciudad admite hasta 120 caracteres.",
  },
  {
    nombre: "anunciantes_sector_id_fkey",
    campo: "sectorId",
    mensaje: SECTOR_NO_DISPONIBLE,
  },
  {
    nombre: "anunciantes_pais_iso2_fkey",
    campo: "paisIso2",
    mensaje: "Elige un país de la lista.",
  },
  {
    nombre: "anunciantes_datos_facturacion_chk",
    campo: "emailFacturacion",
    mensaje: "Los datos de facturación son demasiado extensos.",
  },
]

/** El `detail` de un trigger nombra lo que falló: se lleva a ese campo. */
function campoDelDetalle(detalle: string): CampoAnunciante | undefined {
  const texto = detalle.toLocaleLowerCase("es")
  if (texto.includes("dígito de verificación")) return "digitoVerificacion"
  if (texto.includes("municipio")) return "municipioCodigo"
  return undefined
}

export function interpretarErrorAnunciante(error: ErrorBd): ErrorAnunciante {
  const codigo = codigoNegocio(error)
  if (codigo === "AMO_NO_AUTORIZADO") {
    return { mensaje: error.details?.trim() || SIN_PERMISO }
  }
  if (codigo) {
    const mensaje = mensajeErrorBd(error)
    const campo = campoDelDetalle(error.details ?? "")
    return campo ? { mensaje, campo } : { mensaje }
  }
  const texto = `${error.message ?? ""} ${error.details ?? ""}`
  const restriccion = RESTRICCIONES.find(({ nombre }) =>
    texto.includes(`"${nombre}"`)
  )
  if (restriccion) {
    return { mensaje: restriccion.mensaje, campo: restriccion.campo }
  }
  if (error.code === "42501") return { mensaje: SIN_PERMISO }
  return { mensaje: MENSAJE_INESPERADO }
}

/** ¿Es una regla de negocio o una restricción conocida (no hace falta registrarla)? */
export function esErrorEsperado(error: ErrorBd): boolean {
  return interpretarErrorAnunciante(error).mensaje !== MENSAJE_INESPERADO
}

/** ¿El NIT ya lo tiene otro anunciante? (para nombrarlo en el mensaje). */
export function esNitRepetido(error: ErrorBd): boolean {
  return (
    error.code === "23505" &&
    `${error.message ?? ""} ${error.details ?? ""}`.includes(
      RESTRICCION_NIT_UNICO
    )
  )
}

/** Mensaje de NIT repetido con el nombre de quien ya lo tiene, si se pudo leer. */
export function mensajeNitRepetido(nombreComercial: string | null): string {
  return nombreComercial
    ? `Ese NIT ya está registrado a nombre de «${nombreComercial}». Búscalo en el listado en lugar de registrarlo de nuevo.`
    : NIT_REPETIDO
}
