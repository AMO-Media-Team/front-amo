import { describe, expect, it } from "vitest"

import { CLAVES_CATEGORIA } from "@/features/notificaciones/presentacion"

import {
  CATEGORIAS_CORREO_OBLIGATORIAS,
  CATEGORIAS_CORREO_POR_TIPO,
  CATEGORIAS_SILENCIABLES,
  esquemaCambiosPreferencias,
  esSilenciable,
  fusionarPreferencias,
  leerPreferencias,
  normalizarSilenciadas,
  PREFERENCIAS_POR_DEFECTO,
} from "./preferencias"

describe("leerPreferencias", () => {
  it("usa los valores por defecto sin preferencias guardadas", () => {
    expect(leerPreferencias({})).toEqual(PREFERENCIAS_POR_DEFECTO)
    expect(leerPreferencias(null)).toEqual(PREFERENCIAS_POR_DEFECTO)
    expect(leerPreferencias([1, 2])).toEqual(PREFERENCIAS_POR_DEFECTO)
  })

  it("respeta las válidas e ignora las desconocidas o corruptas", () => {
    expect(
      leerPreferencias({
        tema: "light",
        densidad: "enorme",
        movimiento: "reducido",
        formatoNumeros: 7,
        otroModulo: { avisos: true },
      })
    ).toEqual({
      tema: "light",
      densidad: "normal",
      movimiento: "reducido",
      formatoNumeros: "colombia",
      correoSilenciadas: [],
    })
  })

  it("lee las categorías silenciadas de correo.silenciadas", () => {
    expect(
      leerPreferencias({
        correo: { silenciadas: ["pagos", "ofertas", "pagos", "seguridad", 4] },
      }).correoSilenciadas
    ).toEqual(["ofertas", "pagos"])
    expect(
      leerPreferencias({ correo: { silenciadas: "ofertas" } }).correoSilenciadas
    ).toEqual([])
    expect(leerPreferencias({ correo: [] }).correoSilenciadas).toEqual([])
  })
})

describe("fusionarPreferencias", () => {
  it("conserva las claves de otros módulos", () => {
    expect(
      fusionarPreferencias(
        { tema: "dark", otroModulo: { avisos: true } },
        { tema: "system" }
      )
    ).toEqual({ tema: "system", otroModulo: { avisos: true } })
  })

  it("guarda las silenciadas en correo.silenciadas sin perder lo demás del correo", () => {
    expect(
      fusionarPreferencias(
        { tema: "light", correo: { otra: true, silenciadas: ["ofertas"] } },
        { correoSilenciadas: ["disputas", "ofertas", "disputas"] }
      )
    ).toEqual({
      tema: "light",
      correo: { otra: true, silenciadas: ["ofertas", "disputas"] },
    })
    expect(
      fusionarPreferencias({ tema: "dark" }, { correoSilenciadas: [] })
    ).toEqual({ tema: "dark", correo: { silenciadas: [] } })
  })

  it("no toca el correo si el cambio no lo incluye", () => {
    expect(
      fusionarPreferencias(
        { correo: { silenciadas: ["pagos"] } },
        { densidad: "comoda" }
      )
    ).toEqual({ densidad: "comoda", correo: { silenciadas: ["pagos"] } })
  })

  it("parte de un objeto vacío si lo guardado no es un objeto", () => {
    expect(fusionarPreferencias("x", { densidad: "compacta" })).toEqual({
      densidad: "compacta",
    })
  })
})

describe("esquemaCambiosPreferencias", () => {
  it("acepta cambios parciales válidos", () => {
    expect(
      esquemaCambiosPreferencias.safeParse({ formatoNumeros: "internacional" })
        .success
    ).toBe(true)
  })

  it("rechaza valores fuera de catálogo, claves extra y cambios vacíos", () => {
    expect(esquemaCambiosPreferencias.safeParse({ tema: "rosa" }).success).toBe(
      false
    )
    expect(
      esquemaCambiosPreferencias.safeParse({ tema: "dark", admin: true })
        .success
    ).toBe(false)
    expect(esquemaCambiosPreferencias.safeParse({}).success).toBe(false)
  })

  it("acepta silenciar categorías, pero nunca seguridad ni privacidad", () => {
    expect(
      esquemaCambiosPreferencias.safeParse({
        correoSilenciadas: ["ofertas", "pendientes"],
      }).success
    ).toBe(true)
    for (const obligatoria of CATEGORIAS_CORREO_OBLIGATORIAS) {
      expect(
        esquemaCambiosPreferencias.safeParse({
          correoSilenciadas: [obligatoria],
        }).success
      ).toBe(false)
    }
    expect(
      esquemaCambiosPreferencias.safeParse({ correoSilenciadas: ["otras"] })
        .success
    ).toBe(false)
  })
})

describe("categorías de correo", () => {
  it("las silenciables son todas menos seguridad y privacidad", () => {
    expect(
      [...CATEGORIAS_SILENCIABLES, ...CATEGORIAS_CORREO_OBLIGATORIAS].toSorted()
    ).toEqual([...CLAVES_CATEGORIA].toSorted())
    expect(esSilenciable("ofertas")).toBe(true)
    expect(esSilenciable("seguridad")).toBe(false)
  })

  it("cada tipo de rol ve categorías del catálogo, con las obligatorias", () => {
    for (const categorias of Object.values(CATEGORIAS_CORREO_POR_TIPO)) {
      for (const clave of categorias) {
        expect(CLAVES_CATEGORIA).toContain(clave)
      }
      for (const obligatoria of CATEGORIAS_CORREO_OBLIGATORIAS) {
        expect(categorias).toContain(obligatoria)
      }
    }
    expect(CATEGORIAS_CORREO_POR_TIPO.ADMIN).toContain("pendientes")
    expect(CATEGORIAS_CORREO_POR_TIPO.MEDIO).not.toContain("pendientes")
    expect(CATEGORIAS_CORREO_POR_TIPO.ANUNCIANTE).not.toContain("cuentas")
  })

  it("normalizarSilenciadas ordena, quita repetidas y descarta lo ajeno", () => {
    expect(
      normalizarSilenciadas(["pagos", "x", "ofertas", "privacidad", "pagos"])
    ).toEqual(["ofertas", "pagos"])
    expect(normalizarSilenciadas(null)).toEqual([])
  })
})
