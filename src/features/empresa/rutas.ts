/**
 * Rutas de «Mi empresa» (contrato con la navegación y el resolvedor `/ir`,
 * que lleva al anunciante a `/empresa` y `/empresa/documentos`).
 */
import type { Route } from "next"

const ruta = (valor: `/${string}`): Route => valor as Route

export const RUTAS_EMPRESA = {
  inicio: ruta("/empresa"),
  documentos: ruta("/empresa/documentos"),
  equipo: ruta("/empresa/equipo"),
} as const

/** Ancla de la tarjeta «Persona de contacto» dentro de `/empresa`. */
export const ANCLA_CONTACTO = "contacto"

/** Ancla del formulario «Datos de la empresa» dentro de `/empresa`. */
export const ANCLA_DATOS = "datos"

export const RUTA_CONTACTO = ruta(`/empresa#${ANCLA_CONTACTO}`)
export const RUTA_DATOS = ruta(`/empresa#${ANCLA_DATOS}`)
