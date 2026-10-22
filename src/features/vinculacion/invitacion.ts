/**
 * «Invitar» desde la cola de solicitudes (módulo puro): con qué valores se
 * abre la hoja, qué medios se ofrecen y si se puede invitar. La hoja llega
 * lista para confirmar con un clic: el medio nuevo con los datos de la
 * solicitud (o el que ya salió de ella), la persona de contacto y, si solo
 * hay uno, el rol de medio.
 */
import { ESTADOS_MEDIO, TIPOS_MEDIO } from "@/features/operacion/estados"

import { MENSAJES_VINCULACION } from "./errores"
import { medioYaRegistrado } from "./presentacion"
import type { EntradaInvitarSolicitud } from "./schemas"
import type {
  CapacidadesCola,
  MedioCoincidente,
  RolMedioAsignable,
  SolicitudVinculacion,
} from "./tipos"

/** Lo que la hoja necesita de la solicitud (lo demás no viaja al navegador). */
export type SolicitudParaInvitar = Pick<
  SolicitudVinculacion,
  | "id"
  | "nombreMedio"
  | "tipo"
  | "municipioCodigo"
  | "ubicacion"
  | "contactoNombre"
  | "email"
  | "celular"
  | "coincidencias"
>

/** Valor de `medioExistenteId` que significa «registrar un medio nuevo». */
export const MEDIO_NUEVO = ""

export type DisponibilidadInvitacion =
  { puede: true } | { puede: false; motivo: string }

/**
 * ¿Se puede invitar? Hace falta el permiso de invitar (con un rol de medio
 * asignable) y un medio al cual vincular: uno nuevo (permiso de registrar
 * medios) o uno ya registrado con el mismo nombre.
 */
export function disponibilidadInvitacion(
  solicitud: Pick<SolicitudParaInvitar, "coincidencias">,
  capacidades: CapacidadesCola
): DisponibilidadInvitacion {
  if (!capacidades.invitar) {
    return {
      puede: false,
      motivo:
        capacidades.motivoSinInvitar ?? MENSAJES_VINCULACION.sinPermisoInvitar,
    }
  }
  if (!capacidades.registrarMedio && solicitud.coincidencias.length === 0) {
    return { puede: false, motivo: MENSAJES_VINCULACION.sinMedioParaVincular }
  }
  return { puede: true }
}

/**
 * Medio que se propone: el que ya salió de esta solicitud (un intento que no
 * terminó), si no uno nuevo y, sin permiso para registrarlo, el primero con
 * el mismo nombre.
 */
export function medioPropuesto(
  coincidencias: readonly MedioCoincidente[],
  registrarMedio: boolean
): string {
  const anterior = medioYaRegistrado(coincidencias)
  if (anterior) return anterior.id
  if (registrarMedio) return MEDIO_NUEVO
  return coincidencias[0]?.id ?? MEDIO_NUEVO
}

/** Valores con que se abre la hoja «Invitar». */
export function valoresInvitacion(
  solicitud: SolicitudParaInvitar,
  roles: readonly RolMedioAsignable[],
  capacidades: CapacidadesCola
): EntradaInvitarSolicitud {
  return {
    solicitudId: solicitud.id,
    medioExistenteId: medioPropuesto(
      solicitud.coincidencias,
      capacidades.registrarMedio
    ),
    nombreMedio: solicitud.nombreMedio,
    tipo: solicitud.tipo ?? "",
    municipioCodigo: solicitud.municipioCodigo,
    contactoNombre: solicitud.contactoNombre,
    email: solicitud.email,
    celular: solicitud.celular ?? "",
    rolId: roles.length === 1 ? roles[0].id : "",
    metodo: "ENLACE",
  }
}

export interface OpcionMedio {
  /** `MEDIO_NUEVO` o el id del medio registrado. */
  valor: string
  titulo: string
  descripcion: string
}

/**
 * Opciones del medio en la hoja: registrar uno nuevo (si se puede) y los ya
 * registrados con el mismo nombre. `extra` es el medio que acaba de quedar
 * registrado en un intento fallido, por si la cola aún no lo trae.
 */
export function opcionesMedio(
  solicitud: Pick<SolicitudParaInvitar, "nombreMedio" | "ubicacion" | "tipo">,
  coincidencias: readonly MedioCoincidente[],
  registrarMedio: boolean,
  extra: { id: string; nombre: string } | null = null
): OpcionMedio[] {
  const opciones: OpcionMedio[] = []
  if (registrarMedio && !medioYaRegistrado(coincidencias) && !extra) {
    opciones.push({
      valor: MEDIO_NUEVO,
      titulo: `Registrar «${solicitud.nombreMedio}»`,
      descripcion: [
        "Medio nuevo",
        solicitud.tipo ? TIPOS_MEDIO[solicitud.tipo] : null,
        solicitud.ubicacion,
      ]
        .filter(Boolean)
        .join(" · "),
    })
  }
  if (extra && !coincidencias.some((medio) => medio.id === extra.id)) {
    opciones.push({
      valor: extra.id,
      titulo: extra.nombre,
      descripcion: "Registrado hace un momento con esta solicitud",
    })
  }
  for (const medio of coincidencias) {
    opciones.push({
      valor: medio.id,
      titulo: medio.nombre,
      descripcion: [
        medio.desdeSolicitud
          ? "Registrado con esta solicitud"
          : "Ya registrado",
        medio.municipio,
        ESTADOS_MEDIO[medio.estado].etiqueta,
      ].join(" · "),
    })
  }
  return opciones
}
