import { EsqueletoCalidadCuentas } from "@/features/calidad-medio/components/esqueleto-calidad"
import { EsqueletoPaginaMiMedio } from "@/features/mi-medio/components/esqueletos"
import {
  EsqueletoCasosReputacion,
  EsqueletoResumenReputacion,
} from "@/features/reputacion/components/esqueletos"

export default function CargandoReputacionMedio() {
  return (
    <EsqueletoPaginaMiMedio>
      <EsqueletoResumenReputacion />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <EsqueletoCasosReputacion />
        <EsqueletoCalidadCuentas />
      </div>
    </EsqueletoPaginaMiMedio>
  )
}
