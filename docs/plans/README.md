# Plans

One file per step of work, written when the plan is agreed and kept after the
work is done. A plan says what we intend to build and why. Its **As built**
section records what actually happened, what changed from the plan, and what
we learned. Together with the [build log](../engineering/build-log.md), this
keeps the product's history readable after the sessions that built it.

**The whole POC:** the [POC plan](poc-plan.md) lists every milestone and its
work packages. Each milestone step gets its own plan here when it starts.

| Plan | Area | Status |
| --- | --- | --- |
| [POC plan: eight milestones](poc-plan.md) | All | Agreed (27 Oct 2026) |
| [M0: foundations and scaffold](m0-foundations.md) | Platform | Scaffold ✅ Built; spikes in progress |
| [Week-1 spikes](spikes.md) | commercetools, money | Planned |
| [Christie Cookie catalog import](christie-catalog-import.md) | Catalog | ✅ Built (28 Oct 2026) |
| [Sender dashboard: Home, Browse, Campaigns, send flow](sender-dashboard.md) | Sender app, campaigns | ✅ Built (28 Oct 2026) |

## Template

```markdown
# <Title>

**Status:** Agreed | Building | Built (`<commit>`)
**Agreed:** <date> · **Built:** <date>

## Goal
One paragraph: what this step achieves and why now.

## Scope
What gets built, as a table or list. What is explicitly not in scope.

## Decisions
Choices made when the plan was agreed, with the reason for each.

## Tests
What proves it works, including what must be refused.

## Docs to update
Which documents change with this step.

## As built
Filled in when done: what changed from the plan, verification results,
commits, and lessons learned.
```
