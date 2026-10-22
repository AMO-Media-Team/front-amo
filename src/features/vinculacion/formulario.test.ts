import { describe, expect, it } from "vitest"

import { camposConError, esCampoSolicitud } from "./formulario"

describe("esCampoSolicitud", () => {
  it("reconoce los campos del formulario", () => {
    for (const campo of [
      "nombreMedio",
      "tipo",
      "municipioCodigo",
      "cuentas",
      "contactoNombre",
      "email",
      "celular",
      "mensaje",
      "autorizaDatos",
    ]) {
      expect(esCampoSolicitud(campo)).toBe(true)
    }
  })

  it("reconoce los campos de cada cuenta dentro del máximo", () => {
    expect(esCampoSolicitud("cuentas.0.usuario")).toBe(true)
    expect(esCampoSolicitud("cuentas.5.seguidores")).toBe(true)
    expect(esCampoSolicitud("cuentas.2.plataforma")).toBe(true)
    expect(esCampoSolicitud("cuentas.6.usuario")).toBe(false)
    expect(esCampoSolicitud("cuentas.0.handle")).toBe(false)
  })

  it("no acepta el campo trampa ni rutas desconocidas", () => {
    expect(esCampoSolicitud("sitioWeb")).toBe(false)
    expect(esCampoSolicitud("ip_hash")).toBe(false)
    expect(esCampoSolicitud("")).toBe(false)
    expect(esCampoSolicitud("cuentas.")).toBe(false)
  })
})

describe("camposConError", () => {
  it("devuelve solo las rutas que son campos del formulario", () => {
    expect(
      camposConError({
        municipioCodigo: ["Elige un municipio habilitado en AMO."],
        "cuentas.1.usuario": ["Ya agregaste esta cuenta."],
        otro: ["Algo"],
      })
    ).toEqual(["municipioCodigo", "cuentas.1.usuario"])
  })

  it("sin errores de campo devuelve una lista vacía", () => {
    expect(camposConError(undefined)).toEqual([])
    expect(camposConError({})).toEqual([])
  })
})
