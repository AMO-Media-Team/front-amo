/**
 * Ilustraciones SVG decorativas de los estados vacíos, de error y 404. Usan
 * tokens (`--primary`, `--destructive`…) para adaptarse a ambos temas y
 * `useId` para que varios ejemplares en la misma página no compartan <defs>.
 */
import { type ComponentProps, useId } from "react"

type PropsSvg = ComponentProps<"svg">

const AURORA_INICIO = "#8c66ee"
const AURORA_FIN = "#5b6cf0"

/** Anillos concéntricos para enmarcar el icono de un estado vacío. */
export function IlustracionAnillos(props: PropsSvg) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden {...props}>
      <circle
        cx="60"
        cy="60"
        r="57"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeDasharray="3 7"
        strokeLinecap="round"
      />
      <circle
        cx="60"
        cy="60"
        r="42"
        fill="currentColor"
        fillOpacity="0.05"
        stroke="currentColor"
        strokeOpacity="0.14"
      />
      <circle cx="104" cy="38" r="3" fill="currentColor" fillOpacity="0.55" />
      <circle cx="17" cy="82" r="2" fill="currentColor" fillOpacity="0.4" />
      <circle cx="86" cy="108" r="1.5" fill="currentColor" fillOpacity="0.35" />
    </svg>
  )
}

/** Antena de medios con la señal interrumpida. */
export function IlustracionError(props: PropsSvg) {
  const id = useId()
  const halo = `${id}-halo`
  const gradiente = `${id}-grad`

  return (
    <svg viewBox="0 0 240 180" fill="none" aria-hidden {...props}>
      <defs>
        <radialGradient id={halo}>
          <stop offset="0" stopColor={AURORA_INICIO} stopOpacity="0.28" />
          <stop offset="1" stopColor={AURORA_INICIO} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={gradiente} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={AURORA_INICIO} />
          <stop offset="1" stopColor={AURORA_FIN} />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="152" rx="78" ry="14" fill={`url(#${halo})`} />
      <path
        d="M120 64 102 150M120 64l18 86M107 128h26M111 108h18"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="120" cy="58" r="9" fill={`url(#${gradiente})`} />
      <path
        d="M104.4 42.4a22 22 0 0 0 0 31.2M93.1 31.1a38 38 0 0 0 0 53.8"
        stroke={`url(#${gradiente})`}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M135.6 42.4a22 22 0 0 1 0 31.2M146.9 31.1a38 38 0 0 1 0 53.8"
        stroke="var(--destructive)"
        strokeOpacity="0.7"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="4 9"
      />
      <circle
        cx="172"
        cy="124"
        r="17"
        fill="var(--destructive)"
        fillOpacity="0.12"
        stroke="var(--destructive)"
        strokeWidth="2"
      />
      <path
        d="M172 115v11"
        stroke="var(--destructive)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="172" cy="132" r="2" fill="var(--destructive)" />
    </svg>
  )
}

/** Pin de ubicación extraviado sobre un plano: la ruta no existe. */
export function IlustracionNoEncontrado(props: PropsSvg) {
  const id = useId()
  const halo = `${id}-halo`
  const gradiente = `${id}-grad`

  return (
    <svg viewBox="0 0 240 180" fill="none" aria-hidden {...props}>
      <defs>
        <radialGradient id={halo}>
          <stop offset="0" stopColor={AURORA_INICIO} stopOpacity="0.3" />
          <stop offset="1" stopColor={AURORA_INICIO} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={gradiente} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={AURORA_INICIO} />
          <stop offset="1" stopColor={AURORA_FIN} />
        </linearGradient>
      </defs>
      <path
        d="M30 134 120 100l90 34-90 36-90-36Z"
        fill="currentColor"
        fillOpacity="0.04"
        stroke="currentColor"
        strokeOpacity="0.16"
      />
      <path
        d="M60 122.7l90 36M90 111.3l90 36M60 145.3l90-34M90 156.7l90-34"
        stroke="currentColor"
        strokeOpacity="0.1"
      />
      <ellipse cx="120" cy="134" rx="40" ry="9" fill={`url(#${halo})`} />
      <path
        d="M52 140c14-10 30 8 44-2s20-18 22-26"
        stroke="var(--primary)"
        strokeOpacity="0.7"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 7"
      />
      <path
        d="M120 18c-21 0-37 16-37 36.5C83 81 120 122 120 122s37-41 37-67.5C157 34 141 18 120 18Z"
        fill={`url(#${gradiente})`}
      />
      <circle cx="120" cy="55" r="18" fill="var(--background)" />
      <path
        d="M114 50.5a6.2 6.2 0 1 1 8.7 5.7c-1.7.8-2.7 2.1-2.7 3.9v1.4"
        stroke="var(--primary)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="120" cy="67.5" r="2.1" fill="var(--primary)" />
    </svg>
  )
}
