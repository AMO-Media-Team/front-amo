import { describe, expect, it } from "vitest"

import { ACCIONES_SENSIBLES, ENTIDADES_CONFIGURACION } from "./catalogo"
import {
  ACTOR_SISTEMA,
  cargarPresentacion,
  esquemaFiltrosBitacora,
  estadoTablaBitacora,
  type FiltrosBitacora,
  filtrosDeEstado,
  filtrosPostgrestBitacora,
  firmaFiltros,
  ordenBitacora,
} from "./estado-bitacora"

const UUID_A = "33992fcd-61ff-46ab-b5c5-a493aaeac64a"
const UUID_B = "c2b7b4c9-3b92-4ca6-8d16-e05f37b8231c"
const VENTANA = {
  desde: "2026-09-01T05:00:00.000Z",
  hastaExclusivo: "2026-10-01T05:00:00.000Z",
}

const SIN_FILTROS: FiltrosBitacora = {
  q: "",
  accion: [],
  entidad: [],
  actor: [],
  origen: [],
  grupo: [],
}

const cargar = (consulta: string) =>
  estadoTablaBitacora.cargar(
    Promise.resolve(Object.fromEntries(new URLSearchParams(consulta)))
  )

describe("estado en la URL", () => {
  it("valores por defecto: fecha descendente, sin filtros", async () => {
    const estado = await cargar("")
    expect(estado.orden).toEqual({ campo: "fecha", descendente: true })
    expect(filtrosDeEstado(estado)).toEqual(SIN_FILTROS)
  })

  it("descarta valores inválidos de facetas, actores y entidades", async () => {
    const estado = await cargar(
      `accion=EXPORTAR,HACKEAR&origen=DEMO&actor=${ACTOR_SISTEMA},${UUID_A.toUpperCase()},no-uuid&entidad=perfiles,DROP%20TABLE&grupo=SENSIBLES`
    )
    expect(estado.accion).toEqual(["EXPORTAR"])
    expect(estado.origen).toEqual(["DEMO"])
    expect(estado.actor).toEqual([ACTOR_SISTEMA, UUID_A])
    expect(estado.entidad).toEqual(["perfiles"])
    expect(estado.grupo).toEqual(["SENSIBLES"])
  })

  it("el esquema de las acciones rechaza lo que la URL no admitiría", () => {
    expect(esquemaFiltrosBitacora.safeParse(SIN_FILTROS).success).toBe(true)
    expect(
      esquemaFiltrosBitacora.safeParse({
        ...SIN_FILTROS,
        actor: ["robert'); drop"],
      }).success
    ).toBe(false)
    expect(
      esquemaFiltrosBitacora.safeParse({
        ...SIN_FILTROS,
        entidad: ["Perfiles"],
      }).success
    ).toBe(false)
    expect(
      esquemaFiltrosBitacora.safeParse({ ...SIN_FILTROS, q: "x".repeat(101) })
        .success
    ).toBe(false)
  })

  it("evento del panel: solo ids positivos dentro del rango seguro", async () => {
    const evento = async (valor: string) =>
      (await cargarPresentacion(Promise.resolve({ evento: valor }))).evento
    expect(await evento("2279")).toBe(2279)
    expect(await evento("0")).toBeNull()
    expect(await evento("-5")).toBeNull()
    expect(await evento("99999999999999999999")).toBeNull()
    expect(await evento("abc")).toBeNull()
  })

  it("la firma cambia con el periodo o los filtros", () => {
    const base = firmaFiltros(SIN_FILTROS, "a")
    expect(firmaFiltros(SIN_FILTROS, "a")).toBe(base)
    expect(firmaFiltros(SIN_FILTROS, "b")).not.toBe(base)
    expect(firmaFiltros({ ...SIN_FILTROS, q: "x" }, "a")).not.toBe(base)
  })
})

describe("filtrosPostgrestBitacora", () => {
  it("siempre acota a la ventana del periodo", () => {
    expect(filtrosPostgrestBitacora(SIN_FILTROS, VENTANA)).toEqual([
      { columna: "created_at", operador: "gte", valor: VENTANA.desde },
      { columna: "created_at", operador: "lt", valor: VENTANA.hastaExclusivo },
    ])
  })

  it("facetas simples con in.(…)", () => {
    const filtros = filtrosPostgrestBitacora(
      {
        ...SIN_FILTROS,
        accion: ["INSERT", "DELETE"],
        origen: ["API_DIRECTA"],
        entidad: ["roles"],
      },
      VENTANA
    ).slice(2)
    expect(filtros).toEqual([
      { columna: "accion", operador: "in", valor: "(INSERT,DELETE)" },
      { columna: "origen", operador: "in", valor: "(API_DIRECTA)" },
      { columna: "entidad", operador: "in", valor: "(roles)" },
    ])
  })

  it("actores: personas, solo sistema (sin actor) o ambos", () => {
    const personas = filtrosPostgrestBitacora(
      { ...SIN_FILTROS, actor: [UUID_A, UUID_B] },
      VENTANA
    )
    expect(personas.at(-1)).toEqual({
      columna: "actor_id",
      operador: "in",
      valor: `(${UUID_A},${UUID_B})`,
    })

    const sistema = filtrosPostgrestBitacora(
      { ...SIN_FILTROS, actor: [ACTOR_SISTEMA] },
      VENTANA
    )
    expect(sistema.at(-1)).toEqual({
      columna: "actor_id",
      operador: "is",
      valor: "null",
    })

    const ambos = filtrosPostgrestBitacora(
      { ...SIN_FILTROS, actor: [ACTOR_SISTEMA, UUID_A] },
      VENTANA
    )
    expect(ambos.at(-1)).toEqual({
      o: `actor_id.in.(${UUID_A}),actor_id.is.null`,
    })
  })

  it("categorías: sensibles y configuración en un solo or", () => {
    const [grupo] = filtrosPostgrestBitacora(
      { ...SIN_FILTROS, grupo: ["SENSIBLES", "CONFIGURACION"] },
      VENTANA
    ).slice(2)
    expect(grupo).toEqual({
      o: [
        `accion.in.(${ACCIONES_SENSIBLES.join(",")})`,
        "origen.eq.API_DIRECTA",
        "accion.eq.CONFIGURAR",
        `entidad.in.(${ENTIDADES_CONFIGURACION.join(",")})`,
      ].join(","),
    })
  })

  it("búsqueda: columnas de texto, personas que coinciden y número de evento", () => {
    const [busqueda] = filtrosPostgrestBitacora(
      { ...SIN_FILTROS, q: "#1047" },
      VENTANA,
      [UUID_A, "no-es-uuid"]
    ).slice(2)
    expect(busqueda).toEqual({
      o: [
        'actor_email.ilike."*#1047*"',
        'entidad.ilike."*#1047*"',
        'entidad_id.ilike."*#1047*"',
        'motivo.ilike."*#1047*"',
        `actor_id.in.(${UUID_A})`,
        "id.eq.1047",
      ].join(","),
    })
  })

  it("una búsqueda vacía o solo con símbolos no filtra", () => {
    expect(
      filtrosPostgrestBitacora({ ...SIN_FILTROS, q: " ,() " }, VENTANA)
    ).toHaveLength(2)
  })
})

describe("ordenBitacora", () => {
  it("por fecha, o por acción/entidad con la fecha más reciente como desempate", () => {
    expect(ordenBitacora({ campo: "fecha", descendente: false })).toEqual([
      { columna: "created_at", ascendente: true },
    ])
    expect(ordenBitacora({ campo: "accion", descendente: false })).toEqual([
      { columna: "accion", ascendente: true },
      { columna: "created_at", ascendente: false },
    ])
    expect(ordenBitacora({ campo: "entidad", descendente: true })).toEqual([
      { columna: "entidad", ascendente: false },
      { columna: "created_at", ascendente: false },
    ])
  })
})
