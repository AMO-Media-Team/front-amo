/**
 * Tipos de dominio de la operación que las consultas entregan a la interfaz.
 * Son DTO planos (serializables en RSC): solo lo que cada vista muestra,
 * nunca columnas sensibles (rutas de documentos, datos `_privado`).
 */
import type {
  IndicadoresAsignaciones,
  PuntoMensual,
  ResumenCartera,
  ResumenCupos,
  VigenciaVerificacion,
} from "./calculos"
import type {
  Corte,
  EstadoAnunciante,
  EstadoAsignacion,
  EstadoCampana,
  EstadoDisputa,
  EstadoDocumento,
  EstadoFactura,
  EstadoLiquidacion,
  EstadoMedio,
  EstadoOferta,
  EstadoValidacion,
  GrupoAsignacion,
  Plataforma,
  TipoMedio,
} from "./estados"
import type { EventoLineaTiempo, Progreso } from "./linea-tiempo"
import type { CorteMetrica } from "./metricas"

export interface PaginaFilas<T> {
  filas: T[]
  total: number
}

export interface OpcionCatalogo {
  id: string
  nombre: string
}

// ── Medios ───────────────────────────────────────────────────────────────────

export interface CuentaCompacta {
  id: string
  plataforma: Plataforma
  handle: string
  seguidores: number | null
  /** Clave de la franja (F1, F2…). */
  franja: string | null
  verificada: boolean
}

export type MedioFila = {
  id: string
  nombre: string
  tipo: TipoMedio
  estado: EstadoMedio
  nivel: number
  municipio: string | null
  departamento: string | null
  cuentas: CuentaCompacta[]
  tasaCumplimiento: number | null
  nCumplimiento: number
  calificacion: number | null
  /** GMV verificado histórico; `null` si quien consulta no ve asignaciones. */
  gmvVerificado: number | null
  creadoAt: string
}

export interface ResumenMedios {
  total: number
  verificados: number
  porNivel: readonly [number, number, number]
  pendientes: number
  suspendidos: number
  rechazados: number
  cuentasVerificadas: number
  /** Cumplimiento ponderado por n (Σ tasa·n / Σ n) de los medios con historial. */
  cumplimiento: { valor: number | null; n: number }
}

export interface MedioDetalle {
  id: string
  nombre: string
  tipo: TipoMedio
  estado: EstadoMedio
  nivel: number
  nivelNombre: string | null
  municipioCodigo: string
  municipio: string | null
  departamentoCodigo: string | null
  departamento: string | null
  lon: number | null
  lat: number | null
  descripcionAudiencia: string | null
  motivoEstado: string | null
  verificadoAt: string | null
  verificadoPor: string | null
  suspendidoAt: string | null
  rechazadoAt: string | null
  creadoAt: string
  actualizadoAt: string
  esDemo: boolean
  tasaCumplimiento: number | null
  nCumplimiento: number
  calificacion: number | null
  publicacionesVerificadas: number
}

export interface VerificacionCuenta {
  id: string
  metodo: string
  estado: EstadoValidacion
  seguidoresReportados: number
  seguidoresVerificados: number | null
  observaciones: string | null
  creadaAt: string
  validadaAt: string | null
}

export interface CuentaSocialDetalle {
  id: string
  plataforma: Plataforma
  handle: string
  url: string
  seguidores: number | null
  franja: { clave: string; nombre: string } | null
  verificada: boolean
  metodo: string | null
  ultimaVerificacionAt: string | null
  vigencia: VigenciaVerificacion
  venceAt: string | null
  elegibleHasta: string | null
  multiplicador: number
  multiplicadorProximo: number | null
  multiplicadorProximoDesde: string | null
  multiplicadorCalculadoAt: string | null
  alcanceMediano: number | null
  indiceCalidad: number | null
  publicacionesVerificadas: number
  tarifaReferencia: number | null
  /** Historial de verificaciones; `null` sin `medios.verificar`. */
  verificaciones: VerificacionCuenta[] | null
}

export interface AudienciaPais {
  iso2: string
  nombre: string
  porcentaje: number
  fuente: string
}

export interface PertinenciaGeografica {
  municipioCodigo: string
  municipio: string
  departamentoCodigo: string
  multiplicador: number
  notas: string | null
}

export interface DocumentoMetadatos {
  id: string
  tipo: string
  estado: EstadoDocumento
  venceAt: string | null
  validadoAt: string | null
  subidoAt: string
  observaciones: string | null
}

export interface TopeAnual {
  nivel: number
  nombre: string
  /** `null` = sin tope (nivel 3). */
  tope: number | null
  consumido: number
  /** Fracción del tope que dispara la alerta y la que bloquea nuevas aceptaciones. */
  alerta: number
  bloqueo: number
}

/** Asignación en las listas de las fichas (medio, anunciante, campaña). */
export interface AsignacionResumen {
  id: string
  estado: EstadoAsignacion
  plataforma: Plataforma
  franja: string | null
  montoBruto: number | null
  creadaAt: string
  aceptadaAt: string | null
  fechaLimite: string | null
  oferta: string | null
  campana: string | null
  medio: string | null
  anunciante: string | null
}

export interface ActividadAsignaciones {
  indicadores: IndicadoresAsignaciones
  serie: PuntoMensual[]
  recientes: AsignacionResumen[]
}

// ── Anunciantes ──────────────────────────────────────────────────────────────

export type AnuncianteFila = {
  id: string
  nombreComercial: string
  razonSocial: string
  /** NIT con su dígito o identificación extranjera, completos (dato público). */
  identificacion: string | null
  sector: string | null
  paisIso2: string
  pais: string
  ciudad: string | null
  estado: EstadoAnunciante
  campanas: number
  campanasActivas: number
  /** Σ presupuesto comprometido de sus campañas (negocios vigentes). */
  inversion: number
  /** Saldo por cobrar; `null` sin permiso de facturas. */
  cartera: number | null
  /** Facturas con saldo ya vencidas; `null` sin `facturas.ver`. */
  facturasVencidas: number | null
  creadoAt: string
}

export interface ResumenAnunciantes {
  total: number
  verificados: number
  pendientes: number
  suspendidos: number
  rechazados: number
  internacionales: number
  paises: number
}

export interface AnuncianteDetalle {
  id: string
  nombreComercial: string
  razonSocial: string
  identificacion: string | null
  tipoIdentificacion: "NIT" | "Identificación tributaria"
  sector: string | null
  paisIso2: string
  pais: string
  ciudad: string | null
  departamento: string | null
  estado: EstadoAnunciante
  motivoEstado: string | null
  verificadoAt: string | null
  verificadoPor: string | null
  suspendidoAt: string | null
  rechazadoAt: string | null
  creadoAt: string
  esDemo: boolean
  logoUrl: string | null
  facturacion: {
    email: string | null
    regimen: string | null
    granContribuyente: boolean | null
    autorretenedor: boolean | null
  }
}

export interface DesempenoCampana {
  campanaId: string
  gmvComprometido: number
  gmvVerificado: number
  alcance: number
  impresiones: number
  interacciones: number
  clics: number
  cpmEfectivo: number | null
  costoPorInteraccion: number | null
  engagement: number | null
  tasaCumplimiento: number | null
  tasaLlenado: number | null
  nVerificadas: number
}

export interface FacturaResumen {
  id: string
  numero: string | null
  estado: EstadoFactura
  fechaEmision: string | null
  fechaVencimiento: string | null
  total: number | null
  pagado: number
  saldo: number | null
  campana: string | null
}

export interface CarteraAnunciante {
  resumen: ResumenCartera
  facturas: FacturaResumen[]
}

// ── Campañas y ofertas ───────────────────────────────────────────────────────

export type CampanaFila = {
  id: string
  nombre: string
  marca: string
  anuncianteId: string
  anunciante: string | null
  estado: EstadoCampana
  fechaInicio: string
  fechaFin: string
  presupuestoTotal: number
  presupuestoComprometido: number
  ofertas: number
  plataformas: Plataforma[]
  cuposTotales: number
  cuposOcupados: number
  creadaAt: string
}

export interface ResumenCampanas {
  total: number
  activas: number
  borradores: number
  finalizadas: number
  canceladas: number
  presupuestoActivas: number
  comprometidoActivas: number
}

export interface CampanaDetalle {
  id: string
  nombre: string
  marca: string
  objetivo: string | null
  anuncianteId: string
  anunciante: string | null
  estado: EstadoCampana
  fechaInicio: string
  fechaFin: string
  presupuestoTotal: number
  presupuestoComprometido: number
  activadaAt: string | null
  finalizadaAt: string | null
  canceladaAt: string | null
  creadaAt: string
  esDemo: boolean
}

export interface Segmentacion {
  departamentos: { codigo: string; nombre: string }[]
  municipios: { codigo: string; nombre: string; departamento: string }[]
  categorias: string[]
  seguidoresMinimos: number | null
  mediosExcluidos: number
  exclusividadDias: number | null
}

export interface OfertaDetalle {
  id: string
  titulo: string
  estado: EstadoOferta
  plataforma: Plataforma
  formato: string | null
  publicacionesPorMedio: number
  permiteMultiplesCupos: boolean
  presupuestoMaximo: number
  presupuestoComprometido: number
  topePorMedio: number
  ventanaInicio: string
  ventanaFin: string
  fechaLimiteAceptacion: string
  permanenciaDias: number
  cortes: Corte[]
  instrucciones: string | null
  restricciones: string | null
  comentarioModeracion: string | null
  publicadaAt: string | null
  llenaAt: string | null
  cupos: ResumenCupos
  segmentacion: Segmentacion
}

// ── Asignaciones ─────────────────────────────────────────────────────────────

export type AsignacionFila = {
  id: string
  estado: EstadoAsignacion
  estadoPrevioDisputa: EstadoAsignacion | null
  plataforma: Plataforma
  formato: string | null
  franja: string | null
  medioId: string
  medio: string | null
  ofertaId: string
  oferta: string | null
  campanaId: string
  campana: string | null
  anunciante: string | null
  montoBruto: number | null
  creadaAt: string
  aceptadaAt: string | null
  fechaLimite: string | null
}

export interface ResumenAsignaciones {
  total: number
  porGrupo: Readonly<Record<GrupoAsignacion, number>>
}

export interface PrecioCongelado {
  franja: string | null
  seguidoresAlAceptar: number | null
  tarifaBase: number | null
  publicaciones: number | null
  multiplicadorCalidad: number | null
  multiplicadorGeografico: number | null
  multiplicadorExclusividad: number | null
  montoBruto: number | null
  /** Montos internos (`asignacion_montos`); `null` si no son visibles para el rol. */
  montos: {
    porcentajeComision: number
    origenComision: string
    montoComision: number
    montoMedio: number
    retenciones: number | null
    montoNeto: number | null
  } | null
}

export interface PublicacionEvidencia {
  id: string
  numero: number
  url: string
  fechaPublicacion: string
  permanenciaHasta: string
  permanenciaVerificadaAt: string | null
  etiquetaConfirmada: boolean
  etiquetaVerificada: boolean
  estado: EstadoValidacion
  validadaAt: string | null
  observaciones: string | null
  retiradaDetectadaAt: string | null
  /** Hay imagen que firmar (la ruta no viaja al navegador). */
  conImagen: boolean
  cortes: CorteMetrica[]
}

export interface DisputaResumen {
  id: string
  estado: EstadoDisputa
  motivo: string
  parte: string
  descripcion: string
  resolucion: string | null
  creadaAt: string
  resueltaAt: string | null
}

export interface LiquidacionResumen {
  id: string
  estado: EstadoLiquidacion
  periodoInicio: string
  periodoFin: string
  fechaPago: string | null
}

export interface AsignacionDetalle {
  id: string
  estado: EstadoAsignacion
  estadoPrevioDisputa: EstadoAsignacion | null
  plataforma: Plataforma
  formato: string | null
  slot: number
  causaCancelacion: string | null
  motivo: string | null
  creadaAt: string
  /** `null` = el medio rechazó la oferta en el marketplace: nunca tuvo cupo ni precio. */
  aceptadaAt: string | null
  fechaLimite: string | null
  ventanaInicio: string | null
  ventanaFin: string | null
  medio: { id: string; nombre: string | null }
  cuenta: { plataforma: Plataforma; handle: string; url: string } | null
  oferta: { id: string; titulo: string | null }
  campana: { id: string; nombre: string | null; marca: string | null }
  anunciante: { id: string; nombre: string | null }
  descargas: number
  ultimaDescargaAt: string | null
  precio: PrecioCongelado
  progreso: Progreso
  eventos: EventoLineaTiempo[]
  /** La línea de tiempo incluye la bitácora (actor y motivo). */
  conBitacora: boolean
  publicaciones: PublicacionEvidencia[]
  /** Cortes que el anunciante exigió en la oferta. */
  cortesRequeridos: Corte[]
  disputas: DisputaResumen[]
  liquidacion: LiquidacionResumen | null
}
