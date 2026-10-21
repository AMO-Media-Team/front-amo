import "server-only"

import { Building2 } from "lucide-react"

import { EsqueletoTarjetaGrafico } from "@/components/charts/esqueleto-grafico"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { serializarFecha } from "@/lib/fechas"
import { cn } from "@/lib/utils"

import { ALTO_DONA } from "../../admin/datos"
import { AvisoSinActividad } from "../../components/aviso-sin-actividad"
import {
  BloquePanel,
  FILA_PRINCIPAL,
  PRINCIPAL,
} from "../../components/bloque-panel"
import {
  EsqueletoLista,
  EsqueletoMapaRanking,
} from "../../components/esqueletos-panel"
import {
  EsqueletoTarjetasKpi,
  TarjetasKpi,
} from "../../components/tarjetas-kpi"
import { hayActividad, indicePorKpi } from "../../kpi"
import { etiquetaComparacionCorta, type PeriodoPanel } from "../../periodo"
import { configAnalitica } from "../../servidor"
import { KPI_ACTIVIDAD_ANUNCIANTE, tarjetasAnunciante } from "../../tarjetas"
import {
  desempenoPorPlataforma,
  inversionPorDepartamento,
  rankingMedios,
  resumenCartera,
  serieDesempeno,
} from "../datos"
import {
  desempenoAnunciante,
  facturasPendientes,
  kpisAnunciante,
} from "../queries"
import {
  GraficoInversion,
  GraficoPlataformasAnunciante,
} from "./graficos-anunciante"
import {
  CarteraAnunciante,
  CoberturaAnunciante,
  MediosDestacados,
} from "./paneles-anunciante"

interface PropsPeriodo {
  periodo: PeriodoPanel
}

async function BloqueKpis({ periodo }: PropsPeriodo) {
  const [filas, config] = await Promise.all([
    kpisAnunciante(
      periodo.desde,
      periodo.hasta,
      periodo.desdeAnterior,
      periodo.hastaAnterior
    ),
    configAnalitica(),
  ])
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {hayActividad(filas, KPI_ACTIVIDAD_ANUNCIANTE) ? null : (
        <AvisoSinActividad detalle="campañas activas, ofertas ni negocios" />
      )}
      <TarjetasKpi
        etiqueta="Indicadores de tu pauta"
        filas={filas}
        tarjetas={tarjetasAnunciante(indicePorKpi(filas))}
        nMinimo={config.nMinimo}
        razones="propias"
        etiquetaComparacion={etiquetaComparacionCorta(periodo.rango)}
      />
    </div>
  )
}

async function BloqueTendencia({ periodo }: PropsPeriodo) {
  const filas = await desempenoAnunciante(periodo.desde, periodo.hasta, "fecha")
  return (
    <GraficoInversion
      serie={serieDesempeno(filas, periodo.desde, periodo.hasta)}
    />
  )
}

async function BloquePlataformas({ periodo }: PropsPeriodo) {
  const filas = await desempenoAnunciante(
    periodo.desde,
    periodo.hasta,
    "plataforma"
  )
  return (
    <GraficoPlataformasAnunciante plataformas={desempenoPorPlataforma(filas)} />
  )
}

async function BloqueCobertura({ periodo }: PropsPeriodo) {
  const [departamentos, municipios] = await Promise.all([
    desempenoAnunciante(periodo.desde, periodo.hasta, "departamento"),
    desempenoAnunciante(periodo.desde, periodo.hasta, "municipio"),
  ])
  return (
    <CoberturaAnunciante
      departamentos={inversionPorDepartamento(departamentos)}
      municipios={municipios}
    />
  )
}

async function BloqueMedios({ periodo }: PropsPeriodo) {
  const [filas, config] = await Promise.all([
    desempenoAnunciante(periodo.desde, periodo.hasta, "medio"),
    configAnalitica(),
  ])
  return (
    <MediosDestacados
      ranking={rankingMedios(filas, config.nMinimo)}
      nMinimo={config.nMinimo}
    />
  )
}

async function BloqueCartera({ ahora }: { ahora: Date }) {
  const facturas = await facturasPendientes()
  return (
    <CarteraAnunciante
      cartera={resumenCartera(facturas, serializarFecha(ahora))}
    />
  )
}

const FILA = "grid gap-4 sm:gap-5"

/**
 * Panel del anunciante: su inversión y lo que le devolvió (alcance,
 * interacciones, eficiencia), por plataforma y territorio, sus medios
 * destacados y su cartera. Solo ve lo suyo: las RPC filtran a su organización.
 */
export function PanelAnunciante({
  usuario,
  periodo,
  ahora,
}: {
  usuario: UsuarioSesion
  periodo: PeriodoPanel
  ahora: Date
}) {
  if (!usuario.anuncianteId) {
    return (
      <EstadoVacio
        icono={Building2}
        titulo="Tu cuenta aún no está vinculada a una empresa"
        descripcion="Cuando el equipo de AMO la asocie a tu empresa verás aquí el desempeño de tu pauta."
        className="flex-none py-16"
      />
    )
  }
  const conCartera = tieneAlgunPermiso(usuario, ["facturas.ver_propias"])

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <BloquePanel
        titulo="Indicadores de tu pauta"
        esqueleto={<EsqueletoTarjetasKpi />}
      >
        <BloqueKpis periodo={periodo} />
      </BloquePanel>

      <div className={cn(FILA, conCartera && FILA_PRINCIPAL)}>
        <BloquePanel
          titulo="Inversión y alcance"
          orden={1}
          className={cn(conCartera && PRINCIPAL)}
          esqueleto={<EsqueletoTarjetaGrafico alto="min-h-80" />}
        >
          <BloqueTendencia periodo={periodo} />
        </BloquePanel>
        {conCartera ? (
          <BloquePanel
            titulo="Facturas por pagar"
            orden={2}
            esqueleto={<EsqueletoLista filas={4} />}
          >
            <BloqueCartera ahora={ahora} />
          </BloquePanel>
        ) : null}
      </div>

      <div className={cn(FILA, FILA_PRINCIPAL)}>
        <BloquePanel
          titulo="Inversión por plataforma"
          orden={3}
          esqueleto={<EsqueletoTarjetaGrafico alto={ALTO_DONA} />}
        >
          <BloquePlataformas periodo={periodo} />
        </BloquePanel>
        <BloquePanel
          titulo="Cobertura territorial"
          orden={4}
          className={PRINCIPAL}
          esqueleto={<EsqueletoMapaRanking />}
        >
          <BloqueCobertura periodo={periodo} />
        </BloquePanel>
      </div>

      <BloquePanel
        titulo="Medios destacados"
        orden={5}
        esqueleto={<EsqueletoLista filas={5} />}
      >
        <BloqueMedios periodo={periodo} />
      </BloquePanel>
    </div>
  )
}
