import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  FileText,
  Gauge,
  Info,
  Layers,
  type LucideIcon,
  Route as IconoRuta,
  TriangleAlert,
  Trophy,
} from "lucide-react"
import { type ReactNode, useId } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TarjetaPanel } from "@/features/dashboard/components/tarjeta-panel"
import { ProgresoTopeAnual } from "@/features/dashboard/medio/components/tarjetas-medio"
import {
  InsigniaNivel,
  InsigniaTono,
} from "@/features/operacion/components/distintivos"
import { FICHAS_DOCUMENTO } from "@/features/documentos-medio/catalogo"
import { formatearCOPCompacto, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { RUTAS_MI_MEDIO, rutaDocumentosDelNivel } from "../alta"
import {
  AYUDA_DOCUMENTO,
  avisoTope,
  type EstadoConsumo,
  type ObjetivoNivel,
  tituloNivel,
  type VistaNivel as DatosVistaNivel,
  vistaNivel,
} from "../nivel"
import { notaRequisito, SITUACIONES_DOCUMENTO } from "../presentacion"
import { DOCUMENTO_FACULTATIVO, type EstadoRequisito } from "../requisitos"
import type { ConsumoTope, NivelVerificacion, ResumenMiMedio } from "../tipos"

/** Ancla de «Cómo subir de nivel» (el inicio del medio enlaza aquí). */
export const ID_SUBIR_DE_NIVEL = "subir-de-nivel"
const TARJETA = "rounded-2xl"

/** «tope de $30 M al año» o «sin tope anual» (en minúscula, para frases). */
function textoTope(nivel: NivelVerificacion): string {
  return nivel.topeAnual === null
    ? "sin tope anual"
    : `tope de ${formatearCOPCompacto(nivel.topeAnual)} al año`
}

function valorTope(nivel: NivelVerificacion): string {
  return nivel.topeAnual === null
    ? "Sin tope"
    : `${formatearCOPCompacto(nivel.topeAnual)} al año`
}

// ── Documentos ──────────────────────────────────────────────────────────────

/**
 * Documentos con su estado y, si se pide, cómo conseguir cada uno. La prueba
 * de vida faltante se marca como opcional (puede hacerse por videollamada).
 */
function ListaRequisitos({
  requisitos,
  conAyuda = false,
}: {
  requisitos: readonly EstadoRequisito[]
  conAyuda?: boolean
}) {
  return (
    <ul className="flex flex-col divide-y">
      {requisitos.map((requisito) => {
        const { etiqueta, tono } = SITUACIONES_DOCUMENTO[requisito.situacion]
        const opcional =
          requisito.tipo === DOCUMENTO_FACULTATIVO &&
          requisito.situacion === "falta"
        const nota = notaRequisito(requisito)
        return (
          <li
            key={requisito.tipo}
            className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
          >
            <span
              aria-hidden
              className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
            >
              <FileText className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">
                  {/* El mismo nombre de la tarjeta en «Mis documentos». */}
                  {FICHAS_DOCUMENTO[requisito.tipo].titulo}
                </span>
                <InsigniaTono
                  tono={opcional ? "neutro" : tono}
                  etiqueta={opcional ? "Opcional" : etiqueta}
                  className="h-5"
                />
              </div>
              {nota ? (
                <p className="text-xs break-words text-muted-foreground">
                  {nota}
                </p>
              ) : null}
              {conAyuda && requisito.situacion !== "aprobado" ? (
                <p className="text-xs text-pretty text-muted-foreground">
                  {AYUDA_DOCUMENTO[requisito.tipo]}
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── Nivel actual y tope ─────────────────────────────────────────────────────

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm font-medium">{valor}</dd>
    </div>
  )
}

function TarjetaNivelActual({
  vista,
  nivelInicial,
}: {
  vista: DatosVistaNivel
  nivelInicial: NivelVerificacion | null
}) {
  const { numero, actual } = vista
  if (!actual) {
    return (
      <TarjetaPanel
        titulo="Aún no tienes nivel"
        icono={Gauge}
        className={TARJETA}
      >
        <p className="text-sm text-pretty text-muted-foreground">
          El equipo de AMO te asigna el nivel cuando verifica tu medio.
          {nivelInicial
            ? ` Empiezas en el nivel 1 (${nivelInicial.nombre.toLowerCase()}), con ${textoTope(nivelInicial)} en ofertas aceptadas.`
            : null}
        </p>
      </TarjetaPanel>
    )
  }
  return (
    <TarjetaPanel titulo="Tu nivel" icono={BadgeCheck} className={TARJETA}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 font-heading text-xl font-bold cifras text-primary ring-1 ring-primary/20"
          >
            {numero}
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="font-heading text-lg leading-snug font-semibold">
              {tituloNivel(actual.nivel, numero)}
            </p>
            <InsigniaNivel nivel={numero} className="text-muted-foreground" />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <Cifra etiqueta="Tope anual" valor={valorTope(actual.nivel)} />
          {actual.nivel.topeAnual === null ? null : (
            <Cifra
              etiqueta="Te avisamos desde"
              valor={`el ${formatearPorcentaje(actual.nivel.porcentajeAlerta, 0)} del tope`}
            />
          )}
        </dl>
      </div>
    </TarjetaPanel>
  )
}

function Consumo({
  consumo,
  nivel,
}: {
  consumo: EstadoConsumo
  nivel: string
}) {
  switch (consumo.tipo) {
    case "con-tope":
      return (
        <ProgresoTopeAnual
          progreso={consumo.progreso}
          consumido={consumo.consumido}
          tope={consumo.tope}
          nivel={`${nivel} · año ${consumo.anio}`}
          alerta={consumo.alerta}
          bloqueo={consumo.bloqueo}
          className={TARJETA}
        />
      )
    case "sin-tope":
      return (
        <TarjetaPanel
          titulo="Tope anual de tu nivel"
          icono={Gauge}
          className={TARJETA}
        >
          <p className="text-sm text-muted-foreground">
            Tu nivel no tiene tope anual: puedes aceptar todas las ofertas que
            quieras.
          </p>
        </TarjetaPanel>
      )
    case "sin-datos":
      return (
        <TarjetaPanel
          titulo="Tope anual de tu nivel"
          icono={Gauge}
          className={TARJETA}
        >
          <p className="flex gap-2 text-sm text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            No pudimos consultar cuánto llevas de tu tope este año. Vuelve a
            intentarlo en unos minutos.
          </p>
        </TarjetaPanel>
      )
    case "sin-nivel":
      return null
  }
}

// ── Camino al siguiente nivel ───────────────────────────────────────────────

function Paso({
  icono: Icono,
  children,
}: {
  icono: LucideIcon
  children: ReactNode
}) {
  return (
    <p className="flex gap-2.5 text-sm text-pretty">
      <Icono aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </p>
  )
}

function CaminoNivel({
  objetivo,
  numeroActual,
  faltaMetodoPago,
}: {
  objetivo: ObjetivoNivel
  numeroActual: number
  faltaMetodoPago: boolean
}) {
  const idTitulo = useId()
  const idDocumentos = useId()
  const durante = numeroActual < 1
  const { nivel, guia, nuevos, cargado } = objetivo
  const titulo = durante
    ? "Cómo obtener tu nivel 1"
    : `Cómo subir al nivel ${nivel.nivel}`
  return (
    <section
      id={ID_SUBIR_DE_NIVEL}
      aria-labelledby={idTitulo}
      className="flex scroll-mt-24 flex-col gap-5 rounded-2xl border bg-card p-4 sm:p-6"
    >
      <header className="flex flex-col gap-1.5">
        <h2
          id={idTitulo}
          className="flex items-center gap-2 font-heading text-lg leading-snug font-semibold"
        >
          <IconoRuta aria-hidden className="size-5 text-primary" />
          {titulo}
        </h2>
        <p className="text-sm text-muted-foreground">
          {tituloNivel(nivel, nivel.nivel)}: {textoTope(nivel)}
          {nivel.topeAnual === null ? "." : " en ofertas aceptadas."}
        </p>
      </header>

      {cargado ? (
        <Alert role="note" className="border-success/30 bg-success/8">
          <CircleCheck aria-hidden className="text-success" />
          <AlertTitle>Ya cargaste lo necesario</AlertTitle>
          <AlertDescription>
            {durante
              ? "Cuando tengas el resto del alta, envía tu medio a verificación desde Mi medio."
              : "El equipo de AMO revisa tus documentos y te avisará cuando suba tu nivel."}
          </AlertDescription>
        </Alert>
      ) : null}

      {guia ? (
        <div className="flex flex-col gap-3">
          <Paso icono={Info}>{guia.tramite}</Paso>
          <ol className="flex flex-col gap-2.5 pl-1">
            {guia.pasos.map((paso, indice) => (
              <li key={paso} className="flex gap-3 text-sm">
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold cifras text-primary"
                >
                  {indice + 1}
                </span>
                <span className="pt-0.5 text-pretty">{paso}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {nuevos.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 id={idDocumentos} className="text-sm font-semibold">
            {durante ? "Lo que debes cargar" : "Lo nuevo que debes cargar"}
          </h3>
          <div aria-labelledby={idDocumentos} role="group">
            <ListaRequisitos requisitos={nuevos} conAyuda />
          </div>
          {faltaMetodoPago ? (
            <Paso icono={TriangleAlert}>
              La certificación de pago depende de la cuenta que registres:
              primero completa tus datos de pago.
            </Paso>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {/* «Mis documentos» abre en el nivel verificado: aquí, en el objetivo. */}
        <EnlaceBoton
          href={rutaDocumentosDelNivel(nivel.nivel)}
          className="w-full sm:w-auto"
        >
          Cargar documentos
          <ArrowRight data-icon="inline-end" aria-hidden />
        </EnlaceBoton>
        {faltaMetodoPago ? (
          <EnlaceBoton
            href={RUTAS_MI_MEDIO.pago}
            variant="outline"
            className="w-full sm:w-auto"
          >
            Registrar datos de pago
          </EnlaceBoton>
        ) : durante ? (
          <EnlaceBoton
            href={RUTAS_MI_MEDIO.inicio}
            variant="outline"
            className="w-full sm:w-auto"
          >
            Ver mi lista de alta
          </EnlaceBoton>
        ) : null}
      </div>
    </section>
  )
}

/**
 * Sin nivel siguiente. El tope (o su ausencia) ya lo cuenta la tarjeta del
 * consumo con lo que dice la configuración: aquí no se repite ni se supone.
 */
function NivelMaximo() {
  return (
    <TarjetaPanel
      titulo="Estás en el nivel más alto"
      icono={Trophy}
      className={TARJETA}
    >
      <p className="text-sm text-muted-foreground">
        No hay un nivel por encima del tuyo. Mantén al día tus documentos para
        conservarlo.
      </p>
    </TarjetaPanel>
  )
}

// ── Los niveles de AMO ──────────────────────────────────────────────────────

function ComparativaNiveles({
  niveles,
  actual,
}: {
  niveles: readonly NivelVerificacion[]
  actual: number
}) {
  const idTitulo = useId()
  if (niveles.length === 0) return null
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <h2
        id={idTitulo}
        className="flex items-center gap-2 font-heading text-base font-semibold"
      >
        <Layers aria-hidden className="size-4 text-primary" />
        Los niveles de AMO
      </h2>
      <ol className="grid gap-3 md:grid-cols-3">
        {niveles.map((nivel) => {
          const esActual = nivel.nivel === actual
          return (
            <li
              key={nivel.nivel}
              aria-current={esActual ? "true" : undefined}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border bg-card p-4",
                esActual && "border-primary/40 ring-1 ring-primary/30"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <InsigniaNivel nivel={nivel.nivel} className="font-medium" />
                  <p className="text-sm text-muted-foreground">
                    {nivel.nombre}
                  </p>
                </div>
                {esActual ? (
                  <InsigniaTono
                    tono="info"
                    etiqueta="Tu nivel"
                    className="h-5"
                  />
                ) : null}
              </div>
              <p className="text-sm font-medium">
                {nivel.topeAnual === null
                  ? "Sin tope anual"
                  : `Tope de ${valorTope(nivel)}`}
              </p>
              {nivel.requisitos.length > 0 ? (
                <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  {nivel.requisitos.map((requisito) => (
                    <li key={requisito} className="flex gap-1.5">
                      <CircleCheck
                        aria-hidden
                        className="mt-px size-3.5 shrink-0"
                      />
                      <span>{requisito}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ── Vista ───────────────────────────────────────────────────────────────────

/**
 * «Nivel» (MED-007): nivel vigente con su tope y lo consumido en el año (aviso
 * visible desde el 80 %), sus documentos con estado, el camino para subir
 * (trámite, pasos y lo nuevo que hay que cargar) y los niveles de AMO.
 */
export function VistaNivel({
  resumen,
  consumo,
}: {
  resumen: ResumenMiMedio
  consumo: ConsumoTope | null
}) {
  const vista = vistaNivel(resumen, consumo)
  const aviso = avisoTope(vista.consumo, vista.objetivo !== null)
  const nombreNivel = vista.actual
    ? tituloNivel(vista.actual.nivel, vista.numero)
    : "Tu nivel"
  return (
    <div className="flex flex-col gap-5">
      {aviso ? (
        <Alert
          variant={aviso.tono === "peligro" ? "destructive" : "default"}
          className={cn(
            "rounded-2xl p-4",
            aviso.tono === "aviso" && "border-warning/40 bg-warning/8"
          )}
        >
          <TriangleAlert
            aria-hidden
            className={aviso.tono === "aviso" ? "text-warning" : undefined}
          />
          <AlertTitle>{aviso.titulo}</AlertTitle>
          <AlertDescription>
            {aviso.texto}
            {vista.objetivo ? (
              <>
                {" "}
                <a href={`#${ID_SUBIR_DE_NIVEL}`}>Mira cómo subir de nivel</a>.
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <TarjetaNivelActual
            vista={vista}
            nivelInicial={resumen.niveles.find((n) => n.nivel === 1) ?? null}
          />
          <Consumo consumo={vista.consumo} nivel={nombreNivel} />
        </div>
        {vista.actual ? (
          <TarjetaPanel
            titulo="Documentos de tu nivel"
            descripcion="Mantenlos aprobados y vigentes para conservar tu nivel."
            icono={FileText}
            className={TARJETA}
            enlace={{
              href: RUTAS_MI_MEDIO.documentos,
              texto: "Ir a Documentos",
            }}
          >
            <ListaRequisitos requisitos={vista.actual.requisitos} />
          </TarjetaPanel>
        ) : null}
      </div>

      {vista.objetivo ? (
        <CaminoNivel
          objetivo={vista.objetivo}
          numeroActual={vista.numero}
          faltaMetodoPago={vista.faltaMetodoPago}
        />
      ) : (
        <NivelMaximo />
      )}

      <ComparativaNiveles niveles={resumen.niveles} actual={vista.numero} />
    </div>
  )
}
