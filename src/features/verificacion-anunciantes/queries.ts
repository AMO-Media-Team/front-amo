import "server-only"

/**
 * Consultas de la verificación de anunciantes (ADM-003). Todo se lee con el
 * cliente del USUARIO (JWT + RLS): `documentos_anunciante` solo lo ve quien
 * tiene `anunciantes.verificar`. Las rutas de Storage se leen aquí solo para
 * deducir el MIME y nunca salen hacia el navegador. Un error de lectura se
 * lanza y lo recoge el límite de error de la sección.
 */
import { cache } from "react"

import { formatearNit } from "@/features/operacion/formato"
import {
  clienteSolicitud,
  fallar,
  leerTodo,
  nombreMunicipio,
  nombrePais,
} from "@/features/operacion/queries/comun"
import type { AnuncianteDetalle } from "@/features/operacion/tipos"
import { paginaAcotada, TAMANO_PAGINA } from "@/features/verificacion/colas"
import { serializarFecha } from "@/lib/fechas"

import { type EntradaCola, ordenarCola } from "./cola"
import { COLUMNAS_DOCUMENTO, documentoExpediente } from "./filas"
import { requisitosAnunciante, resumirRequisitos } from "./requisitos"
import type {
  AnuncianteEnCola,
  ColaAnunciantes,
  ExpedienteAnunciante,
} from "./tipos"

/** Día de calendario de Bogotá con que se evalúan las vigencias. */
function hoyBogota(): string {
  return serializarFecha(new Date())
}

// ── Cola ─────────────────────────────────────────────────────────────────────

/**
 * Empresas en la cola, en orden de atención. Una lectura por solicitud: la
 * comparten el contador de la navegación y la cola.
 */
const entradasCola = cache(async (): Promise<EntradaCola[]> => {
  const supabase = await clienteSolicitud()
  const [enviadas, documentos] = await Promise.all([
    leerTodo("leer las empresas enviadas a verificación", (desde, hasta) =>
      supabase
        .from("anunciantes")
        .select("id, enviado_verificacion_at")
        .eq("estado_verificacion", "PENDIENTE")
        .not("enviado_verificacion_at", "is", null)
        .is("deleted_at", null)
        .order("enviado_verificacion_at")
        .order("id")
        .range(desde, hasta)
    ),
    leerTodo("leer los documentos de anunciantes por revisar", (desde, hasta) =>
      supabase
        .from("documentos_anunciante")
        .select(
          "anunciante_id, created_at, anunciante:anunciantes!inner ( id )"
        )
        .eq("estado_validacion", "PENDIENTE")
        .is("anunciante.deleted_at", null)
        .order("created_at")
        .order("id")
        .range(desde, hasta)
    ),
  ])
  return ordenarCola(
    enviadas.map((fila) => ({
      id: fila.id,
      enviadoAt: fila.enviado_verificacion_at as string,
    })),
    documentos.map((fila) => ({
      anuncianteId: fila.anunciante_id,
      subidoAt: fila.created_at,
    }))
  )
})

/** Empresas que esperan al equipo AMO (contador de la navegación de colas). */
export async function contarColaAnunciantes(): Promise<number> {
  return (await entradasCola()).length
}

/** Una página de la cola con lo que cada tarjeta muestra. */
export async function colaAnunciantes(
  pagina: number
): Promise<ColaAnunciantes> {
  const entradas = await entradasCola()
  const actual = paginaAcotada(pagina, entradas.length)
  const inicio = (actual - 1) * TAMANO_PAGINA
  const tramo = entradas.slice(inicio, inicio + TAMANO_PAGINA)
  if (tramo.length === 0) return { filas: [], total: 0, pagina: 1 }

  const ids = tramo.map((entrada) => entrada.anuncianteId)
  const supabase = await clienteSolicitud()
  const [empresas, documentos] = await Promise.all([
    supabase
      .from("anunciantes")
      .select(
        "id, nombre_comercial, razon_social, nit, digito_verificacion, identificacion_extranjera, pais_iso2, municipio_codigo, ciudad_extranjera, estado_verificacion, rechazado_at, identificacion_cambiada_at"
      )
      .in("id", ids),
    leerTodo("leer los documentos de la cola de anunciantes", (desde, hasta) =>
      supabase
        .from("documentos_anunciante")
        .select(
          "id, anunciante_id, tipo, estado_validacion, fecha_vencimiento, validado_at, created_at"
        )
        .in("anunciante_id", ids)
        .order("id")
        .range(desde, hasta)
    ),
  ])
  if (empresas.error) fallar("leer la cola de anunciantes", empresas.error)

  const porEmpresa = new Map(empresas.data.map((fila) => [fila.id, fila]))
  const hoy = hoyBogota()
  const filas = tramo.flatMap((entrada): AnuncianteEnCola[] => {
    const empresa = porEmpresa.get(entrada.anuncianteId)
    // Otra persona la decidió o la archivó entre las dos lecturas.
    if (!empresa) return []
    const propios = documentos
      .filter((fila) => fila.anunciante_id === empresa.id)
      .map((fila) => ({
        id: fila.id,
        tipo: fila.tipo,
        estado: fila.estado_validacion,
        venceAt: fila.fecha_vencimiento,
        subidoAt: fila.created_at,
        validadoAt: fila.validado_at,
      }))
    const resumen = resumirRequisitos(
      requisitosAnunciante(
        empresa.pais_iso2,
        propios,
        hoy,
        empresa.identificacion_cambiada_at
      )
    )
    return [
      {
        id: empresa.id,
        nombreComercial: empresa.nombre_comercial,
        razonSocial: empresa.razon_social,
        identificacion:
          formatearNit(empresa.nit, empresa.digito_verificacion) ??
          empresa.identificacion_extranjera,
        tipoIdentificacion: empresa.nit ? "NIT" : "Identificación tributaria",
        paisIso2: empresa.pais_iso2,
        pais: nombrePais(empresa.pais_iso2) ?? empresa.pais_iso2,
        ciudad:
          nombreMunicipio(empresa.municipio_codigo) ??
          empresa.ciudad_extranjera,
        estado: empresa.estado_verificacion,
        desde: entrada.desde,
        enviadoAt: entrada.enviadoAt,
        reenvio: entrada.enviadoAt !== null && empresa.rechazado_at !== null,
        documentosPorRevisar: entrada.documentosPorRevisar,
        faltan: resumen.faltan,
        listos: resumen.listos,
      },
    ]
  })
  return { filas, total: entradas.length, pagina: actual }
}

// ── Expediente (pestaña «Verificación» de la ficha) ──────────────────────────

/**
 * Lo que necesita quien verifica la empresa: sus datos clave (los de la ficha,
 * ya leídos), su envío a verificación, el último cambio de su identificación y
 * todos sus documentos, del más reciente al más antiguo.
 */
export async function expedienteAnunciante(
  anunciante: AnuncianteDetalle
): Promise<ExpedienteAnunciante> {
  const supabase = await clienteSolicitud()
  const [envio, documentos] = await Promise.all([
    supabase
      .from("anunciantes")
      .select("enviado_verificacion_at, identificacion_cambiada_at")
      .eq("id", anunciante.id)
      .maybeSingle(),
    supabase
      .from("documentos_anunciante")
      .select(COLUMNAS_DOCUMENTO)
      .eq("anunciante_id", anunciante.id)
      .order("created_at", { ascending: false })
      .order("id"),
  ])
  if (envio.error) fallar("leer el envío a verificación", envio.error)
  if (documentos.error)
    fallar("leer los documentos del anunciante", documentos.error)

  return {
    anunciante: {
      id: anunciante.id,
      nombreComercial: anunciante.nombreComercial,
      razonSocial: anunciante.razonSocial,
      identificacion: anunciante.identificacion,
      tipoIdentificacion: anunciante.tipoIdentificacion,
      paisIso2: anunciante.paisIso2,
      pais: anunciante.pais,
      ciudad: anunciante.ciudad,
      sector: anunciante.sector,
      estado: anunciante.estado,
      motivoEstado: anunciante.motivoEstado,
      // Un envío anterior a un rechazo o a la verificación ya no cuenta.
      enviadoAt:
        anunciante.estado === "PENDIENTE"
          ? (envio.data?.enviado_verificacion_at ?? null)
          : null,
      verificadoAt: anunciante.verificadoAt,
      verificadoPor: anunciante.verificadoPor,
      identificacionCambiadaAt: envio.data?.identificacion_cambiada_at ?? null,
    },
    documentos: documentos.data.map(documentoExpediente),
    hoy: hoyBogota(),
  }
}
