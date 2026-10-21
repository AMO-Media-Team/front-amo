import { describe, expect, it } from "vitest"

import { detalleAnunciante, filtroAnunciantes } from "./busqueda"

describe("filtroAnunciantes", () => {
  it("busca por nombre sin tildes ni mayúsculas (como `nombre_normalizado`)", () => {
    expect(filtroAnunciantes("Lácteos  Monteverde")).toEqual({
      nombre: "%lacteos%monteverde%",
      nit: null,
    })
    expect(filtroAnunciantes("lact").nombre).toBe("%lact%")
  })

  it("sin texto no filtra", () => {
    expect(filtroAnunciantes("  ")).toEqual({ nombre: null, nit: null })
  })

  it("el NIT es buscable desde 4 dígitos, con o sin puntos", () => {
    expect(filtroAnunciantes("900.115.838").nit).toBe("900115838")
    expect(filtroAnunciantes("900").nit).toBeNull()
  })

  it("el patrón no lleva caracteres con significado en un `or` de PostgREST", () => {
    const { nombre } = filtroAnunciantes('a,b(c)"d*')
    expect(nombre).toBe("%a%b%c%d%")
  })
})

describe("detalleAnunciante", () => {
  const anunciante = {
    nombre_comercial: "Almacenes El Faro",
    razon_social: "Almacenes El Faro S.A.",
    nit: "900115838",
    digito_verificacion: "7",
  }

  it("muestra el NIT completo con su dígito (dato público de la empresa)", () => {
    expect(detalleAnunciante(anunciante)).toBe("NIT 900.115.838-7")
  })

  it("sin NIT (anunciante extranjero) usa la razón social si aporta algo", () => {
    const extranjero = { ...anunciante, nit: null, digito_verificacion: null }
    expect(detalleAnunciante(extranjero)).toBe("Almacenes El Faro S.A.")
    expect(
      detalleAnunciante({ ...extranjero, razon_social: "Almacenes El Faro" })
    ).toBeNull()
  })
})
