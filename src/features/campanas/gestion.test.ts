import { describe, expect, it } from "vitest"

import {
  exigeEmpresaPropia,
  filtrarAnunciantes,
  normalizarBusqueda,
  notaVerificacionAsistida,
  PERMISOS_GESTION_CAMPANAS,
  PERMISOS_GESTION_OFERTAS,
  puedeGestionarCampanasAsistidas,
  puedeGestionarOfertasAsistidas,
  tieneTodos,
} from "./gestion"

describe("permisos de la gestión", () => {
  it("las acciones aceptan el permiso del anunciante o el del equipo AMO", () => {
    expect(PERMISOS_GESTION_CAMPANAS).toEqual([
      "campanas.gestionar_propias",
      "campanas.gestionar",
    ])
    expect(PERMISOS_GESTION_OFERTAS).toEqual([
      "ofertas.gestionar_propias",
      "ofertas.gestionar",
    ])
  })

  it("las pantallas asistidas exigen todos sus permisos", () => {
    const operaciones = [
      "campanas.gestionar",
      "campanas.ver",
      "anunciantes.ver",
      "ofertas.gestionar",
      "ofertas.ver",
    ]
    expect(puedeGestionarCampanasAsistidas(operaciones)).toBe(true)
    expect(puedeGestionarOfertasAsistidas(operaciones)).toBe(true)
    // Sin `campanas.ver` la campaña recién creada no se podría leer.
    expect(
      puedeGestionarCampanasAsistidas(["campanas.gestionar", "anunciantes.ver"])
    ).toBe(false)
    expect(
      puedeGestionarOfertasAsistidas(["ofertas.gestionar", "ofertas.ver"])
    ).toBe(false)
    // El anunciante no gestiona por cuenta de otros.
    expect(
      puedeGestionarCampanasAsistidas([
        "campanas.gestionar_propias",
        "campanas.ver",
        "anunciantes.ver",
      ])
    ).toBe(false)
  })

  it("tieneTodos con una lista vacía es verdadero", () => {
    expect(tieneTodos([], [])).toBe(true)
  })

  it("solo al anunciante se le exige empresa propia", () => {
    expect(exigeEmpresaPropia({ rol: { tipo: "ANUNCIANTE" } })).toBe(true)
    expect(exigeEmpresaPropia({ rol: { tipo: "ADMIN" } })).toBe(false)
    expect(exigeEmpresaPropia({ rol: { tipo: "MEDIO" } })).toBe(false)
  })
})

describe("selector de anunciante", () => {
  const opciones = [
    { id: "1", nombre: "Café Sierra Alta", estado: "VERIFICADO" as const },
    { id: "2", nombre: "Ferretería El Tornillo", estado: "PENDIENTE" as const },
    { id: "3", nombre: "Sierra Muebles", estado: "SUSPENDIDO" as const },
  ]

  it("normaliza tildes, mayúsculas y espacios", () => {
    expect(normalizarBusqueda("  CAFÉ   Sierra ")).toBe("cafe sierra")
  })

  it("sin texto devuelve todos; con texto, los que tienen cada palabra", () => {
    expect(filtrarAnunciantes(opciones, " ")).toHaveLength(3)
    expect(filtrarAnunciantes(opciones, "sierra").map((o) => o.id)).toEqual([
      "1",
      "3",
    ])
    expect(filtrarAnunciantes(opciones, "cafe alta").map((o) => o.id)).toEqual([
      "1",
    ])
    expect(filtrarAnunciantes(opciones, "ferreteria")[0]?.id).toBe("2")
    expect(filtrarAnunciantes(opciones, "nada")).toEqual([])
  })

  it("la nota de verificación solo aparece si la empresa no está verificada", () => {
    expect(notaVerificacionAsistida("VERIFICADO")).toBeNull()
    for (const estado of ["PENDIENTE", "RECHAZADO", "SUSPENDIDO"] as const) {
      expect(notaVerificacionAsistida(estado)).toBe(
        "Puedes preparar borradores; activar y enviar a revisión exige la empresa verificada."
      )
    }
  })
})
