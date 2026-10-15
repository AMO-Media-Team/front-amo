import { describe, expect, it } from "vitest"

import { migas } from "@/lib/auth/navegacion"
import {
  CLAVES_PERMISO,
  type ClavePermiso,
  PERMISOS,
  permisosDeRol,
} from "@/lib/auth/permisos"

import {
  esSlugReporte,
  ETIQUETAS_FILTRO,
  filtrosPara,
  GRUPOS_REPORTE,
  puedeExportarReporte,
  puedeVerReporte,
  REPORTES,
  reportesPorGrupo,
  reportesVisibles,
  rutaReporte,
  SLUGS_REPORTE,
  tarjetaPara,
} from "./catalogo"

const con = (...permisos: ClavePermiso[]) => ({ permisos })

describe("catálogo de reportes", () => {
  it("las migas de cada reporte llevan su título (registro de navegación al día)", () => {
    // `@/lib/auth/navegacion` no puede importar este catálogo: repite los
    // títulos en `subpaginas` y aquí se vigila que no diverjan.
    for (const slug of SLUGS_REPORTE) {
      expect(migas(rutaReporte(slug)), slug).toEqual([
        { titulo: "Reportes", href: "/reportes" },
        { titulo: REPORTES[slug].titulo },
      ])
    }
  })

  it("declara los siete reportes, cada uno bajo su propio slug", () => {
    expect(SLUGS_REPORTE).toHaveLength(7)
    expect(new Set(SLUGS_REPORTE).size).toBe(7)
    for (const slug of SLUGS_REPORTE) {
      expect(REPORTES[slug].slug).toBe(slug)
      expect(GRUPOS_REPORTE[REPORTES[slug].grupo]).toBeDefined()
    }
  })

  it("todo reporte exige `reportes.ver` y solo permisos que existen", () => {
    for (const slug of SLUGS_REPORTE) {
      const { permisos } = REPORTES[slug]
      expect(permisos).toContain("reportes.ver")
      for (const permiso of permisos) expect(PERMISOS[permiso]).toBeDefined()
    }
  })

  it("los reportes financieros exigen `reportes.finanzas`", () => {
    expect(REPORTES.finanzas.permisos).toContain("reportes.finanzas")
    expect(REPORTES.cartera.permisos).toContain("reportes.finanzas")
  })

  it("cada reporte filtra por periodo o por fecha de corte, nunca por ambos", () => {
    for (const slug of SLUGS_REPORTE) {
      const { filtros } = REPORTES[slug]
      expect(filtros.includes("periodo")).not.toBe(filtros.includes("corte"))
      for (const filtro of filtros)
        expect(ETIQUETAS_FILTRO[filtro]).toBeTruthy()
    }
  })

  it("los textos para personas no técnicas están completos", () => {
    for (const slug of SLUGS_REPORTE) {
      const reporte = REPORTES[slug]
      expect(reporte.titulo.length).toBeGreaterThan(3)
      expect(reporte.descripcion.length).toBeGreaterThan(30)
      expect(reporte.proposito.length).toBeGreaterThan(60)
      expect(reporte.acceso.length).toBeGreaterThan(3)
    }
  })
})

describe("esSlugReporte y rutaReporte", () => {
  it("solo reconoce los slugs del catálogo", () => {
    expect(esSlugReporte("finanzas")).toBe(true)
    expect(esSlugReporte("Finanzas")).toBe(false)
    expect(esSlugReporte("auditoria")).toBe(false)
    expect(esSlugReporte("")).toBe(false)
    expect(esSlugReporte("__proto__")).toBe(false)
  })

  it("arma la ruta tipada del reporte", () => {
    expect(rutaReporte("cobertura-territorial")).toBe(
      "/reportes/cobertura-territorial"
    )
  })
})

describe("permisos", () => {
  it("ver un reporte exige TODOS sus permisos", () => {
    const usuarios = REPORTES["usuarios-accesos"]
    expect(puedeVerReporte(con("reportes.ver"), usuarios)).toBe(false)
    expect(puedeVerReporte(con("reportes.ver", "accesos.ver"), usuarios)).toBe(
      false
    )
    expect(
      puedeVerReporte(
        con("reportes.ver", "accesos.ver", "usuarios.ver"),
        usuarios
      )
    ).toBe(true)
  })

  it("exportar exige además `reportes.exportar`", () => {
    const cartera = REPORTES.cartera
    const sinExportar = con("reportes.ver", "reportes.finanzas")
    expect(puedeVerReporte(sinExportar, cartera)).toBe(true)
    expect(puedeExportarReporte(sinExportar, cartera)).toBe(false)
    expect(
      puedeExportarReporte(
        con("reportes.ver", "reportes.finanzas", "reportes.exportar"),
        cartera
      )
    ).toBe(true)
    // Exportar no da acceso a un reporte que no se puede ver.
    expect(
      puedeExportarReporte(con("reportes.ver", "reportes.exportar"), cartera)
    ).toBe(false)
  })

  it("el anunciante solo ve el desempeño de sus campañas", () => {
    const visibles = reportesVisibles(con(...permisosDeRol("ANUNCIANTE")))
    expect(visibles.map((r) => r.slug)).toEqual(["desempeno-campanas"])
  })

  it("finanzas ve los reportes financieros pero no los de accesos", () => {
    const slugs = reportesVisibles(con(...permisosDeRol("FINANZAS"))).map(
      (r) => r.slug
    )
    expect(slugs).toContain("finanzas")
    expect(slugs).toContain("cartera")
    expect(slugs).not.toContain("usuarios-accesos")
  })

  it("operaciones no ve finanzas ni cartera", () => {
    const slugs = reportesVisibles(con(...permisosDeRol("OPERACIONES"))).map(
      (r) => r.slug
    )
    expect(slugs).toContain("cumplimiento-medios")
    expect(slugs).not.toContain("finanzas")
    expect(slugs).not.toContain("cartera")
  })

  it("el superadministrador ve los siete, en el orden del catálogo", () => {
    const todos = con(...CLAVES_PERMISO)
    expect(reportesVisibles(todos).map((r) => r.slug)).toEqual([
      ...SLUGS_REPORTE,
    ])
  })

  it("agrupa sin dejar grupos vacíos y sin perder reportes", () => {
    const anunciante = reportesPorGrupo(con(...permisosDeRol("ANUNCIANTE")))
    expect(anunciante.map((g) => g.grupo)).toEqual(["negocio"])

    const todos = reportesPorGrupo(con(...CLAVES_PERMISO))
    expect(todos.map((g) => g.grupo)).toEqual([
      "negocio",
      "territorio",
      "seguridad",
    ])
    expect(todos.flatMap((g) => g.reportes)).toHaveLength(7)

    expect(reportesPorGrupo(con())).toEqual([])
  })
})

describe("filtrosPara", () => {
  const anunciante = { anuncianteId: "11111111-1111-4111-8111-111111111111" }

  it("a un interno le aplican todos los filtros del reporte", () => {
    for (const slug of SLUGS_REPORTE) {
      expect(filtrosPara(REPORTES[slug], { anuncianteId: null })).toEqual(
        REPORTES[slug].filtros
      )
    }
  })

  it("a un anunciante nunca le aplica el filtro por anunciante", () => {
    for (const slug of SLUGS_REPORTE) {
      const filtros = filtrosPara(REPORTES[slug], anunciante)
      expect(filtros).not.toContain("anunciante")
      expect(filtros).toEqual(
        REPORTES[slug].filtros.filter((filtro) => filtro !== "anunciante")
      )
    }
  })
})

describe("tarjetaPara", () => {
  const campanas = REPORTES["desempeno-campanas"]

  it("a un interno le anuncia el filtro por anunciante y el acceso general", () => {
    expect(tarjetaPara(campanas, { anuncianteId: null })).toEqual({
      filtros: campanas.filtros,
      acceso: campanas.acceso,
    })
  })

  it("a un anunciante no le ofrece filtrar por anunciante: solo ve lo suyo", () => {
    const tarjeta = tarjetaPara(campanas, {
      anuncianteId: "11111111-1111-4111-8111-111111111111",
    })
    expect(tarjeta.filtros).toEqual(["periodo"])
    expect(tarjeta.acceso).toBe("Solo tus campañas")
  })

  it("los reportes sin ese filtro no cambian", () => {
    const anunciante = { anuncianteId: "11111111-1111-4111-8111-111111111111" }
    expect(tarjetaPara(REPORTES.cartera, anunciante)).toEqual({
      filtros: REPORTES.cartera.filtros,
      acceso: REPORTES.cartera.acceso,
    })
  })
})
