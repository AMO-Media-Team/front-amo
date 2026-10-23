import { createSerializer } from "nuqs/server"
import { describe, expect, it } from "vitest"

import {
  cargarFiltrosMarketplace,
  desplazamientoDe,
  diasPublicacion,
  FILTROS_LIMPIOS,
  FILTROS_POR_DEFECTO,
  hayFiltros,
  paginaValida,
  parsersMarketplace,
  plataformaDeUrl,
  plataformaParaUrl,
  rutaMarketplace,
  soloPlataforma,
  TAMANO_PAGINA_MARKETPLACE,
  ultimaPagina,
} from "./filtros"

const SECTOR = "01a16693-72fe-713c-a45a-70d759c08300"
const ANUNCIANTE = "01a16693-72fe-713c-a45a-70d759c08200"

describe("filtros del marketplace en la URL", () => {
  it("sin parámetros quedan los valores por defecto", async () => {
    expect(await cargarFiltrosMarketplace(Promise.resolve({}))).toEqual(
      FILTROS_POR_DEFECTO
    )
  })

  it("lee plataforma, orden, rechazadas y página", async () => {
    expect(
      await cargarFiltrosMarketplace(
        Promise.resolve({
          plataforma: "tiktok",
          orden: "pago",
          rechazadas: "true",
          pagina: "3",
        })
      )
    ).toEqual({
      ...FILTROS_POR_DEFECTO,
      plataforma: "tiktok",
      orden: "pago",
      rechazadas: true,
      pagina: 3,
    })
  })

  it("lee sector, anunciante y días de publicación (MED-008)", async () => {
    expect(
      await cargarFiltrosMarketplace(
        Promise.resolve({
          sector: SECTOR.toUpperCase(),
          anunciante: ANUNCIANTE,
          desde: "2026-10-26",
          hasta: "2026-11-01",
        })
      )
    ).toEqual({
      ...FILTROS_POR_DEFECTO,
      sector: SECTOR,
      anunciante: ANUNCIANTE,
      desde: "2026-10-26",
      hasta: "2026-11-01",
    })
  })

  it("ignora valores que no conoce", async () => {
    expect(
      await cargarFiltrosMarketplace(
        Promise.resolve({
          plataforma: "myspace",
          orden: "precio",
          sector: "alimentos",
          anunciante: "1; drop",
          desde: "2026-02-30",
          hasta: "mañana",
        })
      )
    ).toEqual(FILTROS_POR_DEFECTO)
  })

  it("un rango de días escrito al revés se consulta al derecho", () => {
    expect(
      diasPublicacion({ desde: "2026-11-01", hasta: "2026-10-26" })
    ).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" })
    expect(diasPublicacion({ desde: "2026-10-26", hasta: null })).toEqual({
      desde: "2026-10-26",
      hasta: null,
    })
  })

  it("la ruta omite lo que está por defecto, igual que nuqs", () => {
    const serializar = createSerializer(parsersMarketplace)
    expect(rutaMarketplace()).toBe("/ofertas")
    expect(rutaMarketplace({ pagina: 1, orden: "fecha" })).toBe("/ofertas")
    expect(
      rutaMarketplace({ plataforma: "instagram", orden: "pago", pagina: 2 })
    ).toBe("/ofertas?plataforma=instagram&orden=pago&pagina=2")
    expect(rutaMarketplace({ rechazadas: true })).toBe(
      serializar("/ofertas", { rechazadas: true })
    )
    const todos = {
      plataforma: "facebook",
      sector: SECTOR,
      anunciante: ANUNCIANTE,
      desde: "2026-10-26",
      hasta: "2026-11-01",
      orden: "pago",
      pagina: 2,
    } as const
    expect(rutaMarketplace(todos)).toBe(serializar("/ofertas", todos))
  })

  it("pagina en bloques del tamaño de página", () => {
    expect(desplazamientoDe(1)).toBe(0)
    expect(desplazamientoDe(3)).toBe(2 * TAMANO_PAGINA_MARKETPLACE)
    expect(desplazamientoDe(-4)).toBe(0)
    expect(paginaValida(Number.NaN)).toBe(1)
    expect(paginaValida(2.7)).toBe(2)
    expect(ultimaPagina(0)).toBe(1)
    expect(ultimaPagina(TAMANO_PAGINA_MARKETPLACE)).toBe(1)
    expect(ultimaPagina(TAMANO_PAGINA_MARKETPLACE + 1)).toBe(2)
  })

  it("traduce la plataforma entre la URL y la BD", () => {
    expect(plataformaDeUrl("facebook")).toBe("FACEBOOK")
    expect(plataformaDeUrl(null)).toBeNull()
    expect(plataformaParaUrl("TIKTOK")).toBe("tiktok")
  })

  it("todos menos el orden reducen (o cambian) el listado", () => {
    expect(hayFiltros(FILTROS_POR_DEFECTO)).toBe(false)
    expect(hayFiltros({ ...FILTROS_POR_DEFECTO, orden: "pago" })).toBe(false)
    expect(hayFiltros({ ...FILTROS_POR_DEFECTO, pagina: 3 })).toBe(false)
    for (const cambio of [
      { plataforma: "tiktok" },
      { rechazadas: true },
      { sector: SECTOR },
      { anunciante: ANUNCIANTE },
      { desde: "2026-10-26" },
      { hasta: "2026-11-01" },
    ] as const) {
      expect(hayFiltros({ ...FILTROS_POR_DEFECTO, ...cambio })).toBe(true)
    }
  })

  it("«solo la plataforma» decide el texto del estado vacío", () => {
    const tiktok = { ...FILTROS_POR_DEFECTO, plataforma: "tiktok" } as const
    expect(soloPlataforma(tiktok)).toBe(true)
    expect(soloPlataforma({ ...tiktok, orden: "pago" })).toBe(true)
    expect(soloPlataforma({ ...tiktok, sector: SECTOR })).toBe(false)
    expect(soloPlataforma({ ...tiktok, desde: "2026-10-26" })).toBe(false)
    expect(soloPlataforma(FILTROS_POR_DEFECTO)).toBe(false)
  })

  it("«Limpiar filtros» quita todo menos el orden", () => {
    const serializar = createSerializer(parsersMarketplace)
    expect(
      serializar(
        "/ofertas?plataforma=tiktok&sector=x&anunciante=y&desde=2026-10-26&hasta=2026-11-01&rechazadas=true&orden=pago&pagina=2",
        FILTROS_LIMPIOS
      )
    ).toBe("/ofertas?orden=pago")
  })
})
