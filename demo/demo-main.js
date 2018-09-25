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

async function fakeRequestHandler(req) {
  // simulate a slow api call
  await sleep(500);
  logEvent("XMLHttpRequest", req, "#808");

  let statusCode = 404;
  let body = null;

  if (req.path.indexOf("/settle") !== -1) {
    statusCode = 204;
  }

  if (req.path.indexOf("/tickets") !== -1) {
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

class Connector extends ZIG.Connector {
  Connector() {
    this.balanceInMinor = 5000;
  }

  async fetchCustomerState() {
    await sleep(250);

    return {
      loggedIn: true,

      balance: {
        amountInMinor: this.balanceInMinor,
        amountInMajor: this.balanceInMinor / 100,
        currency: 'EUR',
      }
    };
  }

  executeHttpRequest(req) {
    return fakeRequestHandler(req);
  }

  updateUIState(state, game) {
    logEvent("UIState", state, "#008");

    // clear ui state
    const overlay = document.querySelector(`#sendCommands`);
    overlay.className = "overlay";

    // hide everything if no button is selected
    if (state.buttonType === 'none') {
      overlay.classList.add("overlay--hidden")
    }

    // hide all buttons and apply enabled/disabled state
    overlay.querySelectorAll("[data-button-type]").forEach(button => {
      button.style.display = "none";
      button.disabled = !state.enabled;
    });

    // and show the active one
    const button = overlay.querySelector(`[data-button-type=${state.buttonType}]`);
    if (button) {
      button.style.display = "block";
    }

    overlay.querySelectorAll("[data-button-type=buy], [data-button-type=play], [data-button-type=unplayed], [data-button-type=voucher]").forEach(button => {
      button.onclick = () => game.playGame();
    });

    overlay.querySelector("[data-price]").innerText = state.ticketPrice.amountInMinor;
  }
}

window.onload = async () => {
  const gameConfig = {
    canonicalGameName: "demo",
    overlay: false,
  };

  const container = document.querySelector("#game");
  const game = ZIG.installGame({
    container: container,
    url: `https://mylotto24.frontend.zig.services/${gameName}/latest/tipp24_com/game/outer.html`,
    gameConfig: gameConfig,
    connector: new Connector(),
  });

  // log all events.
  game.rawMessageClient.register(event => logEvent("Incoming event", event, "#800"));

  // patch the raw client to intercept messages we send
  const _send = game.rawMessageClient.send;
  game.rawMessageClient.send = msg => {
    logEvent("Outgoing event", msg, "#080");
    _send.call(game.rawMessageClient, msg);
  };


  await game.initialize(gameData.gameInput || undefined);
};