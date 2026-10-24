import {
  Ban,
  Banknote,
  BadgeCheck,
  ChevronRight,
  Coins,
  FilePen,
  ListChecks,
  type LucideIcon,
  ShieldAlert,
  Wallet,
} from "lucide-react"
import Link from "next/link"

import type {
  DocumentoSoporteFicha,
  NumeracionDocumentoSoporte,
} from "@/features/documento-soporte/tipos"
import { SeccionDocumentoSoporte } from "@/features/documento-soporte/components/seccion-documento-soporte"
import {
  InsigniaDemo,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import {
  AvisoEstadoFicha,
  CabeceraFicha,
  EnlaceFicha,
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import { contar } from "@/features/operacion/formato"
import { rutaAsignacion, rutaMedio } from "@/features/operacion/rutas"
import { RegistrarPagoLiquidacion } from "@/features/pagos-medios/components/registrar-pago-liquidacion"
import { rutaDispersion } from "@/features/pagos-medios/rutas"
import { formatearCOP, formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

import { ID_DOCUMENTO_SOPORTE, ID_ESTADO_LIQUIDACION } from "../foco"
import { diaDeInstante } from "../periodo"
import {
  avisoAnulacion,
  avisoEstado,
  bloqueoAprobacion,
  diaLargo,
  formatearTarifa,
  nombreRetencion,
  periodoCompacto,
  periodoLargo,
  porcentajeComision,
  requiereNotaAjuste,
  sePuedeAnular,
  situacionSoporte,
  textoDispersion,
  textoSegSocial,
} from "../presentacion"
import type {
  EstadoLiquidacion,
  LiquidacionFicha,
  PoliticaSegSocial,
} from "../tipos"
import {
  type AccesoLiquidaciones,
  rutaVistaLiquidaciones,
  VISTAS,
  vistaDeEstado,
} from "../vistas"
import { AccionesLiquidacion } from "./acciones-liquidacion"
import { BotonDescarga } from "./boton-descarga"
import { InsigniaEstadoLiquidacion, InsigniaSoporte } from "./piezas"
import { SeccionFacturaMedio } from "./seccion-factura-medio"

const ICONOS_ESTADO: Readonly<Record<EstadoLiquidacion, LucideIcon>> = {
  BORRADOR: FilePen,
  APROBADA: BadgeCheck,
  PAGADA: Wallet,
  ANULADA: Ban,
}

// ── Montos y retenciones (LIQ-002) ───────────────────────────────────────────

function Renglon({
  etiqueta,
  detalle,
  valor,
  resta = false,
  destacado = false,
}: {
  etiqueta: string
  detalle?: string | null
  valor: number
  resta?: boolean
  destacado?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2.5",
        destacado && "pt-3"
      )}
    >
      <dt className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-sm",
            destacado ? "font-semibold" : "text-foreground"
          )}
        >
          {etiqueta}
        </span>
        {detalle ? (
          <span className="text-xs text-pretty text-muted-foreground">
            {detalle}
          </span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "shrink-0 cifras whitespace-nowrap",
          destacado ? "text-lg font-semibold" : "text-sm",
          resta && "text-muted-foreground"
        )}
      >
        {resta && valor > 0 ? "− " : ""}
        {formatearCOP(valor)}
      </dd>
    </div>
  )
}

function TarjetaMontos({ liquidacion }: { liquidacion: LiquidacionFicha }) {
  const comision = porcentajeComision(
    liquidacion.montoBruto,
    liquidacion.montoComision
  )
  const { retenciones } = liquidacion
  return (
    <TarjetaFicha
      titulo="Montos"
      icono={Coins}
      descripcion={`${contar(liquidacion.asignaciones, "asignación verificada", "asignaciones verificadas")}. Las retenciones se calculan sobre el total del pago.`}
    >
      <dl className="flex flex-col divide-y">
        <Renglon
          etiqueta="Valor bruto"
          detalle="Lo que paga el anunciante por estas publicaciones."
          valor={liquidacion.montoBruto}
        />
        <Renglon
          etiqueta={comision ? `Comisión AMO (${comision})` : "Comisión AMO"}
          valor={liquidacion.montoComision}
          resta
        />
        <Renglon
          etiqueta="Valor del medio"
          valor={liquidacion.montoMedio}
          destacado
        />
        {retenciones.length > 0 ? (
          retenciones.map((retencion) => (
            <Renglon
              key={retencion.clave}
              etiqueta={nombreRetencion(retencion)}
              detalle={`${formatearTarifa(retencion.tipo, retencion.tarifa)} sobre ${formatearCOP(retencion.base)}`}
              valor={retencion.valor}
              resta
            />
          ))
        ) : (
          <Renglon
            etiqueta="Retenciones"
            detalle={
              liquidacion.montoRetenciones > 0
                ? liquidacion.estado === "ANULADA"
                  ? "El detalle se liberó con las asignaciones al anularla."
                  : "No tienes acceso al detalle por asignación."
                : "No supera las cuantías mínimas de retención."
            }
            valor={liquidacion.montoRetenciones}
            resta
          />
        )}
        <Renglon
          etiqueta="Neto a pagar"
          valor={liquidacion.montoNeto}
          destacado
        />
      </dl>
    </TarjetaFicha>
  )
}

// ── Seguridad social (LIQ-007) ───────────────────────────────────────────────

function TarjetaSegSocial({
  liquidacion,
  politica,
  verMedios,
}: {
  liquidacion: LiquidacionFicha
  politica: PoliticaSegSocial
  verMedios: boolean
}) {
  const texto = textoSegSocial(politica)
  return (
    <TarjetaFicha
      titulo={texto.titulo}
      icono={ShieldAlert}
      className={texto.bloquea ? "border-destructive/40" : "border-warning/45"}
    >
      <div className="flex flex-col gap-3 text-sm text-pretty">
        <p>{texto.politica}</p>
        <p className="text-muted-foreground">{texto.queHacer}</p>
        {verMedios ? (
          <Link
            href={rutaMedio(liquidacion.medioId)}
            className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
          >
            Ver los documentos del medio
          </Link>
        ) : null}
      </div>
    </TarjetaFicha>
  )
}

// ── Pago (LIQ-005, LIQ-006) ──────────────────────────────────────────────────

function TarjetaPago({
  liquidacion,
  registrarPago,
}: {
  liquidacion: LiquidacionFicha
  registrarPago: boolean
}) {
  const { estado } = liquidacion
  const texto = textoDispersion(liquidacion.dispersion)
  // Con `liquidaciones.registrar_pago` el archivo de pagos se abre en su ficha.
  const dispersion =
    registrarPago && liquidacion.dispersion ? (
      <Link
        href={rutaDispersion(liquidacion.dispersion.id)}
        className="underline-offset-4 hover:underline focus-visible:anillo-foco"
      >
        {texto}
      </Link>
    ) : (
      texto
    )
  return (
    <TarjetaFicha
      titulo="Pago"
      icono={Banknote}
      descripcion={
        estado === "PAGADA"
          ? undefined
          : `Neto a pagar: ${formatearCOP(liquidacion.montoNeto)}.`
      }
    >
      {estado === "PAGADA" ? (
        <ListaDatos
          datos={[
            {
              etiqueta: "Fecha de pago",
              valor: liquidacion.fechaPago ? (
                diaLargo(liquidacion.fechaPago)
              ) : (
                <SinDato />
              ),
            },
            {
              etiqueta: "Referencia",
              valor: liquidacion.referenciaPago ?? <SinDato />,
            },
            {
              etiqueta: "Soporte del pago",
              valor: liquidacion.tieneSoportePago ? (
                <BotonDescarga
                  liquidacionId={liquidacion.id}
                  archivo="soporte_pago"
                />
              ) : (
                <SinDato>Sin soporte</SinDato>
              ),
            },
            { etiqueta: "Archivo de pagos", valor: dispersion },
          ]}
        />
      ) : estado === "APROBADA" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{dispersion}.</p>
          {registrarPago ? (
            <RegistrarPagoLiquidacion
              liquidacionId={liquidacion.id}
              medio={liquidacion.medio ?? "el medio"}
              montoNeto={liquidacion.montoNeto}
              fechaMinima={diaDeInstante(liquidacion.creadaAt)}
              documentoListo={situacionSoporte(liquidacion).listo}
              variante="completo"
            />
          ) : (
            <p className="text-sm text-pretty text-muted-foreground">
              Lo registra Finanzas cuando el banco confirme la transferencia.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-pretty text-muted-foreground">
          {estado === "BORRADOR"
            ? "Se paga después de aprobarla y de tener su documento soporte o la factura del medio."
            : liquidacion.dispersion
              ? `Anulada: no se paga. ${texto}.`
              : "Anulada: no se paga."}
        </p>
      )}
    </TarjetaFicha>
  )
}

// ── Asignaciones incluidas ───────────────────────────────────────────────────

function TarjetaAsignaciones({
  liquidacion,
  verAsignaciones,
}: {
  liquidacion: LiquidacionFicha
  verAsignaciones: boolean
}) {
  const { lineas } = liquidacion
  return (
    <TarjetaFicha
      titulo="Asignaciones incluidas"
      icono={ListChecks}
      descripcion={
        lineas.length > 0
          ? "Valor del medio y neto de cada publicación verificada."
          : undefined
      }
    >
      {lineas.length === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">
          {liquidacion.estado === "ANULADA"
            ? "Al anularla, sus asignaciones volvieron a verificadas y entran en el próximo corte."
            : "No tienes acceso al detalle de las asignaciones de esta liquidación."}
        </p>
      ) : (
        <ul
          aria-label="Asignaciones de la liquidación"
          className="-mx-2 flex flex-col"
        >
          {lineas.map((linea) => {
            const contenido = (
              <>
                <MarcaPlataforma
                  plataforma={linea.plataforma}
                  className="shrink-0"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {linea.oferta ?? "Oferta no visible"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[linea.campana, linea.marca].filter(Boolean).join(" · ") ||
                      "—"}
                    {linea.verificadaAt
                      ? ` · verificada el ${formatearFecha(linea.verificadaAt)}`
                      : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="text-sm cifras">
                    {formatearCOP(linea.montoMedio)}
                  </span>
                  <span className="text-xs cifras text-muted-foreground">
                    neto {formatearCOP(linea.montoNeto)}
                  </span>
                </span>
              </>
            )
            return (
              <li key={linea.asignacionId}>
                {verAsignaciones ? (
                  <Link
                    href={rutaAsignacion(linea.asignacionId)}
                    className="group/fila flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60 focus-visible:anillo-foco"
                  >
                    {contenido}
                    <ChevronRight
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground max-sm:hidden"
                    />
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2.5">
                    {contenido}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </TarjetaFicha>
  )
}

// ── Ficha ────────────────────────────────────────────────────────────────────

export interface FichaLiquidacionProps {
  liquidacion: LiquidacionFicha
  acceso: AccesoLiquidaciones
  politica: PoliticaSegSocial
  documentoSoporte: DocumentoSoporteFicha | null
  numeracion: NumeracionDocumentoSoporte
}

/**
 * Ficha de una liquidación (LIQ-002, LIQ-003, LIQ-004, LIQ-007): estado y
 * acciones, montos con cada retención, seguridad social, documento soporte o
 * factura del medio, pago y las asignaciones incluidas.
 */
export function FichaLiquidacion({
  liquidacion,
  acceso,
  politica,
  documentoSoporte,
  numeracion,
}: FichaLiquidacionProps) {
  const { estado } = liquidacion
  const medio = liquidacion.medio ?? "Medio no visible"
  const periodo = periodoLargo(
    liquidacion.periodoInicio,
    liquidacion.periodoFin
  )
  const aviso = avisoEstado(liquidacion, acceso.superadmin)
  const vista = vistaDeEstado(estado)
  const segSocial = textoSegSocial(politica)

  return (
    <div className="flex flex-col gap-4">
      <CabeceraFicha
        volver={{
          href: rutaVistaLiquidaciones(vista),
          titulo: `Liquidaciones · ${VISTAS[vista].titulo}`,
        }}
        antetitulo="Liquidación"
        titulo={medio}
        subtitulo={`Periodo del ${periodo}`}
        distintivos={
          <>
            <InsigniaEstadoLiquidacion estado={estado} />
            <InsigniaSoporte fila={liquidacion} />
            {liquidacion.esDemo ? <InsigniaDemo /> : null}
          </>
        }
        acciones={
          <AccionesLiquidacion
            liquidacionId={liquidacion.id}
            titulo={`${medio} · ${periodoCompacto(liquidacion.periodoInicio, liquidacion.periodoFin)}`}
            ofreceAprobar={acceso.aprobar && estado === "BORRADOR"}
            bloqueoAprobar={bloqueoAprobacion(liquidacion, acceso.superadmin)}
            ofreceAnular={acceso.aprobar && sePuedeAnular(estado)}
            avisoAnular={avisoAnulacion(liquidacion.dispersion)}
            requiereNotaAjuste={requiereNotaAjuste(liquidacion.documento)}
            advertenciaSegSocial={
              liquidacion.alertaSegSocial && segSocial.bloquea
                ? "Seguridad social pendiente: con la política vigente no se aprobará si el medio aún no la tiene aprobada."
                : null
            }
          />
        }
        lateral={
          <>
            <span>
              Generada el {formatearFecha(liquidacion.creadaAt, "largo")}
              {liquidacion.generadaPorMi ? " por ti" : ""}
            </span>
            {liquidacion.aprobadaAt ? (
              <span>
                Aprobada el {formatearFecha(liquidacion.aprobadaAt, "largo")}
              </span>
            ) : null}
            <EnlaceFicha
              href={rutaMedio(liquidacion.medioId)}
              permitido={acceso.verMedios && liquidacion.medio !== null}
              className="text-foreground"
            >
              {liquidacion.municipio
                ? `${medio} · ${liquidacion.municipio}`
                : medio}
            </EnlaceFicha>
          </>
        }
        aviso={
          <AvisoEstadoFicha
            id={ID_ESTADO_LIQUIDACION}
            tono={aviso.tono}
            icono={ICONOS_ESTADO[estado]}
            titulo={aviso.titulo}
          >
            {aviso.texto}
          </AvisoEstadoFicha>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <TarjetaMontos liquidacion={liquidacion} />
        <div className="flex flex-col gap-4">
          {liquidacion.alertaSegSocial ? (
            <TarjetaSegSocial
              liquidacion={liquidacion}
              politica={politica}
              verMedios={acceso.verMedios}
            />
          ) : null}
          <TarjetaPago
            liquidacion={liquidacion}
            registrarPago={acceso.registrarPago}
          />
        </div>
      </div>

      {liquidacion.requiereDocumentoSoporte ? (
        <div
          id={ID_DOCUMENTO_SOPORTE}
          tabIndex={-1}
          aria-label="Documento soporte"
          role="region"
          className="scroll-mt-20 rounded-xl outline-none empty:hidden focus-visible:anillo-foco"
        >
          <SeccionDocumentoSoporte
            liquidacionId={liquidacion.id}
            estadoLiquidacion={estado}
            documento={documentoSoporte}
            numeracion={numeracion}
            puedeGestionar={acceso.aprobar}
          />
        </div>
      ) : (
        <SeccionFacturaMedio
          liquidacionId={liquidacion.id}
          medio={medio}
          estado={estado}
          numero={liquidacion.numeroFacturaMedio}
          tieneArchivo={liquidacion.tieneFacturaMedio}
          puedeRegistrar={acceso.registrarPago}
        />
      )}

      <TarjetaAsignaciones
        liquidacion={liquidacion}
        verAsignaciones={acceso.verAsignaciones}
      />
    </div>
  )
}
