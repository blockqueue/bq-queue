import env from "../env";
import { CorsOptions } from "cors";

const corsConfig: CorsOptions = {
  methods: ["POST", "OPTIONS", "GET"],
  allowedHeaders: ["Content-Type", "Authorization"],
  origin: env.ALLOWED_ORIGINS.split(","),
};

export { corsConfig };
