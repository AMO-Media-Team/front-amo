import type { ReactNode } from "react"

import { agruparParametros } from "../parametros"
import type { Seccion } from "../secciones"
import type { Parametro } from "../tipos"
import { Bloque } from "./bloque"
import { type ContextoParametros, FilaParametro } from "./fila-parametro"
import { ICONO_GRUPO_POR_DEFECTO, ICONOS_GRUPO } from "./iconos"

/**
 * Parámetros de una sección, una tarjeta por grupo (en el orden del
 * catálogo). `soloGrupos`/`excluirGrupos` permiten intercalar tarjetas con
 * diseño propio entre los grupos genéricos.
 */
export function GruposParametros({
  parametros,
  seccion,
  contextos = {},
  soloGrupos,
  excluirGrupos = [],
  pie,
}: {
  parametros: readonly Parametro[]
  seccion: Seccion
  /** Nombres y opciones de otras tablas, solo para las claves que los usan. */
  contextos?: Readonly<Record<string, ContextoParametros>>
  soloGrupos?: readonly string[]
  excluirGrupos?: readonly string[]
  /** Contenido extra al final de un grupo (por id de grupo). */
  pie?: Readonly<Record<string, ReactNode>>
}) {
  const grupos = agruparParametros(parametros, seccion).filter(
    ({ grupo }) =>
      (!soloGrupos || soloGrupos.includes(grupo.id)) &&
      !excluirGrupos.includes(grupo.id)
  )
  return grupos.map(({ grupo, parametros: lista }) => (
    <Bloque
      key={grupo.id}
      id={`grupo-${grupo.id}`}
      titulo={grupo.titulo}
      descripcion={grupo.descripcion}
      icono={ICONOS_GRUPO[grupo.id] ?? ICONO_GRUPO_POR_DEFECTO}
    >
      <ul className="flex flex-col divide-y">
        {lista.map((parametro) => (
          <FilaParametro
            key={parametro.clave}
            parametro={parametro}
            contexto={contextos[parametro.clave]}
          />
        ))}
      </ul>
      {pie?.[grupo.id] ?? null}
    </Bloque>
  ))
}
