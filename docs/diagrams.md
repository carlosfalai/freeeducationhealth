# Diagrams — how FreeEducationHealth works, drawn

Five diagrams, from the widest view to the most specific. They render
directly on GitHub (Mermaid). Everything here matches the code as shipped;
where something is a stated future direction rather than built software,
the diagram says so explicitly.

---

## 1. The whole project at a glance — one engine, an audience for every front-end

```mermaid
flowchart TD
    subgraph CORE["core/ — the shared engine (no side effects, no persistence)"]
        INTAKE["Structured intake<br/>(medical-school-style<br/>question flow)"]
        PANEL["Multi-AI panel<br/>(minimum 2 independent<br/>models must agree)"]
        SCHEMA["Structured recommendation<br/>(schema-constrained, never<br/>free-form chat)"]
        INTAKE --> PANEL --> SCHEMA
    end

    PATIENTS(["Patients, anywhere"]) --- BOT["bot/<br/>Telegram chatbot"]
    CLINICS(["Clinics"]) --- KIOSK["kiosk/<br/>waiting-room tablet"]
    PHYSICIANS(["Physicians"]) --- IHPI["instanthpi/<br/>physician's own<br/>Claude Code session"]
    HOSPITALS(["Hospitals"]) --- EPIC["epic/<br/>reads Epic charts<br/>(SMART on FHIR, read-only)"]
    INDIVIDUALS(["Individuals"]) --- HI["history-insights/<br/>EXPERIMENTAL personal<br/>history reports"]

    BOT <-->|"intake in,<br/>recommendation out"| CORE
    KIOSK <-->|"intake in,<br/>recommendation out"| CORE
    IHPI <-->|"intake in,<br/>recommendation out"| CORE
    EPIC <-->|"intake in,<br/>recommendation out"| CORE
    HI <-->|"intake in,<br/>recommendation out"| CORE
```

Every self-hoster runs their own copy with their own credentials. There is
no shared server, so no central place where anyone's health information
accumulates.

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
such nodes is recorded in the design spec as a future direction — what is
drawn above is what ships today.)
