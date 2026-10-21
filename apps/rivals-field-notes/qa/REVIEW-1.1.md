# Review 1.1 — clear answers and defense

21 October 2026. Public sources were inspected through their rendered UI.

The new first screen explicitly separates the ranked result leader (20+ matches), career win-rate leader (50+ matches), and same-hero benchmark strength. An editable cohort table makes sample-threshold sensitivity visible. C&D and Magik's 0.1 percentage-point career difference is treated as effectively tied, not evidence of superiority. RivalsMeta TOP is retained as a source-specific position; no arithmetic-average or median statistic is invented.

Observed Tracker.gg / All Seasons / All Modes values:

| Account | Matches | Reported time | Damage Blocked | Blocked/min | Damage | Healing |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| JustSadSock | 1536 | 151h | 14,147,870 | 1552 | 9,285,288 | 2,774,050 |
| Hioydfts | 1516 | 152h | 7,277,296 | 796 | 6,819,999 | 9,730,739 |

Sources: the two Tracker.gg profile Overview pages linked in `strength.js`, including their More Stats disclosure. The coverage differs from the original RivalsMeta snapshot. Hero defense breakdowns were not exposed by the inspected RivalsMeta or Tracker.gg hero cards. These totals are therefore kept separate and never assigned to a hero, treated as pure shield mitigation, or added to damage/healing for an arbitrary impact score.

Manually inspected the original desktop screen and the updated desktop/390px phone states using CUA's browser/Playwright surface. Verified both account verdicts, changing career/ranked and 20/50-match thresholds, the ranked Gambit dialog, navigation from that dialog to defense, and the Doctor Strange damage benchmark leader. No page-width overflow was observed on the phone; long evidence tables retain intentional internal scrolling. The main structural change is that the answer is now above the career narrative instead of being buried across chapters.

The first hosted browser attempt reached the correct ranked dialog, but its text assertion was case-sensitive while CSS text-transform made the rendered heading uppercase. The assertion now ignores presentation case. Model regressions verify cohort winners, metric-specific relative leaders, missing benchmark coverage and non-fabrication of hero defense.

The existing app identity and layout architecture are retained. Release 1.1.0 updates the managed-update version, cache namespace and offline shell. Screenshots from the hosted final browser journey remain the authoritative automated evidence for the final branch revision; selected reviewed frames should be retained under visual-memory alongside this report.
