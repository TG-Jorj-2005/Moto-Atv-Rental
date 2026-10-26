# Contributors and development assistance

## Author and owner

**TG-Jorj-2005** — student of CTI, UGAL; author and owner of the project. The author defined the scope and every business rule, approved or rejected each architectural decision, directed the work and reviewed its results. The prompts are recorded in [log.md](../log.md) and the resulting decisions in [decision.md](../decision.md).

## AI development assistance

The implementation, tests and documentation of this repository were produced with **AI assistance from Anthropic's Claude, used through the Claude Code command-line tool**, working in the author's local checkout under the author's instructions. In practice the assistant:

- proposed designs and asked for approval where the author required it (see the working agreement in P25 of [log.md](../log.md));
- wrote and changed code, migrations, tests, the end-to-end and load-test scripts and the documentation;
- ran the checks and reported their results.

The author decided what to build, approved or rejected the proposals and accepted the result. The assistant is a tool and is **not a person, an account, or a GitHub collaborator**: it has no identity in this repository, no repository permissions, and no commits of its own.

The history of this repository does not record other assistants. If the author also used other tools (for example another chat assistant) while working on the project, the author should add them here; this file only states what the repository's history shows.

## Git authorship

- Every commit is authored with the author's own Git identity, as configured on the author's machine. No commit identity was invented or changed. The only rewrite of history was the one the author asked for in the first days of the project (the first commit, to remove a co-author line; see below).
- At the author's request (P11–P13 in [log.md](../log.md)) commits carry **no** `Co-Authored-By` trailer for the assistant.
- Project metadata (`package.json`) does not claim a human developer other than the author.

## Third-party material

- Vehicle photographs in `public/vehicles/` and `public/gallery/` are from Wikimedia Commons under their own open licences (CC BY, CC BY-SA, public domain). Author, licence and source of each are in `src/lib/photo-credits.json` and are shown next to the photo on the website.
- Vehicle specifications come from the manufacturers' published pages (see `decision.md`, section 11 and 16).
- The software dependencies are listed in `package.json` with their own licences.
