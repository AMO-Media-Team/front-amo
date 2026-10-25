/**
 * Tipos de los derechos del titular de datos (CTA-007): las solicitudes vistas
 * por el titular y por el equipo, sus autorizaciones y el plan de la
 * supresión. Los enums salen de la BD (`solicitudes_titular`).
 */
import type { TipoTerminos } from "@/lib/auth/compuertas"
import { Constants, type Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type TipoSolicitud = Enums["solicitud_titular_tipo"]
export type EstadoSolicitud = Enums["solicitud_titular_estado"]
export type DecisionSolicitud = Enums["solicitud_titular_decision"]
export type RolTitular = Enums["rol_tipo"]

export const TIPOS_SOLICITUD = Constants.public.Enums.solicitud_titular_tipo
export const ESTADOS_SOLICITUD = Constants.public.Enums.solicitud_titular_estado
export const DECISIONES_SOLICITUD =
  Constants.public.Enums.solicitud_titular_decision

/** Los que admite `solicitudes_titular_datos_chk`, en el orden en que se muestran. */
export const DATOS_AFECTADOS = [
  "IDENTIFICACION",
  "CONTACTO",
  "PAGO",
  "DOCUMENTOS",
  "CUENTAS_SOCIALES",
  "ACCESOS",
  "ACTIVIDAD",
  "AUTORIZACIONES",
  "OTROS",
] as const

export type DatoAfectado = (typeof DATOS_AFECTADOS)[number]

/** Lo común de una solicitud, con las fechas tal como llegan de la BD. */
export interface SolicitudBase {
  id: string
  numero: number
  tipo: TipoSolicitud
  estado: EstadoSolicitud
  descripcion: string
  datosAfectados: DatoAfectado[]
  recibidaAt: string
  /** Día ('YYYY-MM-DD') en que vence el plazo legal. */
  plazoVence: string
  /** Día desde el que el equipo la ve «por vencer». */
  alertaDesde: string
  enTramiteAt: string | null
  requerimiento: string | null
  requeridaAt: string | null
  informacionAportada: string | null
  informacionAt: string | null
  prorrogaMotivo: string | null
  prorrogadaAt: string | null
  decision: DecisionSolicitud | null
  respuesta: string | null
  respondidaAt: string | null
  /** Hay un PDF de soporte de la respuesta (la ruta se queda en el servidor). */
  tieneSoporte: boolean
  desistidaAt: string | null
  supresionEjecutadaAt: string | null
}

/** La solicitud que ve su titular en Cuenta → Privacidad. */
export type SolicitudPropia = SolicitudBase

/** Una fila de la bandeja del equipo. */
export interface SolicitudFila {
  id: string
  numero: number
  tipo: TipoSolicitud
  estado: EstadoSolicitud
  rolTipo: RolTitular
  recibidaAt: string
  plazoVence: string
  alertaDesde: string
  prorrogada: boolean
  /** `null` tras la supresión o si el rol no ve el perfil. */
  titular: string | null
  correo: string | null
  /** Medio o empresa del titular, si la tiene. */
  organizacion: string | null
}

export interface PaginaSolicitudes {
  filas: SolicitudFila[]
  total: number
}

/** Hito de la línea de tiempo de la ficha. */
export interface EventoSolicitud {
  id: string
  at: string
  tipo:
    | "radicada"
    | "tramite"
    | "requerida"
    | "aportada"
    | "prorrogada"
    | "respondida"
    | "desistida"
    | "supresion"
  titulo: string
  detalle: string | null
  /** «Titular», «Sistema» o «Equipo AMO · c***@amo.test». */
  actor: string | null
}

export interface LineaTiempoSolicitud {
  eventos: EventoSolicitud[]
  /** Sin acceso a la bitácora: solo los hitos guardados en la solicitud. */
  soloHitos: boolean
}

export interface TitularSolicitud {
  perfilId: string | null
  nombre: string | null
  correo: string | null
  rol: string | null
  rolTipo: RolTitular
  medio: { id: string; nombre: string } | null
  anunciante: { id: string; nombre: string } | null
}

/** La solicitud en la ficha del equipo. */
export interface SolicitudInterna extends SolicitudBase {
  titular: TitularSolicitud
  tramitadaPor: string | null
  respondidaPor: string | null
  supresionResultado: ResultadoSupresion | null
  lineaTiempo: LineaTiempoSolicitud
}

/** Una autorización aceptada por el titular, con el texto de esa versión. */
export interface AutorizacionPropia {
  id: number
  tipo: TipoTerminos
  version: string
  aceptadaAt: string
  /** IP enmascarada (`190.24.x.x`); `null` si no quedó registrada. */
  ip: string | null
  textoMd: string | null
}

export type AccionMedio = "BORRAR" | "ANONIMIZAR" | "CONSERVAR" | "NINGUNA"
export type AccionContacto = "BORRAR" | "NINGUNO"

export type ArchivoSupresion =
  { bucket: string; prefijo: string } | { bucket: string; ruta: string }

/** Lo que devuelve `suprimir_titular_srv` (simulación o ejecución). */
export interface ResultadoSupresion {
  solicitud: number
  bloqueos: string[]
  cuenta: "BORRAR"
  medio: AccionMedio
  /** El medio sobre el que decidió la BD (el del perfil al ejecutar); `null` si no tiene. */
  medioId: string | null
  contactoEmpresa: AccionContacto
  /** Solicitudes de vinculación (formulario público) con su correo o de su medio que se borran. */
  solicitudesVinculacion: number
  /** Lo que la supresión borra de Storage (carpetas o archivos). */
  archivos: ArchivoSupresion[]
  /**
   * Tras ejecutarla: lo que sigue en Storage (vacío, todo borrado). `null` en
   * la simulación o si no quedó registro.
   */
  archivosPendientes: ArchivoSupresion[] | null
  /** Última vez que el servidor revisó Storage (al ejecutar o al reintentar). */
  archivosRevisadosAt: string | null
  seConserva: string[]
  simulacion: boolean
}

/** Lo que pasó en Storage al borrar (al ejecutar o al reintentar). */
export interface BorradoArchivos {
  archivosBorrados: number
  /** Carpetas o archivos que siguen en Storage: se ofrece reintentar. */
  archivosPendientes: number
  /** La BD pidió algo que no es del titular o con otra forma: no se tocó. */
  archivosRechazados: number
}

/** Resultado de ejecutar la supresión, con lo que pasó en Storage. */
export interface SupresionEjecutada extends BorradoArchivos {
  resultado: ResultadoSupresion
}
