import { RadioTower } from "lucide-react"
import type { Metadata } from "next"
import { Suspense } from "react"

import { EsqueletoTarjetaGrafico } from "@/components/charts/esqueleto-grafico"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { GraficoGanancias } from "@/features/dashboard/medio/components/grafico-ganancias"
import {
  serieGanancias,
  ventanaGanancias,
} from "@/features/dashboard/medio/datos"
import { serieGananciasMedio } from "@/features/dashboard/medio/queries"
import {
  EsqueletoBloque,
  EsqueletoPagos,
  EsqueletoResumenGanancias,
} from "@/features/ganancias/components/esqueletos"
import { ListaPagos } from "@/features/ganancias/components/lista-pagos"
import { ResumenGanancias } from "@/features/ganancias/components/resumen-ganancias"
import {
  AvisoSeguridadSocial,
  CondicionTributariaMedio,
  PorLiquidar,
} from "@/features/ganancias/components/secciones-ganancias"
import {
  asignacionesPorLiquidar,
  condicionTributaria,
  misLiquidaciones,
  resumenGanancias,
} from "@/features/ganancias/queries"
import { ID_POR_LIQUIDAR } from "@/features/ganancias/rutas"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { hoyBogota } from "@/features/mi-medio/queries"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Ganancias" }

/** Lo que el rol puede abrir desde la página (cada destino vuelve a autorizar). */
interface Enlaces {
  /** «Mi medio» (documentos y pago): `medios.editar_propio`. */
  miMedio: boolean
  /** La campaña de cada publicación: `asignaciones.ver_propias`. */
  campanas: boolean
}

async function SeccionResumen({ enlaces }: { enlaces: Enlaces }) {
  const resumen = await resumenGanancias()
  return (
    <div className="flex flex-col gap-4">
      {resumen.segSocialPendiente ? (
        <AvisoSeguridadSocial
          bloquea={resumen.segSocialBloquea}
          enlaceDocumentos={enlaces.miMedio}
        />
      ) : null}
      <ResumenGanancias resumen={resumen} />
    </div>
  )
}

async function SeccionPagos() {
  const inicial = await misLiquidaciones()
  return <ListaPagos inicial={inicial} hoy={hoyBogota()} />
}

/**
 * Lo ganado por semana o por mes: las últimas 12 semanas y los últimos 12
 * meses hasta hoy (las dos series llegan juntas: cambiar es inmediato).
 */
async function SeccionGrafico() {
  const hoy = hoyBogota()
  const semanas = ventanaGanancias(hoy, hoy, "semana")
  const meses = ventanaGanancias(hoy, hoy, "mes")
  const [porSemana, porMes] = await Promise.all([
    serieGananciasMedio(semanas.desde, semanas.hasta, "semana"),
    serieGananciasMedio(meses.desde, meses.hasta, "mes"),
  ])
  return (
    <GraficoGanancias
      series={{
        semana: serieGanancias(porSemana, "semana"),
        mes: serieGanancias(porMes, "mes"),
      }}
      porDefecto="mes"
    />
  )
}

async function SeccionPorLiquidar({ enlaces }: { enlaces: Enlaces }) {
  const [resumen, asignaciones] = await Promise.all([
    resumenGanancias(),
    asignacionesPorLiquidar(),
  ])
  return (
    <PorLiquidar
      asignaciones={asignaciones}
      total={Math.max(resumen.asignacionesPorLiquidar, asignaciones.length)}
      valorTotal={resumen.porLiquidar}
      enlazarCampanas={enlaces.campanas}
    />
  )
}

async function SeccionCondicion({
  medioId,
  enlaces,
}: {
  medioId: string
  enlaces: Enlaces
}) {
  const condicion = await condicionTributaria(medioId)
  return (
    <CondicionTributariaMedio
      condicion={condicion}
      enlacePago={enlaces.miMedio}
    />
  )
}

function SinMedioGanancias() {
  return (
    <EstadoVacio
      icono={RadioTower}
      titulo="Tu cuenta aún no está vinculada a un medio"
      descripcion="Cuando el equipo AMO la asocie a tu medio, aquí verás lo que ganas, lo que está por pagarte y tus pagos."
      className="flex-none py-16"
    />
  )
}

/**
 * Ganancias del medio (MED-015), móvil primero: el resumen (lo ganado este
 * mes, lo por liquidar como estimado antes de retenciones, lo por pagar, lo
 * pagado y las retenciones), sus pagos con su estado, fecha y soportes, lo
 * ganado por semana o mes, lo verificado por liquidar y su condición
 * tributaria. Cada bloque carga y falla por su cuenta.
 */
export default async function PaginaGanancias() {
  const usuario = await requerirPermiso("liquidaciones.ver_propias")
  const enlaces: Enlaces = {
    miMedio: tieneAlgunPermiso(usuario, ["medios.editar_propio"]),
    campanas: tieneAlgunPermiso(usuario, ["asignaciones.ver_propias"]),
  }

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Ganancias"
        descripcion="Lo que ganaste, lo que está por pagarte y tus pagos con sus soportes."
      />
      {usuario.medioId ? (
        <>
          <LimiteErrorMiMedio recurso="el resumen de tus ganancias">
            <Suspense fallback={<EsqueletoResumenGanancias />}>
              <SeccionResumen enlaces={enlaces} />
            </Suspense>
          </LimiteErrorMiMedio>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
            <div className="flex min-w-0 flex-col gap-6">
              <section
                aria-labelledby="titulo-pagos"
                className="flex flex-col gap-3"
              >
                <div className="flex flex-col gap-0.5">
                  <h2 id="titulo-pagos" className="text-lg font-semibold">
                    Tus pagos
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Cada liquidación con su estado, el neto y sus soportes.
                  </p>
                </div>
                <LimiteErrorMiMedio recurso="tus pagos">
                  <Suspense fallback={<EsqueletoPagos />}>
                    <SeccionPagos />
                  </Suspense>
                </LimiteErrorMiMedio>
              </section>
              {/* El gráfico acomoda sus controles al ancho de su celda
                  (`@…/bloque`), como en el inicio del medio. */}
              <div className="@container/bloque flex min-w-0 flex-col">
                <LimiteErrorMiMedio recurso="tu historial de ganancias">
                  <Suspense
                    fallback={<EsqueletoTarjetaGrafico alto="min-h-64" />}
                  >
                    <SeccionGrafico />
                  </Suspense>
                </LimiteErrorMiMedio>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              {/* Ancla fuera del Suspense: existe desde el primer pintado,
                  para «Ver lo que tengo por liquidar» de una anulada. */}
              <div
                id={ID_POR_LIQUIDAR}
                className="flex min-w-0 scroll-mt-20 flex-col"
              >
                <LimiteErrorMiMedio recurso="lo que tienes por liquidar">
                  <Suspense fallback={<EsqueletoBloque filas={3} />}>
                    <SeccionPorLiquidar enlaces={enlaces} />
                  </Suspense>
                </LimiteErrorMiMedio>
              </div>
              <LimiteErrorMiMedio recurso="tu condición tributaria">
                <Suspense fallback={<EsqueletoBloque filas={3} />}>
                  <SeccionCondicion
                    medioId={usuario.medioId}
                    enlaces={enlaces}
                  />
                </Suspense>
              </LimiteErrorMiMedio>
            </div>
          </div>
        </>
      ) : (
        <SinMedioGanancias />
      )}
    </ContenedorPagina>
  )
}
