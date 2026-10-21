import { describe, expect, it } from "vitest"

import {
  definirEstadoTabla,
  desplazamiento,
  filtroDeIds,
  filtroDeOpciones,
  hayFiltrosActivos,
  parseAsOrden,
  rangoVisible,
  totalPaginas,
} from "./estado-url"

const definicion = definirEstadoTabla({
  camposOrden: ["nombre", "creado"],
  ordenPorDefecto: { campo: "creado", descendente: true },
  filtros: {
    estado: filtroDeOpciones(["ACTIVO", "SUSPENDIDO"]),
    rol: filtroDeIds(),
  },
})

const UUID_A = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b"

describe("definirEstadoTabla · cargar (servidor)", () => {
  it("sin parámetros devuelve los valores por defecto", () => {
    expect(definicion.cargar("")).toEqual({
      q: "",
      pagina: 1,
      tamano: 20,
      orden: { campo: "creado", descendente: true },
      estado: [],
      rol: [],
    })
  })

  it("lee búsqueda, página, tamaño, orden y filtros", () => {
    const estado = definicion.cargar(
      `?q=%20Ana%20&pagina=3&tamano=50&orden=nombre.asc&estado=ACTIVO,SUSPENDIDO&rol=${UUID_A}`
    )
    expect(estado).toEqual({
      q: "Ana",
      pagina: 3,
      tamano: 50,
      orden: { campo: "nombre", descendente: false },
      estado: ["ACTIVO", "SUSPENDIDO"],
      rol: [UUID_A],
    })
  })

  it("descarta valores inválidos en lugar de romper la página", () => {
    const estado = definicion.cargar(
      "?pagina=0&tamano=33&orden=password.asc&estado=ACTIVO,BORRADO&rol=no-es-uuid"
    )
    expect(estado.pagina).toBe(1)
    expect(estado.tamano).toBe(20)
    expect(estado.orden).toEqual({ campo: "creado", descendente: true })
    expect(estado.estado).toEqual(["ACTIVO"])
    expect(estado.rol).toEqual([])
  })

  it("rechaza páginas negativas, decimales o con texto", () => {
    for (const pagina of ["-2", "1.5", "2a", "", "99999999"]) {
      expect(definicion.cargar(`?pagina=${pagina}`).pagina).toBe(1)
    }
  })

  it("acota la búsqueda a 100 caracteres", () => {
    const larga = "a".repeat(250)
    expect(definicion.cargar(`?q=${larga}`).q).toHaveLength(100)
  })

  it("acepta el objeto searchParams de Next (también como promesa)", async () => {
    await expect(
      definicion.cargar(Promise.resolve({ orden: "nombre.desc", pagina: "2" }))
    ).resolves.toMatchObject({
      orden: { campo: "nombre", descendente: true },
      pagina: 2,
    })
  })
})

describe("definirEstadoTabla · serializar", () => {
  it("omite los valores por defecto para mantener la URL limpia", () => {
    expect(
      definicion.serializar({
        q: "",
        pagina: 1,
        orden: { campo: "creado", descendente: true },
      })
    ).toBe("")
  })

  it("serializa listas con coma y orden como campo.dirección", () => {
    const query = definicion.serializar({
      q: "gómez",
      pagina: 2,
      orden: { campo: "nombre", descendente: false },
      estado: ["ACTIVO", "SUSPENDIDO"],
    })
    const leido = definicion.cargar(query)
    expect(leido).toMatchObject({
      q: "gómez",
      pagina: 2,
      orden: { campo: "nombre", descendente: false },
      estado: ["ACTIVO", "SUSPENDIDO"],
    })
    expect(query).toContain("orden=nombre.asc")
  })

  it("expone las claves de filtro en orden de declaración", () => {
    expect(definicion.clavesFiltro).toEqual(["estado", "rol"])
  })
})

describe("parseAsOrden", () => {
  const parser = parseAsOrden(["email"])

  it("solo admite una dirección válida y un único punto", () => {
    expect(parser.parse("email.desc")).toEqual({
      campo: "email",
      descendente: true,
    })
    expect(parser.parse("email")).toBeNull()
    expect(parser.parse("email.up")).toBeNull()
    expect(parser.parse("email.asc.x")).toBeNull()
  })

  it("compara por valor", () => {
    expect(
      parser.eq?.(
        { campo: "email", descendente: true },
        { campo: "email", descendente: true }
      )
    ).toBe(true)
  })
})

describe("paginación", () => {
  it("calcula el desplazamiento de una página 1-based", () => {
    expect(desplazamiento(1, 20)).toBe(0)
    expect(desplazamiento(3, 20)).toBe(40)
    expect(desplazamiento(0, 20)).toBe(0)
  })

  it("siempre hay al menos una página", () => {
    expect(totalPaginas(0, 20)).toBe(1)
    expect(totalPaginas(57, 20)).toBe(3)
    expect(totalPaginas(60, 20)).toBe(3)
  })

  it("describe el rango visible y lo ajusta si la página no existe", () => {
    expect(rangoVisible(2, 20, 57)).toEqual({ desde: 21, hasta: 40 })
    expect(rangoVisible(3, 20, 57)).toEqual({ desde: 41, hasta: 57 })
    expect(rangoVisible(9, 20, 57)).toEqual({ desde: 41, hasta: 57 })
    expect(rangoVisible(1, 20, 0)).toEqual({ desde: 0, hasta: 0 })
  })
})

describe("hayFiltrosActivos", () => {
  it("considera la búsqueda (sin espacios) y cualquier filtro con valores", () => {
    expect(hayFiltrosActivos("", [[], []])).toBe(false)
    expect(hayFiltrosActivos("   ", [])).toBe(false)
    expect(hayFiltrosActivos(" x ", [[]])).toBe(true)
    expect(hayFiltrosActivos("", [[], [UUID_A]])).toBe(true)
  })
})
