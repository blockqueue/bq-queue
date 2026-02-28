import "dotenv/config";

import express, { NextFunction, Request, Response } from "express";
import env from "./env";

const app = express();

app.listen(env.PORT, () => {
  // replace with logger;
  console.log(`Scheduler Queue Service is running on port ${PORT}`);
});
