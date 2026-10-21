import { describe, expect, it } from "vitest"

import {
  esquemaFiltrosAccesos,
  estadoTablaAccesos,
  eventosDeResultados,
  type FiltrosAccesos,
  filtrosDeEstado,
  filtrosPostgrestAccesos,
  ordenAccesos,
} from "./estado-accesos"

const VENTANA = {
  desde: "2026-09-01T05:00:00.000Z",
  hastaExclusivo: "2026-10-01T05:00:00.000Z",
}
const USUARIO = "c2b7b4c9-3b92-4ca6-8d16-e05f37b8231c"

const SIN_FILTROS: FiltrosAccesos = {
  q: "",
  resultado: [],
  evento: [],
  pais: [],
  dispositivo: [],
  sospechoso: [],
  motivo: [],
}

const cargar = (consulta: string) =>
  estadoTablaAccesos.cargar(
    Promise.resolve(Object.fromEntries(new URLSearchParams(consulta)))
  )

describe("estado en la URL", () => {
  it("normaliza países a ISO2 en mayúsculas y descarta lo inválido", async () => {
    const estado = await cargar(
      "pais=co,USA,x1,br&resultado=FALLO,RARO&sospechoso=SI&motivo=PAIS_INUSUAL,OTRO&dispositivo=MOVIL"
    )
    expect(filtrosDeEstado(estado)).toEqual({
      ...SIN_FILTROS,
      pais: ["CO", "BR"],
      resultado: ["FALLO"],
      sospechoso: ["SI"],
      motivo: ["PAIS_INUSUAL"],
      dispositivo: ["MOVIL"],
    })
  })

  it("el esquema de la acción exige los mismos formatos", () => {
    expect(esquemaFiltrosAccesos.safeParse(SIN_FILTROS).success).toBe(true)
    expect(
      esquemaFiltrosAccesos.safeParse({ ...SIN_FILTROS, pais: ["co"] }).success
    ).toBe(false)
    expect(
      esquemaFiltrosAccesos.safeParse({ ...SIN_FILTROS, sospechoso: ["NO"] })
        .success
    ).toBe(false)
  })
})

describe("eventosDeResultados", () => {
  it("traduce resultados a los eventos que los producen", () => {
    expect(eventosDeResultados(["FALLO"])).toEqual([
      "LOGIN_FALLIDO",
      "MFA_FALLIDO",
    ])
    expect(eventosDeResultados(["EXITO"])).toEqual([
      "LOGIN_EXITOSO",
      "MFA_EXITOSO",
    ])
    expect(eventosDeResultados([])).toEqual([])
  })
})

describe("filtrosPostgrestAccesos", () => {
  it("ventana y facetas", () => {
    const filtros = filtrosPostgrestAccesos(
      {
        ...SIN_FILTROS,
        resultado: ["BLOQUEO"],
        pais: ["CO", "US"],
        dispositivo: ["ESCRITORIO"],
        sospechoso: ["SI"],
        motivo: ["PAIS_INUSUAL", "MULTIPLES_FALLOS"],
      },
      VENTANA
    )
    expect(filtros).toEqual([
      { columna: "created_at", operador: "gte", valor: VENTANA.desde },
      { columna: "created_at", operador: "lt", valor: VENTANA.hastaExclusivo },
      {
        columna: "evento",
        operador: "in",
        valor: "(LOGIN_BLOQUEADO,SESION_REVOCADA,USUARIO_SUSPENDIDO)",
      },
      { columna: "pais_iso2", operador: "in", valor: "(CO,US)" },
      { columna: "dispositivo", operador: "in", valor: "(ESCRITORIO)" },
      { columna: "es_sospechoso", operador: "is", valor: "true" },
      {
        columna: "motivo_sospecha",
        operador: "in",
        valor: "(PAIS_INUSUAL,MULTIPLES_FALLOS)",
      },
    ])
  })

  it("búsqueda por ciudad, navegador, sistema y personas que coinciden", () => {
    const busqueda = filtrosPostgrestAccesos(
      { ...SIN_FILTROS, q: "medellín" },
      VENTANA,
      [USUARIO, "no-uuid"]
    ).at(-1)
    expect(busqueda).toEqual({
      o: [
        'ciudad.ilike."*medellín*"',
        'navegador.ilike."*medellín*"',
        'sistema_operativo.ilike."*medellín*"',
        `usuario_id.in.(${USUARIO})`,
      ].join(","),
    })
  })
})

describe("ordenAccesos", () => {
  it("fecha, evento o país (con la fecha más reciente como desempate)", () => {
    expect(ordenAccesos({ campo: "fecha", descendente: true })).toEqual([
      { columna: "created_at", ascendente: false },
    ])
    expect(ordenAccesos({ campo: "pais", descendente: false })).toEqual([
      { columna: "pais_iso2", ascendente: true },
      { columna: "created_at", ascendente: false },
    ])
    expect(ordenAccesos({ campo: "evento", descendente: true })[0]).toEqual({
      columna: "evento",
      ascendente: false,
    })
  })
})
