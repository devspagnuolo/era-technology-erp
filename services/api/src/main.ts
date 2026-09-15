import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureHttp } from "./http-config";
import { ExpressAdapter } from "./http-adapter";
async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  configureHttp(app);
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
