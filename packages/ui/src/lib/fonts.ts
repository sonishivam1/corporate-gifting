/**
 * The prototype's typefaces (docs/design/gifting-prototype.html): DM Sans for
 * text and Sora for headings, self-hosted by next/font at build time. Each
 * app's root layout puts `fontVariables` on <html> (where globals.css resolves
 * `--font-sans`); globals.css maps them to
 * `font-sans` and `font-heading`.
 */
import { DM_Sans, Sora } from "next/font/google";

const body = DM_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const heading = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });

export const fontVariables = `${body.variable} ${heading.variable}`;
