/**
 * Datos de prueba del seguimiento (solo para las pruebas de este paquete y
 * de las métricas de campaña): una asignación coherente que cada prueba
 * ajusta con lo que necesita.
 */
import type {
  AsignacionSeguimiento,
  CorteAprobado,
  PublicacionSeguimiento,
  SeguimientoCampana,
} from "./tipos"

export const CAMPANA_PRUEBA = "0199f3a0-0000-7000-8000-00000000ca01"

let secuencia = 0

/** UUID válido y distinto en cada llamada (`…-0000000000NN`). */
export function idPrueba(prefijo = "0199f3a0-0000-7000-8000"): string {
  secuencia += 1
  return `${prefijo}-${secuencia.toString(16).padStart(12, "0")}`
}

export function cortePrueba(
  cambios: Partial<CorteAprobado> = {}
): CorteAprobado {
  return {
    corte: "H24",
    fechaCorte: "2026-10-15T13:00:00.000Z",
    alcance: 6000,
    impresiones: 7600,
    interacciones: 190,
    reproducciones: null,
    clics: null,
    ...cambios,
  }
}

export function publicacionPrueba(
  cambios: Partial<PublicacionSeguimiento> = {}
): PublicacionSeguimiento {
  return {
    id: idPrueba(),
    numero: 1,
    urlPost: "https://www.instagram.com/p/CxPrueba123/",
    fechaPublicacion: "2026-10-14T13:23:00.000Z",
    estadoValidacion: "APROBADA",
    conCaptura: true,
    cortes: [],
    ...cambios,
  }
}

export function asignacionPrueba(
  cambios: Partial<AsignacionSeguimiento> = {}
): AsignacionSeguimiento {
  return {
    id: idPrueba(),
    ofertaId: idPrueba(),
    oferta: "Historia de Instagram · Halloween",
    plataforma: "INSTAGRAM",
    slot: 1,
    estado: "CONTENIDO_ENTREGADO",
    estadoPrevioDisputa: null,
    aceptadaAt: "2026-10-10T15:00:00.000Z",
    contenidoDescargadoAt: "2026-10-11T15:00:00.000Z",
    fechaLimitePublicacion: "2026-10-20T04:59:59.000Z",
    publicadaAt: null,
    evidenciaValidadaAt: null,
    metricasCargadasAt: null,
    verificadaAt: null,
    vencidaAt: null,
    enDisputaAt: null,
    canceladaAt: null,
    montoBruto: 205900,
    medio: {
      id: idPrueba(),
      nombre: "Comunidad Sincelejo",
      municipio: "Sincelejo",
      departamento: "Sucre",
      nivel: 1,
    },
    cuenta: {
      plataforma: "INSTAGRAM",
      handle: "comunidadsincelejo",
      url: "https://www.instagram.com/comunidadsincelejo/",
      seguidoresAlAceptar: 113398,
      franja: "F2",
    },
    publicaciones: [],
    ...cambios,
  }
}

export function seguimientoPrueba(
  asignaciones: AsignacionSeguimiento[],
  consultadoAt = "2026-10-16T15:00:00.000Z",
  campanaId = CAMPANA_PRUEBA
): SeguimientoCampana {
  return { campanaId, asignaciones, consultadoAt }
}
