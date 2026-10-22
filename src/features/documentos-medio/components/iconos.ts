import {
  Building2,
  FileText,
  HeartPulse,
  IdCard,
  Landmark,
  type LucideIcon,
  ScanFace,
  Wallet,
} from "lucide-react"

import type { TipoDocumentoMedio } from "../tipos"

/** Mapa estático (no una función que devuelve componentes en el render). */
export const ICONOS_DOCUMENTO: Readonly<Record<TipoDocumentoMedio, LucideIcon>> =
  {
    CEDULA_FRENTE: IdCard,
    CEDULA_REVERSO: IdCard,
    PRUEBA_VIDA: ScanFace,
    RUT: FileText,
    RUT_SOCIEDAD: FileText,
    CAMARA_COMERCIO: Building2,
    CERT_BANCARIA: Landmark,
    CERT_BILLETERA: Wallet,
    SEG_SOCIAL: HeartPulse,
  }
