import { describe, expect, it } from "vitest"

import { REPORTES, SLUGS_REPORTE, type SlugReporte } from "../catalogo"
import type { ColumnaReporte } from "../columnas"
import {
  datosCarteraEjemplo,
  datosCoberturaEjemplo,
  datosCumplimientoEjemplo,
  datosDesempenoEjemplo,
  datosEjemplo,
  datosFinanzasEjemplo,
  datosResumenEjemplo,
  datosUsuariosAccesosEjemplo,
  datosVacios,
  filtrosEjemplo,
  contextoEjemplo,
} from "../fixtures"
import { AGRUPACIONES } from "../filtros"
import { ETIQUETA_CUENTAS_DE_HOY, ETIQUETA_FOTO } from "../indicadores"
import type { FacetaReporte } from "../tabla"
import type {
  ContenidoReporte,
  DatosReporte,
  FilaCampana,
  FilaCartera,
  FilaCobertura,
  FilaCumplimiento,
  FilaUsuarioAcceso,
} from "../tipos"
import {
  columnasCartera,
  estadoTablaCartera,
  facetasCartera,
  moraAnunciante,
  saldoVencido,
  totalesCartera,
  vistaCartera,
} from "./cartera"
import {
  columnasCobertura,
  columnasCoberturaPara,
  estadoCobertura,
  estadoTablaCobertura,
  facetasCobertura,
  nombresDeMunicipios,
  nombreZona,
  vistaCobertura,
} from "./cobertura-territorial"
import { nombrePlataforma } from "./comun"
import {
  columnasCumplimiento,
  estadoTablaCumplimiento,
  facetasCumplimiento,
  situacionMedio,
  ubicacionMedio,
  vistaCumplimiento,
} from "./cumplimiento-medios"
import {
  columnasDesempeno,
  estadoTablaDesempeno,
  facetasDesempeno,
  razonPonderada,
  totalesDesempeno,
  vistaDesempeno,
} from "./desempeno-campanas"
import {
  columnasFinanzas,
  estadoTablaFinanzas,
  facetasFinanzas,
  totalesFinanzas,
  vistaFinanzas,
} from "./finanzas"
import { contenidoReporte } from "./index"
import {
  columnasResumen,
  estadoTablaResumen,
  facetasResumen,
  filasResumen,
  KPIS_CABECERA,
  vistaResumen,
  zonasComparadas,
} from "./resumen-ejecutivo"
import {
  columnasUsuariosAccesos,
  estadoTablaUsuariosAccesos,
  facetasUsuariosAccesos,
  nombreUsuario,
  totalesAccesos,
  vistaUsuariosAccesos,
} from "./usuarios-accesos"

const contenido = (slug: SlugReporte, vacio = false): ContenidoReporte =>
  contenidoReporte({
    reporte: slug,
    datos: vacio ? datosVacios(slug) : datosEjemplo(slug),
  } as DatosReporte)

const grafico = (c: ContenidoReporte, id: string) => {
  const encontrado = c.vista.graficos.find((g) => g.id === id)
  if (!encontrado) throw new Error(`Falta el gráfico ${id}`)
  return encontrado
}

const indicadorDe = (c: ContenidoReporte, clave: string) => {
  const encontrado = c.vista.indicadores.find((ind) => ind.clave === clave)
  if (!encontrado) throw new Error(`Falta el indicador ${clave}`)
  return encontrado
}

// ── Contrato común de los siete reportes ─────────────────────────────────────

describe.each(SLUGS_REPORTE)("contenido de %s", (slug) => {
  const conDatos = contenido(slug)
  const sinDatos = contenido(slug, true)

  it("tiene las tarjetas de cabecera que anuncia el catálogo", () => {
    expect(conDatos.vista.indicadores).toHaveLength(REPORTES[slug].indicadores)
    expect(sinDatos.vista.indicadores).toHaveLength(REPORTES[slug].indicadores)
    const claves = conDatos.vista.indicadores.map((ind) => ind.clave)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it("cada indicador se explica en lenguaje llano", () => {
    for (const ind of conDatos.vista.indicadores) {
      expect(ind.titulo.length).toBeGreaterThan(2)
      expect(ind.definicion?.definicion.length ?? 0).toBeGreaterThan(20)
      expect(ind.definicion?.ancla).toBeTruthy()
    }
  })

  it("ofrece entre uno y cuatro gráficos con datos y estado vacío propio", () => {
    const { graficos } = conDatos.vista
    expect(graficos.length).toBeGreaterThanOrEqual(1)
    expect(graficos.length).toBeLessThanOrEqual(4)
    expect(new Set(graficos.map((g) => g.id)).size).toBe(graficos.length)
    for (const g of graficos) expect(g.vacio).toBe(false)
    for (const g of sinDatos.vista.graficos) {
      expect(g.vacio).not.toBe(false)
      if (g.vacio) expect(g.vacio.titulo.length).toBeGreaterThan(5)
    }
  })

  it("la tabla exportable es coherente en Excel y PDF", () => {
    const { tabla } = conDatos
    expect(tabla.filas.length).toBeGreaterThan(0)
    expect(tabla.filasPdf).toHaveLength(tabla.filas.length)
    for (const fila of tabla.filas)
      expect(fila).toHaveLength(tabla.columnas.length)
    for (const fila of tabla.filasPdf) {
      expect(fila).toHaveLength(tabla.columnasPdf.length)
    }
    // El PDF nunca trae más columnas que el Excel.
    expect(tabla.columnasPdf.length).toBeLessThanOrEqual(tabla.columnas.length)
  })

  it("las hojas adicionales del Excel no chocan con las fijas", () => {
    const nombres = conDatos.hojas.map((hoja) => hoja.nombre)
    expect(new Set(nombres).size).toBe(nombres.length)
    for (const hoja of conDatos.hojas) {
      expect(["Portada", "Indicadores", "Detalle", "Cómo leer"]).not.toContain(
        hoja.nombre
      )
      expect(hoja.nombre.length).toBeLessThanOrEqual(31)
      for (const fila of hoja.filas)
        expect(fila).toHaveLength(hoja.columnas.length)
    }
  })

  it("trae notas de definición, incluida la de las fechas de Bogotá", () => {
    expect(conDatos.notas.length).toBeGreaterThanOrEqual(4)
    const terminos = conDatos.notas.map((nota) => nota.termino)
    expect(new Set(terminos).size).toBe(terminos.length)
    expect(terminos).toContain("Fechas")
    expect(terminos).toContain("Comparativo")
  })

  it("no produce cifras no finitas", () => {
    for (const c of [conDatos, sinDatos]) {
      for (const ind of c.vista.indicadores) {
        if (ind.valor !== null) expect(Number.isFinite(ind.valor)).toBe(true)
        if (ind.variacion !== null)
          expect(Number.isFinite(ind.variacion)).toBe(true)
      }
      for (const fila of c.tabla.filas) {
        for (const celda of fila) {
          if (typeof celda === "number")
            expect(Number.isFinite(celda)).toBe(true)
        }
      }
    }
  })
})

// ── Tabla: columnas, orden y facetas ─────────────────────────────────────────

interface DefinicionTabla {
  columnas: readonly ColumnaReporte<never>[]
  facetas: readonly FacetaReporte<never>[]
  estado: { camposOrden: readonly string[]; clavesFiltro: readonly string[] }
}

const TABLAS: Record<string, DefinicionTabla> = {
  "resumen-ejecutivo": {
    columnas: columnasResumen,
    facetas: facetasResumen,
    estado: estadoTablaResumen,
  },
  "cobertura-territorial": {
    columnas: columnasCobertura,
    facetas: facetasCobertura,
    estado: estadoTablaCobertura,
  },
  "usuarios-accesos": {
    columnas: columnasUsuariosAccesos,
    facetas: facetasUsuariosAccesos,
    estado: estadoTablaUsuariosAccesos,
  },
  "desempeno-campanas": {
    columnas: columnasDesempeno,
    facetas: facetasDesempeno,
    estado: estadoTablaDesempeno,
  },
  "cumplimiento-medios": {
    columnas: columnasCumplimiento,
    facetas: facetasCumplimiento,
    estado: estadoTablaCumplimiento,
  },
  cartera: {
    columnas: columnasCartera,
    facetas: facetasCartera,
    estado: estadoTablaCartera,
  },
  ...Object.fromEntries(
    AGRUPACIONES.map((agrupacion) => [
      `finanzas por ${agrupacion}`,
      {
        columnas: columnasFinanzas(agrupacion),
        facetas: facetasFinanzas,
        estado: estadoTablaFinanzas,
      },
    ])
  ),
}

/** Parámetros de la URL que ya usan la tabla o los filtros del reporte. */
const RESERVADOS = [
  "q",
  "pagina",
  "tamano",
  "orden",
  "periodo",
  "desde",
  "hasta",
  "departamento",
  "anunciante",
  "sector",
  "agrupacion",
  "corte",
]

describe.each(Object.entries(TABLAS))("tabla de %s", (_nombre, tabla) => {
  it("los campos de orden de la URL son exactamente las columnas ordenables", () => {
    const ordenables = tabla.columnas
      .filter((c) => c.ordenable)
      .map((c) => c.id)
    expect([...tabla.estado.camposOrden].sort()).toEqual([...ordenables].sort())
  })

  it("las facetas coinciden con los filtros de la URL y no pisan otros parámetros", () => {
    const claves = tabla.facetas.map((faceta) => faceta.clave)
    expect([...claves].sort()).toEqual([...tabla.estado.clavesFiltro].sort())
    for (const clave of claves) expect(RESERVADOS).not.toContain(clave)
  })

  it("tiene una sola columna principal, visible y con búsqueda", () => {
    const principales = tabla.columnas.filter((c) => c.tarjeta === "titulo")
    expect(principales).toHaveLength(1)
    expect(principales[0].buscable).toBe(true)
    expect(principales[0].ocultaPorDefecto).not.toBe(true)
    expect(principales[0].enPdf).not.toBe(false)
  })

  it("los ids de columna son únicos", () => {
    const ids = tabla.columnas.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── Resumen ejecutivo ────────────────────────────────────────────────────────

describe("resumen ejecutivo", () => {
  const datos = datosResumenEjemplo()

  it("muestra las ocho tarjetas en el orden pedido y los 16 KPI en la tabla", () => {
    const vista = vistaResumen(datos)
    expect(vista.indicadores.map((ind) => ind.clave)).toEqual([
      ...KPIS_CABECERA,
    ])
    expect(filasResumen(datos)).toHaveLength(16)
  })

  it("la tendencia compara con el periodo anterior alineado por posición", () => {
    const tendencia = grafico(contenido("resumen-ejecutivo"), "tendencia-gmv")
    if (tendencia.tipo !== "tendencia") throw new Error("tipo inesperado")
    expect(tendencia.etiquetas).toHaveLength(30)
    expect(tendencia.series[0].valores).toHaveLength(30)
    // Agosto tiene 31 días: el día 31 se descarta.
    expect(tendencia.anterior?.valores).toHaveLength(30)
  })

  it("suma el GMV por plataforma a partir de la mezcla por formato", () => {
    const dona = grafico(contenido("resumen-ejecutivo"), "gmv-plataforma")
    if (dona.tipo !== "dona") throw new Error("tipo inesperado")
    const instagram = dona.segmentos.find((s) => s.id === "INSTAGRAM")
    expect(instagram?.valor).toBe(131_400_000 + 52_300_000)
    expect(dona.segmentos.map((s) => s.nombre)).toEqual([
      "Facebook",
      "Instagram",
      "TikTok",
    ])
  })

  it("sin `analitica.global` no ofrece el ranking por departamento", () => {
    const vista = vistaResumen({ ...datos, zonas: null })
    expect(vista.graficos.map((g) => g.id)).toEqual([
      "tendencia-gmv",
      "gmv-plataforma",
    ])
    const hojas = contenidoReporte({
      reporte: "resumen-ejecutivo",
      datos: { ...datos, zonas: null },
    }).hojas
    expect(hojas.map((h) => h.nombre)).not.toContain("Departamentos")
  })

  it("compara cada departamento con el periodo anterior del reporte, no con el de la RPC", () => {
    const zona = (codigo: string, nombre: string, valor: number) => ({
      codigo,
      nombre,
      valor,
      participacion: valor / 150,
    })
    const zonas = zonasComparadas(
      [zona("05", "Antioquia", 100), zona("11", "Bogotá, D.C.", 50)],
      // Mismo periodo alineado: Antioquia vendía 80; Valle, 40 y ya no vende.
      [zona("05", "Antioquia", 80), zona("76", "Valle del Cauca", 40)]
    )
    expect(zonas.map((z) => z.codigo)).toEqual(["05", "11", "76"])
    expect(zonas[0]).toMatchObject({ valor: 100, valorAnterior: 80 })
    expect(zonas[0].variacion).toBeCloseTo(0.25)
    // Sin ventas antes: no hay base para una variación.
    expect(zonas[1]).toMatchObject({ valorAnterior: 0, variacion: null })
    // Solo vendió antes: entra en cero y explica parte de la caída.
    expect(zonas[2]).toMatchObject({
      nombre: "Valle del Cauca",
      valor: 0,
      participacion: 0,
      valorAnterior: 40,
      variacion: -1,
    })
  })

  it("el ranking no dibuja departamentos que solo vendieron en el periodo anterior", () => {
    const zonas = zonasComparadas(
      [{ codigo: "05", nombre: "Antioquia", valor: 100, participacion: 1 }],
      [{ codigo: "76", nombre: "Valle", valor: 40, participacion: 1 }]
    )
    const vista = vistaResumen({ ...datos, zonas })
    const ranking = vista.graficos.find((g) => g.id === "gmv-departamentos")
    if (ranking?.tipo !== "ranking") throw new Error("tipo inesperado")
    expect(ranking.elementos.map((e) => e.id)).toEqual(["05"])
    // El Excel sí los conserva: son parte del comparativo.
    const hoja = contenidoReporte({
      reporte: "resumen-ejecutivo",
      datos: { ...datos, zonas },
    }).hojas.find((h) => h.nombre === "Departamentos")
    expect(hoja?.filas.map((fila) => fila[0])).toEqual(["Antioquia", "Valle"])
  })

  it("los hallazgos usan el umbral de variación de la configuración", () => {
    const kpis = datos.kpis.map((fila) =>
      fila.kpi === "gmv_verificado" ? { ...fila, variacion: -0.2 } : fila
    )
    const delGmv = (config: typeof datos.config) =>
      vistaResumen({ ...datos, kpis, config }).hallazgos.filter(
        (hallazgo) => hallazgo.metrica === "gmv_verificado"
      )
    // −20 % es hallazgo con el umbral por defecto (15 %)…
    expect(delGmv(datos.config)).toHaveLength(1)
    // …y deja de serlo si la configuración exige 30 %.
    expect(delGmv({ ...datos.config, umbralVariacion: 0.3 })).toHaveLength(0)
  })

  it("la nota de medios en riesgo cita los días de la configuración", () => {
    const notas = contenidoReporte({
      reporte: "resumen-ejecutivo",
      datos: {
        ...datos,
        config: {
          ...datos.config,
          diasActividad: 60,
          diasRiesgoSinAceptar: 21,
        },
      },
    }).notas
    const riesgo = notas.find((nota) => nota.termino === "Medios en riesgo")
    expect(riesgo?.explicacion).toContain("últimos 60 días")
    expect(riesgo?.explicacion).toContain("más de 21")
  })

  it("en la tabla la muestra va en su columna y no se repite en la cifra", () => {
    const filas = filasResumen(datosVacios("resumen-ejecutivo"))
    const tasa = filas.find((f) => f.clave === "tasa_cumplimiento")
    expect(tasa?.valor).toBe("Muestra insuficiente")
    expect(tasa?.n).toBe(0)
    // El GMV no es una tasa: no informa muestra.
    expect(filas.find((f) => f.clave === "gmv_verificado")?.n).toBeNull()
  })

  it("genera hallazgos con el motor de insights cuando algo cambia de verdad", () => {
    const kpis = datos.kpis.map((fila) =>
      fila.kpi === "gmv_verificado"
        ? { ...fila, valor: 200_000_000, variacion: -0.37 }
        : fila
    )
    const vista = vistaResumen({ ...datos, kpis })
    expect(vista.hallazgos.length).toBeGreaterThan(0)
    expect(vista.hallazgos[0].titulo.length).toBeGreaterThan(10)
  })
})

// ── Cobertura territorial ────────────────────────────────────────────────────

describe("cobertura territorial", () => {
  const datos = datosCoberturaEjemplo()
  const fila = (parcial: Partial<FilaCobertura>): FilaCobertura => ({
    ...datos.filas[0],
    ...parcial,
  })

  it("clasifica cada zona por su cobertura", () => {
    expect(estadoCobertura(fila({ medios: 0, mediosActivos: 0 }))).toBe(
      "sin-medios"
    )
    expect(estadoCobertura(fila({ medios: 4, mediosActivos: 0 }))).toBe(
      "sin-actividad"
    )
    expect(estadoCobertura(fila({ medios: 4, mediosActivos: 1 }))).toBe(
      "activa"
    )
  })

  it("nombra la zona por su municipio o, si no, por su departamento", () => {
    expect(
      nombreZona(fila({ municipio: "Rionegro", departamento: "Antioquia" }))
    ).toBe("Rionegro")
    expect(
      nombreZona(fila({ municipio: null, departamento: "Antioquia" }))
    ).toBe("Antioquia")
  })

  it("el mapa trae una capa por medida con los 33 departamentos", () => {
    const mapa = grafico(contenido("cobertura-territorial"), "mapa-cobertura")
    if (mapa.tipo !== "mapa") throw new Error("tipo inesperado")
    expect(mapa.capas.map((capa) => capa.metrica)).toEqual([
      "medios",
      "gmv",
      "alcance",
    ])
    for (const capa of mapa.capas)
      expect(Object.keys(capa.valores)).toHaveLength(33)
    expect(mapa.destacado).toBeNull()
  })

  it("mide la cobertura como zonas con medios sobre el total de zonas", () => {
    const vista = vistaCobertura(datos)
    const cobertura = vista.indicadores.find(
      (ind) => ind.clave === "zonas_con_medios"
    )
    expect(cobertura?.titulo).toBe("Departamentos con medios")
    expect(cobertura?.valor).toBeCloseTo(datos.totales.zonasConMedios / 33)
    expect(cobertura?.unidad).toBe("%")
  })

  it("con un departamento elegido baja a municipios y lo resalta en el mapa", () => {
    const municipios = datos.filas.slice(0, 4).map((f, i) => ({
      ...f,
      codigo: `0500${i}`,
      departamentoCodigo: "05",
      departamento: "Antioquia",
      municipio: `Municipio ${i}`,
      mediosPor100k: null,
    }))
    const porMunicipio = {
      ...datos,
      contexto: contextoEjemplo(
        "cobertura-territorial",
        filtrosEjemplo({ departamento: "05" })
      ),
      nivel: "municipio" as const,
      departamento: "05",
      filas: municipios,
      topMunicipios: null,
    }
    const c = contenidoReporte({
      reporte: "cobertura-territorial",
      datos: porMunicipio,
    })
    expect(c.tabla.titulo).toBe("Cobertura por municipio")
    expect(indicadorDe(c, "zonas_con_medios").titulo).toBe(
      "Municipios con medios"
    )
    const mapa = grafico(c, "mapa-cobertura")
    if (mapa.tipo !== "mapa") throw new Error("tipo inesperado")
    expect(mapa.destacado).toBe("05")
    expect(mapa.descripcion).toContain("Antioquia")
    // El contexto nacional viaja en su propia hoja del Excel.
    expect(c.hojas.map((h) => h.nombre)).toEqual(["Departamentos"])
    expect(c.vista.avisos).toHaveLength(1)
    // Sin población por municipio, esas columnas saldrían vacías: no se ofrecen.
    const titulos = c.tabla.columnas.map((columna) => columna.titulo)
    expect(titulos).not.toContain("Población")
    expect(titulos).not.toContain("Medios por 100 mil hab.")
    expect(titulos).toContain("Medios verificados")
  })

  it("el ranking no lista zonas sin medios", () => {
    const [conMedios, sinMedios] = datos.filas
    const vista = vistaCobertura({
      ...datos,
      nivel: "municipio",
      departamento: "05",
      topMunicipios: null,
      filas: [
        { ...conMedios, codigo: "05001", municipio: "Medellín", medios: 20 },
        { ...sinMedios, codigo: "05002", municipio: "Abejorral", medios: 0 },
      ],
    })
    const ranking = vista.graficos.find((g) => g.id === "ranking-medios")
    if (ranking?.tipo !== "ranking") throw new Error("tipo inesperado")
    expect(ranking.elementos.map((e) => e.nombre)).toEqual(["Medellín"])
    expect(ranking.vacio).toBe(false)
  })

  it("el ranking nacional nombra el municipio y solo añade el departamento si hay homónimos", () => {
    const nombres = nombresDeMunicipios([
      { codigo: "76001", nombre: "Santiago de Cali (Valle del Cauca)" },
      { codigo: "11001", nombre: "Bogotá, D.C. (Bogotá)" },
      { codigo: "05079", nombre: "Barbosa (Antioquia)" },
      { codigo: "68077", nombre: "Barbosa (Santander)" },
      { codigo: "99999", nombre: "Sin paréntesis" },
    ])
    expect(nombres.get("76001")).toBe("Santiago de Cali")
    expect(nombres.get("11001")).toBe("Bogotá, D.C.")
    expect(nombres.get("05079")).toBe("Barbosa (Antioquia)")
    expect(nombres.get("68077")).toBe("Barbosa (Santander)")
    expect(nombres.get("99999")).toBe("Sin paréntesis")
  })

  it("por departamento la tabla conserva la población y la tasa por 100 mil habitantes", () => {
    expect(columnasCoberturaPara("departamento")).toBe(columnasCobertura)
    const porMunicipio = columnasCoberturaPara("municipio").map((c) => c.id)
    expect(porMunicipio).toEqual(
      columnasCobertura
        .map((c) => c.id)
        .filter((id) => id !== "poblacion" && id !== "mediosPor100k")
    )
    // La misma lista en cada llamada: la tabla no rehace sus columnas.
    expect(columnasCoberturaPara("municipio")).toBe(
      columnasCoberturaPara("municipio")
    )
  })

  it("las barras de actividad nombran cada zona (horizontales) y no pasan de 12", () => {
    const actividad = grafico(
      contenido("cobertura-territorial"),
      "actividad-medios"
    )
    if (actividad.tipo !== "apiladas") throw new Error("tipo inesperado")
    expect(actividad.orientacion).toBe("horizontal")
    expect(actividad.categorias.length).toBeLessThanOrEqual(12)
    const [activos, inactivos] = actividad.series
    activos.valores.forEach((valor, i) => {
      expect((valor ?? 0) + (inactivos.valores[i] ?? 0)).toBeGreaterThan(0)
    })
  })
})

// ── Usuarios y accesos ───────────────────────────────────────────────────────

describe("usuarios y accesos", () => {
  const datos = datosUsuariosAccesosEjemplo()
  const usuario = (parcial: Partial<FilaUsuarioAcceso>): FilaUsuarioAcceso => ({
    ...datos.filas[0],
    ...parcial,
  })

  it("nombra a la persona aunque no tenga nombre registrado", () => {
    expect(nombreUsuario(usuario({ nombre: "Laura Restrepo" }))).toBe(
      "Laura Restrepo"
    )
    expect(
      nombreUsuario(usuario({ nombre: "  ", email: "l.restrepo@amo.test" }))
    ).toBe("l.restrepo")
    expect(
      nombreUsuario(usuario({ nombre: null, email: "l***@amo.test" }))
    ).toBe("l***")
  })

  it("los totales de higiene solo cuentan cuentas activas", () => {
    const totales = totalesAccesos([
      usuario({ estado: "ACTIVO", exitosos: 3, mfaActivo: true }),
      usuario({ estado: "ACTIVO", exitosos: 0, mfaActivo: false }),
      usuario({
        estado: "SUSPENDIDO",
        exitosos: 0,
        mfaActivo: false,
        fallidos: 5,
      }),
      usuario({ estado: "INVITADO", exitosos: 0, mfaActivo: false }),
    ])
    expect(totales.activos).toBe(2)
    expect(totales.activosSinMfa).toBe(1)
    expect(totales.activosSinIngreso).toBe(1)
    expect(totales.usuariosConIngreso).toBe(1)
    // Los fallidos sí suman los de cualquier cuenta (fuerza bruta).
    expect(totales.fallidos).toBe(datos.filas[0].fallidos * 3 + 5)
  })

  it("las cuentas sin dos pasos son una foto: no se comparan con el periodo anterior", () => {
    const vista = vistaUsuariosAccesos(datos)
    const sinMfa = vista.indicadores.find(
      (ind) => ind.clave === "activos_sin_mfa"
    )
    expect(sinMfa?.sinComparativo).toBe(ETIQUETA_FOTO)
    expect(sinMfa?.valorAnterior).toBeNull()
    expect(sinMfa?.sentido).toBe("menor")
  })

  it("las cuentas activas sin ingresos no se comparan: el periodo anterior contaría cuentas que no existían", () => {
    const filas = [
      { ...datos.filas[0], estado: "ACTIVO" as const, exitosos: 0 },
      { ...datos.filas[0], id: "b", estado: "ACTIVO" as const, exitosos: 4 },
    ]
    // Antes ninguna de las dos cuentas ingresó (quizá ni existían).
    const anteriores = filas.map((fila) => ({ ...fila, exitosos: 0 }))
    const vista = vistaUsuariosAccesos({
      ...datos,
      filas,
      totales: totalesAccesos(filas),
      anterior: totalesAccesos(anteriores),
    })
    const sinIngreso = vista.indicadores.find(
      (ind) => ind.clave === "activos_sin_ingreso"
    )
    expect(sinIngreso?.valor).toBe(1)
    expect(sinIngreso?.sinComparativo).toBe(ETIQUETA_CUENTAS_DE_HOY)
    expect(sinIngreso?.valorAnterior).toBeNull()
    expect(sinIngreso?.variacion).toBeNull()
    // Solo esos dos indicadores quedan sin comparativo.
    expect(
      vista.indicadores
        .filter((ind) => ind.sinComparativo !== null)
        .map((ind) => ind.clave)
    ).toEqual(["activos_sin_mfa", "activos_sin_ingreso"])
  })

  it("el mapa de calor trae las 168 horas de la semana", () => {
    const calor = grafico(contenido("usuarios-accesos"), "actividad-accesos")
    if (calor.tipo !== "calor") throw new Error("tipo inesperado")
    expect(calor.celdas).toHaveLength(168)
    const hoja = contenido("usuarios-accesos").hojas[0]
    expect(hoja.filas).toHaveLength(168)
    expect(hoja.filas[0][0]).toBe("Lunes")
  })

  it("el ranking solo incluye a quienes ingresaron", () => {
    const ranking = grafico(contenido("usuarios-accesos"), "usuarios-activos")
    if (ranking.tipo !== "ranking") throw new Error("tipo inesperado")
    expect(ranking.elementos.every((e) => e.valor > 0)).toBe(true)
    expect(ranking.elementos).toHaveLength(datos.totales.usuariosConIngreso)
  })
})

// ── Desempeño de campañas ────────────────────────────────────────────────────

describe("desempeño de campañas", () => {
  const datos = datosDesempenoEjemplo()

  it("reconstruye los totales como cociente de sumas, no promedio de razones", () => {
    const filas = [
      { r: 10, peso: 100 },
      { r: 30, peso: 300 },
      { r: null, peso: 500 },
      { r: 99, peso: 0 },
    ]
    const resultado = razonPonderada(
      filas,
      (f) => f.r,
      (f) => f.peso
    )
    // (10·100 + 30·300) / 400 = 25; el promedio simple daría 20.
    expect(resultado.valor).toBe(25)
    expect(resultado.filas).toHaveLength(2)
    expect(
      razonPonderada(
        [],
        () => 1,
        () => 1
      ).valor
    ).toBeNull()
  })

  it("el CPM total equivale a Σ bruto ÷ Σ impresiones × 1.000", () => {
    const conDatos = datos.filas.filter((f) => f.cpm !== null)
    const bruto = conDatos.reduce((s, f) => s + f.gmvVerificado, 0)
    const impresiones = conDatos.reduce((s, f) => s + f.impresiones, 0)
    expect(totalesDesempeno(datos.filas).cpm).toBeCloseTo(
      (bruto / impresiones) * 1000,
      4
    )
  })

  it("con pocos negocios verificados no informa las razones agregadas", () => {
    const pocas: FilaCampana[] = datos.filas.slice(0, 1).map((f) => ({
      ...f,
      nVerificadas: 6,
    }))
    const vista = vistaDesempeno({
      ...datos,
      filas: pocas,
      totales: totalesDesempeno(pocas),
    })
    const cpm = vista.indicadores.find((ind) => ind.clave === "cpm_efectivo")
    expect(cpm?.valor).toBeNull()
    expect(cpm?.n).toBe(6)
    // El GMV sí: los conteos y las sumas no tienen muestra mínima.
    expect(
      vista.indicadores.find((i) => i.clave === "gmv_verificado")?.valor
    ).toBeGreaterThan(0)
  })

  it("de un solo anunciante las razones se informan siempre, con su n", () => {
    const pocas: FilaCampana[] = datos.filas.slice(0, 1).map((f) => ({
      ...f,
      nVerificadas: 6,
    }))
    const vista = vistaDesempeno({
      ...datos,
      unAnunciante: true,
      filas: pocas,
      totales: totalesDesempeno(pocas),
      anterior: { ...totalesDesempeno(pocas), verificadas: 3 },
    })
    const cpm = vista.indicadores.find((ind) => ind.clave === "cpm_efectivo")
    expect(cpm?.valor).toBeCloseTo(pocas[0].cpm ?? 0, 4)
    expect(cpm?.n).toBe(6)
    // Y se compara aunque el periodo anterior también tenga pocos casos.
    expect(cpm?.valorAnterior).not.toBeNull()
  })

  it("no compara el CPM de plataformas con muestra pequeña, y lo dice", () => {
    const cpm = grafico(contenido("desempeno-campanas"), "plataforma-cpm")
    if (cpm.tipo !== "apiladas") throw new Error("tipo inesperado")
    expect(cpm.categorias).toEqual(["Instagram", "Facebook"])
    expect(cpm.pie).toContain("TikTok (n = 14)")
  })

  it("con filtro de anunciante avisa que no hay corte por plataforma", () => {
    const vista = vistaDesempeno({ ...datos, porPlataforma: null })
    expect(vista.graficos.map((g) => g.id)).toEqual(["campanas-gmv", "cupos"])
    expect(vista.avisos).toHaveLength(1)
    expect(
      contenidoReporte({
        reporte: "desempeno-campanas",
        datos: { ...datos, porPlataforma: null },
      }).hojas
    ).toEqual([])
  })

  it("los cupos libres nunca son negativos", () => {
    const cupos = grafico(contenido("desempeno-campanas"), "cupos")
    if (cupos.tipo !== "apiladas") throw new Error("tipo inesperado")
    expect(cupos.categorias.length).toBeLessThanOrEqual(10)
    for (const valor of cupos.series[1].valores)
      expect(valor).toBeGreaterThanOrEqual(0)
  })

  it("traduce las claves de plataforma y deja pasar las desconocidas", () => {
    expect(nombrePlataforma("TIKTOK")).toBe("TikTok")
    expect(nombrePlataforma("YOUTUBE")).toBe("YOUTUBE")
  })
})

// ── Cumplimiento de medios ───────────────────────────────────────────────────

describe("cumplimiento de medios", () => {
  const datos = datosCumplimientoEjemplo()
  const medio = (parcial: Partial<FilaCumplimiento>): FilaCumplimiento => ({
    ...datos.filas[0],
    ...parcial,
  })

  it("la situación más grave manda", () => {
    expect(situacionMedio(medio({ vencidas: 2, alertas: 3 }))).toBe(
      "con-vencidas"
    )
    expect(situacionMedio(medio({ vencidas: 0, alertas: 1 }))).toBe(
      "con-alertas"
    )
    expect(situacionMedio(medio({ vencidas: 0, alertas: 0 }))).toBe(
      "sin-novedad"
    )
  })

  it("la ubicación no repite el nombre cuando municipio y departamento coinciden", () => {
    expect(
      ubicacionMedio(
        medio({ municipio: "Envigado", departamento: "Antioquia" })
      )
    ).toBe("Envigado, Antioquia")
    expect(
      ubicacionMedio(
        medio({ municipio: "Bogotá, D.C.", departamento: "Bogotá, D.C." })
      )
    ).toBe("Bogotá, D.C.")
    expect(
      ubicacionMedio(medio({ municipio: null, departamento: "Caldas" }))
    ).toBe("Caldas")
    expect(
      ubicacionMedio(medio({ municipio: null, departamento: null }))
    ).toBeNull()
  })

  it("la tasa agregada es cumplidas ÷ evaluadas, en puntos frente al periodo anterior", () => {
    const vista = vistaCumplimiento(datos)
    const tasa = vista.indicadores.find(
      (ind) => ind.clave === "tasa_cumplimiento"
    )
    expect(tasa?.valor).toBeCloseTo(
      datos.totales.cumplidas / datos.totales.comprometidas
    )
    expect(tasa?.unidad).toBe("%")
    expect(tasa?.variacion).toBeNull()
    expect(tasa?.valorAnterior).not.toBeNull()
  })

  it("no compara contra un periodo anterior con muestra insuficiente", () => {
    const vista = vistaCumplimiento({
      ...datos,
      anterior: { ...datos.anterior, comprometidas: 4, cumplidas: 4 },
    })
    const tasa = vista.indicadores.find(
      (ind) => ind.clave === "tasa_cumplimiento"
    )
    expect(tasa?.valor).not.toBeNull()
    expect(tasa?.valorAnterior).toBeNull()
  })

  it("el resultado reparte las evaluadas sin dejar restos negativos", () => {
    const dona = grafico(contenido("cumplimiento-medios"), "resultado")
    if (dona.tipo !== "dona") throw new Error("tipo inesperado")
    const suma = dona.segmentos.reduce((s, seg) => s + seg.valor, 0)
    expect(suma).toBe(datos.totales.comprometidas)
    for (const segmento of dona.segmentos)
      expect(segmento.valor).toBeGreaterThanOrEqual(0)
  })

  it("agrupa por departamento o, con uno elegido, por municipio", () => {
    const nacional = grafico(contenido("cumplimiento-medios"), "por-zona")
    expect(nacional.titulo).toContain("por departamento")
    const local = vistaCumplimiento({
      ...datos,
      departamento: "05",
    }).graficos.find((g) => g.id === "por-zona")
    expect(local?.titulo).toContain("por municipio")
  })
})

// ── Finanzas ─────────────────────────────────────────────────────────────────

describe("finanzas", () => {
  it("el take rate total es comisión ÷ GMV verificado de las sumas", () => {
    const totales = totalesFinanzas([
      {
        id: "a",
        grupo: "A",
        gmvComprometido: 0,
        gmvVerificado: 100,
        comision: 10,
        takeRate: 0.1,
        pagadoMedios: 0,
        facturado: 0,
        recaudado: 0,
        cartera: 0,
      },
      {
        id: "b",
        grupo: "B",
        gmvComprometido: 0,
        gmvVerificado: 300,
        comision: 90,
        takeRate: 0.3,
        pagadoMedios: 0,
        facturado: 0,
        recaudado: 0,
        cartera: 0,
      },
    ])
    // (10 + 90) / 400 = 0,25; el promedio de 10 % y 30 % daría 0,20.
    expect(totales.takeRate).toBe(0.25)
    expect(totalesFinanzas([]).takeRate).toBeNull()
  })

  it.each(AGRUPACIONES)(
    "detalle por %s: la tabla y las demás hojas",
    (agrupacion) => {
      const c = contenidoReporte({
        reporte: "finanzas",
        datos: datosFinanzasEjemplo(agrupacion),
      })
      const otras = {
        anunciante: ["Por mes", "Por sector"],
        sector: ["Por mes", "Por anunciante"],
        mes: ["Por sector", "Por anunciante"],
      }
      expect(c.hojas.map((h) => h.nombre)).toEqual(otras[agrupacion])
      expect(c.tabla.titulo).toBe(`Detalle por ${agrupacion}`)
    }
  )

  it("la cartera mensual no se totaliza (cada mes es un corte distinto)", () => {
    const cartera = (agrupacion: (typeof AGRUPACIONES)[number]) =>
      columnasFinanzas(agrupacion).find((c) => c.id === "cartera")
    expect(cartera("mes")?.totalizar).toBe(false)
    expect(cartera("mes")?.titulo).toBe("Cartera al cierre del mes")
    expect(cartera("anunciante")?.totalizar).toBe(true)
  })

  it("con un sector elegido y detalle por mes, avisa del alcance del filtro", () => {
    const datos = datosFinanzasEjemplo("mes")
    expect(vistaFinanzas(datos).avisos).toEqual([])
    const vista = vistaFinanzas({ ...datos, sector: "Salud" })
    expect(vista.avisos).toHaveLength(1)
    const mensual = vista.graficos.find((g) => g.id === "gmv-mes")
    expect(mensual?.pie).toContain("todos los sectores")
  })

  it("el gráfico mensual combina GMV (barras) y take rate (línea)", () => {
    const combo = grafico(contenido("finanzas"), "gmv-mes")
    if (combo.tipo !== "combo") throw new Error("tipo inesperado")
    expect(combo.etiquetas).toEqual([
      "julio 2026",
      "agosto 2026",
      "septiembre 2026",
    ])
    expect(combo.barras.formato).toBe("cop")
    expect(combo.linea.formato).toBe("porcentaje")
  })
})

// ── Cartera ──────────────────────────────────────────────────────────────────

describe("cartera", () => {
  const datos = datosCarteraEjemplo()
  const deudor = (parcial: Partial<FilaCartera>): FilaCartera => ({
    ...datos.filas[0],
    saldo0a30: 0,
    saldo31a60: 0,
    saldo61a90: 0,
    saldoMas90: 0,
    ...parcial,
  })

  it("el tramo más antiguo con saldo decide la mora", () => {
    expect(moraAnunciante(deudor({ saldo0a30: 5 }))).toBe("al-dia")
    expect(moraAnunciante(deudor({ saldo0a30: 5, saldo31a60: 1 }))).toBe(
      "vencida"
    )
    expect(moraAnunciante(deudor({ saldo61a90: 1 }))).toBe("vencida")
    expect(moraAnunciante(deudor({ saldo0a30: 5, saldoMas90: 1 }))).toBe(
      "critica"
    )
  })

  it("lo vencido es todo lo que pasa de 30 días", () => {
    expect(
      saldoVencido(
        deudor({ saldo0a30: 9, saldo31a60: 1, saldo61a90: 2, saldoMas90: 3 })
      )
    ).toBe(6)
  })

  it("los tramos suman el saldo total", () => {
    const totales = totalesCartera(datos.filas)
    expect(totales.porTramo.reduce((a, b) => a + b, 0)).toBe(totales.saldo)
    expect(totales.vencido).toBe(
      totales.porTramo[1] + totales.porTramo[2] + totales.porTramo[3]
    )
    expect(totales.anunciantes).toBe(datos.filas.length)
  })

  it("sin saldo, «saldo al día» no se calcula (no hay sobre qué)", () => {
    const vista = vistaCartera(datosVacios("cartera"))
    const alDia = vista.indicadores.find((ind) => ind.clave === "al_dia")
    expect(alDia?.valor).toBeNull()
    expect(vista.indicadores.find((ind) => ind.clave === "saldo")?.valor).toBe(
      0
    )
  })

  it("el gráfico por anunciante reparte el saldo de los 10 mayores por antigüedad", () => {
    const apiladas = grafico(contenido("cartera"), "saldo-anunciante")
    if (apiladas.tipo !== "apiladas") throw new Error("tipo inesperado")
    expect(apiladas.series.map((s) => s.nombre)).toEqual([
      "0 a 30 días",
      "31 a 60 días",
      "61 a 90 días",
      "Más de 90 días",
    ])
    expect(apiladas.categorias.length).toBeLessThanOrEqual(10)
    expect(apiladas.categorias[0]).toBe("Supermercados La Rebaja")
  })

  it("compara contra el corte anterior, no contra un periodo", () => {
    expect(datos.contexto.periodo).toBeNull()
    expect(datos.contexto.comparacion).toMatch(/^frente al corte anterior \(/)
    const terminos = contenido("cartera").notas.map((n) => n.termino)
    expect(terminos).toContain("Antigüedad")
  })
})
