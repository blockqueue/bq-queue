import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().min(3000).max(10000).transform(String),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  POSTGRES_DATABASE_URL: z.string(),
  POSTGRES_DATABASE_PUBLIC_URL: z.string(),
  POSTGRES_SSL: z.string().default("false"),
  ALLOWED_ORIGINS: z.string().refine((value) => {
    return (
      value === "*" ||
      z.url().safeParse(value).success ||
      z.array(z.url()).safeParse(value.split(",")).success
    );
  }),
});

type EnvSchemaType = z.infer<typeof EnvSchema>;

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace NodeJS {
    interface ProcessEnv extends EnvSchemaType {}
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

const env: z.infer<typeof EnvSchema> = {
  PORT: Number(process.env.PORT).toString(),
  NODE_ENV: process.env.NODE_ENV || "development",

  POSTGRES_DATABASE_URL: process.env.POSTGRES_DATABASE_URL,
  POSTGRES_DATABASE_PUBLIC_URL: process.env.POSTGRES_DATABASE_PUBLIC_URL,
  POSTGRES_SSL: process.env.POSTGRES_SSL,

  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
};

EnvSchema.parse(env);

export default env;
