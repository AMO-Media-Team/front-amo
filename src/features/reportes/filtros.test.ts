import { describe, expect, it } from "vitest"

import { serializarFecha } from "@/lib/fechas"

import { filtrosPara, REPORTES, SLUGS_REPORTE } from "./catalogo"
import {
  argumentosComparacion,
  argumentosPeriodo,
  contextoDatos,
  CORTES_SUGERIDOS,
  describirFiltros,
  entradaDesdeValores,
  esquemaValoresFiltros,
  fechaCorteSugerido,
  fechasDelRango,
  filtrosDesdeValores,
  filtrosParaBitacora,
  limitarFiltros,
  MAXIMO_DIAS_PERIODO,
  mesAntes,
  periodoExcedido,
  resolverCorte,
  serializarFiltros,
  textoComparacion,
  type ValoresFiltros,
  valoresDesdeEntrada,
} from "./filtros"

// 11:00 del 5 de octubre de 2026 en Bogotá.
const AHORA = new Date("2026-10-05T16:00:00Z")

const SIN_FILTROS: ValoresFiltros = {
  periodo: null,
  desde: null,
  hasta: null,
  departamento: null,
  anunciante: null,
  sector: null,
  agrupacion: "anunciante",
  corte: null,
}

const dia = (fecha: Date) => serializarFecha(fecha)
const filtros = (parcial: Partial<ValoresFiltros> = {}) =>
  filtrosDesdeValores({ ...SIN_FILTROS, ...parcial }, AHORA)

describe("filtrosDesdeValores", () => {
  it("sin parámetros: últimos 30 días frente a los 30 anteriores y corte de hoy", () => {
    const f = filtros()
    expect(f.rango.preset).toBe("ultimos30")
    expect([dia(f.rango.desde), dia(f.rango.hasta)]).toEqual([
      "2026-09-06",
      "2026-10-05",
    ])
    expect([dia(f.anterior.desde), dia(f.anterior.hasta)]).toEqual([
      "2026-08-07",
      "2026-09-05",
    ])
    expect(dia(f.corte)).toBe("2026-10-05")
    expect(dia(f.corteAnterior)).toBe("2026-09-05")
    expect(f.agrupacion).toBe("anunciante")
  })

  it("el mes anterior se compara con el mes que lo precede, completo", () => {
    const f = filtros({ periodo: "mesAnterior" })
    expect([dia(f.rango.desde), dia(f.rango.hasta)]).toEqual([
      "2026-09-01",
      "2026-09-30",
    ])
    expect([dia(f.anterior.desde), dia(f.anterior.hasta)]).toEqual([
      "2026-08-01",
      "2026-08-31",
    ])
  })

  it("este mes, en curso, se compara con los mismos días del mes anterior", () => {
    const f = filtros({ periodo: "esteMes" })
    expect([dia(f.rango.desde), dia(f.rango.hasta)]).toEqual([
      "2026-10-01",
      "2026-10-05",
    ])
    expect([dia(f.anterior.desde), dia(f.anterior.hasta)]).toEqual([
      "2026-09-01",
      "2026-09-05",
    ])
  })

  it("un enlace con solo desde y hasta es un rango personalizado", () => {
    const f = filtros({ desde: "2026-07-01", hasta: "2026-09-30" })
    expect(f.rango.preset).toBe("personalizado")
    expect([dia(f.rango.desde), dia(f.rango.hasta)]).toEqual([
      "2026-07-01",
      "2026-09-30",
    ])
  })

  it("conserva departamento, anunciante, sector y agrupación", () => {
    const f = filtros({
      departamento: "05",
      anunciante: "11111111-1111-4111-8111-111111111111",
      sector: "22222222-2222-4222-8222-222222222222",
      agrupacion: "mes",
    })
    expect(f.departamento).toBe("05")
    expect(f.anunciante).toBe("11111111-1111-4111-8111-111111111111")
    expect(f.sector).toBe("22222222-2222-4222-8222-222222222222")
    expect(f.agrupacion).toBe("mes")
  })
})

describe("limitarFiltros", () => {
  const ANUNCIANTE = "11111111-1111-4111-8111-111111111111"
  const SECTOR = "22222222-2222-4222-8222-222222222222"
  const todos = filtros({
    departamento: "05",
    anunciante: ANUNCIANTE,
    sector: SECTOR,
    agrupacion: "mes",
  })
  const interno = { anuncianteId: null }
  const anunciante = { anuncianteId: ANUNCIANTE }

  it("descarta lo que el reporte no entiende, venga lo que venga en la URL", () => {
    const f = limitarFiltros(filtrosPara(REPORTES.finanzas, interno), todos)
    expect(f.sector).toBe(SECTOR)
    expect(f.departamento).toBeNull()
    expect(f.anunciante).toBeNull()
    // Periodo, corte y agrupación no se tocan.
    expect(f.rango).toBe(todos.rango)
    expect(f.corte).toBe(todos.corte)
    expect(f.agrupacion).toBe("mes")
  })

  it("a un interno le respeta el anunciante del reporte de campañas", () => {
    const f = limitarFiltros(
      filtrosPara(REPORTES["desempeno-campanas"], interno),
      todos
    )
    expect(f.anunciante).toBe(ANUNCIANTE)
  })

  it("a un anunciante nunca le aplica el filtro por anunciante", () => {
    const f = limitarFiltros(
      filtrosPara(REPORTES["desempeno-campanas"], anunciante),
      todos
    )
    expect(f.anunciante).toBeNull()
    // Ni se describe en el resumen ni en la portada de los documentos.
    expect(
      describirFiltros(REPORTES["desempeno-campanas"], f).map((x) => x.etiqueta)
    ).toEqual(["Periodo", "Comparado con"])
  })
})

describe("filtrosParaBitacora", () => {
  const ANUNCIANTE = "11111111-1111-4111-8111-111111111111"
  const interno = { anuncianteId: null }
  const registro = (
    slug: (typeof SLUGS_REPORTE)[number],
    parcial: Partial<ValoresFiltros> = {},
    usuario: { anuncianteId: string | null } = interno
  ) => {
    const aplicables = filtrosPara(REPORTES[slug], usuario)
    return filtrosParaBitacora(
      aplicables,
      limitarFiltros(aplicables, filtros(parcial))
    )
  }

  it("un reporte por periodo deja el preset y sus fechas resueltas, nada más", () => {
    expect(registro("usuarios-accesos")).toEqual({
      periodo: "ultimos30",
      desde: "2026-09-06",
      hasta: "2026-10-05",
    })
    // Lo que la URL traiga de otros reportes no ensucia el registro.
    expect(
      registro("resumen-ejecutivo", { departamento: "05", agrupacion: "mes" })
    ).toEqual({
      periodo: "ultimos30",
      desde: "2026-09-06",
      hasta: "2026-10-05",
    })
  })

  it("la cartera deja solo su fecha de corte", () => {
    expect(registro("cartera", { corte: "2026-08-31" })).toEqual({
      corte: "2026-08-31",
    })
  })

  it("finanzas deja la agrupación y, si se eligió, el sector", () => {
    expect(
      registro("finanzas", { periodo: "mesAnterior", agrupacion: "sector" })
    ).toEqual({
      periodo: "mesAnterior",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      agrupacion: "sector",
    })
    expect(registro("finanzas", { sector: ANUNCIANTE }).sector).toBe(ANUNCIANTE)
  })

  it("el departamento solo se registra cuando se filtró", () => {
    expect(registro("cumplimiento-medios")).not.toHaveProperty("departamento")
    expect(
      registro("cumplimiento-medios", { departamento: "76" }).departamento
    ).toBe("76")
  })

  it("el anunciante se registra para un interno, nunca para un anunciante", () => {
    const parcial = { anunciante: ANUNCIANTE }
    expect(registro("desempeno-campanas", parcial).anunciante).toBe(ANUNCIANTE)
    expect(
      registro("desempeno-campanas", parcial, { anuncianteId: ANUNCIANTE })
    ).not.toHaveProperty("anunciante")
  })

  it("solo guarda textos cortos: fechas, códigos e identificadores", () => {
    for (const slug of SLUGS_REPORTE) {
      for (const valor of Object.values(registro(slug))) {
        expect(typeof valor).toBe("string")
        expect(valor.length).toBeLessThanOrEqual(36)
      }
    }
  })
})

describe("fecha de corte", () => {
  it("un corte futuro o ilegible se limita a hoy", () => {
    expect(dia(resolverCorte("2026-12-31", AHORA))).toBe("2026-10-05")
    expect(dia(resolverCorte("31/12/2025", AHORA))).toBe("2026-10-05")
    expect(dia(resolverCorte(null, AHORA))).toBe("2026-10-05")
    expect(dia(resolverCorte("2026-08-31", AHORA))).toBe("2026-08-31")
  })

  it("el corte anterior es el mismo día del mes previo (o su último día)", () => {
    expect(dia(mesAntes(new Date("2026-10-05T16:00:00Z")))).toBe("2026-09-05")
    // 31 de marzo → 28 de febrero (2026 no es bisiesto).
    expect(dia(mesAntes(new Date("2026-03-31T16:00:00Z")))).toBe("2026-02-28")
  })

  it("un cierre de mes se compara con el cierre del mes anterior", () => {
    expect(dia(mesAntes(new Date("2026-09-30T16:00:00Z")))).toBe("2026-08-31")
    expect(dia(mesAntes(new Date("2026-02-28T16:00:00Z")))).toBe("2026-01-31")
    // 23:30 del 30 de septiembre en Bogotá (ya 1 de octubre en UTC).
    expect(dia(mesAntes(new Date("2026-10-01T04:30:00Z")))).toBe("2026-08-31")
    expect(dia(filtros({ corte: "2026-09-30" }).corteAnterior)).toBe(
      "2026-08-31"
    )
  })

  it("sugiere los cierres contables habituales", () => {
    const fechas = Object.fromEntries(
      CORTES_SUGERIDOS.map((corte) => [
        corte,
        dia(fechaCorteSugerido(corte, AHORA)),
      ])
    )
    expect(fechas).toEqual({
      hoy: "2026-10-05",
      finMes: "2026-09-30",
      finTrimestre: "2026-09-30",
      finAno: "2025-12-31",
    })
  })

  it("los cierres no dependen de la zona horaria del servidor", () => {
    // 23:30 del 31 de diciembre en Bogotá ya es 1 de enero en UTC.
    const casiAnoNuevo = new Date("2027-01-01T04:30:00Z")
    expect(dia(fechaCorteSugerido("hoy", casiAnoNuevo))).toBe("2026-12-31")
    expect(dia(fechaCorteSugerido("finMes", casiAnoNuevo))).toBe("2026-11-30")
    expect(dia(fechaCorteSugerido("finAno", casiAnoNuevo))).toBe("2025-12-31")
  })
})

describe("contrato con las Server Actions", () => {
  it("la entrada viaja como en la URL y se lee con los mismos parsers", () => {
    const valores: ValoresFiltros = {
      ...SIN_FILTROS,
      periodo: "esteTrimestre",
      departamento: "76",
      agrupacion: "sector",
    }
    const entrada = entradaDesdeValores(valores)
    expect(esquemaValoresFiltros.safeParse(entrada).success).toBe(true)
    expect(valoresDesdeEntrada(entrada)).toEqual(valores)
  })

  it("descarta los valores inválidos en lugar de fallar, igual que la URL", () => {
    const valores = valoresDesdeEntrada({
      periodo: null,
      desde: "ayer",
      hasta: "2026-02-30",
      departamento: "XX",
      anunciante: "no-es-uuid",
      sector: "'; drop table--",
      agrupacion: null,
      corte: "2026-13-01",
    })
    expect(valores).toEqual(SIN_FILTROS)
  })

  it("rechaza presets y agrupaciones desconocidos y textos desmedidos", () => {
    const base = entradaDesdeValores(SIN_FILTROS)
    expect(
      esquemaValoresFiltros.safeParse({ ...base, periodo: "siempre" }).success
    ).toBe(false)
    expect(
      esquemaValoresFiltros.safeParse({ ...base, agrupacion: "medio" }).success
    ).toBe(false)
    expect(
      esquemaValoresFiltros.safeParse({ ...base, anunciante: "x".repeat(37) })
        .success
    ).toBe(false)
  })

  it("serializa solo lo que difiere del valor por defecto", () => {
    expect(serializarFiltros(SIN_FILTROS)).toBe("")
    expect(
      serializarFiltros({
        ...SIN_FILTROS,
        periodo: "esteAno",
        departamento: "05",
      })
    ).toBe("?periodo=esteAno&departamento=05")
  })
})

describe("argumentos de las RPC", () => {
  it("envía fechas de Bogotá inclusivas y el periodo de comparación explícito", () => {
    const f = filtros({ periodo: "mesAnterior" })
    expect(argumentosPeriodo(f.rango)).toEqual({
      p_desde: "2026-09-01",
      p_hasta: "2026-09-30",
    })
    expect(argumentosComparacion(f)).toEqual({
      p_desde: "2026-09-01",
      p_hasta: "2026-09-30",
      p_desde_ant: "2026-08-01",
      p_hasta_ant: "2026-08-31",
    })
  })
})

describe("filtros en palabras", () => {
  it("nombra el periodo con sus fechas y el periodo de comparación", () => {
    const f = filtros({ periodo: "mesAnterior" })
    expect(fechasDelRango(f.rango)).toMatch(/^1.+30 de sept de 2026$/)
    expect(textoComparacion(f)).toMatch(
      /^frente al mes anterior \(1.+31 de ago de 2026\)$/
    )

    const lista = describirFiltros(REPORTES["resumen-ejecutivo"], f)
    expect(lista.map((x) => x.etiqueta)).toEqual(["Periodo", "Comparado con"])
    expect(lista[0].valor).toMatch(/^Mes anterior \(1.+30 de sept de 2026\)$/)
  })

  it("un rango personalizado no repite sus fechas", () => {
    const f = filtros({ desde: "2026-07-01", hasta: "2026-09-30" })
    const [periodo] = describirFiltros(REPORTES.finanzas, f)
    expect(periodo.valor).toBe(fechasDelRango(f.rango))
    expect(periodo.valor).not.toContain("(")
  })

  it("la cartera habla de fecha de corte, no de periodo", () => {
    const lista = describirFiltros(
      REPORTES.cartera,
      filtros({ corte: "2026-08-31" })
    )
    expect(lista).toEqual([
      { etiqueta: "Fecha de corte", valor: "31 de agosto de 2026" },
      { etiqueta: "Comparado con el corte del", valor: "31 de julio de 2026" },
    ])
  })

  it("el departamento dice «Todo el país» cuando no se filtra", () => {
    const sinFiltro = describirFiltros(
      REPORTES["cobertura-territorial"],
      filtros()
    )
    expect(sinFiltro.at(-1)).toEqual({
      etiqueta: "Departamento",
      valor: "Todo el país",
    })
    const conFiltro = describirFiltros(
      REPORTES["cobertura-territorial"],
      filtros({ departamento: "05" })
    )
    expect(conFiltro.at(-1)).toEqual({
      etiqueta: "Departamento",
      valor: "Antioquia",
    })
  })

  it("anunciante y sector solo aparecen si se eligieron, con su nombre", () => {
    const id = "11111111-1111-4111-8111-111111111111"
    expect(
      describirFiltros(REPORTES["desempeno-campanas"], filtros()).map(
        (x) => x.etiqueta
      )
    ).not.toContain("Anunciante")
    expect(
      describirFiltros(
        REPORTES["desempeno-campanas"],
        filtros({ anunciante: id }),
        {
          anunciante: "Clínica del Norte",
        }
      ).at(-1)
    ).toEqual({ etiqueta: "Anunciante", valor: "Clínica del Norte" })
    // Sin nombre (no visible para quien consulta) no se filtra el id.
    expect(
      describirFiltros(REPORTES.finanzas, filtros({ sector: id })).find(
        (x) => x.etiqueta === "Sector"
      )?.valor
    ).toBe("Sector seleccionado")
  })

  it("solo describe los filtros que el reporte entiende", () => {
    const todos = filtros({
      departamento: "05",
      anunciante: "11111111-1111-4111-8111-111111111111",
      sector: "22222222-2222-4222-8222-222222222222",
      agrupacion: "mes",
    })
    expect(
      describirFiltros(REPORTES["usuarios-accesos"], todos).map(
        (x) => x.etiqueta
      )
    ).toEqual(["Periodo", "Comparado con"])
    expect(describirFiltros(REPORTES.finanzas, todos).at(-1)).toEqual({
      etiqueta: "Detalle por",
      valor: "Mes",
    })
  })
})

describe("contextoDatos", () => {
  it("con periodo: comparativo en palabras y fechas para los enlaces", () => {
    const contexto = contextoDatos(
      REPORTES["cumplimiento-medios"],
      filtros({ periodo: "mesAnterior" }),
      20
    )
    expect(contexto.nMinimo).toBe(20)
    expect(contexto.periodo).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    })
    expect(contexto.comparacion).toMatch(/^frente al mes anterior \(/)
  })

  it("con fecha de corte no hay periodo y se compara con el corte anterior", () => {
    const contexto = contextoDatos(REPORTES.cartera, filtros(), 20)
    expect(contexto.periodo).toBeNull()
    expect(contexto.comparacion).toBe(
      "frente al corte anterior (5 de septiembre de 2026)"
    )
  })

  it("todos los reportes del catálogo tienen contexto", () => {
    for (const slug of SLUGS_REPORTE) {
      const contexto = contextoDatos(REPORTES[slug], filtros(), 20)
      expect(contexto.filtros.length).toBeGreaterThan(0)
      expect(contexto.comparacion).not.toBeNull()
    }
  })
})

describe("periodoExcedido", () => {
  it("diez años caben; un día más, no", () => {
    // 1 de ene de 2016 → 8 de ene de 2026 son 3.661 días inclusivos.
    const justo = filtros({ desde: "2016-01-01", hasta: "2026-01-08" })
    expect(periodoExcedido(REPORTES.finanzas, justo)).toBe(false)
    const pasado = filtros({ desde: "2015-12-31", hasta: "2026-01-08" })
    expect(periodoExcedido(REPORTES.finanzas, pasado)).toBe(true)
    expect(MAXIMO_DIAS_PERIODO).toBe(3661)
  })

  it("los periodos habituales nunca lo superan", () => {
    for (const periodo of [
      "hoy",
      "ultimos30",
      "esteTrimestre",
      "esteAno",
    ] as const) {
      expect(periodoExcedido(REPORTES.finanzas, filtros({ periodo }))).toBe(
        false
      )
    }
  })

  it("no aplica a la cartera, que consulta una fecha de corte", () => {
    const largo = filtros({ desde: "2000-01-01", hasta: "2026-10-05" })
    expect(periodoExcedido(REPORTES.cartera, largo)).toBe(false)
  })
})
