/** Iniciales para el avatar sin foto: primera letra de las dos primeras palabras. */
export function iniciales(nombre: string): string {
  const palabras = nombre
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
  const letras = palabras
    .slice(0, 2)
    .map((palabra) => [...palabra][0] ?? "")
    .join("")
  return letras.toLocaleUpperCase("es-CO") || "?"
}
