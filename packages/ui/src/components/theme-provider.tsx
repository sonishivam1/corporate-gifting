"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * next-themes renders an inline script that sets the theme before the page
 * paints. The server's copy runs on load; React 19.2 then warns about the
 * same <script> when it renders on the client ("Encountered a script tag"),
 * so in the browser it is marked non-executable. The script already
 * suppresses hydration warnings, so the type difference is silent.
 */
const scriptProps = typeof window === "undefined" ? undefined : ({ type: "text/plain" } as const);

/** Light and dark mode for every app: follows the system, switches by the `dark` class. */
function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange scriptProps={scriptProps} {...props}>
      {children}
    </NextThemesProvider>
  );
}

export { ThemeProvider };
