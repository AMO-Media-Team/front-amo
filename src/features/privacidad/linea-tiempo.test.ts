import { describe, expect, it } from "vitest"

import { construirLineaTiempo, type RegistroBitacora } from "./linea-tiempo"

const TITULAR = "05bed220-c8b8-4250-b2f4-9c70efa71a95"
const ADMIN = "9dc2eaff-0c4e-4095-9c62-45c6c75cd302"

const HITOS = {
  recibidaAt: "2026-10-24T18:39:12Z",
  plazoVence: "2026-11-27",
  enTramiteAt: "2026-10-25T14:00:00Z",
  requeridaAt: null,
  informacionAt: null,
  prorrogadaAt: "2026-10-26T14:00:00Z",
  respondidaAt: null,
  decision: null,
  desistidaAt: null,
  supresionEjecutadaAt: null,
}

function registro(
  id: number,
  cambios: Partial<RegistroBitacora>
): RegistroBitacora {
  return {
    id,
    at: `2026-10-2${id}T15:00:00Z`,
    accion: "TRANSICION",
    estadoAnterior: null,
    estadoNuevo: null,
    actorId: ADMIN,
    actorEmail: "e***@amo.test",
    actorRol: "ADMIN",
    cambios: {},
    ...cambios,
  }
}

describe("construirLineaTiempo con la bitácora", () => {
  it("narra el alta, el trámite, la prórroga, el requerimiento, la respuesta y la supresión", () => {
    const { eventos, soloHitos } = construirLineaTiempo(HITOS, [
      registro(6, {
        accion: "UPDATE",
        estadoAnterior: "RESPONDIDA",
        estadoNuevo: "RESPONDIDA",
        cambios: {
          supresion_ejecutada_at: {
            antes: null,
            despues: "2026-10-26T15:00:00Z",
          },
        },
      }),
      registro(1, {
        accion: "INSERT",
        estadoNuevo: "RADICADA",
        actorId: TITULAR,
        actorRol: "MEDIO",
        cambios: { plazo_vence: "2026-11-17", descripcion: "••••vor." },
      }),
      registro(2, { estadoAnterior: "RADICADA", estadoNuevo: "EN_TRAMITE" }),
      registro(3, {
        accion: "UPDATE",
        estadoAnterior: "EN_TRAMITE",
        estadoNuevo: "EN_TRAMITE",
        cambios: {
          plazo_vence: { antes: "2026-11-17", despues: "2026-11-27" },
          prorrogada_at: { antes: null, despues: "2026-10-23T15:00:00Z" },
        },
      }),
      registro(4, {
        estadoAnterior: "EN_TRAMITE",
        estadoNuevo: "REQUIERE_INFORMACION",
      }),
      registro(5, {
        estadoAnterior: "REQUIERE_INFORMACION",
        estadoNuevo: "EN_TRAMITE",
        actorId: TITULAR,
        actorRol: "MEDIO",
        cambios: {
          plazo_vence: { antes: "2026-11-27", despues: "2026-12-04" },
        },
      }),
    ])
    expect(soloHitos).toBe(false)
    expect(eventos.map((evento) => evento.tipo)).toEqual([
      "radicada",
      "tramite",
      "prorrogada",
      "requerida",
      "aportada",
      "supresion",
    ])
    expect(eventos[0]).toMatchObject({
      actor: "Titular",
      detalle: expect.stringMatching(/^Plazo legal hasta el 17 de nov/),
    })
    expect(eventos[1].actor).toBe("Equipo AMO · e***@amo.test")
    expect(eventos[2].detalle).toMatch(/27 de nov/)
    expect(eventos[4].detalle).toMatch(/vence el 4 de dic/)
  })

  it("una prórroga desde Radicada deja el paso a trámite y la prórroga", () => {
    const { eventos } = construirLineaTiempo(HITOS, [
      registro(1, {
        estadoAnterior: "RADICADA",
        estadoNuevo: "EN_TRAMITE",
        cambios: {
          estado: { antes: "RADICADA", despues: "EN_TRAMITE" },
          prorrogada_at: { antes: null, despues: "2026-10-21T15:00:00Z" },
        },
      }),
    ])
    expect(eventos.map((evento) => evento.tipo)).toEqual([
      "tramite",
      "prorrogada",
    ])
  })

  it("nombra la decisión y distingue el desistimiento propio del automático", () => {
    const { eventos } = construirLineaTiempo(HITOS, [
      registro(1, {
        estadoAnterior: "EN_TRAMITE",
        estadoNuevo: "RESPONDIDA",
        cambios: { decision: { antes: null, despues: "PROCEDE_PARCIAL" } },
      }),
      registro(2, {
        estadoAnterior: "REQUIERE_INFORMACION",
        estadoNuevo: "DESISTIDA",
        actorId: null,
        actorEmail: null,
        actorRol: null,
      }),
    ])
    expect(eventos[0].titulo).toBe("Respondida: procede en parte")
    expect(eventos[1]).toMatchObject({
      actor: "Sistema",
      detalle: "El titular no respondió el requerimiento en el plazo legal.",
    })
  })
})

describe("construirLineaTiempo sin bitácora", () => {
  it("usa los hitos de la solicitud, en orden", () => {
    const { eventos, soloHitos } = construirLineaTiempo(HITOS, [])
    expect(soloHitos).toBe(true)
    expect(eventos.map((evento) => evento.tipo)).toEqual([
      "radicada",
      "tramite",
      "prorrogada",
    ])
    expect(eventos[2].detalle).toMatch(/27 de nov/)
  })
})
