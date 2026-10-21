import { ImageResponse } from "next/og"

import { AURORA_ICONO, gradienteCss } from "@/components/brand/colores"
import { ICONO_APP } from "@/components/brand/trazos"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

/**
 * Icono de inicio de iOS: cuadrado a sangre (iOS aplica su propia máscara)
 * con la Aurora en diagonal ascendente y el isotipo en blanco.
 */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundImage: gradienteCss(AURORA_ICONO),
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={ICONO_APP.viewBox}
        width={size.width}
        height={size.height}
      >
        <path fill="#FFFFFF" d={ICONO_APP.d} />
      </svg>
    </div>,
    size
  )
}
