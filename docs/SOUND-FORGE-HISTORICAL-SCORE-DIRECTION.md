# Historical Score Direction — Listening Sessions Vol. I

## Human review, 2026-11-27

Musical appeal scores, not historical admission scores: Pilgrims Crossing 6/10, Market at Dusk 7, Lantern Road 6, Cloister Procession 3, Afterglow Quartet 5, Evening Standard 9, March of the Vale 8, Iron Horizon 8, Last Standard 8, Moorland 8, Adaptive Journey 5. Mean 73/11. Preserve the electronic scores as a distinct creative direction; March of the Vale was positively reviewed specifically for electronic/roguelike use, not medieval strategy. Do not interpret other numeric ratings as individual genre admission or approval.

Reviewer: intrusive, acrid violin-like timbre in first three historical pieces (especially Pilgrims Crossing) and possibly Cloister Procession; rhythmic instability; insufficient thematic and sectional direction (prologue, climax, epilogue). CK3 and EU5 are artistic references, not material to copy.

## Verified score observations

Historical-consort.py uses bowed psaltery, alto and soprano recorder, harp, percussion and organ, not violin. Cloister Procession has bowed psaltery; Market at Dusk and Lantern Road have recorders, no violin. Evening Standard, highest rated, has a real violin. The perceived harshness is a hypothesis requiring level-matched stem comparisons, not a reason to ban violin.

The 3-second bar in historical-consort.py is described as 6/8. Harp onset spacing is .5 seconds, melody .65 seconds, counter-line 1.4 seconds. These are not a documented intentional polyrhythm. Market at Dusk also uses .45-second and .6-second spacing against 3-second bars. Rebuild timing on a shared metrical representation; allow intentional tuplets, rubato and microtiming only after a rhythm plan exists.

## References and compositional methods

- Paradox official EU5 OST, Håkan Glänte: https://www.youtube.com/watch?v=OLdEOqfEouw . Study emotional roles and contrasts through Pain Is Salvation, For The Lost Ones, Royal Court Invitation, Battle of Lützen and Peace Of Westphalia. No source audio, melodies or distinctive arrangements are to be copied.
- CK3 official announcements / By God Alone music direction: https://steamcommunity.com/app/1158310/announcements/ . Medieval acoustic instrumentation, chant, polyphony, context-specific moods. Distinguish period-informed idiom from modern cinematic historical fantasy.
- Open Music Theory, thematic function: https://openmusictheory.github.io/themeFunctions . Use motif presentation, continuation, question-answer phrase relationships, cadential closure. These are useful general compositional tools, not a claim that common-practice classical syntax is medieval.
- Open Music Theory 2e phrase and form: https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_%28Gotham_et_al.%29/03%3A_Form/3.02%3A_The_Phrase_Archetypes_and_Unique_Forms .

## Next implementation — research-only

Build a score-first director separated from the instrument renderer. Musical time: integer ticks with shared tempo/meter, phrase boundaries, explicit accents, intentional tuplets, bounded humanization after compilation. Represent sections, motifs, transformations, melodic roles, harmonic/modal centers, cadence intent, density and tension curves. Maintain motif identity through variation rather than generating independent bars. Orchestrate by role: melody, counterline, harmonic/bass support, rhythmic pulse; avoid simultaneous high-register leads. Preserve breathing space and dynamic contrast.

Prototype 2–3 minute original pieces with distinct functions: lyrical travel/lament, court dance, sacred atmosphere, war/resolve. Use approved research-only acoustic recordings in the historical direction; separate procedural/electronic library. Avoid synthetic pulse, aggressive treble, repeated full-strength attacks. Use low-intensity listening tracks without forcing a dramatic climax on every ambient piece. Write clear ending or intentional loop transitions.

Example original architecture (not a universal template): introduction 4 bars, theme 8, development 8, contrast 8, recapitulation/climax 8, coda 4. Start with a small motif, vary rhythm/contour/register/orchestration, make a contrasting passage, return and resolve. In medieval-inspired scores explore modality, drones, open fifths, monophony and compatible counterpoint rather than defaulting to modern block chords.

## Admission

Separate numerical technical gate (provenance, original golden masters unchanged, no clipping, deterministic render, source/score coverage, timing invariants, valid stems and mix) from independent human review: timbre comfort, rhythm/flow, memorable thematic identity, development and closure, genre fit, repeat-listening fatigue. Do not average away historical mismatch with a high overall appeal score. Report subjective acceptance only after listening. No production activation and no replacement of existing originals.

Suggested first diagnostic A/B trims, level matched: Pilgrims Crossing psaltery -9 dB, soprano recorder -4 dB, alto recorder -3 dB; Market at Dusk alto staccato -6, alto sustain -4, soprano -5; Cloister Procession bowed psaltery -9. These are experiments, not approved production mix settings.
