# HeadCanon colour

How the brand colours were chosen, what was rejected, and the values to use.
The logo candidates in `logos.html` switch between the three schemes below.

## What the colours have to do

- **Not be a certainty state.** The viewer already speaks in colour: green is
  stated, amber is assumed, violet is open, red is contested, blue is resolved
  and the dependency lines. The mark sits in that header. A brand colour that
  reads as one of those states would make every logo a status badge.
- **Not look official.** HeadCanon is a Claude Code plugin, not an Anthropic
  product. Anthropic's clay orange (hue 15) and ivory are off the table.
- **Not be the default developer-tool look.** Black on white (Vercel, Cursor)
  and violet gradients (Linear, most AI tools) are owned by others.
- **Survive everywhere the name appears:** a GitHub README on white and on
  dark, a 16px favicon, a terminal with sixteen colours, a printed page.
- **Fit the words.** Canon, writ, premise, journey: the vocabulary is a written
  record. Ink and paper are the honest ground. Head: one accent, held inside.

## Hue map

Measured hue angles of what already exists, so the accent can keep its distance.

| Colour | Hue |
| --- | --- |
| stated green `#1f8a4c` | 145 |
| resolved / lines blue `#2563eb` | 221 |
| assumed amber `#b7791f` | 36 |
| open violet `#6b5bd2` | 248 |
| contested red `#d13438` | 358 |
| Anthropic clay `#D97757` | 15 |

Free bands: 160 to 200 (teal, cyan), 270 to 340 (magenta, rose), 60 to 90
(olive, chartreuse). Rose reads consumer. Olive reads military or reads as a
dirty green beside the stated green. Teal is the band left, and it has the
best story: verdigris is the patina that forms on bronze and copper, the
colour of things made to stay public for a long time.

## The three schemes

### A. Ink & Verdigris (recommended)

| Role | Light | Dark | Measured contrast |
| --- | --- | --- | --- |
| ink | `#161A22` | `#F5F1E8` (as text) | 15.5:1 ink on paper |
| paper | `#F5F1E8` | `#161A22` (as ground) | |
| accent | `#0B7368` | `#3FC1B0` | 5.1:1 on paper, 7.9:1 on ink |
| slate (secondary text) | `#5A6472` | `#98A0AD` | 5.3:1 on paper |

Accent hue 174, thirty degrees from the stated green and fifty from the blue.
Both accent values pass AA for body text, so the accent can be a link, not
only a decoration. The paper is warm, the ink is blue-black: the pairing reads
as a page, not a screen. In a sixteen-colour terminal the accent maps to ANSI
cyan, so the CLI can print its name in brand colour without truecolor.

Pros: distinct in the developer-tool field, no state collision, one accent
that works on both grounds, a story that fits the words.
Cons: teal is a cool colour and never looks urgent, so calls to action on the
site will rely on size and placement rather than colour.

### B. Graphite & Cobalt

| Role | Light | Dark |
| --- | --- | --- |
| ink | `#1A1D23` | `#F6F7F9` |
| paper | `#F6F7F9` | `#1A1D23` |
| accent | `#2454D6` (5.9:1 on paper) | `#6D9CFF` (6.3:1 on ink) |
| slate | `#5F6673` | `#98A0AD` |

This is the viewer's own accent, darkened for text. Pros: the brand and the
app are one palette with no work. Cons: hue 224 is the resolved state and
the dependency line; the mark becomes a resolved badge, and blue is the most
common colour in software branding.

### C. Midnight & Chalk

| Role | Light | Dark |
| --- | --- | --- |
| ink | `#0F1115` | `#FAFAF7` |
| paper | `#FAFAF7` | `#0F1115` |
| accent | none: the ink | none: the chalk |
| slate | `#6B7280` | `#98A0AD` |

No colour at all. Pros: timeless, prints anywhere, cannot collide with a
state. Cons: anonymous among black developer brands, nothing to own, and the
two-tone wordmark loses its second tone.

## Rejected accents

- **Oxblood or rubric red** (the colour of headings in manuscripts, the most
  literal "canon" colour): hue 350 to 10, indistinguishable from contested red
  at 16px.
- **Bronze or ochre**: hue 30 to 45, the assumed amber.
- **Gold**: same band, and reads as a badge of approval.
- **Violet or indigo**: the open state, and the AI-tool cliché.
- **Phosphor green or amber** (the terminal story): both are states.

## Rules of use

- One accent per composition. In the lockup it is the word Canon and one
  element of the mark; everything else is ink or paper.
- The accent never carries a certainty state. States keep their own colours.
- On dark grounds use the dark accent value, never the light one.
- Slate is for secondary text only, never for marks.
- The mark must survive in one colour; `logos.html` shows every candidate in
  mono and on ink.

## Type

Wordmark: IBM Plex Sans SemiBold, outlined to paths in the SVGs so no font is
needed to render them. Plex is open (OFL) and comes as a family: Plex Mono for
code and the CLI, Plex Serif if canon pages ever want a reading face. The two
tones in the wordmark split the compound at the capital: Head in ink, Canon
in accent.
