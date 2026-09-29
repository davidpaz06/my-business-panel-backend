import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from '@/contexts/general/modules/auth/auth.service';
import { AuthController } from '@/contexts/general/modules/auth/auth.controller';
import { UserModule } from '@/contexts/general/modules/user/user.module';
import { StateService } from '@/contexts/general/modules/state/state.service';
import { StateModule } from '../state/state.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [StateService],
      useFactory: async (stateService: StateService) => {
        await stateService.waitForInitialization();
        return {
          secret: stateService.getConstant<string>('JWT_ACCESS_SECRET'),
          signOptions: {
            expiresIn: stateService.getConstant('JWT_ACCESS_EXPIRATION'),
          },
        };
      },
    }),
    UserModule,
    StateModule,
  ],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
