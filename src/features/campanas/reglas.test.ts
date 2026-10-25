import { describe, expect, it } from "vitest"

import {
  accionesCampana,
  limitesFechas,
  ofertasPorAtender,
  ordenarOfertas,
  presupuestoMinimo,
  puedeArchivarCampana,
  puedeCrearOfertas,
  puedeEditarCampana,
} from "./reglas"
import type { EstadoOferta } from "./tipos"

const PERMISOS_ANUNCIANTE = [
  "campanas.gestionar_propias",
  "ofertas.gestionar_propias",
]

describe("accionesCampana", () => {
  it("un borrador de empresa verificada se activa o se archiva sin motivo", () => {
    expect(
      accionesCampana({
        estado: "BORRADOR",
        tipoActor: "ANUNCIANTE",
        permisos: PERMISOS_ANUNCIANTE,
        estadoEmpresa: "VERIFICADO",
      })
    ).toEqual([
      { accion: "activar", requiereMotivo: false, bloqueo: null },
      { accion: "archivar", requiereMotivo: false, bloqueo: null },
    ])
  })

  it("con la empresa sin verificar, activar queda bloqueado y explicado", () => {
    const [activar] = accionesCampana({
      estado: "BORRADOR",
      tipoActor: "ANUNCIANTE",
      permisos: PERMISOS_ANUNCIANTE,
      estadoEmpresa: "PENDIENTE",
    })
    expect(activar).toEqual({
      accion: "activar",
      requiereMotivo: false,
      bloqueo: "Podrás activarla cuando AMO verifique tu empresa.",
    })
  })

  it("una activa solo se cancela, con motivo; una cancelada o finalizada solo se archiva", () => {
    expect(
      accionesCampana({
        estado: "ACTIVA",
        tipoActor: "ANUNCIANTE",
        permisos: PERMISOS_ANUNCIANTE,
        estadoEmpresa: "VERIFICADO",
      })
    ).toEqual([{ accion: "cancelar", requiereMotivo: true, bloqueo: null }])
    for (const estado of ["FINALIZADA", "CANCELADA"] as const) {
      expect(
        accionesCampana({
          estado,
          tipoActor: "ANUNCIANTE",
          permisos: PERMISOS_ANUNCIANTE,
          estadoEmpresa: "VERIFICADO",
        })
      ).toEqual([{ accion: "archivar", requiereMotivo: false, bloqueo: null }])
    }
  })

  it("archiva quien puede según `archivar_campana_srv`", () => {
    expect(
      puedeArchivarCampana("CANCELADA", "ANUNCIANTE", PERMISOS_ANUNCIANTE)
    ).toBe(true)
    expect(
      puedeArchivarCampana("ACTIVA", "ANUNCIANTE", PERMISOS_ANUNCIANTE)
    ).toBe(false)
    expect(
      puedeArchivarCampana("FINALIZADA", "ADMIN", ["campanas.gestionar"])
    ).toBe(true)
    // El permiso del portal no le sirve a un interno, ni el interno al anunciante.
    expect(puedeArchivarCampana("BORRADOR", "ADMIN", PERMISOS_ANUNCIANTE)).toBe(
      false
    )
    expect(
      puedeArchivarCampana("BORRADOR", "ANUNCIANTE", ["campanas.gestionar"])
    ).toBe(false)
    expect(puedeArchivarCampana("BORRADOR", "MEDIO", PERMISOS_ANUNCIANTE)).toBe(
      false
    )
  })

  it("sin el permiso no se ofrece ningún cambio", () => {
    expect(
      accionesCampana({
        estado: "BORRADOR",
        tipoActor: "ANUNCIANTE",
        permisos: ["reportes.ver"],
        estadoEmpresa: "VERIFICADO",
      })
    ).toEqual([])
  })

  it("edición y ofertas nuevas solo en borrador o activa y con su permiso", () => {
    expect(
      puedeEditarCampana("BORRADOR", "ANUNCIANTE", PERMISOS_ANUNCIANTE)
    ).toBe(true)
    expect(
      puedeEditarCampana("ACTIVA", "ANUNCIANTE", PERMISOS_ANUNCIANTE)
    ).toBe(true)
    expect(
      puedeEditarCampana("CANCELADA", "ANUNCIANTE", PERMISOS_ANUNCIANTE)
    ).toBe(false)
    expect(
      puedeEditarCampana("ACTIVA", "ANUNCIANTE", ["ofertas.gestionar_propias"])
    ).toBe(false)
    expect(puedeCrearOfertas("ACTIVA", "ANUNCIANTE", PERMISOS_ANUNCIANTE)).toBe(
      true
    )
    expect(
      puedeCrearOfertas("FINALIZADA", "ANUNCIANTE", PERMISOS_ANUNCIANTE)
    ).toBe(false)
    expect(
      puedeCrearOfertas("BORRADOR", "ANUNCIANTE", [
        "campanas.gestionar_propias",
      ])
    ).toBe(false)
  })
})

describe("gestión asistida (ADM-014)", () => {
  const OPERACIONES = [
    "campanas.gestionar",
    "campanas.ver",
    "anunciantes.ver",
    "ofertas.gestionar",
    "ofertas.ver",
  ]

  it("el equipo AMO activa un borrador o lo archiva; cancelar una activa pide motivo", () => {
    expect(
      accionesCampana({
        estado: "BORRADOR",
        tipoActor: "ADMIN",
        permisos: OPERACIONES,
        estadoEmpresa: "VERIFICADO",
      })
    ).toEqual([
      { accion: "activar", requiereMotivo: false, bloqueo: null },
      { accion: "archivar", requiereMotivo: false, bloqueo: null },
    ])
    // El cierre manual (FINALIZADA) no se ofrece desde la ficha.
    expect(
      accionesCampana({
        estado: "ACTIVA",
        tipoActor: "ADMIN",
        permisos: OPERACIONES,
        estadoEmpresa: "VERIFICADO",
      })
    ).toEqual([{ accion: "cancelar", requiereMotivo: true, bloqueo: null }])
  })

  it("el bloqueo de activar habla de «la empresa»; sin poder leerla decide la BD", () => {
    const [activar] = accionesCampana({
      estado: "BORRADOR",
      tipoActor: "ADMIN",
      permisos: OPERACIONES,
      estadoEmpresa: "SUSPENDIDO",
    })
    expect(activar.bloqueo).toBe(
      "La empresa está suspendida: sus campañas no se pueden activar."
    )
    const [sinLeer] = accionesCampana({
      estado: "BORRADOR",
      tipoActor: "ADMIN",
      permisos: OPERACIONES,
      estadoEmpresa: null,
    })
    expect(sinLeer).toEqual({
      accion: "activar",
      requiereMotivo: false,
      bloqueo: null,
    })
  })

  it("el permiso del anunciante no sirve al equipo AMO ni al revés", () => {
    expect(
      accionesCampana({
        estado: "BORRADOR",
        tipoActor: "ADMIN",
        permisos: PERMISOS_ANUNCIANTE,
        estadoEmpresa: "VERIFICADO",
      })
    ).toEqual([])
    expect(puedeEditarCampana("ACTIVA", "ANUNCIANTE", OPERACIONES)).toBe(false)
  })

  it("editar y crear ofertas exigen todos los permisos de la pantalla asistida", () => {
    expect(puedeEditarCampana("ACTIVA", "ADMIN", OPERACIONES)).toBe(true)
    expect(puedeCrearOfertas("BORRADOR", "ADMIN", OPERACIONES)).toBe(true)
    expect(puedeCrearOfertas("CANCELADA", "ADMIN", OPERACIONES)).toBe(false)
    expect(
      puedeEditarCampana("ACTIVA", "ADMIN", [
        "campanas.gestionar",
        "campanas.ver",
      ])
    ).toBe(false)
    expect(
      puedeCrearOfertas("ACTIVA", "ADMIN", ["ofertas.gestionar", "ofertas.ver"])
    ).toBe(false)
    expect(puedeEditarCampana("ACTIVA", "MEDIO", OPERACIONES)).toBe(false)
  })
})

describe("presupuestoMinimo", () => {
  it("el mayor entre lo aceptado y lo que reservan las ofertas vivas", () => {
    expect(
      presupuestoMinimo({
        presupuestoTotal: 10_000_000,
        presupuestoComprometido: 1_000_000,
        disponible: 6_000_000,
      })
    ).toBe(4_000_000)
    expect(
      presupuestoMinimo({
        presupuestoTotal: 10_000_000,
        presupuestoComprometido: 3_000_000,
        disponible: 9_000_000,
      })
    ).toBe(3_000_000)
  })

  it("sin disponible conocido solo cuenta lo aceptado; nunca es negativo", () => {
    expect(
      presupuestoMinimo({
        presupuestoTotal: 5_000_000,
        presupuestoComprometido: 0,
        disponible: null,
      })
    ).toBe(0)
    expect(
      presupuestoMinimo({
        presupuestoTotal: 5_000_000,
        presupuestoComprometido: 0,
        disponible: 7_000_000,
      })
    ).toBe(0)
  })
})

describe("limitesFechas", () => {
  const oferta = (
    estado: EstadoOferta,
    ventanaInicio: string,
    ventanaFin: string
  ) => ({ estado, ventanaInicio, ventanaFin })

  it("toma la ventana más temprana y la más tardía de las ofertas vivas (días de Bogotá)", () => {
    expect(
      limitesFechas([
        // 00:00 del 1 de noviembre en Bogotá.
        oferta("PUBLICADA", "2026-11-01T05:00:00Z", "2026-11-20T15:00:00Z"),
        // 23:59 del 31 de octubre en Bogotá: ese día cuenta.
        oferta("EN_REVISION", "2026-11-01T04:59:00Z", "2026-11-10T15:00:00Z"),
        // Termina a medianoche del 30: cabe en el 29.
        oferta("EN_EJECUCION", "2026-11-05T15:00:00Z", "2026-11-30T05:00:00Z"),
      ])
    ).toEqual({ inicioMaximo: "2026-10-31", finMinimo: "2026-11-29" })
  })

  it("ignora borradores, devueltas y cerradas", () => {
    expect(
      limitesFechas([
        oferta("BORRADOR", "2026-11-01T05:00:00Z", "2026-11-20T15:00:00Z"),
        oferta("DEVUELTA", "2026-11-01T05:00:00Z", "2026-11-20T15:00:00Z"),
        oferta("CERRADA", "2026-11-01T05:00:00Z", "2026-11-20T15:00:00Z"),
      ])
    ).toEqual({ inicioMaximo: null, finMinimo: null })
  })
})

describe("ordenarOfertas", () => {
  it("devueltas y borradores primero; dentro del estado, la fecha límite más próxima", () => {
    const ordenadas = ordenarOfertas([
      { id: "a", estado: "PUBLICADA", fechaLimiteAceptacion: "2026-11-02" },
      { id: "b", estado: "DEVUELTA", fechaLimiteAceptacion: "2026-11-05" },
      { id: "c", estado: "BORRADOR", fechaLimiteAceptacion: "2026-11-09" },
      { id: "d", estado: "PUBLICADA", fechaLimiteAceptacion: "2026-11-01" },
      { id: "e", estado: "CANCELADA", fechaLimiteAceptacion: "2026-10-01" },
    ] as const)
    expect(ordenadas.map((oferta) => oferta.id)).toEqual([
      "b",
      "c",
      "d",
      "a",
      "e",
    ])
  })
})

describe("ofertasPorAtender", () => {
  const AHORA = new Date("2026-10-22T15:00:00Z")
  const base = {
    devueltaAt: null,
    actualizadaAt: "2026-10-20T15:00:00Z",
  }

  it("devueltas (la más reciente primero) y borradores con el plazo de envío encima", () => {
    const atenciones = ofertasPorAtender(
      [
        {
          ...base,
          id: "lejos",
          estado: "BORRADOR",
          fechaLimiteAceptacion: "2026-11-30T15:00:00Z",
        },
        {
          ...base,
          id: "pronto",
          estado: "BORRADOR",
          fechaLimiteAceptacion: "2026-10-24T15:00:00Z",
        },
        {
          ...base,
          id: "tarde",
          estado: "BORRADOR",
          fechaLimiteAceptacion: "2026-10-23T10:00:00Z",
        },
        {
          ...base,
          id: "dev-vieja",
          estado: "DEVUELTA",
          fechaLimiteAceptacion: "2026-11-30T15:00:00Z",
          devueltaAt: "2026-10-19T15:00:00Z",
        },
        {
          ...base,
          id: "dev-nueva",
          estado: "DEVUELTA",
          fechaLimiteAceptacion: "2026-11-30T15:00:00Z",
          devueltaAt: "2026-10-21T15:00:00Z",
        },
        {
          ...base,
          id: "publicada",
          estado: "PUBLICADA",
          fechaLimiteAceptacion: "2026-10-23T15:00:00Z",
        },
      ],
      { ahora: AHORA, anticipacionHoras: 24 }
    )
    expect(atenciones.map(({ oferta, motivo }) => [oferta.id, motivo])).toEqual(
      [
        ["dev-nueva", "devuelta"],
        ["dev-vieja", "devuelta"],
        ["tarde", "envio_vencido"],
        ["pronto", "envio_proximo"],
      ]
    )
    expect(atenciones[3].limiteEnvio).toBe("2026-10-23T15:00:00.000Z")
    expect(atenciones[0].limiteEnvio).toBeNull()
  })

  it("respeta la anticipación configurada y el margen de aviso", () => {
    const oferta = {
      ...base,
      estado: "BORRADOR" as const,
      fechaLimiteAceptacion: "2026-10-26T15:00:00Z",
    }
    expect(
      ofertasPorAtender([oferta], { ahora: AHORA, anticipacionHoras: 0 })
    ).toHaveLength(0)
    expect(
      ofertasPorAtender([oferta], {
        ahora: AHORA,
        anticipacionHoras: 0,
        horasAviso: 96,
      })[0]?.motivo
    ).toBe("envio_proximo")
  })
})
