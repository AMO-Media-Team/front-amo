import { EsqueletoListado } from "@/features/operacion/components/esqueletos"

/** Carga del listado de campañas: encabezado, cinco indicadores y la tabla. */
export default function CargandoCampanas() {
  return (
    <EsqueletoListado
      etiqueta="Cargando las campañas…"
      indicadores={5}
      columnas={7}
      filtros={3}
    />
  )
}
