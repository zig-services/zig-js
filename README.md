# zig-js

Embedding the ZIG client into your game or integrating games into your page is easy.

The library is available as an [npm package](https://www.npmjs.com/package/zig-js).
Install it and add it to your `package.json` using `npm install --save zig-js`.
You can then import the library and access the zig functionality.

The examples in this document make heavy use of `async`/`await` to handle promises.
`await x(); y()` is similar to `x().then(() => y())`.
If you also want to use `async`/`await` in your code, you might need to relay on
*typescript* or *babel* to transpile those new keywords to ECMAScript 5 syntax.
More information to [async function on MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await).

## Embedding ZIG into your game

For a quick start on how to include the `zig-js` library in a game project using webpack,
see our [example project](https://github.com/zig-services/example-game/blob/master/README.md)
on github. The project also includes information on how to test your game integration
locally.

### Loading your game

Once the game has finished loading all assets and is ready to start, you can signal
this by sending a `gameLoaded` message to the parent frame. To simplify things the
ZIG client exposes a `Messages` object (of type `GameMessageInterface`). Only use the
`Zig.Client` instance if the `Zig.ready()` promise resolves.

There are two game flow modes.

* **Single round game** In this mode the game is controlled completely from the outside.
  You dont need to implement any game controls. This mode does not support things
  like re-buy or variable stake selection.

* **In-game purchase flow** In this mode all controls are handled by the game itself.
  The game is responsible to show a *play* button and, if required, a
  variable stake selector. To enable this mode, you need to add `purchaseInGame: true`
  to the game settings defined in your `outer.html` file.

The supported game mode can be passed as a parameter to the `gameLoaded` call.

```js
import {Zig} from "zig-js/zig/zig";

window.onload = async () => {
  // wait for your game to load
  await YourGame.loadAssets();

  // wait for Zig.Client to initialize. Only use Client after this
  await Zig.ready();

  // tell parent frame that the game finished loading
  const purchaseInGame = false;
  Zig.Client.Messages.gameLoaded(purchaseInGame);
};
```

### Single round games

The flow for a single round game is described [in this diagram](https://mermaidjs.github.io/mermaid-live-editor/#/view/eyJjb2RlIjoiZ3JhcGggVERcblxuUkVBRFlbXCJhd2FpdCBaaWcucmVhZHkoKVwiXVxuUkVHSVNURVJbXCJyZWdpc3RlckdlbmVyaWMoKVwiXVxuRVhJVFtcImZpbmlzaEdhbWUoKVwiXVxuVElDS0VUW1wiYXdhaXQgYnV5VGlja2V0KClcIl1cblNFVFRMRVtcImF3YWl0IHNldHRsZVRpY2tldCgpXCJdXG5cblJFQURZIC0tPiBSRUdJU1RFUlxuVElDS0VUIC0tPiBTRVRUTEVcblJFR0lTVEVSIC0uLT4gfHBsYXlHYW1lfCBUSUNLRVRcblNFVFRMRSAtLT4gRVhJVFxuRVhJVCAtLi0-IHxwbGF5R2FtZXwgVElDS0VUIiwibWVybWFpZCI6eyJ0aGVtZSI6ImRlZmF1bHQifX0).
<!--
If you want to change the diagram,
replace /view/ with /edit/ in the url above to edit the image.
-->


Once the customer decides between a real game for money or a free demo game
the parent frame sends a `playGame` or `playDemoGame` message back to the game.
To listen for those events the `Messages` object exposes a `registerGeneric` method.
Simply pass an object containing event handlers with the message types as keys.

```js
Zig.Client.Messages.registerGeneric({
  playGame() {
    // the player would like to start a new game round.
    // call into your game code to begin a new round.
    YourGame.runGame();
  },

  playDemoGame() {
    // the player requested a demo ticket.
    // YourGame.runDemoGame()
  },
});
```

To buy a ticket, use the `Zig.Client.buyTicket` method. The method returns a
`Promise` instance resolving to the ticket that was supplied by the backend system. This ticket
includes all the information about the game you need to show to the customer.
```typescript
interface Ticket {
    // Local id of the ticket
    // This id needs to be send back with a `settle` call.
    id: string;

    // Some identifying alphanumeric string that does not need to be
    // unique but should identify the ticket given other information like an
    // approximate time or customer number
    ticketNumber: string;

    // The amount of money the customer payed for this ticket.
    price: MoneyAmount;

    // The winning class of the ticket. Use this to extract the winnings
    // of this ticket. If the winnings are zero this was a loosing bet.
    winningClass: {
        winnings: MoneyAmount
    };

    // the decoded scenario object or undefined if the scenario
    // field could not be decoded. Basically `JSON.parse(atob(ticket.scenario))`
    decodedScenario?: any;
}

interface MoneyAmount {
    amountInMinor: number;
    amountInMajor: number;
    currency: string;
}
```

After the customer plays the game, you might want to show a dialog containing the
winnings for the purchased ticket. Once that dialog is closed by the user, you signal
the end of the game round using `gameFinished()`.

```js
const YourGame = {
  async runGame() {
    // get the ticket
    const ticket = await Zig.Client.buyTicket();

    // show the progression + outcome to the customer
    await YourGame.play(ticket);

    // settle the ticket and add he winnings to the customers account
    await Zig.Client.settleTicket(ticket.id);

    // Show a dialog to the customers displaying the winnings
    await YourGame.showTicketWinnings(ticket);

    // tell the parent that the game has finish
    Zig.Client.Messages.gameFinished();
  },
};
```

In case of errors, you can use the `error` method on the `Messages` instance, to forward any
value as an error object to the parent frame. The `Zig.Client` object will already handle errors
for you, but you might want to wrap the call to your `play` method in a try/catch
block like this. If you are using promises without `await`, you need to call `.catch(...)`.
```js
try {
  await YourGame.play(ticket);
} catch(err) {
  Zig.Client.interfaces.error(err);
  // YourGame.reset();
  return;
}
```

After sending an error to the parent frame you should always reset your game frontend.
For more information see [error handling](#error-handling) section.

### In-game start-button and variable stakes

If the game supports variable stakes and an in-game start-button, the order of operations
slightly differs. You can see the complete game flow [in this diagram](https://mermaidjs.github.io/mermaid-live-editor/#/view/eyJjb2RlIjoiZ3JhcGggVERcblxuUkVBRFlbXCJhd2FpdCBaaWcucmVhZHkoKVwiXVxuUkVHSVNURVJbXCJyZWdpc3RlckdlbmVyaWMoKVwiXVxuU0VMe1wic3Rha2Ugc2VsZWN0aW9uXCJ9XG5FWElUW1wiZmluaXNoR2FtZSgpXCJdXG5CVVlbXCJidXkoKVwiXVxuVElDS0VUW1wiYXdhaXQgYnV5VGlja2V0KClcIl1cblNFVFRMRVtcImF3YWl0IHNldHRsZVRpY2tldCgpXCJdXG5cblJFQURZIC0tPiBSRUdJU1RFUlxuUkVHSVNURVIgLS4tPiB8cHJlcGFyZUdhbWV8IFNFTFxuU0VMIC0tPiB8c3RhcnQgY2xpY2tlZHwgQlVZXG5USUNLRVQgLS0-IFNFVFRMRVxuU0VUVExFIC0tPiBTRUxcblNFTCAtLT58aG9tZSBidXR0b258IEVYSVRcbkJVWSAtLi0-IHxwbGF5R2FtZXwgVElDS0VUXG5CVVkgLS4tPiB8Y2FuY2VsUmVxdWVzdFN0YXJ0R2FtZXwgU0VMXG5cblJFR0lTVEVSIC0uLT4gfHBsYXlHYW1lfCBUSUNLRVQiLCJtZXJtYWlkIjp7InRoZW1lIjoiZGVmYXVsdCJ9fQ).
<!--
If you want to change the diagram,
replace /view/ with /edit/ in the url above to edit the image.
-->

First you need to tell the parent page that your game handles
this so called _in game purchase flow_. You do this by passing `true` to the
`gameLoaded()` call as described above.

```js
// tell parent frame, that the game finished loading,
// and that we are running in 'in game purchase' mode.
const purchaseInGame = true;
Zig.Client.Messages.gameLoaded(purchaseInGame);
```

Once the player wishes to enter the game, the parent frame will send a `prepareGame` message
containing a parameter that tells your game, if the player wishes to play a demo games
or a series of real game. At this point, you'll show the play button and the
stake selection, if you implement a variable stake game.

```js
Zig.Client.Messages.registerGeneric({
  // [...]
  prepareGame(event) {
    // call your game to show/enable the stake selector.
    YourGame.showStakeSelector(event.demo);
  },
});
```

Once the player has selected the stake and you want the game to begin, the game needs
to send a `buy` message containing the selected stake.

```js
const YourGame = {
  selectedStake: 2,

  onStartGameClicked() {
    // request the parent to start the game with the given stake.
    Zig.Client.Messages.buy(YourGame.selectedStake);
  },
}
```

The integrating frame will validate the request, check the players balance, etc and
call your game back with a normal `playGame` or `playDemoGame` message like in
the *single game round* example above. You will not get the selected stake back in the message,
so you need to hang onto the selected stake in your game while you are waiting
for the game to start. In you `playGame` handler, you call the `Zig.Client.buyTicket`
method with a second parameter containing the stake. The same is true for your `playDemoGame` handler:

```js
await Zig.Client.buyTicket(null, {betFactor: YourGame.selectedStake})
```

After settling the ticket using `settleTicket`, you jump back to the stake selection
screen without sending a `gameFinished` message. You only send a `gameFinished`
message you want to leave your game using a special *homescreen* button.

**Resume unplayed game** In case that the user has an unplayed ticket, the integration will
not call `prepareGame` but call `playGame` directly. In that case you can go ahead
with requesting a ticket by calling `Zig.Client.buyTicket` without any extra paramters.

**Cancel buy request** After sending a `buy` message to the parent, the customer might choose
to cancel the game or may not have enought money to play the game with the selected stake.
In that case a `cancelRequestStartGame` will be send to the game. You can then show the
stake selection screen again.

```js
Zig.Client.Messages.registerGeneric({
  // [...]
  cancelRequestStartGame() {
    // call your game to show/enable the stake selector.
    YourGame.showStakeSelector();
  },
});
```


### Error handling

In case of errors, you should delegate the error handling to the parent frame.
The library will try to make sense of the error object and handle it appropriately.
You should reset your game into the initial state after an error and expect a normal
`prepareGame` or `playGame` message to start a new game round.

```js
try {
  // ...
} catch(err) {
  Zig.Client.Messages.error(yourErrorObject);
  YourGame.reset();
}
```

## Integrating games into your platform

Integrating zig games into your platform is also easy. We provide you with a simple
javascript library that does most of the integration work for you. You only need to
implement a `Connector` class to provide some information about the current
customer state to the game as well as handle the customer integration. If the user is
signed in, the customer state includes a `loggedIn: true` flag as well as the current
customers balance.

### Writing a Connector

After including the library into your frontend code, you can create a subclass of the
`Connector` class. The only method that is required to implement is the
`fetchCustomerState` method that returns a promise returning the customer state.

```js
import {Connector} from 'zig-js/integration/connector';

class YourConnector extends Connector {
  async fetchCustomerState() {
    // fetch the data from your backend
    const yourCustomerState = await YourPlatform.customerState();
    if (yourCustomerState.signedIn) {
      // and return the state in the correct format
      return {
        loggedIn: true,
        balance: MoneyAmount.of(
          yourCustomerState.balanceInMinor,
          yourCustomerState.balanceCurrency),
      };
    } else {
      return {loggedIn: false};
    }
  }
}
```

Having this class, you can now include the game into your platform. To do so, you
need to define a target element, e.g. `<div id="zig-game"></div>` and call the
`installGame` method with the games configuration. For the game `dickehose` it would
look like this:

```js
// use the frontend url that was provided to you by the zig service, e.g:
const frontendUrl = "https://mylotto24.frontend.zig.services/dickehose/latest/tipp24_com/game/outer.html";

window.onload = async () => {
  const game = installGame({
    connector: new YourConnector(),
    container: document.getElementById('zig-game'),
    url: frontendUrl,
    gameConfig: {
      canonicalGameName: 'dickehose',
    },
  });

  // wait for the game to initialize and finish loading
  await game.initialize();
};
```

This will create the necessary markup and include the games frontend using an iframe.
The game will now load on opening the page.

### Overlay

To let the user interact with the game, you need to provide a control overlay.
The overlay will include a button to start the game, show the ticket prize and might
include another optional button to allow the customer to play a free ticket.

To show this overlay, please implement the `updateUIState` method in your connector class.
```js
class YourConnector extends Connector {
  updateUIState(state, game) {
    YourOverlay.update(state, game);
  }
}
```

The most important type of the `state` parameter is the `buttonType` field. It contains
a keyword describing the current state of the ui or the _main interaction_ component.
The supported values of this field are:
* `none` Do not show any user interface.
* `login` The customer is not signed in. You might want to provide a button to let
  the customer sign into your page.
* `payin` The customer does not have enought balance to play the next round.
* `buy` The customer can buy a ticket and play the game.
* `play` For games supporting the in-game purchase flow clicking this button will
  start the game and hide the ui.
* `unplayed` The customer has an unplayed game and can resume the game now.
* `voucher` The customer currently has a voucher and the next game will be free.

The complete state looks like this:
```ts
export interface UIState {
  // State of the main button that the ui shows.
  // Use this as main indicator to decide how to render the UI.
  // A type of 'none' should not render any UI.
  buttonType: 'none' | 'login' | 'payin' | 'buy' | 'play' | 'unplayed' | 'voucher';

  // If this is true you might offer a demo ticket to the customer.
  allowFreeGame: boolean;

  // The normal ticket price
  normalTicketPrice: MoneyAmount;

  // The discounted ticket price. Only set if there is a discount on the ticket.
  discountedTicketPrice?: MoneyAmount;

  // True if the ticket price can be adjusted by switching a bet factor in the game
  ticketPriceIsVariable: boolean;

  // Flags if the user is allowed to interact with the overlay
  enabled: boolean;

  // This field is set if the player can continue with an existing ticket.
  unplayedTicketInfo?: UnplayedTicketInfo;

  // True if the player is _currently_ playing a free demo game round.
  isFreeGame: boolean;
}
```

#### Using the default overlay

This library will provide a basic user interface to simplify the
integration of new games even more. **TODO customization**

A complete example on how to start a game looks like this:
```html
<!DOCTYPE>
<html>
<body>

<style>
  #zigContainer {
    position: relative;
    min-height: 10em;
    background: #eee;
  }

  #overlayContainer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
  }
</style>

<div id="zigContainer">
  <div id="gameContainer"></div>
  <div id="overlayContainer"></div>
</div>

<script src="https://lib.zig.services/zig/1-dev/libint.js"></script>

<script defer>
  class DemoConnector extends ZIG.Connector {
    constructor(updateUIState) {
      super();
      this._updateUIState = updateUIState;
    }

    async fetchCustomerState() {
      return {
        loggedIn: true,
        balance: ZIG.MoneyAmount.of(1000, "EUR"),
      };
    }

    async showErrorDialog(error) {
      alert(JSON.stringify(error, null, 2));
    }

    updateUIState(uiState, game) {
      this._updateUIState(uiState, game);
    }
  }

  window.onload = () => {
    const updateUIState = ZIG.installOverlay(document.querySelector("#overlayContainer"));

    const gameConfig = {
      canonicalGameName: "dickehose",
      isTestStage: true,
    };

    const game = ZIG.installGame({
      container: document.querySelector("#gameContainer"),
      url: "https://mylotto24.frontend.zig.services/dickehose/latest/tipp24_com/game/outer.html",
      gameConfig: gameConfig,
      connector: new DemoConnector(updateUIState),
    });

    game.initialize();
  };
</script>

</body>
</html>
```

### Further customization

The integration defines three default routes to access your backend. Those are described in the
backend integration documentation and default to `/zig/games/${gameName}/ticket:${op}`.
You are able to rewrite those default endpoints by implementing the `buildRequestPath`
method in your `Connector`. If your backend cannot handle path parameters, you might want to
pass the game name as a parameter. To do so, implement the method as such:

```js
class YourConnector extends Connector {
  buildRequestPath(request) {
    if (r.type === "buy" || r.type === "settle") {
      return `/api/buy-tickets?game=${r.gameName}&demo=${r.type === 'demo'}&quantity=${r.quantity}&betFactor=${r.betFactor}`;
    } else if (r.type === "settle") {
      return `/api/settle?game=${r.gameName}&id=${r.ticketId}`;
    }
  }
}
```


## Build and release this library

*This part of the documentation is only relevant for developers of the zig client.*

You can build the library using `npm` run shortcuts.

 * `npm run release` Will build a new *stable* release. This will be automatically
 used by all game frontends that include the library.

 * `npm run beta` Will release a beta build and push that as `dev` version to npm.
 While you are on a beta release, you can upload new versions without doing a real release.

 * `npm run build-upload` Uploads a new version into the dev channel,
 but only if you are currently on a beta release.
