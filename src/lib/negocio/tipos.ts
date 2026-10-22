/**
 * Tipos de la máquina de estados (`private.transiciones_estado`, §4.1–4.2 de
 * docs/modelo-datos.md). Cada entidad se ata al enum de su columna de estado
 * para que `transiciones.generated.ts` no compile si la BD y los tipos
 * generados se desalinean.
 */
import type { ClavePermiso } from "@/lib/auth/permisos"
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

/** Entidad → enum de su columna de estado (`estado`, `estado_verificacion` o `estado_validacion`). */
export interface EstadosPorEntidad {
  perfiles: Enums["perfil_estado"]
  anunciantes: Enums["anunciante_estado"]
  medios: Enums["medio_estado"]
  documentos_medio: Enums["documento_estado"]
  documentos_anunciante: Enums["documento_estado"]
  verificaciones_cuenta: Enums["validacion_estado"]
  campanas: Enums["campana_estado"]
  ofertas: Enums["oferta_estado"]
  asignaciones: Enums["asignacion_estado"]
  publicaciones: Enums["validacion_estado"]
  metricas: Enums["validacion_estado"]
  liquidaciones: Enums["liquidacion_estado"]
  documentos_soporte: Enums["documento_soporte_estado"]
  facturas: Enums["factura_estado"]
  disputas: Enums["disputa_estado"]
}

export type EntidadTransicion = keyof EstadosPorEntidad

/** `NUEVO` es el origen de las transiciones de creación. */
export const ESTADO_CREACION = "NUEVO"

export type EstadoDe<E extends EntidadTransicion> = EstadosPorEntidad[E]

export type OrigenDe<E extends EntidadTransicion> =
  EstadoDe<E> | typeof ESTADO_CREACION

/** Quién ejecuta la transición: el tipo de rol del usuario o el sistema (cron, triggers). */
export type ActorTransicion = Enums["transicion_actor"]

export type TipoActor = Exclude<ActorTransicion, "SISTEMA">

interface TransicionComun {
  /** Permiso que exige; `null` solo en las del SISTEMA. */
  permiso: ClavePermiso | null
  requiereMotivo: boolean
  descripcion: string
}

export interface TransicionDe<
  E extends EntidadTransicion,
> extends TransicionComun {
  entidad: E
  desde: OrigenDe<E>
  hacia: EstadoDe<E>
  actor: ActorTransicion
}

/** Una fila de `private.transiciones_estado`, tipada según su entidad. */
export type TransicionEstado = {
  [E in EntidadTransicion]: TransicionDe<E>
}[EntidadTransicion]
