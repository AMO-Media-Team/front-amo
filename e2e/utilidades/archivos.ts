/**
 * STUB DEL LÍDER (fase 2): archivos de prueba del paquete E0, en memoria (sin
 * binarios en el repositorio), listos para `setInputFiles`.
 */
export interface ArchivoPrueba {
  name: string
  mimeType: string
  buffer: Buffer
}

export async function imagenDePrueba(_opciones: {
  ancho: number
  alto: number
  formato?: "png" | "jpeg"
  /** Para probar archivos pesados (p. ej. ~12 MB). */
  bytesMinimos?: number
}): Promise<ArchivoPrueba> {
  throw new Error("Pendiente del paquete E0.")
}

export async function videoDePrueba(_opciones: {
  ancho: number
  alto: number
  segundos?: number
}): Promise<ArchivoPrueba> {
  throw new Error("Pendiente del paquete E0.")
}
