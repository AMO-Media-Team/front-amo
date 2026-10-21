"use client"

/**
 * Reemplaza al layout raíz cuando este falla: no hay globals.css, fuentes ni
 * proveedores, así que todo va con estilos en línea (tema oscuro de marca).
 */
import type { CSSProperties } from "react"

interface ErrorGlobalProps {
  error: Error & { digest?: string }
  retry: () => void
}

const COLOR = {
  fondo: "#0E0B16",
  superficie: "#15111F",
  borde: "#2A2338",
  texto: "#F2EFFA",
  tenue: "#A59EB8",
  primario: "#A788F6",
  sobrePrimario: "#160F29",
  destructivo: "#FF9AA6",
}

const FUENTE =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

const estilos = {
  body: {
    margin: 0,
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    boxSizing: "border-box",
    background: `radial-gradient(60% 50% at 50% 40%, rgb(140 102 238 / 0.18), transparent 70%), ${COLOR.fondo}`,
    color: COLOR.texto,
    fontFamily: FUENTE,
    colorScheme: "dark",
  },
  tarjeta: {
    width: "100%",
    maxWidth: "440px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
    textAlign: "center",
  },
  etiqueta: {
    margin: 0,
    fontSize: "12px",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: COLOR.primario,
    fontWeight: 600,
  },
  titulo: {
    margin: "8px 0 0",
    fontSize: "28px",
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },
  texto: { margin: "8px 0 0", color: COLOR.tenue, lineHeight: 1.6 },
  codigo: {
    margin: "8px 0 0",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "12px",
    color: COLOR.tenue,
  },
  acciones: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    justifyContent: "center",
  },
  botonPrimario: {
    appearance: "none",
    border: 0,
    borderRadius: "12px",
    padding: "10px 18px",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: FUENTE,
    cursor: "pointer",
    background: COLOR.primario,
    color: COLOR.sobrePrimario,
  },
  botonSecundario: {
    borderRadius: "12px",
    padding: "9px 17px",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
    border: `1px solid ${COLOR.borde}`,
    background: COLOR.superficie,
    color: COLOR.texto,
  },
} satisfies Record<string, CSSProperties>

export default function ErrorGlobal({ error, retry }: ErrorGlobalProps) {
  return (
    <html lang="es-CO">
      <body style={estilos.body}>
        <title>Error · AMO</title>
        <main style={estilos.tarjeta}>
          <svg
            width="96"
            height="96"
            viewBox="0 0 96 96"
            fill="none"
            aria-hidden
          >
            <circle
              cx="48"
              cy="48"
              r="46"
              stroke={COLOR.primario}
              strokeOpacity="0.25"
              strokeDasharray="3 7"
            />
            <path
              d="M48 16c-13 0-23 10-23 22.5C25 55 48 80 48 80s23-25 23-41.5C71 26 61 16 48 16Z"
              fill={COLOR.primario}
            />
            <circle cx="48" cy="39" r="11" fill={COLOR.fondo} />
            <path
              d="M48 33v7"
              stroke={COLOR.destructivo}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="48" cy="45" r="1.8" fill={COLOR.destructivo} />
          </svg>
          <div>
            <p style={estilos.etiqueta}>AMO</p>
            <h1 style={estilos.titulo}>La aplicación tuvo un problema</h1>
            <p style={estilos.texto}>
              Algo falló al cargar la plataforma. Ya quedó registrado. Intenta
              de nuevo; si persiste, recarga la página en unos minutos.
            </p>
            {error.digest ? (
              <p style={estilos.codigo}>Código de referencia: {error.digest}</p>
            ) : null}
          </div>
          <div style={estilos.acciones}>
            <button type="button" style={estilos.botonPrimario} onClick={retry}>
              Reintentar
            </button>
            {/* Recarga completa a propósito: el layout raíz está roto. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={estilos.botonSecundario}>
              Ir al inicio
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
