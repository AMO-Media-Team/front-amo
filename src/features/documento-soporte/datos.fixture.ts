/**
 * Datos de prueba del documento soporte (solo los importan las pruebas).
 */

/** Lo que devuelve `datos_documento_soporte` (forma real de la base local). */
export const RESPUESTA_BD = {
  medio: {
    id: "01a16b36-f619-70b2-bb30-afeb2472d90b",
    nombre: "Tatiana Martínez",
    municipio_codigo: "47001",
  },
  lineas: [
    {
      marca: "Fundación Universitaria Horizonte",
      valor: 360000.0,
      oferta: "Post de feed de Instagram · Amor y Amistad",
      formato: "Post de feed",
      plataforma: "INSTAGRAM",
      publicada_at: "2026-10-06T13:00:42.409125+00:00",
      asignacion_id: "01a16b3e-23da-7956-b046-e408d2c5dd0d",
      verificada_at: "2026-10-15T19:01:23.756156+00:00",
    },
  ],
  documento: {
    id: "01a16b3e-4124-7519-b25e-84c8a4317ce3",
    cuds: null,
    estado: "EMITIDO",
    numero: "DEMO2187",
    prefijo: "DEMO",
    consecutivo: 2187,
    valor_total: 360000.0,
    archivo_path:
      "documento_soporte/01a16b3e-4124-7519-b25e-84c8a4317ce3/DEMO2187.pdf",
    fecha_emision: "2026-10-17",
    archivo_proveedor_path: null,
  },
  resolucion: {
    prefijo: "DEMO",
    rango_desde: 1,
    rango_hasta: 90000,
    vigente_desde: "2025-06-01",
    vigente_hasta: "2027-06-01",
    fecha_resolucion: "2025-06-01",
    numero_resolucion: "18764000000002",
  },
  adquiriente: {
    dv: "",
    nit: "",
    direccion: "",
    razon_social: "",
    municipio_codigo: "11001",
  },
  liquidacion: {
    id: "01a16b3e-4124-7cc1-98e1-980a228c77a6",
    monto_neto: 334922.0,
    monto_medio: 360000.0,
    periodo_fin: "2026-10-15",
    periodo_inicio: "2026-10-01",
    monto_retenciones: 25078.0,
    cantidad_asignaciones: 1,
  },
  retenciones: [
    {
      base: 360000.0,
      tipo: "RETEFUENTE",
      valor: 21600,
      tarifa: 0.06,
      concepto: "SERVICIOS",
      municipio_codigo: null,
    },
    {
      base: 360000.0,
      tipo: "RETEICA",
      valor: 3478,
      tarifa: 0.00966,
      concepto: "ICA",
      municipio_codigo: "47001",
    },
  ],
}
