import { describe, expect, it } from "vitest"

import {
  aDocumentoCargado,
  aMedioDocumentos,
  aPerfilTributario,
  aRequisitosNiveles,
  type FilaDocumento,
  type FilaNivel,
  formatoDeRuta,
} from "./filas"

const MEDIO = "0192f1c2-5b6a-7d00-8000-000000000001"

const FILA: FilaDocumento = {
  id: "0192f1c2-5b6a-7d00-8000-0000000000aa",
  tipo: "CEDULA_FRENTE",
  estado_validacion: "RECHAZADO",
  metodo: "ARCHIVO",
  observaciones: "  La foto está borrosa.  ",
  fecha_vencimiento: null,
  created_at: "2026-10-01T15:00:00+00:00",
  validado_at: "2026-10-02T15:00:00+00:00",
  archivo_path: `medio/${MEDIO}/CEDULA_FRENTE/0192f1c2-5b6a-7d00-8000-0000000000bb.webp`,
}

describe("formatoDeRuta", () => {
  it("deduce el formato de la extensión del objeto", () => {
    expect(formatoDeRuta("medio/x/RUT/a.pdf")).toBe("application/pdf")
    expect(formatoDeRuta("medio/x/CEDULA_FRENTE/a.webp")).toBe("image/webp")
    expect(formatoDeRuta("medio/x/CEDULA_FRENTE/a.HEIC")).toBe("image/heic")
  })

  it("sin archivo o con una extensión desconocida no hay formato", () => {
    expect(formatoDeRuta(null)).toBeNull()
    expect(formatoDeRuta("medio/x/RUT/a.exe")).toBeNull()
    expect(formatoDeRuta("medio/x/RUT/sin-extension")).toBeNull()
  })
})

describe("aDocumentoCargado", () => {
  it("convierte la fila sin dejar viajar la ruta del objeto", () => {
    const documento = aDocumentoCargado(FILA)
    expect(documento).toEqual({
      id: FILA.id,
      tipo: "CEDULA_FRENTE",
      estado: "RECHAZADO",
      metodo: "ARCHIVO",
      observaciones: "La foto está borrosa.",
      venceEl: null,
      cargadoAt: FILA.created_at,
      revisadoAt: FILA.validado_at,
      formato: "image/webp",
    })
    expect(JSON.stringify(documento)).not.toContain(MEDIO)
  })

  it("una videollamada no tiene archivo ni formato", () => {
    expect(
      aDocumentoCargado({
        ...FILA,
        tipo: "PRUEBA_VIDA",
        estado_validacion: "APROBADO",
        metodo: "VIDEOLLAMADA",
        archivo_path: null,
      })
    ).toMatchObject({ metodo: "VIDEOLLAMADA", formato: null })
  })

  it("observaciones en blanco quedan en null y un método desconocido es ARCHIVO", () => {
    expect(
      aDocumentoCargado({ ...FILA, observaciones: "   ", metodo: "OTRO" })
    ).toMatchObject({ observaciones: null, metodo: "ARCHIVO" })
  })
})

describe("aRequisitosNiveles", () => {
  it("ordena los niveles válidos y descarta los que están fuera de rango", () => {
    const filas: FilaNivel[] = [
      {
        nivel: 2,
        nombre: "Persona natural con RUT",
        requisitos: ["RUT actualizado"],
        documentos_requeridos: ["RUT"],
      },
      { nivel: 9, nombre: "Raro", requisitos: [], documentos_requeridos: [] },
      {
        nivel: 1,
        nombre: "Persona natural informal",
        requisitos: [],
        documentos_requeridos: ["CEDULA_FRENTE"],
      },
    ]
    expect(aRequisitosNiveles(filas)).toEqual([
      {
        nivel: 1,
        nombre: "Persona natural informal",
        requisitos: [],
        documentos: ["CEDULA_FRENTE"],
      },
      {
        nivel: 2,
        nombre: "Persona natural con RUT",
        requisitos: ["RUT actualizado"],
        documentos: ["RUT"],
      },
    ])
  })
})

describe("aPerfilTributario", () => {
  it("sin fila privada no hay nada declarado", () => {
    expect(aPerfilTributario(null)).toEqual({
      metodoPago: null,
      datosPagoCambiadosAt: null,
      tipoDocumento: null,
      esDeclarante: false,
      obligadoFacturar: false,
      responsableIva: false,
    })
  })

  it("toma solo lo que decide los documentos exigidos", () => {
    expect(
      aPerfilTributario({
        metodo_pago: "BILLETERA",
        datos_pago_cambiados_at: "2026-10-20T12:00:00+00:00",
        tipo_documento: "CC",
        es_declarante: true,
        obligado_facturar: false,
        responsable_iva: true,
      })
    ).toEqual({
      metodoPago: "BILLETERA",
      datosPagoCambiadosAt: "2026-10-20T12:00:00+00:00",
      tipoDocumento: "CC",
      esDeclarante: true,
      obligadoFacturar: false,
      responsableIva: true,
    })
  })
})

describe("aMedioDocumentos", () => {
  it("renombra las columnas del medio", () => {
    expect(
      aMedioDocumentos({
        id: MEDIO,
        nombre: "Radio Pasto",
        estado: "PENDIENTE",
        nivel_verificacion: 0,
        enviado_verificacion_at: null,
      })
    ).toEqual({
      id: MEDIO,
      nombre: "Radio Pasto",
      estado: "PENDIENTE",
      nivel: 0,
      enviadoVerificacionAt: null,
    })
  })
})
