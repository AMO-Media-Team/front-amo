import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoCuentas } from "@/features/cuentas-medio/components/esqueleto-cuentas"
import { EsqueletoEncabezadoSeccion } from "@/features/mi-medio/components/esqueletos"

export default function CargandoCuentasMedio() {
  return (
    <ContenedorPagina>
      <EsqueletoEncabezadoSeccion />
      <EsqueletoCuentas />
    </ContenedorPagina>
  )
}
