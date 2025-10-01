import express, { Application, Request, Response } from "express";
import cors from "cors";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

import { createClient, SanityClient } from "@sanity/client";
import router from "./src/routes/router";


dotenv.config();

const app: Application = express();
const port: number = 4000;

export const API_KEY_SANITY: string = process.env.API_KEY_SANITY || "";
export const PROJECT_ID_SANITY: string = process.env.PROJECT_ID_SANITY || "";
export const SECRET_KEY1: string = process.env.SECRET_KEY1 || "";

const sanity: SanityClient = createClient({
  projectId: PROJECT_ID_SANITY,
  dataset: "production",
  apiVersion: "2025-06-07",
  token: API_KEY_SANITY,
  useCdn: false,
});

app.use(
  cors({
    origin: [
      "http://localhost:3000",
    ],
    credentials: true,
    exposedHeaders: ["Set-Cookie"],
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

passport.serializeUser((user: any, done: any) => {
  done(null, user.email);
});

passport.deserializeUser(async (email: string, done: any) => {
  try {
    const user = await sanity.fetch(
      '*[_type == "userData" && email == $email][0]',
      { email }
    );
    if (!user) {
      return done(new Error("User not found"), null);
    }
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
});

passport.use(
  "local",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
      passReqToCallback: true,
    },
    async (req: Request, email: string, password: string, done: any) => {
      const lowercaseEmail = email.toLowerCase();
      try {
        const user = await sanity.fetch(
          '*[_type == "user" && email == $lowercaseEmail][0]',
          { lowercaseEmail }
        );
        if (!user || !(await bcrypt.compare(password, user.password))) {
          return done(null, false, { message: "Invalid email or password" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

app.use("/api", router(sanity));

app.listen(port, () => {
    console.log("Server running on port :", port)
})

export default sanity;