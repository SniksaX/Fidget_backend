//Backend/server/src/middleware/auth.ts
import { SanityClient } from "@sanity/client";
import bcrypt from "bcryptjs";
import passport from "passport";
import jwt from "jsonwebtoken";
import { SECRET_KEY1 } from "../../server";
import express, { Router, Request, Response, NextFunction } from "express";
import { createGnosisSafe } from '../controllers/blockchainController'; 
import { ethers } from "ethers";
import crypto from 'crypto';

import dotenv from "dotenv";
import { verifyJWT } from "./authMiddleware";

dotenv.config();

const router: Router = express.Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;
const IV_LENGTH = 16;
console.log(ENCRYPTION_KEY);

function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export default function Auth(sanity: SanityClient): Router {
  router.post("/userSignUp", async (req: Request, res: Response): Promise<void> => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "All fields are required: name, email, and password.", type: "missingFields" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters long.", type: "invalidPassword" });
      return;
    }
    try {
      const lowercaseEmail = email.toLowerCase();
      const userExists = await sanity.fetch('*[_type == "user" && email == $lowercaseEmail]', { lowercaseEmail });
      if (userExists.length > 0) {
        res.status(409).json({ error: "A user with this email already exists.", type: "userExists" });
        return;
      }

      const newWallet = ethers.Wallet.createRandom();
      const newEoaAddress = newWallet.address;
      const newPrivateKey = newWallet.privateKey;
      console.log(`[Wallet] Created new EOA for user ${email}: ${newEoaAddress}`);

      const encryptedPrivateKey = encrypt(newPrivateKey);
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUserDoc = {
        _type: "user", name, email: lowercaseEmail, password: hashedPassword,
        eoaAddress: newEoaAddress, encryptedPrivateKey: encryptedPrivateKey,
        gnosisSafeAddress: '', createdAt: new Date().toISOString(), subscriptionTier: 'free',
      };
      const createdUser = await sanity.create(newUserDoc);
      console.log(`[Sanity] User ${email} created with ID: ${createdUser._id}`);

      try {
        const { safeAddress, txHash } = await createGnosisSafe(newEoaAddress);
        
        await sanity.patch(createdUser._id).set({ gnosisSafeAddress: safeAddress, lastActivity: new Date().toISOString() }).commit();
        
        const transactionDoc = {
          _type: 'transaction', user: { _type: 'reference', _ref: createdUser._id }, txHash,
          type: 'safeCreated', fromAddress: "Fidg System", toAddress: safeAddress,
          status: 'success', timestamp: new Date().toISOString(),
          explorerLink: `https://sepolia.etherscan.io/tx/${txHash}`,
          description: `Fidg account and personal vault created for ${name}.`
        };
        await sanity.create(transactionDoc);
        console.log(`[Sanity] Logged 'safeCreated' transaction for user ${createdUser._id}`);

        try {
            const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL!);
            const deployerSigner = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
            const tx = await deployerSigner.sendTransaction({
                to: newEoaAddress,
                value: ethers.parseEther("0.01") 
            });
            await tx.wait();
            console.log(`[Gas] Funded user EOA ${newEoaAddress} with 0.01 ETH. Tx: ${tx.hash}`);
        } catch (gasError) {
            console.error(`!!! CRITICAL: Failed to send gas money to user EOA ${newEoaAddress}.`, gasError);
            
        }

      } catch (blockchainError: any) {
        console.error(`!!! CRITICAL: Blockchain setup failed for user ${email}. Manual cleanup may be needed.`, blockchainError);
        res.status(207).json({ 
            message: `User account created, but wallet setup failed. Please contact support.`,
            error: blockchainError.message 
        });
        return;
      }

      res.status(201).json({ message: `User registered and wallet created successfully.` });

    } catch (error: any) {
      console.error("User registration error:", error);
      res.status(500).json({ error: error.message || "Registration failed", type: "serverError" });
    }
  });
  
  router.post("/userLogin", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info.message || "Invalid credentials", type: "invalidCredentials" });
      
      const userAuth = { ID: user._id };
      const userInfo = { name: user.name, email: user.email, gnosisSafeAddress: user.gnosisSafeAddress };
      const token = jwt.sign(userAuth, SECRET_KEY1, { expiresIn: "24h" });

      res.cookie("token", token, { httpOnly: true, sameSite: "none", secure: true });
      return res.status(200).json({
        message: "Login successful.",
        userInfo: userInfo,
        token: token,
      });
    })(req, res, next);
  });

  router.post("/userLogout", (req, res) => {
    res.cookie("token", "", { expires: new Date(0), httpOnly: true });
    res.status(200).json({
      msg: "Logged out successfully",
      code: 200,
    });
  });

  router.get("/me", verifyJWT, async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = req.user?.ID;
        if (!userId) {
            return res.status(400).json({ error: "User ID not found in token." });
        }
        const user = await sanity.fetch('*[_type == "user" && _id == $userId][0]', { userId });
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }
        res.status(200).json({
            name: user.name,
            email: user.email,
            gnosisSafeAddress: user.gnosisSafeAddress,
            eoaAddress: user.eoaAddress,
            savingsBalance: user.savingsBalance,
            savingsStartDate: user.savingsStartDate,
        });
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).json({ error: "Server error while fetching user data." });
    }
  });

  return router;
}