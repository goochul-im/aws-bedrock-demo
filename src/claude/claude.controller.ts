import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ClaudeService } from './claude.service';

interface DetectGibberishRequest {
  text: string;
}

interface DetectGibberishResponse {
  text: string;
  prediction: string;
  confidence: number;
  is_clean: boolean;
}



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
  @Post('routine')
  async askRoutine(@Body('prompt') prompt: string) {
    try {
      const response = await this.claudeService.Routine(prompt);
      return { response };
    } catch (error) {
      throw new Error(`Routine analysis failed: ${error.message}`);
    }
  }

}
