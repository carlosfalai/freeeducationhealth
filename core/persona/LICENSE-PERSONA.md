# License for `core/persona/`

The contents of this directory (`core/persona/`) — the clinical
communication style guide and any related behavioral-rule data used by the
panel's system prompts — are licensed under the **Creative Commons
Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**, not
the MIT license that covers the rest of this repository.

Full license text: https://creativecommons.org/licenses/by-nc/4.0/

## What this means in practice

- **Anyone may run it.** Self-hosting this project, including
  `core/persona/`, for patients, a physician's own practice, a clinic, or a
  hospital — free of charge, for any purpose including a doctor's or
  institution's own clinical use — is allowed and encouraged. That is the
  entire point of this project.
- **No one may repackage it into a commercial product.** You may not take
  the style guide or behavioral rules in this directory, alone or bundled,
  and sell, sublicense, or otherwise commercially redistribute them as (or
  as part of) a paid product or service offered to third parties.
- **Attribution is required** for any redistribution or adaptation, per the
  standard CC BY-NC terms.

## Why this directory is licensed differently from the rest of the repo

Everything else in this repository — the code in `core/providers/`,
`core/panel/`, `core/intake/`, `core/schema/`, `bot/`, `instanthpi/`,
`kiosk/`, and `epic/` — is MIT-licensed, because it is general-purpose
software infrastructure: anyone can copy, modify, or commercialize it
freely.

`core/persona/` is different in kind, not just in code. It encodes a
specific physician's mined clinical communication style — how one real
doctor, refined over years of practice, actually talks to patients: what to
lead with, what to leave out, when not to reflexively refer to emergency
care, how much to explain and how much to withhold. That voice is a
personal and professional asset, not generic software. Licensing it CC
BY-NC keeps it free for exactly the use this project exists for — anyone,
anywhere, running it to give patients better guidance at no cost — while
preventing a third party from taking that specific mined voice, repackaging
it, and selling it as their own commercial clinical-AI product without
having done any of the work of developing it.

If you are unsure whether your use qualifies as "noncommercial" under this
license, the safe assumption is: if you are running this to help patients
(including your own patients, if you are a physician) without charging them
or a third party specifically for access to this persona/style content,
you are fine. If you are bundling it into something you sell, you need a
separate arrangement — this directory does not grant that right.
