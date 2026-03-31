const { treasuryExports } = require("../helper/treasury");

const treasury = "0x58e6c7ab55Aa9012eAccA16d1ED4c15795669E1C";

module.exports = treasuryExports({
  isComplex: true,
  complexOwners: [treasury],
  ethereum: {
    owners: [treasury],
  },
})
