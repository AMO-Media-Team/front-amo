import { describe, expect, it } from "vitest"

import {
  asignacionDesdeFila,
  type FilaMedioPublico,
  type FilaSeguimiento,
  perfilDesdeFila,
  type ResolverUbicacion,
} from "./normalizar"

const UBICACION: ResolverUbicacion = {
  municipio: (codigo) => (codigo === "70001" ? "Sincelejo" : codigo),
  departamento: (codigo) => (codigo === "70" ? "Sucre" : null),
}

/** Fila tal como la entrega `seguimiento_campana` (las nulas llegan como `null`). */
function fila(cambios: Record<string, unknown> = {}): FilaSeguimiento {
  return {
    asignacion_id: "01a16693-73ac-737c-acec-451c31ed4077",
    oferta_id: "01a16693-0000-737c-acec-451c31ed4077",
    oferta_titulo: "Historia de Instagram · Halloween",
    plataforma: "INSTAGRAM",
    slot: 1,
    estado: "METRICAS_CARGADAS",
    estado_previo_disputa: null,
    causa_cancelacion: null,
    aceptada_at: "2026-10-12T13:00:00-05:00",
    contenido_descargado_at: "2026-10-13T13:00:00-05:00",
    fecha_limite_publicacion: "2026-10-19T23:59:59-05:00",
    publicada_at: "2026-10-14T08:23:55-05:00",
    evidencia_validada_at: "2026-10-14T18:00:00-05:00",
    metricas_cargadas_at: "2026-10-21T09:00:00-05:00",
    verificada_at: null,
    vencida_at: null,
    en_disputa_at: null,
    cancelada_at: null,
    monto_bruto: "205900.00",
    medio_id: "01a16693-1111-737c-acec-451c31ed4077",
    medio_nombre: "Comunidad Sincelejo",
    municipio_codigo: "70001",
    departamento_codigo: "70",
    nivel_verificacion: 1,
    cuenta: {
      url: "https://www.instagram.com/comunidadsincelejo/",
      handle: "comunidadsincelejo",
      plataforma: "INSTAGRAM",
      franja_clave: "F2",
      seguidores_al_aceptar: 113398,
    },
    publicaciones: [
      {
        id: "01a16693-74d0-767e-9e60-c1c457879824",
        numero: 1,
        url_post:
          "https://www.instagram.com/stories/comunidadsincelejo/3763729389698611456/",
        con_captura: true,
        estado_validacion: "APROBADA",
        fecha_publicacion: "2026-10-14T08:23:55-05:00",
        cortes: [
          {
            clics: null,
            corte: "H72",
            alcance: 8750,
            fecha_corte: "2026-10-17T08:23:55-05:00",
            impresiones: 11062,
            interacciones: 276,
            reproducciones: null,
          },
          {
            clics: null,
            corte: "H24",
            alcance: "6017",
            fecha_corte: "2026-10-15T08:23:55-05:00",
            impresiones: 7607,
            interacciones: 190,
            reproducciones: null,
          },
        ],
      },
    ],
    ...cambios,
  } as unknown as FilaSeguimiento
}

describe("asignacionDesdeFila", () => {
  it("convierte la fila con el medio público, la cuenta y los cortes en orden", () => {
    const asignacion = asignacionDesdeFila(fila(), UBICACION)
    expect(asignacion).toMatchObject({
      id: "01a16693-73ac-737c-acec-451c31ed4077",
      estado: "METRICAS_CARGADAS",
      montoBruto: 205900,
      verificadaAt: null,
      medio: {
        nombre: "Comunidad Sincelejo",
        municipio: "Sincelejo",
        departamento: "Sucre",
        nivel: 1,
      },
      cuenta: {
        plataforma: "INSTAGRAM",
        handle: "comunidadsincelejo",
        seguidoresAlAceptar: 113398,
        franja: "F2",
      },
    })
    const [publicacion] = asignacion.publicaciones
    expect(publicacion.conCaptura).toBe(true)
    expect(publicacion.cortes.map((c) => c.corte)).toEqual(["H24", "H72"])
    // `numeric` que llega como texto se convierte en número.
    expect(publicacion.cortes[0].alcance).toBe(6017)
  })

  it("tolera jsonb inesperado sin romper la pestaña", () => {
    const asignacion = asignacionDesdeFila(
      fila({
        cuenta: null,
        publicaciones: [
          { id: "x" },
          {
            id: "01a16693-74d0-767e-9e60-c1c457879825",
            numero: 2,
            url_post: "https://www.tiktok.com/@a/video/1",
            fecha_publicacion: "2026-10-14T08:23:55-05:00",
            estado_validacion: "PENDIENTE",
            con_captura: "sí",
            cortes: [{ corte: "PERSONALIZADO" }, "basura"],
          },
        ],
        plataforma: "TIKTOK",
      }),
      UBICACION
    )
    expect(asignacion.cuenta).toEqual({
      plataforma: "TIKTOK",
      handle: null,
      url: null,
      seguidoresAlAceptar: null,
      franja: null,
    })
    expect(asignacion.publicaciones).toHaveLength(1)
    expect(asignacion.publicaciones[0]).toMatchObject({
      numero: 2,
      conCaptura: false,
      cortes: [],
    })
  })
})

describe("perfilDesdeFila", () => {
  it("arma la ficha pública con sus cuentas verificadas", () => {
    const perfil = perfilDesdeFila(
      {
        id: "m1",
        nombre: "Comunidad Sincelejo",
        tipo: "PAGINA_NOTICIAS",
        municipio_codigo: "70001",
        departamento_codigo: "70",
        nivel_verificacion: 2,
        tasa_cumplimiento: "0.96",
        n_cumplimiento: 25,
        publicaciones_verificadas: 40,
        cuentas: [
          {
            plataforma: "INSTAGRAM",
            handle: "comunidadsincelejo",
            url: "https://www.instagram.com/comunidadsincelejo/",
            seguidores_verificados: 113398,
            franja_clave: "F2",
            alcance_mediano: 8000,
          },
          { plataforma: "OTRA" },
        ],
      } as unknown as FilaMedioPublico,
      UBICACION
    )
    expect(perfil).toMatchObject({
      tipo: "PAGINA_NOTICIAS",
      municipio: "Sincelejo",
      departamento: "Sucre",
      nivel: 2,
      tasaCumplimiento: 0.96,
      nCumplimiento: 25,
      publicacionesVerificadas: 40,
    })
    expect(perfil.cuentas).toEqual([
      {
        plataforma: "INSTAGRAM",
        handle: "comunidadsincelejo",
        url: "https://www.instagram.com/comunidadsincelejo/",
        seguidores: 113398,
        franja: "F2",
        alcanceMediano: 8000,
      },
    ])
  })

  it("sin historial de cumplimiento la tasa queda en null", () => {
    const perfil = perfilDesdeFila(
      {
        id: "m2",
        nombre: "Nuevo",
        tipo: null,
        municipio_codigo: null,
        departamento_codigo: null,
        nivel_verificacion: 0,
        tasa_cumplimiento: null,
        n_cumplimiento: 0,
        publicaciones_verificadas: 0,
        cuentas: null,
      } as unknown as FilaMedioPublico,
      UBICACION
    )
    expect(perfil).toMatchObject({
      tipo: null,
      municipio: null,
      tasaCumplimiento: null,
      cuentas: [],
    })
  })
})
