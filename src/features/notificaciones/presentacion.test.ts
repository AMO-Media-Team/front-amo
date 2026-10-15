import { describe, expect, it } from "vitest"

import { esquemaFiltros, esquemaMarcar } from "./esquemas"
import {
  agruparPorDia,
  aNotificacion,
  categoriaDe,
  etiquetaCategoria,
  filtroCategoria,
} from "./presentacion"
import type { Notificacion } from "./tipos"

const fila = {
  id: 7,
  tipo: "oferta.nueva_elegible",
  titulo: "Nueva oferta",
  mensaje: "Hay una oferta para tu medio.",
  url: "/operacion/campanas/abc",
  prioridad: 1,
  leida: false,
  created_at: "2026-09-30T15:00:00Z",
}

describe("categoriaDe", () => {
  it("agrupa por el prefijo de la plantilla", () => {
    expect(categoriaDe("oferta.devuelta")).toBe("ofertas")
    expect(categoriaDe("creativo.actualizado")).toBe("ofertas")
    expect(categoriaDe("metricas.rechazadas")).toBe("ejecucion")
    expect(categoriaDe("liquidacion.pagada")).toBe("pagos")
    expect(categoriaDe("seguridad.pais_inusual")).toBe("seguridad")
    expect(categoriaDe("algo.nuevo")).toBe("otras")
  })

  it("da un nombre visible a cada categoría", () => {
    expect(etiquetaCategoria("liquidacion.pagada")).toBe("Pagos y tarifas")
    expect(etiquetaCategoria("desconocida")).toBe("General")
  })

  it("arma el filtro OR de PostgREST", () => {
    expect(filtroCategoria("ejecucion")).toBe(
      "tipo.like.evidencia.%,tipo.like.metricas.%"
    )
  })
})

describe("aNotificacion", () => {
  it("convierte la prioridad y conserva las rutas internas", () => {
    expect(aNotificacion(fila)).toMatchObject({
      id: 7,
      prioridad: "importante",
      url: "/operacion/campanas/abc",
    })
    expect(aNotificacion({ ...fila, prioridad: 2 }).prioridad).toBe("urgente")
    expect(aNotificacion({ ...fila, prioridad: 0 }).prioridad).toBe("normal")
  })

  it("descarta enlaces externos o de protocolo relativo", () => {
    expect(aNotificacion({ ...fila, url: "https://evil.test" }).url).toBeNull()
    expect(aNotificacion({ ...fila, url: "//evil.test/x" }).url).toBeNull()
    expect(aNotificacion({ ...fila, url: null }).url).toBeNull()
  })
})

describe("agruparPorDia", () => {
  // 30 sep 2026, 10:00 en Bogotá (15:00 UTC).
  const ahora = new Date("2026-09-30T15:00:00Z")
  const con = (id: number, creadaAt: string): Notificacion => ({
    ...aNotificacion(fila),
    id,
    creadaAt,
  })

  it("usa el día civil de Bogotá (el servidor corre en UTC)", () => {
    const grupos = agruparPorDia(
      [
        con(1, "2026-09-30T06:00:00Z"), // 1:00 a. m. del 30 en Bogotá → hoy
        con(2, "2026-09-30T04:00:00Z"), // 11:00 p. m. del 29 en Bogotá → ayer
        con(3, "2026-09-26T12:00:00Z"),
        con(4, "2026-08-01T12:00:00Z"),
      ],
      ahora
    )
    expect(
      grupos.map((g) => [g.clave, g.notificaciones.map((n) => n.id)])
    ).toEqual([
      ["hoy", [1]],
      ["ayer", [2]],
      ["semana", [3]],
      ["anteriores", [4]],
    ])
  })

  it("omite los grupos vacíos", () => {
    expect(agruparPorDia([con(1, "2026-09-30T14:00:00Z")], ahora)).toHaveLength(
      1
    )
    expect(agruparPorDia([], ahora)).toEqual([])
  })
})

describe("esquemas de acciones", () => {
  it("valida filtros y lotes de ids", () => {
    expect(
      esquemaFiltros.safeParse({ estado: "no_leidas", categoria: null }).success
    ).toBe(true)
    expect(
      esquemaFiltros.safeParse({ estado: "otra", categoria: null }).success
    ).toBe(false)
    expect(esquemaMarcar.safeParse({ ids: [], leida: true }).success).toBe(
      false
    )
    expect(esquemaMarcar.safeParse({ ids: [1, 2], leida: false }).success).toBe(
      true
    )
  })
})
