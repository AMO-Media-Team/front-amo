// @vitest-environment node
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ErrorDatosGeo, type ProveedorMetricasGeo } from "@/features/geo/tipos"
import type { ClavePermiso } from "@/lib/auth/permisos"

const dal = vi.hoisted(() => ({
  acceso: { tipo: "sin-sesion" } as Record<string, unknown>,
  vigencia: "VIGENTE" as string,
}))
const proveedor = vi.hoisted(() => ({
  actual: null as ProveedorMetricasGeo | null,
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/dal", () => ({
  evaluarAcceso: async () => dal.acceso,
  verificarVigencia: async () => dal.vigencia,
  tieneAlgunPermiso: (
    usuario: { permisos: readonly ClavePermiso[] },
    permisos: readonly ClavePermiso[]
  ) => permisos.some((permiso) => usuario.permisos.includes(permiso)),
}))
vi.mock("@/features/geo/proveedor-servidor", () => ({
  obtenerProveedorGeo: async () => proveedor.actual,
}))

const { GET } = await import("./route")
const { crearProveedorSimulado } =
  await import("@/features/geo/proveedor-simulado")

function conPermisos(...permisos: ClavePermiso[]) {
  dal.acceso = {
    tipo: "listo",
    claims: {},
    usuario: { id: "u1", permisos },
  }
}

function pedir(parametros: string) {
  return GET(new NextRequest(`http://localhost/api/geo/metricas?${parametros}`))
}

const MAPA = "nivel=nacional&metrica=medios&desde=2026-09-01&hasta=2026-09-30"

describe("GET /api/geo/metricas", () => {
  beforeEach(() => {
    dal.vigencia = "VIGENTE"
    proveedor.actual = crearProveedorSimulado()
  })

  it("sin sesión responde 401 en JSON (sin redirigir)", async () => {
    dal.acceso = { tipo: "sin-sesion" }
    const respuesta = await pedir(MAPA)
    expect(respuesta.status).toBe(401)
    expect(await respuesta.json()).toMatchObject({
      error: { motivo: "sin-sesion" },
    })
  })

  it("una sesión revocada también es 401", async () => {
    conPermisos("analitica.mapa")
    dal.vigencia = "REVOCADA"
    expect((await pedir(MAPA)).status).toBe(401)
  })

  it("sin `analitica.mapa` responde 403", async () => {
    conPermisos("inicio.admin")
    expect((await pedir(MAPA)).status).toBe(403)
  })

  it("la métrica de accesos exige además `accesos.ver`", async () => {
    conPermisos("analitica.mapa")
    const respuesta = await pedir(
      "nivel=nacional&metrica=accesos&desde=2026-09-01&hasta=2026-09-30"
    )
    expect(respuesta.status).toBe(403)
  })

  it("parámetros inválidos: 400 con el mensaje de validación", async () => {
    conPermisos("analitica.mapa")
    const respuesta = await pedir(
      "nivel=internacional&metrica=gmv&desde=2026-09-01&hasta=2026-09-30"
    )
    expect(respuesta.status).toBe(400)
    const cuerpo = await respuesta.json()
    expect(cuerpo.error.mensaje).toMatch(/no está disponible/)
  })

  it("responde los datos con caché privada corta", async () => {
    conPermisos("analitica.mapa")
    const respuesta = await pedir(MAPA)
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get("cache-control")).toBe("private, max-age=60")
    const cuerpo = await respuesta.json()
    expect(cuerpo.filas).toHaveLength(33)
  })

  it("el detalle omite los KPI que el usuario no puede ver", async () => {
    conPermisos("analitica.mapa")
    const respuesta = await pedir(`${MAPA}&vista=detalle&zona=05`)
    const cuerpo = await respuesta.json()
    const metricas = cuerpo.kpis.map((k: { metrica: string }) => k.metrica)
    expect(metricas).toContain("medios")
    expect(metricas).not.toContain("accesos")
  })

  it("los medios destacados del detalle exigen `medios.ver` y `asignaciones.ver`", async () => {
    conPermisos("analitica.mapa", "medios.ver")
    const sinAsignaciones = await (
      await pedir(`${MAPA}&vista=detalle&zona=05`)
    ).json()
    expect(sinAsignaciones.medios).toBeNull()

    conPermisos("analitica.mapa", "medios.ver", "asignaciones.ver")
    const completo = await (await pedir(`${MAPA}&vista=detalle&zona=05`)).json()
    expect(completo.medios.filas.length).toBeGreaterThan(0)
  })

  it("los puntos de calor de medios exigen `medios.ver` (los lee la RLS de la tabla)", async () => {
    const PUNTOS =
      "vista=puntos&nivel=nacional&metrica=medios&desde=2026-09-01&hasta=2026-09-30"
    conPermisos("analitica.mapa")
    expect((await pedir(PUNTOS)).status).toBe(403)
    // El coroplético de medios no lo exige: es un agregado de la RPC.
    expect((await pedir(MAPA)).status).toBe(200)

    conPermisos("analitica.mapa", "medios.ver")
    expect((await pedir(PUNTOS)).status).toBe(200)
  })

  it("los puntos del modo calor se piden aparte y respetan el permiso de la métrica", async () => {
    const PUNTOS =
      "vista=puntos&nivel=nacional&metrica=accesos&desde=2026-09-01&hasta=2026-09-30"
    conPermisos("analitica.mapa")
    expect((await pedir(PUNTOS)).status).toBe(403)

    conPermisos("analitica.mapa", "accesos.ver")
    const respuesta = await pedir(PUNTOS)
    expect(respuesta.status).toBe(200)
    const cuerpo = await respuesta.json()
    expect(cuerpo.puntos.length).toBeGreaterThan(0)
    expect(cuerpo).toMatchObject({
      consulta: { metrica: "accesos" },
      origen: "simulado",
    })

    const sinPuntos = await pedir(PUNTOS.replace("accesos", "gmv"))
    expect(sinPuntos.status).toBe(400)
  })

  it("el mapa ya no arrastra los puntos (el coroplético no espera coordenadas)", async () => {
    conPermisos("analitica.mapa", "accesos.ver")
    const cuerpo = await (
      await pedir(
        "nivel=nacional&metrica=accesos&desde=2026-09-01&hasta=2026-09-30"
      )
    ).json()
    expect(cuerpo).not.toHaveProperty("puntos")
  })

  it("sin la RPC en la BD responde 503 con un mensaje claro", async () => {
    conPermisos("analitica.mapa")
    const noDisponible = async (): Promise<never> => {
      throw new ErrorDatosGeo("no-disponible", "Falta la función geo_metricas.")
    }
    proveedor.actual = {
      mapa: noDisponible,
      puntos: noDisponible,
      detalle: noDisponible,
    }
    const respuesta = await pedir(MAPA)
    expect(respuesta.status).toBe(503)
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect((await respuesta.json()).error.mensaje).toMatch(/geo_metricas/)
  })

  it("un fallo inesperado es 500 sin filtrar detalles", async () => {
    conPermisos("analitica.mapa")
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const falla = async (): Promise<never> => {
      throw new Error("conexión perdida con detalles internos")
    }
    proveedor.actual = { mapa: falla, puntos: falla, detalle: falla }
    const respuesta = await pedir(MAPA)
    expect(respuesta.status).toBe(500)
    expect(JSON.stringify(await respuesta.json())).not.toMatch(/internos/)
    error.mockRestore()
  })
})
