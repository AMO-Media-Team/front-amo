import { describe, expect, it } from "vitest"

import { DIAS_MAXIMOS_RANGO } from "../../src/features/geo/estado-url"
import {
  agruparSentencias,
  aplicarSetCookie,
  avisoCarga,
  bloqueMedicion,
  cabeceraCookie,
  cercaDelUmbral,
  conclusiones,
  type Consulta,
  consultasDe,
  DIAS_PERIODO_MAXIMO,
  diferenciaFunciones,
  etiquetaConsulta,
  type FuncionMedida,
  incumplidos,
  leerArgumentos,
  leerMensajeAutoExplain,
  leerTiempos,
  peor,
  percentil,
  periodosDe,
  type Resultado,
  resumir,
  rutaApi,
  sqlDe,
  tablaResultados,
} from "./rendimiento-geo"

const PERIODO = {
  etiqueta: "30 días",
  desde: "2026-09-25",
  hasta: "2026-10-24",
}

function resultado(
  consulta: string,
  p95: number | null,
  error: string | null = null
): Resultado {
  return {
    consulta,
    periodo: "30 días",
    resumen: p95 === null ? null : { n: 20, p50: p95 / 2, p95, max: p95 + 1 },
    error,
  }
}

describe("leerArgumentos", () => {
  it("mide en local con N = 20, el servidor del 3000 y la cuenta de pista por defecto", () => {
    expect(leerArgumentos([])).toEqual({
      entorno: "local",
      n: 20,
      url: "http://localhost:3000",
      cuenta: ".cuentas-pista/rendimiento.json",
      e2e: true,
      explain: true,
      json: null,
    })
  })

  it("lee las opciones", () => {
    expect(
      leerArgumentos([
        "develop",
        "--n",
        "50",
        "--url",
        "http://localhost:3107/",
        "--sin-e2e",
        "--sin-explain",
        "--json",
        "salida.json",
      ])
    ).toMatchObject({
      entorno: "develop",
      n: 50,
      url: "http://localhost:3107",
      e2e: false,
      explain: false,
      json: "salida.json",
    })
  })

  it("nunca mide en producción y rechaza lo que no entiende", () => {
    expect(() => leerArgumentos(["produccion"])).toThrow(/nunca en producción/)
    expect(() => leerArgumentos(["staging"])).toThrow(/local o develop/)
    expect(() => leerArgumentos(["local", "develop"])).toThrow(
      /un solo entorno/
    )
    expect(() => leerArgumentos(["--rapido"])).toThrow(/--rapido/)
    expect(() => leerArgumentos(["--n", "10"])).toThrow(/entre 20 y 500/)
    expect(() => leerArgumentos(["--n"])).toThrow(/necesita un valor/)
    expect(() => leerArgumentos(["--url", "ftp://x"])).toThrow(/http/)
  })
})

describe("periodos y combinaciones", () => {
  it("usa el día de Bogotá: 30 días, 12 meses y el máximo del explorador", () => {
    // 10 p. m. del 24 en Bogotá ya es el 25 en UTC.
    expect(periodosDe(new Date("2026-10-25T03:00:00Z"))).toEqual([
      { etiqueta: "30 días", desde: "2026-09-25", hasta: "2026-10-24" },
      { etiqueta: "12 meses", desde: "2025-10-25", hasta: "2026-10-24" },
      { etiqueta: "máximo", desde: "2024-10-24", hasta: "2026-10-24" },
    ])
    expect(DIAS_PERIODO_MAXIMO).toBe(DIAS_MAXIMOS_RANGO)
  })

  it("mide cada métrica de cada nivel y el detalle de una zona por nivel", () => {
    const consultas = consultasDe([PERIODO])
    const mapa = consultas.filter((c) => c.funcion === "geo_metricas")
    const detalle = consultas.filter((c) => c.funcion === "detalle_zona_geo")
    expect(mapa.filter((c) => c.nivel === "internacional")).toHaveLength(3)
    expect(mapa.filter((c) => c.nivel === "nacional")).toHaveLength(8)
    expect(mapa.filter((c) => c.nivel === "departamental")).toHaveLength(8)
    expect(detalle.map((c) => c.nivel)).toEqual([
      "internacional",
      "nacional",
      "departamental",
    ])
    expect(consultasDe([PERIODO, PERIODO])).toHaveLength(44)
    expect(etiquetaConsulta(detalle[2] as Consulta)).toBe(
      "detalle_zona_geo · departamental (05001)"
    )
  })
})

describe("SQL de la medición", () => {
  const nacional: Consulta = {
    funcion: "geo_metricas",
    nivel: "nacional",
    metrica: "gmv",
    periodo: PERIODO,
  }

  it("llama a las RPC con el nivel de la base y el departamento solo en el nivel departamental", () => {
    expect(sqlDe(nacional)).toBe(
      "select count(*) from public.geo_metricas('departamento', 'gmv', '2026-09-25'::date, '2026-10-24'::date, null)"
    )
    expect(sqlDe({ ...nacional, nivel: "departamental" })).toBe(
      "select count(*) from public.geo_metricas('municipio', 'gmv', '2026-09-25'::date, '2026-10-24'::date, '05')"
    )
    expect(
      sqlDe({
        ...nacional,
        funcion: "detalle_zona_geo",
        nivel: "internacional",
      })
    ).toBe(
      "select count(*) from public.detalle_zona_geo('pais', 'CO', '2026-09-25'::date, '2026-10-24'::date)"
    )
  })

  it("no interpola texto libre ni fechas inválidas", () => {
    expect(() =>
      sqlDe({ ...nacional, metrica: "gmv'); drop table x; --" as "gmv" })
    ).toThrow(/Valor inesperado/)
    expect(() =>
      sqlDe({ ...nacional, periodo: { ...PERIODO, desde: "2026-02-30" } })
    ).toThrow(/Fecha inválida/)
  })

  it("repite la consulta con calentamiento y deja solo los tiempos medidos", () => {
    const bloque = bloqueMedicion("select 1", 20)
    expect(bloque).toContain("for i in 1..1 loop")
    expect(bloque).toContain(
      "while coalesce(array_length(v_tiempos, 1), 0) < 20 loop"
    )
    expect(bloque).toContain("perform (select 1);")
    // Una vuelta con el reloj hacia atrás no cuenta.
    expect(bloque).toContain("if v_ms >= 0 then")
    expect(bloque).toContain("set_config('amo.rendimiento_ms'")
    expect(() => bloqueMedicion("select '$medicion$'", 20)).toThrow()
  })

  it("lee los tiempos que dejó el bloque", () => {
    expect(leerTiempos("1.5,2,3.25", 3)).toEqual([1.5, 2, 3.25])
    expect(() => leerTiempos("1,2", 3)).toThrow(/3 tiempos/)
    expect(() => leerTiempos(null, 1)).toThrow()
    expect(() => leerTiempos("1,x", 2)).toThrow(/inválido en la medición: x/)
    expect(() => leerTiempos("1,-0.2", 2)).toThrow(/-0\.2/)
  })
})

describe("estadística", () => {
  const veinte = Array.from({ length: 20 }, (_, i) => 20 - i)

  it("calcula percentiles por rango más cercano", () => {
    expect(percentil(veinte, 95)).toBe(19)
    expect(percentil(veinte, 50)).toBe(10)
    expect(percentil(veinte, 100)).toBe(20)
    expect(percentil([7], 95)).toBe(7)
    expect(percentil([], 95)).toBeNaN()
    expect(resumir(veinte)).toEqual({ n: 20, p50: 10, p95: 19, max: 20 })
  })

  it("separa lo que incumple, lo que tiene poco margen y el peor caso", () => {
    const resultados = [
      resultado("a", 120),
      resultado("b", 310),
      resultado("c", 250),
      resultado("d", null, "sin permiso"),
      resultado("e", 300),
    ]
    expect(incumplidos(resultados).map((r) => r.consulta)).toEqual([
      "d",
      "b",
      "e",
    ])
    expect(cercaDelUmbral(resultados).map((r) => r.consulta)).toEqual(["c"])
    expect(peor(resultados)?.consulta).toBe("b")
    expect(peor([])).toBeNull()
  })

  it("avisa cuando la máquina está ocupada", () => {
    expect(avisoCarga(2, 12)).toBeNull()
    expect(avisoCarga(20.66, 12)).toMatch(/carga 20,7 con 12 núcleos/)
    expect(avisoCarga(5, 0)).toBeNull()
  })

  it("arma la tabla con marcas para lo que falla o va justo", () => {
    const tabla = tablaResultados([
      resultado("rápida", 12.34),
      resultado("justa", 250),
      resultado("lenta", 301),
      resultado("rota", null, "AMO_NO_AUTORIZADO"),
    ])
    expect(tabla[0]).toMatch(/Consulta .*Periodo .*p50 .*p95 .*máx/)
    expect(tabla[1]).toMatch(/rápida .*12,3/)
    expect(tabla[1]).not.toMatch(/[✗⚠]/)
    expect(tabla[2]).toMatch(/⚠ cerca$/)
    expect(tabla[3]).toMatch(/✗$/)
    expect(tabla[4]).toMatch(/✗ AMO_NO_AUTORIZADO/)
  })
})

describe("extremo a extremo", () => {
  it("pide a la API lo mismo que el explorador", () => {
    const mapa = new URL(
      rutaApi("http://localhost:3000", {
        funcion: "geo_metricas",
        nivel: "departamental",
        metrica: "gmv",
        periodo: PERIODO,
      })
    )
    expect(mapa.pathname).toBe("/api/geo/metricas")
    expect(Object.fromEntries(mapa.searchParams)).toEqual({
      vista: "mapa",
      nivel: "departamental",
      metrica: "gmv",
      desde: "2026-09-25",
      hasta: "2026-10-24",
      depto: "05",
    })
    const detalle = new URL(
      rutaApi("http://localhost:3000", {
        funcion: "detalle_zona_geo",
        nivel: "internacional",
        metrica: "anunciantes",
        periodo: PERIODO,
      })
    )
    expect(detalle.searchParams.get("vista")).toBe("detalle")
    expect(detalle.searchParams.get("zona")).toBe("CO")
    expect(detalle.searchParams.has("depto")).toBe(false)
  })

  it("sigue el refresco de la sesión que hace el proxy", () => {
    const tarro = new Map([
      ["sb-127-auth-token", "base64-viejo"],
      ["otra", "1"],
    ])
    aplicarSetCookie(tarro, [
      "sb-127-auth-token=base64-nuevo; Path=/; Max-Age=43200; SameSite=Lax",
      "otra=; Path=/; Max-Age=0",
      "vencida=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "sin-igual",
    ])
    expect([...tarro]).toEqual([["sb-127-auth-token", "base64-nuevo"]])
    tarro.set("amo_vista", "1")
    expect(cabeceraCookie(tarro)).toBe(
      "sb-127-auth-token=base64-nuevo; amo_vista=1"
    )
  })
})

describe("EXPLAIN", () => {
  it("resta las estadísticas por función de antes y después", () => {
    const base = { lenguaje: "sql", conSet: true }
    expect(
      diferenciaFunciones(
        [
          { ...base, funcion: "private.a", llamadas: 10, total: 5, propio: 5 },
          { ...base, funcion: "private.b", llamadas: 3, total: 1, propio: 1 },
        ],
        [
          {
            ...base,
            funcion: "private.a",
            llamadas: 110,
            total: 25,
            propio: 20,
          },
          { ...base, funcion: "private.b", llamadas: 3, total: 1, propio: 1 },
          { ...base, funcion: "private.c", llamadas: 2, total: 40, propio: 1 },
        ]
      )
    ).toEqual([
      { ...base, funcion: "private.c", llamadas: 2, totalMs: 40, propioMs: 1 },
      {
        ...base,
        funcion: "private.a",
        llamadas: 100,
        totalMs: 20,
        propioMs: 15,
      },
    ])
  })

  const MENSAJE = [
    "duration: 12.500 ms  plan:",
    "Query Text: select z.codigo, sum(a.monto_bruto)",
    "      from public.asignaciones a",
    "HashAggregate  (cost=1.00..2.00 rows=10 width=40) (actual time=12.1..12.2 rows=33 loops=1)",
    "  ->  Seq Scan on medios m  (cost=0.00..9.05 rows=305 width=19) (actual time=0.01..0.05 rows=305 loops=2)",
    "        Filter: (estado = 'VERIFICADO'::medio_estado)",
    "        Rows Removed by Filter: 900",
    "  ->  Index Only Scan using asignaciones_aceptada_cubierta_idx on asignaciones a  (cost=0.29..80.00 rows=500 width=40) (actual time=0.02..1.00 rows=480 loops=1)",
  ].join("\n")

  it("lee un mensaje de auto_explain", () => {
    expect(leerMensajeAutoExplain(MENSAJE)).toEqual({
      duracionMs: 12.5,
      consulta:
        "select z.codigo, sum(a.monto_bruto) from public.asignaciones a",
      nodos: [
        "Seq Scan on medios",
        "Index Only Scan using asignaciones_aceptada_cubierta_idx",
      ],
      barridos: [{ tabla: "medios", descartadas: 1800 }],
    })
    expect(leerMensajeAutoExplain("AUDIT: SESSION,1,1,READ")).toBeNull()
  })

  it("agrupa las sentencias repetidas de PL/pgSQL", () => {
    const sentencia = leerMensajeAutoExplain(MENSAJE)
    if (!sentencia) throw new Error("sin sentencia")
    const otra = { ...sentencia, consulta: "select 1", duracionMs: 2 }
    expect(
      agruparSentencias([sentencia, { ...sentencia, duracionMs: 3 }, otra])
    ).toEqual([
      {
        consulta: sentencia.consulta,
        veces: 2,
        totalMs: 15.5,
        maxMs: 12.5,
        nodos: sentencia.nodos,
      },
      {
        consulta: "select 1",
        veces: 1,
        totalMs: 2,
        maxMs: 2,
        nodos: sentencia.nodos,
      },
    ])
  })

  it("concluye si conviene un índice y qué más pesa", () => {
    const funciones: FuncionMedida[] = [
      {
        funcion: "private.geo_valores",
        lenguaje: "plpgsql",
        conSet: true,
        llamadas: 122,
        totalMs: 390,
        propioMs: 250,
      },
      {
        funcion: "private.consume_cupo",
        lenguaje: "sql",
        conSet: true,
        llamadas: 34954,
        totalMs: 46,
        propioMs: 45,
      },
      {
        funcion: "private.inicio_dia",
        lenguaje: "sql",
        conSet: true,
        llamadas: 212,
        totalMs: 0.3,
        propioMs: 0.3,
      },
    ]
    const sinBarridos = conclusiones(funciones, [])
    expect(sinBarridos[0]).toMatch(/no conviene uno nuevo/)
    expect(sinBarridos[1]).toMatch(/private\.consume_cupo \(34\.954 llamadas/)
    expect(sinBarridos[1]).not.toMatch(/inicio_dia/)
    expect(sinBarridos[2]).toMatch(/private\.geo_valores: 122 llamadas/)

    const sentencia = leerMensajeAutoExplain(MENSAJE)
    if (!sentencia) throw new Error("sin sentencia")
    expect(conclusiones([], [sentencia])).toEqual([
      expect.stringMatching(/candidatas .*medios \(1\.800 filas descartadas\)/),
    ])
  })
})
