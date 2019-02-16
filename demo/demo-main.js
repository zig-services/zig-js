// enable logging locally
enableZigLogging();

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function parseIntegrationConfiguration() {
  // pick config from URL
  const url = new URL(location.href);

  // first check the demoConfig parameter
  const encoded = url.searchParams.get("demoConfig");
  if (encoded) {
    const demoConfig = JSON.parse(encoded);
    const gameName = demoConfig.name || "yourgame";
    const gameUrl = demoConfig.url || `https://mylotto24.frontend.zig.services/${gameName}/tipp24_com/latest/game/outer.html`;
    const extraGameConfig = demoConfig.gameConfig || {};

    return {
      gameName, gameUrl, extraGameConfig,
      gameData: demoConfig.data,
    }
  } else {
    // use game/url parameters from URL.
    const gameName = url.searchParams.get("game") || "dickehose";
    const gameUrl = url.searchParams.get("url") || `https://mylotto24.frontend.zig.services/${gameName}/tipp24_com/latest/game/outer.html`;
    const gameData = GameDataObjects[gameName] || {};
    return {gameName, gameUrl, gameData, extraGameConfig: {}};
  }
}

function logEvent(prefix, event, textColor) {
  const time = ((Date.now() - bootTime) * 0.001).toFixed(3) + "s";

  const div = document.createElement("pre");
  div.style.color = textColor;
  div.innerText = `${time}, ${prefix}:\n` + JSON.stringify(event, undefined, "  ");

  const container = document.querySelector("#events");
  container.insertBefore(div, container.firstChild);
}

// expose on window
Object.assign(window, ZIG);

const bootTime = Date.now();
const demoConfig = parseIntegrationConfiguration();

class DemoConnector extends Connector {
  constructor(vm, updateUIState) {
    super();
    this.vm = vm;
    this._updateUIState = updateUIState;
  }

  async fetchCustomerState() {
    await sleep(250);

    const demoState = this.vm.demoState;

    if (demoState.httpStatus === "connection") {
      throw new Error("http connection failed.");
    }

    const personalizedTicketPrice = {
      normalTicketPrice: ZIG.MoneyAmount.of(demoState.ticketPrice, demoState.currency),
      discountedTicketPrice: ZIG.MoneyAmount.of(demoState.ticketPrice - demoState.discount, demoState.currency),
    };

    if (!demoState.loggedIn) {
      return {
        loggedIn: false,
        personalizedTicketPrice
      }
    }

    return {
      loggedIn: true,
      balance: ZIG.MoneyAmount.of(demoState.balance, demoState.currency),
      voucher: ZIG.MoneyAmount.of(demoState.voucher, demoState.currency),
      personalizedTicketPrice,
    };
  }

  async showErrorDialog(error) {
    logEvent("ERROR", error, "#f00");
    return this.vm.showErrorDialog(error);
  }

  async executeHttpRequest(req) {
    const demoState = this.vm.demoState;

    // simulate a slow api call
    await sleep(500);

    logEvent("XMLHttpRequest", req, "#808");

    let statusCode = 404;
    let body = `No body for request ${req.method} ${req.url}`;

    if (new RegExp("^/product/iwg/[^/]+/tickets/[^/]+/settle").test(req.path) || req.path.indexOf("/tickets:settle") !== -1) {
      statusCode = 204;
    }

    if (new RegExp("^/product/iwg/[^/]+/tickets($|\\?)").test(req.path) || req.path.indexOf("/tickets:buy") !== -1) {
      if (demoState.httpStatus === "realitycheck") {
        statusCode = 500;
        body = RealityCheckResponse;

      } else {
        const discount = demoState.voucher || demoState.discount;
        demoState.balance -= (demoState.ticketPrice - discount);
        demoState.voucher = 0;
        statusCode = 200;
        body = responseTicket(demoConfig.gameData)
      }
    }

    if (req.path.indexOf("/demo") !== -1 || req.path.indexOf("/tickets:demo") !== -1) {
      statusCode = 200;
      body = responseTicket(demoConfig.gameData)
    }

    logEvent("XMLHttpRequest.response " + statusCode, body, "#a0a");

    return {response: {statusCode, body: JSON.stringify(body)}};
  }

  updateUIState(state, game) {
    logEvent("UIState", state, "#008");
    // this.vm.uiState = state;
    this._updateUIState(state, game);
  }

  async loginCustomer() {
    this.vm.demoState.loggedIn = true;
    return true;
  }

  get allowFullscreen() {
    return !!this.vm.demoState.allowFullscreen;
  }
}

window.onload = async () => {
  Vue.filter('money', (moneyAmount) => {
    if (moneyAmount == null) {
      return "undefined";
    }

    const amount = moneyAmount.amountInMajor.toFixed(2);
    return amount + "\u2009" + moneyAmount.currency;
  });

  new Vue({
    el: "#app",

    data: {
      uiState: {},
      error: null,
      resolveErrorPromise: null,

      small: !/fullSize=true/.test(location.href),

      demoState: {
        loggedIn: true,
        balance: 5000,
        ticketPrice: 150,
        discount: 0,
        currency: "EUR",
        httpStatus: "okay",

        preserveState: true,
        autoLoadGame: true,
        allowFullscreen: false,

        voucher: 0,
      },
    },

    created() {
      this.game = null;
    },

    mounted() {
      // restore demo state if available
      const previousState = localStorage.getItem("demoState");
      if (previousState) {
        this.demoState = JSON.parse(previousState);
      }

      // observe demo state for changes
      this.$watch("demoState", () => this.demoStateChanged(), {deep: true});

      // automatically load the game if requested.
      if (this.demoState.autoLoadGame) {
        this.loadGame();
      }
    },

    methods: {
      demoStateChanged() {
        if (this.demoState.preserveState) {
          localStorage.setItem("demoState", JSON.stringify(this.demoState));
        } else {
          localStorage.removeItem("demoState");
        }
      },

      async loadGame() {
        const gameConfig = {
          canonicalGameName: demoConfig.gameName,
          overlay: false,
          isTestStage: true,
          remoteAccessToken: "dummy token",
          ...demoConfig.extraGameConfig,
        };

        // add the overlay
        const updateUIState = ZIG.installOverlay(this.$refs.overlayContainer,
          {belowGameHint: demoConfig.gameData.belowGameHint});

        const game = ZIG.installGame({
          container: this.$refs.gameContainer,
          url: demoConfig.gameUrl,
          gameConfig: gameConfig,
          baseTicketPrice: MoneyAmount.of(75, "EUR"),
          connector: new DemoConnector(this, updateUIState),
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

        await game.initialize(demoConfig.gameData.gameInput || undefined);
      },

      payin() {
        this.demoState.balance += 1000;
        this.game.resetUIState();
      },

      play() {
        // play the game
        this.game.playGame();
      },

      demo() {
        this.game.playDemoGame();
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
        const copy = new URL(location.href);

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

