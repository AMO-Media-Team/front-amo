/**
 * Franjas de seguidores (módulo puro del dominio de las cuentas sociales): en
 * qué franja queda una cuenta con unos seguidores, como la deriva la BD
 * (`fn_cuentas_sociales_franja`), y cómo se nombra un rango o un nombre del
 * catálogo dentro de una frase. Lo comparten «Mis cuentas» del medio y la
 * verificación del equipo AMO; las franjas activas se leen con
 * `franjasActivas` de `./queries`.
 */
import type { FranjaSeguidores } from "./tipos"

/**
 * Franja que contiene esos seguidores, con límites inclusivos; `null` por
 * debajo de la primera (o con un número que no lo es).
 */
export function franjaPara(
  seguidores: number,
  franjas: readonly FranjaSeguidores[]
): FranjaSeguidores | null {
  if (!Number.isFinite(seguidores)) return null
  return (
    [...franjas]
      .sort((a, b) => a.seguidoresMin - b.seguidoresMin)
      .find(
        (franja) =>
          seguidores >= franja.seguidoresMin &&
          (franja.seguidoresMax === null || seguidores <= franja.seguidoresMax)
      ) ?? null
  )
}

/**
 * Un nombre del catálogo dentro de una frase: «Más de 120.000» → «más de
 * 120.000», «Cédula (frente)» → «cédula (frente)»; las siglas que lo abren se
 * conservan («RUT de la sociedad»).
 */
export function enFrase(nombre: string): string {
  const primera = nombre.split(/\s/, 1)[0] ?? ""
  const esSigla =
    primera.length > 1 &&
    /\p{Lu}/u.test(primera) &&
    primera === primera.toLocaleUpperCase("es-CO")
  return esSigla
    ? nombre
    : nombre.charAt(0).toLocaleLowerCase("es-CO") + nombre.slice(1)
}
