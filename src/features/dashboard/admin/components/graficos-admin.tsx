"use client"

import type { ElementoValor, EtapaEmbudo } from "@/components/charts/datos"
import { conversionesEmbudo, mayorCaida } from "@/components/charts/datos"
import { conUnidad } from "@/components/charts/formatos"
import { GraficoBarrasRanking } from "@/components/charts/grafico-barras-ranking"
import { GraficoCombo } from "@/components/charts/grafico-combo"
import { GraficoDona } from "@/components/charts/grafico-dona"
import { GraficoEmbudo } from "@/components/charts/grafico-embudo"
import { TarjetaGrafico } from "@/components/charts/tarjeta-grafico"
import { formatearCOP, formatearPorcentaje } from "@/lib/format"

import {
  ALTO_DONA,
  ALTO_EMBUDO,
  type DatosTendenciaGmv,
  POR_GRANULARIDAD,
} from "../datos"

/** GMV verificado (columnas) y comisión (línea), en bandas apiladas. */
export function GraficoTendenciaGmv({
  datos,
  className,
}: {
  datos: DatosTendenciaGmv
  className?: string
}) {
  const vacio = datos.totalGmv === 0 && datos.totalComision === 0
  const tomaDeComision =
    datos.totalGmv > 0 ? datos.totalComision / datos.totalGmv : null
  return (
    <TarjetaGrafico
      titulo="GMV verificado y comisión"
      descripcion={`Negocios cumplidos ${POR_GRANULARIDAD[datos.granularidad]}, por fecha de verificación.`}
      alto="min-h-80"
      className={className}
      vacio={
        vacio
          ? {
              titulo: "Aún no hay negocios verificados en el periodo",
              descripcion:
                "Cuando se validen las métricas de las asignaciones verás aquí el GMV y la comisión.",
            }
          : false
      }
      pie={
        vacio ? null : (
          <span className="cifras">
            Total del periodo: {formatearCOP(datos.totalGmv)} de GMV ·{" "}
            {formatearCOP(datos.totalComision)} de comisión
            {tomaDeComision !== null
              ? ` (${formatearPorcentaje(tomaDeComision, 1)})`
              : ""}
          </span>
        )
      }
    >
      <GraficoCombo
        titulo="GMV verificado y comisión"
        etiquetas={datos.etiquetas}
        barras={{
          id: "gmv_verificado",
          nombre: "GMV verificado",
          valores: datos.gmvVerificado,
          formato: "cop",
        }}
        linea={{
          id: "comision",
          nombre: "Comisión",
          valores: datos.comision,
          formato: "cop",
        }}
      />
    </TarjetaGrafico>
  )
}

const UNIDAD_ASIGNACION = { singular: "asignación", plural: "asignaciones" }
const UNIDAD_VISTA = { singular: "oferta vista", plural: "ofertas vistas" }
const UNIDAD_VEZ = { singular: "vez", plural: "veces" }

/**
 * De las asignaciones aceptadas a las pagadas (100 % = aceptadas), con la
 * etapa donde más se frenan al pie. Las ofertas vistas son otra cohorte
 * (`embudoPanel`): van como contexto, no como primera barra.
 */
export function GraficoEmbudoPanel({
  etapas,
  vistas,
  vacio,
  className,
}: {
  /** De aceptadas a pagadas, en orden. */
  etapas: readonly EtapaEmbudo[]
  /** Ofertas vistas por los medios en el periodo. */
  vistas: number | null
  vacio: boolean
  className?: string
}) {
  const caida = mayorCaida(conversionesEmbudo(etapas))
  const indice = caida ? etapas.findIndex((e) => e.id === caida.id) : -1
  const previa = indice > 0 ? etapas[indice - 1] : null
  const conVistas = vistas !== null && vistas > 0
  const conCaida = Boolean(caida && previa && caida.deLaAnterior !== null)
  return (
    <TarjetaGrafico
      titulo="Embudo de asignaciones"
      descripcion="Asignaciones aceptadas en el periodo según la etapa más avanzada que alcanzaron."
      alto={ALTO_EMBUDO}
      className={className}
      vacio={
        vacio
          ? {
              titulo: "Sin asignaciones aceptadas en el periodo",
              descripcion: conVistas
                ? `Los medios vieron ofertas ${conUnidad(vistas, UNIDAD_VEZ)} en el periodo, pero aún no aceptaron ninguna.`
                : "El embudo aparece cuando los medios acepten ofertas publicadas.",
            }
          : false
      }
      pie={
        // Solo contenido en línea: en pantalla completa el pie va en un `<p>`.
        !vacio && (conVistas || conCaida) ? (
          <>
            {conVistas ? (
              <>
                <span className="font-medium cifras text-foreground">
                  {conUnidad(vistas, UNIDAD_VISTA)}
                </span>{" "}
                por los medios en el periodo.{" "}
              </>
            ) : null}
            {caida && previa && caida.deLaAnterior !== null ? (
              <>
                Donde más se frenan: de{" "}
                {previa.nombre.toLocaleLowerCase("es-CO")} a{" "}
                {caida.nombre.toLocaleLowerCase("es-CO")} avanza el{" "}
                <span className="font-medium cifras text-foreground">
                  {formatearPorcentaje(caida.deLaAnterior, 1)}
                </span>{" "}
                (las más recientes siguen en curso).
              </>
            ) : null}
          </>
        ) : null
      }
    >
      <GraficoEmbudo
        titulo="Embudo de asignaciones"
        etapas={etapas}
        unidad={UNIDAD_ASIGNACION}
      />
    </TarjetaGrafico>
  )
}

export interface CpmPlataforma {
  nombre: string
  cpm: number | null
  /** TikTok cuenta reproducciones, no impresiones. */
  familia: "impresiones" | "reproducciones"
}

/** Participación de cada plataforma en el GMV verificado, con su CPM al pie. */
export function GraficoPlataformas({
  segmentos,
  cpm,
  className,
}: {
  segmentos: readonly ElementoValor[]
  cpm: readonly CpmPlataforma[]
  className?: string
}) {
  const conCpm = cpm.filter((fila) => fila.cpm !== null)
  return (
    <TarjetaGrafico
      titulo="GMV por plataforma"
      descripcion="Participación de cada red en los negocios verificados."
      alto={ALTO_DONA}
      className={className}
      vacio={
        segmentos.length === 0
          ? {
              titulo: "Sin negocios verificados",
              descripcion: "La mezcla aparece con el primer negocio cumplido.",
            }
          : false
      }
      pie={
        conCpm.length ? (
          <span className="cifras">
            CPM efectivo:{" "}
            {conCpm
              .map(
                (fila) =>
                  `${fila.nombre} ${formatearCOP(fila.cpm === null ? null : Math.round(fila.cpm))}${fila.familia === "reproducciones" ? " (por mil reproducciones)" : ""}`
              )
              .join(" · ")}
          </span>
        ) : null
      }
    >
      <GraficoDona
        titulo="GMV por plataforma"
        segmentos={segmentos}
        formato="cop"
        // Corta: "GMV verificado" no cabe dentro del anillo en la tarjeta angosta.
        etiquetaTotal="GMV"
        nombreCategoria="Plataforma"
        maximo={3}
      />
    </TarjetaGrafico>
  )
}

/** Formatos con más GMV verificado (cada uno con la sigla de su plataforma). */
export function GraficoFormatos({
  elementos,
  siglas,
  className,
}: {
  elementos: readonly ElementoValor[]
  /** "FB: Facebook · IG: Instagram": qué significan las siglas del eje. */
  siglas: string
  className?: string
}) {
  return (
    <TarjetaGrafico
      titulo="GMV por formato"
      descripcion="Los formatos que más negocio verificado movieron."
      alto="min-h-64"
      className={className}
      vacio={
        elementos.length === 0
          ? {
              titulo: "Sin formatos con negocios verificados",
              descripcion: "Aparecerán cuando se verifiquen las métricas.",
            }
          : false
      }
      pie={elementos.length > 0 && siglas ? siglas : null}
    >
      <GraficoBarrasRanking
        titulo="GMV por formato"
        elementos={elementos}
        formato="cop"
        nombreValor="GMV verificado"
        nombreCategoria="Formato"
        limite={6}
        agruparResto
      />
    </TarjetaGrafico>
  )
}
