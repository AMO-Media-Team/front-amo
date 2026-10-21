/**
 * Íconos de los reportes y de sus indicadores. Mapas estáticos: los datos
 * viajan del servidor con una clave y el componente resuelve el ícono (los
 * componentes no se serializan ni se crean durante el render).
 */
import {
  Banknote,
  BanknoteArrowUp,
  Building,
  ChartNoAxesCombined,
  CircleX,
  ClipboardCheck,
  Eye,
  HandCoins,
  Handshake,
  Hourglass,
  Landmark,
  LogIn,
  type LucideIcon,
  MapPinned,
  Megaphone,
  Percent,
  PiggyBank,
  RadioTower,
  ReceiptText,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react"

import type { IconoReporte } from "../catalogo"
import type { IconoIndicador } from "../indicadores"

export const ICONOS_REPORTE: Readonly<Record<IconoReporte, LucideIcon>> = {
  resumen: ChartNoAxesCombined,
  campanas: Megaphone,
  finanzas: Landmark,
  cartera: Wallet,
  cobertura: MapPinned,
  cumplimiento: ClipboardCheck,
  accesos: ShieldCheck,
}

export const ICONOS_INDICADOR: Readonly<Record<IconoIndicador, LucideIcon>> = {
  dinero: Banknote,
  comision: HandCoins,
  porcentaje: Percent,
  negocios: Handshake,
  alcance: Eye,
  medios: RadioTower,
  campanas: Megaphone,
  anunciantes: Building,
  usuarios: Users,
  ingresos: LogIn,
  fallos: CircleX,
  alerta: TriangleAlert,
  escudo: ShieldCheck,
  mapa: MapPinned,
  factura: ReceiptText,
  recaudo: PiggyBank,
  reloj: Hourglass,
  pago: BanknoteArrowUp,
}
