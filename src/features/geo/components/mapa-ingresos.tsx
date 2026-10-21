import "server-only"

import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import type { RangoFechas } from "@/lib/fechas"

import { ingresosPorUbicacion } from "../accesos-servidor"
import { EsqueletoMapaIngresos } from "./esqueleto-mapa-ingresos"
import { TarjetaMapaIngresos } from "./tarjeta-mapa-ingresos"

interface MapaIngresosProps {
  readonly rango: RangoFechas
  /** Quien ve la página (ya autorizado con `accesos.ver` por el DAL). */
  readonly usuario: UsuarioSesion
}

async function DatosMapaIngresos({ rango, usuario }: MapaIngresosProps) {
  return (
    <TarjetaMapaIngresos datos={await ingresosPorUbicacion(rango, usuario)} />
  )
}

/**
 * Ranura de mapa de la página de Accesos ("Origen de los ingresos"): carga
 * en paralelo con los rankings, con su propio esqueleto y su propio límite de
 * error (si falla, los rankings siguen en pie).
 */
export function MapaIngresos(props: MapaIngresosProps) {
  return (
    <LimiteErrorTabla recurso="el mapa de ingresos">
      <Suspense fallback={<EsqueletoMapaIngresos />}>
        <DatosMapaIngresos {...props} />
      </Suspense>
    </LimiteErrorTabla>
  )
}
