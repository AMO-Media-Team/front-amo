import type { Metadata } from "next"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { RUTA_OFERTAS_MEDIO } from "@/features/marketplace/rutas"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { EsqueletoTablero } from "@/features/mis-campanas/components/esqueletos"
import { SinMedioCampanas } from "@/features/mis-campanas/components/sin-medio"
import { TableroMisCampanasMedio } from "@/features/mis-campanas/components/tablero-mis-campanas"
import { segmentoInicial } from "@/features/mis-campanas/estados"
import {
  accionesDeAsignaciones,
  misAsignaciones,
} from "@/features/mis-campanas/queries"
import { armarTablero, conteoDelTablero } from "@/features/mis-campanas/tablero"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Mis campañas" }

async function SeccionTablero({
  puedeEjecutar,
  puedeDisputar,
  puedeVerOfertas,
}: {
  puedeEjecutar: boolean
  puedeDisputar: boolean
  puedeVerOfertas: boolean
}) {
  const { asignaciones, completas } = await misAsignaciones()
  const acciones = await accionesDeAsignaciones(asignaciones)
  const ahora = new Date()
  const ahoraServidor = ahora.getTime()
  const tablero = armarTablero(asignaciones, acciones, ahora)
  return (
    <TableroMisCampanasMedio
      tablero={tablero}
      segmentoInicial={segmentoInicial(conteoDelTablero(tablero))}
      ahoraServidor={ahoraServidor}
      puedeEjecutar={puedeEjecutar}
      puedeDisputar={puedeDisputar}
      puedeVerOfertas={puedeVerOfertas}
      completas={completas}
    />
  )
}

/**
 * «Mis campañas» del medio (MED-011): lo que aceptó, repartido por estado
 * (por publicar, pendiente de métricas, en verificación, validadas,
 * terminadas, vencidas o canceladas), con lo que sigue en cada una, su plazo
 * y lo que recibe.
 */
export default async function PaginaMisCampanas() {
  const usuario = await requerirPermiso("asignaciones.ver_propias")
  const puedeVerOfertas = tieneAlgunPermiso(usuario, ["ofertas.marketplace"])

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Mis campañas"
        descripcion="Lo que aceptaste: qué sigue en cada campaña, para cuándo y cuánto recibes."
        acciones={
          puedeVerOfertas ? (
            <EnlaceBoton href={RUTA_OFERTAS_MEDIO} variant="outline">
              Ver ofertas
            </EnlaceBoton>
          ) : null
        }
      />
      {usuario.medioId ? (
        <LimiteErrorMiMedio recurso="tus campañas">
          <Suspense fallback={<EsqueletoTablero />}>
            <SeccionTablero
              puedeEjecutar={tieneAlgunPermiso(usuario, [
                "asignaciones.ejecutar",
              ])}
              puedeDisputar={tieneAlgunPermiso(usuario, ["disputas.abrir"])}
              puedeVerOfertas={puedeVerOfertas}
            />
          </Suspense>
        </LimiteErrorMiMedio>
      ) : (
        <SinMedioCampanas />
      )}
    </ContenedorPagina>
  )
}
