import { describe, expect, it } from "vitest"

import {
  accionMedioNuevo,
  cambiosMedio,
  CUENTA_INSTAGRAM_E2E,
  describirAccionMedioNuevo,
  diferencia,
  type FilaBaseMedio,
  type FilaMedioNuevo,
  MEDIO_E2E,
  MEDIO_E2E_ID,
  MEDIO_NUEVO_E2E,
  MEDIO_NUEVO_E2E_ID,
} from "./medios-e2e"
import { ANUNCIANTE_E2E_ID } from "./organizacion"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const RECIEN_REGISTRADO: FilaMedioNuevo = {
  estado: "PENDIENTE",
  verificado_at: null,
  rechazado_at: null,
  suspendido_at: null,
  motivo_estado: null,
  deleted_at: null,
}

describe("ids y datos base", () => {
  it("los medios E2E tienen ids fijos, válidos y distintos de los demás fijos", () => {
    const ids = [MEDIO_E2E_ID, MEDIO_NUEVO_E2E_ID, ANUNCIANTE_E2E_ID]
    for (const id of ids) expect(id).toMatch(UUID)
    expect(new Set(ids).size).toBe(ids.length)
    expect(MEDIO_E2E.id).toBe(MEDIO_E2E_ID)
    expect(MEDIO_NUEVO_E2E.id).toBe(MEDIO_NUEVO_E2E_ID)
  })

  it("respetan los límites de la hoja «Registrar medio»", () => {
    for (const medio of [MEDIO_E2E, MEDIO_NUEVO_E2E]) {
      expect(medio.nombre.length).toBeGreaterThanOrEqual(2)
      expect(medio.nombre.length).toBeLessThanOrEqual(120)
      expect(medio.municipioPreferido).toMatch(/^\d{5}$/)
      expect((medio.descripcionAudiencia ?? "").length).toBeLessThanOrEqual(
        1000
      )
    }
  })

  it("el medio verificado tiene categoría; el nuevo, solo lo mínimo", () => {
    expect(MEDIO_E2E.categoria).not.toBeNull()
    expect(MEDIO_NUEVO_E2E.categoria).toBeNull()
    expect(MEDIO_NUEVO_E2E.descripcionAudiencia).toBeNull()
  })

  it("la cuenta de Instagram supera el umbral de 30.000 seguidores y su URL coincide con el usuario", () => {
    expect(CUENTA_INSTAGRAM_E2E.seguidores).toBe(40_000)
    expect(CUENTA_INSTAGRAM_E2E.seguidores).toBeGreaterThan(30_000)
    expect(CUENTA_INSTAGRAM_E2E.url).toBe(
      `https://www.instagram.com/${CUENTA_INSTAGRAM_E2E.handle}`
    )
  })
})

describe("accionMedioNuevo", () => {
  it("lo crea si no existe", () => {
    expect(accionMedioNuevo(null)).toBe("CREAR")
  })

  it("lo limpia si sigue recién registrado (aunque lo hayan enviado a verificación)", () => {
    expect(accionMedioNuevo(RECIEN_REGISTRADO)).toBe("LIMPIAR")
  })

  it.each<[string, Partial<FilaMedioNuevo>]>([
    [
      "verificado",
      { estado: "VERIFICADO", verificado_at: "2026-10-01T00:00:00Z" },
    ],
    [
      "rechazado",
      {
        estado: "RECHAZADO",
        rechazado_at: "2026-10-01T00:00:00Z",
        motivo_estado: "Faltan documentos",
      },
    ],
    [
      "suspendido",
      { estado: "SUSPENDIDO", suspendido_at: "2026-10-01T00:00:00Z" },
    ],
    ["borrado", { deleted_at: "2026-10-01T00:00:00Z" }],
    // Rechazado y reenviado: vuelve a PENDIENTE pero ya pasó por una decisión.
    [
      "reenviado tras un rechazo",
      {
        rechazado_at: "2026-10-01T00:00:00Z",
        motivo_estado: "Faltan documentos",
      },
    ],
    ["verificado y luego degradado", { verificado_at: "2026-10-01T00:00:00Z" }],
  ])("lo registra de nuevo si fue %s", (_caso, cambios) => {
    expect(accionMedioNuevo({ ...RECIEN_REGISTRADO, ...cambios })).toBe(
      "RECREAR"
    )
  })
})

describe("describirAccionMedioNuevo", () => {
  it("describe cada acción en palabras", () => {
    for (const accion of ["CREAR", "LIMPIAR", "RECREAR"] as const) {
      expect(describirAccionMedioNuevo(accion)).toMatch(/\p{L}{4,}/u)
    }
    expect(describirAccionMedioNuevo("CREAR")).toContain("PENDIENTE")
  })
})

describe("diferencia", () => {
  it("dice qué agregar y qué quitar", () => {
    expect(diferencia(["a", "b"], ["b", "c"])).toEqual({
      agregar: ["c"],
      quitar: ["a"],
    })
  })

  it("no hace nada si ya coinciden (sin importar el orden ni los repetidos)", () => {
    expect(diferencia(["b", "a", "a"], ["a", "b"])).toEqual({
      agregar: [],
      quitar: [],
    })
  })

  it("vaciar y llenar", () => {
    expect(diferencia(["a"], [])).toEqual({ agregar: [], quitar: ["a"] })
    expect(diferencia([], ["a", "a"])).toEqual({ agregar: ["a"], quitar: [] })
  })
})

describe("cambiosMedio", () => {
  const fila: FilaBaseMedio = {
    nombre: MEDIO_E2E.nombre,
    tipo: MEDIO_E2E.tipo,
    municipio_codigo: "05001",
    descripcion_audiencia: MEDIO_E2E.descripcionAudiencia,
    deleted_at: null,
  }

  it("no escribe nada si la fila ya tiene los datos base", () => {
    expect(cambiosMedio(fila, MEDIO_E2E, "05001")).toBeNull()
  })

  it("devuelve solo las columnas que una prueba cambió", () => {
    expect(
      cambiosMedio(
        { ...fila, nombre: "Medio E2E editado", descripcion_audiencia: null },
        MEDIO_E2E,
        "05001"
      )
    ).toEqual({
      nombre: MEDIO_E2E.nombre,
      descripcion_audiencia: MEDIO_E2E.descripcionAudiencia,
    })
  })

  it("usa el municipio activo que se resolvió, no el preferido", () => {
    expect(cambiosMedio(fila, MEDIO_E2E, "05088")).toEqual({
      municipio_codigo: "05088",
    })
  })

  it("restaura un medio borrado", () => {
    expect(
      cambiosMedio(
        { ...fila, deleted_at: "2026-10-01T00:00:00Z" },
        MEDIO_E2E,
        "05001"
      )
    ).toEqual({ deleted_at: null })
  })
})
