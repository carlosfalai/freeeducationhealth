# Diagrams — how FreeEducationHealth works, drawn

Five diagrams, from the widest view to the most specific. They render
directly on GitHub (Mermaid). Everything here matches the code as shipped;
where something is a stated future direction rather than built software,
the diagram says so explicitly.

---

## 1. Which piece is for me? — each person installs ONLY what they need

This project is one system only to the people who built it. To everyone
else it is five separate tools: **you pick the one row below that describes
you, install only that piece, and follow only that piece's instructions**
— each folder ships with its own complete setup guide, and each is
available as its own standalone download.

There is **no engine service and nothing shared at runtime**. `core/` is a
code *library* — the intake/panel/recommendation logic — and every
deployment carries its **own copy inside itself**, called as a local
function on the self-hoster's own machine. What the five front-ends share
is source code, the way two clinics might use the same textbook: same
content, separate books.

```mermaid
flowchart TD
    PATIENTS(["Patients, anywhere"]) --- BOT
    CLINICS(["Clinics"]) --- KIOSK
    PHYSICIANS(["Physicians"]) --- IHPI
    HOSPITALS(["Hospitals"]) --- EPIC
    INDIVIDUALS(["Individuals"]) --- HI

    subgraph BOT["bot/ — Telegram chatbot"]
        C1["Telegram intake +<br/>its own local copy of core/<br/>(intake -> multi-AI panel -><br/>structured recommendation)"]
    end
    subgraph KIOSK["kiosk/ — waiting-room tablet"]
        C2["check-in page +<br/>its own local copy of core/"]
    end
    subgraph IHPI["instanthpi/ — the physician brain"]
        C3["your coding-agent session +<br/>Spruce, cards, PDF, fax +<br/>its own local copy of core/"]
    end
    subgraph EPIC["epic/ — Epic reader, read-only"]
        C4["SMART on FHIR chart read +<br/>its own local copy of core/"]
    end
    subgraph HI["history-insights/ — EXPERIMENTAL"]
        C5["personal history reports +<br/>its own local copy of core/"]
    end
```

Every self-hoster runs their own copy with their own credentials. There is
no shared server and no shared engine, so there is no central place where
anyone's health information accumulates — and nothing that can be switched
off for everyone at once.

---

## 2. A patient's journey through the bot (for the public)

```mermaid
flowchart TD
    START["You message the bot<br/>on Telegram"] --> BANNER["First thing you see:<br/>this is NOT a doctor.<br/>Emergencies go to real care, now."]
    BANNER --> QS["A few structured questions:<br/>what, since when, how bad,<br/>red-flag screening"]
    QS --> SCRUB["Local privacy filter strips<br/>emails, phone numbers, ID numbers<br/>before anything leaves your server"]
    SCRUB --> PANEL["2 or more independent AI models<br/>answer the same case separately"]
    PANEL --> AGREE{"Do the<br/>models agree?"}
    AGREE -->|Yes| REC["Plain-language considerations<br/>and practical next steps"]
    AGREE -->|No| FLAG["You are TOLD they disagreed.<br/>Disagreement is shown,<br/>never hidden."]
    FLAG --> REC
    REC --> FAQ["Short FAQ: what this is,<br/>what it is not, whom to trust"]
    FAQ --> VISIT["You arrive at your next doctor visit<br/>prepared: organized symptoms,<br/>history, and questions"]
```

The goal of every session is the last box: **prepare for a doctor visit**,
even where that visit may be far away — not to replace it.

---

## 3. A physician's daily loop (instanthpi/)

```mermaid
flowchart TD
    INBOX["Your Spruce inbox:<br/>unread patient messages"] --> DRAFT["Your own Claude Code session<br/>drafts a reply using the<br/>multi-AI panel"]
    DRAFT --> CARD["Review card:<br/>what the patient said,<br/>panel recommendation,<br/>numbered plan options,<br/>pre-drafted reply"]
    CARD --> DECIDE{"You decide.<br/>Nothing is ever sent<br/>without you."}
    DECIDE -->|approve| EXEC["Execute the chosen option"]
    DECIDE -->|edit, then approve| EXEC
    DECIDE -->|dismiss| SKIP["Recorded as dismissed,<br/>nothing sent"]
    DECIDE -->|option none| NONE["Recorded as handled.<br/>You take it from here<br/>(e.g. a phone call).<br/>Nothing sent."]
    EXEC --> REPLY["Send the Spruce reply"]
    EXEC --> PDF["Generate a referral or<br/>form PDF (unsigned unless<br/>YOU configured a signature)"]
    EXEC --> FAX["Fax via your own<br/>SRFax account"]
    REPLY & PDF & FAX --> DONE["Marked sent, next card"]
```

The AI drafts; **the physician remains the author of record** — the same
relationship as with a scribe or dictation service.

---

## 4. Inside the multi-AI panel — why a committee, not one model

```mermaid
flowchart TD
    IN["One structured case<br/>(schema-validated intake)"] --> A["Model A<br/>(e.g. Anthropic)"]
    IN --> B["Model B<br/>(e.g. DeepSeek)"]
    IN --> C["Model C<br/>(e.g. local/Ollama)"]
    A & B & C --> PARSE["Each answer parsed and<br/>schema-checked independently"]
    PARSE --> COUNT{"Did at least<br/>panelSize models<br/>answer properly?"}
    COUNT -->|No| HARDFAIL["HARD FAILURE — the panel throws.<br/>It never silently downgrades<br/>to a single model's answer."]
    COUNT -->|Yes| MERGE["Merge answers:<br/>considerations clustered,<br/>next steps deduplicated"]
    MERGE --> REDFLAG["Red flags: safety-first UNION.<br/>One model raising a flag<br/>is enough to keep it."]
    REDFLAG --> DIV{"Material<br/>disagreement?"}
    DIV -->|Yes| DFLAG["divergenceFlag: true —<br/>surfaced to the user,<br/>most-cautious summary chosen"]
    DIV -->|No| OUT["Structured recommendation<br/>+ which models were consulted"]
    DFLAG --> OUT
```

In a clinic, a physician reviews the AI's output. In a free worldwide
deployment there is no physician behind every session — **the panel's
required consensus is what substitutes for that oversight**, and its
disagreement is always shown rather than resolved by picking a favorite.

---

## 5. The deployment topology — many independent nodes, no center

```mermaid
flowchart TD
    subgraph N1["A family's node"]
        B1["bot/ +<br/>local or API models"]
    end
    subgraph N2["A physician's node"]
        I2["instanthpi/ +<br/>their own credentials"]
    end
    subgraph N3["A clinic's node"]
        K3["kiosk/ + carousel"]
    end
    subgraph N4["A hospital's node"]
        E4["epic/ or their own<br/>front-end on core/"]
    end
    NOCENTER(("There is deliberately<br/>NO central server here.<br/>Nothing to subpoena, breach,<br/>monetize, or switch off."))
    N1 -.-> NOCENTER
    N2 -.-> NOCENTER
    N3 -.-> NOCENTER
    N4 -.-> NOCENTER
    N1 <-->|"patient brings their<br/>portable PDF summary"| N2
    N3 <-->|"same review-card<br/>format"| N2
```

Each deployment stands alone and keeps working regardless of what happens
to any other — including this repository's original host: the code is
permissively licensed and downloadable as self-contained archives
(`package-releases.cjs`), so any node can seed new ones. Local physicians
can work with nearby self-hosted nodes using the same card formats and
portable summaries. (The longer-term vision of coordinated networks of
such nodes is recorded in `docs/design-decisions.md` as a future direction
— what is drawn above is what ships today.)
