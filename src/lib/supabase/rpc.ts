/**
 * Argumentos de RPC con nulos. Los tipos generados declaran cada argumento de
 * una función de Postgres como obligatorio y no nulo, aunque Postgres acepta
 * `null` en cualquiera (los `*_srv` lo usan para "sin dato": IP, país…). Este
 * es el único punto donde se relaja ese tipo.
 */
import type { Database } from "@/types/database.types"

type Funciones = Database["public"]["Functions"]

export type NombreRpc = keyof Funciones

export type ArgumentosRpc<N extends NombreRpc> = Funciones[N]["Args"]

type ConNulos<T> = { [K in keyof T]: T[K] | null }

export function argumentosRpc<N extends NombreRpc>(
  argumentos: ConNulos<ArgumentosRpc<N>>
): ArgumentosRpc<N> {
  return argumentos as ArgumentosRpc<N>
}
