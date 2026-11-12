/**
 * The prototype's typefaces (docs/design/gifting-prototype.html): DM Sans for
 * text and Sora for headings. Each app's root layout puts `fontVariables` on
 * <html> (where globals.css resolves `--font-sans`); globals.css maps them to
 * `font-sans` and `font-heading`.
 *
 * The files live in `../fonts` (latin subset, variable weight, SIL Open Font
 * License; the licences sit beside them), so the build never fetches from
 * Google Fonts. `next/font/google` failed CI builds when the runner got an
 * unexpected response from Google ("next/font/google queries have exactly one
 * entry").
 */
import localFont from "next/font/local";

const body = localFont({
  src: "../fonts/dm-sans-latin.woff2",
  weight: "100 1000",
  style: "normal",
  variable: "--font-body",
  display: "swap",
});

const heading = localFont({
  src: "../fonts/sora-latin.woff2",
  weight: "600 800",
  style: "normal",
  variable: "--font-display",
  display: "swap",
});

export const fontVariables = `${body.variable} ${heading.variable}`;
