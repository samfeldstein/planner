# Roadmap

## Keep completed tasks visible until end of day

- Completed todos stay in the Today list with a strikethrough, instead of leaving it on completion.
- They are removed at end of day (the clock's day rollover).

Notes for whoever builds it:

- Today a completed todo leaves the list straight away, or moves to its next due date if it recurs. `js/features/today-view.js` keeps the "N of M" count in `localStorage` (`planner:done`) because of that.
- The `.row.done .title` strikethrough style already exists in `css/app.css`.
- Open questions: where finished rows sit (in place, or at the bottom of their group), whether tapping one undoes it, and how a recurring todo shows once it has already moved to its next date.
