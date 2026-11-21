---
title: "Buy, build, or build the missing ten percent"
date: 2026-08-12
summary: "The standard advice is buy, don't build, and it is mostly right. It fails in a specific way for small businesses, and the fix is smaller than either option."
tags: ["note", "operations"]
---
The standard advice is buy, don't build. It is good advice and I give it more
often than the opposite. Software you buy is maintained by someone else, tested
by more people than you will ever have, and available on Tuesday rather than in
the spring.

Where it fails is rarely the price and almost never the features. It fails at
the last mile. The bought thing does ninety percent of the job, the remaining
ten percent is the part that is specific to how this business actually works,
and there is no way to get it. So the business does that ten percent by hand,
every day, forever, and slowly concludes that the software was a disappointment.
It was not. It was ninety percent, which is a lot.

## Three buckets

Nearly everything sorts into one of them, and the sorting is
most of the work.

The first is *commodity*. Accounting, payroll, email, calendars, storage,
payments. Nobody has ever won anything by having their own. Buy, and do not
customise beyond what the settings screen offers.

The second is *standard but yours to configure*. A CRM, a booking system, a
help desk. You buy these too, but you should expect to spend real time on setup,
and you should be honest that the product's assumptions about how work flows are
now your assumptions. That is usually a fair trade and occasionally a fight.

The third is *genuinely specific*. Small, usually. It is the thing your business
does that its competitors do differently, or the rule that exists because of a
regulator, a contract, or a decision made in 2014 that nobody can undo. This is
the bucket worth building.

## The missing ten percent is usually a join, not a feature

In practice, the
thing that needs building is not a new application. It is getting data out of
one system, into the shape this process expects, and into another — on a
schedule, reliably, with a record of what it did. It is the report that exists
in nobody's export format. It is the form that has to ask the four questions the
bought product does not have fields for. Framed as *build a system*, it looks
expensive. Framed as *build the join*, it is often a few days of work and one
small thing that does one job. (The [parts of an operations
platform](/notes/what-an-operations-platform-is-made-of/) are mostly settled
already; the joins are where the specific work always turns out to live.)

## When to build the whole thing anyway

Two cases. First, when the bought
option in that second bucket would impose a process you would spend years
fighting — the fight costs more than the build. Second, when the ten percent turns out not to be ten
percent. If you find yourself designing around the bought product on every
screen, the sorting was wrong; go back to the buckets.

## The trap

Small custom pieces get built and then quietly become unowned.
Somebody made it, it works, and two years later nobody knows how. That is a real
cost and it is the strongest argument the buy-everything camp has. The defence
is not to avoid building — it is to keep the built part small enough and boring
enough that it can be read in an afternoon, and to write down what it does and
why while you still remember. If a custom piece cannot be explained on one page,
it has grown into something that needs an owner.

## Where AI sits in this

Mostly in the third bucket, and mostly as a
component: reading the free text, drafting the first version, guessing the
category so a person can correct it. It is a poor reason to build something you
would otherwise buy, and a good way to finish the ten percent that used to
require a person retyping.

So the question is not build or buy. It is: which part of this is actually ours?
Answer that honestly and the rest is procurement.
