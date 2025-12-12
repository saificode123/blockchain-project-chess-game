require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.28", // This must match the version at the top of ChessWager.sol
  networks: {
    // Configuration for the internal Hardhat network
    hardhat: {
      chainId: 1337 
    },
    // Configuration for connecting to the running node (npx hardhat node)
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337
    }
  }
};