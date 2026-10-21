import { describe, expect, it } from "vitest"

import { argumentosListado, estadoTablaUsuarios } from "./estado-tabla"

const ROL = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b"

describe("estadoTablaUsuarios", () => {
  it("ordena por fecha de creación descendente y 20 filas por defecto", () => {
    expect(estadoTablaUsuarios.cargar("")).toMatchObject({
      orden: { campo: "creado", descendente: true },
      tamano: 20,
      pagina: 1,
    })
  })

  it("solo acepta estados, tipos y campos de orden conocidos", () => {
    const estado = estadoTablaUsuarios.cargar(
      "?estado=ACTIVO,BORRADO&tipo=MEDIO,ROOT&orden=password.asc&mfa=CON,QUIZA"
    )
    expect(estado.estado).toEqual(["ACTIVO"])
    expect(estado.tipo).toEqual(["MEDIO"])
    expect(estado.mfa).toEqual(["CON"])
    expect(estado.orden.campo).toBe("creado")
  })
})

describe("argumentosListado", () => {
  it("sin filtros solo envía orden y paginación", () => {
    expect(
      argumentosListado(estadoTablaUsuarios.cargar("?pagina=3&tamano=50"))
    ).toEqual({
      p_orden: "creado",
      p_descendente: true,
      p_limite: 50,
      p_desplazamiento: 100,
    })
  })

  it("traduce búsqueda, filtros y orden", () => {
    const estado = estadoTablaUsuarios.cargar(
      `?q=gomez&estado=ACTIVO,SUSPENDIDO&rol=${ROL}&tipo=ADMIN&mfa=SIN&orden=ultimo_acceso.asc`
    )
    expect(argumentosListado(estado)).toEqual({
      p_busqueda: "gomez",
      p_estados: ["ACTIVO", "SUSPENDIDO"],
      p_roles: [ROL],
      p_tipos: ["ADMIN"],
      p_mfa: false,
      p_orden: "ultimo_acceso",
      p_descendente: false,
      p_limite: 20,
      p_desplazamiento: 0,
    })
  })

  it("con y sin MFA a la vez no filtra", () => {
    const estado = estadoTablaUsuarios.cargar("?mfa=CON,SIN")
    expect(argumentosListado(estado)).not.toHaveProperty("p_mfa")
  })
})
