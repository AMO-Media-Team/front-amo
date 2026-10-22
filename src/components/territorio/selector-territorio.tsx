"use client"

import {
  type PropsSelectorSegmentacion,
  SelectorSegmentacion,
} from "./selector-segmentacion"
import {
  type PropsSelectorUbicacion,
  SelectorUbicacion,
} from "./selector-ubicacion"

export type PropsSelectorTerritorio =
  | ({ modo: "municipio" } & PropsSelectorUbicacion)
  | ({ modo: "segmentacion" } & PropsSelectorSegmentacion)

/**
 * Selector de territorio activo (DANE/DIVIPOLA), con los datos de
 * `features/territorio` cacheados en el cliente:
 *
 * - `modo="municipio"`: departamento → municipio (ubicación de un medio o un
 *   anunciante). Trae sus propias etiquetas «Departamento» y «Municipio».
 * - `modo="segmentacion"`: varios departamentos y municipios como fichas (a
 *   quién le llega una oferta). Vacío = todo el país.
 *
 * Con react-hook-form, envuélvelo en un `Controller` y pasa `id`,
 * `invalido={fieldState.invalid}` y `describedBy` con el id del error.
 */
export function SelectorTerritorio(props: PropsSelectorTerritorio) {
  if (props.modo === "segmentacion") {
    const { modo: _modo, ...resto } = props
    return <SelectorSegmentacion {...resto} />
  }
  const { modo: _modo, ...resto } = props
  return <SelectorUbicacion {...resto} />
}
