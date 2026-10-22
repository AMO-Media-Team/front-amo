/**
 * Datos de prueba de «Mi medio» (solo los usan las pruebas): un medio en alta
 * con los niveles que siembra la migración, y constructores para variarlo.
 */
import type { DocumentoRegistrado } from "./requisitos"
import type {
  MedioPropio,
  NivelVerificacion,
  PagoResumen,
  ResumenMiMedio,
} from "./tipos"

export const HOY_FIJO = "2026-10-22"

export const NIVELES_FIJOS: NivelVerificacion[] = [
  {
    nivel: 1,
    nombre: "Persona natural informal",
    requisitos: [],
    documentosRequeridos: ["CEDULA_FRENTE", "CEDULA_REVERSO", "PRUEBA_VIDA"],
    topeAnual: 30_000_000,
    porcentajeAlerta: 0.8,
    porcentajeBloqueo: 0.95,
  },
  {
    nivel: 2,
    nombre: "Persona natural con RUT",
    requisitos: [],
    documentosRequeridos: [
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "RUT",
    ],
    topeAnual: 120_000_000,
    porcentajeAlerta: 0.8,
    porcentajeBloqueo: 0.95,
  },
  {
    nivel: 3,
    nombre: "Persona jurídica",
    requisitos: [],
    documentosRequeridos: [
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "RUT",
      "CAMARA_COMERCIO",
      "RUT_SOCIEDAD",
    ],
    topeAnual: null,
    porcentajeAlerta: 0.8,
    porcentajeBloqueo: 0.95,
  },
]

export function medioFijo(parcial: Partial<MedioPropio> = {}): MedioPropio {
  return {
    id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a00",
    nombre: "Noticias del Sur",
    tipo: "PAGINA_NOTICIAS",
    municipioCodigo: "76001",
    descripcionAudiencia: "Jóvenes de Cali interesados en deporte.",
    estado: "PENDIENTE",
    nivel: 0,
    enviadoVerificacionAt: null,
    motivoEstado: null,
    verificadoAt: null,
    actualizadoAt: "2026-10-22T12:00:00.000000+00:00",
    ...parcial,
  }
}

export function pagoFijo(parcial: Partial<PagoResumen> = {}): PagoResumen {
  return {
    titularNombre: "Ana María Pérez",
    tipoDocumento: "CC",
    numeroDocumentoResumen: "•••• 6789",
    metodoPago: "BILLETERA",
    cuentaResumen: "Nequi •••• 4821",
    esDeclarante: false,
    obligadoFacturar: false,
    responsableIva: false,
    documentoRegistrado: true,
    cuentaRegistrada: true,
    actualizadoAt: "2026-10-20T12:00:00Z",
    ...parcial,
  }
}

export const SIN_PAGO: PagoResumen = pagoFijo({
  titularNombre: null,
  tipoDocumento: null,
  numeroDocumentoResumen: null,
  metodoPago: null,
  cuentaResumen: null,
  documentoRegistrado: false,
  cuentaRegistrada: false,
  actualizadoAt: null,
})

export function documentoFijo(
  parcial: Partial<DocumentoRegistrado> = {}
): DocumentoRegistrado {
  return {
    tipo: "CEDULA_FRENTE",
    estado: "APROBADO",
    fechaVencimiento: null,
    metodo: "ARCHIVO",
    observaciones: null,
    creadoAt: "2026-10-01T15:00:00Z",
    ...parcial,
  }
}

/** Cédula (dos caras) y certificado de la billetera, aprobados. */
export const DOCUMENTOS_NIVEL_1: DocumentoRegistrado[] = [
  documentoFijo({ tipo: "CEDULA_FRENTE" }),
  documentoFijo({ tipo: "CEDULA_REVERSO" }),
  documentoFijo({ tipo: "CERT_BILLETERA" }),
]

/** Medio recién registrado: nada cargado salvo los términos aceptados. */
export function resumenFijo(
  parcial: Partial<ResumenMiMedio> = {}
): ResumenMiMedio {
  return {
    medio: medioFijo({ descripcionAudiencia: null }),
    categorias: 0,
    paisesAudiencia: 0,
    documentos: [],
    niveles: NIVELES_FIJOS,
    pago: SIN_PAGO,
    cuentas: [],
    terminosPendientes: 0,
    hoy: HOY_FIJO,
    ...parcial,
  }
}

/** Medio con todo el alta completa (aún sin enviar). */
export function resumenCompleto(
  parcial: Partial<ResumenMiMedio> = {}
): ResumenMiMedio {
  return resumenFijo({
    medio: medioFijo(),
    categorias: 2,
    paisesAudiencia: 1,
    documentos: DOCUMENTOS_NIVEL_1,
    pago: pagoFijo(),
    cuentas: [
      {
        id: "c1",
        verificada: true,
        enRevision: false,
        esperandoCaptura: false,
        rechazada: false,
      },
    ],
    ...parcial,
  })
}
