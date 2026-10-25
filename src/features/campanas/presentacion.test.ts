import { describe, expect, it } from "vitest"

import {
  conteosDeOfertas,
  contarPorEstado,
  diasEntre,
  duracionVigencia,
  motivoSinActivar,
  presentarSituacionEmpresa,
  textoFase,
  totalOfertas,
} from "./presentacion"

describe("conteo de ofertas por estado", () => {
  it("cuenta por estado y lista primero lo que pide atención, en singular o plural", () => {
    const porEstado = contarPorEstado([
      { estado: "PUBLICADA" },
      { estado: "PUBLICADA" },
      { estado: "DEVUELTA" },
      { estado: "BORRADOR" },
      { estado: "CERRADA" },
    ])
    expect(porEstado).toEqual({
      PUBLICADA: 2,
      DEVUELTA: 1,
      BORRADOR: 1,
      CERRADA: 1,
    })
    expect(totalOfertas(porEstado)).toBe(5)
    expect(conteosDeOfertas(porEstado).map((conteo) => conteo.texto)).toEqual([
      "1 devuelta",
      "1 en borrador",
      "2 publicadas",
      "1 cerrada",
    ])
  })

  it("los estados invariables no cambian en plural y los vacíos no aparecen", () => {
    const conteos = conteosDeOfertas({
      EN_REVISION: 3,
      EN_EJECUCION: 2,
      CANCELADA: 0,
    })
    expect(conteos.map((conteo) => conteo.texto)).toEqual([
      "3 en revisión",
      "2 en ejecución",
    ])
    expect(conteos[0].tono).toBe("aviso")
    expect(conteosDeOfertas({})).toEqual([])
  })
})

describe("situación de la empresa", () => {
  it("una empresa verificada no necesita aviso", () => {
    expect(
      presentarSituacionEmpresa({
        estado: "VERIFICADO",
        motivo: null,
        enviadaAt: null,
      })
    ).toBeNull()
    expect(motivoSinActivar("VERIFICADO")).toBe("")
  })

  it("pendiente sin enviar invita a completar la empresa", () => {
    const aviso = presentarSituacionEmpresa({
      estado: "PENDIENTE",
      motivo: null,
      enviadaAt: null,
    })
    expect(aviso?.titulo).toBe("Verifica tu empresa para activar campañas")
    expect(aviso?.tono).toBe("aviso")
    expect(aviso?.accion).toEqual({
      texto: "Completar mi empresa",
      href: "/empresa",
    })
  })

  it("pendiente y enviada dice desde cuándo está en revisión", () => {
    const aviso = presentarSituacionEmpresa({
      estado: "PENDIENTE",
      motivo: null,
      enviadaAt: "2026-10-20T15:00:00Z",
    })
    expect(aviso?.titulo).toBe("Estamos verificando tu empresa")
    expect(aviso?.descripcion).toContain("20 de octubre de 2026")
    expect(aviso?.tono).toBe("info")
  })

  it("rechazada o suspendida muestra el motivo del equipo AMO", () => {
    const rechazada = presentarSituacionEmpresa({
      estado: "RECHAZADO",
      motivo: "  El NIT no coincide con el RUT.  ",
      enviadaAt: "2026-10-20T15:00:00Z",
    })
    expect(rechazada?.motivo).toBe("El NIT no coincide con el RUT.")
    expect(rechazada?.accion.texto).toBe("Corregir y reenviar")
    const suspendida = presentarSituacionEmpresa({
      estado: "SUSPENDIDO",
      motivo: "",
      enviadaAt: null,
    })
    expect(suspendida?.titulo).toBe("Tu empresa está suspendida")
    expect(suspendida?.motivo).toBeNull()
  })

  it("explica por qué no se puede activar según el estado", () => {
    expect(motivoSinActivar("PENDIENTE")).toBe(
      "Podrás activarla cuando AMO verifique tu empresa."
    )
    expect(motivoSinActivar("RECHAZADO")).toMatch(/corrijas los datos/)
    expect(motivoSinActivar("SUSPENDIDO")).toMatch(/suspendida/)
  })

  it("al equipo AMO que actúa por cuenta del anunciante le habla de «la empresa»", () => {
    expect(motivoSinActivar("VERIFICADO", "asistido")).toBe("")
    expect(motivoSinActivar("PENDIENTE", "asistido")).toBe(
      "Se podrá activar cuando AMO verifique la empresa."
    )
    expect(motivoSinActivar("RECHAZADO", "asistido")).toMatch(
      /la empresa corrija sus datos/
    )
    expect(motivoSinActivar("SUSPENDIDO", "asistido")).toBe(
      "La empresa está suspendida: sus campañas no se pueden activar."
    )
  })
})

describe("vigencia", () => {
  const activa = (fechaInicio: string, fechaFin: string) => ({
    estado: "ACTIVA" as const,
    fechaInicio,
    fechaFin,
  })

  it("cuenta días de calendario sin depender de la zona del servidor", () => {
    expect(diasEntre("2026-10-22", "2026-10-25")).toBe(3)
    expect(diasEntre("2026-10-25", "2026-10-22")).toBe(-3)
    expect(duracionVigencia("2026-11-01", "2026-11-30")).toBe("30 días")
    expect(duracionVigencia("2026-11-01", "2026-11-01")).toBe("1 día")
  })

  it("describe la fase de una campaña activa", () => {
    expect(textoFase(activa("2026-10-23", "2026-11-30"), "2026-10-22")).toEqual(
      { texto: "Empieza mañana", tono: "info" }
    )
    expect(
      textoFase(activa("2026-10-27", "2026-11-30"), "2026-10-22")?.texto
    ).toBe("Empieza en 5 días")
    expect(
      textoFase(activa("2026-10-01", "2026-10-31"), "2026-10-22")?.texto
    ).toBe("En curso · faltan 9 días")
    expect(
      textoFase(activa("2026-10-01", "2026-10-23"), "2026-10-22")?.texto
    ).toBe("En curso · falta 1 día")
    expect(textoFase(activa("2026-10-01", "2026-10-22"), "2026-10-22")).toEqual(
      { texto: "Último día", tono: "aviso" }
    )
    expect(
      textoFase(activa("2026-09-01", "2026-09-30"), "2026-10-22")?.texto
    ).toBe("Vigencia terminada")
  })

  it("en otros estados la fase no se muestra", () => {
    expect(
      textoFase(
        {
          estado: "BORRADOR",
          fechaInicio: "2026-10-01",
          fechaFin: "2026-10-31",
        },
        "2026-10-22"
      )
    ).toBeNull()
  })
})
