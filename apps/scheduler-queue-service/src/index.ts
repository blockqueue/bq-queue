import express from "express";
import cors from "cors";

import "dotenv/config";
import env from "./env";
import { corsConfig } from "./configuration/cors";

const PORT = env.PORT;
const app = express();

app.use(cors(corsConfig));

app.get("/health", (_, res) => {
  res.status(200).send("OK");
});

app.listen(PORT, () => {
  // replace with logger;
  console.log(`Scheduler Queue Service is running on port ${PORT}`);
});
