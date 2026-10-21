import { describe, expect, it } from "vitest"

import { cargarEstadoMapa } from "./estado-url"
import { rutaExplorador } from "./rutas"

const PERIODO = { desde: "2026-09-01", hasta: "2026-09-30" }

describe("rutaExplorador", () => {
  it("sin destino es el explorador tal cual", () => {
    expect(rutaExplorador()).toBe("/analitica/mapa")
  })

  it("abre un departamento con la métrica y el periodo de quien enlaza", () => {
    expect(
      rutaExplorador({ departamento: "05", metrica: "gmv", periodo: PERIODO })
    ).toBe(
      "/analitica/mapa?metrica=gmv&nivel=departamental&depto=05&desde=2026-09-01&hasta=2026-09-30"
    )
  })

  it.each(["11", "88"])(
    "el departamento %s no tiene nivel municipal: queda en Colombia con su métrica",
    (departamento) => {
      expect(rutaExplorador({ departamento, metrica: "medios" })).toBe(
        "/analitica/mapa?metrica=medios"
      )
    }
  )

  it("puede abrir el mapa del mundo", () => {
    expect(
      rutaExplorador({
        nivel: "internacional",
        metrica: "accesos",
        periodo: PERIODO,
      })
    ).toBe(
      "/analitica/mapa?metrica=accesos&nivel=internacional&desde=2026-09-01&hasta=2026-09-30"
    )
  })

  it("no escribe niveles que la URL no necesita o no puede cumplir", () => {
    expect(rutaExplorador({ nivel: "nacional", metrica: "gmv" })).toBe(
      "/analitica/mapa?metrica=gmv"
    )
    // Departamental sin departamento volvería a Colombia: se omite.
    expect(rutaExplorador({ nivel: "departamental" })).toBe("/analitica/mapa")
  })

  it("el explorador lee de vuelta exactamente lo que se enlazó", async () => {
    const ruta = rutaExplorador({
      departamento: "76",
      metrica: "alcance",
      periodo: PERIODO,
    })
    const consulta = Object.fromEntries(
      new URL(ruta, "http://amo.local").searchParams
    )
    expect(await cargarEstadoMapa(Promise.resolve(consulta))).toMatchObject({
      nivel: "departamental",
      depto: "76",
      metrica: "alcance",
      desde: "2026-09-01",
      hasta: "2026-09-30",
    })
  })
})
