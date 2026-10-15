// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ErrorDatosGeo } from "./tipos"

type Resultado = { data: unknown; error: unknown; count?: number | null }

interface LecturaTabla {
  tabla: string
  columnas: string
  cabecera: boolean
  filtros: [string, string, unknown][]
  rango: [number, number] | null
}

const bd = vi.hoisted(() => ({
  rpc: null as unknown as (
    nombre: string,
    args: Record<string, unknown>
  ) => Promise<Resultado>,
  /** Respuesta de cada lectura de tabla (conteo o página). */
  tabla: null as unknown as (lectura: LecturaTabla) => Resultado,
  lecturas: [] as LecturaTabla[],
}))

/** Consulta encadenable de PostgREST que registra filtros y rango. */
function consultaFalsa(
  tabla: string,
  columnas: string,
  opciones?: { head?: boolean }
) {
  const lectura: LecturaTabla = {
    tabla,
    columnas,
    cabecera: opciones?.head ?? false,
    filtros: [],
    rango: null,
  }
  const cadena: Record<string, unknown> = {
    filter: (c: string, op: string, v: unknown) => (
      lectura.filtros.push([c, op, v]),
      cadena
    ),
    eq: (c: string, v: unknown) => (lectura.filtros.push([c, "eq", v]), cadena),
    not: (c: string, op: string, v: unknown) => (
      lectura.filtros.push([c, `not.${op}`, v]),
      cadena
    ),
    or: () => cadena,
    order: () => cadena,
    range: (desde: number, hasta: number) => (
      (lectura.rango = [desde, hasta]),
      cadena
    ),
    then: (resolver: (valor: Resultado) => unknown) => {
      bd.lecturas.push(lectura)
      return resolver(bd.tabla(lectura))
    },
  }
  return cadena
}

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: async () => ({
    rpc: (nombre: string, args: Record<string, unknown>) =>
      bd.rpc(nombre, args),
    from: (tabla: string) => ({
      select: (columnas: string, opciones?: { head?: boolean }) =>
        consultaFalsa(tabla, columnas, opciones),
    }),
  }),
}))

const { crearProveedorSupabase } = await import("./proveedor-supabase")

const NACIONAL = {
  nivel: "nacional",
  metrica: "medios",
  desde: "2026-09-01",
  hasta: "2026-09-30",
  departamento: null,
} as const

const conError =
  (code: string, message = "x", details: string | null = null) =>
  async (): Promise<Resultado> => ({
    data: null,
    error: { code, message, details },
  })

const filtro = (lectura: LecturaTabla, columna: string) =>
  lectura.filtros.find(([c]) => c === columna)

describe("proveedor Supabase del explorador", () => {
  beforeEach(() => {
    bd.lecturas = []
    bd.rpc = async () => ({ data: [], error: null })
    bd.tabla = () => ({ data: [], error: null, count: 0 })
  })

  describe("mapa", () => {
    it("llama a geo_metricas con el nivel de la RPC y normaliza las filas", async () => {
      const llamadas: Record<string, unknown>[] = []
      bd.rpc = async (_nombre, args) => {
        llamadas.push(args)
        return {
          // numeric puede llegar como texto; los códigos char(n), con relleno.
          data: [
            {
              codigo: "05 ",
              codigo_geometria: null,
              nombre: "Antioquia",
              valor: "123",
              n: 123,
              poblacion: "6900000",
              valor_por_100k: null,
            },
          ],
          error: null,
        }
      }
      const respuesta = await crearProveedorSupabase().mapa(NACIONAL)
      expect(llamadas[0]).toEqual({
        p_nivel: "departamento",
        p_metrica: "medios",
        p_desde: "2026-09-01",
        p_hasta: "2026-09-30",
        p_departamento: null,
      })
      expect(respuesta).toEqual({
        consulta: NACIONAL,
        filas: [
          {
            codigo: "05",
            codigoGeometria: "05",
            nombre: "Antioquia",
            valor: 123,
            n: 123,
            poblacion: 6_900_000,
            valorPor100k: null,
          },
        ],
        sinPoligono: [],
        origen: "base-de-datos",
      })
      // El coroplético no lee coordenadas.
      expect(bd.lecturas).toEqual([])
    })

    it("un municipio sin polígono propio se dibuja con el que lo representa", async () => {
      bd.rpc = async () => ({
        data: [
          {
            codigo: "13490",
            codigo_geometria: null,
            nombre: "Norosí",
            valor: 2,
            n: 2,
            poblacion: null,
            valor_por_100k: null,
          },
        ],
        error: null,
      })
      const { filas } = await crearProveedorSupabase().mapa({
        ...NACIONAL,
        nivel: "departamental",
        departamento: "13",
      })
      expect(filas[0].codigoGeometria).toBe("13600")
    })

    it("traduce los errores de la BD a motivos con estado HTTP", async () => {
      const proveedor = crearProveedorSupabase()
      const motivo = async () =>
        proveedor.mapa(NACIONAL).catch((error: unknown) => {
          expect(error).toBeInstanceOf(ErrorDatosGeo)
          return (error as ErrorDatosGeo).motivo
        })

      bd.rpc = conError("PGRST202")
      expect(await motivo()).toBe("no-disponible")
      bd.rpc = conError("P0001", "AMO_NO_AUTORIZADO")
      expect(await motivo()).toBe("no-autorizado")
      bd.rpc = conError(
        "P0001",
        "AMO_METRICA_NIVEL_INVALIDO",
        "La métrica no existe para este nivel."
      )
      await expect(proveedor.mapa(NACIONAL)).rejects.toThrow(
        "La métrica no existe para este nivel."
      )
      bd.rpc = conError("57014", "canceling statement due to statement timeout")
      // El detalle técnico de Postgres no llega a la interfaz: solo su código.
      await expect(proveedor.mapa(NACIONAL)).rejects.toThrow(
        "No se pudieron consultar las métricas geográficas (57014)."
      )
      expect(await motivo()).toBe("fallo")
    })
  })

  describe("puntos del modo calor", () => {
    it("accesos: solo ingresos exitosos con coordenadas, agregados en celdas", async () => {
      bd.tabla = (lectura) =>
        lectura.cabecera
          ? { data: null, error: null, count: 3 }
          : {
              data: [
                { lat: 6.251, lon: -75.571 },
                { lat: 6.249, lon: -75.569 },
                { lat: 4.61, lon: -74.08 },
              ],
              error: null,
            }
      const respuesta = await crearProveedorSupabase().puntos({
        ...NACIONAL,
        nivel: "departamental",
        departamento: "05",
        metrica: "accesos",
      })
      expect(respuesta).toMatchObject({
        total: 3,
        muestra: 3,
        pasoGrados: 0.01,
        origen: "base-de-datos",
      })
      expect(respuesta.puntos).toEqual([
        [-75.57, 6.25, 2],
        [-74.08, 4.61, 1],
      ])
      const [conteo, pagina] = bd.lecturas
      expect(conteo).toMatchObject({ tabla: "accesos", cabecera: true })
      expect(pagina).toMatchObject({ columnas: "lat, lon", rango: [0, 2] })
      expect(filtro(pagina, "evento")?.[2]).toBe("LOGIN_EXITOSO")
      expect(filtro(pagina, "pais_iso2")?.[2]).toBe("CO")
      expect(filtro(pagina, "departamento_codigo")?.[2]).toBe("05")
      expect(filtro(pagina, "lat")?.[1]).toBe("not.is")
      // Nunca se leen columnas que identifiquen a la persona.
      expect(
        bd.lecturas.every((l) => !/usuario|ip|email/.test(l.columnas))
      ).toBe(true)
    })

    it("accesos: con más filas que el tope muestrea todo el periodo y compensa el peso", async () => {
      bd.tabla = (lectura) =>
        lectura.cabecera
          ? { data: null, error: null, count: 24_000 }
          : {
              data: Array.from({ length: 1000 }, () => ({
                lat: 4.6,
                lon: -74.1,
              })),
              error: null,
            }
      const respuesta = await crearProveedorSupabase().puntos({
        ...NACIONAL,
        nivel: "internacional",
        metrica: "accesos",
      })
      const paginas = bd.lecturas.filter((l) => !l.cabecera)
      expect(paginas).toHaveLength(12)
      expect(paginas.at(-1)?.rango?.[0]).toBeGreaterThan(20_000)
      expect(respuesta).toMatchObject({ total: 24_000, muestra: 12_000 })
      expect(respuesta.puntos).toEqual([[-74, 4.5, 24_000]])
      // En el mapa mundial no se limita a Colombia.
      expect(filtro(paginas[0], "pais_iso2")).toBeUndefined()
    })

    it("medios: verificados al cierre del periodo, en la cabecera de su municipio", async () => {
      bd.tabla = (lectura) =>
        lectura.cabecera
          ? { data: null, error: null, count: 2 }
          : {
              data: [
                { municipio_codigo: "05001" },
                { municipio_codigo: "05001" },
              ],
              error: null,
            }
      const { puntos, total } = await crearProveedorSupabase().puntos(NACIONAL)
      expect(total).toBe(2)
      expect(puntos.reduce((suma, [, , peso]) => suma + peso, 0)).toBeCloseTo(2)
      for (const [lon, lat] of puntos) {
        expect(Math.abs(lon - -75.58)).toBeLessThan(0.1)
        expect(Math.abs(lat - 6.25)).toBeLessThan(0.1)
      }
      const pagina = bd.lecturas.find((l) => !l.cabecera)
      expect(pagina?.columnas).toBe("municipio_codigo")
      expect(filtro(pagina!, "verificado_at")?.[1]).toBe("lt")
    })

    it("un fallo de la tabla es un error del modo calor (no un mapa vacío)", async () => {
      bd.tabla = () => ({
        data: null,
        error: { code: "42501", message: "permission denied" },
      })
      await expect(
        crearProveedorSupabase().puntos({ ...NACIONAL, metrica: "accesos" })
      ).rejects.toMatchObject({ motivo: "no-autorizado" })
    })
  })

  describe("detalle de una zona", () => {
    const DETALLE = {
      ...NACIONAL,
      zona: "05",
      metricasKpi: ["medios", "cumplimiento"],
      conMedios: false,
    } as const
    /** Cinco meses: la evolución es mensual y llega en la RPC. */
    const LARGO = {
      ...DETALLE,
      desde: "2026-05-01",
      hasta: "2026-09-30",
    } as const

    type Llamada = { nombre: string; args: Record<string, unknown> }

    const kpi = (
      clave: string,
      valor: unknown,
      n: number,
      anterior: unknown = null,
      variacion: unknown = null
    ) => ({
      seccion: "kpi",
      clave,
      nombre: "Zona",
      detalle: null,
      periodo: null,
      valor,
      n,
      valor_anterior: anterior,
      variacion,
    })
    const mes = (clave: string, periodo: string, valor: unknown, n = 0) => ({
      seccion: "serie",
      clave,
      nombre: null,
      detalle: null,
      periodo,
      valor,
      n,
      valor_anterior: null,
      variacion: null,
    })
    const medio = (
      clave: string,
      nombre: string,
      lugar: string,
      gmv: unknown,
      asignaciones: number
    ) => ({
      seccion: "medio",
      clave,
      nombre,
      detalle: lugar,
      periodo: null,
      valor: gmv,
      n: asignaciones,
      valor_anterior: null,
      variacion: null,
    })

    /** Responde `detalle_zona_geo` con `filas` y `geo_metricas` con `zonas`; registra las llamadas. */
    function conRpc(
      filas: (args: Record<string, unknown>) => unknown[],
      zonas: (args: Record<string, unknown>) => unknown[] = () => []
    ): Llamada[] {
      const llamadas: Llamada[] = []
      bd.rpc = async (nombre, args) => {
        llamadas.push({ nombre, args })
        return {
          data: nombre === "detalle_zona_geo" ? filas(args) : zonas(args),
          error: null,
        }
      }
      return llamadas
    }

    it("una llamada a detalle_zona_geo trae los KPI con su comparativo y la evolución mensual", async () => {
      const llamadas = conRpc(() => [
        // numeric puede llegar como texto.
        kpi("medios", "123", 123, "100", "0.23"),
        kpi("cumplimiento", null, 7),
        // Fuera de las métricas pedidas (permisos): no se devuelve.
        kpi("accesos", 900, 900, 800, 0.125),
        mes("medios", "2026-05-01", 101),
        mes("medios", "2026-06-01", 108),
        mes("medios", "2026-07-01", "112"),
        mes("medios", "2026-08-01", 118),
        mes("medios", "2026-09-01", 123),
        mes("gmv", "2026-09-01", 5_000_000),
      ])
      const detalle = await crearProveedorSupabase().detalle(LARGO)

      expect(detalle.kpis).toEqual([
        {
          metrica: "medios",
          valor: 123,
          n: 123,
          anterior: 100,
          variacion: 0.23,
        },
        {
          metrica: "cumplimiento",
          valor: null,
          n: 7,
          anterior: null,
          variacion: null,
        },
      ])
      expect(detalle.serie?.granularidad).toBe("mes")
      expect(detalle.serie?.puntos.map((p) => p.valor)).toEqual([
        101, 108, 112, 118, 123,
      ])
      expect(detalle.serie?.puntos[0]).toMatchObject({
        desde: "2026-05-01",
        hasta: "2026-05-31",
        parcial: false,
      })
      expect(detalle.sinSerie).toBeNull()

      // Una lectura del detalle y otra de las subzonas: ninguna por cubeta ni por métrica.
      expect(llamadas.map((l) => l.nombre)).toEqual([
        "detalle_zona_geo",
        "geo_metricas",
      ])
      expect(llamadas[0].args).toEqual({
        p_nivel: "departamento",
        p_codigo: "05",
        p_desde: "2026-05-01",
        p_hasta: "2026-09-30",
      })
      expect(llamadas[1].args).toMatchObject({
        p_nivel: "municipio",
        p_departamento: "05",
      })
      expect(bd.lecturas).toEqual([])
    })

    it("un mes sin fila vale 0 en un conteo y queda sin muestra en una tasa", async () => {
      conRpc(() => [
        kpi("medios", 5, 5),
        kpi("cumplimiento", 0.8, 40),
        mes("medios", "2026-09-01", 5),
        mes("cumplimiento", "2026-09-01", 0.8, 40),
        mes("cumplimiento", "2026-08-01", null, 3),
      ])
      const proveedor = crearProveedorSupabase()
      const conteo = await proveedor.detalle(LARGO)
      expect(conteo.serie?.puntos.map((p) => p.valor)).toEqual([0, 0, 0, 0, 5])
      const tasa = await proveedor.detalle({
        ...LARGO,
        metrica: "cumplimiento",
      })
      expect(tasa.serie?.puntos.map((p) => p.valor)).toEqual([
        null,
        null,
        null,
        null,
        0.8,
      ])
    })

    it("en periodos cortos la evolución semanal de la métrica activa sale de geo_metricas", async () => {
      const llamadas = conRpc(
        () => [kpi("medios", 7, 7, 7, 0), mes("medios", "2026-09-01", 7)],
        (args) =>
          args.p_nivel === "departamento"
            ? [{ codigo: "05", nombre: "Antioquia", valor: 3, n: 3 }]
            : []
      )
      const detalle = await crearProveedorSupabase().detalle(DETALLE)
      expect(detalle.serie?.granularidad).toBe("semana")
      expect(detalle.serie?.puntos.map((p) => p.valor)).toEqual([3, 3, 3, 3, 3])
      expect(detalle.serie?.puntos[0]).toMatchObject({
        desde: "2026-09-01",
        hasta: "2026-09-06",
        parcial: true,
      })

      const cubetas = llamadas.filter(
        (l) => l.nombre === "geo_metricas" && l.args.p_nivel === "departamento"
      )
      expect(cubetas).toHaveLength(5)
      // Un departamento se pide filtrado: la RPC devuelve una sola fila.
      expect(
        cubetas.every(
          (l) => l.args.p_departamento === "05" && l.args.p_metrica === "medios"
        )
      ).toBe(true)
      expect(
        llamadas.filter((l) => l.nombre === "detalle_zona_geo")
      ).toHaveLength(1)
    })

    it("si la evolución semanal falla, el resto del detalle llega", async () => {
      bd.rpc = async (nombre) =>
        nombre === "detalle_zona_geo"
          ? { data: [kpi("medios", 7, 7)], error: null }
          : { data: null, error: { code: "57014", message: "timeout" } }
      const detalle = await crearProveedorSupabase().detalle(DETALLE)
      expect(detalle.kpis[0]).toMatchObject({ metrica: "medios", valor: 7 })
      expect(detalle.serie).toBeNull()
      expect(detalle.sinSerie).toBe("fallo")
      expect(detalle.top).toBeNull()
    })

    it("en un departamento, el top son sus municipios con más valor", async () => {
      conRpc(
        () => [kpi("medios", 41, 41)],
        (args) =>
          args.p_nivel === "municipio"
            ? [
                { codigo: "05002", nombre: "Abejorral", valor: 1, n: 1 },
                { codigo: "05001", nombre: "Medellín", valor: 40, n: 40 },
                { codigo: "05004", nombre: "Abriaquí", valor: 0, n: 0 },
              ]
            : []
      )
      const { top } = await crearProveedorSupabase().detalle({
        ...LARGO,
        metricasKpi: ["medios"],
      })
      expect(top?.titulo).toBe("Municipios con más medios")
      expect(top?.filas.map((f) => f.nombre)).toEqual(["Medellín", "Abejorral"])
    })

    it("medios destacados: los de la RPC por GMV, con su municipio; solo si se piden", async () => {
      conRpc(() => [
        kpi("medios", 41, 41),
        medio("m1", "Radio Medellín", "Medellín (Antioquia)", "12500000", 12),
        medio("m2", "Envigado Hoy", "Envigado (Antioquia)", 9_000_000, 9),
      ])
      const proveedor = crearProveedorSupabase()
      const { medios } = await proveedor.detalle({ ...LARGO, conMedios: true })
      expect(medios).toMatchObject({
        titulo: "Medios con más GMV",
        metrica: "gmv",
      })
      expect(medios?.filas).toEqual([
        {
          codigo: "m1",
          nombre: "Radio Medellín",
          valor: 12_500_000,
          detalle: "Medellín",
        },
        {
          codigo: "m2",
          nombre: "Envigado Hoy",
          valor: 9_000_000,
          detalle: "Envigado",
        },
      ])
      // Sin el permiso, la sección no viaja aunque la RPC la traiga.
      expect((await proveedor.detalle(LARGO)).medios).toBeNull()
    })

    it("en un municipio, cada medio muestra cuántas asignaciones suman su GMV", async () => {
      const llamadas = conRpc(() => [
        kpi("medios", 3, 3),
        medio("m1", "Radio Medellín", "Medellín (Antioquia)", 4_000_000, 1),
        medio("m2", "Onda Medellín", "Medellín (Antioquia)", 2_500_000, 6),
      ])
      const { medios, top } = await crearProveedorSupabase().detalle({
        ...LARGO,
        nivel: "departamental",
        departamento: "05",
        zona: "05001",
        metricasKpi: ["medios"],
        conMedios: true,
      })
      expect(medios?.filas.map((f) => f.detalle)).toEqual([
        "1 asignación",
        "6 asignaciones",
      ])
      expect(llamadas[0].args).toMatchObject({
        p_nivel: "municipio",
        p_codigo: "05001",
      })
      // Un municipio no tiene subzonas.
      expect(top).toBeNull()
      expect(llamadas).toHaveLength(1)
    })

    it("un polígono compartido funde a sus municipios: suma conteos y pondera tasas por n", async () => {
      // El polígono de Río Viejo (13600) dibuja también a Norosí (13490).
      const llamadas = conRpc((args) =>
        args.p_codigo === "13600"
          ? [
              kpi("medios", 4, 4, 3, 0.333333),
              kpi("cumplimiento", 0.5, 20, 0.4, 0.25),
              mes("medios", "2026-09-01", 4),
              medio(
                "m1",
                "Río Viejo Stereo",
                "Río Viejo (Bolívar)",
                900_000,
                2
              ),
            ]
          : [
              kpi("medios", 3, 3, 3, 0),
              kpi("cumplimiento", 1, 60, 0.9, 0.111111),
              mes("medios", "2026-09-01", 3),
              medio("m2", "Norosí Al Día", "Norosí (Bolívar)", 1_400_000, 3),
            ]
      )
      const detalle = await crearProveedorSupabase().detalle({
        ...LARGO,
        nivel: "departamental",
        departamento: "13",
        zona: "13600",
        conMedios: true,
      })
      expect(
        llamadas
          .filter((l) => l.nombre === "detalle_zona_geo")
          .map((l) => l.args.p_codigo)
          .sort()
      ).toEqual(["13490", "13600"])
      expect(detalle.kpis[0]).toMatchObject({
        metrica: "medios",
        valor: 7,
        n: 7,
        anterior: 6,
      })
      expect(detalle.kpis[0].variacion).toBeCloseTo(1 / 6)
      // La tasa anterior llega sin su n: el comparativo de una tasa fundida no se calcula.
      expect(detalle.kpis[1]).toEqual({
        metrica: "cumplimiento",
        valor: 0.875,
        n: 80,
        anterior: null,
        variacion: null,
      })
      expect(detalle.serie?.puntos.at(-1)?.valor).toBe(7)
      expect(detalle.medios?.filas.map((f) => f.codigo)).toEqual(["m2", "m1"])
    })

    it("la audiencia no tiene evolución; un error de la RPC es el error del detalle", async () => {
      conRpc(() => [kpi("audiencia", 10, 1)])
      const audiencia = await crearProveedorSupabase().detalle({
        ...DETALLE,
        nivel: "internacional",
        metrica: "audiencia",
        zona: "US",
        metricasKpi: ["audiencia"],
      })
      expect(audiencia.kpis).toEqual([
        {
          metrica: "audiencia",
          valor: 10,
          n: 1,
          anterior: null,
          variacion: null,
        },
      ])
      expect(audiencia.serie).toBeNull()
      expect(audiencia.sinSerie).toBe("foto-actual")

      bd.rpc = conError("P0001", "AMO_NO_AUTORIZADO")
      await expect(
        crearProveedorSupabase().detalle(DETALLE)
      ).rejects.toMatchObject({
        motivo: "no-autorizado",
      })
      bd.rpc = conError(
        "P0001",
        "AMO_CONFIG_INVALIDA",
        "La zona no existe en este nivel del mapa."
      )
      await expect(crearProveedorSupabase().detalle(DETALLE)).rejects.toThrow(
        "La zona no existe en este nivel del mapa."
      )
    })

    it("sin movimiento en el periodo: la serie se omite con su motivo", async () => {
      conRpc(() => [kpi("medios", 0, 0, 0), mes("medios", "2026-09-01", 0)])
      const detalle = await crearProveedorSupabase().detalle({
        ...LARGO,
        metricasKpi: ["medios"],
      })
      expect(detalle.serie).toBeNull()
      expect(detalle.sinSerie).toBe("sin-datos")
    })
  })
})
