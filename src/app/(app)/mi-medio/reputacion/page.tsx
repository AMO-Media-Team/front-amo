import type { Metadata } from "next"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { calidadDeCuentas } from "@/features/calidad-medio/calidad"
import { CalidadCuentas } from "@/features/calidad-medio/components/calidad-cuentas"
import { EsqueletoCalidadCuentas } from "@/features/calidad-medio/components/esqueleto-calidad"
import {
  cuentasCalidad,
  parametrosCalidad,
} from "@/features/calidad-medio/queries"
import { RUTAS_MI_MEDIO } from "@/features/mi-medio/alta"
import { EncabezadoSeccionMiMedio } from "@/features/mi-medio/components/encabezado-seccion"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { SinMedio } from "@/features/mi-medio/components/sin-medio"
import { CasosReputacion } from "@/features/reputacion/components/casos-reputacion"
import {
  EsqueletoCasosReputacion,
  EsqueletoResumenReputacion,
} from "@/features/reputacion/components/esqueletos"
import { ResumenReputacion } from "@/features/reputacion/components/resumen-reputacion"
import {
  miReputacion,
  resumenCalidadMedio,
} from "@/features/reputacion/queries"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Reputación" }

async function SeccionResumen({ medioId }: { medioId: string }) {
  const [reputacion, multiplicador] = await Promise.all([
    miReputacion(),
    resumenCalidadMedio(medioId, new Date()),
  ])
  return reputacion ? (
    <ResumenReputacion reputacion={reputacion} multiplicador={multiplicador} />
  ) : (
    <SinMedio />
  )
}

/** La misma lectura que el resumen (memorizada por solicitud). */
async function SeccionCasos({ enlazar }: { enlazar: boolean }) {
  const reputacion = await miReputacion()
  if (!reputacion) return null
  return (
    <CasosReputacion
      casos={reputacion.casos}
      nMinimo={reputacion.nMinimo}
      enlazar={enlazar}
    />
  )
}

/** El multiplicador de cada cuenta y su explicación (PRC-003, PRC-004). */
async function SeccionCalidad({ medioId }: { medioId: string }) {
  const [cuentas, parametros] = await Promise.all([
    cuentasCalidad(medioId),
    parametrosCalidad(),
  ])
  return (
    <CalidadCuentas
      calidades={calidadDeCuentas(cuentas, parametros)}
      parametros={parametros}
      ahora={new Date()}
      enlaceCuentas={RUTAS_MI_MEDIO.cuentas}
    />
  )
}

/**
 * «Mi medio › Reputación» (MED-016), móvil primero: la tasa de cumplimiento a
 * hoy en la ventana de 180 días —o «Sin historial suficiente» mientras no
 * reúna el mínimo de negocios—, las publicaciones realizadas, el multiplicador
 * de calidad vigente con su explicación y los negocios que forman la tasa.
 * `mi_reputacion()` exige además `inicio.medio`. Cada bloque carga y falla por
 * su cuenta. En escritorio, los negocios a la izquierda y la calidad a la
 * derecha (el orden del documento es el mismo que se lee en el celular).
 */
export default async function PaginaReputacionMedio() {
  const usuario = await requerirPermiso("medios.editar_propio")
  await requerirPermiso("inicio.medio")
  const { medioId } = usuario
  const enlazarCampanas = tieneAlgunPermiso(usuario, [
    "asignaciones.ver_propias",
  ])

  return (
    <ContenedorPagina>
      <EncabezadoSeccionMiMedio
        titulo="Reputación"
        descripcion="Cuánto cumples, cuánto has publicado y el multiplicador que ajusta tu pago: lo que habla de tu medio ante los anunciantes."
      />
      {medioId ? (
        <>
          <LimiteErrorMiMedio recurso="tu reputación">
            <Suspense fallback={<EsqueletoResumenReputacion />}>
              <SeccionResumen medioId={medioId} />
            </Suspense>
          </LimiteErrorMiMedio>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
            <LimiteErrorMiMedio recurso="tus negocios de la ventana">
              <Suspense fallback={<EsqueletoCasosReputacion />}>
                <SeccionCasos enlazar={enlazarCampanas} />
              </Suspense>
            </LimiteErrorMiMedio>
            {/* Su propio límite: si falla la calidad, la reputación sigue. */}
            <div className="@container/bloque flex min-w-0 flex-col">
              <LimiteErrorMiMedio recurso="la calidad de tus cuentas">
                <Suspense fallback={<EsqueletoCalidadCuentas />}>
                  <SeccionCalidad medioId={medioId} />
                </Suspense>
              </LimiteErrorMiMedio>
            </div>
          </div>
        </>
      ) : (
        <SinMedio />
      )}
    </ContenedorPagina>
  )
}
