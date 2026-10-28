# Changelog

What changed for people using the Gifting Marketplace. For how and why each
change was built, see the [build log](docs/engineering/build-log.md).

## Unreleased

### Foundations
- The project exists: four web apps (sender dashboard, recipient experience,
  vendor portal-lite, ops admin), the Gifting API and the worker, each
  showing a placeholder page or health check. Nothing a sender or recipient
  can use yet.
- All four apps share one component library (shadcn/ui) and follow the
  system's light or dark mode.
