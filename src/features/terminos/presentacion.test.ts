import { describe, expect, it } from "vitest"

import type { TerminoPendiente } from "@/lib/auth/compuertas"

import {
  documentosPorAceptar,
  encabezadoTerminos,
  textoFaltan,
  textoProgreso,
  textoVigencia,
} from "./presentacion"

function termino(
  tipo: TerminoPendiente["tipo"],
  extra: Partial<TerminoPendiente> = {}
): TerminoPendiente {
  return {
    id: `id-${tipo}`,
    tipo,
    version: "1.0",
    // Medianoche en Bogotá (UTC−5): no debe correrse al día anterior.
    vigenteDesde: "2026-10-22T05:00:00+00:00",
    hashSha256: "ab".repeat(32),
    contenidoMd: "Texto",
    ...extra,
  }
}

describe("textoVigencia", () => {
  it("muestra la versión y la fecha larga en hora de Bogotá", () => {
    expect(textoVigencia("2.1", "2026-10-22T05:00:00+00:00")).toBe(
      "Versión 2.1 · vigente desde el 22 de octubre de 2026"
    )
  })
})

describe("documentosPorAceptar", () => {
  it("ordena: términos del portal, política de datos y condiciones", () => {
    const documentos = documentosPorAceptar(
      [
        termino("CONDICIONES_COMERCIALES"),
        termino("POLITICA_DATOS"),
        termino("TERMINOS_MEDIO"),
      ],
      new Set()
    )
    expect(documentos.map((d) => d.tipo)).toEqual([
      "TERMINOS_MEDIO",
      "POLITICA_DATOS",
      "CONDICIONES_COMERCIALES",
    ])
  })

  it("arma el título, los textos de aceptación y la vigencia de cada uno", () => {
    const [politica] = documentosPorAceptar(
      [termino("POLITICA_DATOS", { version: "3" })],
      new Set()
    )
    expect(politica).toEqual({
      id: "id-POLITICA_DATOS",
      tipo: "POLITICA_DATOS",
      titulo: "Política de tratamiento de datos",
      resumen: expect.stringContaining("Ley 1581 de 2012"),
      aceptacion:
        "He leído la política y autorizo el tratamiento de mis datos personales.",
      accion: "Autorizo el tratamiento",
      vigencia: "Versión 3 · vigente desde el 22 de octubre de 2026",
      actualizado: false,
    })
  })

  it("marca como actualizado lo que ya había aceptado en otra versión", () => {
    const documentos = documentosPorAceptar(
      [termino("TERMINOS_ANUNCIANTE"), termino("POLITICA_DATOS")],
      new Set(["TERMINOS_ANUNCIANTE" as const])
    )
    expect(documentos.map((d) => [d.tipo, d.actualizado])).toEqual([
      ["TERMINOS_ANUNCIANTE", true],
      ["POLITICA_DATOS", false],
    ])
  })

  it("no modifica la lista recibida", () => {
    const terminos = [termino("POLITICA_DATOS"), termino("TERMINOS_MEDIO")]
    documentosPorAceptar(terminos, new Set())
    expect(terminos.map((t) => t.tipo)).toEqual([
      "POLITICA_DATOS",
      "TERMINOS_MEDIO",
    ])
  })
})

describe("encabezadoTerminos", () => {
  it("la primera vez pide revisar y aceptar", () => {
    expect(
      encabezadoTerminos([{ actualizado: false }, { actualizado: true }])
    ).toEqual({
      titulo: "Revisa y acepta los términos",
      descripcion: expect.stringContaining("Para usar AMO"),
    })
  })

  it("si todo son versiones nuevas, explica que se actualizaron", () => {
    expect(encabezadoTerminos([{ actualizado: true }])).toEqual({
      titulo: "Actualizamos los términos",
      descripcion:
        "Publicamos una versión nueva de un documento que ya habías aceptado. Léela y acéptala para seguir usando AMO.",
    })
    expect(
      encabezadoTerminos([{ actualizado: true }, { actualizado: true }])
        .descripcion
    ).toBe(
      "Publicamos versiones nuevas de 2 documentos que ya habías aceptado. Léelas y acéptalas para seguir usando AMO."
    )
  })
})

describe("textos de progreso", () => {
  it("cuenta lo aceptado", () => {
    expect(textoProgreso(0, 3)).toBe("0 de 3 aceptados")
    expect(textoProgreso(2, 3)).toBe("2 de 3 aceptados")
    expect(textoProgreso(3, 3)).toBe("Los 3 aceptados")
  })

  it("dice cuántos faltan, en singular o plural", () => {
    expect(textoFaltan(1)).toBe("Te falta aceptar 1 documento para continuar.")
    expect(textoFaltan(2)).toBe(
      "Te faltan 2 documentos por aceptar para continuar."
    )
  })
})
