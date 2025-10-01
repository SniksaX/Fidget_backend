import { JsonRpcProvider, Wallet } from 'ethers';
import 'dotenv/config';

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!SEPOLIA_RPC_URL || !DEPLOYER_PRIVATE_KEY) {
    console.error('Missing blockchain environment variables: SEPOLIA_RPC_URL or DEPLOYER_PRIVATE_KEY.');
    process.exit(1);
}

export const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
export const deployerSigner = new Wallet(DEPLOYER_PRIVATE_KEY, provider);

console.log(`[Blockchain] Initialized with deployer/owner address: ${deployerSigner.address}`);

export const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];