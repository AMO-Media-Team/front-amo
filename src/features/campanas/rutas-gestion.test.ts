import { describe, expect, it } from "vitest"

import {
  EMPRESA_SIN_NOMBRE,
  esAsistido,
  GESTION_PROPIA,
  type ModoGestion,
  modoAsistido,
  nombreConocido,
  rutaEditarCampanaAsistida,
  rutaEditarOfertaAsistida,
  rutaNuevaCampanaAsistida,
  rutasGestion,
} from "./rutas-gestion"

const CAMPANA = "0199f3a0-0000-7000-8000-00000000ca01"
const OFERTA = "0199f3a0-0000-7000-8000-0000000000f1"
const ANUNCIANTE = "e2e00000-0000-4000-8000-00000000a001"

const ASISTIDO: ModoGestion = {
  modo: "asistido",
  anuncianteId: ANUNCIANTE,
  anunciante: "Anunciante E2E",
}

describe("rutasGestion · el anunciante con lo suyo", () => {
  const rutas = rutasGestion(GESTION_PROPIA)

  it("son las rutas de «Mis campañas» (contrato con /ir)", () => {
    expect(rutas.listado).toBe("/campanas")
    expect(rutas.campana(CAMPANA)).toBe(`/campanas/${CAMPANA}`)
    expect(rutas.ofertasCampana(CAMPANA)).toBe(
      `/campanas/${CAMPANA}?pestana=ofertas`
    )
    expect(rutas.editarCampana(CAMPANA)).toBe(`/campanas/${CAMPANA}/editar`)
    expect(rutas.oferta(CAMPANA, OFERTA)).toBe(
      `/campanas/${CAMPANA}/ofertas/${OFERTA}`
    )
    expect(rutas.empresa).toBe("/empresa")
  })

  it("el asistente cuelga de la campaña", () => {
    expect(rutas.asistente(CAMPANA)).toBe(`/campanas/${CAMPANA}/ofertas/nueva`)
    expect(rutas.asistente(CAMPANA, OFERTA)).toBe(
      `/campanas/${CAMPANA}/ofertas/${OFERTA}/editar`
    )
    expect(rutas.continuarAsistente(CAMPANA, [OFERTA], "cuanto")).toBe(
      `/campanas/${CAMPANA}/ofertas/nueva?ofertas=${OFERTA}&paso=cuanto`
    )
    expect(rutas.pasoAsistente(CAMPANA, OFERTA, "creativo")).toBe(
      `/campanas/${CAMPANA}/ofertas/${OFERTA}/editar?paso=creativo`
    )
  })
})

describe("rutasGestion · el equipo AMO por cuenta del anunciante", () => {
  const rutas = rutasGestion(ASISTIDO)

  it("las fichas son las internas de Operación", () => {
    expect(rutas.listado).toBe("/operacion/campanas")
    expect(rutas.campana(CAMPANA)).toBe(`/operacion/campanas/${CAMPANA}`)
    // «Ofertas» es la primera pestaña de la ficha interna.
    expect(rutas.ofertasCampana(CAMPANA)).toBe(`/operacion/campanas/${CAMPANA}`)
    expect(rutas.oferta(CAMPANA, OFERTA)).toBe(`/operacion/ofertas/${OFERTA}`)
    expect(rutas.empresa).toBe(`/operacion/anunciantes/${ANUNCIANTE}`)
  })

  it("editar y el asistente tienen sus rutas asistidas", () => {
    expect(rutas.editarCampana(CAMPANA)).toBe(
      `/operacion/campanas/${CAMPANA}/editar`
    )
    expect(rutas.asistente(CAMPANA)).toBe(
      `/operacion/campanas/${CAMPANA}/ofertas/nueva`
    )
    // La edición cuelga de la oferta: su campaña la dice la BD.
    expect(rutas.asistente(CAMPANA, OFERTA)).toBe(
      `/operacion/ofertas/${OFERTA}/editar`
    )
    expect(rutas.pasoAsistente(CAMPANA, OFERTA, "creativo")).toBe(
      `/operacion/ofertas/${OFERTA}/editar?paso=creativo`
    )
  })

  it("continuar el asistente conserva los borradores y el paso", () => {
    expect(rutas.continuarAsistente(CAMPANA, [OFERTA, CAMPANA], "envio")).toBe(
      `/operacion/campanas/${CAMPANA}/ofertas/nueva?ofertas=${OFERTA},${CAMPANA}&paso=envio`
    )
    expect(rutas.continuarAsistente(CAMPANA, [])).toBe(
      `/operacion/campanas/${CAMPANA}/ofertas/nueva`
    )
  })
})

describe("rutas propias de la gestión asistida", () => {
  it("el alta lleva el anunciante preseleccionado si se conoce", () => {
    expect(rutaNuevaCampanaAsistida()).toBe("/operacion/campanas/nueva")
    expect(rutaNuevaCampanaAsistida(ANUNCIANTE)).toBe(
      `/operacion/campanas/nueva?anunciante=${ANUNCIANTE}`
    )
  })

  it("editar la campaña y la oferta", () => {
    expect(rutaEditarCampanaAsistida(CAMPANA)).toBe(
      `/operacion/campanas/${CAMPANA}/editar`
    )
    expect(rutaEditarOfertaAsistida(OFERTA)).toBe(
      `/operacion/ofertas/${OFERTA}/editar`
    )
  })

  it("esAsistido distingue los modos", () => {
    expect(esAsistido(ASISTIDO)).toBe(true)
    expect(esAsistido(GESTION_PROPIA)).toBe(false)
  })
})

describe("modoAsistido · el nombre de la empresa", () => {
  it("usa el nombre comercial cuando se puede leer", () => {
    expect(modoAsistido(ANUNCIANTE, "Anunciante E2E")).toEqual(ASISTIDO)
    expect(nombreConocido("Anunciante E2E")).toBe(true)
  })

  it("sin nombre (la RLS oculta la empresa) la nombra «la empresa»", () => {
    for (const nombre of [null, undefined, "", "   "]) {
      const gestion = modoAsistido(ANUNCIANTE, nombre)
      expect(gestion.anunciante).toBe(EMPRESA_SIN_NOMBRE)
      expect(gestion.anuncianteId).toBe(ANUNCIANTE)
      expect(nombreConocido(gestion.anunciante)).toBe(false)
    }
  })

  it("el genérico concuerda con las plantillas («de la», «a la», no «de el»)", () => {
    const { anunciante } = modoAsistido(ANUNCIANTE, null)
    expect(`Estás actuando por cuenta de ${anunciante}.`).toBe(
      "Estás actuando por cuenta de la empresa."
    )
    expect(`cuando AMO verifique a ${anunciante}.`).toBe(
      "cuando AMO verifique a la empresa."
    )
  })
})
