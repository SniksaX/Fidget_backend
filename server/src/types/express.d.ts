export interface CustomJwtPayload {
  ID?: string;
  sessionId?: string;
  [key: string]: any;
}

declare global {
  namespace Express {
    interface Request {
      user?: CustomJwtPayload;
      sessionID?: string;
    }
  }
}

export {};