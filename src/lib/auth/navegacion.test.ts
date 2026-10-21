import { describe, expect, it } from "vitest"

import {
  destinoTrasIngreso,
  esRutaPublica,
  filtrarNavegacion,
  migas,
  NAVEGACION,
  resolverAcceso,
  rutaInternaSegura,
} from "./navegacion"
import type { ClavePermiso } from "./permisos"
import type { TipoRol } from "./tipos"

function usuario(tipo: TipoRol, permisos: ClavePermiso[]) {
  return { rol: { tipo }, permisos }
}

const idsVisibles = (tipo: TipoRol, permisos: ClavePermiso[]) =>
  filtrarNavegacion(usuario(tipo, permisos)).flatMap((grupo) =>
    grupo.items.map((item) => item.id)
  )

describe("registro de navegación", () => {
  it("no repite identificadores ni rutas", () => {
    const items = NAVEGACION.flatMap((grupo) => grupo.items)
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length)
    // El menú de comandos usa el título como valor único.
    expect(new Set(items.map((item) => item.titulo)).size).toBe(items.length)
  })

  it("todas las entradas tienen descripción y palabras clave para ⌘K", () => {
    for (const item of NAVEGACION.flatMap((grupo) => grupo.items)) {
      expect(item.descripcion.length).toBeGreaterThan(10)
      expect(item.palabrasClave.length).toBeGreaterThan(0)
    }
  })
})

describe("filtrarNavegacion", () => {
  it("muestra a un administrador solo lo que sus permisos permiten", () => {
    expect(
      idsVisibles("ADMIN", ["inicio.admin", "usuarios.ver", "cuenta.gestionar"])
    ).toEqual(["inicio", "usuarios", "perfil", "seguridad", "preferencias"])
  })

  it("oculta secciones internas a anunciantes aunque tengan el permiso", () => {
    const visibles = idsVisibles("ANUNCIANTE", [
      "inicio.anunciante",
      "reportes.ver",
      "medios.ver",
      "notificaciones.ver",
    ])
    expect(visibles).toEqual(["inicio", "reportes", "notificaciones"])
  })

  it("Inicio aparece con cualquiera de los permisos de panel", () => {
    expect(idsVisibles("MEDIO", ["inicio.medio"])).toEqual(["inicio"])
  })

  it("elimina los grupos que quedan vacíos", () => {
    const grupos = filtrarNavegacion(usuario("MEDIO", ["inicio.medio"]))
    expect(grupos.map((grupo) => grupo.id)).toEqual(["general"])
  })
})

describe("migas", () => {
  it("una sección de General es solo su título", () => {
    expect(migas("/inicio")).toEqual([{ titulo: "Inicio" }])
  })

  it("antepone el grupo sin enlace", () => {
    expect(migas("/administracion/usuarios")).toEqual([
      { titulo: "Administración" },
      { titulo: "Usuarios" },
    ])
  })

  it("enlaza la sección y muestra identificadores como Detalle", () => {
    expect(
      migas("/operacion/medios/0192f3a4-5b6c-7d8e-9f01-23456789abcd/editar")
    ).toEqual([
      { titulo: "Operación" },
      { titulo: "Medios", href: "/operacion/medios" },
      {
        titulo: "Detalle",
        href: "/operacion/medios/0192f3a4-5b6c-7d8e-9f01-23456789abcd",
      },
      { titulo: "Editar" },
    ])
  })

  it("humaniza segmentos legibles e ignora consulta y barra final", () => {
    expect(migas("/reportes/resumen-ejecutivo/?desde=2026-01-01")).toEqual([
      { titulo: "Reportes", href: "/reportes" },
      { titulo: "Resumen ejecutivo" },
    ])
  })

  it("una subpágina registrada usa su título, no el slug sin tildes", () => {
    expect(migas("/reportes/desempeno-campanas")).toEqual([
      { titulo: "Reportes", href: "/reportes" },
      { titulo: "Desempeño de campañas" },
    ])
    expect(migas("/reportes/usuarios-accesos").at(-1)).toEqual({
      titulo: "Usuarios y accesos",
    })
    // Fuera del registro el segmento se humaniza como antes.
    expect(migas("/reportes/otro-reporte").at(-1)).toEqual({
      titulo: "Otro reporte",
    })
  })

  it("la página puede nombrar la última miga (el registro de una ficha)", () => {
    const ficha = "/operacion/medios/0192f3a4-5b6c-7d8e-9f01-23456789abcd"
    expect(migas(ficha, "  Radio Pasto  ")).toEqual([
      { titulo: "Operación" },
      { titulo: "Medios", href: "/operacion/medios" },
      { titulo: "Radio Pasto" },
    ])
    expect(migas(ficha, "   ").at(-1)).toEqual({ titulo: "Detalle" })
    expect(migas(ficha, null).at(-1)).toEqual({ titulo: "Detalle" })
  })

  it("el título propio nunca reemplaza a la sección", () => {
    expect(migas("/operacion/medios", "Radio Pasto")).toEqual([
      { titulo: "Operación" },
      { titulo: "Medios" },
    ])
  })

  it("devuelve una lista vacía fuera del registro", () => {
    expect(migas("/desconocida")).toEqual([])
    expect(migas("/inicios")).toEqual([])
    expect(migas("/desconocida", "Algo")).toEqual([])
  })
})

describe("rutas públicas", () => {
  it.each([
    "/ingresar",
    "/recuperar",
    "/restablecer",
    "/auth/confirm",
    "/auth/callback",
    "/api/csp-report",
    "/manifest.webmanifest",
    "/robots.txt",
    "/icon",
    "/icon.svg",
    "/icon1",
    "/apple-icon",
    "/opengraph-image",
    "/opengraph-image-1a2b3c",
  ])("%s es pública", (ruta) => {
    expect(esRutaPublica(ruta)).toBe(true)
  })

  it.each([
    "/",
    "/inicio",
    "/cambiar-contrasena",
    "/mfa/configurar",
    "/mfa/verificar",
    "/ingresar-admin",
    "/iconos",
    "/api/geo/metricas",
  ])("%s exige sesión", (ruta) => {
    expect(esRutaPublica(ruta)).toBe(false)
  })
})

describe("rutaInternaSegura", () => {
  it("acepta rutas internas con consulta y fragmento", () => {
    expect(rutaInternaSegura("/operacion/medios?pagina=2#tabla")).toBe(
      "/operacion/medios?pagina=2#tabla"
    )
  })

  it.each([
    null,
    "",
    "inicio",
    "https://evil.example/inicio",
    "//evil.example",
    "/\\evil.example",
    "/ruta\\con\\barras",
    "/salto\r\nSet-Cookie:x",
    "javascript:alert(1)",
  ])("rechaza %s", (valor) => {
    expect(rutaInternaSegura(valor)).toBeNull()
  })

  it("conserva codificados los caracteres de control (quedan como texto)", () => {
    expect(rutaInternaSegura("/%0d%0aSet-Cookie:x")).toBe("/%0d%0aSet-Cookie:x")
  })

  // Auditoría: la normalización de `.` y `..` producía "//evil.example", que
  // el navegador resuelve como otro origen (redirección abierta).
  it.each([
    "/.//evil.example",
    "/..//evil.example",
    "/a/..//evil.example/x",
    "/%2e//evil.example",
    "/%2e%2e//evil.example?x=1",
    "/./%2e//evil.example",
  ])("rechaza %s (se normaliza a protocolo relativo)", (valor) => {
    expect(rutaInternaSegura(valor)).toBeNull()
  })

  it("acepta rutas con segmentos punto que siguen siendo internas", () => {
    expect(rutaInternaSegura("/a/../inicio")).toBe("/inicio")
    expect(rutaInternaSegura("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example")
  })
})

describe("destinoTrasIngreso", () => {
  it("usa el next privado y seguro", () => {
    expect(destinoTrasIngreso("/administracion/usuarios")).toBe(
      "/administracion/usuarios"
    )
  })

  it("vuelve a Inicio ante destinos inseguros, públicos o la raíz", () => {
    expect(destinoTrasIngreso(undefined)).toBe("/inicio")
    expect(destinoTrasIngreso("https://evil.example")).toBe("/inicio")
    expect(destinoTrasIngreso("/ingresar?next=/x")).toBe("/inicio")
    expect(destinoTrasIngreso("/")).toBe("/inicio")
  })
})

describe("resolverAcceso", () => {
  it("deja pasar rutas públicas sin sesión", () => {
    expect(
      resolverAcceso({ ruta: "/recuperar", busqueda: "", autenticado: false })
    ).toEqual({ tipo: "continuar" })
  })

  it("redirige a ingresar conservando la ruta pedida", () => {
    expect(
      resolverAcceso({
        ruta: "/administracion/usuarios",
        busqueda: "?estado=activo",
        autenticado: false,
      })
    ).toEqual({
      tipo: "redirigir",
      destino: "/ingresar?next=%2Fadministracion%2Fusuarios%3Festado%3Dactivo",
    })
  })

  it("la raíz sin sesión va a ingresar sin next", () => {
    expect(
      resolverAcceso({ ruta: "/", busqueda: "", autenticado: false })
    ).toEqual({ tipo: "redirigir", destino: "/ingresar" })
  })

  it("responde 401 en APIs privadas sin sesión", () => {
    expect(
      resolverAcceso({
        ruta: "/api/geo/metricas",
        busqueda: "",
        autenticado: false,
      })
    ).toEqual({ tipo: "no-autenticado" })
  })

  it("con sesión, /ingresar lleva al destino pedido o a Inicio", () => {
    expect(
      resolverAcceso({ ruta: "/ingresar", busqueda: "", autenticado: true })
    ).toEqual({ tipo: "redirigir", destino: "/inicio" })
    expect(
      resolverAcceso({
        ruta: "/ingresar",
        busqueda: "?next=%2Freportes",
        autenticado: true,
      })
    ).toEqual({ tipo: "redirigir", destino: "/reportes" })
  })

  it("con sesión, un next que se normaliza a otro origen va a Inicio", () => {
    for (const next of ["/.//evil.example", "/..//evil.example/x"]) {
      expect(
        resolverAcceso({
          ruta: "/ingresar",
          busqueda: `?${new URLSearchParams({ next })}`,
          autenticado: true,
        })
      ).toEqual({ tipo: "redirigir", destino: "/inicio" })
    }
  })

  it("con sesión deja pasar rutas privadas y el resto del flujo de auth", () => {
    for (const ruta of ["/inicio", "/mfa/verificar", "/restablecer"]) {
      expect(resolverAcceso({ ruta, busqueda: "", autenticado: true })).toEqual(
        {
          tipo: "continuar",
        }
      )
    }
  })
})
