import express, { Router } from "express";
import { SanityClient } from "@sanity/client";
import { verifyJWT } from "../middleware/authMiddleware";
import Auth from "../middleware/auth";

import { createBlockchainController } from '../controllers/blockchainController';
import { getMoneriumTokens, getMoneriumSafeBalance } from '../controllers/moneriumController';
import { createUserController } from "../controllers/userController";

const router: Router = express.Router();

export default function createRouter(sanity: SanityClient): Router {
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  const blockchainController = createBlockchainController(sanity);
  const userController = createUserController(sanity);

  router.use("/auth", Auth(sanity));


  const blockchainRouter = Router();
  blockchainRouter.post("/get-fake-eure-balance", blockchainController.getFakeEUReBalance);
  blockchainRouter.post("/send-funds", blockchainController.sendFunds); 
  blockchainRouter.get("/get-transactions", blockchainController.getTransactions);
  blockchainRouter.post("/invest-in-savings", blockchainController.investInSavings);
  blockchainRouter.post("/withdraw-from-savings", blockchainController.withdrawFromSavings);
  router.use("/blockchain", verifyJWT, blockchainRouter);


  const moneriumRouter = Router();
  moneriumRouter.get("/tokens", getMoneriumTokens);
  moneriumRouter.post("/get-safe-balance", getMoneriumSafeBalance);
  router.use("/monerium", verifyJWT, moneriumRouter);

  // user stuff
  const userRouter = Router();


  router.all("*", async (req, res) => {
    res.status(404).json({
      timestamp: Date.now(),
      msg: "Route not found",
      code: 404,
    });
  });

  return router;
}