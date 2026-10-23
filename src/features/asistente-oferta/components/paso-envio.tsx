"use client"

import { BadgeCheck, CircleAlert, Lock, Pencil } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { useAsistente } from "@/components/asistente/asistente"
import { Button } from "@/components/ui/button"
import { rutaMiCampana } from "@/features/campanas/rutas"
import { CampoAreaTexto } from "@/features/configuracion/components/campos"
import { textoANumero } from "@/features/configuracion/numeros"
import type { EstadoCreativo } from "@/features/creativos/tipos"
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { CORTES, ESTADOS_OFERTA } from "@/features/operacion/estados"
import { resumenSegmentacion } from "@/features/territorio/segmentacion"
import { formatearCOP, formatearFechaHora, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  cantidadDe,
  porcentajeRecargo,
  seguidoresEfectivos,
} from "../estimador"
import { nombreFormato } from "../formatos"
import { type PasoOferta, TITULOS_PASO } from "../pasos"
import type { ValoresOferta } from "../schemas"
import type {
  CampanaAsistente,
  CatalogoAsistente,
  ConfiguracionAsistente,
  OfertaEnCurso,
} from "../tipos"

export interface PropsPasoEnvio {
  catalogo: CatalogoAsistente
  campana: Pick<CampanaAsistente, "id" | "estado">
  configuracion: Pick<
    ConfiguracionAsistente,
    "umbralSeguidores" | "recargoExclusividad"
  >
  ofertas: readonly OfertaEnCurso[]
  creativos: Readonly<Record<string, EstadoCreativo>>
  empresaVerificada: boolean
}

/** «24 horas, 72 horas y 7 días». */
export function listaConY(elementos: readonly string[]): string {
  if (elementos.length <= 1) return elementos.join("")
  return `${elementos.slice(0, -1).join(", ")} y ${elementos.at(-1)}`
}

function BloqueResumen({
  paso,
  children,
}: {
  paso: PasoOferta
  children: ReactNode
}) {
  const { irA } = useAsistente<PasoOferta>()
  const titulo = TITULOS_PASO[paso]
  return (
    <section
      aria-label={titulo}
      className="flex flex-col gap-3 border-b pb-4 last:border-b-0 last:pb-0"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void irA(paso)}
          aria-label={`Editar: ${titulo}`}
        >
          <Pencil data-icon="inline-start" aria-hidden />
          Editar
        </Button>
      </div>
      {children}
    </section>
  )
}

function Datos({
  datos,
}: {
  datos: readonly { etiqueta: string; valor: ReactNode }[]
}) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {datos.map(({ etiqueta, valor }) => (
        <div key={etiqueta} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
          <dd className="text-sm break-words">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

function Aviso({
  tono,
  titulo,
  children,
}: {
  tono: "aviso" | "info"
  titulo: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-sm",
        tono === "aviso"
          ? "border-warning/40 bg-warning/8"
          : "border-info/30 bg-info/8"
      )}
    >
      <CircleAlert
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tono === "aviso" ? "text-warning" : "text-info"
        )}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{titulo}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

/**
 * Paso 6 · Revisión y envío (ANU-009): resumen de todo con «Editar» por paso,
 * instrucciones y restricciones editoriales, la etiqueta de publicidad
 * (obligatoria, fija) y lo que impide enviar si la empresa o la campaña aún
 * no están listas.
 */
export function PasoEnvio({
  catalogo,
  campana,
  configuracion,
  ofertas,
  creativos,
  empresaVerificada,
}: PropsPasoEnvio) {
  const { control } = useFormContext<ValoresOferta>()
  const [que, quien, cuando, cuanto] = useWatch({
    control,
    name: ["que", "quien", "cuando", "cuanto"],
  })
  const formatoDe = (formatoId: string) =>
    catalogo.formatos.find((formato) => formato.id === formatoId)
  const nombreDe = (formatoId: string) => {
    const formato = formatoDe(formatoId)
    return formato ? nombreFormato(formato) : "Formato no disponible"
  }
  const minimo = textoANumero(quien.seguidoresMinimos)
  const categorias = catalogo.categorias
    .filter((categoria) => quien.categorias.includes(categoria.id))
    .map((categoria) => categoria.nombre)
  const dias = textoANumero(cuando.exclusividadDias)

  return (
    <div className="flex flex-col gap-6">
      {!empresaVerificada ? (
        <Aviso tono="aviso" titulo="Tu empresa aún no está verificada">
          Puedes dejar la oferta lista y guardarla como borrador; podrás
          enviarla a revisión cuando AMO verifique tu empresa.{" "}
          <Link
            href={"/empresa" as Route}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Ver el estado de mi empresa
          </Link>
        </Aviso>
      ) : campana.estado === "BORRADOR" ? (
        <Aviso tono="aviso" titulo="La campaña está en borrador">
          Actívala para poder enviar esta oferta a revisión; mientras tanto,
          guárdala como borrador.{" "}
          <Link
            href={rutaMiCampana(campana.id)}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Ir a la campaña
          </Link>
        </Aviso>
      ) : null}

      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5">
        <BloqueResumen paso="que">
          <Datos
            datos={[
              {
                etiqueta: que.formatoIds.length === 1 ? "Formato" : "Formatos",
                valor: que.formatoIds.length
                  ? listaConY(que.formatoIds.map(nombreDe))
                  : "Sin elegir",
              },
              { etiqueta: "Título", valor: que.titulo.trim() || "Sin título" },
              {
                etiqueta: "Publicaciones por medio",
                valor: que.publicacionesPorMedio || "—",
              },
            ]}
          />
        </BloqueResumen>

        <BloqueResumen paso="quien">
          <Datos
            datos={[
              {
                etiqueta: "Zonas",
                valor: resumenSegmentacion(quien.segmentacion),
              },
              {
                etiqueta: "Categorías",
                valor: categorias.length ? listaConY(categorias) : "Todas",
              },
              {
                etiqueta: "Mínimo efectivo de seguidores",
                valor: formatearNumero(
                  seguidoresEfectivos(
                    minimo !== null && minimo >= 0 ? Math.trunc(minimo) : null,
                    configuracion.umbralSeguidores
                  )
                ),
              },
              {
                etiqueta: "Medios excluidos",
                valor: quien.mediosExcluidos.length
                  ? listaConY(quien.mediosExcluidos.map((m) => m.nombre))
                  : "Ninguno",
              },
            ]}
          />
        </BloqueResumen>

        <BloqueResumen paso="cuando">
          <Datos
            datos={[
              {
                etiqueta: "Ventana de publicación",
                valor: `${formatearFechaHora(cuando.ventanaInicio)} – ${formatearFechaHora(cuando.ventanaFin)}`,
              },
              {
                etiqueta: "Fecha límite para aceptar",
                valor: formatearFechaHora(cuando.fechaLimite),
              },
              {
                etiqueta: "Permanencia mínima",
                valor: `${cuando.permanenciaDias || "—"} días`,
              },
              {
                etiqueta: "Cortes de métricas",
                valor: cuando.cortes.length
                  ? listaConY(cuando.cortes.map((c) => CORTES[c].etiqueta))
                  : "Ninguno",
              },
              {
                etiqueta: "Exclusividad",
                valor: cuando.exclusividad
                  ? `${dias !== null ? formatearNumero(dias) : "—"} días (recargo de ${porcentajeRecargo(configuracion.recargoExclusividad)})`
                  : "Sin exclusividad",
              },
            ]}
          />
        </BloqueResumen>

        <BloqueResumen paso="cuanto">
          <ul className="flex flex-col gap-2">
            {cuanto.formatos.map((formato) => {
              const cupos = formato.cupos.reduce(
                (suma, cupo) => suma + cantidadDe(cupo.cantidad),
                0
              )
              const presupuesto = textoANumero(formato.presupuestoMaximo)
              return (
                <li
                  key={formato.formatoId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                >
                  <span className="font-medium">
                    {nombreDe(formato.formatoId)}
                  </span>
                  <span className="cifras text-muted-foreground">
                    {presupuesto !== null ? formatearCOP(presupuesto) : "—"} ·{" "}
                    {cupos === 1 ? "1 cupo" : `${formatearNumero(cupos)} cupos`}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="text-sm text-muted-foreground">
            Tope por medio: {cuanto.topePorcentaje || "—"} % del presupuesto de
            la campaña.
          </p>
        </BloqueResumen>

        <BloqueResumen paso="creativo">
          {ofertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Se carga después de guardar la oferta.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ofertas.map((oferta) => {
                const estado = creativos[oferta.ofertaId]
                return (
                  <li
                    key={oferta.ofertaId}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
                  >
                    <span className="font-medium">
                      {nombreDe(oferta.formatoId)}
                    </span>
                    {estado?.listo ? (
                      <span className="flex items-center gap-1.5 text-success">
                        <BadgeCheck aria-hidden className="size-4" />
                        Paquete creativo listo
                        {estado.archivos > 0
                          ? ` (${estado.archivos === 1 ? "1 archivo" : `${formatearNumero(estado.archivos)} archivos`})`
                          : ""}
                      </span>
                    ) : (
                      <span className="text-warning">
                        Falta el paquete creativo
                        {estado?.faltan.length ? `: ${estado.faltan[0]}` : ""}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </BloqueResumen>
      </div>

      <section
        aria-labelledby="asistente-condiciones"
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-0.5">
          <h3 id="asistente-condiciones" className="text-base font-semibold">
            Condiciones para los medios
          </h3>
          <p className="text-sm text-muted-foreground">
            Lo que cada medio debe tener en cuenta al publicar. AMO lo revisa
            antes de publicar la oferta.
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
          <Lock
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-medium">
              Etiqueta de publicidad: siempre obligatoria
            </p>
            <p className="text-sm text-muted-foreground">
              Cada publicación debe identificarse como publicidad (la etiqueta
              de colaboración pagada de la red o #Publicidad). No se puede
              quitar.
            </p>
          </div>
        </div>
        <CampoAreaTexto
          nombre="envio.instrucciones"
          etiqueta="Instrucciones"
          opcional
          filas={4}
          placeholder="Por ejemplo, menciona la promoción del fin de semana y etiqueta la cuenta de la marca."
          descripcion="Qué debe hacer el medio al publicar: mensajes clave, menciones, horario sugerido."
        />
        <CampoAreaTexto
          nombre="envio.restricciones"
          etiqueta="Restricciones"
          opcional
          filas={3}
          placeholder="Por ejemplo, no modificar el video ni agregar música."
          descripcion="Lo que el medio no debe hacer con el contenido."
        />
      </section>

      {ofertas.some((oferta) => oferta.estado !== "BORRADOR") ? (
        <section
          aria-label="Estado de las ofertas"
          className="flex flex-col gap-2"
        >
          <h3 className="text-sm font-semibold">Estado de las ofertas</h3>
          <ul className="flex flex-col gap-2">
            {ofertas.map((oferta) => (
              <li
                key={oferta.ofertaId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>{nombreDe(oferta.formatoId)}</span>
                <InsigniaEstado
                  catalogo={ESTADOS_OFERTA}
                  estado={oferta.estado}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
