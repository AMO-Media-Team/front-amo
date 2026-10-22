import "server-only"

import { LayoutDashboard } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { enAlta, situacionMedio } from "@/features/mi-medio/alta"
import { medioPropio } from "@/features/mi-medio/queries"
import type { UsuarioSesion } from "@/lib/auth/tipos"

import { PanelAdmin } from "../admin/components/panel-admin"
import { PanelAnunciante } from "../anunciante/components/panel-anunciante"
import { PanelMedio } from "../medio/components/panel-medio"
import { PRESET_POR_DEFECTO_PANEL, panelPara, type TipoPanel } from "../panel"
import {
  type PeriodoPanel,
  periodoPanel,
  textoFechasPeriodo,
  type ValoresPeriodo,
} from "../periodo"
import { EncabezadoPanel } from "./encabezado-panel"
import { ContenidoPanel, ProveedorPeriodo } from "./proveedor-periodo"

const DESCRIPCION: Readonly<Record<TipoPanel, (p: PeriodoPanel) => string>> = {
  admin: (p) => `Así va el marketplace · ${textoFechasPeriodo(p.rango)}`,
  anunciante: (p) => `Así rinde tu pauta · ${textoFechasPeriodo(p.rango)}`,
  medio: () => "Tus ganancias, tu avance y lo que tienes por hacer.",
}

/**
 * Medio aún en alta (sin verificar): su inicio es la lista de alta, sin
 * periodo. Un error de lectura no tumba el inicio: el panel lo muestra aislado.
 */
async function medioEnAlta(medioId: string | null): Promise<boolean> {
  if (!medioId) return false
  const medio = await medioPropio(medioId).catch(() => null)
  return medio
    ? enAlta(
        situacionMedio({
          estado: medio.estado,
          nivel: medio.nivel,
          enviadoVerificacionAt: medio.enviadoVerificacionAt,
          motivoEstado: medio.motivoEstado,
        })
      )
    : false
}

/**
 * Inicio según el tipo de rol: panel general (interno), del anunciante o del
 * medio. La página ya autorizó con el DAL; cada RPC vuelve a exigir su
 * permiso en la base de datos.
 */
export async function PanelInicio({
  usuario,
  valores,
}: {
  usuario: UsuarioSesion
  valores: ValoresPeriodo
}) {
  const ahora = new Date()
  const panel = panelPara(usuario)

  if (!panel) {
    return (
      <ContenedorPagina>
        <EncabezadoPanel
          nombre={usuario.nombre}
          ahora={ahora}
          descripcion="Este es tu punto de partida en AMO."
          conPeriodo={false}
        />
        <EstadoVacio
          icono={LayoutDashboard}
          titulo="Tu rol no tiene un panel de inicio"
          descripcion="Usa el menú para ir a las secciones que tienes habilitadas."
          className="flex-none py-16"
        />
      </ContenedorPagina>
    )
  }

  const porDefecto = PRESET_POR_DEFECTO_PANEL[panel]
  const periodo = periodoPanel(valores, porDefecto, ahora)
  const alta = panel === "medio" && (await medioEnAlta(usuario.medioId))
  return (
    <ProveedorPeriodo porDefecto={porDefecto}>
      <ContenedorPagina>
        <EncabezadoPanel
          nombre={usuario.nombre}
          ahora={ahora}
          descripcion={
            alta
              ? "Completa tu perfil para empezar a recibir ofertas."
              : DESCRIPCION[panel](periodo)
          }
          conPeriodo={!alta}
        />
        <ContenidoPanel>
          {panel === "admin" ? (
            <PanelAdmin usuario={usuario} periodo={periodo} ahora={ahora} />
          ) : panel === "anunciante" ? (
            <PanelAnunciante
              usuario={usuario}
              periodo={periodo}
              ahora={ahora}
            />
          ) : (
            <PanelMedio usuario={usuario} periodo={periodo} ahora={ahora} />
          )}
        </ContenidoPanel>
      </ContenedorPagina>
    </ProveedorPeriodo>
  )
}
