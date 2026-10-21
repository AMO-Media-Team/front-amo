import { EsqueletoListado } from "@/features/operacion/components/esqueletos"

/** Carga del listado de medios: encabezado, seis indicadores y la tabla. */
export default function CargandoMedios() {
  return (
    <EsqueletoListado
      etiqueta="Cargando los medios…"
      indicadores={6}
      columnas={7}
      filtros={5}
    />
  )
}
