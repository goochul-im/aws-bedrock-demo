import { Controller, Post, Body } from '@nestjs/common';
import { ClaudeService } from './claude.service';

@Controller('claude')
export class ClaudeController {
  constructor(private readonly claudeService: ClaudeService) {}

  @Post()
  async askClaude(@Body('prompt') prompt: string) {
    const response = await this.claudeService.queryClaude(prompt);
    return { response };
  }

  @Post('summary')
  async askSummary(@Body('prompt') prompt: string) {
    const response = await this.claudeService.querySummary(prompt);
    return { response };
  }

  @Post('detail')
  async askDetail(@Body('prompt') prompt: string) {
    try {
      const response = await this.claudeService.queryDiaryPatterns(prompt);
      return { response };
    } catch (error) {
      throw new Error(`Detail analysis failed: ${error.message}`);
    }
  }
}
