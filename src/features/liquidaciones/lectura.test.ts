import { describe, expect, it } from "vitest"

import {
  type DocumentoBd,
  documentoVigente,
  filaLiquidacion,
  filaPendiente,
  type LineaBd,
  lineaLiquidacion,
  type LiquidacionBd,
  retencionesDeLineas,
} from "./lectura"

const documento = (
  id: string,
  estado: DocumentoBd["estado"],
  creado: string,
  cambios: Partial<DocumentoBd> = {}
): DocumentoBd => ({
  id,
  estado,
  numero: null,
  cuds: null,
  nota_ajuste_numero: null,
  created_at: creado,
  ...cambios,
})

describe("documentoVigente", () => {
  it("el no anulado más reciente; si todos se anularon, el último", () => {
    const anulado = documento("d1", "ANULADO", "2026-10-16T10:00:00Z", {
      numero: "DS-1",
      cuds: "a".repeat(96),
      nota_ajuste_numero: "NA-1",
    })
    const emitido = documento("d2", "EMITIDO", "2026-10-17T10:00:00Z", {
      numero: "DS-2",
    })
    expect(documentoVigente([emitido, anulado])).toEqual({
      id: "d2",
      estado: "EMITIDO",
      numero: "DS-2",
      conCuds: false,
      conNotaAjuste: false,
    })
    expect(documentoVigente([anulado])).toEqual({
      id: "d1",
      estado: "ANULADO",
      numero: "DS-1",
      conCuds: true,
      conNotaAjuste: true,
    })
    expect(documentoVigente([])).toBeNull()
    expect(documentoVigente(null)).toBeNull()
  })
})

const LIQUIDACION: LiquidacionBd = {
  id: "l1",
  estado: "APROBADA",
  medio_id: "m1",
  periodo_inicio: "2026-10-01",
  periodo_fin: "2026-10-15",
  cantidad_asignaciones: 3,
  monto_medio: 300_000,
  monto_retenciones: 18_000,
  monto_neto: 282_000,
  requiere_documento_soporte: true,
  alerta_seg_social: false,
  creada_por: "u1",
  created_at: "2026-10-16T15:00:00Z",
  aprobada_at: "2026-10-17T15:00:00Z",
  anulada_at: null,
  fecha_pago: null,
  numero_factura_medio: null,
  dispersion_id: "x1",
  es_demo: false,
  medio: { nombre: "Radio Pasto" },
  dispersion: null,
  documentos: [],
}

describe("filaLiquidacion", () => {
  it("marca si la generó quien mira y la dispersión aunque no se lea su fecha", () => {
    const fila = filaLiquidacion(LIQUIDACION, "u1")
    expect(fila).toMatchObject({
      id: "l1",
      medio: "Radio Pasto",
      generadaPorMi: true,
      dispersion: { id: "x1", fecha: null },
      documento: null,
    })
    expect(filaLiquidacion(LIQUIDACION, "u2").generadaPorMi).toBe(false)
  })

  it("con la dispersión visible trae su fecha; sin medio visible, null", () => {
    const fila = filaLiquidacion(
      {
        ...LIQUIDACION,
        medio: null,
        dispersion: { id: "x1", created_at: "2026-10-18T15:00:00Z" },
      },
      "u2"
    )
    expect(fila.medio).toBeNull()
    expect(fila.dispersion).toEqual({ id: "x1", fecha: "2026-10-18T15:00:00Z" })
    expect(
      filaLiquidacion({ ...LIQUIDACION, dispersion_id: null }, "u2").dispersion
    ).toBeNull()
  })
})

describe("filaPendiente", () => {
  it("copia la fila de la RPC con el municipio resuelto", () => {
    expect(
      filaPendiente(
        {
          medio_id: "m1",
          medio: "Radio Pasto",
          asignaciones: 2,
          monto_medio: 200_000,
          primera_verificada: "2026-10-02T15:00:00Z",
          ultima_verificada: "2026-10-10T15:00:00Z",
          ultima_liquidacion_fin: null,
          requiere_documento_soporte: false,
          datos_pago_listos: true,
          seg_social_pendiente: true,
        },
        "Pasto"
      )
    ).toEqual({
      medioId: "m1",
      medio: "Radio Pasto",
      municipio: "Pasto",
      asignaciones: 2,
      montoMedio: 200_000,
      primeraVerificada: "2026-10-02T15:00:00Z",
      ultimaVerificada: "2026-10-10T15:00:00Z",
      ultimaLiquidacionFin: null,
      requiereDocumentoSoporte: false,
      datosPagoListos: true,
      segSocialPendiente: true,
    })
  })
})

const LINEA: LineaBd = {
  id: "a1",
  plataforma: "INSTAGRAM",
  verificada_at: "2026-10-05T15:00:00Z",
  monto_bruto: 125_000,
  oferta: { titulo: "Reel de temporada" },
  campana: { nombre: "Temporada", marca: "Café" },
  montos: {
    monto_bruto: 125_000,
    monto_comision: 25_000,
    monto_medio: 100_000,
    monto_retenciones: 6_000,
    monto_neto: 94_000,
    retenciones_aplicadas: [
      {
        tipo: "RETEFUENTE",
        concepto: "SERVICIOS",
        tarifa: 0.06,
        base: 100_000,
        base_pago: 300_000,
        valor: 6_000,
        municipio_codigo: null,
      },
    ],
  },
}

describe("lineaLiquidacion", () => {
  it("toma los montos congelados de la asignación", () => {
    expect(lineaLiquidacion(LINEA)).toEqual({
      asignacionId: "a1",
      oferta: "Reel de temporada",
      campana: "Temporada",
      marca: "Café",
      plataforma: "INSTAGRAM",
      verificadaAt: "2026-10-05T15:00:00Z",
      montoBruto: 125_000,
      montoComision: 25_000,
      montoMedio: 100_000,
      montoRetenciones: 6_000,
      montoNeto: 94_000,
    })
  })

  it("sin montos visibles, calcula lo que puede", () => {
    expect(
      lineaLiquidacion({ ...LINEA, montos: null, oferta: null, campana: null })
    ).toMatchObject({
      oferta: null,
      montoBruto: 125_000,
      montoComision: 0,
      montoMedio: 125_000,
      montoNeto: 125_000,
    })
  })
})

describe("retencionesDeLineas", () => {
  it("agrupa y nombra el municipio de la ReteICA", () => {
    const ica = {
      ...LINEA,
      id: "a2",
      montos: {
        ...LINEA.montos!,
        retenciones_aplicadas: [
          {
            tipo: "RETEICA",
            concepto: "ICA",
            tarifa: 0.00966,
            base: 100_000,
            base_pago: 300_000,
            valor: 966,
            municipio_codigo: "11001",
          },
        ],
      },
    }
    const resultado = retencionesDeLineas([LINEA, LINEA, ica], (codigo) =>
      codigo === "11001" ? "Bogotá" : null
    )
    expect(resultado.map((r) => [r.tipo, r.valor, r.municipio])).toEqual([
      ["RETEFUENTE", 12_000, null],
      ["RETEICA", 966, "Bogotá"],
    ])
  })
})
