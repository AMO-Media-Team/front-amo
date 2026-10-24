import { describe, expect, it } from "vitest"

import {
  componerModelo,
  esquemaDatosDocumentoSoporte,
  type RetencionModelo,
} from "./datos"
import { RESPUESTA_BD } from "./datos.fixture"
import {
  archivoProveedorDocumentoSoporte,
  datosPdfDocumentoSoporte,
  documentoIdentidad,
  FORMATO_ARCHIVO_PROVEEDOR,
  formatearTarifa,
  nombreRetencion,
  serializarArchivoProveedor,
} from "./salidas"

const GENERADO = new Date("2026-10-17T20:05:00Z")

function modelo(
  cambios: { adquiriente?: Partial<typeof RESPUESTA_BD.adquiriente> } = {}
) {
  return componerModelo(
    esquemaDatosDocumentoSoporte.parse({
      ...RESPUESTA_BD,
      adquiriente: { ...RESPUESTA_BD.adquiriente, ...cambios.adquiriente },
    }),
    {
      titular: "Tatiana Martínez Ríos",
      tipoDocumento: "CC",
      numeroDocumento: "1023456789",
      direccion: "Cll 34 # 66-34",
    }
  )
}

describe("formatearTarifa", () => {
  it("porcentaje para la retención en la fuente; por mil para la ReteICA", () => {
    expect(formatearTarifa("RETEFUENTE", 0.06)).toBe("6 %")
    expect(formatearTarifa("RETEFUENTE", 0.035)).toBe("3,5 %")
    expect(formatearTarifa("RETEIVA", 0.15)).toBe("15 %")
    expect(formatearTarifa("RETEICA", 0.00966)).toBe("9,66 por mil")
    expect(formatearTarifa("RETEICA", 0.0069)).toBe("6,9 por mil")
    expect(formatearTarifa("RETEICA", 0.01)).toBe("10 por mil")
  })
})

describe("nombreRetencion", () => {
  const base: RetencionModelo = {
    tipo: "RETEFUENTE",
    concepto: "SERVICIOS",
    tarifa: 0.06,
    base: 100,
    valor: 6,
    municipio: { codigo: null, nombre: null },
  }

  it("con su concepto o su municipio", () => {
    expect(nombreRetencion(base)).toBe("Retención en la fuente · Servicios")
    expect(
      nombreRetencion({
        ...base,
        tipo: "RETEICA",
        concepto: "ICA",
        municipio: { codigo: "52001", nombre: "Pasto, Nariño" },
      })
    ).toBe("ReteICA · Pasto, Nariño")
  })

  it("un concepto fuera del catálogo se muestra legible; sin detalle, solo el tipo", () => {
    expect(nombreRetencion({ ...base, concepto: "ARRENDAMIENTOS" })).toBe(
      "Retención en la fuente · Arrendamientos"
    )
    expect(nombreRetencion({ ...base, tipo: "RETEIVA", concepto: null })).toBe(
      "ReteIVA"
    )
  })
})

describe("documentoIdentidad", () => {
  it("sigla y miles con punto", () => {
    expect(documentoIdentidad("CC", "1023456789")).toBe("CC 1.023.456.789")
    expect(documentoIdentidad("NIT", "900123456")).toBe("NIT 900.123.456")
  })

  it("pasaporte o número con letras, tal cual; sin número, nada", () => {
    expect(documentoIdentidad("PASAPORTE", "123456789")).toBe(
      "Pasaporte 123456789"
    )
    expect(documentoIdentidad("PPT", "AB12345")).toBe("PPT AB12345")
    expect(documentoIdentidad(null, "123")).toBe("123")
    expect(documentoIdentidad("CC", null)).toBeNull()
  })
})

describe("datosPdfDocumentoSoporte", () => {
  it("lleva los textos listos para el PDF", () => {
    const datos = datosPdfDocumentoSoporte(modelo(), GENERADO)
    expect(datos).toMatchObject({
      numero: "DEMO2187",
      fechaEmision: "2026-10-17",
      periodo: { inicio: "2026-10-01", fin: "2026-10-15" },
      resolucion: { numero: "18764000000002", prefijo: "DEMO" },
      vendedor: {
        nombre: "Tatiana Martínez Ríos",
        documento: "CC 1.023.456.789",
        direccion: "Cll 34 # 66-34",
        municipio: "Santa Marta, Magdalena",
      },
      adquiriente: {
        nombre: null,
        documento: null,
        direccion: null,
        municipio: "Bogotá, D.C.",
      },
      valorTotal: 360000,
      totalRetenciones: 25078,
      netoAPagar: 334922,
      cuds: null,
      generadoAt: GENERADO,
    })
    expect(datos.lineas).toEqual([
      {
        publicacion: "Post de feed de Instagram · Amor y Amistad",
        marca: "Fundación Universitaria Horizonte",
        plataformaFormato: "Instagram · Post de feed",
        fecha: "2026-10-06T13:00:42.409125+00:00",
        valor: 360000,
      },
    ])
    expect(datos.retenciones).toEqual([
      {
        nombre: "Retención en la fuente · Servicios",
        tarifa: "6 %",
        base: 360000,
        valor: 21600,
      },
      {
        nombre: "ReteICA · Santa Marta, Magdalena",
        tarifa: "9,66 por mil",
        base: 360000,
        valor: 3478,
      },
    ])
  })

  it("el NIT de AMO configurado va con su dígito de verificación", () => {
    const datos = datosPdfDocumentoSoporte(
      modelo({
        adquiriente: {
          razon_social: "AMO S.A.S.",
          nit: "901234567",
          dv: "8",
          direccion: "Cra 7 # 71-21",
        },
      }),
      GENERADO
    )
    expect(datos.adquiriente).toEqual({
      nombre: "AMO S.A.S.",
      documento: "901.234.567-8",
      direccion: "Cra 7 # 71-21",
      municipio: "Bogotá, D.C.",
    })
  })
})

describe("archivoProveedorDocumentoSoporte", () => {
  it("formato AMO-DS-1 con documento, partes, ítems, retenciones y totales", () => {
    const archivo = archivoProveedorDocumentoSoporte(modelo(), GENERADO)
    expect(archivo.formato).toBe(FORMATO_ARCHIVO_PROVEEDOR)
    expect(archivo.generado_at).toBe("2026-10-17T20:05:00.000Z")
    expect(archivo.documento).toEqual({
      tipo: "DOCUMENTO_SOPORTE",
      id: RESPUESTA_BD.documento.id,
      prefijo: "DEMO",
      consecutivo: 2187,
      numero: "DEMO2187",
      fecha_emision: "2026-10-17",
      moneda: "COP",
      cuds: null,
    })
    expect(archivo.vendedor).toEqual({
      nombre: "Tatiana Martínez Ríos",
      tipo_documento: "CC",
      numero_documento: "1023456789",
      direccion: "Cll 34 # 66-34",
      municipio_codigo: "47001",
      municipio: "Santa Marta, Magdalena",
      pais: "CO",
    })
    expect(archivo.adquiriente).toMatchObject({
      razon_social: null,
      nit: null,
      municipio_codigo: "11001",
    })
    expect(archivo.items).toEqual([
      {
        linea: 1,
        asignacion_id: RESPUESTA_BD.lineas[0].asignacion_id,
        descripcion: "Post de feed de Instagram · Amor y Amistad",
        marca: "Fundación Universitaria Horizonte",
        plataforma: "Instagram",
        formato: "Post de feed",
        fecha: "2026-10-06",
        cantidad: 1,
        valor_unitario: 360000,
        valor_total: 360000,
      },
    ])
    expect(archivo.retenciones).toEqual([
      {
        tipo: "RETEFUENTE",
        concepto: "SERVICIOS",
        tarifa: 0.06,
        base: 360000,
        valor: 21600,
        municipio_codigo: null,
      },
      {
        tipo: "RETEICA",
        concepto: "ICA",
        tarifa: 0.00966,
        base: 360000,
        valor: 3478,
        municipio_codigo: "47001",
      },
    ])
    expect(archivo.totales).toEqual({
      valor_bruto: 360000,
      total_retenciones: 25078,
      neto_a_pagar: 334922,
    })
  })

  it("la fecha de cada ítem es el día de Bogotá, no el de UTC", () => {
    const base = modelo()
    const archivo = archivoProveedorDocumentoSoporte(
      {
        ...base,
        lineas: [{ ...base.lineas[0], publicadaAt: "2026-10-07T03:30:00Z" }],
      },
      GENERADO
    )
    expect(archivo.items[0].fecha).toBe("2026-10-06")
  })

  it("se serializa como JSON legible que se vuelve a leer igual", () => {
    const archivo = archivoProveedorDocumentoSoporte(modelo(), GENERADO)
    const texto = serializarArchivoProveedor(archivo)
    expect(texto.endsWith("}\n")).toBe(true)
    expect(texto).toContain('\n  "formato": "AMO-DS-1",')
    expect(JSON.parse(texto)).toEqual(archivo)
  })
})
