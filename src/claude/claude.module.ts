import { Module } from '@nestjs/common';
import { ClaudeService } from './claude.service';
import { ClaudeController } from './claude.controller';

@Module({
  providers: [ClaudeService],
  controllers: [ClaudeController],
})
export class ClaudeModule {}
