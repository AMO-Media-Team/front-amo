/**
 * DTO del módulo de Auditoría: lo que la interfaz necesita de cada evento de
 * la bitácora, ya descrito y con los valores listos para mostrar. Nunca lleva
 * la IP completa sin `datos_sensibles.ver` (se enmascara en el servidor).
 */
import type { DatosExportacion } from "@/components/data-table/exportar"

import type { CursorTiempo } from "./filtros-postgrest"
import type { OrigenBitacora, TonoEvento } from "./catalogo"
import type { CambiosPresentados, ParMetadato } from "./diferencias"

export type ActorEvento = {
  id: string | null
  /** Nombre del perfil o, si no es visible, el correo enmascarado de la bitácora. */
  nombre: string
  /** Correo enmascarado en el momento del evento (`bitacora.actor_email`). */
  correo: string | null
  rol: string | null
  /** HEX del rol, para el avatar. */
  color: string | null
  /** Sin persona: triggers, tareas programadas o la propia base de datos. */
  esSistema: boolean
}

export type UbicacionEvento = {
  ip: string | null
  paisIso2: string | null
  pais: string | null
  ciudad: string | null
  navegador: string | null
  sistemaOperativo: string | null
  dispositivo: string | null
}

export type EventoBitacora = {
  id: number
  at: string
  accion: string
  etiquetaAccion: string
  /** "Editó un usuario". */
  titulo: string
  /** "Cambió nombre y rol", "Invitado → Activo", "124 filas · Excel". */
  resumen: string | null
  tono: TonoEvento
  entidad: string
  nombreEntidad: string
  entidadId: string | null
  /** Ruta de la app que muestra la entidad, si existe. */
  ruta: string | null
  /** Texto del botón que lleva a esa ruta ("Ver usuario", "Ver el rol"). */
  textoRuta: string
  actor: ActorEvento
  origen: OrigenBitacora
  estadoAnterior: string | null
  estadoNuevo: string | null
  motivo: string | null
  sensible: boolean
  ubicacion: UbicacionEvento
  cambios: CambiosPresentados
  metadatos: ParMetadato[]
  /** Hay valores redactados (hash o enmascarados) en los cambios. */
  redactados: boolean
}

export type PaginaBitacora = {
  filas: EventoBitacora[]
  total: number
}

export type TramoLineaTiempo = {
  eventos: EventoBitacora[]
  /** `null` cuando ya no hay más eventos. */
  siguiente: CursorTiempo | null
}

export type OpcionActor = {
  id: string
  nombre: string
  color: string | null
  eventos: number
}

export type OpcionEntidad = {
  entidad: string
  nombre: string
  eventos: number
}

export type OpcionesFiltroBitacora = {
  actores: OpcionActor[]
  entidades: OpcionEntidad[]
}

export type IndicadorComparado = {
  valor: number
  anterior: number
}

export type ResumenBitacora = {
  eventos: IndicadorComparado
  configuracion: IndicadorComparado
  sensibles: IndicadorComparado
  actoresUnicos: number
  actorPrincipal: { nombre: string; eventos: number } | null
  /** Eventos por día del periodo (vacío si la muestra no cubre todo el periodo). */
  serieDiaria: number[]
  /** La muestra analizada cubre todos los eventos del periodo. */
  muestraCompleta: boolean
  comparacion: string
}

/** Resultado de una exportación: el archivo lo genera el navegador con estos datos. */
export type ArchivoExportado = {
  datos: DatosExportacion
  /** Registros que cumplían los filtros (el archivo trae como máximo el límite). */
  total: number
}
