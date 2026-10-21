import {
  Banknote,
  Bell,
  Building2,
  Camera,
  ChartColumn,
  ChartLine,
  Crown,
  EyeOff,
  FileChartColumn,
  Fingerprint,
  Handshake,
  House,
  type LucideIcon,
  Megaphone,
  RadioTower,
  Receipt,
  Scale,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  UserRound,
  Users,
  Wallet,
} from "lucide-react"

import type { TipoRol } from "../tipos"

/**
 * Iconos estáticos (mapas y no funciones que devuelven componentes: el lint
 * de React prohíbe crear componentes durante el render).
 */
export const ICONOS_MODULO: Readonly<Record<string, LucideIcon>> = {
  inicio: House,
  analitica: ChartColumn,
  reportes: FileChartColumn,
  notificaciones: Bell,
  cuenta: UserRound,
  usuarios: Users,
  roles: ShieldCheck,
  auditoria: ScrollText,
  accesos: Fingerprint,
  configuracion: SlidersHorizontal,
  datos_sensibles: EyeOff,
  medios: RadioTower,
  anunciantes: Building2,
  campanas: Megaphone,
  ofertas: Tag,
  asignaciones: Handshake,
  evidencias: Camera,
  metricas: ChartLine,
  disputas: Scale,
  liquidaciones: Wallet,
  facturas: Receipt,
  pagos: Banknote,
}

export const ICONO_MODULO_GENERICO: LucideIcon = ShieldCheck

export const ICONOS_TIPO: Readonly<Record<TipoRol, LucideIcon>> = {
  ADMIN: ShieldCheck,
  ANUNCIANTE: Building2,
  MEDIO: RadioTower,
}

export const ICONO_SUPERADMIN: LucideIcon = Crown
