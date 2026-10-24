import { describe, expect, it } from "vitest"

import {
  componerModelo,
  DocumentoNoEmitido,
  esquemaDatosDocumentoSoporte,
  esquemaVendedorRevelado,
  ubicacion,
  type VendedorDocumento,
} from "./datos"
import { RESPUESTA_BD } from "./datos.fixture"

const VENDEDOR: VendedorDocumento = {
  titular: "Tatiana Martínez Ríos",
  tipoDocumento: "CC",
  numeroDocumento: "1023456789",
  direccion: "Cll 34 # 66-34",
}

describe("esquemaDatosDocumentoSoporte", () => {
  it("acepta la respuesta de la BD y deja los montos como números", () => {
    const datos = esquemaDatosDocumentoSoporte.parse(RESPUESTA_BD)
    expect(datos.documento.valor_total).toBe(360000)
    expect(datos.retenciones[1].tarifa).toBe(0.00966)
    expect(datos.lineas[0].plataforma).toBe("INSTAGRAM")
  })

  it("admite montos como texto y una resolución ausente", () => {
    const datos = esquemaDatosDocumentoSoporte.parse({
      ...RESPUESTA_BD,
      resolucion: null,
      documento: { ...RESPUESTA_BD.documento, valor_total: "360000.00" },
    })
    expect(datos.documento.valor_total).toBe(360000)
    expect(datos.resolucion).toBeNull()
  })

  it("rechaza un monto nulo en lugar de convertirlo en cero", () => {
    expect(
      esquemaDatosDocumentoSoporte.safeParse({
        ...RESPUESTA_BD,
        liquidacion: { ...RESPUESTA_BD.liquidacion, monto_neto: null },
      }).success
    ).toBe(false)
  })
})

describe("esquemaVendedorRevelado", () => {
  it("lee los campos revelados y la ausencia de la fila", () => {
    expect(
      esquemaVendedorRevelado.parse({
        titular_nombre: "Ana",
        tipo_documento: "CE",
        numero_documento_cifrado: "v1:a:b:c",
        direccion: null,
      })
    ).toEqual({
      titular_nombre: "Ana",
      tipo_documento: "CE",
      numero_documento_cifrado: "v1:a:b:c",
      direccion: null,
    })
    expect(esquemaVendedorRevelado.parse(null)).toBeNull()
    expect(esquemaVendedorRevelado.parse({})).toEqual({
      titular_nombre: null,
      tipo_documento: null,
      numero_documento_cifrado: null,
      direccion: null,
    })
  })
})

describe("componerModelo", () => {
  const datos = esquemaDatosDocumentoSoporte.parse(RESPUESTA_BD)

  it("une documento, vendedor descifrado y nombres de municipio", () => {
    const modelo = componerModelo(datos, VENDEDOR)
    expect(modelo.documento).toEqual({
      id: RESPUESTA_BD.documento.id,
      prefijo: "DEMO",
      consecutivo: 2187,
      numero: "DEMO2187",
      fechaEmision: "2026-10-17",
      cuds: null,
      valorTotal: 360000,
    })
    expect(modelo.vendedor).toMatchObject({
      titular: "Tatiana Martínez Ríos",
      tipoDocumento: "CC",
      numeroDocumento: "1023456789",
      municipio: { codigo: "47001", nombre: "Santa Marta, Magdalena" },
    })
    expect(modelo.retenciones[1].municipio.nombre).toBe(
      "Santa Marta, Magdalena"
    )
    expect(modelo.liquidacion).toEqual({
      id: RESPUESTA_BD.liquidacion.id,
      periodoInicio: "2026-10-01",
      periodoFin: "2026-10-15",
      montoRetenciones: 25078,
      montoNeto: 334922,
    })
  })

  it("la configuración vacía del adquiriente queda como dato ausente", () => {
    const { adquiriente } = componerModelo(datos, VENDEDOR)
    expect(adquiriente).toEqual({
      razonSocial: null,
      nit: null,
      dv: null,
      direccion: null,
      municipio: { codigo: "11001", nombre: "Bogotá, D.C." },
    })
  })

  it("solo un documento emitido tiene archivos", () => {
    const borrador = esquemaDatosDocumentoSoporte.parse({
      ...RESPUESTA_BD,
      documento: {
        ...RESPUESTA_BD.documento,
        estado: "BORRADOR",
        consecutivo: null,
        numero: null,
        prefijo: null,
        fecha_emision: null,
      },
    })
    expect(() => componerModelo(borrador, VENDEDOR)).toThrow(DocumentoNoEmitido)
  })
})

describe("ubicacion", () => {
  it("municipio con su departamento; Bogotá sin repetir", () => {
    expect(ubicacion("52001")).toEqual({
      codigo: "52001",
      nombre: "Pasto, Nariño",
    })
    expect(ubicacion("11001")).toEqual({
      codigo: "11001",
      nombre: "Bogotá, D.C.",
    })
  })

  it("sin código o con uno desconocido no inventa el nombre", () => {
    expect(ubicacion(null)).toEqual({ codigo: null, nombre: null })
    expect(ubicacion("99999")).toEqual({ codigo: "99999", nombre: null })
  })
})
