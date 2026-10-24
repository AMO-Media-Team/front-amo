"use client"

/**
 * `TarjetaKpi` (componente de cliente) para las secciones de servidor de
 * facturas y cartera: un Server Component no puede pasarle el ícono (una
 * función) a un componente de cliente, así que recibe su nombre, como
 * `src/features/dashboard/components/tarjetas-kpi.tsx`.
 */
import {
  CalendarClock,
  FilePen,
  HandCoins,
  Hourglass,
  UsersRound,
  Wallet,
} from "lucide-react"
import type { ComponentProps } from "react"

import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi"

const ICONOS = {
  porFacturar: HandCoins,
  borrador: FilePen,
  saldo: Wallet,
  vencido: CalendarClock,
  antiguedad: Hourglass,
  anunciantes: UsersRound,
} as const

export type IconoKpiFacturas = keyof typeof ICONOS

export function TarjetaKpiFacturas({
  icono,
  ...props
}: Omit<ComponentProps<typeof TarjetaKpi>, "icono"> & {
  icono: IconoKpiFacturas
}) {
  return <TarjetaKpi {...props} icono={ICONOS[icono]} />
}
