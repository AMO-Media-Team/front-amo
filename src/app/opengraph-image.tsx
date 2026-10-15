import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { ImageResponse } from "next/og"

import { LILA, NEUTRO } from "@/components/brand/colores"
import { ISOTIPO, LOGOS } from "@/components/brand/trazos"

export const alt =
  "AMO — Advertising Market Optimization. Pauta hiperlocal, medida y liquidada con confianza."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Los recursos no dependen de la solicitud: se leen una vez al cargar el módulo.
const logo = await readFile(
  join(process.cwd(), "public/brand/amo-logo-horizontal-oscuro.svg"),
  "base64"
)
const jakartaSemiBold = await readFile(
  join(process.cwd(), "scripts/brand/fuentes/PlusJakartaSans-SemiBold.ttf")
)

const ALTO_LOGO = 92
const AURORA_FONDO = [
  "radial-gradient(circle at 88% 8%, rgba(199, 125, 255, 0.30), transparent 42%)",
  "radial-gradient(circle at 62% 120%, rgba(91, 108, 240, 0.26), transparent 48%)",
  "radial-gradient(circle at 0% 0%, rgba(140, 102, 238, 0.14), transparent 40%)",
].join(", ")

// Imagen de la raíz: sin segmentos dinámicos no hace falta `params` (en Next 16 sería una promesa).
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: NEUTRO.fondoOscuro,
        backgroundImage: AURORA_FONDO,
        fontFamily: "Plus Jakarta Sans",
        padding: "84px 88px",
      }}
    >
      {/* Isotipo de gran formato como marca de agua: los arcos "emiten" hacia la esquina. */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={ISOTIPO.viewBox}
        width={560 * ISOTIPO.proporcion}
        height={560}
        style={{
          position: "absolute",
          right: -110,
          bottom: -150,
          opacity: 0.07,
        }}
      >
        <path fill={LILA[200]} d={ISOTIPO.pin + ISOTIPO.arcos.join("")} />
      </svg>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <img
          src={`data:image/svg+xml;base64,${logo}`}
          alt=""
          height={ALTO_LOGO}
          width={ALTO_LOGO * LOGOS.horizontal.proporcion}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 60,
            lineHeight: 1.12,
            letterSpacing: -1.5,
          }}
        >
          <span style={{ color: LILA[300] }}>Pauta hiperlocal,</span>
          <span style={{ color: LILA[50] }}>
            medida y liquidada con confianza
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontSize: 20,
            letterSpacing: 5,
            color: LILA[300],
          }}
        >
          <div
            style={{
              width: 56,
              height: 3,
              borderRadius: 2,
              backgroundImage:
                "linear-gradient(90deg, #5B6CF0, #8C66EE, #C77DFF)",
            }}
          />
          ADVERTISING MARKET OPTIMIZATION
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Plus Jakarta Sans",
          data: jakartaSemiBold,
          style: "normal",
          weight: 600,
        },
      ],
    }
  )
}
