import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";

import dotenv from 'dotenv';
dotenv.config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

if (!SEPOLIA_RPC_URL || !DEPLOYER_PRIVATE_KEY) {
  console.warn("WARNING: SEPOLIA_RPC_URL or DEPLOYER_PRIVATE_KEY not found in .env. Deployment to Sepolia might fail.");
}

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",      
    cache: "./cache",     
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  }
};

export default config;