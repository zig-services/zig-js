const GameDataObjects = {
  dickehose: {
    scenario: {
      fields: [
        {
          number: 1,
          winningClass: 1,
          winningsAmountInMinorUnit: 75
        }, {
          number: 2,
          winningClass: 2,
          winningsAmountInMinorUnit: 100
        }, {
          number: 3,
          winningClass: 3,
          winningsAmountInMinorUnit: 250
        }, {
          number: 4,
          winningClass: 2,
          winningsAmountInMinorUnit: 100
        }, {
          number: 5,
          winningClass: 2,
          winningsAmountInMinorUnit: 100
        }, {
          number: 6,
          winningClass: 5,
          winningsAmountInMinorUnit: 1000
        }
      ],
    },
  },

  sofortlotto: {
    gameInput: {
      rows: [
        [1, 2, 3, 4, 5, 6],
        [7, 8, 9, 10, 11, 12],
      ]
    },

    scenario: {
      winningNumbers: [1, 2, 42, 43, 44, 45, 46],
      rows: [
        [1, 2, 3, 4, 5, 6],
        [7, 8, 9, 10, 11, 12],
      ]
    }
  },

  cardcash: {
    betFactor: 5,
    scenario: {
      "id": 215,
      "scenario": "{\"tier\":0,\"id\":215,\"pattern\":[{\"gold\":false,\"symbol\":0,\"face\":6},{\"gold\":false,\"symbol\":2,\"face\":6},{\"gold\":false,\"symbol\":1,\"face\":4},{\"gold\":false,\"symbol\":2,\"face\":2},{\"gold\":false,\"symbol\":3,\"face\":12},{\"gold\":false,\"symbol\":2,\"face\":12},{\"gold\":false,\"symbol\":3,\"face\":6},{\"gold\":false,\"symbol\":1,\"face\":8},{\"gold\":false,\"symbol\":2,\"face\":10},{\"gold\":false,\"symbol\":1,\"face\":2},{\"gold\":false,\"symbol\":2,\"face\":4},{\"gold\":false,\"symbol\":4,\"face\":-1},{\"gold\":false,\"symbol\":3,\"face\":11},{\"gold\":false,\"symbol\":1,\"face\":12},{\"gold\":false,\"symbol\":3,\"face\":3},{\"gold\":false,\"symbol\":0,\"face\":3},{\"gold\":false,\"symbol\":1,\"face\":11},{\"gold\":false,\"symbol\":3,\"face\":8},{\"gold\":false,\"symbol\":4,\"face\":-1},{\"gold\":false,\"symbol\":3,\"face\":1},{\"gold\":false,\"symbol\":2,\"face\":9},{\"gold\":false,\"symbol\":3,\"face\":0},{\"gold\":false,\"symbol\":0,\"face\":7},{\"gold\":false,\"symbol\":1,\"face\":10},{\"gold\":false,\"symbol\":0,\"face\":10}],\"goldGame\":{\"unlocked\":false,\"keys\":[],\"data\":[]},\"bonusGame\":{\"keys\":[],\"unlocked\":false,\"data\":[]},\"winningSets\":[],\"winAmounts\":{\"main\":-1,\"gold\":-1,\"bonus\":-1}}"
    },
  }
};

function responseTicket(data) {
  return {
    id: -1,
    externalId: "demogame:00000",
    ticketNumber: null,
    scenario: btoa(JSON.stringify(data.scenario)),
    betFactor: data.betFactor || 1,
    winningClass: {
      number: 0,
      numberOfTickets: -1,
      winningsType: "NoWinnings",
      winnings: {
        amount: "0.00",
        amountInMajor: 0,
        amountInMinor: 0,
        currency: "EUR",
      },
    }
  }
}
