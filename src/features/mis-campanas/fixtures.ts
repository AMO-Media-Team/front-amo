/**
 * Datos de prueba de «Mis campañas» (solo para las pruebas Vitest del
 * paquete y de quienes usan sus contratos).
 */
import type {
  AsignacionMedio,
  MetricaMedio,
  PagoAsignacion,
  PublicacionMedio,
  VersionContenido,
} from "./tipos"

export const ASIGNACION_ID = "0199f3a0-0000-7000-8000-00000000a501"
export const OFERTA_ID = "0199f3a0-0000-7000-8000-0000000000f1"
export const PUBLICACION_ID = "0199f3a0-0000-7000-8000-0000000000b1"

export function pagoDePrueba(
  cambios: Partial<PagoAsignacion> = {}
): PagoAsignacion {
  return {
    montoMedio: 504_000,
    multiplicadorCalidad: 1.4,
    tarifaBase: 450_000,
    multiplicadorGeografico: 1,
    multiplicadorExclusividad: null,
    montoBruto: 630_000,
    porcentajeComision: 0.2,
    montoComision: 126_000,
    montoRetenciones: null,
    montoNeto: null,
    ...cambios,
  }
}

export function asignacionDePrueba(
  cambios: Partial<AsignacionMedio> = {}
): AsignacionMedio {
  return {
    id: ASIGNACION_ID,
    ofertaId: OFERTA_ID,
    estado: "ACEPTADA",
    estadoPrevioDisputa: null,
    causaCancelacion: null,
    motivo: null,
    plataforma: "INSTAGRAM",
    publicaciones: 1,
    ofertaTitulo: "Reel de Halloween",
    marca: "Refrescos Costa Azul",
    anuncianteNombre: "Bebidas del Caribe",
    formatoId: "0199f3a0-0000-7000-8000-0000000000d1",
    formatoNombre: "Reel",
    ventanaInicio: "2026-10-25T05:00:00.000Z",
    ventanaFin: "2026-10-30T05:00:00.000Z",
    fechaLimiteAceptacion: "2026-10-24T05:00:00.000Z",
    cortesRequeridos: ["H24", "H72"],
    permanenciaMinimaDias: 7,
    handle: "noticias.pasto",
    franjaClave: "F30_60",
    seguidoresAlAceptar: 42_000,
    creadaAt: "2026-10-20T15:00:00.000Z",
    aceptadaAt: "2026-10-20T15:00:00.000Z",
    contenidoDescargadoAt: null,
    publicadaAt: null,
    evidenciaValidadaAt: null,
    metricasCargadasAt: null,
    verificadaAt: null,
    liquidadaAt: null,
    pagadaAt: null,
    rechazadaAt: null,
    vencidaAt: null,
    enDisputaAt: null,
    canceladaAt: null,
    metricasAtrasadasAt: null,
    fechaLimitePublicacion: "2026-10-30T05:00:00.000Z",
    reclamoHasta: null,
    creativoDescargadoId: null,
    pago: pagoDePrueba(),
    ...cambios,
  }
}

export function publicacionDePrueba(
  cambios: Partial<PublicacionMedio> = {}
): PublicacionMedio {
  return {
    id: PUBLICACION_ID,
    numero: 1,
    urlPost: "https://www.instagram.com/reel/C0ABCdef123/",
    fechaPublicacion: "2026-10-26T15:00:00.000Z",
    permanenciaHasta: "2026-11-02T15:00:00.000Z",
    estado: "PENDIENTE",
    observaciones: null,
    validadaAt: null,
    creadaAt: "2026-10-26T16:00:00.000Z",
    actualizadaAt: "2026-10-26T16:00:00.000Z",
    ...cambios,
  }
}

export function metricaDePrueba(
  cambios: Partial<MetricaMedio> = {}
): MetricaMedio {
  return {
    id: "0199f3a0-0000-7000-8000-0000000000c1",
    publicacionId: PUBLICACION_ID,
    corte: "H24",
    fechaCorte: "2026-10-27T16:00:00.000Z",
    periodoDesde: null,
    periodoHasta: null,
    estado: "PENDIENTE",
    observaciones: null,
    validadaAt: null,
    creadaAt: "2026-10-27T17:00:00.000Z",
    actualizadaAt: "2026-10-27T17:00:00.000Z",
    ...cambios,
  }
}

export function versionDePrueba(
  cambios: Partial<VersionContenido> = {}
): VersionContenido {
  return {
    id: "0199f3a0-0000-7000-8000-0000000000e1",
    version: 1,
    tipo: "VIDEO",
    activadoAt: "2026-10-19T15:00:00.000Z",
    copySugerido: "¡Llegó el sabor de Halloween!",
    hashtags: ["#Publicidad", "CostaAzul"],
    menciones: ["@costaazul"],
    enlaceDestino: "https://costaazul.example/halloween",
    archivos: [
      {
        id: "0199f3a0-0000-7000-8000-0000000000a1",
        mime: "video/mp4",
        tamanoBytes: 12_400_000,
        ancho: 1080,
        alto: 1920,
        duracionSegundos: 45,
        orden: 0,
      },
    ],
    ...cambios,
  }
}
