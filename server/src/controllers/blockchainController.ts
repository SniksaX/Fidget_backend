import { Request, Response } from 'express';
import { ethers } from 'ethers';
import Safe, { SafeAccountConfig, SafeDeploymentConfig, PredictedSafeProps } from '@safe-global/protocol-kit';
import { SanityClient } from '@sanity/client';

const SPIKO_SIMULATION_ADDRESS = '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4';

import { decrypt } from '../middleware/auth';

export async function createGnosisSafe(ownerAddress: string): Promise<{ safeAddress: string; txHash: string }> {
  try {
    if (!ethers.isAddress(ownerAddress)) {
      throw new Error('Invalid ownerAddress provided for Safe creation.');
    }
    const rpcUrl = process.env.SEPOLIA_RPC_URL!;
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY!;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const deployerSigner = new ethers.Wallet(privateKey, provider);
    console.log(`[Safe] Using deployer address: ${deployerSigner.address} to create Safe for owner: ${ownerAddress}`);
    const safeAccountConfig: SafeAccountConfig = { owners: [ownerAddress], threshold: 1 };
    const safeDeploymentConfig: SafeDeploymentConfig = { saltNonce: Date.now().toString() };
    const predictedSafe: PredictedSafeProps = { safeAccountConfig, safeDeploymentConfig };
    const protocolKit = await Safe.init({ provider: rpcUrl, signer: privateKey, predictedSafe });
    const predictedSafeAddress = await protocolKit.getAddress();
    console.log(`[Safe] Predicted Safe Address: ${predictedSafeAddress}`);
    const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();
    const transactionResponse = await deployerSigner.sendTransaction({
      to: deploymentTransaction.to,
      value: BigInt(deploymentTransaction.value),
      data: deploymentTransaction.data,
      gasLimit: 2000000 
    });
    const transactionReceipt = await transactionResponse.wait();
    if (!transactionReceipt || transactionReceipt.status !== 1) {
      throw new Error('Transaction failed to be mined or was not successful.');
    }
    console.log(`✅ [Safe] Deployed successfully! Address: ${predictedSafeAddress}, Tx: ${transactionReceipt.hash}`);
    return { safeAddress: predictedSafeAddress, txHash: transactionReceipt.hash };
  } catch (error: any) {
    console.error('Error creating Gnosis Safe:', error);
    throw new Error('Failed to deploy Gnosis Safe.');
  }
}

export function createBlockchainController(sanity: SanityClient) {
  return {
    
    getFakeEUReBalance: async (req: Request, res: Response) => {
        const { safeAddress } = req.body;
        if (!safeAddress || !ethers.isAddress(safeAddress)) {
            res.status(400).json({ error: 'Valid safeAddress is required.' });
            return;
        }
        const FAKEEURE_TOKEN_ADDRESS = process.env.FAKEEURE_TOKEN_ADDRESS;
        if (!FAKEEURE_TOKEN_ADDRESS) {
             res.status(500).json({ error: 'FakeEURe token address not configured on server.' });
             return;
        }
        try {
            const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL!);
            const ERC20_ABI = ["function balanceOf(address account) view returns (uint256)", "function decimals() view returns (uint8)"];
            const fakeEUReContract = new ethers.Contract(FAKEEURE_TOKEN_ADDRESS, ERC20_ABI, provider);
            const balanceBigInt = await fakeEUReContract.balanceOf(safeAddress);
            const decimals = await fakeEUReContract.decimals();
            const balance = ethers.formatUnits(balanceBigInt, decimals);
            res.status(200).json({ balance: balance });
        } catch (error: any) {
            console.error(`Error getting FakeEURe balance for ${safeAddress}:`, error);
            res.status(500).json({ error: 'Failed to retrieve FakeEURe balance.' });
        }
    },

    sendFunds: async (req: Request, res: Response) => {
        const { recipientAddress, amount } = req.body;
        const userId = req.user?.ID;

        if (!userId) {}
        if (!recipientAddress || !ethers.isAddress(recipientAddress) || !amount || isNaN(Number(amount)) || Number(amount) <= 0) { /* ... validation ... */ }

        try {
            const user = await sanity.fetch('*[_type == "user" && _id == $userId][0]', { userId });
            if (!user || !user.encryptedPrivateKey || !user.gnosisSafeAddress) { /* ... validation ... */ }

            const userPrivateKey = decrypt(user.encryptedPrivateKey);

            const safeSdk = await Safe.init({
                provider: process.env.SEPOLIA_RPC_URL!,
                signer: userPrivateKey,
                safeAddress: user.gnosisSafeAddress
            });
            console.log(`[Send] Initialized SDK for Safe ${user.gnosisSafeAddress}`);

            const FAKEEURE_TOKEN_ADDRESS = process.env.FAKEEURE_TOKEN_ADDRESS!;
            const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL!);
            const erc20Abi = ["function transfer(address to, uint256 amount)", "function decimals() view returns (uint8)"];
            const fakeEUReContract = new ethers.Contract(FAKEEURE_TOKEN_ADDRESS, erc20Abi, provider);
            const decimals = await fakeEUReContract.decimals();
            const amountToSend = ethers.parseUnits(amount.toString(), decimals);

            const safeTransactionData = {
                to: FAKEEURE_TOKEN_ADDRESS, value: '0',
                data: fakeEUReContract.interface.encodeFunctionData('transfer', [recipientAddress, amountToSend]),
            };
            
            const safeTransaction = await safeSdk.createTransaction({ transactions: [safeTransactionData] });
            const signedSafeTx = await safeSdk.signTransaction(safeTransaction);
            const txResponse = await safeSdk.executeTransaction(signedSafeTx);

            const txHash = txResponse.hash;
            console.log(`[Send] Transaction sent to blockchain with hash: ${txHash}`);

            const receipt = await provider.waitForTransaction(txHash);
            
            if (!receipt || receipt.status !== 1) {
                throw new Error("Transaction failed on-chain.");
            }

            console.log(`[Send] Successfully sent ${amount} FEURE to ${recipientAddress}. Tx: ${receipt.hash}`);

            const transactionDoc = {
                _type: 'transaction', user: { _type: 'reference', _ref: user._id }, txHash: receipt.hash,
                type: 'sendFunds', amount: Number(amount), currency: 'FEURE', fromAddress: user.gnosisSafeAddress,
                toAddress: recipientAddress, status: 'success', timestamp: new Date().toISOString(),
                explorerLink: `https://sepolia.etherscan.io/tx/${receipt.hash}`,
                description: `Sent ${amount} FEURE to ${recipientAddress.slice(0,6)}...`
            };
            await sanity.create(transactionDoc);
            
            res.status(200).json({ message: "Transaction successful!", transactionHash: receipt.hash });

        } catch (error: any) {
            console.error("[Send] Error sending funds:", error);
            res.status(500).json({ error: "Failed to send funds.", details: error.message });
        }
    },

    getTransactions: async (req: Request, res: Response) => {
      const userId = req.user?.ID;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized. User not found in token." });
      }

      try {
        const query = `*[_type == "transaction" && user._ref == $userId] | order(timestamp desc)`;
        const params = { userId };

        const transactions = await sanity.fetch(query, params);

        res.status(200).json(transactions);
      } catch (error: any) {
        console.error("[Get Transactions] Error fetching activity feed:", error);
        res.status(500).json({ error: "Failed to retrieve transaction history." });
      }
    },

    investInSavings: async (req: Request, res: Response) => {
      const { amount } = req.body;
      const userId = req.user?.ID;

      if (!userId) { return res.status(401).json({ error: "Unauthorized." }); }
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
          return res.status(400).json({ error: "A valid amount is required." });
      }

      try {
          const user = await sanity.fetch('*[_type == "user" && _id == $userId][0]', { userId });
          if (!user || !user.encryptedPrivateKey || !user.gnosisSafeAddress) {
              return res.status(404).json({ error: "User wallet information not found." });
          }

          const userPrivateKey = decrypt(user.encryptedPrivateKey);
          const safeSdk = await Safe.init({ provider: process.env.SEPOLIA_RPC_URL!, signer: userPrivateKey, safeAddress: user.gnosisSafeAddress });
          const FAKEEURE_TOKEN_ADDRESS = process.env.FAKEEURE_TOKEN_ADDRESS!;
          const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL!);
          const erc20Abi = ["function transfer(address to, uint256 amount)", "function decimals() view returns (uint8)"];
          const fakeEUReContract = new ethers.Contract(FAKEEURE_TOKEN_ADDRESS, erc20Abi, provider);
          const decimals = await fakeEUReContract.decimals();
          const amountToSend = ethers.parseUnits(amount.toString(), decimals);

          const safeTransactionData = {
              to: FAKEEURE_TOKEN_ADDRESS, value: '0',
              data: fakeEUReContract.interface.encodeFunctionData('transfer', [SPIKO_SIMULATION_ADDRESS, amountToSend]),
          };
          
          const safeTransaction = await safeSdk.createTransaction({ transactions: [safeTransactionData] });
          const signedSafeTx = await safeSdk.signTransaction(safeTransaction);
          const txResponse = await safeSdk.executeTransaction(signedSafeTx);
          const receipt = await provider.waitForTransaction(txResponse.hash);
          
          if (!receipt || receipt.status !== 1) {
              throw new Error("Transaction failed on-chain.");
          }

          console.log(`[Invest] Successfully sent ${amount} FEURE to Spiko address. Tx: ${receipt.hash}`);

          const currentSavings = user.savingsBalance || 0;
          const newSavingsBalance = currentSavings + Number(amount);
          const currentDeposited = user.totalDeposited || 0; 
          const patch = sanity.patch(user._id).set({ savingsBalance: newSavingsBalance,  totalDeposited: currentDeposited + Number(amount) });
          if (currentSavings === 0) {
              console.log(`[Invest] This is the first deposit. Setting savingsStartDate.`);
              patch.set({ savingsStartDate: new Date().toISOString() });
          }
          await patch.commit();
          console.log(`[Sanity] Updated savingsBalance for user ${user._id} to ${newSavingsBalance}`);

          const transactionDoc = {
              _type: 'transaction', user: { _type: 'reference', _ref: user._id }, txHash: receipt.hash,
              type: 'investSavings', amount: Number(amount), currency: 'FEURE', fromAddress: user.gnosisSafeAddress,
              toAddress: SPIKO_SIMULATION_ADDRESS, status: 'success', timestamp: new Date().toISOString(),
              explorerLink: `https://sepolia.etherscan.io/tx/${receipt.hash}`,
              description: `Deposited ${amount} FEURE to Fidg Savings.`
          };
          await sanity.create(transactionDoc);
          
          res.status(200).json({ message: "Investment successful!", transactionHash: receipt.hash, newSavingsBalance });

      } catch (error: any) {
          console.error("[Invest] Error investing funds:", error);
          res.status(500).json({ error: "Failed to invest funds.", details: error.message });
      }
    },

    withdrawFromSavings: async (req: Request, res: Response) => {
      const { amount } = req.body;
      const userId = req.user?.ID;

      if (!userId) { return res.status(401).json({ error: "Unauthorized." }); }
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
          return res.status(400).json({ error: "A valid amount is required." });
      }
      try {
          const user = await sanity.fetch('*[_type == "user" && _id == $userId][0]', { userId });
          if (!user || !user.gnosisSafeAddress) { return res.status(404).json({ error: "User not found." }); }

          const currentSavings = user.savingsBalance || 0;
          const withdrawAmount = Number(amount);

          if (withdrawAmount > currentSavings) {
              return res.status(400).json({ error: "Withdrawal amount exceeds savings balance." });
          }
          const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL!);
          const deployerSigner = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
          const FAKEEURE_TOKEN_ADDRESS = process.env.FAKEEURE_TOKEN_ADDRESS!;
          
          const erc20Abi = ["function transfer(address to, uint256 amount)", "function decimals() view returns (uint8)"];
          const fakeEUReContract = new ethers.Contract(FAKEEURE_TOKEN_ADDRESS, erc20Abi, deployerSigner);
          const decimals = await fakeEUReContract.decimals();
          const amountToSend = ethers.parseUnits(amount.toString(), decimals);

          console.log(`[Withdraw] System sending ${amount} FEURE from ${deployerSigner.address} to user's Safe ${user.gnosisSafeAddress}`);
          
          const txResponse = await fakeEUReContract.transfer(user.gnosisSafeAddress, amountToSend);
          const receipt = await txResponse.wait();

          if (!receipt || receipt.status !== 1) {
              throw new Error("On-chain withdrawal transfer failed.");
          }
          console.log(`[Withdraw] On-chain transfer successful. Tx: ${receipt.hash}`);

          const newSavingsBalance = currentSavings - withdrawAmount;
          const currentWithdrawn = user.totalWithdrawn || 0;
          await sanity.patch(user._id).set({
              savingsBalance: newSavingsBalance,
              totalWithdrawn: currentWithdrawn + withdrawAmount
            }).commit();

          console.log(`[Withdraw] User ${userId} withdrew ${withdrawAmount}. New savings balance: ${newSavingsBalance}`);

          const transactionDoc = {
              _type: 'transaction',
              user: { _type: 'reference', _ref: user._id },
              txHash: receipt.hash, 
              type: 'withdrawSavings',
              amount: withdrawAmount,
              currency: 'FEURE',
              fromAddress: 'Fidg Savings', 
              toAddress: user.gnosisSafeAddress, 
              status: 'success',
              timestamp: new Date().toISOString(),
              description: `Withdrew ${withdrawAmount} FEURE from Fidg Savings.`,
              explorerLink: `https://sepolia.etherscan.io/tx/${receipt.hash}`,
          };
          await sanity.create(transactionDoc);
          
          res.status(200).json({ 
              message: "Withdrawal successful!", 
              newSavingsBalance: newSavingsBalance,
              transactionHash: receipt.hash, 
          });

      } catch (error: any) {
          console.error("[Withdraw] Error processing withdrawal:", error);
          res.status(500).json({ error: "Failed to process withdrawal.", details: error.message });
      }
    }
  };
}