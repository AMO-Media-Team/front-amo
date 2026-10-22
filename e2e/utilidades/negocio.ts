/**
 * STUB DEL LÍDER (fase 2): fábricas del paquete E0 (API de servicio y
 * transiciones con actor y sesión reales; nunca en producción).
 */
export type PlataformaE2E = "INSTAGRAM" | "FACEBOOK" | "TIKTOK"

export interface CampanaE2E {
  id: string
  nombre: string
}

export interface OfertaE2E {
  id: string
  titulo: string
  campanaId: string
}

export async function crearCampanaE2E(
  _opciones: { estado?: "BORRADOR" | "ACTIVA"; presupuesto?: number } = {}
): Promise<CampanaE2E> {
  throw new Error("Pendiente del paquete E0.")
}

export async function crearOfertaE2E(_opciones: {
  campanaId: string
  formato?: { plataforma: PlataformaE2E; clave: string }
  estado: "BORRADOR" | "EN_REVISION" | "PUBLICADA"
  fechaLimite?: Date
}): Promise<OfertaE2E> {
  throw new Error("Pendiente del paquete E0.")
}
