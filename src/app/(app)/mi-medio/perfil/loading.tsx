import {
  EsqueletoFormulario,
  EsqueletoPaginaMiMedio,
} from "@/features/mi-medio/components/esqueletos"

export default function CargandoPerfilMedio() {
  return (
    <EsqueletoPaginaMiMedio estrecha>
      <EsqueletoFormulario secciones={3} etiqueta="Cargando tu perfil…" />
    </EsqueletoPaginaMiMedio>
  )
}
