# Roadmap

- [x] Remove the horizontal line and increase the space between sections (7151b49, 1347804; released b854644c82).
- [x] Blurred line at the top of the app. Same fix as the notebook site: a solid, fixed, 12px strip at the top (`body::after`). Built in src; phone check pending.
- [x] Monthly repeat check. Saving the edit sheet on a todo pushed with Tomorrow moved its whole monthly or yearly rule to the pushed day; it now keeps the rule (8f8edae). The rest of the report matched the spec: Tomorrow twice leaves it due today, not overdue. Built in src; phone check pending.
- [x] Content below the top blur. The solid strip now covers the status-bar inset plus 12px (`--strip`), and the app starts 12px below it; measured in the dev browser with a simulated 59px inset (strip ends 71px, more button 83px, day numeral ink 91px). Built in src; phone check pending.
- [x] Horizontal rule between sections: a full-bleed hairline on `#list > section + section`, centred in the gap. Built in src; phone check pending.
