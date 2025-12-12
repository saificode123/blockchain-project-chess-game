const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("----------------------------------------------------");
  console.log("🚀 Starting Advanced Deployment...");
  console.log("----------------------------------------------------");

  // 1. Get the Deployer's Wallet (Account 0)
  const [deployer] = await hre.ethers.getSigners();
  const balance = await deployer.provider.getBalance(deployer.address);
  
  console.log("📡 Deploying to network:", hre.network.name);
  console.log("👤 Deploying with account:", deployer.address);
  console.log("💰 Account Balance:", hre.ethers.formatEther(balance), "ETH");

  // 2. Deploy the Contract
  console.log("\n📄 Deploying ChessWager smart contract...");
  
  // Get the Contract Factory
  const ChessWager = await hre.ethers.getContractFactory("ChessWager");
  
  // Deploy the contract
  const chess = await ChessWager.deploy();

  // Wait for the deployment transaction to be mined
  await chess.waitForDeployment();
  
  // Get the deployed address
  const contractAddress = await chess.getAddress();

  console.log("----------------------------------------------------");
  console.log("✅ Contract Deployed Successfully!");
  console.log("🏛️  Contract Address:", contractAddress);
  console.log("----------------------------------------------------");

  // 3. AUTOMATICALLY SAVE TO FRONTEND
  // This function saves the files directly to your React project
  await saveFrontendFiles(chess, contractAddress);
}

async function saveFrontendFiles(contract, address) {
  // --- PATH CONFIGURATION ---
  // __dirname = current folder (scripts)
  // ".." = goes up to project root
  // "frontend/src/contracts" = goes down into your react app
  // ADJUST THIS if your frontend folder is named 'client' or 'app'
  const contractsDir = path.join(__dirname, "..", "frontend", "src", "contracts");

  // 1. Create the directory if it doesn't exist
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
    console.log("📁 Created directory:", contractsDir);
  }

  // 2. Save the Contract Address
  fs.writeFileSync(
    path.join(contractsDir, "contract-address.json"),
    JSON.stringify({ ChessWager: address }, undefined, 2)
  );

  // 3. Save the ABI (The Logic)
  // We use hre.artifacts to get the compiled JSON
  const Artifact = await hre.artifacts.readArtifact("ChessWager");

  fs.writeFileSync(
    path.join(contractsDir, "ChessWager.json"),
    JSON.stringify(Artifact, null, 2)
  );

  console.log("📂 Artifacts saved to:", contractsDir);
  console.log("   - contract-address.json");
  console.log("   - ChessWager.json");
  console.log("✨ Frontend is now synced with Backend!");
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });