import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from './claude.service';

describe('ClaudeService', () => {
  let service: ClaudeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClaudeService],
    }).compile();

    service = module.get<ClaudeService>(ClaudeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
