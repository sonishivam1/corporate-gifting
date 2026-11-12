# Changelog

What changed for people using the Gifting Marketplace. For how and why each
change was built, see the [build log](docs/engineering/build-log.md).

## Unreleased

### People, teams and invitations
- The account menu now has **My profile** and **Organization & teams**.
- My profile shows your name, email, roles and companies; change your name
  there when your company's platform allows it.
- Owners and admins can give and take away roles, remove people, create and
  rename teams, and invite people by email. An invitation link works for 7
  days, only for the address it was sent to; resend or withdraw it any time.
- Admins can't change owners, nobody can change their own roles, and a
  company always keeps an owner.

### Companies and roles
- The dashboard shows the company and team you belong to. If you're in
  several companies, switch between them at the top; owners and admins can
  switch between every team.
- What you can do follows your role: senders send and build collections,
  approvers approve (never their own sends), owners and admins can do both
  (admins don't approve). Buttons you can't use are hidden.
- Signed in but not in a company yet? The dashboard says so, and who can
  add you.
- If you're removed from a company or team you had open, the dashboard
  opens your first one instead, and a removed role stops sends and
  approvals straight away.

### Gift bundles
- Send several gifts at once: in "Specific gifts", pick up to 5 products and
  every recipient gets all of them. The review shows the price per
  recipient, the sum of the gifts.
- Recipients see "Your gifts", enter their address once, and everything is
  ordered together. If one gift is out of stock, nothing is ordered yet and
  they are asked to come back later.

### Build your own collection
- A new Collections page lists your company's collections and the
  ready-made ones. Build a collection by picking products, whole brands or
  tags, with a preview of what fits the budget; everyone in your company can
  send it. Edit or archive it later; gifts already sent still work.
- "Let them choose" is back in the send flow: recipients pick one gift from
  a collection, up to your budget. Home shows your collections again.

### Upload a recipient list
- In a new campaign, senders can upload a CSV of email, first name and
  last name. The preview shows who is ready and which lines are skipped
  and why; everyone valid joins the company directory and is added to the
  campaign. A template is offered for download.

### Simpler send flow
- The send flow no longer asks for an occasion, and Browse gifts no longer
  filters by one. A campaign without a name is called after its greeting's
  headline.
- Gifts go out by email; the delivery choice is hidden until other
  channels can send.
- Picking the gift in a new campaign has a search by name, brand or
  option.

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
