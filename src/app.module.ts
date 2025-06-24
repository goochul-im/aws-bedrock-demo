import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClaudeModule } from './claude/claude.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,
    envFilePath: '.env',
  })
    ,ClaudeModule],
  controllers: [AppController, ],
  providers: [AppService, ],
})
export class AppModule {}
