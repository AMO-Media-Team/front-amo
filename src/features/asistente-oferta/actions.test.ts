// @vitest-environment node
/**
 * Server Actions del asistente de oferta con el DAL, Supabase y la máquina de
 * estados simulados: autorizan antes que nada, validan con el mismo esquema
 * que el formulario, crean una oferta por formato en una sola inserción,
 * actualizan solo borradores o devueltas en la versión que vio el asistente
 * (sin pisar a un compañero), adoptan los borradores de un intento sin
 * respuesta, sincronizan los cupos con lo mínimo y traducen los rechazos del
 * envío al paso que los resuelve.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { IDS, valoresCompletos } from "./fixtures"
import type { ValoresOferta } from "./schemas"

interface Llamada {
  tabla: string
  operacion: "select" | "insert" | "update" | "delete"
  carga?: unknown
  filtros: [string, string, unknown][]
}

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  usuario: {
    id: "u1",
    rol: { tipo: "ANUNCIANTE" as "ANUNCIANTE" | "ADMIN" },
    anuncianteId: "e2e00000-0000-4000-8000-00000000a001" as string | null,
  },
  respuestas: {} as Record<string, unknown[]>,
  llamadas: [] as Llamada[],
  rpc: [] as { nombre: string; args: Record<string, unknown> }[],
  respuestaRpc: { data: [] as unknown, error: null as unknown },
  transiciones: [] as { id: string; hacia: string }[],
  erroresTransicion: {} as Record<string, unknown>,
  rpcServicio: [] as { nombre: string; args: Record<string, unknown> }[],
  errorServicio: null as unknown,
}))

function responder(clave: string) {
  const cola = estado.respuestas[clave]
  return cola && cola.length > 0 ? cola.shift() : { data: [], error: null }
}

function consulta(tabla: string) {
  const llamada: Llamada = { tabla, operacion: "select", filtros: [] }
  estado.llamadas.push(llamada)
  const clave = () => `${llamada.operacion}:${tabla}`
  const filtro = (tipo: string) => (columna: string, valor: unknown) => {
    llamada.filtros.push([tipo, columna, valor])
    return cadena
  }
  const cadena: Record<string, unknown> = {
    select: () => cadena,
    insert: (carga: unknown) => {
      llamada.operacion = "insert"
      llamada.carga = carga
      return cadena
    },
    update: (carga: unknown) => {
      llamada.operacion = "update"
      llamada.carga = carga
      return cadena
    },
    delete: () => {
      llamada.operacion = "delete"
      return cadena
    },
    eq: filtro("eq"),
    in: filtro("in"),
    is: filtro("is"),
    gte: filtro("gte"),
    order: () => cadena,
    maybeSingle: async () => responder(clave()),
    single: async () => responder(clave()),
    then: (
      resolver: (valor: unknown) => unknown,
      rechazar?: (e: unknown) => unknown
    ) => Promise.resolve(responder(clave())).then(resolver, rechazar),
  }
  return cadena
}

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return estado.usuario
  }),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async (actor: { id: string }) => {
    estado.orden.push("contexto")
    return {
      actorId: actor.id,
      sessionId: "s1",
      // Cliente de servicio: solo los `*_srv` que no son transiciones.
      admin: {
        rpc: async (nombre: string, args: Record<string, unknown>) => {
          estado.rpcServicio.push({ nombre, args })
          return { data: null, error: estado.errorServicio }
        },
      },
    }
  }),
}))
vi.mock("@/lib/negocio/transicionar", () => ({
  transicionar: vi.fn(
    async (_contexto: unknown, solicitud: { id: string; hacia: string }) => {
      estado.transiciones.push({ id: solicitud.id, hacia: solicitud.hacia })
      return {
        data: null,
        error: estado.erroresTransicion[solicitud.id] ?? null,
      }
    }
  ),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => {
    estado.orden.push("cliente")
    return {
      from: (tabla: string) => consulta(tabla),
      rpc: async (nombre: string, args: Record<string, unknown>) => {
        estado.rpc.push({ nombre, args })
        return estado.respuestaRpc
      },
    }
  }),
}))

const {
  buscarMediosExcluibles,
  descartarOferta,
  enviarOfertasARevision,
  estimarOferta,
  guardarOfertas,
} = await import("./actions")
const { CAMPANA_SIN_OFERTAS, OFERTA_DESACTUALIZADA, SIN_EMPRESA } =
  await import("./errores")

/** Versiones (`updated_at`) como las devuelve PostgREST. */
const V1 = "2026-10-22T15:00:00.123456+00:00"
const V2 = "2026-10-22T15:05:00.654321+00:00"
const V3 = "2026-10-22T15:06:00.000001+00:00"

interface FilaOferta {
  id: string
  formato_id: string
  estado: string
  updated_at: string
}

function fila(
  id: string,
  formato_id: string,
  estado: string,
  updated_at = V1
): FilaOferta {
  return { id, formato_id, estado, updated_at }
}

function dosFormatos(): ValoresOferta {
  const base = valoresCompletos()
  return valoresCompletos({
    que: { formatoIds: [IDS.igReel, IDS.ttVideo] },
    cuanto: {
      formatos: [
        base.cuanto.formatos[0],
        {
          formatoId: IDS.ttVideo,
          presupuestoMaximo: "2.000.000",
          cupos: [
            { franjaId: IDS.f1, cantidad: "" },
            { franjaId: IDS.f2, cantidad: "3" },
            { franjaId: IDS.f3, cantidad: "" },
          ],
        },
      ],
    },
  })
}

/**
 * Lecturas de `persistir`. `ofertas`: las respuestas siguientes a
 * `select:ofertas` (adopción, relectura de versiones…), en orden.
 */
function prepararLecturas({
  campana = "ACTIVA",
  previas = [] as FilaOferta[],
  ofertas = [] as FilaOferta[][],
} = {}) {
  estado.respuestas["select:campanas"] = [
    { data: { id: IDS.campana, estado: campana }, error: null },
  ]
  estado.respuestas["select:formatos"] = [
    {
      data: [
        { id: IDS.igReel, plataforma: "INSTAGRAM" },
        { id: IDS.ttVideo, plataforma: "TIKTOK" },
      ],
      error: null,
    },
  ]
  estado.respuestas["select:ofertas"] = [
    ...(previas.length > 0 ? [{ data: previas, error: null }] : []),
    ...ofertas.map((data) => ({ data, error: null })),
  ]
}

function llamadas(tabla: string, operacion: Llamada["operacion"]) {
  return estado.llamadas.filter(
    (l) => l.tabla === tabla && l.operacion === operacion
  )
}

beforeEach(() => {
  estado.orden = []
  estado.usuario = {
    id: "u1",
    rol: { tipo: "ANUNCIANTE" },
    anuncianteId: "e2e00000-0000-4000-8000-00000000a001",
  }
  estado.respuestas = {}
  estado.llamadas = []
  estado.rpc = []
  estado.respuestaRpc = { data: [], error: null }
  estado.transiciones = []
  estado.erroresTransicion = {}
  estado.rpcServicio = []
  estado.errorServicio = null
})

describe("guardarOfertas", () => {
  it("autoriza antes que nada y rechaza valores inválidos sin tocar la BD", async () => {
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [],
      valores: valoresCompletos({ que: { titulo: "" } }),
    })
    expect(estado.orden[0]).toBe(
      "dal:ofertas.gestionar_propias,ofertas.gestionar"
    )
    expect(resultado.ok).toBe(false)
    if (resultado.ok) return
    // Las rutas de error son las del formulario.
    expect(resultado.erroresCampo?.["que.titulo"]).toEqual([
      "Escribe un título para la oferta.",
    ])
    expect(estado.llamadas).toHaveLength(0)
  })

  it("sin empresa vinculada no hace nada", async () => {
    estado.usuario.anuncianteId = null
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [],
      valores: valoresCompletos(),
    })
    expect(resultado).toEqual({ ok: false, error: SIN_EMPRESA })
    expect(estado.llamadas).toHaveLength(0)
  })

  it("al equipo AMO no se le exige empresa propia (gestión asistida, ADM-014)", async () => {
    estado.usuario = { id: "op1", rol: { tipo: "ADMIN" }, anuncianteId: null }
    prepararLecturas({
      ofertas: [[fila(IDS.ofertaA, IDS.igReel, "BORRADOR", V2)]],
    })
    estado.respuestas["insert:ofertas"] = [
      { data: [fila(IDS.ofertaA, IDS.igReel, "BORRADOR")], error: null },
    ]
    estado.respuestas["select:oferta_cupos"] = [{ data: [], error: null }]
    const valores = valoresCompletos()
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [],
      valores,
    })
    expect(estado.orden[0]).toBe(
      "dal:ofertas.gestionar_propias,ofertas.gestionar"
    )
    expect(resultado.ok).toBe(true)
    // La empresa la deriva la BD de la campaña también en modo asistido.
    const [insercion] = llamadas("ofertas", "insert")
    const filas = insercion.carga as Record<string, unknown>[]
    expect(filas[0]).toMatchObject({ campana_id: IDS.campana })
    expect(filas[0]).not.toHaveProperty("anunciante_id")
  })

  it("crea una oferta por formato en una sola inserción y luego sus cupos", async () => {
    // Los cupos cambian la versión de cada oferta: se relee al final.
    prepararLecturas({
      ofertas: [
        [
          fila(IDS.ofertaA, IDS.igReel, "BORRADOR", V2),
          fila(IDS.ofertaB, IDS.ttVideo, "BORRADOR", V2),
        ],
      ],
    })
    estado.respuestas["insert:ofertas"] = [
      {
        data: [
          fila(IDS.ofertaB, IDS.ttVideo, "BORRADOR"),
          fila(IDS.ofertaA, IDS.igReel, "BORRADOR"),
        ],
        error: null,
      },
    ]
    estado.respuestas["select:oferta_cupos"] = [{ data: [], error: null }]
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [],
      valores: dosFormatos(),
    })
    expect(resultado).toEqual({
      ok: true,
      datos: [
        {
          ofertaId: IDS.ofertaA,
          formatoId: IDS.igReel,
          estado: "BORRADOR",
          actualizadaAt: V2,
        },
        {
          ofertaId: IDS.ofertaB,
          formatoId: IDS.ttVideo,
          estado: "BORRADOR",
          actualizadaAt: V2,
        },
      ],
    })
    // Sin un intento previo sin respuesta no se buscan borradores que adoptar.
    expect(
      llamadas("ofertas", "select").some((l) =>
        l.filtros.some(([, columna]) => columna === "creada_por")
      )
    ).toBe(false)
    const [insercion] = llamadas("ofertas", "insert")
    const filas = insercion.carga as Record<string, unknown>[]
    expect(filas).toHaveLength(2)
    expect(filas[0]).toMatchObject({
      campana_id: IDS.campana,
      formato_id: IDS.igReel,
      plataforma: "INSTAGRAM",
      presupuesto_maximo: 5_000_000,
      titulo: "Lanzamiento de la nueva línea",
    })
    expect(filas[1]).toMatchObject({
      formato_id: IDS.ttVideo,
      plataforma: "TIKTOK",
      presupuesto_maximo: 2_000_000,
    })
    // La empresa la deriva la BD de la campaña (no tiene GRANT de inserción).
    expect(filas[0]).not.toHaveProperty("anunciante_id")
    expect(llamadas("ofertas", "update")).toHaveLength(0)
    const [cupos] = llamadas("oferta_cupos", "insert")
    expect(cupos.carga).toEqual([
      { oferta_id: IDS.ofertaA, franja_id: IDS.f1, cupos_totales: 5 },
      { oferta_id: IDS.ofertaB, franja_id: IDS.f2, cupos_totales: 3 },
    ])
  })

  it("actualiza solo borradores o devueltas en su versión y escribe solo los cupos que cambiaron", async () => {
    prepararLecturas({
      previas: [fila(IDS.ofertaA, IDS.igReel, "DEVUELTA", V1)],
      ofertas: [[fila(IDS.ofertaA, IDS.igReel, "DEVUELTA", V2)]],
    })
    estado.respuestas["update:ofertas"] = [
      { data: { id: IDS.ofertaA }, error: null },
    ]
    estado.respuestas["select:oferta_cupos"] = [
      {
        data: [
          { oferta_id: IDS.ofertaA, franja_id: IDS.f1, cupos_totales: 2 },
          { oferta_id: IDS.ofertaA, franja_id: IDS.f3, cupos_totales: 1 },
        ],
        error: null,
      },
    ]
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [
        { formatoId: IDS.igReel, ofertaId: IDS.ofertaA, actualizadaAt: V1 },
      ],
      valores: valoresCompletos(),
    })
    // Devuelve la versión que dejaron la fila y sus cupos.
    expect(resultado).toEqual({
      ok: true,
      datos: [
        {
          ofertaId: IDS.ofertaA,
          formatoId: IDS.igReel,
          estado: "DEVUELTA",
          actualizadaAt: V2,
        },
      ],
    })
    const [actualizacion] = llamadas("ofertas", "update")
    expect(actualizacion.filtros).toContainEqual([
      "in",
      "estado",
      ["BORRADOR", "DEVUELTA"],
    ])
    expect(actualizacion.filtros).toContainEqual(["eq", "updated_at", V1])
    expect(actualizacion.carga).not.toHaveProperty("formato_id")
    expect(llamadas("ofertas", "insert")).toHaveLength(0)
    expect(llamadas("oferta_cupos", "update")[0].carga).toEqual({
      cupos_totales: 5,
    })
    expect(llamadas("oferta_cupos", "delete")[0].filtros).toContainEqual([
      "in",
      "franja_id",
      [IDS.f3],
    ])
    expect(llamadas("oferta_cupos", "insert")).toHaveLength(0)
  })

  it("no pisa lo que guardó un compañero después de abrirla: no escribe nada", async () => {
    // B guardó (V2) mientras A editaba lo que leyó en V1.
    prepararLecturas({
      previas: [fila(IDS.ofertaA, IDS.igReel, "BORRADOR", V2)],
    })
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [
        { formatoId: IDS.igReel, ofertaId: IDS.ofertaA, actualizadaAt: V1 },
      ],
      valores: valoresCompletos(),
    })
    expect(resultado).toEqual({ ok: false, error: OFERTA_DESACTUALIZADA })
    expect(llamadas("ofertas", "update")).toHaveLength(0)
    expect(llamadas("ofertas", "insert")).toHaveLength(0)
    expect(llamadas("oferta_cupos", "select")).toHaveLength(0)
  })

  it("si cambia entre la lectura y la escritura, tampoco la pisa", async () => {
    prepararLecturas({
      previas: [fila(IDS.ofertaA, IDS.igReel, "BORRADOR", V1)],
    })
    estado.respuestas["update:ofertas"] = [{ data: null, error: null }]
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [
        { formatoId: IDS.igReel, ofertaId: IDS.ofertaA, actualizadaAt: V1 },
      ],
      valores: valoresCompletos(),
    })
    expect(resultado).toEqual({ ok: false, error: OFERTA_DESACTUALIZADA })
    expect(llamadas("oferta_cupos", "select")).toHaveLength(0)
  })

  it("una que ya no es editable no se toca: vuelve con su estado (el asistente lo avisa)", async () => {
    // Un compañero la envió a revisión (otra versión): no es un choque.
    prepararLecturas({
      previas: [fila(IDS.ofertaA, IDS.igReel, "EN_REVISION", V2)],
      ofertas: [[fila(IDS.ofertaA, IDS.igReel, "EN_REVISION", V2)]],
    })
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [
        { formatoId: IDS.igReel, ofertaId: IDS.ofertaA, actualizadaAt: V1 },
      ],
      valores: valoresCompletos(),
    })
    expect(resultado).toEqual({
      ok: true,
      datos: [
        {
          ofertaId: IDS.ofertaA,
          formatoId: IDS.igReel,
          estado: "EN_REVISION",
          actualizadaAt: V2,
        },
      ],
    })
    expect(llamadas("ofertas", "update")).toHaveLength(0)
  })

  it("tras un intento sin respuesta adopta los borradores que alcanzó a crear (no los duplica)", async () => {
    prepararLecturas({
      ofertas: [
        // Lo que creó el intento perdido (del más reciente al más antiguo).
        [fila(IDS.ofertaA, IDS.igReel, "BORRADOR", V1)],
        [fila(IDS.ofertaA, IDS.igReel, "BORRADOR", V3)],
      ],
    })
    estado.respuestas["update:ofertas"] = [
      { data: { id: IDS.ofertaA }, error: null },
    ]
    estado.respuestas["select:oferta_cupos"] = [
      {
        data: [{ oferta_id: IDS.ofertaA, franja_id: IDS.f1, cupos_totales: 5 }],
        error: null,
      },
    ]
    const antes = Date.now()
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [],
      segundosDesdeFallo: 30,
      valores: valoresCompletos(),
    })
    expect(resultado).toEqual({
      ok: true,
      datos: [
        {
          ofertaId: IDS.ofertaA,
          formatoId: IDS.igReel,
          estado: "BORRADOR",
          actualizadaAt: V3,
        },
      ],
    })
    expect(llamadas("ofertas", "insert")).toHaveLength(0)
    const [busqueda] = llamadas("ofertas", "select")
    expect(busqueda.filtros).toEqual(
      expect.arrayContaining([
        ["eq", "campana_id", IDS.campana],
        ["eq", "creada_por", "u1"],
        ["in", "formato_id", [IDS.igReel]],
        ["is", "deleted_at", null],
      ])
    )
    // Desde que empezó el intento perdido, con margen.
    const desde = busqueda.filtros.find(
      ([, columna]) => columna === "created_at"
    )
    const instante = Date.parse(String(desde?.[2]))
    expect(antes - instante).toBeGreaterThanOrEqual(30_000)
    expect(antes - instante).toBeLessThan(5 * 60_000)
    const [actualizacion] = llamadas("ofertas", "update")
    expect(actualizacion.filtros).toContainEqual(["eq", "id", IDS.ofertaA])
    expect(actualizacion.filtros).toContainEqual(["eq", "updated_at", V1])
  })

  it("no crea ofertas en una campaña que ya no las admite", async () => {
    prepararLecturas({ campana: "FINALIZADA" })
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [],
      valores: valoresCompletos(),
    })
    expect(resultado).toEqual({ ok: false, error: CAMPANA_SIN_OFERTAS })
    expect(llamadas("ofertas", "insert")).toHaveLength(0)
  })

  it("si falla después de crear, devuelve las creadas para no duplicarlas", async () => {
    prepararLecturas()
    estado.respuestas["insert:ofertas"] = [
      {
        data: [fila(IDS.ofertaA, IDS.igReel, "BORRADOR")],
        error: null,
      },
    ]
    estado.respuestas["select:oferta_cupos"] = [{ data: [], error: null }]
    estado.respuestas["insert:oferta_cupos"] = [
      {
        data: null,
        error: {
          code: "P0001",
          message: "AMO_CONFIG_INVALIDA",
          details: "La franja no está activa.",
        },
      },
    ]
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [],
      valores: valoresCompletos(),
    })
    expect(resultado).toEqual({
      ok: false,
      error: "La franja no está activa.",
      ofertas: [
        {
          ofertaId: IDS.ofertaA,
          formatoId: IDS.igReel,
          estado: "BORRADOR",
          actualizadaAt: V1,
        },
      ],
    })
  })

  it("una restricción de la BD llega a su campo", async () => {
    prepararLecturas()
    estado.respuestas["insert:ofertas"] = [
      {
        data: null,
        error: {
          code: "23514",
          message:
            'new row for relation "ofertas" violates check constraint "ofertas_fecha_limite_chk"',
        },
      },
    ]
    const resultado = await guardarOfertas({
      campanaId: IDS.campana,
      existentes: [],
      valores: valoresCompletos(),
    })
    expect(resultado.ok).toBe(false)
    if (resultado.ok) return
    expect(Object.keys(resultado.erroresCampo ?? {})).toEqual([
      "cuando.fechaLimite",
    ])
  })
})

describe("enviarOfertasARevision", () => {
  it("guarda y envía cada oferta editable; un rechazo dice el paso", async () => {
    prepararLecturas({
      previas: [
        fila(IDS.ofertaA, IDS.igReel, "BORRADOR"),
        fila(IDS.ofertaB, IDS.ttVideo, "BORRADOR"),
      ],
      ofertas: [
        // Tras guardar.
        [
          fila(IDS.ofertaA, IDS.igReel, "BORRADOR", V2),
          fila(IDS.ofertaB, IDS.ttVideo, "BORRADOR", V2),
        ],
        // Tras enviar: la transición también cambia la versión.
        [
          fila(IDS.ofertaA, IDS.igReel, "EN_REVISION", V3),
          fila(IDS.ofertaB, IDS.ttVideo, "BORRADOR", V2),
        ],
      ],
    })
    estado.respuestas["update:ofertas"] = [
      { data: { id: IDS.ofertaA }, error: null },
      { data: { id: IDS.ofertaB }, error: null },
    ]
    estado.erroresTransicion[IDS.ofertaB] = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details: "Carga el paquete creativo con al menos un archivo.",
      hint: "envio_oferta:creativo",
    }
    const resultado = await enviarOfertasARevision({
      campanaId: IDS.campana,
      existentes: [
        { formatoId: IDS.igReel, ofertaId: IDS.ofertaA, actualizadaAt: V1 },
        { formatoId: IDS.ttVideo, ofertaId: IDS.ofertaB, actualizadaAt: V1 },
      ],
      valores: dosFormatos(),
    })
    expect(estado.orden[0]).toBe(
      "dal:ofertas.gestionar_propias,ofertas.gestionar"
    )
    expect(estado.transiciones).toEqual([
      { id: IDS.ofertaA, hacia: "EN_REVISION" },
      { id: IDS.ofertaB, hacia: "EN_REVISION" },
    ])
    expect(resultado).toEqual({
      ok: true,
      datos: {
        ofertas: [
          {
            ofertaId: IDS.ofertaA,
            formatoId: IDS.igReel,
            estado: "EN_REVISION",
            actualizadaAt: V3,
          },
          {
            ofertaId: IDS.ofertaB,
            formatoId: IDS.ttVideo,
            estado: "BORRADOR",
            actualizadaAt: V2,
          },
        ],
        enviadas: [IDS.ofertaA],
        rechazos: [
          {
            ofertaId: IDS.ofertaB,
            paso: "creativo",
            mensaje: "Carga el paquete creativo con al menos un archivo.",
          },
        ],
      },
    })
  })

  it("no vuelve a enviar ni modificar una oferta que ya está en revisión", async () => {
    prepararLecturas({
      previas: [fila(IDS.ofertaA, IDS.igReel, "EN_REVISION")],
    })
    const resultado = await enviarOfertasARevision({
      campanaId: IDS.campana,
      existentes: [
        { formatoId: IDS.igReel, ofertaId: IDS.ofertaA, actualizadaAt: V1 },
      ],
      valores: valoresCompletos(),
    })
    expect(llamadas("ofertas", "update")).toHaveLength(0)
    expect(estado.transiciones).toEqual([])
    expect(resultado.ok && resultado.datos.enviadas).toEqual([])
  })
})

describe("descartarOferta", () => {
  it("archiva el borrador con el actor y su sesión (no lo cancela)", async () => {
    const resultado = await descartarOferta({ ofertaId: IDS.ofertaA })
    expect(estado.orden).toEqual([
      "dal:ofertas.gestionar_propias,ofertas.gestionar",
      "contexto",
    ])
    expect(estado.rpcServicio).toEqual([
      {
        nombre: "archivar_oferta_srv",
        args: {
          p_oferta_id: IDS.ofertaA,
          p_actor_id: "u1",
          p_session_id: "s1",
        },
      },
    ])
    expect(estado.transiciones).toEqual([])
    expect(resultado).toEqual({ ok: true, datos: undefined })
  })

  it("una oferta que ya no es borrador no se archiva: lo dice la BD", async () => {
    estado.errorServicio = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details: "Solo se archivan borradores y ofertas terminadas.",
    }
    const resultado = await descartarOferta({ ofertaId: IDS.ofertaA })
    expect(resultado).toEqual({
      ok: false,
      error: "Solo se archivan borradores y ofertas terminadas.",
    })
  })

  it("valida el id antes de llamar", async () => {
    const resultado = await descartarOferta({ ofertaId: "x" })
    expect(resultado.ok).toBe(false)
    expect(estado.rpcServicio).toEqual([])
  })
})

describe("estimador y exclusiones", () => {
  const parametros = {
    formatoId: IDS.igReel,
    departamentos: ["05"],
    municipios: [],
    categorias: [],
    seguidoresMinimos: 20_000,
    cupos: { [IDS.f1]: 1 },
    exclusividadDias: 15,
    mediosExcluidos: [IDS.medio],
    publicaciones: 1,
  }

  it("estima por franja con los parámetros de la RPC", async () => {
    estado.respuestaRpc = {
      data: [
        {
          franja_id: IDS.f1,
          medios_elegibles: 79,
          precio_mediano: 437500,
          inversion_estimada: 437500,
          alcance_mediano_estimado: null,
        },
      ],
      error: null,
    }
    const resultado = await estimarOferta(parametros)
    expect(estado.rpc[0]).toEqual({
      nombre: "estimar_oferta",
      args: {
        p_formato_id: IDS.igReel,
        p_departamentos: ["05"],
        p_municipios: [],
        p_categorias: [],
        p_seguidores_minimos: 20_000,
        p_cupos: { [IDS.f1]: 1 },
        p_exclusividad_dias: 15,
        p_medios_excluidos: [IDS.medio],
        p_publicaciones: 1,
      },
    })
    expect(resultado).toEqual({
      ok: true,
      datos: [
        {
          franjaId: IDS.f1,
          mediosElegibles: 79,
          precioMediano: 437500,
          inversionEstimada: 437500,
          alcanceMediano: null,
        },
      ],
    })
  })

  it("con pocos medios en la franja no inventa un cero: llega sin cifra", async () => {
    estado.respuestaRpc = {
      data: [
        {
          franja_id: IDS.f2,
          medios_elegibles: null,
          precio_mediano: null,
          inversion_estimada: null,
          alcance_mediano_estimado: null,
        },
      ],
      error: null,
    }
    expect(await estimarOferta(parametros)).toEqual({
      ok: true,
      datos: [
        {
          franjaId: IDS.f2,
          mediosElegibles: null,
          precioMediano: null,
          inversionEstimada: null,
          alcanceMediano: null,
        },
      ],
    })
  })

  it("busca medios con al menos tres letras", async () => {
    expect((await buscarMediosExcluibles({ texto: "ra" })).ok).toBe(false)
    expect(estado.rpc).toHaveLength(0)
    estado.respuestaRpc = {
      data: [{ id: IDS.medio, nombre: "Radio Bogotá", municipio: null }],
      error: null,
    }
    expect(await buscarMediosExcluibles({ texto: "radio" })).toEqual({
      ok: true,
      datos: [{ id: IDS.medio, nombre: "Radio Bogotá", municipio: null }],
    })
    expect(estado.rpc[0]).toEqual({
      nombre: "medios_para_exclusion",
      args: { p_texto: "radio", p_limite: 20 },
    })
  })
})
