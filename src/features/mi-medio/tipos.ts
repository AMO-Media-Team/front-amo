/**
 * DTO de «Mi medio»: solo lo que la interfaz necesita. De `medios_privado`
 * llegan los resúmenes enmascarados (`•••• 1234`), nunca los valores cifrados
 * ni las huellas.
 */
import type { OpcionCategoria } from "@/features/gestion-medios/tipos"
import type { TipoMedio } from "@/features/operacion/estados"

import type { AudienciaFija, PagoGuardado } from "./schemas"
import type {
  DocumentoRegistrado,
  EstadoMedio,
  MetodoPago,
  TipoDocumentoMedio,
} from "./requisitos"
import type { TipoDocumentoIdentidad } from "./datos-pago"

export type { OpcionCategoria }

/** Ficha propia (`medios`, RLS «select interno o propio»). */
export type MedioPropio = {
  id: string
  nombre: string
  tipo: TipoMedio
  municipioCodigo: string
  descripcionAudiencia: string | null
  estado: EstadoMedio
  nivel: number
  enviadoVerificacionAt: string | null
  motivoEstado: string | null
  verificadoAt: string | null
  actualizadoAt: string
}

/** Fila de `niveles_verificacion`. */
export type NivelVerificacion = {
  nivel: number
  nombre: string
  requisitos: string[]
  documentosRequeridos: TipoDocumentoMedio[]
  /** `null`: sin tope (persona jurídica). */
  topeAnual: number | null
  porcentajeAlerta: number
  porcentajeBloqueo: number
}

/** Resumen de los datos de pago y tributarios (sin números completos). */
export type PagoResumen = {
  titularNombre: string | null
  tipoDocumento: TipoDocumentoIdentidad | null
  /** `•••• 1234`. */
  numeroDocumentoResumen: string | null
  metodoPago: MetodoPago | null
  /** `Bancolombia •••• 1234`. */
  cuentaResumen: string | null
  esDeclarante: boolean
  obligadoFacturar: boolean
  responsableIva: boolean
  /** Hay número cifrado (no solo resumen). */
  documentoRegistrado: boolean
  /** Hay cuenta cifrada completa. */
  cuentaRegistrada: boolean
  actualizadoAt: string | null
}

export type CuentaSocialAlta = {
  id: string
  verificada: boolean
  /** Tiene una verificación esperando la revisión de AMO. */
  enRevision: boolean
  /** Su última verificación fue rechazada. */
  rechazada: boolean
}

/** Todo lo que necesitan el resumen de «Mi medio» y el inicio del medio. */
export type ResumenMiMedio = {
  medio: MedioPropio
  categorias: number
  paisesAudiencia: number
  documentos: DocumentoRegistrado[]
  niveles: NivelVerificacion[]
  pago: PagoResumen
  cuentas: CuentaSocialAlta[]
  terminosPendientes: number
  /** 'YYYY-MM-DD' en Bogotá (vigencias de documentos). */
  hoy: string
}

/** Fila de audiencia para el formulario del perfil. */
export type FilaAudienciaPerfil = {
  paisIso2: string
  porcentaje: number
}

export type OpcionPais = { codigo: string; nombre: string }

/** Valores y opciones del formulario del perfil. */
export type PerfilEditable = {
  medio: MedioPropio
  categoriaIds: string[]
  categorias: OpcionCategoria[]
  /** Declaradas por el medio (editables). */
  audiencia: FilaAudienciaPerfil[]
  /** Verificadas por AMO (solo lectura, cuentan en la suma). */
  audienciaVerificada: (FilaAudienciaPerfil & { nombre: string })[]
  audienciaFija: AudienciaFija
  paises: OpcionPais[]
}

/** Valores del formulario de pago y lo que ya está guardado. */
export type PagoEditable = {
  resumen: PagoResumen
  guardado: PagoGuardado
  /** Hay una verificación aprobada: un cambio de cuenta avisa al equipo AMO. */
  verificado: boolean
}
