/**
 * DTO de la página de configuración. Las consultas (servidor) convierten las
 * filas de la BD a estas formas en camelCase; nada más sale al cliente.
 */
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type TipoParametro = Enums["config_tipo"]
export type Plataforma = Enums["plataforma"]
export type DocumentoMedio = Enums["documento_medio_tipo"]
export type TipoRetencion = Enums["retencion_tipo"]
export type TipoDocumentoElectronico = Enums["documento_electronico_tipo"]
export type CanalNotificacion = Enums["notificacion_canal"]
export type TipoTerminos = Enums["terminos_tipo"]

/** Valor ya interpretado según el tipo del parámetro (`fn_validar_configuracion`). */
export type ValorParametro =
  number | boolean | string | string[] | Record<string, number>

/** Reglas de validación de un parámetro, tal como las guarda la BD. */
export interface ReglasParametro {
  clave: string
  tipo: TipoParametro
  minimo: number | null
  maximo: number | null
  opciones: string[] | null
}

export interface Parametro extends ReglasParametro {
  /** `null` si el JSON guardado no corresponde a su tipo (se muestra como inválido). */
  valor: ValorParametro | null
  modulo: string
  descripcion: string
  unidad: string | null
  esPublica: boolean
  pendienteValidacion: boolean
  actualizadoAt: string
}

/** Qué puede cambiar quien mira la página (la BD vuelve a exigirlo todo). */
export interface PermisosConfiguracion {
  editar: boolean
  comisiones: boolean
  tarifas: boolean
  tributario: boolean
  catalogos: boolean
  verAuditoria: boolean
  /** `datos_sensibles.ver`: ve y busca identificaciones completas (NIT). */
  datosSensibles: boolean
}

// ── Precios ─────────────────────────────────────────────────────────────────

export interface Franja {
  id: string
  clave: string
  nombre: string
  seguidoresMin: number
  seguidoresMax: number | null
  orden: number
  activa: boolean
  actualizadoAt: string
}

export interface RequisitosFormato {
  relacionesAspecto: string[]
  mime: string[]
  duracionMaxS: number | null
  pesoMaxMb: number | null
  maxArchivos: number | null
}

export interface Formato {
  id: string
  plataforma: Plataforma
  clave: string
  nombre: string
  requisitos: RequisitosFormato
  activo: boolean
  orden: number
  actualizadoAt: string
}

export interface Tarifa {
  id: string
  formatoId: string
  plataforma: Plataforma
  franjaId: string
  valorBase: number
  vigenteDesde: string
  vigenteHasta: string | null
  pendienteValidacion: boolean
  creadaAt: string
  /** Nombre o correo de quien la programó, si la RLS deja verlo. */
  creadaPor: string | null
}

export interface DatosPrecios {
  franjas: Franja[]
  formatos: Formato[]
  tarifas: Tarifa[]
}

// ── Comercial ───────────────────────────────────────────────────────────────

export type ObjetivoComision =
  | { tipo: "anunciante"; id: string; nombre: string; detalle: string | null }
  | { tipo: "campana"; id: string; nombre: string; detalle: string | null }

export interface ExcepcionComision {
  id: string
  objetivo: ObjetivoComision
  porcentaje: number
  vigenteDesde: string
  vigenteHasta: string | null
  motivo: string
  creadaAt: string
  actualizadoAt: string
}

// ── Medios ──────────────────────────────────────────────────────────────────

export interface NivelVerificacion {
  nivel: number
  nombre: string
  requisitos: string[]
  documentosRequeridos: DocumentoMedio[]
  topeAnual: number | null
  porcentajeAlerta: number
  porcentajeBloqueo: number
  pendienteValidacion: boolean
  actualizadoAt: string
}

// ── Tributario ──────────────────────────────────────────────────────────────

export interface ParametrosAnio {
  anio: number
  uvt: number
  smlmv: number
  umbralSegSocialSmlmv: number | null
  pendienteValidacion: boolean
  actualizadoAt: string
}

export interface Retencion {
  id: string
  tipo: TipoRetencion
  concepto: string
  aplicaDeclarante: boolean
  tarifa: number
  baseMinimaUvt: number
  vigenteDesde: string
  vigenteHasta: string | null
  pendienteValidacion: boolean
  actualizadoAt: string
}

export interface ReteicaMunicipal {
  id: string
  municipioCodigo: string
  municipioNombre: string
  departamentoNombre: string | null
  tarifaPorMil: number
  baseMinimaUvt: number
  vigenteDesde: string
  vigenteHasta: string | null
  pendienteValidacion: boolean
  actualizadoAt: string
}

export interface ResolucionDian {
  id: string
  tipo: TipoDocumentoElectronico
  prefijo: string
  numeroResolucion: string
  fechaResolucion: string
  rangoDesde: number
  rangoHasta: number
  consecutivoActual: number
  vigenteDesde: string
  vigenteHasta: string | null
  activa: boolean
  actualizadoAt: string
}

export interface DatosTributario {
  anios: ParametrosAnio[]
  retenciones: Retencion[]
  reteica: ReteicaMunicipal[]
  resoluciones: ResolucionDian[]
}

// ── Catálogos ───────────────────────────────────────────────────────────────

export type NombreCatalogo = "sectores" | "categorias"

export interface ElementoCatalogo {
  id: string
  nombre: string
  descripcion: string | null
  orden: number
  activo: boolean
  archivado: boolean
  actualizadoAt: string
}

export interface DepartamentoTerritorio {
  codigo: string
  nombre: string
  region: string
  activo: boolean
  municipios: number
  municipiosInactivos: number
}

export interface MunicipioTerritorio {
  codigo: string
  nombre: string
  tipo: string
  esCapital: boolean
  activo: boolean
}

export interface DatosCatalogos {
  sectores: ElementoCatalogo[]
  categorias: ElementoCatalogo[]
  departamentos: DepartamentoTerritorio[]
}

// ── Legal y plantillas ──────────────────────────────────────────────────────

export interface VersionTerminos {
  id: string
  tipo: TipoTerminos
  version: string
  contenido: string
  hash: string | null
  publicada: boolean
  vigenteDesde: string | null
  creadaAt: string
  actualizadoAt: string
  /** `null` si quien mira no puede contar aceptaciones (`usuarios.ver`). */
  aceptaciones: number | null
}

export interface Plantilla {
  clave: string
  canal: CanalNotificacion
  nombre: string
  asunto: string | null
  cuerpo: string
  variables: string[]
  activa: boolean
  actualizadoAt: string
}

// ── Historial ───────────────────────────────────────────────────────────────

export interface EventoHistorial {
  id: number
  at: string
  accion: string
  actor: string | null
  origen: Database["public"]["Enums"]["bitacora_origen"]
  cambios: Database["public"]["Tables"]["bitacora"]["Row"]["cambios"]
}
