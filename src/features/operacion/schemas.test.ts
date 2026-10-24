import { describe, expect, it } from "vitest"

import {
  esquemaCancelarAsignacion,
  esquemaEvidencias,
  esquemaExportacion,
  esquemaRevelar,
} from "./schemas"

const ID = "0192f0a1-7b2c-7d3e-8f40-123456789abc"

describe("esquemaEvidencias", () => {
  it("solo acepta el id de la asignación: las rutas las deriva el servidor", () => {
    expect(esquemaEvidencias.safeParse({ asignacionId: ID }).success).toBe(true)
    expect(
      esquemaEvidencias.safeParse({ asignacionId: "asignacion/x" }).success
    ).toBe(false)
    const conRuta = esquemaEvidencias.parse({
      asignacionId: ID,
      ruta: "muestras/1.webp",
    })
    expect(conRuta).toEqual({ asignacionId: ID })
  })
})

describe("esquemaRevelar", () => {
  it("no deja elegir tabla ni campos desde el cliente", () => {
    const entrada = esquemaRevelar.parse({
      entidad: "medio",
      id: ID,
      grupo: "pago",
      tabla: "perfiles_privado",
      campos: ["datos_pago_cifrados"],
    })
    expect(entrada).toEqual({ entidad: "medio", id: ID, grupo: "pago" })
    expect(
      esquemaRevelar.safeParse({ entidad: "perfil", id: ID, grupo: "contacto" })
        .success
    ).toBe(false)
  })
})

describe("esquemaExportacion", () => {
  it("acepta los cuatro listados en CSV o Excel", () => {
    for (const entidad of [
      "medios",
      "anunciantes",
      "campanas",
      "asignaciones",
    ]) {
      expect(
        esquemaExportacion.safeParse({ entidad, formato: "csv", filas: 20 })
          .success
      ).toBe(true)
    }
    expect(
      esquemaExportacion.safeParse({
        entidad: "medios",
        formato: "xlsx",
        filas: 0,
      }).success
    ).toBe(true)
  })

  it("rechaza entidades, formatos o conteos fuera de lo esperado", () => {
    const base = { entidad: "medios", formato: "csv", filas: 10 }
    expect(
      esquemaExportacion.safeParse({ ...base, entidad: "bitacora" }).success
    ).toBe(false)
    expect(
      esquemaExportacion.safeParse({ ...base, formato: "pdf" }).success
    ).toBe(false)
    expect(esquemaExportacion.safeParse({ ...base, filas: -1 }).success).toBe(
      false
    )
    expect(esquemaExportacion.safeParse({ ...base, filas: 2.5 }).success).toBe(
      false
    )
    expect(
      esquemaExportacion.safeParse({ ...base, filas: 10_001 }).success
    ).toBe(false)
  })
})

describe("esquemaCancelarAsignacion", () => {
  const BASE = {
    asignacionId: ID,
    estadoVisto: "PUBLICADA",
    causa: "ADMINISTRATIVA",
    motivo: "  La oferta tenía un error de configuración.  ",
  } as const

  it("exige causa del catálogo y motivo; recorta y no suspende por omisión", () => {
    expect(esquemaCancelarAsignacion.parse(BASE)).toEqual({
      ...BASE,
      motivo: "La oferta tenía un error de configuración.",
      suspenderMedio: false,
    })
    const sinCausa = esquemaCancelarAsignacion.safeParse({
      ...BASE,
      causa: "OTRA",
    })
    expect(sinCausa.error?.issues[0]?.message).toBe(
      "Elige la causa de la cancelación."
    )
    const corto = esquemaCancelarAsignacion.safeParse({ ...BASE, motivo: "no" })
    expect(corto.error?.issues[0]?.path).toEqual(["motivo"])
  })

  it("la suspensión solo acompaña al fraude o al incumplimiento del medio", () => {
    const administrativa = esquemaCancelarAsignacion.safeParse({
      ...BASE,
      suspenderMedio: true,
    })
    expect(administrativa.error?.issues[0]?.path).toEqual(["suspenderMedio"])
    for (const causa of ["FRAUDE", "INCUMPLIMIENTO_MEDIO"] as const) {
      expect(
        esquemaCancelarAsignacion.safeParse({
          ...BASE,
          causa,
          suspenderMedio: true,
        }).success
      ).toBe(true)
    }
  })
})
