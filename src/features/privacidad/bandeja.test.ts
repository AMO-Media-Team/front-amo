import { describe, expect, it } from "vitest"

import {
  estadoTablaSolicitudes,
  filtroVencimiento,
  radicadoBuscado,
  rutaBandeja,
  destinoReclamos,
  rutaReclamosAbiertos,
} from "./bandeja"

const HOY = "2026-11-10"

describe("filtroVencimiento", () => {
  it("traduce cada semáforo a su condición sobre las fechas", () => {
    expect(filtroVencimiento(["vencida"], HOY)).toBe(
      "plazo_vence.lt.2026-11-10"
    )
    expect(filtroVencimiento(["hoy"], HOY)).toBe("plazo_vence.eq.2026-11-10")
    expect(filtroVencimiento(["por_vencer"], HOY)).toBe(
      "and(alerta_desde.lte.2026-11-10,plazo_vence.gt.2026-11-10)"
    )
    expect(filtroVencimiento(["en_plazo"], HOY)).toBe(
      "alerta_desde.gt.2026-11-10"
    )
  })

  it("une varios en el orden del semáforo y sin ninguno no filtra", () => {
    expect(filtroVencimiento(["en_plazo", "vencida"], HOY)).toBe(
      "plazo_vence.lt.2026-11-10,alerta_desde.gt.2026-11-10"
    )
    expect(filtroVencimiento([], HOY)).toBeNull()
  })

  it("no acepta un día con otra forma (iría a la URL de PostgREST)", () => {
    expect(() => filtroVencimiento(["hoy"], "2026-11-10,estado.eq.x")).toThrow()
  })
})

describe("radicadoBuscado", () => {
  it("reconoce el radicado con o sin prefijo", () => {
    expect(radicadoBuscado("41")).toBe(41)
    expect(radicadoBuscado("N.º 41")).toBe(41)
    expect(radicadoBuscado("n 41")).toBe(41)
    expect(radicadoBuscado("#41")).toBe(41)
  })

  it("lo demás es búsqueda por titular", () => {
    expect(radicadoBuscado("ana")).toBeNull()
    expect(radicadoBuscado("0")).toBeNull()
    expect(radicadoBuscado("")).toBeNull()
  })
})

describe("estado de la bandeja en la URL", () => {
  it("lee estado, tipo y vencimiento con los parsers compartidos (descarta lo desconocido)", async () => {
    const estado = await estadoTablaSolicitudes.cargar(
      Promise.resolve({
        estado: "RADICADA,EN_TRAMITE",
        tipo: "SUPRESION",
        vence: "vencida,hoy,otra",
      })
    )
    expect(estado.estado).toEqual(["RADICADA", "EN_TRAMITE"])
    expect(estado.tipo).toEqual(["SUPRESION"])
    expect(estado.vence).toEqual(["vencida", "hoy"])
    expect(estado.orden).toEqual({ campo: "estado", descendente: false })
  })

  it("enlaza a la bandeja por semáforo", () => {
    expect(rutaBandeja(["vencida", "hoy"])).toBe(
      "/administracion/privacidad?vence=vencida,hoy"
    )
    expect(rutaBandeja()).toBe("/administracion/privacidad")
  })

  it("enlaza a los reclamos abiertos, de un titular si se indica", async () => {
    const ruta = rutaReclamosAbiertos("Ana María")
    const [camino, consulta = ""] = ruta.split("?")
    expect(camino).toBe("/administracion/privacidad")
    const estado = await estadoTablaSolicitudes.cargar(
      Promise.resolve(Object.fromEntries(new URLSearchParams(consulta)))
    )
    expect(estado.estado).toEqual([
      "RADICADA",
      "EN_TRAMITE",
      "REQUIERE_INFORMACION",
    ])
    expect(estado.tipo).toEqual([
      "ACTUALIZACION",
      "RECTIFICACION",
      "SUPRESION",
      "REVOCATORIA",
    ])
    expect(estado.q).toBe("Ana María")
    expect(rutaReclamosAbiertos(null)).not.toMatch(/[?&]q=/)
  })

  it("«Reclamo en trámite» va a la ficha si hay uno y a la bandeja si hay varios", () => {
    const ana = { perfilId: "p-ana", titular: "Ana" }
    expect(destinoReclamos([{ id: "s-1", ...ana }])).toBe(
      "/administracion/privacidad/s-1"
    )
    expect(
      destinoReclamos([
        { id: "s-1", ...ana },
        { id: "s-2", ...ana },
      ])
    ).toBe(rutaReclamosAbiertos("Ana"))
    expect(
      destinoReclamos([
        { id: "s-1", ...ana },
        { id: "s-2", perfilId: "p-luis", titular: "Luis" },
      ])
    ).toBe(rutaReclamosAbiertos(null))
  })
})
