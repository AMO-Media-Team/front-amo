// Tipado mínimo de la API programática de mapshaper (el paquete no publica tipos).
declare module "mapshaper" {
  interface Mapshaper {
    /** Ejecuta comandos sobre entradas en memoria y devuelve los archivos de `-o` por nombre. */
    applyCommands(
      comandos: string,
      entradas?: Record<string, unknown>
    ): Promise<Record<string, string>>
  }
  const mapshaper: Mapshaper
  export default mapshaper
}
