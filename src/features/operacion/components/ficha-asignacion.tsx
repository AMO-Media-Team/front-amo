import {
  ArrowRight,
  Ban,
  CircleSlash,
  Download,
  ExternalLink,
  FileImage,
  Handshake,
  History,
  Landmark,
  Receipt,
  Scale,
  TimerOff,
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { rutaDisputaInterna } from "@/features/disputas/rutas"
import {
  formatearCOP,
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  CORTES,
  ESTADOS_ASIGNACION,
  ESTADOS_DISPUTA,
  ESTADOS_LIQUIDACION,
  ESTADOS_TERMINALES_CAIDA,
  type EstadoAsignacion,
  PLATAFORMAS,
} from "../estados"
import {
  cerrarFrase,
  formatearFechaHoraFija,
  formatearHandle,
  formatearMultiplicador,
  formatearRangoCompacto,
  instanteDeDia,
} from "../formato"
import { ID_AVISO_ESTADO_ASIGNACION } from "../foco"
import { disputaAbierta } from "../gestion-asignacion"
import { tieneAlerta } from "../metricas"
import {
  RUTAS_OPERACION,
  rutaAnunciante,
  rutaCampana,
  rutaMedio,
} from "../rutas"
import type { AsignacionDetalle, PrecioCongelado as Precio } from "../tipos"
import { InsigniaEstado, InsigniaTono, MarcaPlataforma } from "./distintivos"
import { EvidenciasAsignacion } from "./evidencias-asignacion"
import {
  AvisoEstadoFicha,
  CabeceraFicha,
  EnlaceFicha,
  FechaRelativa,
  ListaDatos,
  Monograma,
  SinDato,
  TarjetaFicha,
} from "./ficha"
import { LineaTiempoAsignacion } from "./linea-tiempo-asignacion"

const ENLACE = "font-medium text-foreground"

/** Fichas relacionadas que el rol puede abrir (permiso de cada sección). */
export interface EnlacesAsignacion {
  medio: boolean
  campana: boolean
  anunciante: boolean
  /** `disputas.ver`: la ficha interna de cada disputa. */
  disputas: boolean
}

/** Mientras el medio no publique, la fecha límite sigue corriendo. */
const ESPERAN_PUBLICACION: readonly EstadoAsignacion[] = [
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
]

/** Cerradas fuera del camino feliz: ya no llegará evidencia ni habrá descargas. */
function estaCerrada(estado: EstadoAsignacion): boolean {
  return ESTADOS_TERMINALES_CAIDA.includes(estado)
}

// ── Cabecera ─────────────────────────────────────────────────────────────────

/** Métricas por validar con alerta de integridad (INT-003/004). */
function alertasPorValidar(asignacion: AsignacionDetalle): number {
  return asignacion.publicaciones
    .flatMap((publicacion) => publicacion.cortes)
    .filter((corte) => corte.estado === "PENDIENTE" && tieneAlerta(corte))
    .length
}

/**
 * Aviso del estado cuando la asignación salió del camino feliz. Es el
 * destino del foco tras cancelarla o abrir una disputa desde la cabecera
 * (`ID_AVISO_ESTADO_ASIGNACION`): siempre existe en esos estados.
 */
function AvisoEstadoAsignacion({
  asignacion,
  verDisputas,
}: {
  asignacion: AsignacionDetalle
  verDisputas: boolean
}) {
  const id = ID_AVISO_ESTADO_ASIGNACION
  switch (asignacion.estado) {
    case "CANCELADA":
      return (
        <AvisoEstadoFicha
          id={id}
          tono="peligro"
          icono={Ban}
          titulo={`Cancelada por AMO${asignacion.causaCancelacion ? ` · ${asignacion.causaCancelacion}` : ""}`}
        >
          <p>{asignacion.motivo ?? "Sin motivo registrado."}</p>
          {asignacion.causa === "FRAUDE" ? (
            <p className="mt-1">
              Según los términos que aceptó, el medio no recibe el pago de esta
              publicación.
            </p>
          ) : null}
        </AvisoEstadoFicha>
      )
    case "RECHAZADA":
      return (
        <AvisoEstadoFicha
          id={id}
          tono="neutro"
          icono={CircleSlash}
          titulo={
            asignacion.aceptadaAt
              ? "El medio rechazó el cupo que había aceptado"
              : "El medio rechazó la oferta en el marketplace"
          }
        >
          {asignacion.motivo ?? "No dejó un motivo."}
        </AvisoEstadoFicha>
      )
    case "VENCIDA_SIN_PUBLICAR":
      return (
        <AvisoEstadoFicha
          id={id}
          tono="peligro"
          icono={TimerOff}
          titulo="Venció sin publicar"
        >
          {asignacion.fechaLimite
            ? `El plazo terminó el ${formatearFechaHoraFija(asignacion.fechaLimite)} sin evidencia; el cupo volvió a quedar libre.`
            : "Pasó la fecha límite sin evidencia; el cupo volvió a quedar libre."}
        </AvisoEstadoFicha>
      )
    case "EN_DISPUTA": {
      const abierta = disputaAbierta(asignacion.disputas)
      return (
        <AvisoEstadoFicha
          id={id}
          tono="aviso"
          icono={Scale}
          titulo="En disputa"
          accion={
            abierta && verDisputas ? (
              <EnlaceBoton
                href={rutaDisputaInterna(abierta.id)}
                variant="outline"
                size="sm"
              >
                Ver la disputa
                <ArrowRight data-icon="inline-end" aria-hidden />
              </EnlaceBoton>
            ) : null
          }
        >
          {asignacion.estadoPrevioDisputa
            ? `Estaba en «${ESTADOS_ASIGNACION[asignacion.estadoPrevioDisputa].etiqueta.toLocaleLowerCase("es-CO")}» cuando se abrió. `
            : ""}
          No se verifica ni se liquida hasta que el equipo AMO la resuelva.
        </AvisoEstadoFicha>
      )
    }
    default:
      return null
  }
}

/**
 * Cabecera de la ficha: identidad de la asignación, estado, franja, cupo,
 * medio suspendido y métricas con alerta por validar, fechas y el aviso del
 * estado. `acciones` (la gestión del equipo, `AccionesAsignacion`) y
 * `verificar` (el «Verificar» de la validación) van arriba a la derecha
 * desde `sm`; en el celular la página los repite en el pie fijo.
 */
export function CabeceraAsignacion({
  asignacion,
  enlaces,
  acciones,
  verificar,
}: {
  asignacion: AsignacionDetalle
  enlaces: EnlacesAsignacion
  acciones?: ReactNode
  /** Hueco del «Verificar» (`VerificarAsignacion`), antes de las demás acciones. */
  verificar?: ReactNode
}) {
  const conAlerta = alertasPorValidar(asignacion)
  return (
    <CabeceraFicha
      volver={{ href: RUTAS_OPERACION.asignaciones, titulo: "Asignaciones" }}
      antetitulo={[
        "Asignación",
        PLATAFORMAS[asignacion.plataforma],
        asignacion.formato,
      ]
        .filter(Boolean)
        .join(" · ")}
      titulo={asignacion.oferta.titulo ?? "Asignación"}
      visual={<Monograma icono={Handshake} />}
      subtitulo={
        <span className="flex flex-col gap-x-2 gap-y-1 sm:flex-row sm:flex-wrap sm:items-center">
          <EnlaceFicha
            href={rutaMedio(asignacion.medio.id)}
            permitido={enlaces.medio}
            className={ENLACE}
          >
            {asignacion.medio.nombre ?? "Medio"}
          </EnlaceFicha>
          <span aria-hidden className="max-sm:hidden">
            ×
          </span>
          <EnlaceFicha
            href={rutaCampana(asignacion.campana.id)}
            permitido={enlaces.campana}
            className={ENLACE}
          >
            {asignacion.campana.nombre ?? "Campaña"}
          </EnlaceFicha>
          <span aria-hidden className="max-sm:hidden">
            ·
          </span>
          <EnlaceFicha
            href={rutaAnunciante(asignacion.anunciante.id)}
            permitido={enlaces.anunciante}
            className={
              enlaces.anunciante
                ? "hover:text-foreground focus-visible:text-foreground"
                : undefined
            }
          >
            {asignacion.anunciante.nombre ?? "Anunciante"}
          </EnlaceFicha>
        </span>
      }
      distintivos={
        <>
          <InsigniaEstado
            catalogo={ESTADOS_ASIGNACION}
            estado={asignacion.estado}
          />
          {asignacion.precio.franja ? (
            <InsigniaTono
              tono="neutro"
              etiqueta={`Franja ${asignacion.precio.franja}`}
            />
          ) : null}
          {asignacion.slot > 1 ? (
            <InsigniaTono
              tono="neutro"
              etiqueta={`Cupo ${formatearNumero(asignacion.slot)}`}
            />
          ) : null}
          {asignacion.medio.estado === "SUSPENDIDO" ? (
            <InsigniaTono
              tono="aviso"
              etiqueta="Medio suspendido"
              titulo="No ve ofertas nuevas; conserva lo que tiene en curso mientras el equipo decide."
            />
          ) : null}
          {conAlerta > 0 ? (
            <InsigniaTono
              tono="peligro"
              etiqueta={
                conAlerta === 1
                  ? "1 métrica con alerta"
                  : `${formatearNumero(conAlerta)} métricas con alerta`
              }
              titulo="Por validar: revisa el porqué de cada alerta antes de aprobarlas."
            />
          ) : null}
        </>
      }
      acciones={
        acciones || verificar ? (
          <>
            {verificar}
            {acciones}
          </>
        ) : undefined
      }
      accionesEnPieMovil
      lateral={
        <>
          <span>
            Creada el{" "}
            <time
              dateTime={asignacion.creadaAt}
              title={formatearFechaHora(asignacion.creadaAt)}
            >
              {formatearFecha(asignacion.creadaAt)}
            </time>
          </span>
          {asignacion.fechaLimite ? (
            ESPERAN_PUBLICACION.includes(asignacion.estado) ? (
              <span>
                Publicar antes de:{" "}
                <FechaRelativa valor={asignacion.fechaLimite} estilo="medio" />
              </span>
            ) : (
              <span>
                Límite para publicar:{" "}
                <time
                  dateTime={asignacion.fechaLimite}
                  title={formatearFechaHora(asignacion.fechaLimite)}
                >
                  {formatearFecha(asignacion.fechaLimite)}
                </time>
              </span>
            )
          ) : null}
        </>
      }
      aviso={
        <AvisoEstadoAsignacion
          asignacion={asignacion}
          verDisputas={enlaces.disputas}
        />
      }
    />
  )
}

// ── Precio congelado ─────────────────────────────────────────────────────────

function Renglon({
  etiqueta,
  valor,
  ayuda,
  operador,
  total = false,
}: {
  etiqueta: string
  valor: ReactNode
  ayuda?: ReactNode
  operador?: "×" | "−" | "="
  total?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 py-2",
        total && "border-t pt-3"
      )}
    >
      <dt className="flex min-w-0 flex-col">
        <span
          className={cn(
            "text-sm",
            total ? "font-semibold" : "text-muted-foreground"
          )}
        >
          {operador ? (
            <span
              aria-hidden
              className="mr-1.5 inline-block w-3 text-center text-muted-foreground"
            >
              {operador}
            </span>
          ) : null}
          {etiqueta}
        </span>
        {ayuda ? (
          <span className="pl-[1.125rem] text-xs text-muted-foreground">
            {ayuda}
          </span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "shrink-0 text-right cifras",
          total ? "font-heading text-lg font-semibold" : "text-sm font-medium"
        )}
      >
        {valor}
      </dd>
    </div>
  )
}

/**
 * Valores congelados al aceptar el cupo: tarifa de la franja, multiplicadores
 * y monto bruto; para roles internos además la comisión, el valor para el
 * medio, las retenciones y el neto (`asignacion_montos`, filtrado por RLS).
 */
export function PrecioCongelado({ precio }: { precio: Precio }) {
  const { montos } = precio
  return (
    <TarjetaFicha
      titulo="Precio congelado"
      icono={Receipt}
      descripcion="Fijado al aceptar el cupo: no cambia aunque cambien tarifas o multiplicadores."
    >
      <dl className="-my-2 flex flex-col">
        <Renglon
          etiqueta="Tarifa base por publicación"
          ayuda={[
            precio.franja ? `Franja ${precio.franja}` : null,
            precio.seguidoresAlAceptar !== null
              ? `${formatearNumero(precio.seguidoresAlAceptar)} seguidores al aceptar`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          valor={formatearCOP(precio.tarifaBase)}
        />
        <Renglon
          operador="×"
          etiqueta="Publicaciones"
          valor={formatearNumero(precio.publicaciones)}
        />
        <Renglon
          operador="×"
          etiqueta="Calidad de la cuenta"
          valor={formatearMultiplicador(precio.multiplicadorCalidad)}
        />
        <Renglon
          operador="×"
          etiqueta="Pertinencia geográfica"
          valor={formatearMultiplicador(precio.multiplicadorGeografico)}
        />
        <Renglon
          operador="×"
          etiqueta="Exclusividad"
          valor={formatearMultiplicador(precio.multiplicadorExclusividad)}
        />
        <Renglon
          total
          operador="="
          etiqueta="Monto bruto"
          ayuda="Lo que paga el anunciante (GMV)"
          valor={formatearCOP(precio.montoBruto)}
        />
        {montos ? (
          <>
            <Renglon
              operador="−"
              etiqueta="Comisión AMO"
              ayuda={`${formatearPorcentaje(montos.porcentajeComision, 1)} · ${montos.origenComision}`}
              valor={formatearCOP(montos.montoComision)}
            />
            <Renglon
              total
              operador="="
              etiqueta="Valor para el medio"
              valor={formatearCOP(montos.montoMedio)}
            />
            <Renglon
              operador="−"
              etiqueta="Retenciones"
              valor={
                montos.retenciones === null ? (
                  <SinDato>Al liquidar</SinDato>
                ) : (
                  formatearCOP(montos.retenciones)
                )
              }
            />
            <Renglon
              total
              operador="="
              etiqueta="Neto a pagar"
              valor={
                montos.montoNeto === null ? (
                  <SinDato>Al liquidar</SinDato>
                ) : (
                  formatearCOP(montos.montoNeto)
                )
              }
            />
          </>
        ) : null}
      </dl>
      {montos ? null : (
        <p className="pt-4 text-xs text-muted-foreground">
          Esta asignación no tiene registrado el desglose de comisión, valor
          para el medio y neto, o tu rol no puede consultarlo.
        </p>
      )}
    </TarjetaFicha>
  )
}

// ── Ejecución, disputas y liquidación ────────────────────────────────────────

export function EjecucionAsignacion({
  asignacion,
}: {
  asignacion: AsignacionDetalle
}) {
  const { cuenta } = asignacion
  return (
    <TarjetaFicha titulo="Ejecución" icono={Download}>
      <ListaDatos
        className="sm:grid-cols-1 xl:grid-cols-2"
        datos={[
          {
            etiqueta: "Cuenta que publica",
            valor: cuenta ? (
              <a
                href={cuenta.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex max-w-full items-center gap-1.5 underline-offset-4 hover:underline"
              >
                <MarcaPlataforma plataforma={cuenta.plataforma} />
                <span className="truncate">
                  {formatearHandle(cuenta.handle)}
                </span>
                <ExternalLink
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="sr-only"> (abre en una pestaña nueva)</span>
              </a>
            ) : (
              <SinDato>No visible</SinDato>
            ),
          },
          {
            etiqueta: "Ventana de publicación",
            valor:
              asignacion.ventanaInicio && asignacion.ventanaFin ? (
                <span
                  className="cifras"
                  title={`${formatearFechaHora(asignacion.ventanaInicio)} – ${formatearFechaHora(asignacion.ventanaFin)}`}
                >
                  {formatearRangoCompacto(
                    asignacion.ventanaInicio,
                    asignacion.ventanaFin
                  )}
                </span>
              ) : (
                <SinDato />
              ),
          },
          {
            etiqueta: "Descargas del contenido",
            valor:
              asignacion.descargas > 0 ? (
                `${formatearNumero(asignacion.descargas)} ${asignacion.descargas === 1 ? "descarga" : "descargas"}`
              ) : (
                <SinDato>
                  {estaCerrada(asignacion.estado)
                    ? "No lo descargó"
                    : "Aún no lo descarga"}
                </SinDato>
              ),
            ayuda: asignacion.ultimaDescargaAt ? (
              <>
                Última:{" "}
                <FechaRelativa
                  valor={asignacion.ultimaDescargaAt}
                  estilo="medio"
                />
              </>
            ) : null,
          },
          {
            etiqueta: "Cortes de métricas exigidos",
            valor:
              asignacion.cortesRequeridos.length > 0 ? (
                asignacion.cortesRequeridos
                  .map((corte) => CORTES[corte].etiqueta)
                  .join(" · ")
              ) : (
                <SinDato>Ninguno</SinDato>
              ),
          },
        ]}
      />
    </TarjetaFicha>
  )
}

/**
 * Disputas de la asignación, de la más antigua a la más reciente; con
 * `disputas.ver` cada una enlaza a su ficha interna (hilo y resolución).
 */
export function DisputasAsignacion({
  asignacion,
  verDisputas,
}: {
  asignacion: AsignacionDetalle
  verDisputas: boolean
}) {
  if (asignacion.disputas.length === 0) return null
  return (
    <TarjetaFicha titulo="Disputas" icono={Scale}>
      <ul className="-my-2 flex flex-col divide-y">
        {asignacion.disputas.map((disputa) => (
          <li key={disputa.id} className="flex flex-col gap-1.5 py-3">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <EnlaceFicha
                href={rutaDisputaInterna(disputa.id)}
                permitido={verDisputas}
                className="text-sm font-medium"
              >
                Disputa por {disputa.motivo.toLocaleLowerCase("es-CO")}
              </EnlaceFicha>
              <InsigniaEstado
                catalogo={ESTADOS_DISPUTA}
                estado={disputa.estado}
                className="h-5 px-2 text-[0.6875rem]"
              />
            </span>
            <span className="text-xs text-muted-foreground">
              Abierta por {disputa.parte} el {formatearFecha(disputa.creadaAt)}
              {disputa.resueltaAt
                ? ` · cerrada el ${formatearFecha(disputa.resueltaAt)}`
                : ""}
            </span>
            <p className="text-sm text-pretty break-words">
              {disputa.descripcion}
            </p>
            {disputa.resolucion ? (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-pretty break-words">
                <span className="font-medium">Resolución:</span>{" "}
                {disputa.resolucion}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </TarjetaFicha>
  )
}

export function LiquidacionAsignacion({
  asignacion,
}: {
  asignacion: AsignacionDetalle
}) {
  const { liquidacion } = asignacion
  if (!liquidacion) return null
  return (
    <TarjetaFicha titulo="Liquidación al medio" icono={Landmark}>
      <ListaDatos
        className="sm:grid-cols-1 xl:grid-cols-2"
        datos={[
          {
            etiqueta: "Estado",
            valor: (
              <InsigniaEstado
                catalogo={ESTADOS_LIQUIDACION}
                estado={liquidacion.estado}
              />
            ),
          },
          {
            etiqueta: "Periodo",
            valor: formatearRangoCompacto(
              instanteDeDia(liquidacion.periodoInicio),
              instanteDeDia(liquidacion.periodoFin)
            ),
          },
          {
            etiqueta: "Pago",
            valor: liquidacion.fechaPago ? (
              formatearFecha(instanteDeDia(liquidacion.fechaPago), "largo")
            ) : (
              <SinDato>Pendiente</SinDato>
            ),
          },
        ]}
      />
    </TarjetaFicha>
  )
}

// ── Evidencia y línea de tiempo ──────────────────────────────────────────────

function mensajeSinEvidencia(asignacion: AsignacionDetalle): string {
  const plazo = asignacion.fechaLimite
    ? ` antes del ${formatearFechaHoraFija(asignacion.fechaLimite)}`
    : ""
  switch (asignacion.estado) {
    case "ACEPTADA":
      return cerrarFrase(
        `El medio aún no descarga el contenido. Debe publicar y cargar la evidencia${plazo}`
      )
    case "CONTENIDO_ENTREGADO":
      return cerrarFrase(
        `El medio ya descargó el contenido. Debe publicar y cargar la evidencia${plazo}`
      )
    case "RECHAZADA":
    case "CANCELADA":
    case "VENCIDA_SIN_PUBLICAR":
      return "La asignación se cerró sin publicación."
    default:
      return "No hay evidencia visible para esta asignación."
  }
}

/**
 * Lo que la validación necesita para ofrecer sus decisiones en la ficha
 * (permisos de quien la ve y estado de la asignación); sin ello la evidencia
 * es de solo lectura.
 */
export type ValidacionFicha = ComponentProps<
  typeof EvidenciasAsignacion
>["validacion"]

export function EvidenciaAsignacion({
  asignacion,
  validacion,
}: {
  asignacion: AsignacionDetalle
  validacion?: ValidacionFicha
}) {
  const { publicaciones } = asignacion
  return (
    <TarjetaFicha
      titulo="Publicación y métricas"
      icono={FileImage}
      descripcion={
        publicaciones.length > 0
          ? "Evidencia cargada por el medio y sus métricas por corte, con la validación de AMO."
          : undefined
      }
    >
      {publicaciones.length > 0 ? (
        <EvidenciasAsignacion
          asignacionId={asignacion.id}
          plataforma={asignacion.plataforma}
          publicaciones={publicaciones}
          cortesRequeridos={asignacion.cortesRequeridos}
          validacion={validacion}
        />
      ) : (
        <EstadoVacio
          variante="simple"
          icono={FileImage}
          titulo={
            estaCerrada(asignacion.estado)
              ? "Sin evidencia"
              : "Aún sin evidencia"
          }
          descripcion={mensajeSinEvidencia(asignacion)}
          className="py-6"
        />
      )}
    </TarjetaFicha>
  )
}

/**
 * Rechazo desde el marketplace: la fila nace RECHAZADA sin cupo, cuenta ni
 * precio (docs/modelo-datos.md §4.2). En lugar de tarjetas llenas de rayas se
 * explica por qué no hay nada más que mostrar.
 */
export function SinCupoAceptado({
  asignacion,
}: {
  asignacion: AsignacionDetalle
}) {
  return (
    <TarjetaFicha titulo="Sin cupo aceptado" icono={CircleSlash}>
      <div className="flex flex-col gap-3 text-sm text-pretty">
        <p>
          {asignacion.medio.nombre ?? "El medio"} vio la oferta en el
          marketplace y la rechazó sin tomar un cupo. Por eso no hay precio
          congelado, cuenta que publique ni evidencia.
        </p>
        <p className="text-muted-foreground">
          El rechazo no consumió cupos ni presupuesto de la oferta y no cuenta
          en la tasa de cumplimiento del medio.
        </p>
      </div>
    </TarjetaFicha>
  )
}

export function HistoriaAsignacion({
  asignacion,
}: {
  asignacion: AsignacionDetalle
}) {
  return (
    <TarjetaFicha
      titulo="Línea de tiempo"
      icono={History}
      descripcion={`${formatearNumero(asignacion.eventos.length)} ${
        asignacion.eventos.length === 1
          ? "hecho registrado"
          : "hechos registrados"
      }, del primero al último.`}
    >
      <LineaTiempoAsignacion
        eventos={asignacion.eventos}
        conBitacora={asignacion.conBitacora}
      />
    </TarjetaFicha>
  )
}

/**
 * Cuerpo de la ficha en dos columnas: a la izquierda lo que ocurrió (evidencia
 * e historia) y a la derecha el dinero y la ejecución. Un rechazo desde el
 * marketplace solo tiene historia.
 */
export function CuerpoAsignacion({
  asignacion,
  verDisputas,
  validacion,
}: {
  asignacion: AsignacionDetalle
  /** `disputas.ver`: cada disputa enlaza a su ficha interna. */
  verDisputas: boolean
  /** Decisiones de la validación sobre la evidencia y los cortes (ADM-007/008). */
  validacion?: ValidacionFicha
}) {
  const sinCupo = asignacion.aceptadaAt === null
  return (
    <div className="grid items-start gap-4 lg:grid-cols-5">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
        {sinCupo ? null : (
          <EvidenciaAsignacion
            asignacion={asignacion}
            validacion={validacion}
          />
        )}
        <HistoriaAsignacion asignacion={asignacion} />
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        {sinCupo ? (
          <SinCupoAceptado asignacion={asignacion} />
        ) : (
          <>
            <PrecioCongelado precio={asignacion.precio} />
            <EjecucionAsignacion asignacion={asignacion} />
          </>
        )}
        <DisputasAsignacion asignacion={asignacion} verDisputas={verDisputas} />
        <LiquidacionAsignacion asignacion={asignacion} />
      </div>
    </div>
  )
}
