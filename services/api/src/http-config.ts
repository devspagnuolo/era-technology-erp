import type { INestApplication } from "@nestjs/common";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
export function configureHttp(
  app: INestApplication,
  env: NodeJS.ProcessEnv = process.env,
) {
  const proxyHops = Number(env.TRUST_PROXY_HOPS ?? "0");
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 3)
    throw new Error("TRUST_PROXY_HOPS deve ser um inteiro entre 0 e 3");
  app.getHttpAdapter().getInstance().set("trust proxy", proxyHops);
  app.use(helmet());
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: (request) => request.path === "/v1/health",
    }),
  );
  app.enableCors({
    origin:
      env.ADMIN_ORIGIN ??
      (env.NODE_ENV === "production" ? false : "http://localhost:3000"),
  });
  app.setGlobalPrefix("v1");
}
