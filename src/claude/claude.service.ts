import { Injectable } from '@nestjs/common';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClaudeService {
  private readonly client: BedrockRuntimeClient;

  constructor(private readonly configService: ConfigService) {
    // @ts-ignore
    this.client = new BedrockRuntimeClient({
      region: this.configService.get<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  private readonly promptRules = {
    rules: '다음 규칙을 준수하여 답변을 해줘.',
    rule1: '1. 일기에서 나오는 인물+ 그 인물에게 나타나는 감정을 추출',
    rule2: '2. 답변은 {"인물":"감정"} 형식으로만 답변, response를 붙일 필요 없음, 이외의 다른 답변은 절대 하지 말 것',
    rule3: '3. 한 사람에 대한 감정이 여러개면 한 사람에게 여러 감정을 넣기, 예를 들어 {"민수":["행복","기대","분노"]}',
    rule4: '4. 나타나는 감정은 다음 25가지 감정 리스트 중 선택해줘: [행복, 기쁨, 신남, 설렘, 기대, 자신감, 분노, 짜증, 불안, 초조, 슬픔, 당황, 지루, 속상, 무기력, 우울, 공허, 외로움, 지침, 평온, 안정, 차분, 편안, 감사, 무난]',
    rule5: '20자 내외로 일기를 요약해줘'
  };

  private preprocessPrompt(prompt: string): string {
// Add custom preprocessing logic here
// For example: Add context, formatting, or specific instructions
    return `${this.promptRules.rules} ${this.promptRules.rule1} ${this.promptRules.rule2} ${this.promptRules.rule3} ${this.promptRules.rule4}, 일기: ${prompt}`;
  }

  private summaryPrompt(prompt: string): string{
    return `${this.promptRules.rules} ${this.promptRules.rule5} 일기 : ${prompt}`
  }

  async querySummary(prompt: string): Promise<string> {
    const processedPrompt = this.summaryPrompt(prompt);

    const command = new InvokeModelCommand({
      modelId: 'apac.anthropic.claude-sonnet-4-20250514-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [
          { role: 'user', content: processedPrompt },
        ],
        max_tokens: 4000,
      }),
    });

    const response = await this.client.send(command);
    const body = await response.body.transformToString();
    const parsed = JSON.parse(body);

    return parsed?.content?.[0]?.text || 'No response';
  }

  async queryClaude(prompt: string): Promise<string> {
    const processedPrompt = this.preprocessPrompt(prompt);

    const command = new InvokeModelCommand({
      modelId: 'apac.anthropic.claude-sonnet-4-20250514-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [
          { role: 'user', content: processedPrompt },
        ],
        max_tokens: 4000,
      }),
    });

    const response = await this.client.send(command);
    const body = await response.body.transformToString();
    const parsed = JSON.parse(body);

    return parsed?.content?.[0]?.text || 'No response';
  }
}
