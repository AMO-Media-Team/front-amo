import { describe, expect, it } from "vitest"

import {
  agruparRetenciones,
  aLinea,
  aLiquidacion,
  aResumen,
  type FilaAsignacionRpc,
  type FilaLineaRpc,
  paginaLiquidaciones,
  parsearRetenciones,
  porLiquidar,
  rutaArchivo,
} from "./datos"
import {
  filaLiquidacion,
  ID_LIQUIDACION,
  ID_LIQUIDACION_ANTERIOR,
} from "./fixtures"

describe("aResumen", () => {
  it("convierte el objeto de la RPC (montos en texto incluidos)", () => {
    expect(
      aResumen({
        ganado_mes: "2631520.00",
        por_liquidar: 1707440,
        asignaciones_por_liquidar: 3,
        por_pagar: "878190.00",
        liquidaciones_por_pagar: 1,
        pagado_historico: 26565356,
        retenciones_historicas: 1377516,
        proximo_pago_estimado: "2026-10-23",
        periodicidad: "QUINCENAL",
        dias_pago: 8,
        comision_visible: false,
        requiere_documento_soporte: false,
        seg_social_pendiente: true,
      })
    ).toEqual({
      ganadoMes: 2_631_520,
      porLiquidar: 1_707_440,
      asignacionesPorLiquidar: 3,
      porPagar: 878_190,
      liquidacionesPorPagar: 1,
      pagadoHistorico: 26_565_356,
      retencionesHistoricas: 1_377_516,
      proximoPagoEstimado: "2026-10-23",
      periodicidad: "QUINCENAL",
      diasPago: 8,
      comisionVisible: false,
      requiereDocumentoSoporte: false,
      segSocialPendiente: true,
    })
  })

  it("acepta la fila dentro de un arreglo y sin datos cuenta cero", () => {
    expect(aResumen([{ ganado_mes: 10 }]).ganadoMes).toBe(10)
    const vacio = aResumen(null)
    expect(vacio.porPagar).toBe(0)
    expect(vacio.proximoPagoEstimado).toBeNull()
    // Sin fila privada la BD supone documento soporte.
    expect(vacio.requiereDocumentoSoporte).toBe(true)
    expect(vacio.segSocialPendiente).toBe(false)
  })
})

describe("aLiquidacion", () => {
  it("no deja salir las rutas: solo si hay archivo", () => {
    const dto = aLiquidacion(filaLiquidacion())
    expect(dto.conSoportePago).toBe(true)
    expect(dto.documento).toEqual({
      numero: "DSF2",
      fecha: "2026-10-17",
      estado: "EMITIDO",
      cuds: null,
      conArchivo: true,
    })
    expect(JSON.stringify(dto)).not.toContain("liquidacion/")
    expect(JSON.stringify(dto)).not.toContain("documento_soporte/")
  })

  it("con la comisión oculta, bruto y comisión quedan en null", () => {
    const dto = aLiquidacion(
      filaLiquidacion({ monto_bruto: null, monto_comision: null })
    )
    expect(dto.montoBruto).toBeNull()
    expect(dto.montoComision).toBeNull()
    expect(dto.montoMedio).toBe(8_000_000)
  })

  it("sin documento vigente no hay documento; la factura del medio, si la hay", () => {
    const dto = aLiquidacion(
      filaLiquidacion({
        requiere_documento_soporte: false,
        documento_id: null,
        numero_factura_medio: "FE-12",
        factura_medio_path: `liquidacion/${ID_LIQUIDACION}/factura/f.pdf`,
      })
    )
    expect(dto.documento).toBeNull()
    expect(dto.requiereDocumentoSoporte).toBe(false)
    expect(dto.factura).toEqual({ numero: "FE-12", conArchivo: true })
  })
})

describe("paginaLiquidaciones", () => {
  it("con una fila de más hay otra página, desde la última mostrada", () => {
    const filas = [
      filaLiquidacion({ id: "c" }),
      filaLiquidacion({ id: "b" }),
      filaLiquidacion({ id: "a" }),
    ]
    expect(paginaLiquidaciones(filas, 2)).toMatchObject({
      liquidaciones: [{ id: "c" }, { id: "b" }],
      siguiente: "b",
    })
    expect(paginaLiquidaciones(filas, 3).siguiente).toBeNull()
    expect(paginaLiquidaciones([], 12)).toEqual({
      liquidaciones: [],
      siguiente: null,
    })
  })
})

describe("rutaArchivo", () => {
  it("toma la ruta de la fila según el archivo pedido", () => {
    const fila = filaLiquidacion({
      factura_medio_path: `liquidacion/${ID_LIQUIDACION_ANTERIOR}/factura/f.pdf`,
    })
    expect(rutaArchivo(fila, "soporte_pago")).toBe(
      `liquidacion/${ID_LIQUIDACION}/pago/s.pdf`
    )
    expect(rutaArchivo(fila, "documento_soporte")).toMatch(
      /^documento_soporte\//
    )
    expect(rutaArchivo(fila, "factura")).toMatch(/factura\/f\.pdf$/)
    expect(
      rutaArchivo(filaLiquidacion({ soporte_pago_path: null }), "soporte_pago")
    ).toBeNull()
  })
})

describe("parsearRetenciones", () => {
  it("lee las aplicadas y descarta lo que no tiene tipo o valor", () => {
    expect(
      parsearRetenciones([
        {
          tipo: "RETEFUENTE",
          concepto: "SERVICIOS",
          tarifa: 0.04,
          base: 476080,
          valor: 19043,
          base_pago: 924080,
          municipio_codigo: null,
        },
        {
          tipo: "RETEICA",
          tarifa: "0.00966",
          base: "476080",
          valor: "4599",
          municipio_codigo: "05001",
        },
        { concepto: "SIN_TIPO", valor: 10 },
        { tipo: "RETEIVA" },
        "basura",
        null,
      ])
    ).toEqual([
      {
        tipo: "RETEFUENTE",
        concepto: "SERVICIOS",
        tarifa: 0.04,
        base: 476080,
        valor: 19043,
        municipioCodigo: null,
      },
      {
        tipo: "RETEICA",
        concepto: null,
        tarifa: 0.00966,
        base: 476080,
        valor: 4599,
        municipioCodigo: "05001",
      },
    ])
    expect(parsearRetenciones(null)).toEqual([])
    expect(parsearRetenciones({ tipo: "RETEFUENTE" })).toEqual([])
  })
})

describe("agruparRetenciones", () => {
  const fuente = (base: number, valor: number) => ({
    tipo: "RETEFUENTE",
    concepto: "SERVICIOS",
    tarifa: 0.04,
    base,
    valor,
    municipioCodigo: null,
  })
  const ica = (base: number, valor: number) => ({
    tipo: "RETEICA",
    concepto: "ICA",
    tarifa: 0.00966,
    base,
    valor,
    municipioCodigo: "05001",
  })

  it("suma base y valor por tipo, concepto, tarifa y municipio, en orden", () => {
    const grupos = agruparRetenciones(
      [
        [ica(476080, 4599), fuente(476080, 19043)],
        [fuente(448000, 17920), ica(448000, 4328)],
      ],
      (codigo) => (codigo === "05001" ? "Medellín" : null)
    )
    expect(grupos).toEqual([
      expect.objectContaining({
        tipo: "RETEFUENTE",
        base: 924080,
        valor: 36963,
        municipio: null,
      }),
      expect.objectContaining({
        tipo: "RETEICA",
        base: 924080,
        valor: 8927,
        municipio: "Medellín",
      }),
    ])
  })

  it("tarifas distintas del mismo tipo van por separado", () => {
    const grupos = agruparRetenciones([
      [fuente(100, 4), { ...fuente(100, 6), tarifa: 0.06 }],
    ])
    expect(grupos).toHaveLength(2)
    expect(agruparRetenciones([])).toEqual([])
  })
})

describe("aLinea y porLiquidar", () => {
  it("la línea trae sus retenciones y la oferta con respaldo", () => {
    const linea = aLinea({
      asignacion_id: "a1",
      oferta_id: "o1",
      campana_id: "c1",
      oferta: "",
      marca: "Marca",
      anunciante: "Anunciante",
      plataforma: "INSTAGRAM",
      formato: "Post de feed",
      publicada_at: "2026-10-05T23:34:16+00:00",
      verificada_at: "2026-10-14T22:15:18+00:00",
      monto_bruto: 560000,
      monto_comision: 112000,
      monto_medio: 448000,
      retenciones_aplicadas: [
        { tipo: "RETEFUENTE", valor: 17920, tarifa: 0.04, base: 448000 },
      ],
      monto_retenciones: 17920,
      monto_neto: 430080,
    } as FilaLineaRpc)
    expect(linea.oferta).toBe("Oferta")
    expect(linea.retenciones).toHaveLength(1)
    expect(linea.montoNeto).toBe(430080)
  })

  it("por liquidar: solo verificadas sin liquidación, la más reciente primero", () => {
    const fila = (cambios: Partial<FilaAsignacionRpc>) =>
      ({
        id: "x",
        estado: "VERIFICADA",
        liquidacion_id: null,
        oferta_titulo: "Oferta",
        marca: "Marca",
        plataforma: "TIKTOK",
        formato_nombre: "Video",
        verificada_at: "2026-10-01T00:00:00Z",
        monto_medio: 100,
        ...cambios,
      }) as unknown as FilaAsignacionRpc
    const lista = porLiquidar([
      fila({ id: "vieja", verificada_at: "2026-09-01T00:00:00Z" }),
      fila({ id: "liquidada", liquidacion_id: ID_LIQUIDACION }),
      fila({ id: "pagada", estado: "PAGADA" }),
      fila({ id: "nueva", verificada_at: "2026-10-20T00:00:00Z" }),
    ])
    expect(lista.map((a) => a.id)).toEqual(["nueva", "vieja"])
    expect(lista[0]).toMatchObject({ montoMedio: 100, formato: "Video" })
  })
})
