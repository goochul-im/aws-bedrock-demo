import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeController } from './claude.controller';
import { ClaudeService } from './claude.service';

describe('ClaudeController', () => {
  let controller: ClaudeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClaudeController],
      providers: [ClaudeService],
    }).compile();

    controller = module.get<ClaudeController>(ClaudeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
