import {
  EsqueletoFormulario,
  EsqueletoPaginaMiMedio,
} from "@/features/mi-medio/components/esqueletos"

export default function CargandoPagoMedio() {
  return (
    <EsqueletoPaginaMiMedio estrecha>
      <EsqueletoFormulario
        secciones={3}
        etiqueta="Cargando tus datos de pago…"
      />
    </EsqueletoPaginaMiMedio>
  )
}
