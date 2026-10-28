# Gifting Marketplace documentation

The Gifting Marketplace is a corporate gifting platform on commercetools.
Companies fund team budgets and send gifts through many channels. Recipients
pick from a multi-brand collection within a budget, and vendors ship what was
chosen. Money is held, charged and released exactly once.

Every document marks what is **Built** today and what is **Planned**. When the
code and a document disagree, the code is right and the document needs fixing.

## Map

| Folder | Read it when you want to know… | Documents |
| --- | --- | --- |
| [product/](product/) | what we are building, for whom, and in what order | [Vision](product/vision.md) · [Personas](product/personas.md) · [Features](product/features.md) · [Roadmap](product/roadmap.md) · [Glossary](product/glossary.md) |
| [architecture/](architecture/) | how the system fits together and why | [Overview](architecture/overview.md) · [Data model](architecture/data-model.md) · [commercetools design](architecture/commercetools.md) · [Money and the ledger](architecture/money-and-ledger.md) · [Key flows](architecture/flows.md) · [Channels and integrations](architecture/integrations.md) · [Security](architecture/security.md) · [Decisions](architecture/decisions/) |
| [design/](design/) | how the apps look and behave | [Design system](design/design-system.md) |
| [engineering/](engineering/) | how to work in the codebase | [Getting started](engineering/getting-started.md) · [Conventions](engineering/conventions.md) · [Testing](engineering/testing.md) · [Git workflow](engineering/git-workflow.md) · [Build log](engineering/build-log.md) |
| [plans/](plans/) | what each step set out to build, and what was built | [Plans](plans/README.md) · [POC plan](plans/poc-plan.md) · [Spikes](plans/spikes.md) |
| [technical/](technical/) | how it is configured, deployed and run | [Configuration](technical/configuration.md) · [API](technical/api.md) · [Deployment](technical/deployment.md) · [Operations](technical/operations.md) |
| [business/](business/) | why it exists and what is still undecided | [Benchmark and positioning](business/positioning.md) · [Open questions](business/open-questions.md) |
| [reference/](reference/) | the source documents | [Architecture v2 (Word)](reference/Gifting-Marketplace-POC-Architecture-v2.docx) |

## The system on one page

```mermaid
flowchart LR
  sender(["Sender"])
  recipient(["Recipient"])
  vendor(["Vendor"])
  ops(["Ops"])
  subgraph gm["Gifting Marketplace"]
    apps["Web apps<br/>sender · recipient · vendor · ops"]
    api["Gifting API<br/>10 modules"]
    worker["Workers<br/>sends · reminders · expiry · events"]
    db[("MongoDB Atlas<br/>8 collections")]
  end
  ct["commercetools<br/>Business Units · catalog · carts<br/>payments · orders · shipments"]
  queue["Queue<br/>commercetools events"]
  ext["Providers<br/>email · SMS · Slack · Teams<br/>Stripe · HR API · identity"]

  sender --> apps
  recipient --> apps
  vendor --> apps
  ops --> apps
  apps --> api
  api <--> db
  worker <--> db
  api --> ct
  ct -.-> queue
  queue -.-> worker
  worker --> ext
  api --> ext

  classDef person fill:#FDE7E1,stroke:#E8664A,stroke-width:2px,color:#1B2340;
  classDef appNode fill:#DCE6FB,stroke:#2F4A8A,stroke-width:2px,color:#13203F;
  classDef apiNode fill:#EDE3FB,stroke:#7B4FD0,stroke-width:2px,color:#2A1450;
  classDef jobNode fill:#E4F4FB,stroke:#2B8CB8,stroke-width:2px,color:#0D2F3F;
  classDef dataNode fill:#DFF5EA,stroke:#2E9E6A,stroke-width:2px,color:#0F3B27;
  classDef ctNode fill:#FFF1D6,stroke:#C98A12,stroke-width:2px,color:#3D2A05;
  classDef external fill:#ECEFF3,stroke:#6B7685,stroke-width:2px,color:#1F2933;
  class sender,recipient,vendor,ops person;
  class apps appNode;
  class api apiNode;
  class worker jobNode;
  class db dataNode;
  class ct,queue ctNode;
  class ext external;
  style gm fill:#F3F6FD,stroke:#2F4A8A,stroke-width:2px,color:#13203F
```

Solid arrows are calls; dashed arrows are events. The full picture, module by
module, is in the [architecture overview](architecture/overview.md).

## Keeping docs current

- Change the doc in the same pull request as the code it describes.
- New architectural choices get a decision record in
  [architecture/decisions/](architecture/decisions/).
- Diagrams are Mermaid inside Markdown, so they diff and review like code.
  Colour key: coral = people · navy = apps · violet = Gifting API · teal =
  workers · green = MongoDB · amber = commercetools · grey = external.
