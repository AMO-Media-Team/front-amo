// @vitest-environment node
/**
 * Server Actions de campañas con el DAL, Supabase y las lecturas simulados:
 * archivar va por `archivar_campana_srv` con el actor y su sesión (no por la
 * máquina de estados) y el presupuesto que la BD rechaza al editar se explica
 * con la cifra vigente, igual que el formulario. En la gestión asistida
 * (ADM-014) las acciones aceptan el permiso del anunciante o el del equipo
 * AMO y solo al anunciante se le exige empresa propia.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MiCampana } from "./tipos"

const CAMPANA_ID = "0199f3a0-0000-7000-8000-00000000ca01"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  usuario: {
    id: "u1",
    rol: { tipo: "ANUNCIANTE" as "ANUNCIANTE" | "ADMIN" },
    anuncianteId: "e2e00000-0000-4000-8000-00000000a001" as string | null,
  },
  insercion: null as Record<string, unknown> | null,
  lecturas: [] as string[],
  rpcServicio: [] as { nombre: string; args: Record<string, unknown> }[],
  errorServicio: null as unknown,
  transiciones: [] as unknown[],
  campana: null as unknown,
  errorUpdate: null as unknown,
  relectura: { data: null as unknown, error: null as unknown },
  disponible: { data: null as unknown, error: null as unknown },
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))
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
  transicionar: vi.fn(async (_contexto: unknown, solicitud: unknown) => {
    estado.transiciones.push(solicitud)
    return { data: null, error: null }
  }),
}))
vi.mock("./queries", () => ({
  obtenerMiCampana: vi.fn(async (anuncianteId: string) => {
    estado.lecturas.push(`propia:${anuncianteId}`)
    return estado.campana
  }),
  obtenerCampanaGestionable: vi.fn(async () => {
    estado.lecturas.push("gestionable")
    return estado.campana
  }),
  ofertasDeMiCampana: vi.fn(async () => []),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({
    from: () => {
      let actualiza = false
      const cadena = {
        insert: (fila: Record<string, unknown>) => {
          estado.insercion = fila
          return {
            select: () => ({
              single: async () => ({ data: { id: CAMPANA_ID }, error: null }),
            }),
          }
        },
        update: () => {
          actualiza = true
          return cadena
        },
        select: () =>
          actualiza
            ? Promise.resolve({ data: null, error: estado.errorUpdate })
            : cadena,
        eq: () => cadena,
        maybeSingle: async () => estado.relectura,
      }
      return cadena
    },
    rpc: async () => estado.disponible,
  })),
}))

const { activarCampana, archivarCampana, crearCampana, editarCampana } =
  await import("./actions")

const PERMISOS_DAL = "dal:campanas.gestionar_propias,campanas.gestionar"
const OTRA_EMPRESA = "0199f3a0-0000-7000-8000-0000000000b2"

function campana(cambios: Partial<MiCampana> = {}): MiCampana {
  return {
    id: CAMPANA_ID,
    nombre: "Temporada navideña",
    marca: "Marca",
    objetivo: null,
    anuncianteId: "e2e00000-0000-4000-8000-00000000a001",
    estado: "ACTIVA",
    fechaInicio: "2026-11-01",
    fechaFin: "2026-12-31",
    presupuestoTotal: 30_000_000,
    presupuestoComprometido: 0,
    disponible: 30_000_000,
    activadaAt: "2026-10-20T15:00:00+00:00",
    finalizadaAt: null,
    canceladaAt: null,
    creadaAt: "2026-10-20T14:00:00+00:00",
    actualizadaAt: "2026-10-21T14:00:00+00:00",
    esDemo: false,
    gestionAsistida: false,
    ...cambios,
  }
}

beforeEach(() => {
  estado.usuario = {
    id: "u1",
    rol: { tipo: "ANUNCIANTE" },
    anuncianteId: "e2e00000-0000-4000-8000-00000000a001",
  }
  estado.insercion = null
  estado.lecturas = []
  estado.orden = []
  estado.rpcServicio = []
  estado.errorServicio = null
  estado.transiciones = []
  estado.campana = campana()
  estado.errorUpdate = null
  estado.relectura = { data: null, error: null }
  estado.disponible = { data: null, error: null }
})

describe("archivarCampana", () => {
  it("archiva con el actor y su sesión, después del DAL", async () => {
    const resultado = await archivarCampana({ campanaId: CAMPANA_ID })
    expect(estado.orden).toEqual([PERMISOS_DAL, "contexto"])
    expect(estado.rpcServicio).toEqual([
      {
        nombre: "archivar_campana_srv",
        args: {
          p_campana_id: CAMPANA_ID,
          p_actor_id: "u1",
          p_session_id: "s1",
        },
      },
    ])
    // Ya no es una cancelación.
    expect(estado.transiciones).toEqual([])
    expect(resultado).toEqual({ ok: true, datos: undefined })
  })

  it("una campaña activa no se archiva: lo explica la BD", async () => {
    estado.errorServicio = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details:
        "Solo se archivan campañas en borrador, canceladas o finalizadas.",
    }
    expect(await archivarCampana({ campanaId: CAMPANA_ID })).toEqual({
      ok: false,
      error: "Solo se archivan campañas en borrador, canceladas o finalizadas.",
    })
  })

  it("valida el id antes de tocar la BD", async () => {
    const resultado = await archivarCampana({ campanaId: "nada" })
    expect(resultado.ok).toBe(false)
    expect(estado.rpcServicio).toEqual([])
  })
})

describe("editarCampana · presupuesto rechazado por la BD", () => {
  const entrada = {
    campanaId: CAMPANA_ID,
    actualizadoAt: "2026-10-21T14:00:00+00:00",
    nombre: "Temporada navideña",
    marca: "Marca",
    objetivo: "",
    fechaInicio: "2026-11-01",
    fechaFin: "2026-12-31",
    presupuesto: "4.000.000",
  }
  const rechazo = {
    code: "P0001",
    message: "AMO_PRESUPUESTO_CAMPANA",
    details:
      "El presupuesto no puede quedar por debajo de lo que reservan las ofertas en revisión o publicadas.",
  }

  it("otra oferta pasó a revisión mientras se editaba: dice el piso vigente en el campo", async () => {
    estado.errorUpdate = rechazo
    estado.relectura = {
      data: { presupuesto_total: 30_000_000, presupuesto_comprometido: 0 },
      error: null,
    }
    estado.disponible = { data: 25_000_000, error: null }
    const resultado = await editarCampana(entrada)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) return
    expect(resultado.error).toMatch(
      /^El presupuesto no puede quedar por debajo de \$\s5\.000\.000/
    )
    expect(resultado.erroresCampo?.presupuesto).toEqual([resultado.error])
  })

  it("si no se puede releer el piso, queda el detalle de la BD en el campo", async () => {
    estado.errorUpdate = rechazo
    estado.relectura = { data: null, error: { code: "XX000" } }
    const resultado = await editarCampana(entrada)
    expect(resultado).toEqual({
      ok: false,
      error: rechazo.details,
      erroresCampo: { presupuesto: [rechazo.details] },
    })
  })
})

describe("gestión asistida (ADM-014)", () => {
  const nueva = {
    nombre: "Temporada navideña",
    marca: "Marca",
    objetivo: "",
    fechaInicio: "2099-11-01",
    fechaFin: "2099-12-31",
    presupuesto: "25.000.000",
  }

  function comoEquipoAmo() {
    estado.usuario = { id: "op1", rol: { tipo: "ADMIN" }, anuncianteId: null }
  }

  it("el anunciante crea en su empresa aunque la entrada diga otra", async () => {
    const resultado = await crearCampana({
      ...nueva,
      anuncianteId: OTRA_EMPRESA,
    })
    expect(estado.orden).toEqual([PERMISOS_DAL])
    expect(resultado).toEqual({ ok: true, datos: { id: CAMPANA_ID } })
    expect(estado.insercion?.anunciante_id).toBe(
      "e2e00000-0000-4000-8000-00000000a001"
    )
  })

  it("al anunciante sin empresa no se le crea nada", async () => {
    estado.usuario.anuncianteId = null
    const resultado = await crearCampana(nueva)
    expect(resultado.ok).toBe(false)
    expect(estado.insercion).toBeNull()
  })

  it("el equipo AMO crea en la empresa que eligió, sin empresa propia", async () => {
    comoEquipoAmo()
    const resultado = await crearCampana({
      ...nueva,
      anuncianteId: OTRA_EMPRESA,
    })
    expect(resultado).toEqual({ ok: true, datos: { id: CAMPANA_ID } })
    expect(estado.insercion).toMatchObject({
      anunciante_id: OTRA_EMPRESA,
      nombre: "Temporada navideña",
      presupuesto_total: 25_000_000,
    })
    expect(estado.insercion).not.toHaveProperty("anuncianteId")
  })

  it("el equipo AMO debe elegir el anunciante (error en su campo)", async () => {
    comoEquipoAmo()
    const resultado = await crearCampana(nueva)
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: { anuncianteId: ["Elige el anunciante."] },
    })
    expect(estado.insercion).toBeNull()
  })

  it("el equipo AMO edita sin filtrar por una empresa propia (la RLS decide)", async () => {
    comoEquipoAmo()
    const resultado = await editarCampana({
      campanaId: CAMPANA_ID,
      actualizadoAt: "2026-10-21T14:00:00+00:00",
      nombre: "Temporada navideña",
      marca: "Marca",
      objetivo: "",
      fechaInicio: "2026-11-01",
      fechaFin: "2026-12-31",
      presupuesto: "30.000.000",
    })
    expect(resultado).toEqual({
      ok: true,
      datos: { actualizadoAt: "2026-10-21T14:00:00+00:00" },
    })
    expect(estado.lecturas).toEqual(["gestionable"])
  })

  it("el anunciante edita leyendo solo su empresa", async () => {
    await editarCampana({
      campanaId: CAMPANA_ID,
      actualizadoAt: "2026-10-21T14:00:00+00:00",
      nombre: "Temporada navideña",
      marca: "Marca",
      objetivo: "",
      fechaInicio: "2026-11-01",
      fechaFin: "2026-12-31",
      presupuesto: "30.000.000",
    })
    expect(estado.lecturas).toEqual([
      "propia:e2e00000-0000-4000-8000-00000000a001",
    ])
  })

  it("activar acepta cualquiera de los dos permisos y va por la máquina de estados", async () => {
    comoEquipoAmo()
    const resultado = await activarCampana({ campanaId: CAMPANA_ID })
    expect(resultado.ok).toBe(true)
    expect(estado.orden).toEqual([PERMISOS_DAL, "contexto"])
    expect(estado.transiciones).toEqual([
      { entidad: "campanas", id: CAMPANA_ID, hacia: "ACTIVA" },
    ])
  })
})
