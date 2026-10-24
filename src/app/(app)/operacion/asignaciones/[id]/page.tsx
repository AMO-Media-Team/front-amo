import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import {
  AccionesAsignacion,
  type AsignacionGestionable,
} from "@/features/operacion/components/acciones-asignacion"
import { UUID } from "@/features/operacion/components/ficha"
import {
  CabeceraAsignacion,
  CuerpoAsignacion,
  type ValidacionFicha,
} from "@/features/operacion/components/ficha-asignacion"
import { ProgresoAsignacion } from "@/features/operacion/components/linea-tiempo-asignacion"
import { opcionesGestion } from "@/features/operacion/gestion-asignacion"
import { obtenerAsignacion } from "@/features/operacion/queries/asignaciones"
import { verificarEnFicha } from "@/features/validacion/components/verificar-en-ficha"
import { validacionEnFicha } from "@/features/validacion/decision"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/operacion/asignaciones/[id]">): Promise<Metadata> {
  const usuario = await requerirPermiso("asignaciones.ver")
  const { id } = await params
  const asignacion = UUID.test(id)
    ? await obtenerAsignacion(id, tieneAlgunPermiso(usuario, ["auditoria.ver"]))
    : null
  return {
    title: asignacion
      ? `${asignacion.medio.nombre ?? "Asignación"} · ${asignacion.oferta.titulo ?? "oferta"}`
      : "Asignación",
  }
}

/**
 * Ficha de una asignación: avance por la máquina de estados, evidencia y
 * métricas por corte (con sus alertas de integridad), línea de tiempo (con
 * actor y motivo si el rol ve la bitácora), precio congelado, ejecución,
 * disputas y liquidación. Con los permisos de validación, aprueba o rechaza
 * la evidencia y los cortes desde la ficha (ADM-007/008; en disputa, lo que
 * espera a resolverla se explica y enlaza a ella); con los de gestión, el
 * equipo AMO la cancela con causa (y, por fraude o incumplimiento, suspende
 * al medio) o abre una disputa con las reglas de `@/features/disputas`
 * (ADM-010, ADM-011): arriba desde `sm`, en el pie fijo en el celular. La BD
 * vuelve a comprobarlo todo.
 */
export default async function PaginaAsignacion({
  params,
}: PageProps<"/operacion/asignaciones/[id]">) {
  const usuario = await requerirPermiso("asignaciones.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const asignacion = await obtenerAsignacion(
    id,
    tieneAlgunPermiso(usuario, ["auditoria.ver"])
  )
  if (!asignacion) notFound()

  const enlaces = {
    medio: tieneAlgunPermiso(usuario, ["medios.ver"]),
    campana: tieneAlgunPermiso(usuario, ["campanas.ver"]),
    anunciante: tieneAlgunPermiso(usuario, ["anunciantes.ver"]),
    disputas: tieneAlgunPermiso(usuario, ["disputas.ver"]),
  }
  const gestion = opcionesGestion(
    {
      estado: asignacion.estado,
      medioEstado: asignacion.medio.estado,
      disputas: asignacion.disputas,
    },
    usuario.permisos
  )
  const gestionable: AsignacionGestionable = {
    id: asignacion.id,
    titulo: asignacion.oferta.titulo ?? "Asignación",
    estado: asignacion.estado,
    medio: {
      id: asignacion.medio.id,
      nombre: asignacion.medio.nombre ?? "el medio",
    },
  }
  // «Verificar» (ADM-009): en la cabecera y, en el celular, en el pie fijo.
  // Fuera de «Métricas cargadas» o sin permiso no llega nada: el pie no se
  // pinta vacío.
  const verificar = verificarEnFicha({
    asignacionId: asignacion.id,
    estado: asignacion.estado,
    publicaciones: asignacion.publicaciones,
    cortesRequeridos: asignacion.cortesRequeridos,
    puedeVerificar: tieneAlgunPermiso(usuario, ["metricas.validar"]),
    puedeConstanciaManual: tieneAlgunPermiso(usuario, [
      "metricas.editar_validadas",
    ]),
  })
  // Las decisiones de la validación sobre cada publicación y cada corte
  // (`evidencias-asignacion.tsx`), con lo que espera a una disputa abierta;
  // sin permiso de validar ni de corregir, solo se consulta.
  const validacion: ValidacionFicha = tieneAlgunPermiso(usuario, [
    "evidencias.validar",
    "metricas.validar",
    "metricas.editar_validadas",
  ])
    ? validacionEnFicha(usuario.permisos, asignacion)
    : undefined

  return (
    <ContenedorPagina>
      <CabeceraAsignacion
        asignacion={asignacion}
        enlaces={enlaces}
        verificar={verificar}
        acciones={
          <AccionesAsignacion
            key={asignacion.id}
            asignacion={gestionable}
            gestion={gestion}
            disposicion="cabecera"
            enlaces={enlaces}
          />
        }
      />
      <ProgresoAsignacion progreso={asignacion.progreso} />
      <CuerpoAsignacion
        asignacion={asignacion}
        verDisputas={enlaces.disputas}
        validacion={validacion}
        finanzas={{
          liquidaciones: tieneAlgunPermiso(usuario, ["liquidaciones.ver"]),
          facturas: tieneAlgunPermiso(usuario, ["facturas.ver"]),
        }}
      />
      <AccionesAsignacion
        key={asignacion.id}
        asignacion={gestionable}
        gestion={gestion}
        disposicion="pie"
        verificar={verificar}
        enlaces={enlaces}
      />
    </ContenedorPagina>
  )
}
