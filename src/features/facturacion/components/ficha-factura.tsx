import {
  Building,
  Calculator,
  FileCheck,
  FileMinus,
  FilePen,
  HandCoins,
  ListChecks,
  TriangleAlert,
} from "lucide-react"
import type { Route } from "next"
import type { ReactNode } from "react"

import { BotonCopiar } from "@/components/feedback/boton-copiar"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { ETIQUETAS_REGIMEN } from "@/features/empresa/schemas"
import {
  InsigniaDemo,
  InsigniaEstado,
  InsigniaTono,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import {
  CabeceraFicha,
  EnlaceFicha,
  SinDato,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import {
  ESTADOS_ASIGNACION,
  ESTADOS_FACTURA,
} from "@/features/operacion/estados"
import { formatearNit } from "@/features/operacion/formato"
import { rutaAnunciante, rutaAsignacion } from "@/features/operacion/rutas"
import { formatearCOP, formatearFecha, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { rutaFacturasFiltradas } from "../listado"
import {
  abreviarCodigo,
  admiteCobro,
  alcanceFactura,
  contarAsignaciones,
  describirPeriodo,
  ESQUEMAS,
  etiquetaMedioPago,
  formatearDia,
  type NumeracionSugerida,
  sigueFacturable,
  situacionVencimiento,
} from "../presentacion"
import { RUTA_FACTURAS } from "../rutas"
import type {
  FichaFactura as Factura,
  LineaFactura,
  NotaCreditoFactura,
  PagoFactura,
} from "../tipos"
import { AnularBorrador } from "./anular-borrador"
import { BotonDescargar } from "./boton-descargar"
import { COLUMNAS_FICHA_FACTURA } from "./esqueletos"
import { EstadoFactura } from "./estado-factura"
import { MenuArchivoCarga } from "./menu-archivo-carga"
import { RegistrarExpedida } from "./registrar-expedida"
import { RegistrarNotaCredito } from "./registrar-nota-credito"
import { RegistrarPago } from "./registrar-pago"

export interface PermisosFicha {
  /** `facturas.gestionar`: borrador, expedida y notas crédito. */
  gestionar: boolean
  /** `pagos.registrar`. */
  registrarPago: boolean
  /** `asignaciones.ver`: los conceptos (y su enlace). */
  verAsignaciones: boolean
  /** `anunciantes.ver`: el enlace a la ficha y la cartera del anunciante. */
  verAnunciantes: boolean
}

export interface DatosExpedicion {
  sugerencia: NumeracionSugerida | null
  resolucion: string | null
  diasVencimiento: number | null
}

export interface FichaFacturaProps {
  factura: Factura
  lineas: readonly LineaFactura[]
  pagos: readonly PagoFactura[]
  notas: readonly NotaCreditoFactura[]
  permisos: PermisosFicha
  /** Lo que necesita «Registrar factura expedida» (solo en un borrador). */
  expedicion: DatosExpedicion | null
  ahora: Date
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Fila({
  etiqueta,
  ayuda,
  valor,
  destacado = false,
}: {
  etiqueta: string
  ayuda?: ReactNode
  valor: ReactNode
  destacado?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2",
        destacado && "border-t pt-3"
      )}
    >
      <dt className="flex min-w-0 flex-col">
        <span
          className={cn(
            "text-sm",
            destacado ? "font-semibold" : "text-muted-foreground"
          )}
        >
          {etiqueta}
        </span>
        {ayuda ? (
          <span className="text-xs text-pretty text-muted-foreground">
            {ayuda}
          </span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "shrink-0 text-right cifras",
          destacado ? "text-base font-semibold" : "text-sm"
        )}
      >
        {valor}
      </dd>
    </div>
  )
}

function TarjetaValores({ factura }: { factura: Factura }) {
  const esquema = ESQUEMAS[factura.esquema]
  const mandato = factura.esquema === "MANDATO"
  const iva = factura.porcentajeIva
  return (
    <TarjetaFicha
      titulo="Valores"
      icono={Calculator}
      descripcion={`${esquema.etiqueta}: ${esquema.descripcion}`}
    >
      <dl className="flex flex-col">
        <Fila
          etiqueta="Periodo"
          valor={describirPeriodo(factura.periodoDesde, factura.periodoHasta)}
        />
        <Fila
          etiqueta={
            mandato ? "Comisión (base del IVA)" : "Subtotal (base del IVA)"
          }
          valor={formatearCOP(factura.subtotal)}
        />
        <Fila
          etiqueta={
            iva !== null ? `IVA (${formatearPorcentaje(iva, 0)})` : "IVA"
          }
          valor={formatearCOP(factura.iva)}
        />
        {mandato || factura.valorTerceros > 0 ? (
          <Fila
            etiqueta="Ingreso para terceros"
            ayuda="Valor de los medios: no grava IVA."
            valor={formatearCOP(factura.valorTerceros)}
          />
        ) : null}
        <Fila etiqueta="Total" valor={formatearCOP(factura.total)} destacado />
        {factura.numero ? (
          <>
            <Fila
              etiqueta="Pagado"
              ayuda="Incluye las retenciones que practicó el anunciante."
              valor={formatearCOP(factura.pagado)}
            />
            <Fila
              etiqueta="Notas crédito"
              valor={formatearCOP(factura.valorNotasCredito)}
            />
            <Fila
              etiqueta="Saldo"
              valor={formatearCOP(factura.saldo)}
              destacado
            />
          </>
        ) : null}
      </dl>
    </TarjetaFicha>
  )
}

function TarjetaConceptos({
  factura,
  lineas,
  verAsignaciones,
}: {
  factura: Factura
  lineas: readonly LineaFactura[]
  verAsignaciones: boolean
}) {
  const expedida = factura.numero !== null
  const caidas = lineas.filter((linea) => !sigueFacturable(linea.estado))
  return (
    <TarjetaFicha
      titulo="Conceptos"
      icono={ListChecks}
      descripcion={
        lineas.length > 0
          ? `${contarAsignaciones(lineas.length)}, por su valor bruto.`
          : undefined
      }
    >
      {!verAsignaciones ? (
        <p className="text-sm text-muted-foreground">
          Ver las asignaciones de la factura exige el permiso de consultar
          asignaciones.
        </p>
      ) : lineas.length === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">
          {factura.estado === "ANULADA"
            ? "Sus asignaciones quedaron libres al anularla: pueden facturarse en otro borrador."
            : "Esta factura ya no tiene asignaciones: las notas crédito las liberaron."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {expedida && caidas.length > 0 ? (
            <p className="flex gap-2 rounded-lg border border-warning/45 bg-warning/8 px-3 py-2.5 text-sm text-pretty">
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
              {caidas.length === 1
                ? "Una asignación ya no está verificada (disputa o cancelación): requiere nota crédito."
                : `${caidas.length} asignaciones ya no están verificadas (disputa o cancelación): requieren nota crédito.`}
            </p>
          ) : null}
          <ul
            aria-label="Asignaciones facturadas"
            className="-mx-5 divide-y border-y"
          >
            {lineas.map((linea) => (
              <li
                key={linea.asignacionId}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 px-5 py-3"
              >
                <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
                  <EnlaceFicha
                    href={rutaAsignacion(linea.asignacionId)}
                    permitido={verAsignaciones}
                    className="truncate text-sm font-medium"
                  >
                    {linea.oferta ?? "Asignación"}
                  </EnlaceFicha>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <MarcaPlataforma plataforma={linea.plataforma} />
                    <span className="truncate">{linea.medio ?? "Medio"}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate">
                      {linea.campana ?? "Campaña"}
                    </span>
                    {linea.verificadaAt ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          Verificada el {formatearFecha(linea.verificadaAt)}
                        </span>
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-medium cifras">
                    {formatearCOP(linea.montoBruto)}
                  </span>
                  <span className="flex flex-wrap justify-end gap-1.5">
                    <InsigniaEstado
                      catalogo={ESTADOS_ASIGNACION}
                      estado={linea.estado}
                      className="h-5 px-2 text-[0.6875rem]"
                    />
                    {sigueFacturable(linea.estado) ? null : (
                      <InsigniaTono
                        tono="peligro"
                        etiqueta={
                          expedida
                            ? "Requiere nota crédito"
                            : "Ya no es facturable"
                        }
                        className="h-5 px-2 text-[0.6875rem]"
                      />
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TarjetaFicha>
  )
}

function Paso({
  numero,
  titulo,
  children,
}: {
  numero: number
  titulo: string
  children?: ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
      >
        {numero}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm text-pretty">{titulo}</p>
        {children}
      </div>
    </li>
  )
}

function TarjetaExpedicion({
  factura,
  lineas,
  puedeGestionar,
  expedicion,
  desactualizada,
}: {
  factura: Factura
  lineas: readonly LineaFactura[]
  puedeGestionar: boolean
  expedicion: DatosExpedicion | null
  desactualizada: boolean
}) {
  const anunciante = factura.anunciante?.nombreComercial ?? "el anunciante"
  if (!puedeGestionar) {
    return (
      <TarjetaFicha titulo="Expedición" icono={FilePen}>
        <p className="text-sm text-pretty text-muted-foreground">
          Quien gestiona las facturas la expide en el software de facturación de
          AMO y registra aquí su número, CUFE y PDF.
        </p>
      </TarjetaFicha>
    )
  }
  return (
    <TarjetaFicha
      titulo="Expedición"
      icono={FilePen}
      descripcion="La factura electrónica se expide en el software de facturación de AMO, que la valida ante la DIAN."
    >
      <div className="flex flex-col gap-5">
        {desactualizada ? (
          <p className="text-sm text-pretty text-muted-foreground">
            Antes de expedirla, anula este borrador y genera otro: alguna
            asignación ya no se puede facturar.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            <Paso
              numero={1}
              titulo="Descarga el archivo de carga con el adquirente, los conceptos y los totales."
            >
              <div>
                <MenuArchivoCarga facturaId={factura.id} />
              </div>
            </Paso>
            <Paso
              numero={2}
              titulo="Expide la factura en el software de facturación y descarga su PDF."
            />
            <Paso
              numero={3}
              titulo="Registra aquí el número, las fechas, el CUFE, el total y el PDF."
            >
              <div>
                <RegistrarExpedida
                  facturaId={factura.id}
                  anunciante={anunciante}
                  totalBorrador={factura.total}
                  sugerencia={expedicion?.sugerencia ?? null}
                  resolucion={expedicion?.resolucion ?? null}
                  diasVencimiento={expedicion?.diasVencimiento ?? null}
                />
              </div>
            </Paso>
          </ol>
        )}
        <div className="border-t pt-4">
          <AnularBorrador
            facturaId={factura.id}
            anunciante={anunciante}
            asignaciones={lineas.length}
          />
        </div>
      </div>
    </TarjetaFicha>
  )
}

function TarjetaExpedida({
  factura,
  ahora,
}: {
  factura: Factura
  ahora: Date
}) {
  const vencimiento = situacionVencimiento(factura, ahora)
  return (
    <TarjetaFicha
      titulo="Factura expedida"
      icono={FileCheck}
      acciones={
        factura.tieneArchivo ? (
          <BotonDescargar
            pedido={{ tipo: "factura", facturaId: factura.id }}
            etiqueta="PDF"
            nombreAccesible={`Descargar el PDF de la factura ${factura.numero ?? ""}`.trim()}
          />
        ) : null
      }
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">Número</dt>
          <dd className="text-sm font-medium cifras">{factura.numero}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">Emisión</dt>
          <dd className="text-sm">
            {formatearDia(factura.fechaEmision, "largo")}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Vencimiento
          </dt>
          <dd className="text-sm">
            {formatearDia(factura.fechaVencimiento, "largo")}
            {vencimiento ? (
              <span
                className={cn(
                  "block text-xs",
                  vencimiento.tono === "peligro"
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {vencimiento.texto}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Resolución
          </dt>
          <dd className="text-sm">
            {factura.resolucion ? (
              <>
                {factura.resolucion.numero}
                <span className="block text-xs cifras text-muted-foreground">
                  {factura.resolucion.prefijo}
                  {factura.resolucion.rangoDesde} a {factura.resolucion.prefijo}
                  {factura.resolucion.rangoHasta}
                </span>
              </>
            ) : (
              <SinDato />
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <dt className="text-xs font-medium text-muted-foreground">CUFE</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {factura.cufe ? (
              <>
                <code
                  title={factura.cufe}
                  className="rounded-md bg-muted px-2 py-1 font-mono text-xs"
                >
                  {abreviarCodigo(factura.cufe)}
                </code>
                <BotonCopiar texto={factura.cufe} etiqueta="Copiar CUFE" />
              </>
            ) : (
              <SinDato />
            )}
          </dd>
        </div>
      </dl>
    </TarjetaFicha>
  )
}

function TarjetaAnunciante({
  factura,
  verAnunciantes,
}: {
  factura: Factura
  verAnunciantes: boolean
}) {
  const { anunciante } = factura
  if (!anunciante) {
    return (
      <TarjetaFicha titulo="Anunciante" icono={Building}>
        <p className="text-sm text-muted-foreground">
          Tu rol no permite ver los datos del anunciante.
        </p>
      </TarjetaFicha>
    )
  }
  const identificacion =
    anunciante.paisIso2 === "CO"
      ? formatearNit(anunciante.nit, anunciante.digitoVerificacion)
      : anunciante.identificacionExtranjera
  const { facturacion } = anunciante
  const regimen = facturacion.regimen
    ? ((ETIQUETAS_REGIMEN as Readonly<Record<string, string>>)[
        facturacion.regimen
      ] ?? facturacion.regimen)
    : null
  const responsabilidades = [
    facturacion.granContribuyente ? "Gran contribuyente" : null,
    facturacion.autorretenedor ? "Autorretenedor" : null,
  ].filter(Boolean)
  const cartera = `${rutaAnunciante(anunciante.id)}?pestana=cartera` as Route
  return (
    <TarjetaFicha titulo="Anunciante" icono={Building}>
      <div className="flex flex-col gap-4">
        <dl className="grid gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              Razón social
            </dt>
            <dd className="text-sm">
              <EnlaceFicha
                href={rutaAnunciante(anunciante.id)}
                permitido={verAnunciantes}
                className="font-medium"
              >
                {anunciante.razonSocial}
              </EnlaceFicha>
              {anunciante.nombreComercial !== anunciante.razonSocial ? (
                <span className="block text-xs text-muted-foreground">
                  {anunciante.nombreComercial}
                </span>
              ) : null}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              {anunciante.paisIso2 === "CO" ? "NIT" : "Identificación"}
            </dt>
            <dd className="text-sm cifras">{identificacion ?? <SinDato />}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              Correo de facturación
            </dt>
            <dd className="text-sm break-all">
              {facturacion.email ?? <SinDato>Sin registrar</SinDato>}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              Régimen
            </dt>
            <dd className="text-sm">
              {regimen ?? <SinDato>Sin registrar</SinDato>}
              {responsabilidades.length > 0 ? (
                <span className="block text-xs text-muted-foreground">
                  {responsabilidades.join(" · ")}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {verAnunciantes ? (
            <EnlaceBoton variant="outline" size="sm" href={cartera}>
              Cartera del anunciante
            </EnlaceBoton>
          ) : null}
          <EnlaceBoton
            variant="ghost"
            size="sm"
            href={rutaFacturasFiltradas({ anunciante: anunciante.id })}
          >
            Sus facturas
          </EnlaceBoton>
        </div>
      </div>
    </TarjetaFicha>
  )
}

function TarjetaPagos({
  factura,
  pagos,
  puedeRegistrar,
}: {
  factura: Factura
  pagos: readonly PagoFactura[]
  puedeRegistrar: boolean
}) {
  const conCobro = admiteCobro(factura.estado) && factura.fechaEmision
  return (
    <TarjetaFicha
      titulo="Pagos"
      icono={HandCoins}
      descripcion={
        pagos.length > 0
          ? "Cada pago con las retenciones del anunciante y su soporte."
          : undefined
      }
      acciones={
        conCobro && puedeRegistrar && factura.numero && factura.fechaEmision ? (
          <RegistrarPago
            facturaId={factura.id}
            numero={factura.numero}
            anunciante={factura.anunciante?.nombreComercial ?? "el anunciante"}
            saldo={factura.saldo}
            fechaEmision={factura.fechaEmision}
          />
        ) : null
      }
    >
      {pagos.length === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">
          {conCobro
            ? "Aún no hay pagos. Cuando el anunciante pague, regístralo con su soporte: el saldo y el estado se actualizan solos."
            : "Esta factura no tiene pagos registrados."}
        </p>
      ) : (
        <ul aria-label="Pagos registrados" className="-mx-5 -my-2 divide-y">
          {pagos.map((pago) => (
            <li
              key={pago.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3"
            >
              <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {formatearDia(pago.fechaPago, "largo")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {etiquetaMedioPago(pago.medioPago)}
                  {pago.referencia ? ` · ${pago.referencia}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-sm font-medium cifras">
                  {formatearCOP(pago.monto)}
                </span>
                {pago.retenciones > 0 ? (
                  <span className="text-xs cifras text-muted-foreground">
                    + {formatearCOP(pago.retenciones)} en retenciones
                  </span>
                ) : null}
              </div>
              {pago.tieneSoporte ? (
                <BotonDescargar
                  pedido={{
                    tipo: "pago",
                    facturaId: factura.id,
                    pagoId: pago.id,
                  }}
                  etiqueta="Soporte"
                  nombreAccesible={`Descargar el soporte del pago del ${formatearDia(pago.fechaPago, "largo")}`}
                  variante="ghost"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </TarjetaFicha>
  )
}

function TarjetaNotas({
  factura,
  notas,
  lineas,
  puedeRegistrar,
}: {
  factura: Factura
  notas: readonly NotaCreditoFactura[]
  lineas: readonly LineaFactura[]
  puedeRegistrar: boolean
}) {
  const conCobro = admiteCobro(factura.estado)
  return (
    <TarjetaFicha
      titulo="Notas crédito"
      icono={FileMinus}
      descripcion="Una factura expedida no se anula: se corrige con la nota crédito emitida en el software de facturación."
      acciones={
        conCobro && puedeRegistrar && factura.numero && factura.fechaEmision ? (
          <RegistrarNotaCredito
            facturaId={factura.id}
            numero={factura.numero}
            anunciante={factura.anunciante?.nombreComercial ?? "el anunciante"}
            saldo={factura.saldo}
            pagado={factura.pagado}
            fechaEmision={factura.fechaEmision}
            lineas={lineas}
          />
        ) : null
      }
    >
      {notas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin notas crédito.</p>
      ) : (
        <ul
          aria-label="Notas crédito registradas"
          className="-mx-5 -my-2 divide-y"
        >
          {notas.map((nota) => (
            <li
              key={nota.id}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-3"
            >
              <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="cifras">{nota.numero}</span>
                  {nota.anulaFactura ? (
                    <InsigniaTono
                      tono="neutro"
                      etiqueta="Anuló la factura"
                      className="h-5 px-2 text-[0.6875rem]"
                    />
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatearDia(nota.fechaEmision, "largo")} ·{" "}
                  <span title={nota.cude} className="font-mono">
                    CUDE {abreviarCodigo(nota.cude)}
                  </span>
                </span>
                <p className="text-sm text-pretty text-muted-foreground">
                  {nota.motivo}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-sm font-medium cifras">
                  − {formatearCOP(nota.valor)}
                </span>
                <BotonDescargar
                  pedido={{
                    tipo: "nota",
                    facturaId: factura.id,
                    notaId: nota.id,
                  }}
                  etiqueta="PDF"
                  nombreAccesible={`Descargar el PDF de la nota crédito ${nota.numero}`}
                  variante="ghost"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </TarjetaFicha>
  )
}

// ── Ficha ────────────────────────────────────────────────────────────────────

/**
 * Ficha de una factura al anunciante (LIQ-008): estado y qué toca hacer,
 * valores según el esquema, conceptos (una cancelada o en disputa pide nota
 * crédito), expedición del borrador o datos de la factura expedida, el
 * anunciante, los pagos y las notas crédito, con las acciones que el rol
 * permite. La BD vuelve a comprobarlo todo.
 */
export function FichaFactura({
  factura,
  lineas,
  pagos,
  notas,
  permisos,
  expedicion,
  ahora,
}: FichaFacturaProps) {
  const nombre = factura.anunciante?.nombreComercial ?? "Anunciante"
  const borrador = factura.estado === "BORRADOR"
  const expedida = factura.numero !== null
  const desactualizada =
    borrador && lineas.some((linea) => !sigueFacturable(linea.estado))
  const notaQueAnula = notas.find((nota) => nota.anulaFactura) ?? null

  return (
    <div className="flex flex-col gap-6">
      <CabeceraFicha
        volver={{ href: RUTA_FACTURAS, titulo: "Facturas" }}
        antetitulo={expedida ? "Factura de venta" : "Borrador de factura"}
        titulo={factura.numero ?? `Borrador para ${nombre}`}
        subtitulo={
          <>
            {expedida ? `${nombre} · ` : ""}
            {alcanceFactura(factura.campana?.nombre ?? null)}
          </>
        }
        distintivos={
          <>
            <InsigniaEstado
              catalogo={ESTADOS_FACTURA}
              estado={factura.estado}
            />
            <InsigniaTono
              tono="neutro"
              etiqueta={ESQUEMAS[factura.esquema].etiqueta}
              titulo={ESQUEMAS[factura.esquema].descripcion}
            />
            {factura.esDemo ? <InsigniaDemo /> : null}
          </>
        }
        lateral={
          <>
            <span>Generada el {formatearFecha(factura.creadaAt, "largo")}</span>
            {factura.fechaEmision ? (
              <span>
                Emitida el {formatearDia(factura.fechaEmision, "largo")}
              </span>
            ) : null}
            {factura.fechaVencimiento ? (
              <span>
                Vence el {formatearDia(factura.fechaVencimiento, "largo")}
              </span>
            ) : null}
          </>
        }
        aviso={
          <EstadoFactura
            factura={factura}
            desactualizada={desactualizada}
            notaQueAnula={notaQueAnula}
            ahora={ahora}
          />
        }
      />

      <div className={COLUMNAS_FICHA_FACTURA}>
        <div className="flex min-w-0 flex-col gap-4">
          <TarjetaValores factura={factura} />
          <TarjetaConceptos
            factura={factura}
            lineas={lineas}
            verAsignaciones={permisos.verAsignaciones}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {borrador ? (
            <TarjetaExpedicion
              factura={factura}
              lineas={lineas}
              puedeGestionar={permisos.gestionar}
              expedicion={expedicion}
              desactualizada={desactualizada}
            />
          ) : null}
          {expedida ? (
            <TarjetaExpedida factura={factura} ahora={ahora} />
          ) : null}
          <TarjetaAnunciante
            factura={factura}
            verAnunciantes={permisos.verAnunciantes}
          />
        </div>
      </div>

      {expedida ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TarjetaPagos
            factura={factura}
            pagos={pagos}
            puedeRegistrar={permisos.registrarPago}
          />
          <TarjetaNotas
            factura={factura}
            notas={notas}
            lineas={lineas}
            puedeRegistrar={permisos.gestionar}
          />
        </div>
      ) : null}
    </div>
  )
}
