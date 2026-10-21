import { EsqueletoListado } from "@/features/operacion/components/esqueletos"

/** Carga del listado de anunciantes: encabezado, cinco indicadores y la tabla. */
export default function CargandoAnunciantes() {
  return (
    <EsqueletoListado
      etiqueta="Cargando los anunciantes…"
      indicadores={5}
      columnas={7}
      filtros={3}
    />
  )
}
