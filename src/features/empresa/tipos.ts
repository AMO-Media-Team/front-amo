/**
 * Contratos de «Mi empresa» (ANU-001, ANU-002): lo que el servidor lee de la
 * empresa de la sesión y entrega a la interfaz. Ninguno lleva rutas de
 * Storage ni datos de otras empresas.
 */
import type { DatosDocumentosAnunciante } from "@/features/documentos-anunciante/tipos"
import type {
  CatalogosAnunciante,
  OpcionSector,
} from "@/features/gestion-anunciantes/tipos"
import type { EstadoPerfil } from "@/features/usuarios/tipos"
import type { Database } from "@/types/database.types"

export type EstadoAnunciante = Database["public"]["Enums"]["anunciante_estado"]

/** Lo de `anunciantes.datos_facturacion` que gestiona la empresa. */
export interface FacturacionEmpresa {
  email: string | null
  /** `RESPONSABLE_IVA`, `NO_RESPONSABLE_IVA`… (o lo que haya guardado). */
  regimen: string | null
  granContribuyente: boolean
  autorretenedor: boolean
}

export interface EmpresaPropia {
  id: string
  razonSocial: string
  nombreComercial: string
  /** El sector actual aunque ya no esté activo (así el selector lo muestra). */
  sector: OpcionSector
  paisIso2: string
  nit: string | null
  digitoVerificacion: string | null
  municipioCodigo: string | null
  identificacionExtranjera: string | null
  ciudadExtranjera: string | null
  facturacion: FacturacionEmpresa
  estado: EstadoAnunciante
  /** Motivo del rechazo o de la suspensión. */
  motivoEstado: string | null
  enviadoVerificacionAt: string | null
  verificadoAt: string | null
  /** `updated_at`: bloqueo optimista de la edición. */
  actualizadoAt: string
  /** URL firmada y de corta duración del logo; `null` sin logo. */
  logoUrl: string | null
  tieneLogo: boolean
}

/** `anunciantes_privado`: la persona a quien AMO contacta. */
export interface ContactoEmpresa {
  nombre: string | null
  email: string | null
  celular: string | null
  direccion: string | null
  /** `updated_at` de la fila; `null` mientras no exista. */
  actualizadoAt: string | null
}

/** Todo lo que necesita la página «Mi empresa». */
export interface DatosMiEmpresa {
  empresa: EmpresaPropia
  contacto: ContactoEmpresa
  /** `null` si no se pudieron leer los sectores (el formulario ofrece reintentar). */
  catalogos: CatalogosAnunciante | null
  /** Para el avance de la verificación (lo exigido y su situación). */
  documentos: DatosDocumentosAnunciante
}

/** Compañero de la empresa (`miembros_organizacion()`). */
export interface MiembroEquipo {
  id: string
  nombre: string | null
  email: string
  /** Clave del rol (`ANUNCIANTE`…); la empresa solo ve el nombre del suyo. */
  rolClave: string | null
  estado: EstadoPerfil
  ultimoAccesoAt: string | null
}
