const bootTime = Date.now();

// pick config from URL
const gameName = (/game=([a-z]+)/.exec(location.search) || ["", "dickehose"])[1];
const gameData = GameDataObjects[gameName] || {};

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function logEvent(prefix, event, textColor) {
  const time = ((Date.now() - bootTime) * 0.001).toFixed(3) + "s";

  const div = document.createElement("pre");
  div.style.color = textColor;
  div.innerText = `${time}, ${prefix}:\n` + JSON.stringify(event, undefined, "  ");

  const container = document.querySelector("#events");
  container.insertBefore(div, container.firstChild);
}

class Connector extends ZIG.Connector {
  constructor(vm) {
    super();

    this.vm = vm;
  }

  async fetchCustomerState() {
    await sleep(250);

    const demoState = this.vm.demoState;

    if (demoState.httpStatus === "connection") {
      throw new Error("http connection failed.");
    }

    return {
      loggedIn: true,
      balance: ZIG.MoneyAmount.of(demoState.balance, demoState.currency),
      personalizedTicketPrice: {
        normalTicketPrice: ZIG.MoneyAmount.of(demoState.ticketPrice, demoState.currency),
        discountedTicketPrice: ZIG.MoneyAmount.of(demoState.ticketPrice - demoState.discount, demoState.currency),
      }
    };
  }

  showErrorDialog(error) {
    logEvent("ERROR", error, "#f00");
    return this.vm.showErrorDialog(error);
  }

  async executeHttpRequest(req) {
    const demoState = this.vm.demoState;

    // simulate a slow api call
    await sleep(500);

    logEvent("XMLHttpRequest", req, "#808");

    let statusCode = 404;
    let body = null;

    if (new RegExp("^/product/iwg/[^/]+/tickets/[^/]+/settle").test(req.path)) {
      statusCode = 204;
    }

    if (new RegExp("^/product/iwg/[^/]+/tickets($|\\?)").test(req.path)) {
      demoState.balance -= (demoState.ticketPrice - demoState.discount);
      statusCode = 200;
      body = responseTicket(gameData)
    }

    if (req.path.indexOf("/demoticket") !== -1) {
      statusCode = 200;
      body = responseTicket(gameData)
    }

    logEvent("XMLHttpRequest.response " + statusCode, body, "#a0a");

    return {response: {statusCode, body: JSON.stringify(body)}};
  }

  updateUIState(state, game) {
    logEvent("UIState", state, "#008");
    this.vm.uiState = state;
  }
}

window.onload = async () => {
  const url = new URL(location.href);

  const vm = new Vue({
    el: "#app",

    data: {
      uiState: {},
      error: null,
      resolveErrorPromise: null,

      demoState: {
        balance: 5000,
        ticketPrice: 150,
        discount: 0,
        currency: "EUR",
        httpStatus: "okay",
      },

      game: null,
    },

    mounted() {
      // automatically load the game if requested.
      if (url.searchParams.get("defer") !== "true") {
        this.loadGame();
      }
    },

    methods: {
      async loadGame() {
        const gameConfig = {
          canonicalGameName: gameName,
          overlay: false,
        };

        const container = this.$refs.gameContainer;

        const game = ZIG.installGame({
          container: container,
          url: `https://mylotto24.frontend.zig.services/${gameName}/latest/tipp24_com/game/outer.html`,
          gameConfig: gameConfig,
          connector: new Connector(this),
        });

        // log all events.
        game.rawMessageClient.register(event => {
          logEvent("Incoming event", event, "#800");
        });

        // patch the raw client to intercept messages we send
        const _send = game.rawMessageClient.send;
        game.rawMessageClient.send = msg => {
          logEvent("Outgoing event", msg, "#080");
          _send.call(game.rawMessageClient, msg);
        };

        this.game = game;

        await game.initialize(gameData.gameInput || undefined);
      },

      play() {
        // play the game
        this.game.playGame();
      },

      async showErrorDialog(error) {
        this.error = error;

        // calling errorClose() with resolve the promise here.
        await new Promise(resolve => this.resolveErrorPromise = resolve);
      },

      closeErrorDialog() {
        this.error = null;
        this.resolveErrorPromise();
      },

      updateUrl(update) {
        const copy = new URL(url.toString());

        for (let key in update) {
          if (update.hasOwnProperty(key)) {
            copy.searchParams.set(key, update[key]);
          }
        }

        location.href = copy;
      },
    },
  });
};