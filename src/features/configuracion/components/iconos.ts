import {
  Activity,
  Archive,
  BadgeCheck,
  BellRing,
  Calculator,
  ChartNoAxesCombined,
  Clock,
  Files,
  Gauge,
  Gavel,
  Globe,
  Handshake,
  KeyRound,
  Landmark,
  LibraryBig,
  type LucideIcon,
  Megaphone,
  Percent,
  Radar,
  RadioTower,
  Receipt,
  Ruler,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Timer,
  UserCheck,
  Wallet,
} from "lucide-react"

import type { Seccion } from "../secciones"

/**
 * Icono de cada sección. Mapa estático (no una función que devuelva
 * componentes en render: lo prohíbe `react-hooks/static-components`).
 */
export const ICONOS_SECCION: Readonly<Record<Seccion, LucideIcon>> = {
  comercial: Handshake,
  precios: Tags,
  medios: RadioTower,
  metricas: ChartNoAxesCombined,
  calidad: Gauge,
  seguridad: ShieldCheck,
  tributario: Landmark,
  catalogos: LibraryBig,
  legal: Scale,
  plantillas: BellRing,
}

/** Agrupación de la navegación lateral (solo en escritorio). */
export const GRUPOS_NAVEGACION: readonly {
  titulo: string
  secciones: readonly Seccion[]
}[] = [
  {
    titulo: "Negocio",
    secciones: ["comercial", "precios", "medios", "metricas", "calidad"],
  },
  { titulo: "Plataforma", secciones: ["seguridad", "tributario", "catalogos"] },
  { titulo: "Comunicación", secciones: ["legal", "plantillas"] },
]

/** Icono de cada grupo de parámetros (`GRUPOS` de `parametros.ts`). */
export const ICONOS_GRUPO: Readonly<Record<string, LucideIcon>> = {
  comision: Percent,
  ofertas: Megaphone,
  disputas: Gavel,
  precios: Calculator,
  elegibilidad: UserCheck,
  reverificacion: BadgeCheck,
  actividad: Activity,
  cortes: Timer,
  integridad: Radar,
  analitica: Sparkles,
  multiplicador: Ruler,
  calculo: Gauge,
  inactividad: Clock,
  ingreso: KeyRound,
  paises: Globe,
  retencion: Archive,
  archivos: Files,
  tributario: Landmark,
  facturacion: Receipt,
  liquidaciones: Wallet,
  otros: SlidersHorizontal,
}

export const ICONO_GRUPO_POR_DEFECTO: LucideIcon = SlidersHorizontal
