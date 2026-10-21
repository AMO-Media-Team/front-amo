import {
  KeyRound,
  type LucideIcon,
  MailCheck,
  TriangleAlert,
  UserRoundPlus,
} from "lucide-react"
import type { Metadata } from "next"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { ConfirmacionEnlace } from "@/features/auth/components/confirmacion-enlace"
import { EncabezadoAuth } from "@/features/auth/components/encabezado-auth"
import { enmascararEmail } from "@/features/auth/components/enmascarar-email"
import { primerValor } from "@/features/auth/components/parametros"
import { rutaInternaSegura } from "@/lib/auth/navegacion"

export const metadata: Metadata = {
  title: "Confirmar enlace",
  // La URL lleva el token: que no viaje en el Referer de ningún recurso.
  referrer: "no-referrer",
}

/** Tipos de enlace de correo de Supabase (`EmailOtpType`). */
const TIPOS_ENLACE = [
  "invite",
  "recovery",
  "email_change",
  "email",
  "signup",
  "magiclink",
] as const
type TipoEnlace = (typeof TIPOS_ENLACE)[number]

interface TextosEnlace {
  icono: LucideIcon
  titulo: string
  descripcion: string
  boton: string
}

const CONFIRMAR_CORREO: TextosEnlace = {
  icono: MailCheck,
  titulo: "Confirma tu correo",
  descripcion: "Continúa para confirmar tu correo y entrar a AMO.",
  boton: "Confirmar y continuar",
}

const TEXTOS: Record<TipoEnlace, TextosEnlace> = {
  invite: {
    icono: UserRoundPlus,
    titulo: "Activa tu cuenta",
    descripcion:
      "Te invitaron a AMO. Continúa para confirmar tu correo y crear tu contraseña.",
    boton: "Activar mi cuenta",
  },
  recovery: {
    icono: KeyRound,
    titulo: "Restablece tu contraseña",
    descripcion: "Continúa para crear una contraseña nueva para tu cuenta.",
    boton: "Continuar",
  },
  email_change: {
    icono: MailCheck,
    titulo: "Confirma tu nuevo correo",
    descripcion: "Continúa para confirmar el cambio de correo de tu cuenta.",
    boton: "Confirmar correo",
  },
  email: CONFIRMAR_CORREO,
  signup: CONFIRMAR_CORREO,
  magiclink: CONFIRMAR_CORREO,
}

function esTipoEnlace(valor: string | undefined): valor is TipoEnlace {
  return TIPOS_ENLACE.some((tipo) => tipo === valor)
}

function EnlaceIncompleto() {
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoAuth
        icono={TriangleAlert}
        titulo="Este enlace está incompleto"
        descripcion="Abre el enlace completo desde el correo o pide uno nuevo. Si te invitaron, un administrador puede generar otro."
      />
      <div className="flex flex-col gap-3">
        <EnlaceBoton size="lg" className="h-11" href="/recuperar">
          Pedir un enlace nuevo
        </EnlaceBoton>
        <EnlaceBoton
          variant="ghost"
          size="lg"
          className="h-11"
          href="/ingresar"
        >
          Ir a ingresar
        </EnlaceBoton>
      </div>
    </div>
  )
}

/**
 * GET sin efectos: solo muestra la tarjeta. El token se verifica en la
 * Server Action al pulsar el botón (inmune a previsualizadores de correo).
 */
export default async function PaginaConfirmarEnlace({
  searchParams,
}: PageProps<"/auth/confirm">) {
  const parametros = await searchParams
  const tokenHash = primerValor(parametros.token_hash)
  const tipo = primerValor(parametros.type)

  if (!tokenHash || !esTipoEnlace(tipo)) return <EnlaceIncompleto />

  const textos = TEXTOS[tipo]
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoAuth
        icono={textos.icono}
        titulo={textos.titulo}
        descripcion={textos.descripcion}
      />
      <ConfirmacionEnlace
        tokenHash={tokenHash}
        tipo={tipo}
        siguiente={rutaInternaSegura(primerValor(parametros.next)) ?? undefined}
        emailEnmascarado={enmascararEmail(primerValor(parametros.email))}
        textoBoton={textos.boton}
      />
    </div>
  )
}
