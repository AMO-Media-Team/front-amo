import {
  Building2,
  FilePlus2,
  FileText,
  Landmark,
  type LucideIcon,
} from "lucide-react"

import type { TipoDocumentoAnunciante } from "../catalogo"

/** Mapa estático (no una función que devuelve componentes en el render). */
export const ICONOS_DOCUMENTO_ANUNCIANTE: Readonly<
  Record<TipoDocumentoAnunciante, LucideIcon>
> = {
  RUT: FileText,
  CAMARA_COMERCIO: Building2,
  CERT_BANCARIA: Landmark,
  OTRO: FilePlus2,
}
