import "server-only"

import { EsqueletoTarjetaGrafico } from "@/components/charts/esqueleto-grafico"
import { EsqueletoPanelInsights } from "@/features/dashboard/insights/components/esqueleto-panel-insights"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { ClavePermiso } from "@/lib/auth/permisos"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { cn } from "@/lib/utils"

import {
  BloquePanel,
  FILA_PRINCIPAL,
  FILA_TERCIOS,
  PRIMERO_DE_TERCIOS,
  PRINCIPAL,
} from "../../components/bloque-panel"
import {
  EsqueletoLista,
  EsqueletoMapaRanking,
} from "../../components/esqueletos-panel"
import { EsqueletoTarjetasKpi } from "../../components/tarjetas-kpi"
import type { PeriodoPanel } from "../../periodo"
import {
  ALTO_DONA,
  ALTO_EMBUDO,
  ALTO_MAPA_CALOR,
  type FuenteActividad,
} from "../datos"
import { EsqueletoActividadReciente } from "./actividad-reciente"
import {
  BloqueActividad,
  BloqueActividadReciente,
  BloqueAlertas,
  BloqueDepartamentos,
  BloqueEmbudo,
  BloqueFormatos,
  BloqueInsights,
  BloqueKpisAdmin,
  BloquePlataformas,
  BloqueSaludMedios,
  BloqueTendenciaGmv,
} from "./bloques-admin"

const FILA = "grid gap-4 sm:gap-5"

/**
 * Panel general (interno): indicadores → qué cambió y la tendencia →
 * cómo avanza la operación (embudo, mezcla) → dónde y con quién (territorio,
 * salud de medios) → cuándo (actividad) y qué atender (alertas) → qué pasó
 * hace poco (bitácora).
 * Cada bloque consulta en paralelo y solo aparece si el rol tiene su permiso.
 */
export function PanelAdmin({
  usuario,
  periodo,
  ahora,
}: {
  usuario: UsuarioSesion
  periodo: PeriodoPanel
  ahora: Date
}) {
  const puede = (permiso: ClavePermiso) => tieneAlgunPermiso(usuario, [permiso])
  const conTerritorio = puede("analitica.global")
  const conAlertas = puede("accesos.ver") || puede("asignaciones.ver")
  const conBitacora = puede("auditoria.ver")
  const fuentes: FuenteActividad[] = puede("accesos.ver")
    ? ["asignaciones", "publicaciones", "accesos"]
    : ["asignaciones", "publicaciones"]

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <BloquePanel
        titulo="Indicadores del periodo"
        esqueleto={<EsqueletoTarjetasKpi />}
      >
        <BloqueKpisAdmin periodo={periodo} />
      </BloquePanel>

      <div className={cn(FILA, FILA_PRINCIPAL)}>
        <BloquePanel
          titulo="GMV verificado y comisión"
          orden={1}
          className={PRINCIPAL}
          esqueleto={<EsqueletoTarjetaGrafico alto="min-h-80" />}
        >
          <BloqueTendenciaGmv periodo={periodo} />
        </BloquePanel>
        {/* En una columna los hallazgos van antes del gráfico: son la lectura rápida. */}
        <BloquePanel
          titulo="Lo que cambió en el periodo"
          orden={2}
          className="@max-4xl/panel:-order-1"
          esqueleto={<EsqueletoPanelInsights />}
        >
          <BloqueInsights periodo={periodo} usuario={usuario} ahora={ahora} />
        </BloquePanel>
      </div>

      <div className={cn(FILA, FILA_TERCIOS)}>
        <BloquePanel
          titulo="Embudo de asignaciones"
          orden={3}
          className={PRIMERO_DE_TERCIOS}
          esqueleto={<EsqueletoTarjetaGrafico alto={ALTO_EMBUDO} />}
        >
          <BloqueEmbudo periodo={periodo} />
        </BloquePanel>
        <BloquePanel
          titulo="GMV por plataforma"
          orden={4}
          esqueleto={<EsqueletoTarjetaGrafico alto={ALTO_DONA} />}
        >
          <BloquePlataformas periodo={periodo} />
        </BloquePanel>
        <BloquePanel
          titulo="GMV por formato"
          orden={5}
          esqueleto={<EsqueletoTarjetaGrafico alto="min-h-64" />}
        >
          <BloqueFormatos periodo={periodo} />
        </BloquePanel>
      </div>

      <div className={cn(FILA, conTerritorio && FILA_PRINCIPAL)}>
        {conTerritorio ? (
          <BloquePanel
            titulo="Top departamentos"
            orden={6}
            className={PRINCIPAL}
            esqueleto={<EsqueletoMapaRanking />}
          >
            <BloqueDepartamentos periodo={periodo} usuario={usuario} />
          </BloquePanel>
        ) : null}
        <BloquePanel
          titulo="Salud de los medios"
          orden={7}
          esqueleto={<EsqueletoLista filas={5} />}
        >
          <BloqueSaludMedios
            periodo={periodo}
            ahora={ahora}
            conMedios={puede("medios.ver")}
          />
        </BloquePanel>
      </div>

      {/*
       * El mapa de calor conserva su alto natural (celdas casi cuadradas): al
       * lado solo van las alertas. La bitácora cierra el panel a todo el ancho.
       */}
      <div className={cn(FILA, conAlertas && FILA_PRINCIPAL)}>
        <BloquePanel
          titulo="Actividad por día y hora"
          orden={8}
          className={cn(conAlertas && PRINCIPAL)}
          esqueleto={<EsqueletoTarjetaGrafico alto={ALTO_MAPA_CALOR} />}
        >
          <BloqueActividad periodo={periodo} fuentes={fuentes} />
        </BloquePanel>
        {conAlertas ? (
          <BloquePanel
            titulo="Alertas"
            orden={9}
            esqueleto={<EsqueletoLista filas={4} />}
          >
            <BloqueAlertas periodo={periodo} usuario={usuario} ahora={ahora} />
          </BloquePanel>
        ) : null}
      </div>

      {conBitacora ? (
        <BloquePanel
          titulo="Actividad reciente"
          orden={10}
          esqueleto={<EsqueletoActividadReciente />}
        >
          <BloqueActividadReciente usuario={usuario} ahora={ahora} />
        </BloquePanel>
      ) : null}
    </div>
  )
}
