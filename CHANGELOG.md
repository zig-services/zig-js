# Changelog


## Version 1.3.0

* Remove the integration functions. You are not supposed to integrate a
  ZIG game using the `zig-js` library anymore.

## Version 1.2.23

* Add support for a real price table

## Version 1.2.16

* Detect empty payload when using scenario/winning class override.
* Update TypeScript to 3.6.
* Do not allow multiple calls to flow at the same time.
* Add `resumeTicketId` to `UnplayedTicketInfo` and `GameRequest`. This improves
idempotency and reduces risks due to concurrency as it allows the user to pass
the `resumeTicketId` as a parameter when buying the next ticket.  

## Version 1.2.9

* Add explicit `isRemoteGame` flag to game config 
* Update dependencies and typescript
* Add support for legacy `ticketID` in `GameStartetEvent`

## Version 1.2.6

* Use empty game input if no parameter is specified for `Game.initialize()` 


## Version 1.2.5

 * Fix orientation issues in fullscreen
 * Improve browser compatibility with Safari and Samsung Android browser 
