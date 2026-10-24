import { describe, expect, it } from "vitest"

import {
  contenidoTerminosPrueba,
  inicioDeAnio,
  leerArgumentos,
  mismoValor,
  olvidarCreadoFinanzas,
  olvidarParametro,
  PARAMETROS_PRUEBA,
  planAplicar,
  planResoluciones,
  planRetenciones,
  planReteica,
  planRevertir,
  planRevertirFinanzas,
  planTerminos,
  registrarCambio,
  registrarCreadoFinanzas,
  type ResolucionExistente,
  RESOLUCIONES_PRUEBA,
  RETEICA_REFERENCIA,
  RETENCIONES_REFERENCIA,
  respaldoVacio,
  sumarDias,
  TIPOS_TERMINOS,
  unAnioDespues,
  VERSION_TERMINOS_PRUEBA,
  vigenciasSeCruzan,
} from "./configuracion-pruebas-plan"

const MARCA = "2026-10-21T06:07:15.228176+00:00"

function fila(clave: string, valor: unknown) {
  return { clave, valor: valor as never, updated_at: MARCA }
}

const ORIGINALES = [
  fila("ofertas.anticipacion_minima_horas", 24),
  fila("metricas.cortes_requeridos", ["H24", "H72", "D7"]),
  fila("archivos.max_creativo_mb", 50),
]

describe("mismoValor", () => {
  it("compara estructura sin importar el orden de las claves", () => {
    expect(mismoValor({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
    expect(mismoValor(["H24"], ["H24", "D7"])).toBe(false)
    expect(mismoValor(0, "0")).toBe(false)
  })
})

describe("planAplicar", () => {
  it("cambia los tres parámetros desde los valores de fábrica", () => {
    const plan = planAplicar(ORIGINALES)
    expect(plan.map((paso) => paso.tipo)).toEqual([
      "cambiar",
      "cambiar",
      "cambiar",
    ])
    expect(plan[1]).toMatchObject({
      clave: "metricas.cortes_requeridos",
      desde: ["H24", "H72", "D7"],
      hacia: ["H24"],
      marca: MARCA,
    })
  })

  it("es idempotente y avisa si falta una clave", () => {
    const yaAplicados = Object.entries(PARAMETROS_PRUEBA)
      .slice(0, 2)
      .map(([clave, valor]) => fila(clave, valor))
    expect(planAplicar(yaAplicados).map((paso) => paso.tipo)).toEqual([
      "igual",
      "igual",
      "falta",
    ])
  })
})

describe("respaldo y reversión", () => {
  it("conserva el valor original aunque se reaplique", () => {
    let respaldo = respaldoVacio("ref", new Date("2026-10-22T00:00:00Z"))
    respaldo = registrarCambio(respaldo, "archivos.max_creativo_mb", 50, 25)
    respaldo = registrarCambio(respaldo, "archivos.max_creativo_mb", 30, 25)
    expect(respaldo.parametros["archivos.max_creativo_mb"]).toEqual({
      anterior: 50,
      aplicado: 25,
    })
    expect(
      olvidarParametro(respaldo, "archivos.max_creativo_mb").parametros
    ).toEqual({})
  })

  it("restaura solo lo que sigue con el valor de prueba", () => {
    let respaldo = respaldoVacio("ref", new Date())
    respaldo = registrarCambio(
      respaldo,
      "ofertas.anticipacion_minima_horas",
      24,
      0
    )
    respaldo = registrarCambio(respaldo, "archivos.max_creativo_mb", 50, 25)
    respaldo = registrarCambio(
      respaldo,
      "metricas.cortes_requeridos",
      ["H24", "H72", "D7"],
      ["H24"]
    )
    const plan = planRevertir(respaldo, [
      fila("ofertas.anticipacion_minima_horas", 0),
      fila("archivos.max_creativo_mb", 40),
      fila("metricas.cortes_requeridos", ["H24", "H72", "D7"]),
    ])
    expect(plan).toEqual([
      {
        tipo: "cambiar",
        clave: "ofertas.anticipacion_minima_horas",
        desde: 0,
        hacia: 24,
        marca: MARCA,
      },
      {
        tipo: "ajeno",
        clave: "archivos.max_creativo_mb",
        actual: 40,
        esperado: 25,
      },
      {
        tipo: "igual",
        clave: "metricas.cortes_requeridos",
        valor: ["H24", "H72", "D7"],
      },
    ])
  })
})

describe("planTerminos", () => {
  it("crea y publica los cuatro tipos en una base sin textos", () => {
    expect(planTerminos([])).toEqual(
      TIPOS_TERMINOS.map((termino) => ({ tipo: "crear", termino }))
    )
  })

  it("respeta los textos del cliente y retoma un borrador de prueba", () => {
    const plan = planTerminos([
      { id: "1", tipo: "TERMINOS_MEDIO", version: "1.0", publicada: true },
      {
        id: "2",
        tipo: "POLITICA_DATOS",
        version: VERSION_TERMINOS_PRUEBA,
        publicada: false,
      },
      {
        id: "3",
        tipo: "TERMINOS_ANUNCIANTE",
        version: VERSION_TERMINOS_PRUEBA,
        publicada: true,
      },
      // Un borrador del cliente no impide la versión de prueba.
      {
        id: "4",
        tipo: "CONDICIONES_COMERCIALES",
        version: "1.0",
        publicada: false,
      },
    ])
    expect(plan).toEqual([
      { tipo: "hay-texto-real", termino: "TERMINOS_MEDIO", version: "1.0" },
      { tipo: "ya-publicada", termino: "TERMINOS_ANUNCIANTE" },
      { tipo: "publicar", termino: "POLITICA_DATOS", id: "2" },
      { tipo: "crear", termino: "CONDICIONES_COMERCIALES" },
    ])
  })

  it("rotula el texto como versión de prueba sin valor legal", () => {
    const texto = contenidoTerminosPrueba("POLITICA_DATOS")
    expect(texto).toMatch(
      /^# Política de tratamiento de datos personales — VERSIÓN DE PRUEBA/
    )
    expect(texto).toContain("No tiene valor legal")
    expect(VERSION_TERMINOS_PRUEBA).toMatch(/^[0-9A-Za-z._-]{1,20}$/)
  })
})

describe("leerArgumentos", () => {
  it("simula por defecto y exige un solo modo", () => {
    expect(leerArgumentos([])).toEqual({
      modo: "simular",
      confirmarProduccion: false,
    })
    expect(leerArgumentos(["--aplicar", "--confirmar-produccion"])).toEqual({
      modo: "aplicar",
      confirmarProduccion: true,
    })
    expect(() => leerArgumentos(["--aplicar", "--revertir"])).toThrow()
    expect(() => leerArgumentos(["--forzar"])).toThrow(/desconocido/)
  })
})

describe("finanzas de prueba", () => {
  const HOY = "2026-10-23"

  it("las reglas de referencia son las de la fase 5", () => {
    expect(
      RETENCIONES_REFERENCIA.map((r) => [
        r.aplicaDeclarante,
        r.tarifa,
        r.baseMinimaUvt,
      ])
    ).toEqual([
      [true, 0.04, 4],
      [false, 0.06, 4],
    ])
    expect(RETEICA_REFERENCIA[0]).toEqual({
      municipio: "11001",
      nombre: "Bogotá",
      tarifaPorMil: 9.66,
    })
    expect(RETEICA_REFERENCIA.map((r) => r.tarifaPorMil).slice(1)).toEqual([
      10, 10, 10,
    ])
    for (const resolucion of Object.values(RESOLUCIONES_PRUEBA)) {
      // CHECK de la BD: prefijo de hasta 4 caracteres en mayúsculas o dígitos.
      expect(resolucion.prefijo).toMatch(/^[A-Z0-9]{0,4}$/)
      expect(resolucion.numeroResolucion).toMatch(/^PRUEBA-/)
      expect([resolucion.rangoDesde, resolucion.rangoHasta]).toEqual([1, 5000])
    }
  })

  it("fechas: inicio del año, un año después (también desde un 29 de febrero)", () => {
    expect(inicioDeAnio(HOY)).toBe("2026-01-01")
    expect(unAnioDespues(HOY)).toBe("2027-10-23")
    expect(unAnioDespues("2028-02-29")).toBe("2029-03-01")
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01")
    expect(() => inicioDeAnio("ayer")).toThrow(RangeError)
  })

  it("vigencias [desde, hasta) como las EXCLUDE de la BD", () => {
    const abierta = { desde: "2026-01-01", hasta: null }
    expect(
      vigenciasSeCruzan(abierta, { desde: "2025-01-01", hasta: null })
    ).toBe(true)
    expect(
      vigenciasSeCruzan(abierta, { desde: "2025-01-01", hasta: "2026-01-01" })
    ).toBe(false)
    expect(
      vigenciasSeCruzan(abierta, { desde: "2025-01-01", hasta: "2026-01-02" })
    ).toBe(true)
  })

  it("crea las retenciones que faltan y respeta las que ya hay vigentes", () => {
    expect(planRetenciones([], HOY)).toEqual(
      RETENCIONES_REFERENCIA.map((regla) => ({
        tipo: "crear",
        regla,
        vigenteDesde: "2026-01-01",
      }))
    )
    const plan = planRetenciones(
      [
        {
          id: "r1",
          tipo: "RETEFUENTE",
          aplica_declarante: true,
          vigente_desde: "2025-01-01",
          vigente_hasta: null,
        },
        // Una que ya terminó no impide la de referencia.
        {
          id: "r2",
          tipo: "RETEFUENTE",
          aplica_declarante: false,
          vigente_desde: "2024-01-01",
          vigente_hasta: "2025-01-01",
        },
      ],
      HOY
    )
    expect(plan.map((paso) => paso.tipo)).toEqual(["existe", "crear"])
    expect(plan[0]).toMatchObject({ id: "r1" })
  })

  it("ReteICA: crea la de las capitales que faltan y omite municipios que la base no tiene", () => {
    const plan = planReteica(
      [
        {
          id: "i1",
          municipio_codigo: "11001",
          vigente_desde: "2025-01-01",
          vigente_hasta: null,
        },
      ],
      new Set(["11001", "05001", "76001"]),
      HOY
    )
    expect(plan.map((paso) => [paso.regla.municipio, paso.tipo])).toEqual([
      ["11001", "existe"],
      ["05001", "crear"],
      ["76001", "crear"],
      ["08001", "sin-municipio"],
    ])
  })

  const resolucion = (
    cambios: Partial<ResolucionExistente>
  ): ResolucionExistente => ({
    id: "x",
    tipo: "DOCUMENTO_SOPORTE",
    prefijo: "DEMO",
    numero_resolucion: "18764000000002",
    activa: true,
    vigente_desde: "2025-06-01",
    vigente_hasta: "2027-06-01",
    ...cambios,
  })

  it("resoluciones: solo hacen falta si no hay una activa y vigente", () => {
    expect(planResoluciones([], HOY)).toEqual([
      {
        tipo: "crear",
        resolucion: RESOLUCIONES_PRUEBA.DOCUMENTO_SOPORTE,
        fechaResolucion: HOY,
        vigenteDesde: HOY,
        vigenteHasta: "2027-10-23",
      },
      {
        tipo: "crear",
        resolucion: RESOLUCIONES_PRUEBA.FACTURA_VENTA,
        fechaResolucion: HOY,
        vigenteDesde: HOY,
        vigenteHasta: "2027-10-23",
      },
    ])
    const plan = planResoluciones(
      [
        resolucion({ id: "ds" }),
        resolucion({
          id: "fe",
          tipo: "FACTURA_VENTA",
          prefijo: "PFE",
          numero_resolucion: "PRUEBA-FE",
          activa: false,
        }),
      ],
      HOY
    )
    expect(plan).toEqual([
      {
        tipo: "vigente",
        resolucion: RESOLUCIONES_PRUEBA.DOCUMENTO_SOPORTE,
        id: "ds",
        prefijo: "DEMO",
      },
      {
        tipo: "activar",
        resolucion: RESOLUCIONES_PRUEBA.FACTURA_VENTA,
        id: "fe",
      },
    ])
  })

  it("una activa vencida no se reemplaza (una sola activa por tipo)", () => {
    const plan = planResoluciones(
      [resolucion({ vigente_hasta: "2026-10-22" })],
      HOY
    )
    expect(plan[0]).toEqual({
      tipo: "activa-vencida",
      resolucion: RESOLUCIONES_PRUEBA.DOCUMENTO_SOPORTE,
      prefijo: "DEMO",
    })
  })

  it("el respaldo guarda cada id una vez y la reversión solo quita lo que nadie usó", () => {
    let creado = registrarCreadoFinanzas(undefined, "retenciones", "r1")
    creado = registrarCreadoFinanzas(creado, "retenciones", "r1")
    creado = registrarCreadoFinanzas(creado, "reteica", "i1")
    creado = registrarCreadoFinanzas(creado, "resoluciones", "s1")
    expect(creado).toEqual({
      retenciones: ["r1"],
      reteica: ["i1"],
      resoluciones: ["s1"],
    })
    expect(
      planRevertirFinanzas(creado, {
        existentes: new Set(["r1", "s1"]),
        usadas: new Set(["s1"]),
      })
    ).toEqual([
      { tipo: "quitar", tabla: "retenciones", id: "r1" },
      { tipo: "no-existe", tabla: "reteica", id: "i1" },
      { tipo: "usada", tabla: "resoluciones", id: "s1" },
    ])
    expect(
      planRevertirFinanzas(undefined, {
        existentes: new Set(),
        usadas: new Set(),
      })
    ).toEqual([])
    expect(
      olvidarCreadoFinanzas(creado, "retenciones", "r1").retenciones
    ).toEqual([])
  })
})
