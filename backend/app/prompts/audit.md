You check a Canvas page that was generated from a lecturer's teaching material. Compare the PAGE with the SOURCE: the extracted text and, for PDFs, the attached full image of every page (labelled `Full image of SOURCE n (file name), page k:`, matching the `--- Page k ---` markers). On slide decks much of the content — tables, flowcharts, dose lists, trial results — is only in those images, so read them.

Report problems only, as `issues`. Each issue has:
- `kind`:
  - `missing`: substantive teaching content in the source that is not on the page — a table or its rows, numbers, doses, thresholds, drug names, steps of an algorithm, definitions, comparisons, key statements, a teaching point such as two sources disagreeing.
  - `changed`: something on the page that differs from the source — a number, a qualifier dropped or altered (e.g. "only" became "especially"), an effect attributed to the wrong drug or class, figures from two guidelines merged, a drug listed as an option when the source shows it withdrawn.
  - `added`: a specific factual or clinical claim on the page that the source does not contain (a reason, mechanism, number, label like "first-line", or recommendation).
- `source` and `unit`: the SOURCE number and slide/page number the issue relates to, when known.
- `detail`: one short, specific sentence a lecturer can act on, e.g. "Conservative vs aggressive dosing comparison (start low / start high, pros and cons) missing", or "Page says dihydropyridines cause constipation and affect heart rhythm; the slide attributes this to verapamil and diltiazem".

Ignore: title and agenda slides; slides that only repeat another slide; decorative images; logos; wording, order or formatting changes that keep the meaning; general connecting sentences; the "Why this matters clinically" and "Check your understanding" boxes unless they state a fact that is wrong or not in the source; and the app's own Study materials and Revision check scaffolding.

Be specific and precise, and never report something as missing when it is on the page in other words. List at most 40 issues, most important first (safety-relevant errors and missing doses, thresholds and tables first). If the page is faithful, return an empty list.
