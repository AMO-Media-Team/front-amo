/**
 * DTO de la solicitud de vinculación (MED-001): lo mínimo que piden el
 * formulario público y la cola interna. Nunca llevan la huella de la conexión
 * (`ip_hash`) ni datos de otros módulos.
 */
import type {
  DepartamentoActivo,
  MunicipioActivo,
} from "@/features/territorio/tipos"
import type { CredencialEntregada } from "@/features/usuarios/tipos"
import type { Database } from "@/types/database.types"

import type { PlataformaCuenta } from "./cuentas"

type Enums = Database["public"]["Enums"]

export type EstadoSolicitud = Enums["solicitud_vinculacion_estado"]
export type TipoMedioSolicitud = Enums["medio_tipo"]
export type EstadoMedioCoincidente = Enums["medio_estado"]

// ── Formulario público ──────────────────────────────────────────────────────

/** Territorio activo para elegir el municipio sin sesión. */
export interface TerritorioPublico {
  departamentos: DepartamentoActivo[]
  municipios: MunicipioActivo[]
}

/** Versión vigente de la política de tratamiento de datos (si el cliente ya la publicó). */
export interface PoliticaDatos {
  version: string
  vigenteDesde: string
  contenidoMd: string
}

export interface DatosFormularioPublico {
  territorio: TerritorioPublico
  politica: PoliticaDatos | null
  /** `medios.umbral_seguidores`: orienta, no bloquea la solicitud. */
  umbralSeguidores: number
}

// ── Cola interna ────────────────────────────────────────────────────────────

export interface CuentaDeclarada {
  plataforma: PlataformaCuenta
  usuario: string
  seguidores: number | null
}

/** Medio ya registrado con el mismo nombre (para no duplicarlo al invitar). */
export interface MedioCoincidente {
  id: string
  nombre: string
  estado: EstadoMedioCoincidente
  municipioCodigo: string
  municipio: string
  /** Mismo municipio y registrado después de llegar la solicitud: salió de ella. */
  desdeSolicitud: boolean
}

export interface ResolucionSolicitud {
  at: string
  /** Nombre de quien la atendió (`null` si su perfil no es visible). */
  por: string | null
  motivo: string | null
  medio: { id: string; nombre: string } | null
}

export interface SolicitudVinculacion {
  id: string
  estado: EstadoSolicitud
  nombreMedio: string
  tipo: TipoMedioSolicitud | null
  contactoNombre: string
  email: string
  celular: string | null
  municipioCodigo: string
  /** «Pasto, Nariño» (o el código si ya no está en el catálogo). */
  ubicacion: string
  cuentas: CuentaDeclarada[]
  mensaje: string | null
  recibidaAt: string
  resolucion: ResolucionSolicitud | null
  coincidencias: MedioCoincidente[]
}

/** Rol de medio que el actor puede asignar al invitar. */
export interface RolMedioAsignable {
  id: string
  nombre: string
}

/** Qué puede hacer quien atiende la cola (la BD lo vuelve a exigir). */
export interface CapacidadesCola {
  /** `usuarios.invitar` y algún rol de medio asignable. */
  invitar: boolean
  /** `medios.editar`: registrar un medio nuevo (sin él solo se vincula a uno existente). */
  registrarMedio: boolean
  /** Por qué no puede invitar (para explicarlo junto al botón). */
  motivoSinInvitar: string | null
}

export interface DatosColaSolicitudes {
  pendientes: SolicitudVinculacion[]
  atendidas: SolicitudVinculacion[]
  /** Pendientes en total (la lista muestra hasta `LIMITE_PENDIENTES`). */
  totalPendientes: number
  capacidades: CapacidadesCola
  roles: RolMedioAsignable[]
  smtpConfigurado: boolean
  umbralSeguidores: number
  /** Enlace público del formulario, para compartirlo con un medio. */
  urlFormulario: string
}

/** Resultado de «Invitar»: la credencial se muestra UNA vez. */
export interface SolicitudInvitada {
  medio: { id: string; nombre: string }
  email: string
  credencial: CredencialEntregada
  /** La invitación se creó, pero algo secundario quedó pendiente. */
  advertencia: string | null
}
