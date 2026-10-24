import { describe, expect, it } from "vitest"

import {
  destinoDe,
  ENTIDADES_ENLACE,
  enlaceNotificacion,
  esEntidadEnlace,
} from "./destinos"

const ID = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a01"
const PADRE = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a99"

const interno = (permisos: string[] = []) =>
  ({ tipoRol: "ADMIN", permisos }) as const
const medio = { tipoRol: "MEDIO", permisos: [] } as const
const anunciante = { tipoRol: "ANUNCIANTE", permisos: [] } as const

describe("destinoDe · equipo AMO", () => {
  it("lleva cada entidad a su ficha de operación", () => {
    expect(destinoDe("medios", ID, interno())).toBe(`/operacion/medios/${ID}`)
    expect(destinoDe("anunciantes", ID, interno())).toBe(
      `/operacion/anunciantes/${ID}`
    )
    expect(destinoDe("campanas", ID, interno())).toBe(
      `/operacion/campanas/${ID}`
    )
    expect(destinoDe("asignaciones", ID, interno())).toBe(
      `/operacion/asignaciones/${ID}`
    )
  })

  it("las filas hijas van a la ficha de su padre", () => {
    expect(destinoDe("metricas", ID, interno(), { asignacionId: PADRE })).toBe(
      `/operacion/asignaciones/${PADRE}`
    )
    expect(destinoDe("ofertas", ID, interno(), { campanaId: PADRE })).toBe(
      `/operacion/campanas/${PADRE}`
    )
    expect(destinoDe("facturas", ID, interno(), { anuncianteId: PADRE })).toBe(
      `/operacion/anunciantes/${PADRE}?pestana=cartera`
    )
  })

  it("Finanzas abre la liquidación o la factura en su sección", () => {
    expect(
      destinoDe("liquidaciones", ID, interno(["liquidaciones.ver"]), {
        medioId: PADRE,
      })
    ).toBe(`/finanzas/liquidaciones/${ID}`)
    expect(destinoDe("liquidaciones", ID, interno(), { medioId: PADRE })).toBe(
      `/operacion/medios/${PADRE}`
    )
    expect(
      destinoDe("facturas", ID, interno(["facturas.ver"]), {
        anuncianteId: PADRE,
      })
    ).toBe(`/finanzas/facturas/${ID}`)
  })

  it("quien verifica abre el expediente del medio", () => {
    expect(destinoDe("medios", ID, interno(["medios.verificar"]))).toBe(
      `/operacion/medios/${ID}?pestana=verificacion`
    )
  })

  it("quien verifica va a la cola; quien solo consulta, a la ficha", () => {
    expect(
      destinoDe("documentos_medio", ID, interno(["medios.verificar"]), {
        medioId: PADRE,
      })
    ).toBe("/operacion/verificacion?cola=documentos")
    expect(
      destinoDe("documentos_medio", ID, interno(["medios.ver"]), {
        medioId: PADRE,
      })
    ).toBe(`/operacion/medios/${PADRE}?pestana=documentos`)
  })

  it("quien verifica anunciantes abre su expediente; quien ve ofertas, su ficha", () => {
    const verifica = interno(["anunciantes.verificar"])
    expect(destinoDe("anunciantes", ID, verifica)).toBe(
      `/operacion/anunciantes/${ID}?pestana=verificacion`
    )
    expect(
      destinoDe("documentos_anunciante", ID, verifica, { anuncianteId: PADRE })
    ).toBe(`/operacion/anunciantes/${PADRE}?pestana=verificacion`)
    expect(
      destinoDe("documentos_anunciante", ID, interno(), { anuncianteId: PADRE })
    ).toBe(`/operacion/anunciantes/${PADRE}?pestana=documentos`)
    expect(
      destinoDe("ofertas", ID, interno(["ofertas.ver"]), { campanaId: PADRE })
    ).toBe(`/operacion/ofertas/${ID}`)
  })

  it("sin relacionados visibles no hay destino", () => {
    expect(destinoDe("publicaciones", ID, interno(), {})).toBeNull()
    expect(destinoDe("ofertas", ID, interno())).toBeNull()
  })
})

describe("destinoDe · portales externos", () => {
  it("el medio va a su portal y lo que aún no tiene pantalla, a Inicio", () => {
    expect(destinoDe("medios", ID, medio)).toBe("/mi-medio")
    expect(destinoDe("documentos_medio", ID, medio)).toBe(
      "/mi-medio/documentos"
    )
    expect(destinoDe("verificaciones_cuenta", ID, medio)).toBe(
      "/mi-medio/cuentas"
    )
    expect(destinoDe("asignaciones", ID, medio)).toBe(`/mis-campanas/${ID}`)
    expect(destinoDe("metricas", ID, medio, { asignacionId: PADRE })).toBe(
      `/mis-campanas/${PADRE}`
    )
    expect(destinoDe("ofertas", ID, medio)).toBe(`/ofertas/${ID}`)
    expect(destinoDe("liquidaciones", ID, medio)).toBe(`/ganancias/${ID}`)
  })

  it("el seguimiento del anunciante abre la asignación en su campaña", () => {
    expect(
      destinoDe("asignaciones", ID, anunciante, { campanaId: PADRE })
    ).toBe(`/campanas/${PADRE}?pestana=seguimiento&asignacion=${ID}`)
    expect(
      destinoDe("publicaciones", ID, anunciante, {
        campanaId: PADRE,
        asignacionId: "a1",
      })
    ).toBe(`/campanas/${PADRE}?pestana=seguimiento&asignacion=a1`)
    expect(destinoDe("disputas", ID, anunciante)).toBe("/campanas")
  })

  it("las disputas abren su hilo en el portal de cada parte y en la bandeja interna", () => {
    expect(
      destinoDe("disputas", ID, interno(["disputas.ver"]), {
        asignacionId: PADRE,
      })
    ).toBe(`/operacion/disputas/${ID}`)
    expect(destinoDe("disputas", ID, interno(), { asignacionId: PADRE })).toBe(
      `/operacion/asignaciones/${PADRE}`
    )
    expect(destinoDe("disputas", ID, medio, { asignacionId: "a1" })).toBe(
      "/mis-campanas/a1/disputa"
    )
    expect(
      destinoDe("disputas", ID, anunciante, {
        campanaId: PADRE,
        asignacionId: "a1",
      })
    ).toBe(`/campanas/${PADRE}/asignaciones/a1/disputa`)
  })

  it("el anunciante va a su empresa, sus campañas y sus ofertas", () => {
    expect(destinoDe("anunciantes", ID, anunciante)).toBe("/empresa")
    expect(destinoDe("documentos_anunciante", ID, anunciante)).toBe(
      "/empresa/documentos"
    )
    expect(destinoDe("campanas", ID, anunciante)).toBe(`/campanas/${ID}`)
    expect(destinoDe("ofertas", ID, anunciante, { campanaId: PADRE })).toBe(
      `/campanas/${PADRE}/ofertas/${ID}`
    )
    expect(destinoDe("ofertas", ID, anunciante)).toBe("/campanas")
    expect(destinoDe("facturas", ID, anunciante)).toBe(`/facturas/${ID}`)
  })

  it("nunca manda a un externo a una ruta de operación", () => {
    for (const entidad of ENTIDADES_ENLACE) {
      for (const quien of [medio, anunciante]) {
        expect(
          destinoDe(entidad, ID, quien, { asignacionId: PADRE })
        ).not.toMatch(/^\/operacion/)
      }
    }
  })

  it("los avisos de seguridad van a Seguridad para todos", () => {
    for (const quien of [interno(), medio, anunciante]) {
      expect(destinoDe("accesos", "42", quien)).toBe("/cuenta/seguridad")
    }
  })
})

describe("enlaceNotificacion", () => {
  it("arma /ir solo para entidades conocidas con id", () => {
    expect(enlaceNotificacion("ofertas", ID)).toBe(`/ir/ofertas/${ID}`)
    expect(enlaceNotificacion("tabla_rara", ID)).toBeNull()
    expect(enlaceNotificacion("ofertas", null)).toBeNull()
    // Aviso de lote sin fila: la vista que lo resuelve.
    expect(enlaceNotificacion("liquidaciones", null)).toBe(
      "/finanzas/liquidaciones?vista=borrador"
    )
    expect(enlaceNotificacion(null, ID)).toBeNull()
  })

  it("codifica el id (nunca sale del segmento)", () => {
    expect(enlaceNotificacion("accesos", "../x")).toBe("/ir/accesos/..%2Fx")
    expect(esEntidadEnlace("medios")).toBe(true)
    expect(esEntidadEnlace("medios/../x")).toBe(false)
  })
})
