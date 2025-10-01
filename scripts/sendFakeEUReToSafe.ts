import { ethers } from "ethers"; 
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    
    const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY!;
    const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL!;
    
    const FAKE_EURE_TOKEN_ADDRESS = "0x97E3e8966542c7CE75E25727B9bf6c7ae2E398B7"; 
    const TARGET_SAFE_ADDRESS = "0xbF58cBBc71DeAEf7F83C2E27169a4DF660B83492";           

    if (!DEPLOYER_PRIVATE_KEY || !SEPOLIA_RPC_URL || !FAKE_EURE_TOKEN_ADDRESS || !TARGET_SAFE_ADDRESS) {
        console.error("Missing environment variables or addresses. Please check your .env and update script/sendFakeEUReToSafe.ts.");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const deployerSigner = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

    console.log(`Sending FakeEURe from: ${deployerSigner.address}`);
    console.log(`To Gnosis Safe: ${TARGET_SAFE_ADDRESS}`);

    
    const erc20Abi = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function decimals() view returns (uint8)", 
        "function symbol() view returns (string)"   
    ];
    
    const fakeEUReContract = new ethers.Contract(
        FAKE_EURE_TOKEN_ADDRESS,
        erc20Abi,
        deployerSigner 
    );
    
    const decimals = await fakeEUReContract.decimals();
    const symbol = await fakeEUReContract.symbol();

    const amountToSend = ethers.parseUnits("2000", decimals); 
    console.log(`Attempting to send ${ethers.formatUnits(amountToSend, decimals)} ${symbol}...`);

    try {
        const tx = await fakeEUReContract.transfer(TARGET_SAFE_ADDRESS, amountToSend);
        console.log("Transaction sent:", tx.hash);
        const receipt = await tx.wait();
        if (receipt && receipt.status === 1) {
            console.log("Transaction confirmed successfully!");
            console.log(`${ethers.formatUnits(amountToSend, decimals)} ${symbol} transferred to Safe: ${TARGET_SAFE_ADDRESS}`);
        } else {
            console.error("Transaction failed or was not confirmed.");
            console.error("Receipt:", receipt); 
        }
    } catch (error: any) {
        console.error("Error sending FakeEURe:", error.message);
    }
}

main().catch((error) => {
    console.error("Unhandled error in sendFakeEUReToSafe:", error);
    process.exit(1);
});