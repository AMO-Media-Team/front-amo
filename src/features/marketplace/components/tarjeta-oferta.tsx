import { CalendarRange, EyeOff, Sparkles, Ticket } from "lucide-react"
import Link from "next/link"
import { type ReactNode, useId } from "react"

import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import {
  formatearHandle,
  formatearRangoCompacto,
} from "@/features/operacion/formato"
import { cn } from "@/lib/utils"

import {
  cuentaDestacada,
  formatoDeOferta,
  pagoTarjeta,
  textoCupos,
  textoPublicaciones,
} from "../presentacion"
import { rutaFichaOfertaMedio } from "../rutas"
import type { OfertaMarketplace } from "../tipos"

function Marca({
  tono,
  icono,
  children,
}: {
  tono: "nueva" | "rechazada"
  icono: ReactNode
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[0.6875rem] font-semibold [&_svg]:size-3",
        tono === "nueva"
          ? "bg-primary/12 text-primary"
          : "border border-dashed text-muted-foreground"
      )}
    >
      {icono}
      {children}
    </span>
  )
}

/**
 * Una oferta del marketplace (MED-008): marca, formato y plataforma, lo que
 * recibe (el mayor pago entre sus cuentas), cupos en su franja, fecha límite
 * con cuenta regresiva y la marca «Nueva» si aún no abre su detalle. Toda la
 * tarjeta abre el detalle (un solo enlace: el título).
 */
export function TarjetaOfertaMedio({
  oferta,
  ahoraServidor,
}: {
  oferta: OfertaMarketplace
  ahoraServidor: number
}) {
  const idTitulo = useId()
  const pago = pagoTarjeta(oferta)
  const destacada = cuentaDestacada(oferta.cuentas)
  const varias = oferta.cuentas.length > 1

  return (
    <article
      aria-labelledby={idTitulo}
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50",
        !oferta.vista && "border-primary/30",
        oferta.rechazada && "bg-card/60"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <MarcaPlataforma plataforma={oferta.plataforma} />
          <span className="truncate">{formatoDeOferta(oferta)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          {oferta.rechazada ? (
            <Marca tono="rechazada" icono={<EyeOff aria-hidden />}>
              La rechazaste
            </Marca>
          ) : null}
          {!oferta.vista ? (
            <Marca tono="nueva" icono={<Sparkles aria-hidden />}>
              Nueva
            </Marca>
          ) : null}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {oferta.marca}
          {oferta.anunciante !== oferta.marca ? ` · ${oferta.anunciante}` : ""}
        </p>
        <h3
          id={idTitulo}
          className="text-base leading-snug font-semibold text-balance break-words"
        >
          <Link
            href={rutaFichaOfertaMedio(oferta.id)}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:underline hover:underline-offset-4"
          >
            {oferta.titulo}
          </Link>
        </h3>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-muted-foreground">{pago.etiqueta}</span>
          <span className="text-2xl leading-tight font-bold cifras tracking-tight">
            {pago.valor}
          </span>
          <span className="text-xs text-muted-foreground">
            por {textoPublicaciones(oferta.publicacionesPorMedio)}
            {destacada && varias
              ? ` con ${formatearHandle(destacada.handle)}`
              : ""}
          </span>
        </div>
        {destacada ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium",
              destacada.cuposRestantes === 1
                ? "text-warning"
                : "text-muted-foreground"
            )}
          >
            <Ticket aria-hidden className="size-3.5 shrink-0" />
            {textoCupos(destacada.cuposRestantes)}
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="relative z-10 inline-flex items-center gap-1.5">
          Aceptación
          <CuentaRegresiva
            venceAt={oferta.fechaLimiteAceptacion}
            ahoraServidor={ahoraServidor}
            etiqueta="Fecha límite para aceptar"
            textos={{ pendiente: "Cierra en", vencido: "Cerró hace" }}
          />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange aria-hidden className="size-3.5 shrink-0" />
          <span>
            Publicación{" "}
            <span className="cifras text-foreground">
              {formatearRangoCompacto(oferta.ventanaInicio, oferta.ventanaFin)}
            </span>
          </span>
        </span>
      </div>
    </article>
  )
}
