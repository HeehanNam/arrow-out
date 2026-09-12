# Arrow Out implementation guardrails

- Preserve the defining rule: the head advances along its final segment direction;
  the tail follows the original polyline. Never translate a bent arrow rigidly.
- Reject self-intersecting paths and any head exit ray that touches its own body,
  including the tail. A blocked arrow never moves through an obstacle.
- Whole-board silhouettes and individual arrow paths are separate concepts.
  Use orthogonal, non-overlapping paths inside the silhouette mask.
- Publish only the checked-in, verified 100-level campaign. Do not generate levels
  synchronously while a player is waiting. Retry must use the same puzzle.
- Hints must use the target dependency closure, not the full-board removal order.
- Difficulty is measured using arrow count, bend count and necessary removals;
  verify chapter averages increase, not just the advertised level number.
- Keep classic, move-limited and timed modes; explain which actions consume limits.
  Pause the clock for menus, hidden tabs and non-interactive movement animation.
- Preserve existing progress. Version records when changing campaign layouts.
- Run `npm test` and `npm run test:browser` before deployment. Use an actual mobile
  viewport and test interactions, not merely an HTTP status or a screenshot.
- Keep independent collision geometry tests independent of engine collision code.
- Do not claim physical-device or native-app testing unless actually performed.
