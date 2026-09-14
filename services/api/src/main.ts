import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ExpressAdapter } from "./http-adapter";
async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  app.use(helmet());
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 60,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.enableCors({
    origin: process.env.ADMIN_ORIGIN ?? "http://localhost:3000",
  });
  app.setGlobalPrefix("v1");
  app.enableShutdownHooks();
  const config = new DocumentBuilder()
    .setTitle("ERA ERP")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  if (process.env.NODE_ENV !== "production")
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
  await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
}
void bootstrap();
