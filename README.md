# zig-js

## Build and release

You can build the library using `npm` run shortcuts.

 * `npm run release` Will build a new *stable* release. This will be automatically
 used by all game frontends that include the library.
 
 * `npm run beta` Will release a beta build and push that as `dev` version to npm.
 While you are on a beta release, you can upload new versions without doing a real release.
 
 * `npm run build-upload` Uploads a new version into the dev channel,
 but only if you are currently on a beta release.


## Embedding ZIG into your game

Embedding the ZIG client into your game is easy.
 
The library is available as an [npm package](https://www.npmjs.com/package/zig-js).
Install it and add it to your `package.json` using `npm install --save zig-js`.
You can then import the library and access the zig clients functionality:
```js
import {Zig} from "zig-js/libzig";
```

Once the game has finsihed loading all assets and is ready to start, you can signal
this by sending a `gameLoaded` message to the parent frame. To simplify things the
ZIG client exposes a `Messages` object (of type `GameMessageInterface`).

```js
// tell parent frame, that the game finished loading
Zig.Client.Messages.gameLoaded();
```

The parent frame now sends a `playGame` or `playDemoGame` message back to the game.
To listen for events the `Messages` object exposes a `registerGeneric` method. Simply
pass an object containing event handlers with the messagetypes as keys. 

```js
// wait for the player to start the game
Zig.Client.Messages.registerGeneric({
  playGame() {
    Game.runGame();
  },
  
  playDemoGame() {
    // the player requested a demo ticket.
    // Game.runDemoGame()
  },
});
```

To buy a ticket, use the `Zig.Client.buyTicket` method. The method returns a
javascript `Promise` instance. You can use `.then(...)` or the modern `async`/`await`
syntax with that method. Be aware that `async`/`await` is not yet available on all browsers
and might need transpiling.

```js
const Game = {
  runGame() {
    // get the ticket
    const ticket = await Zig.Client.buyTicket();
    
    // let the customer play the ticket
    await play(ticket);
    
    // settle the ticket.
    await Zig.Client.settleTicket(ticket.id);
    
    // tell the parent that the game has finish
    Zig.Client.Messages.gameFinished();
  }
};
```

In case of errors, you can use the `error` method on the `Messages` instance, to forward any
value as an error object to the parent frame. You might want to wrap your `runGame` method in a try/catch
block like this:
```js
const Game = {
  runGame() {
    try {
      // [...]
    } catch(err) {
      Zig.Client.Messages.error(err);
    }
  }
};
```

For more information, check the source or the latest [typescript d.ts file](https://unpkg.com/zig-js/libzig.d.ts).


