---
title: "What an operations platform is actually made of"
date: 2026-08-11
summary: "The phrase suggests something large and clever. The useful version is a short list of unremarkable parts, and the cost sits almost entirely in the joins between them."
tags: ["note", "operations"]
---
When someone asks for an operations platform, they usually have a picture in
mind, and the picture is bigger than the thing they need. It has dashboards in
it. The version that earns its keep is a short list of unremarkable parts, and
the difficulty is almost never in the parts.

## The inventory

Here is the inventory that keeps turning up.

**A register of what exists.** People, customers, sites, vehicles, properties —
whatever the nouns of the business are, written down once, in one place, with
one identifier each. A surprising number of the messes I am asked to look at are
register problems wearing a costume. Two systems disagree about how many of
something there are, and every report downstream inherits the argument.

**A queue of what needs doing.** Jobs, shifts, visits, orders, cases. Something
has to hold what is outstanding, who it belongs to, and when it is late. This is
usually the part a business already does well, in a spreadsheet somebody
maintains with real care, and it is worth understanding that spreadsheet
properly before replacing it.

**A capture point.** Where the person doing the work records that they did it.
I have written about this one [before](/notes/unglamorous-half-of-automation/)
and will not repeat myself, except to say that its position in the list matters
more than its design: it wants to sit where the work actually happens, not where
the admin happens.

**A record of what happened.** Not a report — the layer underneath one. Who did
what, when, and what changed as a result, written as a side effect of the normal
flow rather than as an extra task nobody has time for.

**A shelf for documents.** Contracts, certificates, photos, forms. The only
requirement that matters is that a person can find the right one while somebody
is waiting on the phone.

**The dull outside edge.** Permissions, an export, something that sends a
message when a date passes, a way to correct a mistake, and a way to get all of
your data back out. This is the part every estimate underestimates, including
mine.

That is close to the whole list. None of it is novel and none of it is the hard
part.

## The hard part is the joins

Each item above is, on its own, a solved problem
you could buy three versions of before lunch. The work is in the handoffs: what
happens to the queue when the register changes, which fields have to agree, what
the system does when a job is done by somebody it was not assigned to, and which
of the eleven things that could happen next is the one this business actually
does. Those joins are the shape of how a particular organisation works, and they
are the reason two businesses in the same sector rarely fit the same system
without one of them having to give something up.

## What is not on the list

Dashboards, mostly — a dashboard is a view of the
record and cannot be built before it. Also an app, usually. Also AI as a
foundation rather than a component, which I have argued elsewhere. These often
arrive stated as requirements and turn out, once the need behind them is
tested, to be preferences.

## Why buying does not delete the list

A bought platform is not an alternative
to the inventory. It is a decision about which parts you take as given and which
joins you keep ownership of. That is a genuinely good trade in most cases, and
it is worth making deliberately rather than discovering eight months in. Which
part is worth building yourself, and which part you should simply pay for, is
the more interesting question — and one I have
[taken up separately](/notes/buy-build-or-the-missing-ten-percent/).

The practical version: before scoping a platform, write the six lines above for
your own business, in your own nouns, on one page. Most of what looks like a
software decision resolves itself once that page exists.
