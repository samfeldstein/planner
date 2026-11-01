# Roadmap

## Keep completed tasks visible until end of day

- Completed todos stay in the Today list with a strikethrough, instead of leaving it on completion.
- They are removed at end of day (the clock's day rollover).

Notes for whoever builds it:

- Today a completed todo leaves the list straight away, or moves to its next due date if it recurs. `js/features/today-view.js` keeps the "N of M" count in `localStorage` (`planner:done`) because of that.
- The `.row.done .title` strikethrough style already exists in `css/app.css`.
- Open questions: where finished rows sit (in place, or at the bottom of their group), whether tapping one undoes it, and how a recurring todo shows once it has already moved to its next date.

## Add a license

- The repo is public for forking and as a code sample, but has no license, so forks aren't legally clear.
- Pick one (MIT is the usual choice), add `LICENSE`, and name it in `README.md`.
- Kalam stays under its own SIL OFL 1.1; keep its notice with the font.
