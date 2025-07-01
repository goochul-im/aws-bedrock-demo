import { Injectable } from '@nestjs/common';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { ConfigService } from '@nestjs/config';
import { resolveNaptr } from 'dns';

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
    rule1: '1. 일기에서 나오는 인물이나 장소 + 내가 그 인물이나 장소에 느끼거나 받은 감정을 추출한다. 인물이나 장소 이외의 다른 것은 절대 추출하지 말 것',
    rule2: '2. 답변 예시는 {"민수":["분노"], "영희":["행복","기쁨]} 식으로',
    rule3: '3. json 형식을 그대로 사용할 것이기 때문에 예시 이외의 답변이나 추가 질문은 절대 하지 말 것',
    rule4: '4. 나 스스로에게 든 감정을 원인과 결과로 추출한다. 예를 들어, {"나":["미래에 대한", "불안"]}',
    rule5: '5. 나타나는 감정은 다음 25가지 감정 리스트 중 선택해줘, 이외의 감정은 절대 있으면 안되고, 오타가 나서도 안돼: [행복, 기쁨, 신남, 설렘, 기대, 자신감, 분노, 짜증, 불안, 초조, 슬픔, 당황, 지루, 속상, 무기력, 우울, 공허, 외로움, 지침, 평온, 안정, 차분, 편안, 감사, 무난]',
    // rule6: '20자 내외로 일기를 요약한 일기 제목을 만들어라. '
    rule6: '프롬프트를 따라라. '
  };

  private preprocessPrompt(prompt: string): string {
    return `${this.promptRules.rules} ${this.promptRules.rule1} ${this.promptRules.rule2} ${this.promptRules.rule3} ${this.promptRules.rule4} ${this.promptRules.rule5}, 일기: ${prompt}`;
  }

  private summaryPrompt(prompt: string): string{
    return `${this.promptRules.rules} ${this.promptRules.rule6} 일기 : ${prompt}`
  }

  private patternAnalysisPrompt(prompt: string): string {
    return `
# 당신은 일기에서 활동, 감정, 인물관계를 추출하는 전문가이다.

# 핵심 원칙 (우선순위 순)
1. **정확한 카테고리 매칭**: 감정(38개), 강점(24개), 약점(16개) 목록 내에서만 선택
2. **맥락 기반 추출**: 작성자 관점에서만 분석
3. **명확한 근거**: 추론 불가시 "None" 사용

# 필수 검증 체크리스트
- 활동: 직접적으로 한 실제 행동 (의도/바람 제외)
- 인물: 각 활동에 직접적으로 등장한 인물들만 있는지  
- 감정: 작성자가 해당 인물에게 느낀 감정만 (상황/대상 감정 제외)  
- 강점/약점: 해당 활동에서 등장한 강점/약점
- 문제: 이 문제(situation)가 **정말 이 활동 중에** 발생했는가?

# 활동 추출 규칙
- **모든 실제 행동** 추출 (중요도 무관)
- 업무, 개인, 사회적 활동 **모두 포함**
- 예시: 일하다, 수영하다, 회의하다, 요리하다, 대화하다 등

## 활동 식별 키워드
- 동사형: ~했다, ~을 하다, ~와 함께하다
- 활동명: 수영, 회의, 식사, 운동, 개발 등


# 문제(probelm) 추출 규칙
1. **문제는 해당 활동에서만 발생한 것**
2. 활동별 독립 분석: 수영의 문제 ≠ 업무의 문제
3. 시간적 맥락 고려: 언제 어떤 활동 중에 발생했는지

예시: "수영했다. 나중에 친구와 싸웠다" 
- 수영에 싸움 문제 매핑 (잘못됨)
- 활동1:수영(문제:없음) + 활동2:친구와 싸움(문제:싸움) (올바름)

## 문제 상황(situation) 추출
  - 맥락이 부정적인 경우에만 추출
  - 감정 기복은 추출하지 않음
  - 다음 키워드가 들어가면 문제 상황으로 인식함:
    어려웠다, 힘들었다, 문제가 생겼다, 갈등이, 싸웠다, 의견이 달랐다, 실패했다, 막혔다, 고민이다, 걱정이다, 스트레스 받았다, 화가 났다, 답답했다


## 문제 해결 방식(approach) 추출:
  - 문제의 해결을 위한 행동을 추출
  - 시간 순서상 문제 이후에 취한 행동
  예를 들어 
  * "~해서 문제가 생겼다" → 원인 (추출하지 않음)
  * "문제가 생겨서 ~했다" → 해결방식 (추출함)


# 감정 카테고리 (39개)
행복, 기쁨, 신남, 즐거움, 설렘, 유대, 신뢰, 존경, 시기, 친밀, 자신감, 서운, 평온, 안정, 편안, 소외, 불안, 실망, 기대, 속상, 상처, 감사, 무난, 차분, 긴장, 화남, 짜증, 무기력, 지침, 지루, 억울, 외로움, 우울, 공허, 초조, 부담, 어색, 불편, 불쾌


## 감정 강도 (emotion_intensity) 점수:
    - 기본: 4점
    - 강화 표현("너무", "정말"): +2점
    - 약화 표현("조금", "약간"): -2점  
    - 신체 반응 언급: +2점
    - 지속성 표현: +1점
    - 기본 5점에서 수정어 기준 적용
      - "너무너무" = "너무" x 2 = +4점 (총 9점 상한선 적용)

## 호칭 친밀도 (name_intimacy) 점수:
    - 애칭/별명: 1.0
    - 이름+친근호칭: 0.9
    - 이름만: 0.8
    - 성+직책: 0.4
    - 거리감 표현: 0.2

# 인물 추출:
  - 호칭어 제거: "민수형" → "민수"
  - 애칭은 원형 추정: "윤석쓰" → "윤석"
  - 동일 인물은 하나로 통합
  - 단체는 추출하지 않음.

# 강점 카테고리 (24개)  
창의성, 호기심, 판단력, 학습애, 통찰력, 용감함, 끈기, 정직함, 활력, 사랑, 친절함, 사회적지능, 팀워크, 공정함, 리더십, 용서, 겸손, 신중함, 자기조절, 미적감상, 감사, 희망, 유머, None

# 약점 카테고리 (16개)
충동성, 집중력부족, 미루기, 계획성부족, 건망증, 소통부족, 회피성향, 공감부족, 내향성과다, 방어적, 우유부단함, 경직성, 의존성향, 무책임, 완벽주의, None

# reflection 필드 정의
- achievements: 구체적 성과 (동사+명사)
- shortcomings: 구체적 부족한 점  
- tomorrow_mindset: **내일의 마음가짐/태도** (명사구)
- todo: 구체적 할 일 목록



# 출력 형식
{
  "activity_analysis": [
    {
      "activity": "활동 키워드",
      "problem": [{
        "situation": "문제 상황 서술 또는 None",
        "cause": "문제 원인 또는 None", 
        "approach": "문제 해결 위한 행동 또는 None",
        "outcome": "해결 결과나 현재 상태 또는 None"
      }],
      "strength": "강점 유형 또는 None",
      "weakness": "약점 유형 또는 None",
      "peoples": [{
        "name": "관련 인물명",
        "interactions": {
          "emotion": ["해당 인물에게 느낀 감정(감정 카테고리에서 선택)"],
          "emotion_intensity": [각 감정들의 강도 1-10]
        },
        "name_intimacy": "호칭 친밀도",
      }]
    }
  ],
  "reflection": {
    "achievements": ["성취1", "성취2"],
    "shortcomings": ["부족한점1", "부족한점2"], 
    "tomorrow_mindset": "내일의 태도",
    "todo": ["할일1", "할일2", "할일3"] 
  }
}

**필수 검증 리스트 다시 한번 더 체크 할 것**

일기: ${prompt}`;
  }

private resultAnalysis(result: string, ): string {
  return `
# 당신은 일기 분석 결과를 검증하고 규칙에 맞게 수정하는 검증자이다.
# JSON 형태를 유지하며 다음 순서로 검증하고 잘못된 부분을 수정하라.

## 목표
추출된 JSON을 받아서 규칙에 맞게 검증하고 수정하라.

## 검증 항목

## 1. 카테고리 검증 (강제 수정)
### 인물 검증
- 명확하게 이름/별명이 나오지 않은 인물은 제거. 예: "모자를 쓰신 분"
- 그룹은 제거. 예: "스터디 친구들"


### 강점 검증
강점 키워드(24개 중 선택): 창의성, 호기심, 판단력, 학습애, 통찰력, 용감함, 끈기, 정직함, 활력, 사랑, 친절함, 사회적지능, 팀워크, 공정함, 리더십, 용서, 겸손, 신중함, 자기조절, 미적감상, 감사, 희망, 유머, None
- 키워드 중 가장 가까운 약점으로 변환
**외에 다른 카테고리 사용 절대금지, 근거 부족시 None**

### 약점 수정
약점 키워드(16개 중 선택): 충동성, 집중력부족, 미루기, 계획성부족, 건망증, 소통부족, 회피성향, 공감부족, 내향성과다, 방어적, 우유부단함, 경직성, 의존성향, 무책임, 완벽주의, None
- 키워드 중 가장 가까운 약점으로 변환
**외에 다른 카테고리 사용 절대금지, 근거 부족시 None**

### 감정 수정
감정 키워드(39개 중 선택): 행복, 기쁨, 신남, 즐거움, 설렘, 유대, 신뢰, 존경, 시기, 친밀, 자신감, 서운, 평온, 안정, 편안, 소외, 불안, 실망, 기대, 속상, 상처, 감사, 무난, 차분, 긴장, 화남, 짜증, 무기력, 지침, 지루, 억울, 외로움, 우울, 공허, 초조, 부담, 어색, 불편, 불쾌
- 키워드 중 가장 가까운 감정으로 변환
  예시) "그리움" → "외로움"/"사랑" → "친밀"/ "흥미" → "기대"/ "웃김"->"즐거움" / "신나다"->"신남" / "긍정"->"행복" / "보고싶음" -> "슬픔"
**외에 다른 카테고리 사용 절대금지**

### 문제(problem) 수정
- situation "None"이면 problem의 모든 필드 "None" 
- approach가 "None" 이면 outcome 도 "None"

## 2. 텍스트 형식 검증 (강제 수정)
activity/situation/cause/approach/outcome/achievements/shortcomings/tomorrow_mindset/todo 필드를 다음 규칙으로 수정:
- "-다" 형태로 끝나는 문장 형태면 수정 
- **14자 이하 명사구**로 변환
- **접속사 완전 제거**: "및", "그리고", "하지만" 등
- **핵심 키워드만 추출**


일기 분석 결과: ${result}
`
}

async querySummary(prompt: string): Promise<string> {
  try {
    const processedPrompt = this.summaryPrompt(prompt);

    const command = new InvokeModelCommand({
      modelId: 'apac.amazon.nova-lite-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: [
          { role: 'user', content: [{ text: processedPrompt }] }
        ],
        inferenceConfig: {
          maxTokens: 4000,
          temperature: 0.7,
          topP: 0.9
        }
      }),
    });

      const response = await this.client.send(command);
      const body = await response.body.transformToString();
      const parsed = JSON.parse(body);

      return parsed?.output?.message?.content?.[0]?.text || 'No response';
    } catch (error) {
      console.error('Error in querySummary:', error);
      throw new Error(`Summary generation failed: ${error.message}`);
    }
  }

  async queryClaude(prompt: string): Promise<string> {
    try {
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

      // return parsed?.content?.[0]?.text || 'No response';
      return parsed?.content?.[0]?.outputText || 'No response';
    } catch (error) {
      console.error('Error in queryClaude:', error);
      throw new Error(`Claude query failed: ${error.message}`);
    }
  }

  // 패턴 분석 메서드 
  async queryDiaryPatterns(prompt: string): Promise<any> {
    try {

      const processedPrompt = this.patternAnalysisPrompt(prompt);

      const command = new InvokeModelCommand({
        modelId: 'apac.amazon.nova-lite-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          messages: [
            { role: 'user', content: [{ text: processedPrompt }] }
          ],
          inferenceConfig: {
            maxTokens: 4000,
            temperature: 0.05,
            topP: 0.9
          }
        }),
      });

      const response = await this.client.send(command);
      const body = await response.body.transformToString();
      const parsed = JSON.parse(body);

      let responseText = parsed?.output?.message?.content?.[0]?.text || 'No response';
      
      
      if (!responseText) {
        throw new Error('No response text received');
      }
      

      // console.log("before: ", responseText);
      const checkPrompt = this.resultAnalysis(responseText)
      const checkCommand = new InvokeModelCommand({
        modelId: 'apac.amazon.nova-lite-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          messages: [
            { role: 'user', content: [{ text: checkPrompt }] }
          ],
          inferenceConfig: {
            maxTokens: 4000,
            temperature: 0.05,
            topP: 0.9
          }
        }),
      });

      const checkedResponse = await this.client.send(checkCommand);
      const checkedBody = await checkedResponse.body.transformToString();
      const checkedParsed = JSON.parse(checkedBody);

      let finalResult = checkedParsed?.output?.message?.content?.[0]?.text || 'No response';
      
      
      if (!finalResult) {
        throw new Error('No response text received');
      }
      

      function cleanJsonResponse(text){
        // `````` 제거
        let cleaned = text.replace(/``````\s*$/g, '');
      
        // 앞뒤 공백 제거
        cleaned = cleaned.trim();
        
        // JSON 시작과 끝 확인
        const startIndex = cleaned.indexOf('{');
        const endIndex = cleaned.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1) {
          return cleaned.substring(startIndex, endIndex + 1);
        }
        
        return cleaned;
    }
    

      // 마크다운 형식 제거
      finalResult = cleanJsonResponse(finalResult);

      console.log('Raw response:', finalResult);


      const emotion_weights = {
        "행복": 1.0,
        "기쁨": 1.0,
        "신남": 1.0,
        "설렘": 0.95,
        "유대": 0.95,
        "신뢰": 0.95,
        "친밀": 0.9,
        "그리움":0.9,
        "자신감": 0.9,
        "서운": 0.8,
        "평온": 0.8,
        "안정": 0.8,
        "편안": 0.75,
        "소외": 0.65,
        "불안": 0.65,
        "실망": 0.65,
        "기대": 0.6,
        "속상": 0.6,
        "상처": 0.5,
        "감사": 0.5,
        "무난": 0.5,
        "차분": 0.5,
        "긴장": 0.45,
        "화남": 0.4,
        "짜증": 0.4,
        "무기력": 0.35,
        "지침": 0.3,
        "지루": 0.3,
        "억울": 0.3,
        "외로움": 0.25,
        "우울": 0.25,
        "공허": 0.2,
        "초조": 0.2,
        "부담": 0.15,
        "어색": 0.1,
        "불편": 0.05,
        "단절": 0.05
      };

    // 시간 간격을 숫자로 변환
    const time_mapping = {
      "all": 24,
      "most": 12,
      "some": 6,
      "little": 3,
      "moment": 1,
      "None": 0
    };

    function getEmotionWeight(emotion) {
      return emotion_weights[emotion] || 0.1; // 직접 접근으로 수정
  }
  
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch (error) {
        console.error('JSON parsing failed:', error);
        throw new Error('Invalid JSON response format');
      }
  
      // 심적 거리 계산 및 결과 추가
      if (parsedResponse?.peoples && Array.isArray(parsedResponse.peoples)) {
        parsedResponse.peoples.forEach((person) => {
          const interactions = person.interactions || {};
          
          const intensity = interactions.emotion_intensity || 0;
          const main_emotion = interactions.emotion || '';
          const sub_emotions = interactions.sub_emotions || [];
          const mentions = interactions.mentions || 1;
          const duration = interactions.duration || 'None';
          const similarity = person.social_similarity || [];
          
          const main_emotion_weight = getEmotionWeight(main_emotion);
          
          let avg_sub_emotion_weight = 0;
          if (sub_emotions && sub_emotions.length > 0) {
            const sub_emotion_weights = sub_emotions.map(getEmotionWeight);
            avg_sub_emotion_weight = sub_emotion_weights.reduce((a, b) => a + b, 0) / sub_emotion_weights.length;
          }
      
          const final_emotion_weight = main_emotion_weight * 0.7 + avg_sub_emotion_weight * 0.3;
          const duration_value = time_mapping[duration] || 0;
          const social_similarity_score = 
            similarity.name_intimacy * 0.3 +
            similarity.shared_activity * 0.2 +
            similarity.information_sharing * 0.2 +
            similarity.emotional_expression * 0.3;
      
          // 순서대로 감정 강도, 지속시간, 언급 빈도, 지속시간, 친밀도 
          const alpha = 1.0, beta = 0.4, gamma = 0.25, delta = 0.2, epsilon = 0.7;
      
          // 수정된 심적 거리 계산 공식
          const psychological_distance = 
            alpha * intensity * (1 - final_emotion_weight) +  // 좋은 감정일수록 거리 감소
            beta * Math.log(duration_value + 1) +
            gamma * (mentions > 0 ? Math.pow(mentions, -1) : 1) +
            delta * duration_value -                           // 지속시간은 거리 증가 요인
            epsilon * social_similarity_score;                 // 친밀도 높을수록 거리 감소
      
          // 심적 거리는 양수가 되도록 조정
          const final_psychological_distance = Math.max(0.1, psychological_distance);
      
          console.log(`=== ${person.name} ===`);
          console.log(`감정: ${main_emotion} (가중치: ${final_emotion_weight.toFixed(3)})`);
          console.log(`감정 강도: ${intensity}`);
          console.log(`언급 횟수: ${mentions}`);
          console.log(`사회적 유사성: ${social_similarity_score.toFixed(2)}`);
          console.log(`심적 거리: ${final_psychological_distance.toFixed(3)}`);
          console.log('---');
        });
      }

      return parsedResponse;
      return responseText;


    } catch (error) {
      console.error('Error in queryDiaryPatterns:', error);
      throw new Error(`Pattern analysis failed: ${error.message}`);
    }
  }
}
