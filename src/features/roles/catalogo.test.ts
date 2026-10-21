import { describe, expect, it } from "vitest"

import {
  CLAVES_PERMISO,
  type ClavePermiso,
  PERMISOS,
  permisosDeRol,
} from "@/lib/auth/permisos"

import {
  alternarGrupo,
  calcularDiff,
  catalogoPorArea,
  coincideBusqueda,
  contarSensibles,
  diffPorModulo,
  estadoSeleccion,
  normalizarBusqueda,
  permisosValidos,
  totalCambios,
} from "./catalogo"

const USUARIOS: ClavePermiso[] = CLAVES_PERMISO.filter(
  (clave) => PERMISOS[clave].modulo === "usuarios"
)

describe("catalogoPorArea (agrupación por módulo)", () => {
  const areas = catalogoPorArea()
  const modulos = areas.flatMap((area) => area.modulos)

  it("incluye cada permiso del catálogo exactamente una vez", () => {
    const claves = modulos.flatMap((modulo) => modulo.permisos)
    expect(claves).toHaveLength(CLAVES_PERMISO.length)
    expect(new Set(claves).size).toBe(CLAVES_PERMISO.length)
  })

  it("agrupa por módulo y conserva el orden del catálogo dentro de cada uno", () => {
    for (const { modulo, permisos } of modulos) {
      expect(permisos.every((clave) => PERMISOS[clave].modulo === modulo)).toBe(
        true
      )
      const orden = permisos.map((clave) => CLAVES_PERMISO.indexOf(clave))
      expect(orden).toEqual([...orden].sort((a, b) => a - b))
    }
  })

  it("ordena las áreas como las piensa el negocio y titula los módulos en español", () => {
    expect(areas.map((area) => area.id)).toEqual([
      "plataforma",
      "administracion",
      "operacion",
      "finanzas",
    ])
    const titulos = Object.fromEntries(
      modulos.map((modulo) => [modulo.modulo, modulo.titulo])
    )
    expect(titulos).toMatchObject({
      analitica: "Analítica",
      datos_sensibles: "Datos sensibles",
      campanas: "Campañas",
    })
  })

  it("filtra permisos y descarta módulos y áreas vacíos", () => {
    const soloRoles = catalogoPorArea((clave) => clave.startsWith("roles."))
    expect(soloRoles).toHaveLength(1)
    expect(soloRoles[0]).toMatchObject({
      id: "administracion",
      modulos: [
        {
          modulo: "roles",
          titulo: "Roles",
          permisos: ["roles.ver", "roles.gestionar"],
        },
      ],
    })
    expect(catalogoPorArea(() => false)).toEqual([])
  })
})

describe("permisosValidos", () => {
  it("descarta claves desconocidas, quita duplicados y ordena como el catálogo", () => {
    expect(
      permisosValidos([
        "roles.gestionar",
        "no.existe",
        "inicio.admin",
        "roles.gestionar",
      ])
    ).toEqual(["inicio.admin", "roles.gestionar"])
  })
})

describe("contarSensibles", () => {
  it("cuenta los permisos marcados como sensibles", () => {
    expect(contarSensibles(["roles.ver", "roles.gestionar"])).toBe(1)
    expect(contarSensibles([])).toBe(0)
  })
})

describe("búsqueda de permisos", () => {
  it("normaliza sin tildes ni mayúsculas", () => {
    expect(normalizarBusqueda("  LIQUIDACIÓN  ")).toBe("liquidacion")
  })

  it("exige todas las palabras en la descripción, la clave o el módulo", () => {
    expect(
      coincideBusqueda("liquidaciones.aprobar", "liquidacion aprobar")
    ).toBe(true)
    expect(coincideBusqueda("usuarios.invitar", "Usuarios")).toBe(true)
    expect(coincideBusqueda("usuarios.invitar", "invitar pagos")).toBe(false)
    expect(coincideBusqueda("reportes.ver", "   ")).toBe(true)
  })

  it("encuentra por el título del módulo en español", () => {
    expect(coincideBusqueda("analitica.mapa", "analítica")).toBe(true)
  })
})

describe("estadoSeleccion", () => {
  it("distingue todos, algunos y ninguno", () => {
    expect(estadoSeleccion(USUARIOS, new Set(USUARIOS))).toBe("todos")
    expect(estadoSeleccion(USUARIOS, new Set([USUARIOS[0]]))).toBe("algunos")
    expect(estadoSeleccion(USUARIOS, new Set(["roles.ver"]))).toBe("ninguno")
  })
})

describe("alternarGrupo (seleccionar todo el módulo)", () => {
  const todos = () => true

  it("marca todos si falta alguno y los desmarca si ya estaban todos", () => {
    const parcial = new Set<ClavePermiso>([USUARIOS[0], "roles.ver"])
    const marcado = alternarGrupo(parcial, USUARIOS, todos)
    expect(USUARIOS.every((clave) => marcado.has(clave))).toBe(true)
    expect(marcado.has("roles.ver")).toBe(true)

    const desmarcado = alternarGrupo(marcado, USUARIOS, todos)
    expect(USUARIOS.some((clave) => desmarcado.has(clave))).toBe(false)
    expect(desmarcado.has("roles.ver")).toBe(true)
  })

  it("no toca los permisos fuera de alcance (anti-escalada)", () => {
    const bloqueado: ClavePermiso = "usuarios.eliminar"
    const editable = (clave: ClavePermiso) => clave !== bloqueado

    const marcado = alternarGrupo(new Set(), USUARIOS, editable)
    expect(marcado.has(bloqueado)).toBe(false)
    expect(marcado.size).toBe(USUARIOS.length - 1)

    // Con los editables completos, desmarca solo esos y respeta el bloqueado.
    const conBloqueado = new Set<ClavePermiso>([...USUARIOS])
    const resultado = alternarGrupo(conBloqueado, USUARIOS, editable)
    expect([...resultado]).toEqual([bloqueado])
  })

  it("no muta la selección original", () => {
    const original = new Set<ClavePermiso>()
    alternarGrupo(original, USUARIOS, todos)
    expect(original.size).toBe(0)
  })
})

describe("calcularDiff (cálculo del diff)", () => {
  it("devuelve lo que se otorga y lo que se retira, en orden del catálogo", () => {
    const diff = calcularDiff(
      ["roles.ver", "usuarios.ver", "inicio.admin"],
      ["usuarios.ver", "roles.gestionar", "analitica.global"]
    )
    expect(diff).toEqual({
      agregar: ["analitica.global", "roles.gestionar"],
      quitar: ["inicio.admin", "roles.ver"],
    })
    expect(totalCambios(diff)).toBe(4)
  })

  it("sin cambios da listas vacías e ignora claves desconocidas y el orden", () => {
    const diff = calcularDiff(
      ["roles.ver", "inicio.admin", "fantasma.ver"],
      ["inicio.admin", "roles.ver"]
    )
    expect(diff).toEqual({ agregar: [], quitar: [] })
    expect(totalCambios(diff)).toBe(0)
  })

  it("del rol vacío al rol ADMIN otorga todos sus permisos", () => {
    const admin = permisosDeRol("ADMIN")
    expect(calcularDiff([], admin)).toEqual({ agregar: [...admin], quitar: [] })
  })
})

describe("diffPorModulo", () => {
  it("agrupa los cambios por módulo con sus títulos y omite los módulos sin cambios", () => {
    const grupos = diffPorModulo({
      agregar: ["usuarios.invitar", "pagos.registrar"],
      quitar: ["usuarios.ver"],
    })
    expect(grupos).toEqual([
      {
        modulo: "usuarios",
        titulo: "Usuarios",
        agregar: ["usuarios.invitar"],
        quitar: ["usuarios.ver"],
      },
      {
        modulo: "pagos",
        titulo: "Pagos",
        agregar: ["pagos.registrar"],
        quitar: [],
      },
    ])
  })

  it("sin cambios no devuelve grupos", () => {
    expect(diffPorModulo({ agregar: [], quitar: [] })).toEqual([])
  })
})
