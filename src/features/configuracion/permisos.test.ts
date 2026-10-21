import { describe, expect, it } from "vitest"

import type { ClavePermiso } from "@/lib/auth/permisos"

import {
  permisosConfiguracion,
  puedeEditarParametro,
  seccionEditable,
} from "./permisos"
import { SECCIONES } from "./secciones"

const de = (...claves: ClavePermiso[]) => permisosConfiguracion(claves)

describe("permisosConfiguracion", () => {
  it("traduce las claves del rol a lo que la página puede ofrecer", () => {
    expect(de("configuracion.ver")).toEqual({
      editar: false,
      comisiones: false,
      tarifas: false,
      tributario: false,
      catalogos: false,
      verAuditoria: false,
      datosSensibles: false,
    })
    expect(
      de("configuracion.ver", "configuracion.tarifas", "auditoria.ver")
    ).toMatchObject({
      tarifas: true,
      verAuditoria: true,
      editar: false,
    })
    // El NIT completo de un anunciante depende de su propio permiso.
    expect(
      de("configuracion.comisiones", "datos_sensibles.ver").datosSensibles
    ).toBe(true)
    expect(de("configuracion.comisiones").datosSensibles).toBe(false)
  })
})

describe("puedeEditarParametro", () => {
  it("un parámetro común solo pide configuracion.editar", () => {
    expect(
      puedeEditarParametro(
        "medios.umbral_seguidores",
        de("configuracion.editar")
      )
    ).toBe(true)
    expect(
      puedeEditarParametro(
        "medios.umbral_seguidores",
        de("configuracion.comisiones")
      )
    ).toBe(false)
  })

  it("la comisión exige además configuracion.comisiones", () => {
    const clave = "comision.porcentaje_global"
    expect(puedeEditarParametro(clave, de("configuracion.editar"))).toBe(false)
    expect(puedeEditarParametro(clave, de("configuracion.comisiones"))).toBe(
      false
    )
    expect(
      puedeEditarParametro(
        clave,
        de("configuracion.editar", "configuracion.comisiones")
      )
    ).toBe(true)
  })
})

describe("seccionEditable", () => {
  it("con solo lectura ninguna sección es editable", () => {
    const permisos = de("configuracion.ver")
    expect(SECCIONES.filter((s) => seccionEditable(s, permisos))).toEqual([])
  })

  it("cada permiso especializado abre solo sus secciones", () => {
    const editables = (...claves: ClavePermiso[]) =>
      SECCIONES.filter((s) => seccionEditable(s, de(...claves)))
    expect(editables("configuracion.tarifas")).toEqual(["precios"])
    expect(editables("configuracion.comisiones")).toEqual(["comercial"])
    expect(editables("configuracion.tributario")).toEqual(["tributario"])
    expect(editables("configuracion.catalogos")).toEqual([
      "precios",
      "catalogos",
      "legal",
      "plantillas",
    ])
    expect(editables("configuracion.editar")).toEqual([
      "comercial",
      "precios",
      "medios",
      "metricas",
      "calidad",
      "seguridad",
      "tributario",
    ])
  })
})
