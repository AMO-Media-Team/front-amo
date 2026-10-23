"use client"

import {
  ArrowRight,
  CircleCheck,
  CircleSlash,
  HandCoins,
  Layers,
  TriangleAlert,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import {
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { PieAcciones } from "@/components/layout/pie-acciones"
import { Button } from "@/components/ui/button"
import { RUTAS_MI_MEDIO } from "@/features/mi-medio/alta"
import { ESTADOS_PARA_MEDIO } from "@/features/mis-campanas/estados"
import { rutaAsignacionMedio } from "@/features/mis-campanas/rutas"
import { AvisoFicha } from "@/features/operacion/components/ficha"
import { contar, formatearHandle } from "@/features/operacion/formato"
import { formatearCOP, formatearFecha } from "@/lib/format"

import { aceptarOferta } from "../actions"
import { falloInesperadoAceptar } from "../errores"
import { debeRenovarClave, nuevaClaveIdempotencia } from "../idempotencia"
import {
  avisoAceptada,
  avisoCuenta,
  cabeEnTope,
  type ConsumoTopeMedio,
  cuentaPorDefecto,
  type DisponibilidadAceptar,
  otraCuentaEnTope,
  topeSuperado,
} from "../presentacion"
import { RUTA_OFERTAS_MEDIO } from "../rutas"
import type {
  AsignacionEnOferta,
  CuentaCotizada,
  DetalleOfertaMedio,
  FalloAceptar,
  ResultadoAceptar,
} from "../tipos"
import { DialogoAceptar } from "./dialogo-aceptar"
import { DialogoNoMeInteresa } from "./dialogo-no-me-interesa"
import { DetallePago, SeleccionCuenta } from "./pago-oferta"

/** Título del aviso que recibe el foco si el botón «Aceptar» desaparece. */
export const ID_ESTADO_OFERTA = "estado-oferta"

type Dialogo = "aceptar" | "rechazar" | null

function frasesAsignacion(asignacion: AsignacionEnOferta): string {
  const partes = [
    asignacion.aceptadaAt
      ? `La aceptaste el ${formatearFecha(asignacion.aceptadaAt)}`
      : "La aceptaste",
  ]
  if (asignacion.handle)
    partes.push(`con ${formatearHandle(asignacion.handle)}`)
  const inicio = partes.join(" ")
  const pago =
    asignacion.montoMedio !== null
      ? ` Recibes ${formatearCOP(asignacion.montoMedio)}: el precio quedó congelado.`
      : ""
  return `${inicio}.${pago} Estado: ${ESTADOS_PARA_MEDIO[asignacion.estado].etiqueta.toLowerCase()}.`
}

/** Aviso del estado de la oferta para este medio (aceptada, cerrada, varios cupos). */
function EstadoOferta({
  disponibilidad,
}: {
  disponibilidad: DisponibilidadAceptar
}) {
  if (disponibilidad.tipo === "aceptada") {
    return (
      <AvisoFicha
        tono="exito"
        icono={CircleCheck}
        titulo="Ya aceptaste esta oferta"
      >
        <p>{frasesAsignacion(disponibilidad.asignacion)}</p>
        <EnlaceBoton
          href={rutaAsignacionMedio(disponibilidad.asignacion.id)}
          variant="outline"
          size="sm"
          className="mt-2 w-fit"
        >
          Ver en Mis campañas
          <ArrowRight data-icon="inline-end" aria-hidden />
        </EnlaceBoton>
      </AvisoFicha>
    )
  }
  if (disponibilidad.tipo === "no_disponible") {
    return (
      <AvisoFicha
        tono="aviso"
        icono={CircleSlash}
        titulo={disponibilidad.titulo}
      >
        <p>{disponibilidad.motivo}</p>
        {disponibilidad.enlace ? (
          <EnlaceBoton
            href={disponibilidad.enlace.href as Route}
            variant="outline"
            size="sm"
            className="mt-2 w-fit"
          >
            {disponibilidad.enlace.texto}
          </EnlaceBoton>
        ) : null}
      </AvisoFicha>
    )
  }
  if (disponibilidad.previas.length > 0) {
    return (
      <AvisoFicha
        tono="info"
        icono={Layers}
        titulo={`Ya tienes ${contar(disponibilidad.previas.length, "cupo", "cupos")} en esta oferta`}
      >
        <p>Esta oferta admite varios cupos por medio: puedes tomar otro.</p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {disponibilidad.previas.map((previa) => (
            <li key={previa.id}>
              <EnlaceBoton
                href={rutaAsignacionMedio(previa.id)}
                variant="link"
                size="sm"
                className="h-auto px-0"
              >
                {previa.handle ? formatearHandle(previa.handle) : "Tu cupo"}
                {" · "}
                {ESTADOS_PARA_MEDIO[previa.estado].etiqueta}
              </EnlaceBoton>
            </li>
          ))}
        </ul>
      </AvisoFicha>
    )
  }
  return null
}

export interface DecisionOfertaProps {
  oferta: Pick<
    DetalleOfertaMedio,
    "id" | "titulo" | "ventanaFin" | "fechaLimiteAceptacion" | "cuentas"
  >
  disponibilidad: DisponibilidadAceptar
  consumo: ConsumoTopeMedio | null
  /** Tiene `ofertas.aceptar` (aceptar y «No me interesa»). */
  puedeAceptar: boolean
  /** Secciones fijas del detalle (qué publicar, fechas, condiciones). */
  children: ReactNode
}

/**
 * La decisión del medio sobre la oferta (MED-009, MED-010): con qué cuenta
 * publica y cuánto recibe, y el pie fijo con «Aceptar» y «No me interesa».
 *
 * Idempotencia: una clave nueva al montar y tras cada respuesta firme de la
 * BD; la MISMA si la respuesta no llegó (reintento por red). Un doble toque no
 * envía dos solicitudes (el botón queda ocupado) y, aunque las enviara, la BD
 * devuelve la misma asignación.
 *
 * Tope anual del nivel (MED-007): depende del pago, así que se mira por
 * cuenta. Si la elegida lo superaría, «Aceptar» queda deshabilitado (enfocable
 * y descrito por el aviso) y se sugiere otra cuenta que sí cabe; por defecto
 * se elige la que más paga entre las que caben. Si la BD responde
 * `AMO_TOPE_NIVEL` y otra cuenta cotizada cabe, la oferta no se bloquea
 * entera: ese pago (y los mayores) quedan marcados como fuera del tope.
 *
 * Participación máxima del medio en la campaña (`impedimentos_aceptar`):
 * también por cuenta y con el mismo patrón (botón descrito por el motivo,
 * otra cuenta sugerida, la cuenta por defecto la evita). La exclusividad por
 * sector no depende de la cuenta: `disponibilidadAceptar` ya la da como no
 * disponible.
 *
 * Tras aceptar, el aviso compara el pago congelado con el mostrado y, si
 * cambió mientras decidía, lo dice con el monto real.
 */
export function DecisionOferta({
  oferta,
  disponibilidad,
  consumo,
  puedeAceptar,
  children,
}: DecisionOfertaProps) {
  const router = useRouter()
  const idCuentas = useId()
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [elegida, setElegida] = useState<string | null>(null)
  const [clave, setClave] = useState(nuevaClaveIdempotencia)
  const [fallo, setFallo] = useState<FalloAceptar | null>(null)
  /** Respuesta firme que impide aceptar: queda a la vista hasta salir. */
  const [bloqueo, setBloqueo] = useState<FalloAceptar | null>(null)
  /** Menor pago que la BD rechazó por el tope anual (`AMO_TOPE_NIVEL`). */
  const [topeRechazado, setTopeRechazado] = useState<number | null>(null)
  const [pendiente, iniciar] = useTransition()
  const botonAceptar = useRef<HTMLButtonElement>(null)
  const idTope = useId()

  const abierta = disponibilidad.tipo === "disponible"
  const disponible = abierta && bloqueo === null
  const cotizadas = abierta ? disponibilidad.cuentas : []
  const cabe = (opcion: CuentaCotizada) =>
    cabeEnTope(opcion, consumo, topeRechazado)
  const cuenta = abierta ? cuentaPorDefecto(cotizadas, elegida, cabe) : null
  const monto = cuenta?.cotizacion?.montoMedio ?? null
  const tope = disponible ? avisoCuenta(cuenta, consumo, topeRechazado) : null
  const superaTope = tope?.tipo === "bloqueo"
  const otraCuenta = superaTope
    ? otraCuentaEnTope(cotizadas, cuenta, cabe)
    : null
  const mostrarPago =
    disponibilidad.tipo !== "aceptada" && oferta.cuentas.length > 0
  const puedeRechazar =
    puedeAceptar && bloqueo === null && disponibilidadQuitable(disponibilidad)

  // Tras un fallo que bloquea, el botón «Aceptar» desaparece: el foco va al
  // título del aviso que queda en la ficha (no a su enlace: así se lee qué
  // pasó). Se decide al cerrar, con una función estable que lee la referencia.
  const enfocarEstado = useRef(false)
  const focoAlCerrar = useCallback(
    () =>
      enfocarEstado.current ? document.getElementById(ID_ESTADO_OFERTA) : null,
    []
  )

  /** Con otra cuenta sí cabe en el tope: la elige y lleva el foco a «Aceptar». */
  function usarCuenta(opcion: CuentaCotizada) {
    setElegida(opcion.cuentaSocialId)
    botonAceptar.current?.focus()
  }

  /**
   * Tras un `AMO_TOPE_NIVEL` con la cuenta elegida: el menor pago rechazado y
   * otra cuenta cotizada que sí cabe (o `null`).
   */
  function trasRechazoTope(): {
    rechazado: number
    otra: CuentaCotizada | null
  } | null {
    if (!cuenta || monto === null) return null
    const rechazado = Math.min(monto, topeRechazado ?? monto)
    const otra = otraCuentaEnTope(cotizadas, cuenta, (opcion) =>
      cabeEnTope(opcion, consumo, rechazado)
    )
    return { rechazado, otra }
  }

  function cambiarDialogoAceptar(abierto: boolean) {
    setDialogo(abierto ? "aceptar" : null)
    if (abierto) return
    // El tope del nivel depende del pago: si otra cuenta cotizada cabe, no se
    // bloquea la oferta entera. La cuenta rechazada queda elegida (con el
    // aviso y la sugerencia) y el foco vuelve a «Aceptar», que lo describe.
    const tras = fallo?.codigo === "AMO_TOPE_NIVEL" ? trasRechazoTope() : null
    if (cuenta && tras?.otra) {
      setTopeRechazado(tras.rechazado)
      setElegida(cuenta.cuentaSocialId)
      setFallo(null)
      return
    }
    if (fallo?.bloquea) {
      // Ya no se puede aceptar: el aviso queda en la ficha (recibe el foco) y
      // la ficha se actualiza con el estado vigente.
      enfocarEstado.current = true
      setBloqueo(fallo)
      router.refresh()
    }
    setFallo(null)
  }

  function confirmarAceptar() {
    if (!cuenta || pendiente) return
    setFallo(null)
    iniciar(async () => {
      let resultado: ResultadoAceptar | null
      try {
        resultado = await aceptarOferta({
          ofertaId: oferta.id,
          cuentaSocialId: cuenta.cuentaSocialId,
          claveIdempotencia: clave,
        })
      } catch {
        // La respuesta no llegó: se reintenta con la misma clave.
        resultado = null
      }
      if (debeRenovarClave(resultado)) setClave(nuevaClaveIdempotencia())
      if (resultado?.ok) {
        const aviso = avisoAceptada({
          mostrado: monto,
          congelado: resultado.datos.montoMedio,
          ventanaFin: oferta.ventanaFin,
        })
        toast.success(aviso.titulo, {
          description: aviso.descripcion,
          // Un pago distinto del confirmado se lee con calma.
          ...(aviso.cambioElPago ? { duration: 15_000 } : {}),
        })
        if (tope?.tipo === "alerta") {
          toast.warning(tope.titulo, {
            description: tope.mensaje,
            action: {
              label: "Cómo subir de nivel",
              onClick: () => router.push(RUTAS_MI_MEDIO.nivel),
            },
          })
        }
        router.push(rutaAsignacionMedio(resultado.datos.asignacionId))
        return
      }
      const respuesta = resultado ?? falloInesperadoAceptar()
      // Superaría el tope con esta cuenta, pero otra sí cabe: el aviso lo dice.
      const otra =
        respuesta.codigo === "AMO_TOPE_NIVEL" ? trasRechazoTope()?.otra : null
      setFallo(
        otra?.cotizacion
          ? {
              ...respuesta,
              titulo: "Con esta cuenta superarías tu tope anual",
              error: `Con ${formatearHandle(otra.handle)} recibes ${formatearCOP(otra.cotizacion.montoMedio)} y sí cabe en lo que tu nivel permite recibir este año: puedes elegirla al cerrar este aviso.`,
            }
          : respuesta
      )
    })
  }

  return (
    <>
      <div className="empty:hidden">
        {bloqueo ? (
          <AvisoFicha
            tono="peligro"
            icono={CircleSlash}
            titulo={
              <span
                id={ID_ESTADO_OFERTA}
                tabIndex={-1}
                className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {bloqueo.titulo}
              </span>
            }
          >
            <p>{bloqueo.error}</p>
            {bloqueo.enlace ? (
              <EnlaceBoton
                href={bloqueo.enlace.href as Route}
                variant="outline"
                size="sm"
                className="mt-2 w-fit"
              >
                {bloqueo.enlace.texto}
              </EnlaceBoton>
            ) : null}
          </AvisoFicha>
        ) : (
          <EstadoOferta disponibilidad={disponibilidad} />
        )}
      </div>

      {mostrarPago ? (
        <section
          aria-labelledby={idCuentas}
          className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
        >
          <header className="flex items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <HandCoins className="size-4" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 id={idCuentas} className="text-[0.9375rem] font-semibold">
                {abierta && disponibilidad.cuentas.length > 1
                  ? "¿Con qué cuenta publicas?"
                  : "Lo que recibes"}
              </h2>
              <p className="text-sm text-muted-foreground">
                El pago depende de la franja de seguidores de tu cuenta y de sus
                multiplicadores.
              </p>
            </div>
          </header>
          <SeleccionCuenta
            cuentas={oferta.cuentas}
            elegida={cuenta?.cuentaSocialId ?? null}
            onElegir={setElegida}
            deshabilitado={pendiente || !disponible}
            idEtiqueta={idCuentas}
            fueraDeTope={
              disponible
                ? (opcion) => topeSuperado(opcion, consumo, topeRechazado)
                : undefined
            }
          />
          {cuenta?.cotizacion ? (
            <DetallePago
              cotizacion={cuenta.cotizacion}
              handle={cuenta.handle}
            />
          ) : null}
          {tope ? (
            <AvisoFicha
              tono={superaTope ? "peligro" : "aviso"}
              icono={TriangleAlert}
              titulo={<span id={`${idTope}-titulo`}>{tope.titulo}</span>}
            >
              <p id={`${idTope}-mensaje`}>{tope.mensaje}</p>
              {otraCuenta?.cotizacion ? (
                <p id={`${idTope}-otra`} className="mt-1">
                  Con {formatearHandle(otraCuenta.handle)} recibes{" "}
                  <span className="font-medium cifras">
                    {formatearCOP(otraCuenta.cotizacion.montoMedio)}
                  </span>{" "}
                  {tope.tope === "nivel"
                    ? "y sí cabe en tu tope."
                    : "y con ella sí puedes aceptarla."}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2 empty:hidden">
                {otraCuenta ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => usarCuenta(otraCuenta)}
                  >
                    Publicar con {formatearHandle(otraCuenta.handle)}
                  </Button>
                ) : null}
                {/* Subir de nivel solo amplía el tope anual, no el de la campaña. */}
                {tope.tope === "nivel" ? (
                  <EnlaceBoton
                    href={RUTAS_MI_MEDIO.nivel}
                    variant="outline"
                    size="sm"
                    className="w-fit"
                  >
                    Cómo subir de nivel
                  </EnlaceBoton>
                ) : null}
              </div>
            </AvisoFicha>
          ) : null}
        </section>
      ) : null}

      {children}

      <PieAcciones
        etiqueta="Decisión sobre la oferta"
        nota={
          bloqueo ? (
            <span className="font-medium text-muted-foreground">
              {bloqueo.titulo}
            </span>
          ) : (
            <NotaPie
              disponibilidad={disponibilidad}
              monto={monto}
              handle={cuenta?.handle ?? null}
              motivo={superaTope ? tope.titulo : null}
            />
          )
        }
      >
        {disponible && puedeAceptar ? (
          <>
            {puedeRechazar ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setDialogo("rechazar")}
                disabled={pendiente}
              >
                No me interesa
              </Button>
            ) : null}
            <Button
              ref={botonAceptar}
              size="lg"
              onClick={() => setDialogo("aceptar")}
              disabled={!cuenta || pendiente || superaTope}
              // Enfocable aunque esté deshabilitado por el tope: el aviso dice
              // por qué (no hay `:disabled` que lo atenúe).
              focusableWhenDisabled={superaTope}
              aria-describedby={
                superaTope
                  ? [
                      `${idTope}-titulo`,
                      `${idTope}-mensaje`,
                      otraCuenta?.cotizacion ? `${idTope}-otra` : null,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  : undefined
              }
              className="data-disabled:cursor-not-allowed data-disabled:opacity-50"
            >
              Aceptar
            </Button>
          </>
        ) : disponibilidad.tipo === "aceptada" && bloqueo === null ? (
          <EnlaceBoton
            href={rutaAsignacionMedio(disponibilidad.asignacion.id)}
            size="lg"
          >
            Ver en Mis campañas
            <ArrowRight data-icon="inline-end" aria-hidden />
          </EnlaceBoton>
        ) : (
          <EnlaceBoton href={RUTA_OFERTAS_MEDIO} variant="outline" size="lg">
            Ver otras ofertas
          </EnlaceBoton>
        )}
      </PieAcciones>

      {abierta && cuenta && monto !== null ? (
        <DialogoAceptar
          abierto={dialogo === "aceptar"}
          onAbiertoChange={cambiarDialogoAceptar}
          titulo={oferta.titulo}
          ventanaFin={oferta.ventanaFin}
          fechaLimiteAceptacion={oferta.fechaLimiteAceptacion}
          handle={cuenta.handle}
          monto={monto}
          pendiente={pendiente}
          fallo={fallo}
          onConfirmar={confirmarAceptar}
          focoAlCerrar={focoAlCerrar}
        />
      ) : null}
      {puedeRechazar ? (
        <DialogoNoMeInteresa
          abierto={dialogo === "rechazar"}
          onAbiertoChange={(abierto) => setDialogo(abierto ? "rechazar" : null)}
          ofertaId={oferta.id}
          titulo={oferta.titulo}
        />
      ) : null}
    </>
  )
}

/**
 * «No me interesa» solo si aún no tiene cupos en la oferta: con una
 * asignación en pie, rechazar la desistiría (eso se hace desde Mis campañas,
 * con motivo y por asignación).
 */
function disponibilidadQuitable(
  disponibilidad: DisponibilidadAceptar
): boolean {
  return (
    disponibilidad.tipo === "disponible" && disponibilidad.previas.length === 0
  )
}

function NotaPie({
  disponibilidad,
  monto,
  handle,
  motivo,
}: {
  disponibilidad: DisponibilidadAceptar
  monto: number | null
  handle: string | null
  /** Por qué no puede aceptar con la cuenta elegida (el tope anual). */
  motivo: string | null
}) {
  if (motivo) {
    return <span className="font-medium text-muted-foreground">{motivo}</span>
  }
  if (disponibilidad.tipo === "aceptada") {
    return <span className="font-medium">Ya aceptaste esta oferta</span>
  }
  if (disponibilidad.tipo === "no_disponible") {
    return (
      <span className="font-medium text-muted-foreground">
        {disponibilidad.titulo}
      </span>
    )
  }
  if (monto === null) return null
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span>
        Recibes{" "}
        <strong className="text-base font-bold cifras">
          {formatearCOP(monto)}
        </strong>
      </span>
      {handle ? (
        <span className="truncate text-xs text-muted-foreground">
          con {formatearHandle(handle)}
        </span>
      ) : null}
    </span>
  )
}
