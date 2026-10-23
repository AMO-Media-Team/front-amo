import {
  ArrowRight,
  BadgeCheck,
  CircleUserRound,
  FilterX,
  type LucideIcon,
  ShieldAlert,
  Store,
  Users,
} from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { RUTAS_MI_MEDIO } from "@/features/mi-medio/alta"
import { RUTA_MIS_CAMPANAS } from "@/features/mis-campanas/rutas"

import {
  type FiltrosMarketplace,
  hayFiltros,
  rutaMarketplace,
  soloPlataforma,
} from "../filtros"
import { ELEGIBILIDAD } from "../presentacion"
import type { Elegibilidad, MotivoElegibilidad } from "../tipos"
import { EnlaceVerTodas } from "./filtros-marketplace"

const ICONOS: Readonly<Record<Exclude<MotivoElegibilidad, "OK">, LucideIcon>> =
  {
    SIN_MEDIO: CircleUserRound,
    MEDIO_PENDIENTE: BadgeCheck,
    MEDIO_RECHAZADO: ShieldAlert,
    MEDIO_SUSPENDIDO: ShieldAlert,
    NIVEL_0: BadgeCheck,
    SIN_CUENTA_VIGENTE: Users,
    BAJO_UMBRAL: Users,
  }

/**
 * El medio aún no puede ver ofertas (MED-008 c2): el motivo que da la BD y
 * el enlace para resolverlo (Mi medio, Cuentas o Nivel).
 */
export function SinElegibilidad({
  elegibilidad,
}: {
  elegibilidad: Elegibilidad & { motivo: Exclude<MotivoElegibilidad, "OK"> }
}) {
  const presentacion = ELEGIBILIDAD[elegibilidad.motivo]
  return (
    <EstadoVacio
      icono={ICONOS[elegibilidad.motivo]}
      titulo={presentacion.titulo}
      descripcion={elegibilidad.detalle ?? presentacion.detalle}
    >
      <EnlaceBoton href={presentacion.accion.href} size="lg">
        {presentacion.accion.texto}
        <ArrowRight data-icon="inline-end" aria-hidden />
      </EnlaceBoton>
    </EstadoVacio>
  )
}

/**
 * Sin ofertas que mostrar: por los filtros (plataforma, sector, anunciante,
 * días de publicación o «Ver las que rechacé»), por la página o porque hoy no
 * hay. Con filtros, el enlace los quita todos, conserva el orden y deja el
 * foco en los filtros (U7).
 */
export function SinOfertas({ filtros }: { filtros: FiltrosMarketplace }) {
  if (hayFiltros(filtros)) {
    const plataforma = soloPlataforma(filtros)
    return (
      <EstadoVacio
        icono={FilterX}
        titulo={
          plataforma
            ? "No hay ofertas de esta plataforma para ti"
            : "No hay ofertas con estos filtros"
        }
        descripcion={
          plataforma
            ? "Prueba con otra plataforma o vuelve a ver todas las ofertas disponibles."
            : "Prueba con menos filtros u otros días de publicación, o vuelve a ver todas las ofertas disponibles."
        }
      >
        <EnlaceVerTodas href={rutaMarketplace({ orden: filtros.orden })}>
          Ver todas las ofertas
        </EnlaceVerTodas>
      </EstadoVacio>
    )
  }
  if (filtros.pagina > 1) {
    return (
      <EstadoVacio
        icono={Store}
        titulo="No hay más ofertas en esta página"
        descripcion="Puede que alguna se haya llenado o cerrado mientras navegabas."
      >
        <EnlaceBoton
          href={rutaMarketplace({ ...filtros, pagina: 1 })}
          variant="outline"
          size="lg"
        >
          Ir a la primera página
        </EnlaceBoton>
      </EstadoVacio>
    )
  }
  return (
    <EstadoVacio
      icono={Store}
      titulo="Hoy no hay ofertas para ti"
      descripcion="Aquí aparecen las ofertas dirigidas a tu zona, tus categorías y la franja de seguidores de tus cuentas, mientras tengan cupos. Vuelve a mirar más tarde."
    >
      <EnlaceBoton href={RUTA_MIS_CAMPANAS} variant="outline" size="lg">
        Ir a Mis campañas
      </EnlaceBoton>
      <EnlaceBoton href={RUTAS_MI_MEDIO.cuentas} variant="ghost" size="lg">
        Revisar mis cuentas
      </EnlaceBoton>
    </EstadoVacio>
  )
}
