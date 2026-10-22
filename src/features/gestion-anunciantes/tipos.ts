/**
 * DTO del registro y la edición de anunciantes por el equipo AMO: lo mínimo
 * que la interfaz necesita. Ninguno lleva datos de `anunciantes_privado`.
 */
import type { EstadoPerfil } from "@/features/usuarios/tipos"

export interface OpcionSector {
  id: string
  nombre: string
}

export interface OpcionPais {
  /** ISO 3166-1 alfa-2 en mayúsculas (FK `anunciantes.pais_iso2`). */
  iso2: string
  nombre: string
}

/** Sectores activos y países para el formulario; `sectores` vacío si no se pudieron leer. */
export interface CatalogosAnunciante {
  sectores: OpcionSector[]
  paises: OpcionPais[]
}

/** Datos editables tal como están en la BD (hoja «Editar datos»). */
export interface AnuncianteEditable {
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
  emailFacturacion: string | null
  /** `updated_at`: bloqueo optimista de la edición. */
  actualizadoAt: string
}

/** Resultado de `registrarAnunciante`: a dónde navegar y qué anunciar. */
export interface AnuncianteRegistrado {
  id: string
  nombreComercial: string
}

/** Persona vinculada al anunciante (pestaña «Usuarios» de la ficha). */
export interface UsuarioVinculado {
  id: string
  nombre: string | null
  email: string
  estado: EstadoPerfil
  rol: { nombre: string; color: string } | null
  ultimoAccesoAt: string | null
  creadoAt: string
}
