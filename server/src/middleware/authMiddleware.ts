import express, { Router, NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const router: Router = express.Router();

export const verifyJWT = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token;

  if (!token) {
    res.status(403).json({ msg: "Access Denied: No token provided", code: 403 });
    return; 
  }

  jwt.verify(token, process.env.SECRET_KEY1 || "", (err: any, decoded: any) => {
    if (err) {
        res.status(403).json({ msg: "Access Denied: Invalid token", code: 403 });
      return; 
    }

    req.user = decoded;
    next();
  });
};


export const verifySession = (req: Request, res: Response, next: NextFunction) => {
  const sessionToken = req.cookies.sessionToken;

  if (!sessionToken) {
    return res
      .status(403)
      .json({ msg: "Access Denied: No sessionToken provided", code: 403 });
  }

  jwt.verify(sessionToken, process.env.SECRET_KEY1 || "", (err: any, decoded: any) => {
    if (err) {
      return res
        .status(403)
        .json({ msg: "Access Denied: Invalid sessionToken", code: 403 });
    }

    res.locals.sessionID = decoded.sessionId; 
    next();
  });
};


export function authRouter(): Router {
  const router: Router = express.Router();

  router.post("/isVerified", async (req: Request, res: Response): Promise<any> => {
    const token = req.headers.authorization?.split(" ")[1];
    console.log(token)
    if (!token) {
      return res
        .status(403)
        .json({ msg: "Access Denied: No token provided", code: 403 });
    }

    jwt.verify(token, process.env.SECRET_KEY1 || "", (err: any, decoded: any) => {
      if (err) {
        return res
          .status(403)
          .json({ msg: "Access Denied: Invalid token", code: 403 });
      }
      return res.status(200).json({ msg: "Access granted" });
    });
  });

  return router;
}

export function getID(token: any): string | null {
  let userId: string | null = null;

  if (!token) {
    console.error("No Token");
    return null;
  }

  jwt.verify(token, process.env.SECRET_KEY1 || "", (err: any, decoded: any) => {
    if (err) {
      console.error("Invalid Token");
      return;
    }
    userId = decoded.ID || null;
  });

  return userId;
}