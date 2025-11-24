import express, { NextFunction, Request, Response } from "express";
import cors from "cors";

import "dotenv/config";
import env from "./env";
import { corsConfig } from "./configuration/cors";
import { routes } from "./routes";

const PORT = env.PORT;
const app = express();

app.use(cors(corsConfig));

app.use(routes);

app.use((_, res) => {
  res.status(404).send("Not Found");
});

app.use((err: unknown, _: Request, res: Response, __: NextFunction) => {
  console.error(err);
  res.status(500).send("Internal Server Error");
});

app.listen(PORT, () => {
  // replace with logger;
  console.log(`Scheduler Queue Service is running on port ${PORT}`);
});
