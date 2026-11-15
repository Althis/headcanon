# Requirement quality, from the literature, 2026-11-15

What software engineering defines as the quality of one requirement, of a set of requirements and of their hierarchy, read for HeadCanon on 2026-11-15 and distilled into binary checks with provenance. Eleven source families were read by one agent each (ISO/IEC/IEEE 29148, the INCOSE Guide to Writing Requirements, EARS, KAOS goal refinement, Zave and Jackson with the WRSPM reference model, the ambiguity literature and its tools, the requirements-smells work of Femmer and others, the quality attributes of Davis, IEEE 830 and Genova, decomposition and satisfaction arguments, glossary and terminology consistency, inspection and reading techniques); 892 checks were extracted with a quote and a location each; every one was re-read against its source by a second agent (none refuted; ten of the eleven families were read from the primary source, the decomposition family from secondaries); one agent wrote the catalogue below, and a last one listed what the catalogue misses, which is the appendix. The catalogue is the agents' text, kept whole. The format in `packages/canon/src/format.ts` carries the checks HeadCanon adopted from it, under Quality, which `HC format` prints and the branch agent and the refiner read.

What HeadCanon took, in brief: the Intent stays an indicative encyclopedia sentence, so the "mood by slot" resolution of section 3.4 applies and modals are flagged rather than required; the Check takes the guard-and-assertion shape of section 3.3; the deterministic lexicons of section 8 run in `HC check`, as warnings where the literature measured precision at or above 0.7 (subjective language, loopholes, open-ended terms, vague adjectives and adverbs) and for placeholders and hedges, as notes elsewhere; the judgment checks of sections 2 to 6 that a reader can answer yes or no from the text are the reviewer's list; necessity and correctness against the source stay with the human, since the inspection studies found machine reviewers miss them. Thresholds the sources leave "per organization" (word counts, readability, child-count bands) were not adopted.

---


Source keys: `iso29148`, `incose-gtwr`, `ears`, `kaos`, `zave-jackson`, `ambiguity`, `smells`, `attributes`, `hierarchy`, `terminology`, `inspection`. Quotes are verbatim fragments of the verified extractions; bracketed key names the source family. "Det" = deterministic. HeadCanon mapping used throughout: Intent = R (optative, encyclopedia sentence); Check = verification criterion on a leaf; As built = S/P; glossary = designations and definitions; certainty state = stated / assumed / open / contested.

---

## 1. Definitions that matter

### Requirement
- `iso29148` 3.1.19: "statement which translates or expresses a need and its associated constraints and conditions"; Note 2: expressed "in a very specific, precise and unambiguous manner". Well-formed (5.2.4): met by the system to solve a problem, qualified by measurable conditions, bounded by constraints, defines a system capability "not a capability of the user, operator or other stakeholder", verifiable.
- `incose-gtwr` 1.6.4: "the result of a formal transformation of one or more sources, needs, or higher-level requirements into an agreed-to obligation"; form: well-formed textual "shall" statements. Need statement vs requirement statement are distinct levels.
- `kaos`: "A requirement is a terminal goal assigned to an agent in the software-to-be." A goal is "an objective the system under consideration should achieve", an optative statement; expectation = terminal goal assigned to an environment agent; constraint (1993) = implementable goal.
- `zave-jackson`: "A requirement is an optative property, intended to express the desires of the customer"; it describes the environment only; R may name phenomena hidden from the machine.
- `ears`: generic syntax "<optional preconditions> <optional trigger> the <system name> shall <system response>".
- `inspection` (NASA-STD-8739.9): "A precise statement of need intended to convey understanding about a condition or capability".
- `hierarchy` (INCOSE SEH v3.2.1): characteristic or constraint "unambiguous, clear, unique, consistent, stand-alone (not grouped), and verifiable".
- `smells` (Paska): REQUIREMENT = SCOPE? CONDITION_STRUCTURES? ARTICLE? ACTOR MODAL_VERB not? SYSTEM_RESPONSE.
- Disagreement: `iso29148`, `incose-gtwr`, `ears`, `inspection` make the modal "shall" part of the definition; `zave-jackson` and `kaos` define by mood/role, not wording ("This separation allows the mood of a description to be determined by its context" [zave-jackson]). `kaos` and `zave-jackson` locate requirements at the machine boundary (single software agent), while `iso29148`/`incose-gtwr` have requirements at every level. `incose-gtwr` separates "need statement" from "requirement statement"; `iso29148` 5.2.3 says initial stakeholder concerns "do not serve as stakeholder requirements".

### Unambiguous
- `iso29148` 5.2.5: "it can be interpreted in only one way."
- `incose-gtwr` C3: "interpreted in only one way by all the intended audiences".
- `attributes` (Davis, IEEE 830): "every requirement stated therein has only one interpretation"; Davis measures by reviewer agreement (Q1 = nui/nr).
- `ambiguity` (Handbook): "the capability of being understood in two or more possible senses or ways"; subtypes lexical (homonymy, polysemy), syntactic (analytical, attachment, coordination, elliptical), semantic (scope), pragmatic (referential, deictic); vagueness is distinct ("not clear how to measure whether the requirement is fulfilled"); Kamsties adds RE-specific ambiguity: "multiple interpretations despite the reader's knowledge of the RE context", and the metamodel test: "ambiguous if it can be translated into at least two different models".
- `ears` RE'09: "a word or phrase has two or more different meanings"; three forms lexical, referential, syntactical.
- `terminology` (Dalpiaz): "A requirement is ambiguous when it has multiple valid interpretations"; terminological ambiguity = near-synonymy across viewpoints.
- `smells`: ambiguity is indicated by smells (findings), which are "an indicator of a quality violation, which may lead to a defect"; nocuous vs innocuous (`inspection`, Broccia).
- Disagreement: `ambiguity` separates vagueness from ambiguity; `iso29148`/`incose-gtwr` fold vague terms under the unambiguous characteristic. Berry et al. argue for lexical tools at 100% recall; Ferrari 2018 and `smells` (Femmer, AIRE'17) favour precision and closed word classes.

### Complete
- Single requirement: `iso29148` 5.2.5 "sufficiently describes the necessary capability, characteristic, constraint or quality factor ... without needing other information"; `incose-gtwr` C4 adds "conditions" and the what / how well / under what conditions triad.
- Set: `iso29148` 5.2.6 "The set of requirements stands alone"; no TBD/TBS/TBR; `incose-gtwr` C10 covers "capabilities, characteristics, functionality, performance, drivers, constraints, conditions, interactions".
- `attributes` (Davis): four conditions incl. "f(state, stimulus) -> (state, response) is defined for all elements" and no TBD; IEEE 830: responses to all realizable input classes, valid and invalid; "Any SRS that uses the phrase 'to be determined' (TBD) is not a complete SRS."
- `kaos`: requirements complete w.r.t. goals iff "all the goals can be proved to be achieved from the specification and the properties known about the domain"; refinement completeness = children ∧ Dom ⊢ parent; "completeness is a notion relative to what is known about the domain".
- `zave-jackson`: "R as a whole has been validated as expressing all the customer's desires".
- `ears` (Kiro): incompleteness = "the requirement describes what the system must do only on some inputs"; RE'09: "the claim that omissions have been eliminated needs to be treated with caution".
- `inspection` (Porter): omission classes Missing Functionality / Performance / Interface / Environment.
- Disagreement: `kaos` and `zave-jackson` define completeness by entailment (provable); `iso29148`/`incose-gtwr` by coverage and absence of placeholders; `attributes` by a state × stimulus function. Davis calls the first meaning "extremely difficult to measure".

### Singular
- `iso29148` 5.2.5: single capability; NOTE 2 "it can have multiple conditions under which the requirement is to be met"; 5.2.7 NOTE 1 "Consider multiple requirements when encountering terms such as 'or', 'and'".
- `incose-gtwr` C5: "state a single capability, characteristic, constraint, or quality factor"; R18 one sentence, one thought; R19 no combinators.
- `smells` (Rimay): "Atomicity refers to ensuring that an NL requirement describes a single system function."
- `attributes` (Genova): "each requirement is clearly determined and identified, without mixing it with other requirements."
- `hierarchy` (Honig et al.): "a natural language statement that completely describes a single system function"; conjunction bans alone are insufficient.
- `ears`: zero or one trigger, one system name, "One or many system responses."
- Disagreement: `ears` allows several responses in one requirement; `incose-gtwr` R18/`smells` P1 require exactly one; `iso29148` allows several conditions but one capability; Honig says the conjunction test is not the definition.

### Verifiable
- `iso29148` 5.2.5: "its realization can be proven (verified) to the customer's satisfaction at the level the requirements exists"; "Verifiability is enhanced when the requirement is measurable."
- `incose-gtwr` C7: "structured and worded such that its realization can be verified to the approving authority's satisfaction" by inspection, analysis, demonstration or test; C7 is "a necessary condition for establishing the other characteristics".
- `attributes` (Davis): "finite, cost effective techniques ... to verify that every requirement stated therein is satisfied"; IEEE 830: "some finite cost-effective process with which a person or machine can check".
- `ears` RE'09: untestability = "requirements that cannot be proven true or false when the system is implemented"; Kiro: "A good specification must describe observable conditions on observable quantities."
- `hierarchy` (24765 testability): "an objective and feasible test can be designed to determine whether a requirement is met".
- `kaos`: behavioral goals "can be satisfied in clear-cut sense"; soft goals "do not have a clear-cut criterion for their satisfaction" and need a quality variable + objective function.
- `inspection` (NASA R1): "measurable, consistent, complete, clear, concise, and testable."
- Disagreement: none on substance; `iso29148` adds "at the level the requirement exists", which `hierarchy` turns into "parent verified at its own level".

### Consistent
- Individual: `iso29148` does not list it (2011 did); `attributes` IEEE 830 defines internal consistency only, three conflict types (object characteristics, logical/temporal action conflict, different terms for one object); "If an SRS does not agree with some higher-level document ... then it is not correct".
- Set: `iso29148` 5.2.6 "unique, do not conflict with or overlap with other requirements in the set", units homogeneous, "the same term is used throughout the set to mean the same thing"; `incose-gtwr` C11 adds consistency with glossary, data dictionary, architecture model.
- `kaos`: inconsistency = "no way to satisfy those descriptions all together"; conflict = logically inconsistent with minimality; divergence = inconsistent under a feasible boundary condition; competition = divergence within one quantified requirement; terminology / designation / structure clash.
- `attributes` (Davis): deterministic function from (state, stimulus) to (state, response); external consistency with baselined documents.
- `ears` (RTEMS): "Requirements shall not be in conflict with each other inside a specification."; Kiro: "two requirements, each sensible in isolation, cannot both hold at the same time".
- `zave-jackson`: ∃e s. W (assumptions satisfiable); W must hold wherever S holds.
- Disagreement: Davis counts external consistency; IEEE 830 reclassifies it as correctness. `kaos` makes conflict relative to a boundary condition, others treat it as absolute.

### Necessary
- `iso29148` 5.2.5: deleting it leaves "a deficiency in capability or characteristic ... which cannot be fulfilled by implementing other requirements"; also currently applicable.
- `incose-gtwr` C1: needed "to satisfy a lifecycle concept, need, source, or higher-level requirement"; not necessary if removable without gap, covered by others, untraceable, or without rationale; "There is no such thing as a 'self-derived' need or requirement."
- `kaos`: pertinent iff "used in the proof of one goal at least"; minimality of refinement.
- `hierarchy` (Dick): "Necessity explores whether each of the design artefacts are necessary"; Wheatcraft: if the parent could be verified without the child, the link is wrong.
- `inspection` (PBR): Extraneous = "Information is provided that is not needed or used."
- `attributes` (Davis Correct): "every requirement represents something required of the system".
- Disagreement: Davis folds necessity into correctness; `iso29148` and `incose-gtwr` keep them apart.

### Correct
- `iso29148` 5.2.5: "an accurate representation of the entity need from which it was transformed."
- `incose-gtwr` C8 / C15 (set): same wording; validation of intent, "none of the NLP/AI applications have the capability to do this".
- `attributes` IEEE 830: "every requirement stated therein is one that the software shall meet."; "There is no tool or procedure that ensures correctness."; Davis Q3 = validated share.
- `inspection` (PBR Incorrect Fact): "asserts a fact that cannot be true under the condition specified in the general requirements".
- `zave-jackson`: "It is the customer's prerogative to determine the requirements."
- Disagreement: `inspection` treats incorrect fact as an internal contradiction with stated conditions; standards treat correct as fidelity to source. Both apply.

### Feasible
- `iso29148` 5.2.5: "realized within system constraints (e.g., cost, schedule, technical) with acceptable risk"; set-level includes affordable.
- `incose-gtwr` C6/C12: adds legal, ethical, safety; four infeasibility causes "breaks the laws of physics, violates laws or regulations ... conflicts with another requirement"; set feasibility is not the sum of member feasibility.
- `attributes` (Davis Achievable): "at least one system design and implementation ... that correctly implements all the requirements", 0/1.
- `kaos`: realizability by an agent (monitorability, controllability, no future reference, no external unachievability, bounded achievement); "Goals must be achievable".
- Disagreement: `kaos` makes feasibility a per-agent, formally checkable property; the others make it a managerial judgment.

### Traceable
- `iso29148` 3.1.23: "derivation path (upward) and allocation/flow-down path (downward)"; 6.4.3.5 trace up to parent/need, down to elements and verification entities.
- `attributes` Davis: Traceable (each requirement referenceable) vs Traced (origin clear) vs Cross-referenced; IEEE 830 backward (source) and forward (unique name/number).
- `hierarchy`: elementary traceability (bare links) vs rich traceability "where design intent is captured as rationale or narrative"; bidirectional "discernible in either direction".
- `attributes` Genova: "explicit relationship of each requirement with design, implementation and testing artefacts".
- `ears` RTEMS/Kiro: UID per requirement; each property "linked to its requirement and to the task".
- Disagreement: Davis splits one concept into three attributes; `hierarchy` insists links alone are insufficient without a satisfaction argument.

### Derived requirement
- `iso29148` 3.1.10: "deduced or inferred from the collection and organization of requirements into a particular system configuration and solution"; parent/child note; identified during analysis, trade studies or validation.
- `hierarchy` (SEVOCAB allocated requirement): "levies all or part of the performance and functionality of a higher-level requirement on a lower-level"; INCOSE pamphlet: derived requirements trace to need and to implementing item; SEH 5th: derived requirements from design decisions are added to the baseline.
- `kaos`: all subgoals are derived by refinement; leaves are typed requirement / expectation / domain property.
- Disagreement: `iso29148` has derived = any child; INCOSE pamphlet marks only those not stated by stakeholders. HeadCanon's "assumed by the machine" matches the second.

### Satisfaction argument
- `zave-jackson`: "S and K together must be sufficient to guarantee that the requirements are satisfied" (S, K ⊢ R); GGJZ formulas: adequacy W ∧ M ∧ P ⇒ R, consistency ∃e s. W, relative consistency; "The proof obligations are just as sensible for natural-language documentation".
- `kaos`: "in view of properties D of the domain, the requirements R satisfy goal G under expectations E"; "One important, often neglected part of the requirements engineer's job is to provide satisfaction arguments".
- `hierarchy` (Hull/Jackson/Dick via Lockerbie): one argument per parent, "one or more properties of the domain, one or more means-elements ... one attribute that explains"; checked for "sufficient and necessary".
- Disagreement: `zave-jackson` argue K may constrain nothing and may be only probable; `hierarchy` records domain knowledge that "does not constrain the solution". Jackson's problem structure is "not the bill-of-materials assembly structure", in tension with a single tree.

### Goal refinement
- `kaos` (FRP96): complete refinement iff G1 ∧ ... ∧ Gn ⊢ G (entailment), ∧j≠i Gj ⊬ G (minimality), G1 ∧ ... ∧ Gn ⊬ false (consistency), and n > 1 or relies on domain knowledge; "incomplete refinements result in missing requirements whereas non-minimal refinements produce unnecessary requirements"; AND-refinement: "satisfying all subgoals in the refinement is a sufficient condition"; OR-refinement alternatives; patterns milestone, case, guard introduction, divide-and-conquer, agent-driven, monitor/control image + accuracy goal.
- `incose-gtwr` C1: child "sufficient if it, along with any siblings ... satisfies its parent requirement with acceptable margin"; children "both necessary and sufficient".
- `hierarchy`: allocation = assigning to entities "that have a role in the implementation of the allocated requirement"; 7±2 children; single child = redundant level.
- `inspection` NASA R1: "Are all described functions necessary and sufficient to meet the mission/system objectives?"
- `ears` (PLC/Kiro): compound requirement split into atomic EARS children; thesis statement = internal node.
- Disagreement: `kaos` 2001/1993 forbid refining a single-agent goal; KAOS tutorial 2007 allows requirement-by-requirement refinement under the same agent. `kaos` adds "acceptable margin" nowhere; `incose-gtwr` does.

### Domain assumption
- `zave-jackson`: indicative mood "describes the environment as it would be without or in spite of the machine"; K "intended to be relevant"; "Each member of K has been validated (checked informally) as true"; some are "a highly probable assumption rather than an unalterable fact".
- `kaos`: domain property "holds independently of the software-to-be"; invariant (known) vs hypothesis ("expected to hold"); expectation = prescriptive on an environment agent, "cannot be enforced by the software-to-be".
- `iso29148` 5.2.7: "All assumptions made regarding a requirement shall be documented and validated".
- `hierarchy`: domain knowledge "a fact or assumption of the real world and does not constrain the solution"; revalidate on change.
- `ambiguity` (Kamsties): development-domain ambiguity when a sentence could be environment property or requirement; shall vs will.
- Disagreement: `kaos` splits assumptions into descriptive (domain property) and prescriptive-on-environment (expectation); `zave-jackson` keep one indicative class. HeadCanon needs both: domain property nodes and expectation nodes, plus the certainty label.

### Specification
- `zave-jackson`: "an optative property, intended to be directly implementable"; uses only shared phenomena (ev, sv); "A specification is a restricted kind of requirement"; S "stand proxy for the program with respect to the requirements"; three reasons R is not S: environment constraint, unshared information, future reference.
- `kaos`: operationalization "each execution of the operations ... will entail the requirement"; closed requirement = responsibility + operationalization + performance links; open requirement = no operationalization.
- `iso29148`: system verification "The system has been built right"; validation "The right system has been built."
- `ears` (T-EARS): guarded assertion "guard expression, G, that decides whether the assertion expression, A, is expected".
- Disagreement: `zave-jackson` keep S and P apart (P may use hidden phenomena); HeadCanon's As built covers both and must be split for interface vs code checks.

### Glossary term
- `zave-jackson`: designation = "informal description of the meaning of an atomic formal term referring to the environment"; definition = "formal description of an atomic term, using other defined or designated terms", "it cannot be false"; "components of the machine state cannot be designated."
- `iso29148` 5.2.4/5.2.7: terms "formally defined and applied consistently"; "Include definitions as declarative statements, not requirements."
- `incose-gtwr` R4: "glossary items may be capitalized and multiple words in single terms joined by an underscore"; R36 "Synonyms are not acceptable."
- `terminology` (Arora): glossary "makes explicit and provides definitions for the salient terms"; candidates are noun phrases; entry may give "synonyms, related terms, and example usages"; Dalpiaz: consensus / correspondence / conflict / contrast between viewpoints; near-synonym (plesionym).
- `kaos`: definition "should provide a precise interpretation for the set member(Obj)"; "each concept is defined only once (no ambiguity, no contradiction)".
- `attributes` IEEE 830: "each characteristic of the final product be described using a single unique term".
- `ears` RTEMS: "All project-specific terms and abbreviations ... shall be defined in the project glossary."
- Disagreement: Arora excludes verb phrases; Dalpiaz tags verbs; `kaos` LET01 requires the vocabulary of goals be in the object model (includes predicates). `zave-jackson` require control/sharing tags that no other source has.

### Defect classes
- `inspection` Porter/Votta/Basili: omission (Missing Functionality, Performance, Interface, Environment) vs commission (Ambiguous Information, Inconsistent Information, Incorrect Fact, Wrong Section); PBR: Omission, Ambiguous, Incorrect Fact, Extraneous, Inconsistent; Fagan: type × {missing, wrong, extra} × {major, minor}; NASA: major / minor / clerical; "an error is defined as any condition that causes malfunction or that precludes the attainment".
- `ears` RE'09 eight problems: ambiguity, vagueness, complexity, omission, duplication, wordiness, inappropriate implementation, untestability; Kiro four classes: ambiguity, inconsistency, incompleteness, wrong level of detail.
- `smells`: smell = finding ≠ defect; lexical / grammatical / structural / semantic; QuARS indicators vagueness, subjectivity, optionality, implicity, weakness, under-specification, multiplicity; ARM imperatives / continuances / directives / options / weak phrases; Seki seven characteristics ambiguity, incorrectness, granularity, redundancy, lack, misplacement, inconsistency.
- `ambiguity` Kamsties taxonomy: lexical, syntactic, semantic, pragmatic, discourse, domain (application/system/development).
- `kaos` CON98: process-level deviation, instance-level deviation, terminology clash, designation clash, structure clash, conflict, divergence, competition.
- Disagreement: `inspection` and `attributes` count extraneous information as a defect; `smells` insist a finding is a defect only after context judgment ("must be individually decided for that context" [smells]).

---

## 2. Checks on one requirement statement (the Intent)

Deterministic rows first. "Det" gives the pattern or lexicon (lexicons in section 8).

| # | Check | Binary test | Det | Sources |
|---|---|---|---|---|
| 2.1 | Agreed binding marker exactly once | Does the Intent contain the project's agreed requirement signal exactly once (default `\bshall\b`; HeadCanon must declare its own, see §3)? | Yes: regex count == 1 | iso29148, incose-gtwr, ears (RTEMS one verbal form), ambiguity (ARM one imperative), attributes (Davis shall-extraction; Genova 1 imperative form), kaos (prescriptive keyword present) |
| 2.2 | No non-binding modal as governing verb | Is the Intent free of should / will / may / might / could / can / ought to as main modal? | Yes: lexicon | iso29148, incose-gtwr, ears (RTEMS must/will/ought), smells (F4, N4, QuARS weakness), ambiguity (ARM options; Gleich could/should/might), attributes (Genova conditional mood), inspection (Broccia weak verbs) |
| 2.3 | Goals kept apart from binding nodes | Is every should / would like statement typed goal, not requirement? | Yes: lexicon + node type | incose-gtwr, iso29148 |
| 2.4 | Mood by slot: no modal in an indicative Intent | If the style guide chooses indicative encyclopedia Intents, is the Intent free of shall / should / must / will / may / needs to / we want? | Yes: regex | zave-jackson (conflicts with 2.1; see §9) |
| 2.5 | Positive statement | Is the main verb free of not / shall not / never / no (negation inside a condition clause exempt)? | Yes: regex `shall not\|must not\|never\|\bno\b\|\bnot\b`; POS to locate clause | iso29148, incose-gtwr R16, hierarchy R16, smells (F10 pre-scan; F11 exemption; Genova negatives), ambiguity (not placement, not…because), inspection (Broccia negative phrases) |
| 2.6 | Active voice, actor as subject | Is the main clause free of be + past participle without `by <actor>`, and of "it is required that"? | Yes: POS aux-be + VBN; phrase list | iso29148, incose-gtwr R2, hierarchy R2, ambiguity (Handbook; Ferrari PPV; Gleich), smells (P8 eight patterns; Genova passive), inspection (Broccia) |
| 2.7 | Subject is the entity of this level | Is the subject noun phrase a glossary entity at this node's level, not a stakeholder role or a characteristic of the entity? | Yes: subject lemma ∉ stakeholder lexicon, ∈ entity list | iso29148 (capability of system, not user), incose-gtwr R3, hierarchy R3, ears (one system name, glossary term), smells (T14 subject first, T15 subject present; S2 placeholder "Actor") |
| 2.8 | Entity named in the node itself | Does the Intent contain the entity name rather than inheriting it from heading or parent? | Yes: entity token present | incose-gtwr R25, smells T15, ambiguity (QuARS implicity: cannot stand alone) |
| 2.9 | Definite article before entities | Is every glossary entity introduced by "the" (indefinite only in measurement phrases)? | Yes: regex `\b(a\|an)\s+<Entity>` | incose-gtwr R5, hierarchy R5, terminology R5 |
| 2.10 | One sentence, one obligation, one main verb | Exactly one sentence, one binding verb, one subject–verb–object sequence, no bullets? | Yes: sentence count == 1; MD count == 1; parse | incose-gtwr R18, smells (P1 one response, S3 verb count, T9), ambiguity (QuARS multiplicity), attributes (IEEE 4.3.7c; Genova imperatives 1–3), ears (one system name) |
| 2.11 | No combinators outside bracketed conditions | Is the predicate free of and, or, and/or, then, unless, but, as well as, but also, however, whether, meanwhile, whereas, otherwise, semicolon lists? | Yes: lexicon §8.6 (glossary compounds exempt) | iso29148 5.2.7 NOTE 1, incose-gtwr R19, hierarchy R19, attributes (Genova connectors), ambiguity (and..or regex; Ferrari PCO1), smells (P4 or between conditions) |
| 2.12 | No "and/or", no oblique outside units | Free of and/or and of `/` except in units, ± ranges, fractions? | Yes: regex | iso29148, incose-gtwr R15/R17, hierarchy R17, ambiguity (Handbook §7.4; Gleich unclear slashes) |
| 2.13 | Logical expressions in the declared convention | Are AND/OR/XOR/NOT written uppercase in brackets, "or" marked either…or / …or both? | Yes: pattern | incose-gtwr R15, hierarchy R15, ambiguity (Handbook §5.1) |
| 2.14 | No purpose or rationale phrases | Free of in order to, so that, thus allowing, for the purpose of, because, since, due to? | Yes: lexicon | incose-gtwr R20, hierarchy R20, attributes (Moreno 2020 rationale) |
| 2.15 | No parenthetical text | Free of ( and [ except the logical convention and units? | Yes: regex | incose-gtwr R21, hierarchy R21, ambiguity (Kamsties; Gleich) |
| 2.16 | No pronouns (personal, demonstrative, indefinite) | Free of it, its, they, them, this, that, these, those, which, he, she and standalone indefinites? | Yes: POS substituting pronouns + lexicon §8.7; "that" as relativiser is a known false positive | iso29148, incose-gtwr R24, hierarchy R24, ambiguity (Handbook §5.4.2; Ferrari PANA; QuARS implicity), smells (F12, S1, N3 anaphoric Genova), inspection (Broccia), terminology (Femmer secondary) |
| 2.17 | Sentence-initial "This"/"Both" without noun | Does any sentence begin with This + verb or with Both? | Yes: regex `^This (is\|has\|means…)`, `^Both` | ambiguity |
| 2.18 | No indexical with unresolved referent | Does after, before, next, previous, first, last, following, above, below point to exactly one referent? | No (flag by lexicon, reader resolves) | ambiguity (Handbook; Kamsties discourse; QuARS implicity) |
| 2.19 | No vague quantifiers / adjectives / adverbs | Free of the vague-term lexicon; every -ly adverb and JJ/RB reviewed? | Yes: lexicon §8.1; POS JJ/RB/JJR/RBR flag | iso29148, incose-gtwr R7, hierarchy R7, terminology R7, ears (RTEMS list), ambiguity (Handbook; Gleich; Ferrari PADV), smells (F2, L1, Genova quantity/frequency), inspection |
| 2.20 | No subjective language | Free of user friendly, easy, intuitive, efficient, cost effective, robust, good, adequate…? | Yes: lexicon §8.2 on lemmas | iso29148, smells (F1 precision 0.96), ambiguity (QuARS subjectivity, ARM), attributes (Genova quality/usability), inspection (Broccia), terminology (secondary) |
| 2.21 | No escape clauses / loopholes | Free of if possible, as appropriate, as applicable, where possible, as required, if necessary, to the extent practical…? | Yes: lexicon §8.3 | iso29148, incose-gtwr R8, hierarchy R8, smells F3, ambiguity (ARM weak phrases) |
| 2.22 | No open-ended terms | Free of including but not limited to, etc., and so on, as a minimum, such as, provide support…? | Yes: lexicon §8.4 | iso29148, incose-gtwr R9, hierarchy R9, smells (F5, T5), ambiguity (ARM; Handbook not limited to), attributes (Genova enumeration) |
| 2.23 | No superfluous infinitives / wrappers | Free of be able to, be capable of, be designed to, to enable, to allow, provide the capability to? | Yes: lexicon | incose-gtwr R10, hierarchy R10, attributes (Davis conciseness), ambiguity (ARM weak phrases) |
| 2.24 | No vague verb as main verb | Main verb ∉ {support, process, handle, track, manage, flag, use, reject, accomplish, perform, do, make, get…}? | Yes: lexicon §8.9 | incose-gtwr R3, ambiguity (Handbook), smells (P9 precision 0.98), iso29148 (support) |
| 2.25 | No superlative | No token tagged JJS/RBS (best, most, highest…)? | Yes: POS/morphology; flag, reader confirms finite set | iso29148, smells (F6, F7 exemption), terminology (secondary) |
| 2.26 | No comparative without numeric object | No JJR/RBR (better, faster, more, higher quality) unless followed by a numeral? | Yes: POS; F9 exemption | iso29148, smells (F8, F9), ambiguity (Handbook than-parallelism), terminology (secondary) |
| 2.27 | No totality / absolutes | Free of all, always, never, every, any, none, 100%, entire unless the set is enumerated in the glossary? | Yes: lexicon §8.5 | iso29148, incose-gtwr R26, hierarchy R26, ambiguity (Gleich wishful thinking), attributes (IEEE never/infinite loop) |
| 2.28 | "each" for universal quantification | Free of all / any / both as quantifiers? | Yes: lexicon | incose-gtwr R32, hierarchy R32, ambiguity (dangerous plural) |
| 2.29 | Dangerous plural | Plural/universal subject with singular complement (`(all\|both\|every\|each) .* (a\|an\|his\|her\|its\|their\|they)`)? | Yes: regex | ambiguity (Handbook §5.2.1; Gleich; SREE plural) |
| 2.30 | No indefinite temporal keyword | Free of eventually, until, before, after, once, earliest, latest, instantaneous, simultaneous, at last, sooner or later? | Yes: lexicon §8.10 | incose-gtwr R35, hierarchy R35, kaos (bare "eventually" on Achieve leaf) |
| 2.31 | No control-flow prose | Count of while, when, if…then, else, until, loop, repeat, for each above threshold? | Yes: lexicon count | attributes (Genova flow) |
| 2.32 | No placeholder markers | Free of TBD, TBS, TBR, TBC, TBA, TODO, FIXME, ???, XXX, to be determined/defined/supplied? | Yes: regex `\bTB[DSRXAC]\b…` | iso29148, incose-gtwr C4, attributes (Davis, IEEE), smells (T11, N2), ambiguity (incomplete markers), inspection (NASA TBD), ears (response not TBD) |
| 2.33 | Hedges become explicit open state | Any probably, possibly, usually, optionally, maybe, perhaps? If yes, is the node in state open rather than hedged in prose? | Yes: lexicon + state field | ambiguity (Handbook §5.1), attributes (Genova probability), smells (QuARS optionality) |
| 2.34 | Every number has a unit | Every numeral followed by a unit token or counted glossary entity (or %)? | Yes: regex NUMBER not followed by UNIT | incose-gtwr R6, hierarchy R6, terminology R6, ambiguity (Ferrari PMU), attributes (Davis, IEEE), inspection |
| 2.35 | "include" | Does the node use include(s)/including to define a set? | Yes: lexicon | ambiguity (Handbook; Gleich) |
| 2.36 | Group / class noun without modifier | Is a class word (flow, access, data, interface, function, information, testing, -related) used bare? | Yes: domain dictionary + dependency parse; enumeration judged (R22) | incose-gtwr R22, smells (N3; QuARS under-specification), ambiguity |
| 2.37 | No cross-reference to other nodes | Free of above, previous, following, "the following requirement", node ids in the sentence? | Yes: pattern | incose-gtwr C4 |
| 2.38 | References complete and followable | Does every external reference resolve and name version/date and section? | Yes: link resolution + `<name> <version\|date> <section>` | iso29148, incose-gtwr C4, smells F14, ambiguity (ARM directives; Ferrari PMR), terminology (secondary) |
| 2.39 | Implementation / UI / design term flag | Does the Intent name a technology, module, variable, signal, button, screen, database, API, thread? | Yes as flag: lexicon §8.11; verdict is judgment (2.65) | smells T10, attributes (Genova design terms), zave-jackson (sh-tagged terms), incose-gtwr (MySQL, Python examples) |
| 2.40 | Conforms to one agreed pattern | Does the sentence parse into the slots of exactly one catalogued pattern (not zero, not two)? | Yes: slot grammar | incose-gtwr R1/C9, ears (classification into one EARS pattern; QVscribe), smells (P10, P12), ambiguity (Rupp pattern), hierarchy, iso29148 (Figure 1, judged) |
| 2.41 | EARS keyword discipline | Are When / While / Where / If / Then clause-initial, in order (While/Where < When/If < shall), at most one trigger, If closed by Then, ≤ 3 preconditions? | Yes: tokenise on keywords | ears |
| 2.42 | Condition clause uses a defined shape and glossary state | Does each condition start with an agreed keyword and name a glossary state, trigger or feature? | Yes: keyword + lookup | incose-gtwr (Appendix C.3; R36 states/modes), ears |
| 2.43 | Word count / length | Word count ≤ threshold (HeadCanon: two sentences; Ferrari 60 tokens; Genova 10–49 words; EARS mean 25.6)? | Yes: token count | ears, ambiguity (Ferrari PLEN; Wilson), attributes (Genova size), smells (S4, L5) |
| 2.44 | Punctuation density | More than 3 punctuation marks (Wilson), or density outside band (Genova)? | Yes: count | ambiguity (Wilson §6.3), attributes (Genova) |
| 2.45 | Readability index | Flesch ≥ 50 / Coleman-Liau ≤ 15 (target 10)? | Yes: formula | ambiguity (QuARS, ARM), attributes (Genova), smells (N5) |
| 2.46 | Grammar and spelling, one word form | Spell/grammar pass with glossary exceptions; one capitalization / hyphenation per term? | Yes for spelling/forms; grammar flagged, reader decides (R12) | incose-gtwr R12/R13, iso29148 (conforming), inspection (entry criterion) |
| 2.47 | Acronyms and abbreviations defined, one spelling | Every uppercase token ≥2 letters in the acronym list, one spelling; abbreviations only if single-meaning and defined; no define-on-first-use? | Yes: pattern + list | incose-gtwr R37/R38, hierarchy, terminology R37/R38, attributes (Genova acronyms) |
| 2.48 | Decimal format | One separator convention, leading zero, agreed significant digits? | Yes: regex | incose-gtwr R40, hierarchy R40 |
| 2.49 | Name = object + past participle | Is the node name NOUN + past participle (ServiceRequested), not imperative? | Yes: POS on name | kaos |
| 2.50 | Amelioration verbs flag a soft goal | Contains improve, increase, reduce, minimize, maximize, enhance, enable, support, provide, better, faster? Then typed soft with measure (§3). | Yes: lexicon | kaos |
| 2.51 | Intent speaks only of the environment | Does every phenomenon in the Intent carry tag eh/ev/sv, none sh (machine-internal)? | Yes if glossary tags exist | zave-jackson, iso29148 |
| 2.52 | Node has exactly one role | Role field ∈ {requirement, domain assumption/expectation, specification/As built}, single-valued? | Yes: structural | zave-jackson rule 4, kaos (leaf typed), ambiguity (Kamsties mood decided) |
| 2.53 | Mandatory fields present | Intent non-empty; name; type/classification; rationale; owner; priority; difficulty; stability; version; id; on leaves a Check with kind; As built or "not yet built"? | Yes: structural | iso29148 (5.2.8), incose-gtwr (16 starred attributes; R29), smells (F29, F33), attributes (Davis Q15–Q17; IEEE ranked; Genova explicit individualization), kaos (name + definition; source), ears (RTEMS rationale), hierarchy (rationale, classification), zave-jackson (constrains / refers-to fields) |
| 2.54 | Certainty-state structural rules | state == assumed ⇒ rationale non-empty; state == open ⇒ owner + due date; machine-authored ⇒ state ≠ stated until human confirms; baseline ⇒ no assumed/open/contested | Yes: structural | iso29148 (assumptions documented; TBx owner/timeframe; correctness confirmed by source), incose-gtwr (open items owner/date), attributes (IEEE TBD owner/date; Davis Q3), zave-jackson (K validated; customer prerogative), inspection (assumptions stated; machine flags need confirmation) |
| 2.55 | No "shall" in attributes | Rationale, As built, comments free of the binding marker? | Yes: lexicon over attribute fields | incose-gtwr |
| 2.56 | Design constraint carries rationale | If tagged design constraint, is Rationale non-empty? | Yes: structural | incose-gtwr R31 |
| 2.57 | Literal values quoted | Is each literal value or label meant as itself in quotation marks? | Yes: pattern after is/equals/shows | ambiguity |
| 2.58 | Symbols written as words | No =, <, > used as predicate in prose? | Yes: regex | smells P13 |
| 2.59 | Unique identifier | Id present, unique, immutable, never reused? | Yes: structural | iso29148, attributes (Davis Q11, IEEE), ears (RTEMS UID), smells (F33, T2), hierarchy, ambiguity (ARM) |
| 2.60 | Unambiguous: one interpretation | Do two independent readers (implementer and verifier) paraphrase the Intent to the same subject, action, object, bound, condition? | No | iso29148, incose-gtwr C3, ears, ambiguity (Davis ten-reader test; metamodel test), attributes (Davis Q1; IEEE), hierarchy, terminology, inspection (PBR E6T q3), kaos (clear-cut) |
| 2.61 | Complete in itself (what, how well, under what conditions) | Can a reader understand the Intent cold (glossary excepted), pointing to the function, the measurable performance and every applicable condition (R27: none inferred)? | No | iso29148, incose-gtwr C4/R27, hierarchy, ears (preconditions explicit; conditions not buried), inspection (Omission), attributes (Davis understandability Q4) |
| 2.62 | Singular: one capability (conditions allowed) | Does the Intent state exactly one capability, possibly under several conditions; would any part be verified or allocated separately? | No (2.10/2.11 are pre-filters) | iso29148 (NOTE 2), incose-gtwr C5/R18, hierarchy, ears (compound), attributes (Genova atomicity), inspection (discrete), smells, terminology |
| 2.63 | Necessary (removal test) | If this node were deleted, would a gap remain that no sibling or other node fills, and can the author give a reason? | No | iso29148, incose-gtwr C1, hierarchy (Wheatcraft), kaos (pertinence), inspection (Extraneous), attributes (Davis correct) |
| 2.64 | Correct against its source | Does the Intent say what the originating need or parent says, no more, no less, with no assertion false under stated conditions? | No; machine-drafted nodes cannot pass until the human confirms | iso29148, incose-gtwr C8, attributes (IEEE 4.3.1; Davis Q3), hierarchy, inspection (Incorrect Fact), zave-jackson |
| 2.65 | Implementation-free (what, not how) | Could more than one design satisfy the Intent; does it name no mechanism the need itself does not impose; if it does, is it typed constraint with rationale? | No (2.39 pre-filter) | iso29148, incose-gtwr R31, ears, attributes (Davis Q10; IEEE 4.7; Genova abstraction), zave-jackson (implementation bias), hierarchy, inspection, smells (T10, T17) |
| 2.66 | Feasible with acceptable risk | Is there a known way to realize it within constraints (physics, law, no unresolvable conflict, risk); As built existing counts as evidence? | No | iso29148, incose-gtwr C6, hierarchy, attributes (Davis Q8), kaos (external unachievability) |
| 2.67 | Appropriate level of abstraction | Is every detail about this node's entity at this depth, nothing from a child level or rationale? | No | iso29148, incose-gtwr C2, hierarchy, attributes (Davis two-sided fit), smells (F19, G2) |
| 2.68 | Prescriptive, not a fact or definition | Could agent behaviour make the sentence false (optative)? A statement true whatever the software does is a domain property; a sentence that "cannot be false" is a definition and belongs in the glossary. | No (lexicon 2.1/2.4 hints) | kaos, zave-jackson, iso29148 (definitions declarative), ambiguity (Kamsties mood) |
| 2.69 | Names a state, fits one temporal pattern, clear-cut | Can the Intent be rewritten as exactly one of Achieve / Cease / Maintain / Avoid over C, T, N, and can a single run be judged yes/no? | No (explicit prefix deterministic) | kaos |
| 2.70 | Event vs state, action vs activity, volatile vs persistent | Is each trigger an instant (When) or an interval (While); does each verb fire once or hold; does each state say what ends it? | No | ears, ambiguity (Handbook §6.1.2; Kamsties), kaos |
| 2.71 | No mixed mood | Does the sentence mix what the world is with what it should become? | No | zave-jackson |
| 2.72 | Conjunction meaning (concurrency vs sequence), parallelism, only/also/even placement, "any", "a/an" as subject | Is each flagged word used in exactly one reading? | No (lexicon flags) | ambiguity |
| 2.73 | Precision beyond lexicon | Would two readers build the same thing, every quantity valued, every referent definite? | No | ears, ambiguity, kaos |
| 2.74 | Currently applicable, dated when temporary | Still applicable today; expiry/start date recorded as attribute? | No (date attribute structural) | iso29148 |
| 2.75 | Configured behaviour stated as a relation | Where As built reads configuration, does the Intent state the relation between configuration and behaviour? | No | zave-jackson |
| 2.76 | Assumption limited to known cases; probable marked | Is each assumption conditioned on where it is known to hold, and marked probable vs certain? | No | zave-jackson |
| 2.77 | Competition within a quantified requirement | Can two instances compete for one resource under a feasible condition; is that recorded? | No | kaos |
| 2.78 | Clear to an outsider | Can a reader without the author's tacit knowledge resolve every reference and term? | No | smells F26, inspection |
| 2.79 | Node name reflects content | Does the name describe what the Intent says? | No | smells S14 |
| 2.80 | Function stated as inputs, outputs, processing | Does a functional node name inputs, outputs and the processing linking them? | No | inspection (NASA R1), attributes |

---

## 3. Checks on a verification criterion (the Check) and recommended sentence shapes

### 3.1 Checks on the Check sentence

| # | Check | Binary test | Det | Sources |
|---|---|---|---|---|
| 3.1 | Leaf carries a Check | Does every leaf have a non-empty Check with an observation, a yes-condition and kind ∈ {binary, numeric, open-ended}; non-test kind carries justification? | Yes: structural | iso29148, ears (RTEMS validation by test), ambiguity (fit criterion), hierarchy, attributes (Davis Q14), incose-gtwr (A6) |
| 3.2 | Verification method named | Method ∈ {inspection, analysis, demonstration, test}? | Yes: enum | incose-gtwr C7, hierarchy |
| 3.3 | Measurable bound present | Does a numeric Check contain number + unit + comparator (within N, at most, at least, ±, between…and) or a closed enumerated outcome set? | Yes: regex | iso29148, incose-gtwr R6/R33, attributes (Davis precise; IEEE measurable), ambiguity (Ferrari PMU; Wilson generalities), inspection (NASA data usage), hierarchy |
| 3.4 | Range or tolerance, not single point | Does each quantity carry ± / % / from-to / bound, value and tolerance in the same unit and decimal format? | Yes: pattern | incose-gtwr R33, hierarchy |
| 3.5 | Open/closed interval stated | Is every minimum / maximum / up to accompanied by including / excluding or no less than / greater than? | Yes: regex `up to (?!including\|excluding)` | ambiguity |
| 3.6 | Worst case stated | Does "best case", "typically", "nominal" appear without a worst-case bound? | Yes: lexicon | ambiguity (Ferrari) |
| 3.7 | No unmeasured quantification words | Free of prompt, fast, routine, maximum, minimum, optimum, nominal, high speed, medium-sized, best practices, user-friendly…? | Yes: lexicon §8.8 | incose-gtwr R34, ambiguity (Wilson generalities), attributes (IEEE good/well/usually) |
| 3.8 | No NASA unverifiable terms | Free of flexible, easy, sufficient, safe, ad hoc, adequate, accommodate, usable, when/if required, appropriate, fast, portable, light-weight, maximize, minimize, robust, -ly, -ize? | Yes: lexicon §8.8 | iso29148 (NASA App. C.4 secondary) |
| 3.9 | No unbounded universal | Free of never, always, at all times, 24/7, without restriction unless a finite observation window or sample is stated? | Yes: lexicon | attributes (Davis "shall never halt"; IEEE infinite loop), ambiguity (Ferrari unbounded), incose-gtwr R26, iso29148 |
| 3.10 | "shall not" needs window and observable | If the node prohibits, does the Check state over what window and which observable the absence is shown? | No (pre-scan deterministic) | ears (RTEMS; PLC), incose-gtwr R16, ambiguity (inverse requirements have no test) |
| 3.11 | Comparison against a number is not a smell | Comparative followed by a numeral is a condition: discard finding. | Yes: POS JJR + CD | smells F9 |
| 3.12 | Negation inside a condition is not a smell | Negation token inside the if/when clause: discard finding. | Yes: parse | smells F11 |
| 3.13 | Condition has actor and finite verb; no modal in condition | Does each condition segment have a noun subject and finite verb, and no MD tag? | Yes: Tregex / POS | smells (P6, P11) |
| 3.14 | Conditions precede the response | No condition segment after the system response? | Yes: segment order | smells P3 |
| 3.15 | Precondition vs trigger recognisable | Does the condition's verb phrase contain a comparison phrase (is equal to, less or equal to, contain, have) or an event verb? | Yes: operator lexicon | smells P14 |
| 3.16 | Check mentions only shared phenomena | Is every phenomenon in the Check tagged shared (ev, sv)? | Yes if tags exist | zave-jackson (JZ95 rule a; GGJZ) |
| 3.17 | Check constrains only machine-controlled phenomena | Is every phenomenon the Check requires to occur tagged machine-controlled? Otherwise the node is a requirement needing refinement. | Yes if tags exist | zave-jackson (rule b) |
| 3.18 | Soft goal carries measure | For a soft/optimize node: quantity with sort and definition, direction (maximize/minimize), target value present? | Yes: structural | kaos (quality variable, objective function; fit criterion) |
| 3.19 | Every Check traces to exactly one node | Does each Check reference one node id; every leaf has ≥ 1 Check? | Yes: link integrity | ears (Kiro), iso29148 |
| 3.20 | Cost and time estimate | Cost c(ri) and time t(ri) to run the Check recorded and within budget? | Yes: fields | attributes (Davis Q5) |
| 3.21 | Executable form attached | Can a tool run or simulate the Check (test, script, query)? | Yes: structural | attributes (Davis Q14), ears (Kiro property) |
| 3.22 | Literal expected values quoted | Each expected output literal in quotation marks? | Yes: pattern | ambiguity |
| 3.23 | Check proves the Intent at its own level | If the yes-condition held, would the customer accept the Intent realized, and is the observation on this node's entity, not a deeper component? | No | iso29148, hierarchy (parent verified at own level) |
| 3.24 | Success criteria follow from wording alone | Can a verifier write pass/fail from the Check text and glossary without asking the author? | No | incose-gtwr C7/C3, terminology, inspection (PBR E6T q1), hierarchy |
| 3.25 | Testable, demonstrable, inspectable or analysable | Can the reader name the method and what is observed; finite and affordable; not undecidable? | No | inspection (NASA SY Testability), attributes (Davis, IEEE), ears (provable true or false), hierarchy |
| 3.26 | Intent and Check describe the same property | Is there a behaviour that passes the Check yet violates the Intent, or vice versa? | No | kaos |
| 3.27 | Check observes a condition the Intent constrains | Is the observed quantity among the Intent's target or bound, not an unrelated proxy? | No | kaos (PGS04 H1) |
| 3.28 | Time quantifier matches pattern | Maintain/Avoid Check fails on any violating state; Achieve/Cease Check looks within the bound? | No | kaos |
| 3.29 | Check evaluated only under the guard | Does the Check state when the observation is made and that the response is required iff preconditions and trigger hold; outside the guard nothing is evaluated? | No | ears (T-EARS; RE'09 §4.1) |
| 3.30 | Stimulus, observed output, expected value | Does the Check name what is set or triggered, which output is observed, and the comparison value (one CompareVariable)? | No | ears (PLC) |
| 3.31 | Positive and negative case covered | Trigger-true case expecting the response and trigger-false case expecting its absence, here or in siblings? | No | ears (PLC: two test cases per requirement) |
| 3.32 | Binary Check phrased as a universal property where possible | Can it be read "for any input where <preconditions>, <response> holds", with generatable inputs? | No | ears (Kiro) |
| 3.33 | External / non-deterministic Checks marked example-based | Does the Check depend on an external service or non-determinism; if so labelled example-based or mocked? | No | ears (Kiro) |
| 3.34 | Numeric Check names benchmark | How the quantity is measured and the threshold with unit named? | No | ears (RTEMS benchmarks), inspection |
| 3.35 | Statistic over a time window | Does a condition on a continuously varying quantity over a window name the aggregation (mean, min, RMS)? | No (regex flag "for more than <duration>") | ambiguity |
| 3.36 | Time prepositions and outside-interval behaviour | For until, by, through, after, at, during: inclusion of end points and behaviour outside stated? | No | ambiguity |
| 3.37 | Decidable from past and present | Can yes/no be decided at observation time from preceding events and states (no eventually, no further, never again)? | No (lexicon pre-filter) | zave-jackson (rule c), kaos (reference to future) |
| 3.38 | Liveness bounded by a domain property | Does "something must happen" state within what time, with the bound traceable to a recorded assumption? | No | zave-jackson, kaos (Achieve leaf bound: deterministic regex) |
| 3.39 | Safety or liveness shape | Can it be read "in <state>, <named action> does not occur" or "whenever <state>, <named action> occurs [within bound]"? | No | zave-jackson |
| 3.40 | Machine has timely information | Is everything the decision depends on a shared phenomenon already observed at the moment of acting? | No | zave-jackson |
| 3.41 | Everyday words hiding a state ambiguity | Does "turned off"-like wording say current instance or capability? | No | ambiguity |
| 3.42 | Automatic behaviour pinned in time | Does every "automatically" state the triggering event or time? | No | ambiguity |
| 3.43 | Event counts as happened when? | Has a domain reader asked, for each event in the Check, exactly when it counts? | No | ambiguity (Gleich) |
| 3.44 | Conditions are measurable attributes | Can the truth of each condition clause be measured or observed? | No | terminology (29148 3.1.6), iso29148 |
| 3.45 | Quality-attribute requirements quantified | Does an NFR state threshold and how observed? | No | smells F25, attributes |
| 3.46 | V&V adequacy argued | Does the Check record why this observation is enough? | No | hierarchy (Dick) |
| 3.47 | Check free of language-criteria violations | Same lexicons as §2 applied to the Check text | Yes | iso29148 (via smells), hierarchy |

### 3.2 Sentence shapes (verbatim)

EARS [ears], from RE'09 and alistairmavin.com:
- Generic: `<optional preconditions> <optional trigger> the <system name> shall <system response>`; current form `While <optional pre-condition>, when <optional trigger>, the <system name> shall <system response>`.
- Ubiquitous: `The <system name> shall <system response>`.
- Event-driven: `WHEN <optional preconditions> <trigger> the <system name> shall <system response>`.
- Unwanted behaviour: `IF <optional preconditions> <trigger>, THEN the <system name> shall <system response>`.
- State-driven: `WHILE <in a specific state> the <system name> shall <system response>` (During allowed).
- Optional feature: `WHERE <feature is included> the <system name> shall <system response>`.
- Complex: `While <precondition(s)>, When <trigger>, the <system name> shall <system response>`.
- Ruleset: "Zero or many preconditions; Zero or one trigger; One system name; One or many system responses." Clause order "following temporal logic"; response required "if and only if the preconditions and trigger are true".

ISO 29148 construct [iso29148], Figure 1: `[Condition] [Subject] [Action] [Object] [Constraint of Action]` and `[Subject] [Action] [Constraint of Action]`; example "When signal x is received, the system shall set the signal x received bit within 2 seconds"; conditions are "measurable qualitative or quantitative attribute". INCOSE restatement [incose-gtwr]: `When <condition clause>, the <subject clause> shall <action verb clause> <object clause> <qualifying clause>.`; basic pattern "The <entity> shall <what>, <how well>, <under what conditions>."; one clause order per set.

Other shapes: Rupp [ambiguity] `[when?] [under what conditions?] THE SYSTEM SHALL <process> <thing to be processed> [<process detail>*]`; Rimay [smells] `REQUIREMENT: SCOPE? CONDITION_STRUCTURES? ARTICLE? ACTOR MODAL_VERB not? SYSTEM_RESPONSE.`; KAOS [kaos] "if C then eventually T [within d]" (Achieve), "if C then always T [unless N]" (Maintain), "if C then never T [unless N]" (Avoid), names as object + past participle; Kiro [ears] property "For any set of inputs where certain preconditions hold, some expected behavior is true." and regression form `WHEN [condition] THEN the system SHALL CONTINUE TO [existing behavior]`; T-EARS [ears] guard/assertion; IEEE 830 [attributes] measurable form: output "within 20 s of event 60% of the time and within 30 s 100% of the time".

### 3.3 How a one-sentence pass/fail criterion should read

Supported by `ears` (guard/assertion; stimulus–observed output–expected value), `zave-jackson` (shared phenomena, machine-controlled, decidable from the past), `attributes` (IEEE measurable proportion), `kaos` (pattern-matched quantifier), `incose-gtwr` R33/R34:

`[While <glossary state>,] [when <glossary event>,] <observed shared phenomenon of the Entity> <comparator> <value unit [± tolerance]> [within <N unit> of <event>] [in <proportion> of cases]; yes iff <comparison holds>.`

Binary kind: the observed phenomenon is an event or state and the comparator is "occurs / does not occur within <window>". Numeric kind: number, unit, bound and tolerance mandatory. Open-ended kind: must still name the observer, the artefact observed and who decides (method = inspection or analysis), or be typed soft with quantity, direction and target [kaos].

### 3.4 Tension with the encyclopedia-entry Intent, and how both hold

- Every template above puts "shall" (or an agreed equivalent) in the sentence [iso29148, incose-gtwr, ears, ambiguity, smells]. HeadCanon's Intent is an indicative encyclopedia sentence.
- The standards permit this: 29148 5.2.4 NOTE 2 allows other agreed formulations if the signal is agreed; INCOSE: "shall" "or another term defined to have the same meaning" [incose-gtwr]; `zave-jackson` argue for exactly this ("optative descriptions become indicative -- the wishes come true"), mood fixed by slot; `ambiguity` (Gleich) says not to flag indicative mood as a defect; `kaos` goal definitions are natural-language state descriptions.
- Proposal, all supported: (1) The style guide (R39) declares the Intent field as the binding signal: an Intent is optative by position, written in present indicative, and check 2.4 (no modals) runs instead of 2.1. (2) The Intent must still fill the 29148 slots: entity subject (2.7), one capability (2.62), stated conditions (2.61) with EARS keyword clauses allowed (2.41/2.42), a bound or an explicit reference to the Check for it. (3) The Check carries the shall-free guard/assertion form of §3.3, so EARS clause-order and Rimay segment checks run on the Check, and the Kiro property mapping and PLC test derivation apply there. (4) Node names keep the KAOS object + past participle form so a name is never read as an operation.

---

## 4. Checks on a hierarchy (parent and children)

| # | Check | Binary test | Det | Sources |
|---|---|---|---|---|
| 4.1 | Every non-root has a parent; root traces to a need | Parent link non-null and resolving; root has a source/need reference; no orphans | Yes | iso29148, incose-gtwr C1 (A2/A3), kaos (justifying parent), hierarchy, inspection (NASA traceability), attributes (IEEE backward) |
| 4.2 | Every non-leaf has ≥ 1 child; every leaf typed | Non-leaf child count ≥ 1; leaf type ∈ {requirement, expectation, domain property} and (children > 0) xor (Check present) | Yes | hierarchy (Wheatcraft), incose-gtwr C10, kaos (criteria 1, no wishful thinking), iso29148 |
| 4.3 | Child count band | 2 ≤ children ≤ 7±2; flag > 9 and == 1 | Yes | hierarchy (SEH 1.3.5), attributes (Genova nesting), smells (T3 min/max), iso29148 (traceability measures) |
| 4.4 | No trivial single-child refinement | One child ⇒ refinement cites a domain property; otherwise merge | Yes | kaos (FRP96 rule 4), hierarchy |
| 4.5 | Graph acyclic; shared subgoal is one node | No cycle; no textual duplicate under two parents | Yes | kaos, iso29148 |
| 4.6 | Satisfaction argument recorded | Parent has non-empty argument naming children, domain properties/expectations used, explanation; one argument per parent; operator field == AND | Yes (presence) | kaos, zave-jackson, hierarchy (Lockerbie three slots; "&" operator) |
| 4.7 | Domain properties used in arguments are nodes | Every argument reference resolves to an existing node labelled invariant or hypothesis | Yes | kaos, hierarchy, zave-jackson |
| 4.8 | Derived child marked and traced both ways | derived flag ⇒ upward trace and downward trace to As built or implementing item | Yes | iso29148 3.1.10, hierarchy (INCOSE pamphlet) |
| 4.9 | Bidirectional links consistent | Link visible from child and from parent | Yes | iso29148, hierarchy, attributes (IEEE), inspection |
| 4.10 | Children of a requirement inherit its agent; expectations and domain properties have no children | Type/agent of children; out-degree 0 for expectation/domain property | Yes | kaos (KT07) |
| 4.11 | Refinement stops at single-agent assignability | Single-agent node is a leaf (KT07 exception allowed); every non-leaf lacks a single responsible agent | Yes | kaos |
| 4.12 | Typed; performance bound to a function | Type ∈ enum; performance node has functional parent/link and a quantity | Yes | iso29148 5.2.8.3 |
| 4.13 | Continuance implies children | Node containing below, as follows, following, listed, in particular, or ending ":" has children | Yes | ambiguity (ARM) |
| 4.14 | If without else: complement as sibling | Each if-clause has else/otherwise in sentence or a sibling for the complementary case; several ifs with one else fail | Yes | ambiguity (Ferrari PMC), smells (N1) |
| 4.15 | Otherwise/else scope | "otherwise" after > 1 condition states its own negated condition | Yes | ambiguity |
| 4.16 | Branches with identical conditions merged | No two siblings with string-identical conditions | Yes | smells S7 |
| 4.17 | Multi-parent report; multi-parent rationale | Query children with parent count > 1; each carries written reason (judged) | Yes (report) | hierarchy (Wheatcraft) |
| 4.18 | Parent verified after children, at its own level | Parent Check passed only after all children pass and the parent's own observation was made; every layer has a Check | Yes (ordering) | hierarchy, iso29148 (at the level it exists), ears (every layer tests), inspection |
| 4.19 | Pyramidal shape; specification depth | Node count non-decreasing with depth; every node in the tree carries an Intent, descriptive text kept in As built | Yes | ambiguity (Wilson) |
| 4.20 | Punctuation > 3 restructured into children | Statement with > 3 punctuation marks split into numbered sub-nodes | Yes | ambiguity (Wilson) |
| 4.21 | Stricter lexicon at lower levels | Plural-subject and also/but checks enforced on leaves, relaxed on high parents; TBx relaxed early | Yes: per-depth config | ambiguity (Ferrari), incose-gtwr (Appendix D tailoring), smells (F19) |
| 4.22 | Traceability measures | % non-leaf without children; mean children per parent; compared with bounds | Yes | iso29148 6.6.3 |
| 4.23 | Coverage verdict discipline (machine) | Prompt is yes/no + explanation; "covered" needs human confirmation; "not covered" opens a defect | Yes | inspection (Preda) |
| 4.24 | Related nodes grouped; set follows outline | Same classification under one parent; outline categories present or N/A | Yes (position vs class) | incose-gtwr R41/R42, hierarchy, attributes (Davis organized, judged), ambiguity (QuARS views) |
| 4.25 | Dependent children linked | Siblings sharing a budget or interface carry a dependency link (A33) | Yes (presence); identification judged | incose-gtwr |
| 4.26 | Refinement complete (entailment) | Assume all children and cited domain properties hold: must the parent hold in every case? Counterexample ⇒ missing child | No (SAT when formal) | kaos (FRP96 cond. 1), incose-gtwr C1/C10/C14, iso29148 (able to be validated), zave-jackson (S, K ⊢ R), hierarchy (sufficiency), inspection (necessary and sufficient), ears (children cover every parent clause), smells (S15 postcondition) |
| 4.27 | Refinement minimal | For each child, with it removed, is there a case where the rest hold but the parent fails? Child whose removal changes nothing is redundant | No (LoO loop mechanisable) | kaos (cond. 2), incose-gtwr C1 removal, iso29148 (necessary), hierarchy (necessity; verification-based belonging), inspection (Preda LoO; Extraneous) |
| 4.28 | Refinement consistent | Is there one behaviour satisfying all children and domain properties together? | No | kaos (cond. 3), zave-jackson (W consistent) |
| 4.29 | Pattern instantiated or proof given | Does the refinement match milestone / case / guard / divide-and-conquer / image+accuracy with side conditions, or carry its own proof? | No | kaos |
| 4.30 | Guard introduction keeps C until T | Where children are C∧D ⇒ ◊T and C ⇒ ◊D, is C ⇒ C W T present? | No | kaos (RP1 missing Maintain) |
| 4.31 | Case split disjoint, covering, target-preserving | Cases pairwise exclusive, jointly exhaustive, each target entails parent target; covering condition stated as a domain node | No | kaos (RP4) |
| 4.32 | Milestone chain contiguous | First child's C is the parent's C, last child's T is the parent's T, each target equals the next current condition | No | kaos |
| 4.33 | Divide-and-conquer keeps release condition | One child per conjunct, each with identical "unless E" | No | kaos (RP2) |
| 4.34 | Unmonitorable / uncontrollable condition resolved | Child on the image condition plus child stating image ⇔ actual, typed | No | kaos (ABT02), zave-jackson (unshared information bridged; model correspondence own node) |
| 4.35 | Children need fewer agents | Each child needs no more agents than the parent, some strictly fewer | No | kaos |
| 4.36 | Each child justified by its parent | Can "why does this child exist?" be answered from the parent and rationale alone? | No | iso29148 6.4.3.5, hierarchy (SEBoK allocation), inspection (Wrong Section) |
| 4.37 | Child at the right level; belongs to the entity that implements the parent | Subject of the node is the entity of the set it sits in; neither parent-level generality nor grandchild detail; misplaced nodes move | No | incose-gtwr C2 leveling, iso29148, hierarchy, ears (system name consistent down the tree), attributes (Davis), smells (F19, F31 sibling detail consistent) |
| 4.38 | Leaf is not a thesis statement; leaf is a black box | Can the leaf's inputs, outputs and conditions be named from outside the element? Otherwise promote to parent | No | ears (Kiro), hierarchy (SEH atomic element) |
| 4.39 | No child restates its parent | Does the child add refinement rather than repeat? | No (exact match deterministic) | hierarchy (R30), kaos (non-triviality), attributes |
| 4.40 | Root stops at the system boundary; scope pinned by designations | Asking WHY of a root leads outside the system's agents; root names the designated phenomena in scope | No | kaos, zave-jackson (goal regress) |
| 4.41 | Environment-constraining node has an argument | Node constraining an environment-controlled phenomenon has a recorded argument naming K and S | No (tag flags deterministically) | zave-jackson |
| 4.42 | Unobservable quantity renamed; future reference bridged | Distinct "expected-X" term and a gap node; future-referring Intent refined by past-relating assumption with its imperfection recorded | No | zave-jackson |
| 4.43 | Precondition justified by an assumption | Each precondition As built relies on has an assumption that the environment never violates it, or an error-handling node | No | zave-jackson |
| 4.44 | Identity mapping explicit | For plural entity types the machine distinguishes, the identifying mapping is a designated phenomenon or a node | No | zave-jackson |
| 4.45 | Correct against the parent (validation) | Would satisfying the child as written meet the parent's intent? | No; human | incose-gtwr C8, hierarchy, iso29148 |
| 4.46 | Interaction table | For each node, related nodes and relation type (overlaps, conflicts, adds detail to, requires, constrains) identifiable without doubt | No | ambiguity (Kamsties) |
| 4.47 | Obstacle tree for leaves | Root = negated goal, OR-refined, leaves domain-consistent and environment-producible; mirror conditions hold | No | kaos |
| 4.48 | Higher level takes precedence | Child–parent conflict resolved by changing the child (or the parent by its owner), never silently kept | No | hierarchy (INCOSE pamphlet) |
| 4.49 | Comprehensible: relation to the whole clear | Can a reader state what the entity must do and how it fits the parent's system? | No | iso29148, incose-gtwr C13 |
| 4.50 | Underspecification judged by stage | Does the missing detail force a decision now? | No | smells G2 |
| 4.51 | Grouping by one principle | Children follow one principle (user class, stimulus, response, feature, object) | No | attributes (Davis) |
| 4.52 | Pre/postconditions established; conditions neither redundant nor missing | After the children's flow the parent's postcondition holds; no unused or unstated condition | No | smells (F35, S15, S16, S20) |
| 4.53 | Compound parent split into atomic children | Each child in one pattern; union of children's conditions and responses covers the parent's | No | ears (PLC) |
| 4.54 | Converse Maintain for each Achieve | Recorded answer to "may Target hold when Condition does not?" | No | kaos (TAY H9 secondary) |

---

## 5. Checks on the whole set

| # | Check | Binary test | Det | Sources |
|---|---|---|---|---|
| 5.1 | No TBx anywhere; no open node at baseline | Zero TBx tokens; count(state == open) == 0 for baselined set | Yes | iso29148, incose-gtwr, attributes, smells, ambiguity |
| 5.2 | Exact duplicates | After normalising case/whitespace, every Intent text unique | Yes: string match | incose-gtwr R30, hierarchy, kaos, ears, attributes (Davis Q18) |
| 5.3 | Near-duplicate candidates | Pairs sharing subject, verb, object or most domain terms listed for review | Yes (candidates); verdict judged | incose-gtwr R30, iso29148, attributes (Genova overlappings), terminology, smells (F32) |
| 5.4 | Homogeneous units; one unit per property | One measurement system; each property–entity pair uses one unit | Yes: unit lexicon by dimension | iso29148, incose-gtwr R6/C11, hierarchy, attributes (Genova block metric), terminology |
| 5.5 | Numeric bounds on same quantity | Disjoint ranges for the same quantity flagged; (object, attribute) pairs with more than one value flagged | Yes: pattern | iso29148, attributes (IEEE 4.3.4.1a), ears |
| 5.6 | Deterministic function (state, stimulus) → (state, response) | Index nodes by (state, stimulus); keys with > 1 distinct response fail; every cell of state × stimulus mapped (Q2) | Yes when states and inputs enumerated | attributes (Davis Q2, Q6), inspection (deterministic outcome), ears (no reachable state without behaviour) |
| 5.7 | Each state variable controlled by one agent | Controlled-variable → agent mapping is a function | Yes | kaos |
| 5.8 | Every As-built item justified; every leaf operationalized or open | As-built record links ≥ 1 node; each leaf has As built or explicit "open"/"not yet built" | Yes | kaos (criterion 5; open requirements), iso29148 (downward trace), inspection (vice versa trace) |
| 5.9 | Unique, immutable, never-reused ids; one scheme | Uniqueness; id history diff; tombstones; sibling scheme consistent | Yes | iso29148, attributes (Davis Q11, IEEE), ears (RTEMS), ambiguity (ARM), smells (T2) |
| 5.10 | Version per node; volatility reported | Version counter; edits per period vs threshold | Yes | iso29148 6.6.3, attributes (Genova versions; IEEE audit trail) |
| 5.11 | Forward impact query | Given a changed code unit or node, list every node whose As built / Check / link touches it; links marked suspect until reviewed | Yes | attributes (IEEE forward), hierarchy (impact analysis) |
| 5.12 | Every Check traces to one node; all links resolve | Referential integrity Checks ↔ nodes ↔ As built | Yes | ears, smells (T1), iso29148 |
| 5.13 | Interface requirements paired | Each interface node links to its counterpart and a shared definition (A32) | Yes | incose-gtwr C11 |
| 5.14 | Category coverage | Every template category (function, fit, form, quality, compliance; IEEE five classes; NASA nine topics; 29148 types × stages × stakeholders) populated or marked N/A with reason | Yes (count); relevance judged | incose-gtwr C10/R42, iso29148 5.2.6, attributes (IEEE 4.3.3a), ambiguity (Wilson nine topics) |
| 5.15 | Responses to invalid inputs | Each glossary input has a node for valid and one for invalid handling | Yes (structural) | attributes (IEEE 4.3.3b), ears (Kiro) |
| 5.16 | Unwanted-behaviour counterpart | Every When/While node has an If…Then node for failure/invalid/missing case or a recorded decision none is needed | Yes (listing); decision judged | ears (RE'09; PLC; Kiro), incose-gtwr C10 off-nominal, inspection (undesired events) |
| 5.17 | Preserved behaviour on fixes | Each bug-fix node has a CONTINUE TO node | Yes (presence) | ears (Kiro) |
| 5.18 | One clause order per set | Condition slot position identical across nodes | Yes | incose-gtwr |
| 5.19 | Acronyms, abbreviations, decimal format, style guide across set | One expansion per acronym; one decimal convention; style-guide rules pass | Yes | incose-gtwr R37/R38/R40/R39, hierarchy |
| 5.20 | Findings density and defect rate | Findings per 1,000 words per smell; defective sentences / sentences per indicator, tracked across versions | Yes | smells (F20; QuARS), ambiguity |
| 5.21 | Size and conciseness ratios | Lines per imperative; imperatives per subject within bands | Yes | ambiguity (ARM) |
| 5.22 | Electronically stored; TOC and index present | All nodes as text records; tree view and glossary-to-node index exist | Yes | attributes (Davis Q12, Q13; IEEE 4.3.7a) |
| 5.23 | Intent ≠ As built text; assumptions apart | Intent not identical to As built; assumptions recorded as separate nodes | Yes | zave-jackson |
| 5.24 | Comprehensible = conjunction of verdicts | All per-node (C1, C3, C4, C6, C7, C8) and set (C10, C11, C12, C14) verdicts yes | Yes (aggregate) | incose-gtwr C13 |
| 5.25 | Full conformance aggregate | AND of construct, individual, set and language checks | Yes | iso29148 4.2 |
| 5.26 | No conflicts | For pairs with shared subject and overlapping guards: can both be satisfied by one system under the same conditions? Logical/temporal action conflicts | No (pair generation deterministic) | iso29148, incose-gtwr C11, attributes (IEEE 4.3.4.1b; Davis Q7 external), ears (RTEMS; Kiro), kaos (conflict, divergence), inspection, hierarchy, terminology |
| 5.27 | Recorded conflict is minimal; divergence has boundary condition and resolution from the closed list | Leave-one-out dissolves inconsistency; resolution ∈ {avoid boundary, restore, anticipate, weaken, alternative refinement, object/agent refinement}; safety goal not the one weakened | No (resolution field structural) | kaos, zave-jackson (precedence decision) |
| 5.28 | Composition concerns across branches | Each phenomenon used in two branches has interference / scheduling / conflict recorded or ruled out; writer–reader granularity stated | No (term-overlap scan deterministic) | zave-jackson |
| 5.29 | One concept, one node | Two nodes admitting the same behaviours merged into one with several parents | No | kaos, iso29148, terminology, hierarchy |
| 5.30 | Set complete: stands alone; all situations and no unneeded ones | Every situation covered; no node for a situation that cannot occur; known-but-unwritten list (block B) empty; whole set validated as all the customer's desires | No | iso29148, incose-gtwr C10, attributes (Davis Q2'', Wilson complete), zave-jackson, kaos (requirements complete w.r.t. goals) |
| 5.31 | Requirements complete with respect to goals; every leaf pertinent | Leaves plus domain properties entail every goal; every leaf appears in some parent's argument | No / Yes (pertinence structural) | kaos |
| 5.32 | Scenarios exist to validate the set | Every top-level node traces to a use case or scenario | No (trace structural) | incose-gtwr C14 |
| 5.33 | Initial state, breakage, reliability | Initial environment state recorded and Intents hold from it; damaging sequences for causal domains forbidden; failure of device properties addressed | No | zave-jackson, inspection (initial and special states) |
| 5.34 | Outputs consumed; interfaces chain | Every output used by another function or external interface; inputs of one step appear as earlier outputs | No (candidates deterministic) | inspection (NASA R1; PBR E6U) |
| 5.35 | Sufficient base for design / implementers without further questions | Could an implementer build from leaf Checks and glossary alone? | No | zave-jackson, inspection (PBR E6D; NASA 7.4.1f) |
| 5.36 | Domain-complete obstacles for high-priority leaves | If none of the listed obstacles occurs, must the goal hold? | No | kaos |
| 5.37 | Set feasible and affordable as a whole | Set assessed together against constraints, result recorded | No | iso29148, incose-gtwr C12, attributes (Davis collective external consistency), hierarchy |
| 5.38 | Set correct | Realizing every node meets the intent of premise and higher-level nodes | No | incose-gtwr C15, hierarchy |
| 5.39 | Context attached | Premise / lifecycle concepts present; rationale per node | No (presence structural) | incose-gtwr C13 |
| 5.40 | Weak coupling | Change to one Intent ripples to few nodes outside its subtree | No (shared-term count proxy) | inspection (NASA SY) |
| 5.41 | Unstated relation behind two readings | Any node's meaning depends on an unstated relation between constants or other nodes? Record as assumption node | No | ambiguity (Handbook ESFAS) |
| 5.42 | Referential / discourse ambiguity across nodes | Pronouns, definite NPs, "if not", ordinals refer to one object in other nodes | No | ambiguity (Kamsties) |
| 5.43 | Both moods may constrain any action category | Upper-level Intents can constrain environment actions without being rewritten as machine outputs | No | zave-jackson |
| 5.44 | Agent assignment avoids conflicting wishes; fewer-conflict refinement favoured | Responsible agent does not wish a conflicting goal; selected alternative introduces no more conflicts | No | kaos |

---

## 6. Checks on the glossary and term use

| # | Check | Binary test | Det | Sources |
|---|---|---|---|---|
| 6.1 | Every term resolves to one entry | Every marked term, capitalised token, acronym, system name and domain noun phrase in Intent, Check and As built matches exactly one glossary entry (or declared synonym) | Yes: lookup | iso29148, incose-gtwr R4, ears (RTEMS), kaos, zave-jackson (rule 1), ambiguity (Ferrari PUT), smells (F30 part), attributes (IEEE 5.1.3; Davis), hierarchy R4, terminology R4, inspection |
| 6.2 | Marked form convention | Every glossary term in text is in the marked form (Capitalized_Underscored); every marked token is an entry; convention recorded in the style guide | Yes: regex `[A-Z][A-Za-z]*(_[A-Z][A-Za-z]*)*` | incose-gtwr R4, terminology |
| 6.3 | Headwords unique, one definition, agreed status | Duplicate-key check; definition non-empty; status (who agreed, when) present; stakeholder validation record | Yes | incose-gtwr, kaos (KT07 §2.7; validation sessions), terminology (R4 agreed), zave-jackson |
| 6.4 | Definitions declarative, never requirements | Glossary text contains no binding marker; a node matching `^<Term> (is\|are\|means) (a\|an\|the)` with no action/constraint is flagged | Yes | iso29148 5.2.7, kaos, zave-jackson (definition cannot be false) |
| 6.5 | Entry typed designation or definition | Tag present; definition bodies use only glossary terms | Yes | zave-jackson |
| 6.6 | Phenomenon tags | Each action/state has control ∈ {environment, machine} and sharing ∈ {shared, unshared}; no "both"/mixed; machine-controlled ⇒ shared; no designation of machine state (table, flag, cache, buffer…) | Yes (lexicon pre-filter for machine state) | zave-jackson |
| 6.7 | Measured terms carry units, format, accuracy, type, range, initial and failure value | Required fields for quantity/data-object entries | Yes | incose-gtwr R4 (Current_Time), inspection (Porter Scenario A), attributes (Davis symbolic constants) |
| 6.8 | Shared numeric values are named variables | Identical value+unit literal in ≥ 2 nodes without a glossary variable fails | Yes | incose-gtwr R36, terminology, attributes (Davis reusable) |
| 6.9 | Dictionary holds schema, acronym list, states/modes | Three lists present; every state/mode/trigger in a condition clause resolves | Yes | incose-gtwr (R29, R36, R37), ears (RTEMS) |
| 6.10 | Preferred term replaces forbidden synonym | No lemma matches a forbidden-synonym entry | Yes | smells T16, incose-gtwr R36, attributes (IEEE one term per object) |
| 6.11 | Class words enumerated | Bare class words (flow, access, testing…) carry an instance modifier; glossary enumerates instances; group nouns resolve to enumerated entries | Yes (dictionary + stop-list) | ambiguity (QuARS), smells N3, incose-gtwr R22 |
| 6.12 | Noun stacks are glossary terms | Three consecutive nouns/adjectives or `JJ NN (and\|or) NN` resolve to one defined term | Yes: POS | ambiguity |
| 6.13 | Glossary coverage residue empty | Lemmatised content nouns and verbs minus stop words minus glossary minus common-knowledge list minus referenced glossaries = ∅ | Yes | attributes (Genova), terminology (Arora omissions), kaos (object-model coverage) |
| 6.14 | Candidate extraction rules | NP chunking; remove determiners, pre-determiners, cardinals, possessive pronouns; lemmatise plurals; keep `NP of NP` and `NP's NP` as one term; all-capital tokens and NNP runs are entries; lower-case single WordNet nouns exempt; no frequency filter; no verb phrases (per Arora) | Yes | terminology (Arora) |
| 6.15 | Clustering recipe for consolidation | SoftTFIDF pairwise similarity, EM clustering, K = largest K ≤ n/2 with BIC ≥ BICmax − (BICmax − BICmin)/10; semantic measures not alone | Yes | terminology (Arora) |
| 6.16 | Pairwise ambiguity score and bands | score = (2·sim(t1,t2) + sim(ctx1,ctx2))/3; bands low [0,0.25), medium [0.25,0.35), high [0.35,1]; co-occurring terms in one statement excluded from context; compare terms used by ≥ 2 roles | Yes | terminology (Dalpiaz) |
| 6.17 | Glossary built alongside requirements; one glossary | Each change introducing a term adds/updates its entry in the same change; a single glossary store | Yes: diff | terminology (Arora; GtWR R36) |
| 6.18 | Entry structure and relationships | Definition plus fields synonyms/variants, related terms, examples; typed links (specialisation, aggregation, composition) | Yes: schema | terminology (Arora; GtWR ontology) |
| 6.19 | Dictionaries extended per domain with stop-lists | Smell/vague lexicons versioned with additions traced to reviewed findings and stop-lists | Yes | smells F23, ambiguity (Ferrari, QuARS) |
| 6.20 | Declared actors equal used actors | Set of actors used in flows == set declared | Yes | smells S12 |
| 6.21 | Same term, same meaning everywhere (no designation clash / homonymy) | Does every occurrence read in the glossary's sense; one word used for two concepts fails | No (candidates: shared Venn areas) | iso29148, incose-gtwr R4/R36, kaos (CON98), terminology (Dalpiaz conflict), ambiguity (Handbook polysemy over time), smells (S13), attributes (Davis), inspection |
| 6.22 | One concept, one term (no terminology clash / near-synonymy) | Two terms with the same denotation fail unless merged or both defined with the distinction stated | No (clusters/scores are candidates) | incose-gtwr R36, kaos, terminology (Dalpiaz correspondence; Arora variants), attributes (IEEE 4.3.4.1c), smells (T8) |
| 6.23 | Structure clash | All references agree on a concept's structure | No (type check when declared) | kaos |
| 6.24 | Definition decides membership; recognition rule; identity rule | Borderline instance settled by the definition alone; observer can recognise an instance; two instances distinguishable | No | kaos (LET01), zave-jackson |
| 6.25 | Abstractions explained in observables | Each abstract entry traces to observable events or states | No | zave-jackson |
| 6.26 | Control tag correct | Would it occur if the machine did nothing (environment)? if the environment did nothing (machine)? | No | zave-jackson |
| 6.27 | Entries descriptive, not prescriptive | Definition holds regardless of the software | No (lexicon flags) | kaos, zave-jackson |
| 6.28 | Users' terminology | Headword is the word the user/sponsor uses | No | inspection (NASA R1) |
| 6.29 | Meaning stable across code and model | Each term maps to one concept in code; identifier mapping as proxy | No | incose-gtwr R4, kaos |
| 6.30 | Concept vs attribute; doubtful terms included | Uncertain status ⇒ concept; unsure ⇒ include | No | terminology (Arora) |
| 6.31 | Cross-viewpoint classification; single-viewpoint term triggers completeness question | Pairs classified consensus / correspondence / conflict / contrast; term in one viewpoint has recorded answer | No | terminology (Dalpiaz) |
| 6.32 | Interpretation conventions written down | Precedence and logical conventions declared | No | ambiguity (Handbook §4.3), incose-gtwr R39 |
| 6.33 | Model-element ambiguity | "X has Y" decided as attribute vs own node | No | ambiguity (Kamsties) |
| 6.34 | Clusters reviewed before definitions; verdict with argument, in context, by domain reader; only consequential ambiguities acted on | Recorded verdict per cluster/pair with argument citing containing statements | No | terminology (Arora, Dalpiaz) |
| 6.35 | Term use consistent with type | Use of a quantity compatible with type and range | Yes when numeric; else No | inspection (Porter Scenario A) |

---

## 7. The review method the literature supports

### 7.1 Defect classes to record per finding
- Type from one taxonomy: omission (missing functionality, performance, interface, environment) vs commission (ambiguous, inconsistent, incorrect fact, wrong section) [inspection, Porter]; PBR adds Extraneous [inspection]; Fagan cause ∈ {missing, wrong, extra}, severity ∈ {major, minor}; NASA adds clerical [inspection]. Record also: smell vs defect (`smells` F15: "must be individually decided for that context"), nocuous vs innocuous [inspection, Broccia], ambiguity subtype (lexical, syntactic, semantic, pragmatic, discourse, domain) [ambiguity], and for sets conflict / divergence / terminology / designation / structure clash [kaos].
- Every finding carries location (node id + span) [smells F16], severity and a one-line explanation [ambiguity, Gleich], disposition ∈ {true fault, false positive} [inspection], accept/reject reason [smells F17]; rejected findings are blacklisted [smells F18].
- Only a condition that "precludes the attainment of expected or previously specified results" [inspection] is a defect; findings in rationale text rank below findings in the Intent/Check [smells F21].

### 7.2 Reading technique
- Machine pass first, humans after: lexicon/pattern pass with whole-word matching, lemmatisation, explanation per flag, tuned for recall, stop-lists per domain [ambiguity, smells]; "all text-only defects identified by the human inspector were also identified by QuARS" [ambiguity]; average human analyst recall 19% [ambiguity, Gleich]. But: novices given an LLM during detection scored "about 8% higher F1-scores" without it [inspection, Broccia], so the human first pass is timestamped before model output is shown.
- Gate automatically only on smells with precision ≥ 0.7 (subjective 0.96, ambiguous adv/adj 0.81, loophole 0.72, non-verifiable 0.70; superlative 0.49, comparative 0.48, negative 0.33, pronoun 0.26 are advisory) [smells F22]; each check labelled deterministic / heuristic high / medium / low / not detectable [smells T13]; closed word classes by lexicon, open classes need readers [ambiguity, Ferrari]; parser-derived findings confirmed by a human [smells P16].
- Reading: perspective-based (tester writes tests, designer drafts design, user writes scenarios) and answers the scenario questions while building; keep all three, some defects are found by one perspective only [inspection]; "Checklist method ... was no more effective than the Ad Hoc" unless items carry procedures [inspection, Porter]; checklist questions name the ambiguity type ("simply asking whether there is an ambiguity is not much help" [ambiguity, Kamsties]); walkthrough with owner, implementers and V&V [incose-gtwr]; WHY/HOW both ways, refinements checked by pattern or proof ("goal decompositions made by hand are usually incomplete" [kaos]), defensive pass negating each leaf, obstacle leaves pruned with experts, expectations questioned [kaos]; set-level pass separate from per-node pass [ears, incose-gtwr]; interaction table [ambiguity]; study the ranked error-type distribution before reading [inspection, Fagan]; each reviewer has a work aid matched to the perspective [inspection, NASA].
- Validation separate from verification of form: "determines whether the requirement statement clearly communicates the intent" [incose-gtwr], human only; two status fields (A28, A29) [incose-gtwr]; "Each member of K has been validated (checked informally) as true" [zave-jackson].

### 7.3 Number of reviewers and passes
- At least two independent reviewers other than the author; "no difference in the interval or effectiveness of inspections of two- or four-person teams" [inspection]; NASA: at least three incl. moderator and author, at most six; author "may not serve as moderator nor reader" [inspection]. Two taggers with argument-based reconciliation [terminology]; majority of ≥ 4 readers for quality labels, non-unanimity = flawed/contested [smells U2, inspection]; "If a majority consensus was not reached ... not fulfilling" [smells, Lubos].
- Passes: all perspective passes on the same version, no rework between passes ("repairing defects in between multiple sessions had no effect" [inspection]); individual findings recorded before merging, team result = union, meeting losses ≈ 7% and gains ≈ 3–5% for requirements ("collection meetings contributed nothing to fault detection effectiveness" [inspection]; 30% gains for code, Porter 1997); sessions ≤ 2 hours; expert review before a node becomes stated [ears]; blind grading when calibrating [inspection].
- Machine reviewers: aggregate several runs ("single-execution evaluations are statistically unreliable" [inspection, Shefa]); one binary question per characteristic with definition and scope in the prompt [smells, Lubos]; precision 0.13–0.50 at recall 0.74–0.89 so flags need human confirmation [smells U1, inspection]; LLMs miss necessity (FNR 1.00) and correctness (FNR 0.89) and false-flag conforming (FPR 0.67), so those stay human or mechanical [inspection]; coverage verdicts: trust "not covered" (99.7% recall for a removed child), verify "covered" [inspection, Preda]; machine-drafted nodes get human ambiguity and feasibility review [inspection, Ronanki]; rewrite proposals target one named flaw, numerals diffed [inspection, Krishna/Lubos].
- Expected noise: "only 13 percent of all issues turn out to be true defects" [inspection]; QuARS 29% defective sentences in an inspected document, 16% missed by humans [ambiguity]; tailored inspection found 25% vs 18% generic, "one cannot expect to find all ambiguities" [ambiguity]; inter-rater agreement on terminological ambiguity poor (Fleiss' kappa −0.205) [terminology].

### 7.4 What is known about rework loops
- Prescriptive, not measured: Fagan's rule "If more than five percent of the material has been reworked ... 100 percent reinspection" [inspection]; NASA: re-inspection decided at close against project criteria (many majors, a critical major, many open issues), separate report; exit = all majors verified fixed; entry = template conformance, spell-check, "< 1 major defect per page" [inspection]; author corrects all majors; follow-up by a non-author verifies fixes "and no new Defects have been inserted" [inspection]; open issues unresolved in 3 minutes become Open Issues with owner [inspection]; TBx items need owner and timeframe, closure tracked [iso29148, incose-gtwr].
- Measured: repair between sessions gave no effectiveness gain and longer intervals [inspection]; re-inspection "positive net gain for most teams" but lower than the first inspection [inspection, Biffl]; volatility ("A requirement that has a lot of change could indicate a problem" [iso29148]), Genova version count; EARS case: 36 → 47 requirements, words 36.9 → 25.6 [ears]; Dalpiaz tool recall 0.25 vs manual 0.37 [terminology].
- Gaps: "None of the sources measure how many author–reviewer iterations a requirement needs before it passes" [inspection notes]. The catalogue therefore supports: quality as entry criterion (baseline iff failed checks == 0 or waived) [iso29148], risk flag while any characteristic fails [iso29148], findings density per 1,000 words tracked across versions [smells], and tailoring by stage and level so early loops do not fail on TBx or vague terms at business level [incose-gtwr, smells F19, ambiguity].

---

## 8. Deterministic lexicons worth implementing

Hits are flags for review except where section 2 marks them gating (precision ≥ 0.7 family: subjective, ambiguous adverbs/adjectives, loopholes, open-ended). Lemmatise before matching [smells F24]; whole-word boundaries [ambiguity].

### 8.1 Vague quantifiers, adjectives, adverbs
- `incose-gtwr` R7: some, any, allowable, several, many, a lot of, a few, almost always, very nearly, nearly, about, close to, almost, approximate; adjectives ancillary, relevant, routine, common, generic, significant, flexible, expandable, typical, sufficient, adequate, appropriate, efficient, effective, proficient, reasonable, customary; adverbs usually, approximately, sufficiently, typically; any "-ly" adverb flagged.
- `iso29148` 5.2.7 (via Femmer dictionary): almost, always, usually, generally, normally, significant, minimal, sufficient, adequate, approximately, about, some, several, many, few, timely, appropriate.
- `ambiguity` Handbook: acceptable, accurate, appropriate, easy, efficient, essential, immediately, minimum, maximum, periodically, sufficient, user-friendly; many, few, much, little, several, some; QuARS vague: easy, strong, good, bad, useful, significant, adequate, recent; Gleich: fast, usually, normally, actually; Wilson generalities: large, rapid, many, timely, most, close, easy, normal, adequate, effective; SREE quantifier: all, any, few, little, many, much, several, some.
- `smells` NALABS vagueness: a minimum, up to, adequate, as applicable, be able to, be capable, but not limited to, capability of, capability to, effective, normal, may, could, has to, might, will, some, appropriate, based on; Genova quantity: enough, sufficient, insufficient, approximately, about, roughly, around, some, several, a few, many; frequency: usually, generally, typically, normally, often, frequently, sometimes, rarely, nearly always, mostly.
- `ears` RTEMS 5.1.4: acceptable, adequate, almost always, and/or, appropriate, approximately, as far as possible, as much as practicable, best, best possible, easy, efficient, e.g., enable, enough, etc., few, first rate, flexible, generally, goal, graceful, great, greatest, ideally, i.e., if possible, in most cases, large, many, maximize, minimize, most, multiple, necessary, numerous, optimize, ought to, probably, quick, rapid, reasonably, relevant, robust, satisfactory, several, shall be included but not limited to, simple, small, some, state-of-the-art, sufficient, suitable, support, systematically, transparent, typical, user-friendly, usually, versatile, when necessary.

### 8.2 Subjective adjectives
- `iso29148`: user friendly, easy to use, cost effective; NASA App. C.4 adds flexible, safe, adequate, usable, appropriate, light-weight, maximize, minimize, quickly, easily, clearly, other "-ly" and "-ize" words.
- `smells` F1 seed: user friendly, easy to use, cost effective, simple, efficient; Genova quality: good, bad, adequate, efficient, effective, appropriate, proper, suitable, high-quality, robust; usability: adaptable, extensible, flexible, easy, user-friendly, intuitive, familiar, safe, secure, fast.
- `ambiguity` QuARS subjectivity: similar, similarly, having in mind, take into account, `as \w+ as possible`; NALABS subjectivity (`smells`): similar, better, similarly, worse, having in mind, take into account, take into consideration, as possible.
- `attributes` IEEE: good, well, usually, normally, generally, adequate, appropriate, user-friendly, efficient, reasonable, sufficient.
- `inspection` Broccia/Krishna: user-friendly, easy, simple, fast, efficient, robust, considerable, adequate, appropriate, reasonable, readable, flexible.

### 8.3 Escape clauses / loopholes
- `iso29148`: if possible, as appropriate, as applicable; Femmer: if possible, as possible, as far as possible, where possible, as appropriate, as applicable, as required, if required, when required, as necessary, to the extent, where feasible.
- `incose-gtwr` R8: so far as is possible, as little as possible, where possible, as much as possible, if it should prove necessary, if necessary, to the extent necessary, as appropriate, as required, to the extent practical, if practicable.
- `ambiguity` ARM options/weak: can, may, optionally, if required, as appropriate, if practical, as a minimum, as applicable; QuARS optionality: possibly, eventually, in case of, if possible, if appropriate, if needed.
- `inspection` Broccia optional parts: possibly, eventually, if possible, if needed.

### 8.4 Open-ended terms
- `iso29148`: provide support, but not limited to, as a minimum; NASA adds etc.; Femmer: sufficient, adequate, provide support.
- `incose-gtwr` R9: including but not limited to, etc., and so on.
- `ambiguity` ARM weak phrases (16): adequate, as a minimum, as applicable, easy, as appropriate, be able to, be capable, but not limited to, capability of, capability to, effective, if practical, normal, provide for, timely, tbd; Handbook: not limited to, etc.
- `smells` T5: including, etc., and so on; Genova enumeration: etc., and so on, e.g., such as, including, not limited to, as a minimum, among others, to be defined.
- `iso29148` extended: support, including but not limited to, at least (without bound), such as (in a requirement body), handle, process (without object bound).

### 8.5 Totality / absolutes
- `iso29148`: all, always, never, every (plus any, none, entire, 100%).
- `incose-gtwr` R26: 100%, all, every, always, never; R32 replace all / any / both by each.
- `ambiguity` Gleich: 100 percent, all errors; Ferrari unbounded: without restriction, always, never, 24/7.

### 8.6 Combinators and ambiguous connectives
- `incose-gtwr` R19: and, or, then, unless, but, as well as, but also, however, whether, meanwhile, whereas, on the other hand, otherwise; R15 and/or forbidden; R17 oblique.
- `iso29148`: and, or, and/or; `ambiguity`: and .* or, or .* and, and/or, include(s)/including, otherwise/else/if not after > 1 if, not .* because; Ferrari PCO1 (two coordinating conjunctions); `smells` P4 (or between conditions), Genova: and, or, and/or, as well as, both…and; Ferrari non-atomic: also, but.

### 8.7 Pronouns to flag
- `iso29148`: it, this, that; NASA: indefinite pronouns (this, these).
- `incose-gtwr` R24: it, this, that, he, she, they, them; indefinites all, another, any, anybody, anything, both, either, every, everybody, everyone, everything, few, many, most, much, neither, no one, nobody, none, one, several, some, somebody, someone, something, such ("each" only standalone).
- `ambiguity`: it, they, he, she, this, which, that (relativiser false positive), sentence-initial This + verb, ^Both; definite NPs and "if not" for discourse reference; QuARS implicity: this, these, that, those, it, they, previous, next, following, last, above, below.
- `attributes` Genova anaphoric: it, its, they, them, this, these, those, that, which, where.
- `smells` F12 (POS WDT), S1 (NOP > 0).

### 8.8 Unmeasured quantification and unverifiable terms (Check sentence)
- `incose-gtwr` R34: prompt, fast, routine, maximum, minimum, optimum, nominal, easy to use, close quickly, high speed, medium-sized, best practices, user-friendly.
- NASA App. C.4 (`iso29148` secondary): flexible, easy, sufficient, safe, ad hoc, adequate, accommodate, user-friendly, usable, when required, if required, appropriate, fast, portable, light-weight, small, large, maximize, minimize, robust, quickly, easily, clearly, "-ly", "-ize".
- `attributes` IEEE: works well, good human interface, shall usually happen; Davis: fast, slow, quick, large, small, many, few, often, frequently, soon (no numeral nearby).
- `ambiguity` Ferrari best/worst: best case, typically, nominal; Handbook minimum/maximum open/closed, `up to (?!including|excluding)`.

### 8.9 Vague verbs, superfluous infinitives, weak modals
- Vague verbs: `incose-gtwr` R3 support, process, handle, track, manage, flag; `ambiguity` Handbook support, handle, process, reject, use, user; `smells` Paska: accomplish, account, base, come, consider, default, define, do, get, make, perform, process, propose, raise, read, support, want.
- Superfluous infinitives: `incose-gtwr` R10 to be designed to, to be able to, to be capable of, to enable, to allow, have the capability to; `iso29148` it is required that, shall be able to, be capable of; `attributes` Davis provide the capability to, provide the ability to, the … function of, shall have the ability to.
- Weak/optional modals: `iso29148` must, will, should, may, might, could, can; `smells` N4/F4 could, may, might, should; `ears` RTEMS must, will, ought to; `ambiguity` Gleich could, should, might; ARM imperative strength order shall > must/must not > is required to > are applicable > responsible for > will > should.
- Hedges / speculative (`ambiguity`, `attributes` Genova probability): not limited to, etc., can, may, probably, possibly, usually, optionally, maybe, perhaps, might, could.
- Purpose phrases (`incose-gtwr` R20, `attributes` Moreno): in order to, so that, thus allowing, for the purpose of, purpose of, intent of, reason for, because, since, due to, the reason.

### 8.10 Temporal keywords
- `incose-gtwr` R35: eventually, until, before, after, as, once, earliest, latest, instantaneous, simultaneous, at last.
- `kaos` unbounded eventuality: eventually, sooner or later, at some point; bound phrases accepted: within, before, no later than, at most N units, in the next state.
- `ambiguity` Handbook indexicals and time prepositions: after, before, next, previous, first, last, between, following, above, below, until, by, through, at, on, during.
- `attributes` Genova flow: while, when, whenever, if, then, else, until, loop, repeat, for each.

### 8.11 Implementation / design term flags
- `smells` T10: button, screen, variable, signal, user interface; `attributes` Genova: method, function, class, parameter, database, table, column, API, endpoint, thread, cache, framework names; `zave-jackson` machine-state pre-filter: table, variable, flag, cache, record, field, column, database, queue, buffer; bias pre-filter: stores, computes, uses a, via, through the, internally, thread, call; `incose-gtwr` card examples: MySQL, Python, AWS. Stakeholder-subject lexicon (`iso29148`): user, operator, customer, administrator, team, developer.

### 8.12 Placeholders and incompleteness markers
- `iso29148`: TBD, TBS, TBR, TBx, to be (determined | specified | resolved | defined | supplied), ???, XXX; `smells` N2/T11: as defined, to be completed, to be determined, todo, tbd, tba, ?; `ambiguity` SREE incomplete: TBD, TBA, tbd, etc., as a minimum, as defined, as specified, to be defined; `attributes` Davis/IEEE: TBD, TBC, TODO, FIXME.
- Continuances (`ambiguity` ARM): below, as follows, following, listed, in particular, support. Directives: figure, table, for example, note.

### 8.13 Prescriptive and amelioration keywords (`kaos`)
- Prescriptive: shall, should, must, has to, to be, may not, may never; intentional: objective, purpose, intent, concern, in order to, so that, aim, achieve, maintain, avoid, ensure, guarantee.
- Amelioration (soft goal): improve, increase, decrease, reduce, enhance, enable, support, provide, minimize, maximize, better, faster, more, less.

---

## 9. Conflicts between sources and open questions

1. Binding marker vs mood by slot. `iso29148`, `incose-gtwr`, `ears`, `ambiguity` (ARM), `attributes` require "shall" once; `zave-jackson` want no modals, mood by context; `ambiguity` (Gleich) says "shall" is best practice but indicative mood is not a defect. Resolution proposed in §3.4; the style guide must choose, and 2.1 or 2.4 runs, not both.
2. Negative statements. `iso29148`, `incose-gtwr` R16, `ears` RTEMS: avoid "shall not"; `ears` RE'09 Table 1 and PLC participants use it for testability; `smells` F10 shows practitioners acted on 2 of 3 negative findings, with precision only 0.33; `ambiguity` says true inverse requirements have no test. Rule: flag, then require window and observable (3.10).
3. Conjunctions. `iso29148` NOTE 1 treats "and" as a split signal while NOTE 2 allows several conditions; `incose-gtwr` R19 forbids combinators yet R15 allows bracketed logic; `hierarchy` (Honig) says the conjunction test is not singularity; `ears` allows "one or many system responses"; `smells` P1 and `incose-gtwr` R18 require one. Rule: deterministic flag, judgment on condition vs capability.
4. Pronouns vs repetition. All sources ban pronouns; `smells` S6 flags a noun repeated in one sentence. Repetition wins (precision of pronoun detection is 0.26).
5. Superlatives/comparatives are smells, but acceptable over a finite or numeric set (`smells` F7, F9); vague-term lists are incomplete so `ambiguity` (Gleich) flags every adjective/adverb while Ferrari restricts to -ly adverbs and `smells` (AIRE'17) prefers precision; Krisch and Houdek found weak-word detection 12% precise in practice.
6. Recall vs precision. Berry/Kiyavitskaya and Ferrari 2017 favour recall ("cost of undetected true defects is much higher"); `smells` Femmer and AIRE'17 report "practitioners were more worried about precision than recall"; `terminology` (Arora) favours recall for glossary harvesting. Rule: gate on precision ≥ 0.7, advise on the rest.
7. Meetings. Fagan: most errors found in the meeting; Votta/Porter: ≈ 4% gains, ≈ 7% losses for requirements; Porter 1997: 30% gains for code. Rule: detection by individual passes, group step for triage.
8. PBR vs checklist. Basili 1996 significant for teams; Brazilian replications not significant; Porter 1995: checklists no better than ad hoc. Rule: perspectives with procedures, not bare checklists.
9. LLM assistance. Lubos/Krishna: useful recall and rewrites; Broccia: lowers novice detection; Shefa: misses necessity entirely; Preda: "not covered" reliable, "covered" not. Rule: machine flags advisory, aggregated, human-confirmed; necessity and correctness human-only.
10. EARS internals. Precondition order (RE'09 vs guide); preconditions "zero or many" vs QRA cap of 3; If/Then kept by RE'09 and Kiro, dropped by T-EARS; complex While+When endorsed by the guide, found hard to understand by T-EARS; wanted/unwanted "is a matter of viewpoint" [ears]. Adopt the guide's form, cap at 3, record the wanted/unwanted decision.
11. KAOS refinement of single-agent goals: forbidden in LET01/SCP93, allowed in KT07 when children inherit the agent. Adopt KT07 (HeadCanon leaves refine within one component).
12. Tree vs parallel structure. `zave-jackson`/Jackson: "not the bill-of-materials assembly structure"; `kaos`: AND/OR DAG with shared subgoals; `hierarchy` (Wheatcraft): multi-parent children allowed with rationale; HeadCanon: one concept, one node, single tree. Handled by 4.5 (shared node, several parents), 4.17 and 5.28; open whether HeadCanon admits multi-parent.
13. Completeness definitions: entailment (`kaos`, `zave-jackson`) vs coverage/no-TBD (`iso29148`, `incose-gtwr`) vs state × stimulus function (`attributes`). All three implemented; `ears` warns template fit is not evidence of completeness.
14. Derived requirement: any child (`iso29148`) vs only non-stakeholder-stated (`hierarchy`); map the second to "assumed by the machine".
15. Specification vs code: `zave-jackson` keep S (shared phenomena) apart from P; HeadCanon As built covers both; checks 3.16/3.17 need the split or glossary tags.
16. Glossary candidates: noun phrases only (`terminology` Arora) vs nouns and verbs (`terminology` Dalpiaz, `kaos`); string similarity suffices (Arora) vs distributional semantics (Dalpiaz, whose tool underperformed manual inspection). Rule: NP harvesting by Arora's rules, verbs via R3/P9 lexicons, synonym verdicts human.
17. Within-source typos and inconsistencies to not copy: GtWR matrices "Correct Condition" vs "Correct Punctuation" (R14), R28 example cites R11 for R10, R18 example cites R26 for R24, R24 lists "each" while R32 prescribes it; Davis Q4 range printed inverted; Seki NOV threshold 1 vs 4; PLC 2023 misprints WHERE for WHILE; RE'09 gives per-problem counts only as a chart.
18. Open questions no source answers: how many author–reviewer iterations a node needs; thresholds for Genova bands, child-count bands, word counts (all "set per organization"); whether an indicative encyclopedia Intent can be slot-parsed as reliably as a shall statement (no source tested it); how to handle the single-child case when HeadCanon splits a concept into one refinement; whether open-ended Checks (inspection/analysis) can be made binary at all (`kaos`: type soft and add a measure); a third edition of 29148 is at DIS stage, clause numbers may shift.

---

## 10. Sources

No check was refuted by the verifier for any source (`refuted: []` throughout; `unverified: false` throughout). Checks marked `corrected=true` had their quote or citation corrected and survive; they are listed per source.

| Key | Title | Authors | Year | URL(s) | Primary | Corrected checks (reason) |
|---|---|---|---|---|---|---|
| iso29148 | ISO/IEC/IEEE 29148:2018, Systems and software engineering — Life cycle processes — Requirements engineering (2nd ed.) | ISO/IEC JTC 1/SC 7 with IEEE CS S2ESC | 2018 | iteh.ai sample; byui-cse.github.io CSE372 copy; iso.org/standard/72089; nasa.gov/seh App. C; arXiv 1611.08847, 2410.21288, 2505.12262 | Primary (text read via official sample + licensed course copy; NASA SEH, Femmer, INCOSE card secondary) | No superlatives/comparatives (Femmer figures 0.95/0.50 are recall, Table 8; precision 0.48/0.49, Table 7); No vague pronouns (0.92 is recall; precision 0.26) |
| incose-gtwr | INCOSE Guide to Writing Requirements v4, INCOSE-TP-2010-006-04 Rev 4, with Summary Sheet | INCOSE RWG; Ryan, Wheatcraft et al. | 2023 | incose.org summary sheet and final-draft PDFs (via Wayback 2024-09-19, 2025-05-14) | Primary | R36 shared numeric values (elaboration sentence spans pp. 107–108, not p. 108) |
| ears | Easy Approach to Requirements Syntax (RE'09) and uptake: official guide, RTEMS manual, T-EARS, PLC studies, QRA, Jama, Großer et al., Kiro/AWS | Mavin, Wilkinson, Harwood, Novak; RTEMS; Flemström, Afzal, Enoiu; Ebrahimi Salari et al.; QRA; Jama; Großer et al.; Kiro/AWS | 2009; uptake 2010–2026 | doi 10.1109/RE.2009.9; alistairmavin.com/ears; docs.rtems.org 5.3 eng/req; mdu.se PDFs 6673, 7171, 6291; qracorp.com/when-not-to-use-ears; jamasoftware.com; kiro.dev docs/blog; builder.aws.com | Primary (RE'09, guide, RTEMS, T-EARS, PLC); vendor pages secondary | Exactly one shall (RTEMS does not ban should/may/can; only one verbal form); ≤ 3 preconditions (Wikipedia section is "Limitations"); Conditions as clauses (AWS post does not rewrite the ubiquitous example); Guard semantics (quote is T-EARS §4, not §2.2); shall not (passage is in the 2025 SN CS paper, not 2023 ICST); Not silently accepted (quote is a reported saying, Jama chapter); Mathematical forms (Wikipedia section name) |
| kaos | Goal-oriented RE with KAOS: Guided Tour (RE'01), Formal Refinement Patterns (FSE'96), Handling Obstacles (TSE 2000), Managing Conflicts (TSE 1998), Goal-Directed Acquisition (SCP 1993), Agent-Based Tactics (ICSE'02), Letier thesis (2001), Marktoberdorf 2007/2012, Partial Goal Satisfaction (FSE'04), RE'95 lessons, KAOS Tutorial (Respect-IT 2007) | van Lamsweerde; Dardenne, Fickas; Darimont; Letier; Massonet; Respect-IT | 1993–2012 | webperso.info.ucl.ac.be/~avl/files/… (RE01, fse4, TSE-Obstacles, SCP, Icse02, avl-markt07, Markt2012paper, avl-FSE04, re95); cs.ucl.ac.uk Letier (Conflicts-TSE, thesis); asimod.in.tum.de 2012 slides; objectiver.com KaosTutorial; UCI Taylor handout (secondary) | Primary (book 2009 not read; chapter 8 via UCI handout, secondary) | Leaf Achieve goal states a bound (tactics are ABT02 §5.2 Figure 5, not §4) |
| zave-jackson | Four Dark Corners of RE (TOSEM 1997); A Reference Model for Requirements and Specifications (IEEE Software 2000); Problem Frames via Jackson 1999, 2002, 2005; Deriving Specifications from Requirements (ICSE 1995) | Zave; Jackson; Gunter; Gunter | 1995–2005 | pamelazave.com/4dc.pdf; seclab.illinois.edu GunterGJZ00a; cis.upenn.edu JZ95; dsg.tuwien.ac.at SACJrnl4 and problem_analysis_and_structure; people.csail.mit.edu mj-problem-frames; files.ifi.uzh.ch Jackson2005 | Primary (Problem Frames book itself not read) | Designation or definition (p. 26, not 27); No jointly controlled phenomenon (4DC p. 28, not 29); Bias by indistinguishable states (4DC reports Jones's definition, does not endorse it); Intent may name unshared phenomena (4DC p. 17, not 16); Breakage sequences (G3 pp. 13–14, L4 p. 16) |
| ambiguity | Ambiguity Handbook (Berry, Kamsties, Krieger 2003); Kamsties, Berry, Paech (WISE 2001); Gleich, Creighton, Kof (REFSQ 2010); Rosadini/Ferrari et al. (REFSQ 2017, EMSE 2018); QuARS (Lami 2005; 2004 poster); Wilson ARM (STC 1997) | Berry, Kamsties, Krieger; Paech; Gleich, Creighton, Kof; Ferrari, Gori, Rosadini, Trotta, Bacherini, Fantechi, Gnesi; Lami, Fabbrini, Fusani, Gnesi, Trentanni; Wilson (Rosenberg, Hyatt) | 1997–2018 | cs.uwaterloo.ca/~dberry/handbook; cas.mcmaster.ca KamstiesBerryPaech; wwwbroy.cs.tum.edu REFSQ10; openportal.isti.cnr.it 2017/382479, 2018/396838, 2004/120492; sei.cmu.edu 2005_005_001_14603; csc.kth.se NASARequirements | Primary (Kamsties dissertation and Wilson/Rosenberg/Hyatt ICSE 1997 substituted by WISE 2001 and STC 1997) | every/their (Handbook p. 15; everybody…their is a language error only); Noun stacks (section starts p. 37, quote p. 38) |
| smells | Rapid quality assurance with Requirements Smells (JSS 2017) and later catalogues: Femmer thesis 2017 incl. AIRE'17; Paska (TSE 2024); Seki RE'19; NERO RE'20; NALABS 2022; Frattini RE'22; Gentili & Falessi 2024; Habib 2021; Lubos 2024; Ferrari EMSE 2018 (abstract) | Femmer, Mendez Fernandez, Wagner, Eder; Unterkalmsteiner, Gorschek; Veizaga, Shin, Briand; Seki, Hayashi, Saeki; Mu et al.; Rajkovic, Enoiu; Frattini et al.; Gentili, Falessi; Habib, Wagner, Graziotin; Lubos et al. | 2017 (later 2017–2024) | arXiv 1611.08847; doi 10.1016/j.jss.2016.02.047; wwwbroy.in.tum.de femmer-thesis-2017; arXiv 2305.07097, 2009.01542, 2202.05641, 2206.05959, 2404.11106, 2108.03087, 2408.10886; NERO RE20 PDF; Springer s10664-018-9596-7 | Primary (Ferrari 2018 full text not reached) | F2 (0.25 not 0.26 per 1,000 words); F13 (precision 0.26 wording; dependency suggestion is 2014 §4.4); F27 (grouping stated in §6.2.3, not §7.3); F28 (kappa values in §6.2.7); F30–F36 (Table A.11, not Table 11); S7 (thresholds NOAFR > 0, NOEFR > 1); N1 and N2 (detection methods swapped in Table II); R1 (Ferrari postprint §3.2 Table 2 is primary; Paska conflates two phases) |
| attributes | Davis et al. 1993, Identifying and Measuring Quality in an SRS; IEEE Std 830-1998 clause 4.3; Genova et al. 2013, A framework to measure and improve the quality of textual requirements (+ Moreno et al. 2020 appendix) | Davis, Overmyer, Jordan, Caruso, Dandashi, Dinh, Kincaid, Ledeboer, Reynolds, Sitaram, Ta, Theofanos; IEEE CS SESC; Genova, Fuentes, Llorens, Hurtado, Moreno | 1993 / 1998 / 2013 | git.rehounou.ca MDAF Davis PDF; people.eecs.ku.edu/~hossein 0830.pdf; gonzalogenova.wordpress.com manuscript; publica-rest.fraunhofer.de IESE 096.03/E; e-archivo.uc3m.es 10016/34169 | Primary | Davis Q4 (formula at top of p. 146; printed range inverted); IEEE performance measurable (p. 17); IEEE definitions section (5.1.3, p. 12); Genova readability (minus sign restored; Good ≥ 50); Genova rationale (sentence is Moreno et al. 2020 Appendix I, not Genova 2013) |
| hierarchy | Requirement hierarchies, decomposition and allocation: Dick, Hull & Jackson, Requirements Engineering 4th ed.; INCOSE SE Handbook 5th ed. and GtWR V4 summary; INCOSE pamphlet 2015; ISO 29148 clause 3; SEBoK; SEVOCAB; Motupally 2008; Lockerbie et al. 2012; Dick 2014 deck; Wheatcraft (ArgonDigital); NASA SWE-052 | Dick, Hull, Jackson; INCOSE (Walden et al.; Wheatcraft, Ryan; deLamare); ISO/IEC JTC1/SC7 with IEEE; Motupally; Lockerbie et al.; Wheatcraft | 2017; 2023; 2015; 2018 | iteh.ai 29148 sample; incose.org GtWR V4 summary; incose.org 003-requirements-management pamphlet; catalogimages.wiley.com 9781119814290 excerpt; sebokwiki.org System_Requirements, Requirement_(glossary); pascal.computer.org SEVOCAB; Springer 978-3-319-61073-3 ch. 4, 7; openrepository.aut.ac.nz Motupally; openaccess.city.ac.uk 8004 Lockerbie; public.dhe.ibm.com SSES_Jeremy_Dick_v2; argondigital.com traceability-multiple-parent; swehb.nasa.gov SWE-052; ar5iv 1611.08847; arXiv 2403.17479; scholars.luc.edu Honig | Secondary (book chapters and 29148 cl. 5.2 paywalled; read via abstracts, SEBoK, Motupally, Lockerbie) | Children sufficient (Dick deck slide 21, not 20); Each layer has tests (W model slides 13–17, not 12–13); Verification method named (pamphlet "Verifiable" item, not "Verify Compliance"); Rationale attribute (Dick deck slide 34, not 33) |
| terminology | Arora, Sabetzadeh, Briand, Zimmer (TSE 2017); Dalpiaz, van der Schalk, Lucassen (REFSQ 2018); Dalpiaz et al. (IST 2019); INCOSE GtWR v3.1 (2022) R4/R36–R39; ISO 29148 clause 3 (+ 2011 wording via AFIS deck and Femmer) | Arora, Sabetzadeh, Briand, Zimmer; Dalpiaz, van der Schalk, Brinkkemper, Aydemir, Lucassen; INCOSE RWG; ISO/IEC/IEEE | 2017; 2018; 2019; 2022 | orbilu.uni.lu 10993/28943 (+ manuscript PDF); doi 10.1109/TSE.2016.2635134; webspace.science.uu.nl/~dalpi001 (ist 2019, refsq 2018); doi 10.1016/j.infsof.2018.12.007; doi 10.1007/978-3-319-77243-1_8; moodle.insa-toulouse.fr GtWR V3.1 PDF; incose.org GtWR v4 summary; incose-cc.org RWG status 2022-06-15; iteh.ai 29148 sample; legacy.samares-engineering.com AFIS deck; arXiv 1611.08847 | Primary (29148 cl. 5.2 wording via secondaries, marked) | Term clustering recipe (BIC rule "≥ BICmax − margin", margin = range/10; SoftTFIDF §5.6.4); Only consequential ambiguities (nocuous/innocuous is §8 related work); Vague pronouns and negatives (Femmer §6.2 p. 25, not §7) |
| inspection | Fagan 1976; Porter, Votta & Basili 1995; Basili et al. 1996 PBR (ISERN-96-06 + lab package forms); Fabbri et al. T136; NASA LaRC Handbook 1992; NASA-STD-8739.9 2013; Porter, Siy, Toman & Votta 1997; Porter, Siy & Votta 1995 review; Votta 1993; Fusaro et al. 1997; Biffl et al. 2001; Ronanki et al. 2023; Krishna et al. 2024; Lubos et al. 2024; Preda et al. 2024; Mahbub et al. 2024; Broccia et al. 2026; Shefa et al. 2026 | Fagan; Porter, Votta, Basili; Basili, Green, Laitenberger, Lanubile, Shull, Sørumgård, Zelkowitz; Fabbri et al.; NASA LaRC; NASA OSMA; Porter, Siy, Toman, Votta; Lubos et al.; Krishna, Gaur, Verma, Jalote; Ronanki, Berger, Horkoff; Preda, Mayr-Dorn, Mashkoor, Egyed; Mahbub et al.; Broccia, Frattini, Arora, ter Beek, Fantechi, Vogelsang, Ferrari; Shefa, Salado, Wach, Topcu | 1976–2026 | ida.liu.se fagan76; drum.lib.umd.edu 96204769…; doi 10.1109/32.391380; cs.umd.edu ESEG pbr_package (emp_pbr, 2_defcl, 6_test, 6_desig, 6_user); doi 10.1007/BF00368702; cs.umd.edu T136; sw-eng.larc.nasa.gov Instructional-Handbook; ntrs.nasa.gov 20180004877; userweb.cs.txstate.edu PorterEtAl_TSE; cs.uwaterloo.ca PorterSiyVottaDraft; doi 10.1145/167049.167070; doi 10.1023/A:1009742216007; doi 10.1109/ICSE.2001.919090; arXiv 2307.07381, 2404.17842, 2408.10886, 2608.21298, 2609.03230; doi 10.1145/3643991.3644922; doi 10.1109/ACCESS.2024.3464242 | Primary (Votta 1993, Fusaro 1997, Biffl 2001, Mahbub 2024 abstract only) | Testable/demonstrable (quote is LaRC SY checklist; Porter wording differs); No extraneous node (Appendix II heading, not Appendix I); Mutually consistent (phrase is Mahbub's abstract, not Broccia); Disagreement becomes contested (LaRC p. 13, not 12); Distinct responsibility (Basili §3.1, not §2.3); Keep all three perspectives (Basili §6, pp. 33–34); Record before merging (Basili §3.1); ≥ 2 reviewers (Fagan p. 191, not 190); Bounded batch (Fagan p. 191); Work aid per perspective (NASA-STD p. 24); Ranked distribution (Fagan p. 193); Follow-up verifies (LaRC pp. 18–19); Re-inspection criteria (LaRC p. 14; NASA-STD 6.3.9); Aggregate model runs ("newer models" phrase is the abstract, §5.3 title differs) |

---

# Appendix: what the catalogue misses, by the completeness critic


Each item is tagged with the critic question it answers: (a) unread source, (b) not binary / no test, (c) no provenance, (d) deterministic label wrong, (e) HeadCanon characteristic the literature covers but the catalogue misses.

1. **(e) "One concept, one node" has no definition of concept and no test.** 5.29 ("two nodes admitting the same behaviours") is undecidable for prose, and 5.2/5.3 only catch textual duplicates. The literature that defines the unit: Zave & Jackson designations (the atom is a designated phenomenon), KAOS object model (a goal's vocabulary must be in the object model; RP2 "Maximize Cohesion" says a node is one target predicate), OMG SBVR 1.5 (concept vs term vs definition; https://www.omg.org/spec/SBVR/1.5), ISO 704:2022 concept systems. Fix: define a node's concept as the tuple (entity, constrained phenomenon or property, condition) and make the check "two nodes constrain the same glossary phenomenon of the same entity under overlapping conditions ⇒ merge or nest". With glossary-marked terms this becomes a deterministic candidate scan. Also resolve the contradiction: 5.29 proposes "one node with several parents" while the context says a tree; 4.17 and §9.12 leave it open. Follow-up read: Honig et al. full paper on function-based atomicity (scholars.luc.edu), SBVR clause 8 (concept/term/definition), Jackson 1995 *Software Requirements & Specifications* entries "Designations", "Definitions", "Refutable Descriptions".

2. **(e) No propagation rule for certainty states along the tree.** 2.54 gives per-node structural rules only. If a parent's satisfaction argument cites an assumption in state assumed/open/contested, the literature says the parent's status cannot exceed it: Letier & van Lamsweerde FSE'04 (partial satisfaction propagation, already read but not used for this), GSN Community Standard v3 (2021, https://scsc.uk/gsn: "undeveloped" marker, Assumption and Justification elements, away goals), Bloomfield & Rushby, *Assurance 2.0* (arXiv:2004.10474; defeaters, residual doubt, deductive vs inductive argument steps), Famelis, Salay & Chechik ICSE 2012 "Partial models" and Salay, Chechik & Horkoff RE 2012 "Managing requirements uncertainty with partial models". Fix: add a set check "no node in state stated whose argument cites a node in a weaker state", and record argument strength (deductive / inductive) on 4.6.

3. **(e) "Contested" is treated only as something to resolve from a closed list (5.27).** The inconsistency-management literature treats it as a standing state with handling actions: Nuseibeh, Easterbrook & Russo, "Leveraging inconsistency in software development", IEEE Computer 2000 (ignore / defer / circumvent / ameliorate / resolve); Finkelstein et al., "Inconsistency handling in multi-perspective specifications", TSE 1994; Gervasi & Zowghi, "On the role of ambiguity in RE", REFSQ 2010 (deliberately kept ambiguity); Zowghi & Gervasi, "On the interplay between consistency, completeness, and correctness", IST 2003. Fix: add transitions for each certainty state (what evidence moves assumed→stated, stated→contested, contested→stated, open→stated) and the allowed standing actions for contested; §7.3's "non-unanimity = contested" (Lubos) should become a check.

4. **(a, e) Parnas & Madey's four-variable model is missing, and it is the cleanest basis for "As built kept apart from Intent".** Parnas & Madey, "Functional documents for computer systems", Sci. Comput. Program. 1995 (REQ over MON/CON vs SOF over INPUT/OUTPUT; NAT for domain properties) gives a deterministic membership test for which variables As built may name, where Zave-Jackson's S/P split (noted in 15 of §9) leaves it fuzzy. Heitmeyer, Jeffords & Labaw, "Automated consistency checking of requirements specifications", TOSEM 1996 (SCR) adds decidable disjointness and coverage checks for condition and mode tables, which the catalogue marks "No" at 4.31 and 5.6. Follow-up read both; fix 4.31 and 5.6 to "deterministic when conditions range over enumerated glossary states".

5. **(e) As built has no freshness, provenance or three-valued comparison to Intent.** 5.23 "Intent ≠ As built text" is a trivial string inequality mislabelled as the check. Murphy, Notkin & Sullivan, "Software reflexion models", FSE 1995 / TSE 2001 give the vocabulary: each (Intent, As built) pair is convergence, divergence or absence. DO-178C §5.1.2 (paraphrased widely; e.g. FAA Order 8110.49) defines a derived requirement as behaviour not traceable to higher-level requirements that must be fed to safety assessment, which is exactly "code does something no Intent asks for". Fix: add checks "As built carries the commit it was read from", "As built older than the last change to its code is suspect" (ISO 29148 6.6.3 change control supports this), "every As built behaviour is convergence, divergence (⇒ contested) or absence (⇒ open)", and "an Intent drafted from As built starts in state assumed".

6. **(a) Boehm 1984 was not read and is the origin of several checks.** Boehm, "Verifying and validating software requirements and design specifications", IEEE Software 1(1), 1984: completeness = no TBDs, no nonexistent references, no missing specification items, no missing functions, no missing products; consistency internal / external / traceability; feasibility; testability; with cost-of-fix data. It adds "no reference to an undefined item or non-existent document" (closure), which 2.38 only half covers, and "no missing products". Read via IEEE Xplore DOI 10.1109/MS.1984.233702.

7. **(a) Jaffe, Leveson, Heimdahl & Melhart 1991 completeness criteria are missing.** "Software requirements analysis for real-time process-control systems", TSE 17(3), 1991 (and Leveson, *Safeware* ch. 15; Leveson, "Intent specifications", TSE 2000 for why/what/how levels and rationale). It gives the most explicit checkable completeness list in the literature: startup/shutdown state behaviour, every state has a transition for every input, timing bounds on every input and output, response to unexpected or out-of-range inputs, value and timing assumptions on the environment, feedback for every output. This would turn 5.30 ("every situation covered", untestable as written) into enumerable checks.

8. **(b) 5.30 "Set complete" has no test.** "Every situation covered" presumes an enumerated situation set the catalogue never defines. Fix: define situations as the state × stimulus cells of 5.6 plus the scenario list of 5.32 plus Jaffe's criteria (item 7); then 5.30 becomes "no cell without a node and no scenario without a trace", with the residual judgement confined to "is the enumeration itself complete" (Davis: "extremely difficult to measure").

9. **(a) Gilb's Planguage and SQC were not read.** Gilb, *Competitive Engineering*, 2005 (Scale, Meter, Past, Goal, Fail, Must levels; the claim that every quality requirement is quantifiable) directly shapes the numeric Check (3.3/3.4/3.34: a Check must name Scale and Meter, not only a bound) and argues against an "open-ended" kind. Gilb & Graham, *Software Inspection*, 1993 (noted "not attempted") is the main source on exit criteria by defect density and on rework economics, which §7.4 says no source measures. Read both; add Scale/Meter fields to 3.3.

10. **(a) Robertson & Robertson's fit criterion is quoted only second-hand.** The Volere Requirements Specification Template (free at volere.org) defines the fit criterion as the quantified test for a requirement and lists the "snow card" attributes (description, rationale, originator, fit criterion, customer satisfaction/dissatisfaction, priority, conflicts, supporting materials, history). HeadCanon's Check is a fit criterion; the catalogue should cite its definition and the rule that a requirement without a fit criterion is not yet a requirement.

11. **(a) Dwyer, Avrunin & Corbett property specification patterns and NASA FRET were not read.** Dwyer et al., "Patterns in property specifications for finite-state verification", ICSE 1999 (patterns absence/universality/existence/response/precedence × scopes globally/before/after/between/after-until) and Konrad & Cheng, "Real-time specification patterns", ICSE 2005 (structured-English grammar). FRET: Giannakopoulou et al., "Formal requirements elicitation with FRET", REFSQ 2020, and "Automated formalization of structured natural language requirements", IST 2021 (github.com/NASA-SW-VnV/fret). FRETish fixes the semantics of within / after / until / before / eventually, which 3.36 and 3.37 leave to a reader, and its scope-condition-component-shall-timing-response grammar is a tested slot grammar for 2.40/3.29. Fix: replace KAOS's four patterns in 2.69/3.28/3.39 with the Dwyer set, which is complete for the common cases and has published semantics.

12. **(d) 2.40 "Conforms to one agreed pattern" is marked deterministic; for a free indicative Intent it is not.** §9.18 admits no source tested slot-parsing of encyclopedia sentences, and the PLC studies found human classifiers disagreed on EARS pattern choice. Fix: deterministic only when keywords are mandatory (as in the Check shape of §3.3); on the Intent it is a reader judgement unless HeadCanon adopts a controlled grammar. Follow-up read: Kuhn, "A survey and classification of controlled natural languages", Computational Linguistics 40(1), 2014 (PENS scheme: which constraints make a language machine-decidable); ASD-STE100 Simplified Technical English (asd-ste100.org; one approved meaning per word, ≤20 words per sentence, no -ing verbs, active voice), an industrially validated deterministic lexicon.

13. **(a) The SOPHIST/Rupp rule set (MASTeR) was not read although Großer et al. found it strongest.** *MASTeR Schablonen für alle Fälle* (free PDF, sophist.de) and Rupp, *Requirements-Engineering und -Management*, ch. on linguistic defects. It adds a check the catalogue lacks entirely: **nominalisation** (a process hidden as a noun, "the registration", loses actor, timing and conditions). Deterministic pre-filter: derived nouns (-tion, -ment, -ing, -al) with a verb root; verdict by reader. Also "incompletely specified conditions" and "implicit assumptions" rules. IREB CPRE Foundation Syllabus and Glossary (free, ireb.org) give agreed definitions of the nine quality criteria used in Europe.

14. **(a) ISO 704 / ISO 1087 / ISO/IEC Directives Part 2 were not read, and §6 has no rule for how a definition is written.** ISO 704:2022 *Terminology work — Principles and methods* (intensional definitions = superordinate concept + delimiting characteristics; no circular, negative or hidden definitions; monosemy and mononymy). ISO/IEC Directives Part 2 (2021, free at iso.org/directives) clause 16: a definition must be substitutable for the term in context (**substitution test**, mechanisable as "replace term by definition in each Intent; sentence remains grammatical"), and Annex H verbal forms (shall/should/may/can), which is the authority behind 2.1/2.2. Fix: add checks "definition names a superordinate glossary concept", "definition graph is acyclic", "definition does not contain its own headword".

15. **(a, e) SBVR is missing and gives the alethic/deontic split HeadCanon needs.** SBVR Structured English separates "It is necessary that" (definitional / structural rule, cannot be false) from "It is obligatory that" (behavioural rule), with a marking convention for terms, names, verbs and keywords. This is 2.68 and 6.4 with a standard behind it, and a model for the domain-property node vs requirement node distinction. Follow-up: OMG SBVR 1.5 clauses 12–13 and Annex C.

16. **(b) 4.26 and 4.27 (refinement complete / minimal) have no procedure, only a question.** "Must the parent hold in every case?" cannot be answered by inspection; the catalogue elsewhere (7.3, Preda) shows that "not covered" is reliable and "covered" is not. Fix: write the test as a bounded counterexample search: (i) try each KAOS pattern (4.29); (ii) if none fits, the reviewer must write one scenario per child in which that child is false and record whether the parent survives (minimality) and one in which all children hold and the parent could fail (completeness); (iii) a parent passes only with a recorded argument and zero surviving counterexamples. Read: Dick's "satisfaction argument" chapter in Hull, Jackson & Dick 4th ed. ch. 7 (paywalled; the hierarchy reader had only abstracts), and GSN v3 §3 on argument assessment.

17. **(d) Internal contradiction between 4.2 and 4.18.** 4.2 requires (children > 0) xor (Check present), i.e. Checks only on leaves, as the context says; 4.18 requires "every layer has a Check" and a parent Check. One must go, or a non-leaf gets a different artefact (an argument, 4.6) rather than a Check.

18. **(d) 2.10 "MD count == 1" contradicts 2.4.** Under the §3.4 proposal (indicative Intent, no modals) every Intent fails 2.10. Rewrite 2.10 as "exactly one finite main verb in the main clause" for the indicative style.

19. **(c) 2.54 and 3.1 are HeadCanon design presented as literature.** "Machine-authored ⇒ state ≠ stated until human confirms" and the kind enumeration {binary, numeric, open-ended} have no source; the citations given (29148 correctness, LLM studies) support only a loose analogy. Label them as HeadCanon rules, or ground them: ISO 29148 5.2.8 "source" attribute (stakeholder vs derived) for the origin of certainty; INCOSE GtWR A28/A29 verification/validation status for the lifecycle; Gilb and Robertson (items 9–10) for Check kinds.

20. **(c) Lexicons attributed to `iso29148` that are not in the standard.** 8.4 "`iso29148` extended: support, including but not limited to, at least (without bound), such as, handle, process" and the Femmer-derived words in 8.1 ("timely", "minimal") are tool dictionaries, not clause 5.2.7 text. 8.11's Genova list ("API, endpoint, thread, cache, framework names") is invented: Genova's design-terms indicator is a configurable list, not those words. Fix: move each list to the source that actually prints it, or mark "HeadCanon addition".

21. **(c) Unsourced or misused thresholds.** 2.43 uses the EARS mean word count 25.6 as a bound (a mean is not a threshold) and "Ferrari 60 tokens" needs the exact PLEN threshold from Ferrari 2018 §4; 2.44 and 4.20 "more than 3 punctuation marks (Wilson)" need a page in the STC 1997 paper (ARM reports punctuation counts, not a threshold); 2.45 "Coleman-Liau ≤ 15 (target 10)" has no source; 7.2's "gate at precision ≥ 0.7" is the catalogue's own rule and rests on Femmer's German-corpus figures, which do not transfer to English indicative Intents without re-measurement. Fix: mark every threshold "set per organisation" (Genova) and plan to calibrate in the HeadCanon test.

22. **(b) Several reader checks have no criterion and overlap.** 2.61 ("understand cold"), 2.73, 2.78 and 2.60 are four phrasings of one test. Collapse into one procedure: two readers independently fill the slots entity / action / object / bound / condition from the text plus glossary; pass iff slot-by-slot identical. 2.67 ("appropriate level": circular), 2.74 ("still applicable": no criterion), 2.79 (name reflects content), 4.49, 4.50, 5.40 ("few"), 6.28 (users' terminology) have no decision rule. Either give each a rule or drop them into §7 as reviewer prompts rather than checks.

23. **(a) Nocuous-ambiguity threshold work was not read and would make 2.60 testable.** Chantree, Nuseibeh, de Roeck & Willis, "Identifying nocuous ambiguities in natural language requirements", RE 2006; Yang, de Roeck, Gervasi, Willis & Nuseibeh, "Analysing anaphoric ambiguity in natural language requirements", REJ 2011. They define nocuous as reader interpretations diverging beyond an agreement threshold, which is the missing decision rule for 2.60 and for §7.1's nocuous/innocuous field.

24. **(d) Lexicon checks with measured precision below 0.5 are labelled "Yes" as if they returned verdicts.** 2.5 negation (0.33), 2.16 pronouns (0.26), 2.25/2.26 superlative/comparative (0.49/0.48), 2.6 passive (be + VBN also matches state adjectives, which an encyclopedia Intent uses constantly: "the door is locked"), 2.7 subject is entity (needs a dependency parse), 2.11 combinators (verdict needs the condition-vs-capability judgement §9.3 admits), 2.50 amelioration verbs ("increase the counter by 1" is not a soft goal), 2.57 literal values (what counts as a literal is not pattern-decidable), 6.1 unmarked noun phrases (NP chunking is probabilistic), 6.12 noun stacks, 4.14 "sibling for the complementary case" (semantic). Fix: a third Det value, "flag" (deterministic candidate, reader verdict), as §7.2's own T13 scale already proposes, and use it consistently.

25. **(d) Checks marked "No" that are deterministic once the Check follows the §3.3 shape.** 3.10 (window token + glossary observable present), 3.29 (guard clause present), 3.31 (a Check with the negated guard exists among siblings), 4.32 and 4.33 (chain of C/T fields string-matches), 4.31 (disjoint/covering over enumerated states, see item 4). Relabel as deterministic given structured fields, which strengthens the case for structuring the Check.

26. **(a) Traceability theory beyond standards is missing.** Gotel & Finkelstein, "An analysis of the requirements traceability problem", RE 1994 (pre-RS vs post-RS traceability: where a requirement came from, which is what "stated by the human" vs "assumed by the machine" records) and Ramesh & Jarke, "Toward reference models for requirements traceability", TSE 2001 (link types incl. rationale, assumption, satisfies, depends-on). These would type the links in 4.1/4.8/4.9 and 4.25 instead of leaving "dependency link" undefined.

27. **(a) Gorschek & Wohlin's Requirements Abstraction Model was not read; it is the one operational source for "right level" (2.67, 4.37).** "Requirements abstraction model", REJ 11(1), 2006: four levels with placement rules and "work-up" (abstract upward until a product-level statement, break down until testable). Gives the missing decision rule for 2.67.

28. **(a) van Lamsweerde 2009 chapter 1.1.7, 4 and 5 remain unread.** The kaos reader covered goal refinement but not the book's target-qualities list (completeness, consistency, adequacy, unambiguity, measurability, pertinence, feasibility, comprehensibility, good structuring, modifiability, traceability) nor chapter 5's inspection checklists and query-based checks. "Adequacy" (requirement matches the real need) and "pertinence" are the KAOS names for correct and necessary and come with checklist questions. Paywalled; a library copy is the only route.

29. **(a) Requirement-interaction taxonomy missing for 4.46 and 5.26.** Robinson, Pawlowski & Volkov, "Requirements interaction management", ACM Computing Surveys 35(2), 2003. Gives the closed relation list (conflict, overlap, dependency, reinforcement) that 4.46's "relation type" presupposes without a source.

30. **(a) ECSS-E-ST-10-06C and DO-178C definitions were not consulted.** ECSS-E-ST-10-06C *Technical requirements specification* (free, ecss.nl) prescribes per-requirement attributes (justification, verification method, traceability) and a requirement-type list; DO-178C defines derived requirements and "accurate and consistent / verifiable / conform to standards / traceable / algorithms accurate" for high-level requirements. Both bear on the "derived requirement" disagreement (§9.14) and on 2.53's field list, which otherwise mixes sources ("difficulty, stability" are not in HeadCanon's context).

31. **(a) Jureta et al.'s core ontology and Techne speak directly to certainty and to the requirement/assumption/goal split.** Jureta, Mylopoulos & Faulkner, "Revisiting the core ontology and problem in RE", RE 2008 (goals, softgoals, quality constraints, plans, domain assumptions, with speaker attitudes), and Jureta, Borgida, Ernst & Mylopoulos, "Techne", RE 2010 (mandatory/optional, conflicts, approximations as justified beliefs). Relevant to 2.52 (node roles) and to whether "assumed" is an attitude on a node or a node type.

32. **(c) Quotes and figures to verify before they are relied on.** 2.60 "Davis ten-reader test" (Davis 1993 Q1 defines nui/nr; the reviewer count must be checked on p. 145); Gleich "indicative mood is not a defect" (needs the REFSQ 2010 sentence); 29148 5.2.4 NOTE 2 wording (the §3.4 proposal rests on it; quote it); Preda "99.7% recall for a removed child"; Shefa FNR 1.00 / 0.89 / FPR 0.67 (a 2026 preprint, single study); Paska P9 precision 0.98. Each should carry the page.

33. **(b) 6.14–6.16 are algorithms, not checks.** Candidate extraction, clustering and ambiguity scoring produce lists for review; they are inputs to 6.21/6.22 and should be moved to §7 or §8 as procedures. As "checks" with Det = Yes they overstate what is decided.

34. **(b) 4.19 "pyramidal shape, node count non-decreasing with depth" is the catalogue's own formalisation of Wilson's specification-depth indicator** and fails on legitimately deep narrow branches. Either cite Wilson's actual measure (imperatives per document level) or drop it.

35. **(b) 4.21 and 4.23 are configuration and process rules, not set checks.** Move to §7.

36. **(e) Expectations (KAOS) can never be "stated" by the machine.** A node whose agent is in the environment is an assumption about people or devices; the catalogue types it (2.52, 4.10) but does not say its certainty can only be set by a human and must be revalidated on environment change (hierarchy "revalidate on change", Zave-Jackson "highly probable assumption"). Add a structural rule to 2.54.

37. **(a) Ferrari, Dell'Orletta, Spagnolo & Gnesi, "Measuring and improving the completeness of natural language requirements", REFSQ 2014** gives the only tool-supported completeness method (compare requirement terms against domain-document terms); it would make 6.13's "glossary coverage residue" bidirectional (terms in the domain documents absent from the requirements signal missing nodes).

38. **(a) Ryan, Wheatcraft, Dick & Zinni, "On the definition of terms in a requirement expression", INCOSE IS 2014** is the paper behind GtWR R4 and the Capitalised_Term convention that §6's deterministic checks depend on; it was not reached. Available via Wiley (doi 10.1002/j.2334-5837.2014.tb03132.x).

39. **(c) Hierarchy checks that rest on secondary readings should say so in the row.** 4.6's "three slots" and "& operator" come from Lockerbie's i* framing of Hull/Jackson/Dick, 4.26–4.27's "sufficiency / necessity" from a 2014 deck and Motupally's paraphrase; the Sources table marks the family secondary but the check rows cite "hierarchy" as if primary.

40. **(b) 2.63 conflates two tests.** The removal test (would a gap remain) and "can the author give a reason" (rationale present, structural). Split: rationale presence to 2.53; removal test stays a judgement with the 4.27 procedure.
