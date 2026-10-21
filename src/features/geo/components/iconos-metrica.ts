import {
  BadgeCheck,
  Building2,
  CircleDollarSign,
  Handshake,
  LogIn,
  type LucideIcon,
  Megaphone,
  Radar,
  RadioTower,
  UsersRound,
} from "lucide-react"

import type { MetricaGeo } from "../metricas"

/** Mapa estático (no una función que devuelva componentes: regla de React Compiler). */
export const ICONOS_METRICA: Readonly<Record<MetricaGeo, LucideIcon>> = {
  medios: RadioTower,
  gmv: CircleDollarSign,
  alcance: Radar,
  cumplimiento: BadgeCheck,
  campanas: Megaphone,
  asignaciones: Handshake,
  anunciantes: Building2,
  accesos: LogIn,
  audiencia: UsersRound,
}
