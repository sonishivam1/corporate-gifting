# Changelog

What changed for people using the Gifting Marketplace. For how and why each
change was built, see the [build log](docs/engineering/build-log.md).

## Unreleased

### Live gift catalog
- Browse gifts and the send flow can show the live catalog: every vendor's
  products with photos, priced from the lowest option, and only what is in
  stock.
- A gift that comes in several options (size, flavour, tin) is one card;
  when sending it, the sender picks the option everyone gets.

### Sender dashboard
- Senders can browse gifts by budget, occasion and category, and send a
  campaign in four steps: gift, greeting, recipients and delivery, review.
- The review shows what the send holds from the team budget. Large sends
  wait for the team's approver, who can approve or decline them.
- Campaigns show a gift funnel and each recipient's status. Gift links and
  QR codes are shown once, with a CSV of every link.
- Demo data only, with development sign-in. Messages aren't delivered yet.

### Foundations
- The project exists: four web apps (sender dashboard, recipient experience,
  vendor portal-lite, ops admin), the Gifting API and the worker, each
  showing a placeholder page or health check. Nothing a sender or recipient
  can use yet.
- All four apps share one component library (shadcn/ui) and follow the
  system's light or dark mode.
