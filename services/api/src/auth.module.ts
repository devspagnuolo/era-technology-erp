import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DatabaseModule } from "./database.module";
import { AuthController, AuthService } from "./auth";
@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32)
          throw new Error("Configure JWT_SECRET com pelo menos 32 caracteres");
        return {
          secret,
          signOptions: {
            expiresIn: "15m",
            issuer: "era-api",
            audience: "era-admin",
          },
          verifyOptions: { issuer: "era-api", audience: "era-admin" },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule],
})
export class AuthModule {}
