"use client"

import {
  Check,
  CircleCheck,
  Clock,
  CloudUpload,
  Gauge,
  Hash,
  Lock,
  type LucideIcon,
  Mail,
  MailX,
  Monitor,
  Moon,
  Palette,
  Rows3,
  Sun,
  TriangleAlert,
} from "lucide-react"
import type { ChangeEvent, ReactNode } from "react"
import { useId, useSyncExternalStore } from "react"

import { useShell } from "@/components/layout/contexto-shell"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  CATEGORIAS,
  type ClaveCategoria,
} from "@/features/notificaciones/presentacion"
import { type Tema, useTransicionTema } from "@/hooks/use-transicion-tema"
import type { TipoRol } from "@/lib/auth/permisos"
import { cn } from "@/lib/utils"

import { crearFormateadorNumeros } from "../formato-numeros"
import {
  CATEGORIAS_CORREO_POR_TIPO,
  type CategoriaSilenciable,
  type DensidadPreferida,
  esSilenciable,
  type FormatoNumeros,
  type PreferenciasInterfaz,
} from "../preferencias"
import {
  type EstadoGuardado,
  ProveedorPreferencias,
  useContextoPreferencias,
} from "./proveedor-preferencias"
import { SeccionCuenta } from "./seccion-cuenta"

// ── Opción tipo tarjeta (radio nativo: flechas y lectores de pantalla) ──────

function OpcionTarjeta({
  nombre,
  valor,
  seleccionada,
  onElegir,
  titulo,
  descripcion,
  icono: Icono,
  children,
}: {
  nombre: string
  valor: string
  seleccionada: boolean
  onElegir: (evento: ChangeEvent<HTMLInputElement>) => void
  titulo: string
  descripcion?: string
  icono?: LucideIcon
  children: ReactNode
}) {
  return (
    <label
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-background/40 transition-all duration-200 has-[:focus-visible]:anillo-foco",
        seleccionada
          ? "border-primary/70 shadow-[0_0_0_1px_var(--primary)] dark:bg-primary/[0.06]"
          : "hover:border-foreground/20 hover:bg-muted/40"
      )}
    >
      <input
        type="radio"
        name={nombre}
        value={valor}
        checked={seleccionada}
        onChange={onElegir}
        className="sr-only"
      />
      <div className="p-1.5 pb-0 sm:p-2.5 sm:pb-0">{children}</div>
      <div className="flex items-start justify-between gap-1.5 p-2 sm:gap-2 sm:p-3">
        <span className="flex min-w-0 items-start gap-2">
          {Icono ? (
            <Icono
              aria-hidden
              className="mt-0.5 hidden size-4 shrink-0 text-muted-foreground sm:block"
            />
          ) : null}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[0.8125rem] font-medium sm:text-sm">
              {titulo}
            </span>
            {descripcion ? (
              <span className="hidden text-xs text-muted-foreground sm:block">
                {descripcion}
              </span>
            ) : null}
          </span>
        </span>
        {/* En móvil la marca flota sobre la vista previa: el título necesita el ancho. */}
        <span
          aria-hidden
          className={cn(
            "absolute top-1 right-1 size-5 shrink-0 place-items-center rounded-full border shadow-sm transition-all sm:static sm:grid sm:shadow-none",
            seleccionada
              ? "grid scale-100 border-primary bg-primary text-primary-foreground ring-2 ring-card sm:ring-0"
              : "hidden scale-90 border-border text-transparent"
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      </div>
    </label>
  )
}

// ── Tema ─────────────────────────────────────────────────────────────────────

interface PaletaVista {
  fondo: string
  superficie: string
  elevada: string
  borde: string
  texto: string
  tenue: string
  primario: string
}

/** Colores de marca fijos (docs/marca.md): la vista previa no depende del tema activo. */
const PALETAS: Record<"dark" | "light", PaletaVista> = {
  dark: {
    fondo: "#0E0B16",
    superficie: "#15111F",
    elevada: "#1C1729",
    borde: "#2A2338",
    texto: "#EDE7FE",
    tenue: "#3A3150",
    primario: "#A788F6",
  },
  light: {
    fondo: "#FAF9FD",
    superficie: "#FFFFFF",
    elevada: "#F6F3FF",
    borde: "#E7E3F0",
    texto: "#261848",
    tenue: "#DCD0FD",
    primario: "#7549DE",
  },
}

function MiniApp({ paleta }: { paleta: PaletaVista }) {
  return (
    <div
      className="flex size-full gap-1.5 p-1.5"
      style={{ backgroundColor: paleta.fondo }}
    >
      <div
        className="flex w-1/4 flex-col gap-1 rounded-md p-1.5"
        style={{ backgroundColor: paleta.superficie }}
      >
        <span
          className="h-1.5 w-2/3 rounded-full"
          style={{ backgroundColor: paleta.primario }}
        />
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-1 rounded-full"
            style={{ backgroundColor: i === 0 ? paleta.tenue : paleta.borde }}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <span
          className="h-2 w-1/2 rounded-full"
          style={{ backgroundColor: paleta.texto, opacity: 0.85 }}
        />
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex h-7 flex-col justify-end gap-0.5 rounded-md border p-1"
              style={{
                backgroundColor: paleta.elevada,
                borderColor: paleta.borde,
              }}
            >
              <span
                className="h-1 w-2/3 rounded-full"
                style={{ backgroundColor: paleta.tenue }}
              />
              <span
                className="h-1.5 w-1/2 rounded-full"
                style={{
                  backgroundColor: i === 0 ? paleta.primario : paleta.texto,
                  opacity: i === 0 ? 1 : 0.7,
                }}
              />
            </div>
          ))}
        </div>
        <div
          className="flex flex-1 items-end gap-0.5 rounded-md border p-1"
          style={{
            backgroundColor: paleta.superficie,
            borderColor: paleta.borde,
          }}
        >
          {[40, 65, 50, 80, 60, 95].map((alto, i) => (
            <span
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${alto}%`,
                backgroundColor: paleta.primario,
                opacity: 0.35 + i * 0.1,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function VistaTema({ tema }: { tema: Tema }) {
  return (
    <div
      aria-hidden
      className="relative h-16 overflow-hidden rounded-lg border sm:h-24 lg:h-28"
    >
      {tema === "system" ? (
        <>
          <div className="absolute inset-0">
            <MiniApp paleta={PALETAS.light} />
          </div>
          <div className="absolute inset-0 [clip-path:polygon(0_0,62%_0,38%_100%,0_100%)]">
            <MiniApp paleta={PALETAS.dark} />
          </div>
        </>
      ) : (
        <MiniApp paleta={PALETAS[tema]} />
      )}
    </div>
  )
}

const OPCIONES_TEMA: readonly {
  valor: Tema
  titulo: string
  descripcion: string
  icono: LucideIcon
}[] = [
  {
    valor: "dark",
    titulo: "Oscuro",
    descripcion: "El tema principal de AMO",
    icono: Moon,
  },
  {
    valor: "light",
    titulo: "Claro",
    descripcion: "Ideal con mucha luz",
    icono: Sun,
  },
  {
    valor: "system",
    titulo: "Sistema",
    descripcion: "Sigue a tu dispositivo",
    icono: Monitor,
  },
]

function origenDelCambio(evento: ChangeEvent<HTMLInputElement>) {
  const rect = evento.currentTarget.closest("label")?.getBoundingClientRect()
  return rect
    ? {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }
    : undefined
}

function SeccionTema({ onGuardar }: { onGuardar: (tema: Tema) => void }) {
  const { tema, cambiarTema } = useTransicionTema()
  // next-themes solo conoce el tema en el navegador: antes de hidratar no se marca ninguno.
  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const actual = montado ? (tema ?? "dark") : null

  return (
    <SeccionCuenta
      id="tema"
      titulo="Tema"
      icono={Palette}
      descripcion="El tema oscuro es el principal de AMO. El cambio se aplica al instante."
    >
      <fieldset>
        <legend className="sr-only">Tema de la interfaz</legend>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {OPCIONES_TEMA.map((opcion) => (
            <OpcionTarjeta
              key={opcion.valor}
              nombre="tema"
              valor={opcion.valor}
              seleccionada={actual === opcion.valor}
              onElegir={(evento) => {
                cambiarTema(opcion.valor, origenDelCambio(evento))
                onGuardar(opcion.valor)
              }}
              titulo={opcion.titulo}
              descripcion={opcion.descripcion}
              icono={opcion.icono}
            >
              <VistaTema tema={opcion.valor} />
            </OpcionTarjeta>
          ))}
        </div>
      </fieldset>
    </SeccionCuenta>
  )
}

// ── Densidad ─────────────────────────────────────────────────────────────────

const OPCIONES_DENSIDAD: readonly {
  valor: DensidadPreferida
  titulo: string
  descripcion: string
  filas: number
  alto: string
}[] = [
  {
    valor: "compacta",
    titulo: "Compacta",
    descripcion: "Más filas a la vista",
    filas: 5,
    alto: "h-3",
  },
  {
    valor: "normal",
    titulo: "Normal",
    descripcion: "Equilibrada",
    filas: 4,
    alto: "h-4",
  },
  {
    valor: "comoda",
    titulo: "Cómoda",
    descripcion: "Más aire entre filas",
    filas: 3,
    alto: "h-5",
  },
]

function VistaDensidad({ filas, alto }: { filas: number; alto: string }) {
  return (
    <div
      aria-hidden
      className="flex h-16 flex-col overflow-hidden rounded-lg border bg-card sm:h-24 lg:h-28"
    >
      <div className="flex h-4 shrink-0 items-center gap-2 border-b bg-muted/60 px-2">
        <span className="h-1 w-1/4 rounded-full bg-muted-foreground/40" />
        <span className="h-1 w-1/5 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="flex flex-1 flex-col justify-evenly">
        {Array.from({ length: filas }, (_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2 border-b px-2 last:border-b-0",
              alto
            )}
          >
            <span className="size-1.5 rounded-full bg-primary/60" />
            <span className="h-1 w-1/3 rounded-full bg-foreground/25" />
            <span className="ml-auto h-1 w-1/6 rounded-full bg-foreground/15" />
          </div>
        ))}
      </div>
    </div>
  )
}

function SeccionDensidad({
  valor,
  onElegir,
}: {
  valor: DensidadPreferida
  onElegir: (densidad: DensidadPreferida) => void
}) {
  return (
    <SeccionCuenta
      id="densidad"
      titulo="Densidad de las tablas"
      icono={Rows3}
      descripcion="Cuánto espacio ocupa cada fila en los listados. Cada tabla puede ajustarse aparte desde «Vista»."
    >
      <fieldset>
        <legend className="sr-only">Densidad de las tablas</legend>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {OPCIONES_DENSIDAD.map((opcion) => (
            <OpcionTarjeta
              key={opcion.valor}
              nombre="densidad"
              valor={opcion.valor}
              seleccionada={valor === opcion.valor}
              onElegir={() => onElegir(opcion.valor)}
              titulo={opcion.titulo}
              descripcion={opcion.descripcion}
            >
              <VistaDensidad filas={opcion.filas} alto={opcion.alto} />
            </OpcionTarjeta>
          ))}
        </div>
      </fieldset>
    </SeccionCuenta>
  )
}

// ── Movimiento ───────────────────────────────────────────────────────────────

const CONSULTA_MOVIMIENTO = "(prefers-reduced-motion: reduce)"

function suscribirMovimiento(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA_MOVIMIENTO)
  consulta.addEventListener("change", avisar)
  return () => consulta.removeEventListener("change", avisar)
}

function useSistemaReduceMovimiento(): boolean | null {
  return useSyncExternalStore(
    suscribirMovimiento,
    () => window.matchMedia(CONSULTA_MOVIMIENTO).matches,
    () => null
  )
}

function DemostracionMovimiento({ reducido }: { reducido: boolean }) {
  return (
    <div
      aria-hidden
      className="relative hidden w-40 shrink-0 place-items-center self-stretch overflow-hidden rounded-xl border bg-muted/30 sm:grid"
    >
      <span
        className={cn(
          "absolute size-16 rounded-full bg-aurora opacity-30 blur-xl",
          !reducido && "animate-aurora-desplazar"
        )}
      />
      <span
        className={cn(
          "relative size-4 rounded-full bg-primary shadow-glow",
          !reducido && "animate-pulso-anillo"
        )}
      />
    </div>
  )
}

function SeccionMovimiento({
  reducido,
  onCambiar,
}: {
  reducido: boolean
  onCambiar: (reducir: boolean) => void
}) {
  const sistema = useSistemaReduceMovimiento()
  const efectivo = reducido || sistema === true

  return (
    <SeccionCuenta
      id="movimiento"
      titulo="Movimiento"
      icono={Gauge}
      descripcion="Transiciones, animaciones de entrada y efectos al navegar."
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <Field
          orientation="horizontal"
          className="flex-1 items-start rounded-xl border bg-muted/20 p-4"
        >
          <FieldContent>
            <FieldLabel htmlFor="reducir-movimiento">
              Reducir el movimiento
            </FieldLabel>
            <FieldDescription>
              {reducido
                ? "AMO usará transiciones mínimas aunque tu sistema permita animaciones."
                : sistema === true
                  ? "Tu sistema ya pide movimiento reducido: AMO lo respeta."
                  : "Apagado: AMO sigue la preferencia de tu sistema (ahora con animaciones)."}
            </FieldDescription>
          </FieldContent>
          <Switch
            id="reducir-movimiento"
            checked={reducido}
            onCheckedChange={(valor) => onCambiar(valor)}
          />
        </Field>
        <DemostracionMovimiento reducido={efectivo} />
      </div>
    </SeccionCuenta>
  )
}

// ── Formato de números ───────────────────────────────────────────────────────

const OPCIONES_NUMERO: readonly {
  valor: FormatoNumeros
  titulo: string
  descripcion: string
}[] = [
  {
    valor: "colombia",
    titulo: "Colombia",
    descripcion: "Punto de miles y coma decimal",
  },
  {
    valor: "internacional",
    titulo: "Internacional",
    descripcion: "Coma de miles y punto decimal",
  },
]

function VistaNumeros({ formato }: { formato: FormatoNumeros }) {
  const f = crearFormateadorNumeros(formato)
  return (
    <div
      aria-hidden
      className="flex h-20 flex-col justify-center gap-0.5 rounded-lg border bg-card px-2.5 cifras sm:h-24 sm:gap-1 sm:px-3.5 lg:h-28"
    >
      <span className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
        GMV del mes
      </span>
      <span className="font-heading text-base font-bold sm:text-xl">
        {f.moneda(12345678)}
      </span>
      <span className="flex flex-wrap gap-x-3 text-[0.6875rem] text-muted-foreground sm:text-xs">
        <span>{f.numero(1234.5, 1)}</span>
        <span className="text-success">↑ {f.porcentaje(0.125)}</span>
      </span>
    </div>
  )
}

function SeccionNumeros({
  valor,
  onElegir,
}: {
  valor: FormatoNumeros
  onElegir: (formato: FormatoNumeros) => void
}) {
  return (
    <SeccionCuenta
      id="numeros"
      titulo="Formato de números"
      icono={Hash}
      descripcion="Separadores de miles y decimales en cifras, montos y porcentajes."
    >
      <fieldset>
        <legend className="sr-only">Formato de números</legend>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {OPCIONES_NUMERO.map((opcion) => (
            <OpcionTarjeta
              key={opcion.valor}
              nombre="formato-numeros"
              valor={opcion.valor}
              seleccionada={valor === opcion.valor}
              onElegir={() => onElegir(opcion.valor)}
              titulo={opcion.titulo}
              descripcion={opcion.descripcion}
            >
              <VistaNumeros formato={opcion.valor} />
            </OpcionTarjeta>
          ))}
        </div>
      </fieldset>
    </SeccionCuenta>
  )
}

// ── Avisos por correo ────────────────────────────────────────────────────────

/** Qué incluye cada categoría (los avisos de la campana, también por correo). */
const DESCRIPCIONES_CORREO: Record<ClaveCategoria, string> = {
  ofertas: "Ofertas nuevas, publicadas o devueltas y cambios en campañas.",
  asignaciones: "Aceptaciones, vencimientos, cancelaciones y recordatorios.",
  ejecucion: "Evidencias y métricas que debes corregir.",
  pagos: "Liquidaciones, pagos, facturas y cambios de multiplicador.",
  verificacion: "Resultado de la verificación y vencimiento de documentos.",
  cuentas: "Verificación y reverificación de tus cuentas sociales.",
  disputas: "Disputas abiertas, mensajes nuevos y resoluciones.",
  pendientes:
    "Trabajo nuevo en las colas del equipo: verificación, moderación, validación y finanzas.",
  seguridad: "Ingresos inusuales y cambios importantes en tu cuenta.",
  privacidad: "Respuestas a tus solicitudes sobre tus datos personales.",
}

function alternarSilenciada(
  silenciadas: readonly CategoriaSilenciable[],
  clave: CategoriaSilenciable,
  recibir: boolean
): CategoriaSilenciable[] {
  const sin = silenciadas.filter((actual) => actual !== clave)
  return recibir ? sin : [...sin, clave]
}

/** Por qué una casilla no se puede cambiar (o ninguno si se puede). */
type BloqueoCorreo = "obligatoria" | "sin-correo" | null

const INSIGNIAS_BLOQUEO: Record<
  Exclude<BloqueoCorreo, null>,
  { icono: LucideIcon; texto: string; explicacion: string }
> = {
  obligatoria: {
    icono: Lock,
    texto: "Siempre activo",
    explicacion:
      " Siempre te llegan por correo: protegen tu cuenta o tienen plazo legal.",
  },
  "sin-correo": {
    icono: MailX,
    texto: "Sin correo por ahora",
    explicacion:
      " El equipo AMO aún no envía estos avisos por correo: los ves en la campana.",
  },
}

function OpcionCorreo({
  clave,
  recibe,
  sinCorreo = false,
  onCambiar,
}: {
  clave: ClaveCategoria
  recibe: boolean
  /**
   * Ninguna plantilla de correo de la categoría está activa: la casilla no
   * cambiaría nada, así que se muestra desmarcada y deshabilitada (la
   * elección guardada se conserva).
   */
  sinCorreo?: boolean
  /** Sin él la categoría es obligatoria: marcada y deshabilitada. */
  onCambiar?: (recibir: boolean) => void
}) {
  const id = useId()
  const bloqueo: BloqueoCorreo = sinCorreo
    ? "sin-correo"
    : onCambiar
      ? null
      : "obligatoria"
  const marcada = bloqueo === "sin-correo" ? false : !onCambiar || recibe
  const insignia = bloqueo ? INSIGNIAS_BLOQUEO[bloqueo] : null
  const idDescripcion = `${id}-descripcion`
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-background/40 p-3 transition-colors",
        marcada && "border-primary/30 bg-primary/[0.04] dark:bg-primary/[0.07]",
        bloqueo === "sin-correo" && "border-dashed"
      )}
    >
      <Checkbox
        id={id}
        checked={marcada}
        disabled={bloqueo !== null}
        onCheckedChange={(valor) => onCambiar?.(valor === true)}
        aria-describedby={idDescripcion}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Label htmlFor={id} className="text-sm leading-snug font-medium">
            {CATEGORIAS[clave].etiqueta}
          </Label>
          {insignia ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
              <insignia.icono aria-hidden className="size-3" />
              {insignia.texto}
            </span>
          ) : null}
        </span>
        <p
          id={idDescripcion}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {DESCRIPCIONES_CORREO[clave]}
          {insignia?.explicacion}
        </p>
      </div>
    </li>
  )
}

/**
 * «Avisos por correo»: qué categorías de avisos llegan también al correo. Las
 * de seguridad y datos personales no se pueden apagar. Las elecciones se
 * guardan aunque el envío por correo aún no esté encendido (`correo.habilitado`):
 * con `correoHabilitado` distinto de `true` se avisa que se activará pronto.
 * Una categoría fuera de `categoriasConCorreo` (sin plantilla de correo
 * activa, p. ej. las colas del equipo) se muestra deshabilitada y explicada.
 */
export function SeccionAvisosCorreo({
  tipoRol,
  email,
  silenciadas,
  correoHabilitado,
  categoriasConCorreo,
  onCambiar,
}: {
  tipoRol: TipoRol
  email: string
  silenciadas: readonly CategoriaSilenciable[]
  /** `null` o ausente: no se pudo saber (se trata como apagado). */
  correoHabilitado?: boolean | null
  /** Las que hoy sí salen por correo; `null` o ausente: no se sabe (todas). */
  categoriasConCorreo?: readonly ClaveCategoria[] | null
  onCambiar: (silenciadas: CategoriaSilenciable[]) => void
}) {
  const categorias = CATEGORIAS_CORREO_POR_TIPO[tipoRol]
  const sinCorreo = (clave: ClaveCategoria) =>
    categoriasConCorreo ? !categoriasConCorreo.includes(clave) : false
  return (
    <SeccionCuenta
      id="correo"
      titulo="Avisos por correo"
      icono={Mail}
      descripcion="Elige qué avisos te llegan también por correo. En la campana de AMO los sigues viendo todos."
    >
      <div className="flex flex-col gap-4">
        {correoHabilitado === true ? (
          <p className="text-sm text-muted-foreground">
            Te escribimos a{" "}
            <span className="font-medium break-all text-foreground">
              {email}
            </span>
            .
          </p>
        ) : (
          <p className="flex items-start gap-2.5 rounded-xl border border-dashed bg-muted/30 px-3.5 py-3 text-sm">
            <Clock
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <span>
              <span className="font-medium">
                El envío por correo se activará pronto.
              </span>{" "}
              <span className="text-muted-foreground">
                Tus elecciones quedan guardadas y se aplicarán desde ese
                momento.
              </span>
            </span>
          </p>
        )}
        <fieldset>
          <legend className="sr-only">Avisos que recibes por correo</legend>
          <ul className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            {categorias.map((clave) =>
              esSilenciable(clave) ? (
                <OpcionCorreo
                  key={clave}
                  clave={clave}
                  recibe={!silenciadas.includes(clave)}
                  sinCorreo={sinCorreo(clave)}
                  onCambiar={(recibir) =>
                    onCambiar(alternarSilenciada(silenciadas, clave, recibir))
                  }
                />
              ) : (
                <OpcionCorreo
                  key={clave}
                  clave={clave}
                  recibe
                  sinCorreo={sinCorreo(clave)}
                />
              )
            )}
          </ul>
        </fieldset>
      </div>
    </SeccionCuenta>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

const ESTADOS: Record<
  EstadoGuardado,
  { icono: LucideIcon; texto: string; clase: string }
> = {
  inactivo: {
    icono: CloudUpload,
    texto: "Los cambios se aplican al instante y se guardan en tu cuenta.",
    clase: "text-muted-foreground",
  },
  guardando: {
    icono: CloudUpload,
    texto: "Guardando…",
    clase: "text-muted-foreground",
  },
  guardado: {
    icono: CircleCheck,
    texto: "Guardado en tu cuenta: te acompaña en cualquier dispositivo.",
    clase: "text-success",
  },
  error: {
    icono: TriangleAlert,
    texto: "No pudimos guardar el último cambio. Inténtalo de nuevo.",
    clase: "text-destructive",
  },
}

interface EstadoCorreo {
  /** `correo.habilitado` (lo lee la página con `envioCorreoHabilitado()`). */
  correoHabilitado?: boolean | null
  /** Categorías con plantilla de correo activa (`categoriasConCorreo`). */
  categoriasConCorreo?: readonly ClaveCategoria[] | null
}

function ContenidoPreferencias({
  correoHabilitado,
  categoriasConCorreo,
}: EstadoCorreo) {
  const { usuario } = useShell()
  const contexto = useContextoPreferencias()
  if (!contexto) return null
  const { preferencias, estado, actualizar } = contexto
  const { icono: IconoEstado, texto, clase } = ESTADOS[estado]

  return (
    <div className="flex flex-col gap-6">
      <p
        role="status"
        aria-live="polite"
        className={cn("flex items-center gap-2 text-sm", clase)}
      >
        <IconoEstado
          aria-hidden
          className={cn(
            "size-4 shrink-0",
            estado === "guardando" && "animate-pulse"
          )}
        />
        {texto}
      </p>
      <SeccionTema onGuardar={(tema) => actualizar({ tema })} />
      <SeccionDensidad
        valor={preferencias.densidad}
        onElegir={(densidad) => actualizar({ densidad })}
      />
      <SeccionMovimiento
        reducido={preferencias.movimiento === "reducido"}
        onCambiar={(reducir) =>
          actualizar({ movimiento: reducir ? "reducido" : "sistema" })
        }
      />
      <SeccionNumeros
        valor={preferencias.formatoNumeros}
        onElegir={(formatoNumeros) => actualizar({ formatoNumeros })}
      />
      <SeccionAvisosCorreo
        tipoRol={usuario.rol.tipo}
        email={usuario.email}
        silenciadas={preferencias.correoSilenciadas}
        correoHabilitado={correoHabilitado}
        categoriasConCorreo={categoriasConCorreo}
        onCambiar={(correoSilenciadas) => actualizar({ correoSilenciadas })}
      />
    </div>
  )
}

/**
 * Preferencias de la cuenta. Usa el proveedor global si el AppShell ya lo
 * monta; si no, uno local (el cambio se aplica mientras se está en la página).
 * `correoHabilitado`: estado de `correo.habilitado`; sin él se muestra que el
 * correo se activará pronto. `categoriasConCorreo`: las que tienen plantilla
 * de correo activa; sin él no se deshabilita ninguna.
 */
export function PanelPreferencias({
  inicial,
  ...correo
}: EstadoCorreo & { inicial: PreferenciasInterfaz }) {
  const externo = useContextoPreferencias()
  if (externo) return <ContenidoPreferencias {...correo} />
  return (
    <ProveedorPreferencias inicial={inicial}>
      <ContenidoPreferencias {...correo} />
    </ProveedorPreferencias>
  )
}
