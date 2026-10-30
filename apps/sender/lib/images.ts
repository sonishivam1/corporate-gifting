/**
 * Hosts whose product photos Next.js resizes (next.config.ts). They are where
 * the catalog imports keep images: vendor CDNs and commercetools' own.
 */
export const IMAGE_HOSTS = ["res.cloudinary.com", "bynder.onerichs.com", "images.cdn.us-central1.gcp.commercetools.com"] as const;

/**
 * A photo from any other host is shown as it is: an unlisted host would
 * otherwise make next/image throw and take the whole page down.
 */
export function isOptimizable(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (IMAGE_HOSTS as readonly string[]).includes(hostname);
  } catch {
    return false;
  }
}
