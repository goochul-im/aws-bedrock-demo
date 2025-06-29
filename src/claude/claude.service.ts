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

# 필수 규칙:
  - 다음 일기를 분석하여 순수 JSON 형식으로 정보를 추출하라.
  - 추출할 수 없는 정보, 또는 근거가 너무 부족한 정보에 대해서는 "None"으로 작성하시오. 근거 없는 추정은 금지. 명시적 증거가 있는 경우만 입력/점수 부여.

# 문제(problem) 추출 규칙
  1. 문제 관련 필드 출력 형식(situation, cause, approach)
  - 완전한 문장이 아닌 간결한 명사구 도는 키워드 형태로 추출
  - 복잡한 문장이나 접속사 사용 금지
  - 핵심 내용만 간략하게 표현 

  2. 문제 상황(situation) 추출 규칙
  - 전체 맥락이 부정적인 경우에만 추출
  - 감정 기복은 추출하지 않음
  - 다음 키워드가 들어가면 문제 상황으로 인식함:
    어려웠다, 힘들었다, 문제가 생겼다, 갈등이, 싸웠다, 의견이 달랐다, 실패했다, 막혔다, 고민이다, 걱정이다, 스트레스 받았다, 화가 났다, 답답했다
  - situation은 하나씩 

  3. 문제 해결 방식(approach) 추출 규칙:
    - 문제의 원인이 아닌 해결을 위한 행동을 추출
    - 시간 순서상 문제 이후에 취한 행동
      예를 들어 
      * "~해서 문제가 생겼다" → 원인 (추출하지 않음)
      * "문제가 생겨서 ~했다" → 해결방식 (추출함)

  4. 강점(strength) 카테고리 (24개 강점만 사용)
    창의성, 호기심, 판단력, 학습애, 통찰력, 용감함, 끈기, 정직함, 활력, 사랑, 친절함, 사회적지능, 팀워크, 공정함, 리더십, 용서, 겸손, 신중함, 자기조절, 미적감상, 감사, 희망, 유머, 영성
    **외에 다른 카테고리 사용 절대금지**

  5. 약점(weakness) 카테고리 (15개 약점만 사용, 외에는 절대 불가능 )
    충동성, 집중력부족, 미루기, 계획성부족, 건망증, 소통부족, 회피성향, 공감부족, 내향성과다, 방어적, 우유부단함, 경직성, 의존성향, 무책임, 완벽주의 
    **외에 다른 카테고리 사용 절대금지**


# 인물(peoples)추출 규칙
  1. 인물 추출
  - 호칭어 제거: "민수형" → "민수"
  - 애칭은 원형 추정: "윤석쓰" → "윤석"
  - 동일 인물은 하나로 통합
  - 단체는 추출하지 않음.

  2. 관계 유형 (8개 관계 유형만 사용)
  본인, 가족, 친구, 동료, 상사, 연인, 지인, 기타


# 상호작용(interactions) 추출 규칙
  1. 감정 분류 (39개 감정만 사용)
  [행복, 기쁨, 신남, 설렘, 유대, 신뢰, 존경, 시기, 친밀, 자신감, 서운, 평온, 안정, 편안, 소외, 불안, 실망, 기대, 속상, 상처, 감사, 무난, 차분, 긴장, 화남, 짜증, 무기력, 지침, 지루, 억울, 외로움, 우울, 공허, 초조, 부담, 어색, 불편, 불쾌]

  2. 변환 가이드
  - 그리움/보고싶음 → "외로움" 또는 "서운"
  - 흥미로움 → "기대" 또는 "기쁨"
  - 호기심 → "기대" 또는 "설렘"

  3. 감정 강도 (emotion_intensity) 점수:
    - 기본: 5점
    - 강화 표현("너무", "정말"): +2점
    - 약화 표현("조금", "약간"): -2점  
    - 신체 반응 언급: +2점
    - 지속성 표현: +1점
    - 기본 5점에서 수정어 기준 적용
      - "너무너무" = "너무" x 2 = +4점 (총 9점 상한선 적용)

  
  4. 호칭 친밀도 (name_intimacy) 점수:
    - 애칭/별명: 1.0
    - 이름+친근호칭: 0.9
    - 이름만: 0.8
    - 성+직책: 0.4
    - 거리감 표현: 0.2

# 회고 추출 규칙
  1. 출력 형식
  - 완전한 문장이 아닌 간결한 명사구 도는 키워드 형태로 추출
  - 복잡한 문장이나 접속사 사용 금지
  - 핵심 내용만 간략하게 표현 


# 출력 형식
{
  "activity_analysis": [
    {
      "activity": "활동 키워드",
      "problem": [{
        "situation": "발생한 문제 상황을 명확히 서술. 없으면 None",
        "cause": "문제의 원인이나 배경. 사용자가 인식한 원인. 없으면 None", 
        "approach": "문제 해결을 위해 실제로 취한 행동. 없으면 None",
        "outcome": "해결 결과나 현재 상태. 없으면 None"
      }],
      "strength": "강점 유형(창의성, 호기심, 판단력, 학습애, 통찰력, 용감함, 끈기, 정직함, 활력, 사랑, 친절함, 사회적 지능, 팀워크, 공정함, 리더십, 용서, 겸손, 신중함, 자기조절, 미적감상, 감사, 희망, 유머, 영성)",
      "weakness": "약점 유형(    충동성, 집중력부족, 미루기, 계획성부족, 건망증, 소통부족, 회피성향, 공감부족, 내향성과다, 방어적, 우유부단함, 경직성, 의존성향, 무책임, 완벽주의 )",
      "peoples": [{
        "name": "본인을 제외한 관련 인물. 없다면 본인 ",
        "relationship_type": "관계 유형(본인, 가족, 친구, 동료, 상사, 연인, 이웃, 지인, 기타 중 하나)",
        "interactions": {
          "emotion": "[감정들(행복, 기쁨, 신남, 설렘, 유대, 신뢰, 존경, 시기, 친밀, 자신감, 서운, 평온, 안정, 편안, 소외, 불안, 실망, 기대, 속상, 상처, 감사, 무난, 차분, 긴장, 화남, 짜증, 무기력, 지침, 지루, 억울, 외로움, 우울, 공허, 초조, 부담, 어색, 불편, 불쾌)]",
          "emotion_intensity": "[각 감정들의 강도 1-10]"
        },
        "social_similarity": {
          "name_intimacy": "호칭 친밀도 0-1",
          "emotional_expression": "상세한 감정 서술 VS 단순한 언급 0-1"
        }
      }]
    }
  ],
  "reflection":{
    "achievements": "잘한 점",
    "shortcomings": "못한 점",
    "tomorrow_mindset": "내일의 태도",
    "todo": ["내일 할 일"]
  }
}

일기: ${prompt}`;
  }

private resultAnalysis(result: string): string {
  return `
# 당신은 일기 분석 결과를 검증하고 규칙에 맞게 수정하는 검증자이다.
# JSON 형태를 유지하며 다음 순서로 검증하고 잘못된 부분을 수정하라.

## 1순위: 카테고리 검증 (절대 준수)

### 감정 검증
- 39개 카테고리만 사용: 행복, 기쁨, 신남, 설렘, 유대, 신뢰, 존경, 시기, 친밀, 자신감, 서운, 평온, 안정, 편안, 소외, 불안, 실망, 기대, 속상, 상처, 감사, 무난, 차분, 긴장, 화남, 짜증, 무기력, 지침, 지루, 억울, 외로움, 우울, 공허, 초조, 부담, 어색, 불편, 불쾌
- 금지 감정("그리움", "사랑", "미움", "관찰" 등) 사용 시 → 자동 변환:
  * "그리움" → "외로움", "사랑" → "친밀", "흥미" → "기대"

### 강점(strength) 검증  
강점 필드는 반드시 다음 중 하나만 입력:
창의성 | 호기심 | 판단력 | 학습애 | 통찰력 | 용감함 | 끈기 | 정직함 | 활력 | 사랑 | 친절함 | 사회적 지능 | 팀워크 | 공정함 | 리더십 | 용서 | 겸손 | 신중함 | 자기조절 | 미적감상 | 감사 | 희망 | 유머 | 영성
**다른 값 절대 금지. 위 9개 + None 외 입력시 오류로 간주**

### 약점(weakness) 검증
weakness 필드는 반드시 다음 중 하나만 입력:
충동성 | 집중력부족 | 미루기 | 계획성부족 | 건망증 | 소통부족 | 회피성향 | 공감부족 | 내향성과다 | 방어적 | 우유부단함 | 경직성 | 의존성향 | 무책임 | 완벽주의 
**다른 값 절대 금지. 위 15개 + None 외 입력시 오류로 간주**

## 2순위: 문제 식별 검증

### 문제 상황 검증
- 다음 키워드 없으면 무조건 "None": 어려웠다, 힘들었다, 문제가 생겼다, 갈등이, 싸웠다, 실패했다, 막혔다, 고민이다, 걱정이다, 답답했다
- 단순 사실("못했다", "안됐다")이나 감정 기복은 문제가 아님

### 문제-해결책 연결
- situation이 "None"이면 approach도 "None"
- approach는 문제 해결 행동만 추출 (원인 제외)

## 3순위: 강점/약점 누락 검증

### 강점 추출 확인
다음 표현 있을 시 강점 추출 필수:
- 긍정적 행동: 도움을 주다, 친절하게, 차분하게 → "친절함", "자기조절"
- 성공적 대처: 잘 해결하다, 극복하다, 꾸준히 → "끈기", "용감함"  
- 학습/성장: 배우다, 성찰하다, 호기심 → "학습애", "통찰력", "호기심"

### 약점 추출 확인
다음 표현 있을 시 약점 추출 고려:
- 충동적 행동: 갑자기, 참지 못해서 → "충동성"
- 이기적 행동: 나만 생각해서 → "이기주의"

## 4순위: 기타 검증

### 인물 추출
- 호칭어 제거: "민수형" → "민수"
- 애칭 원형 추정: "윤석쓰" → "윤석"
- 동일 인물 통합 확인

### 출력 형식 통일
- 모든 텍스트 필드를 간결한 명사구로 변경
- 문장, 접속사 사용 금지
- activity, problem 관련 필드, reflection 모두 키워드 형태


# 최종검증
  - 감정이 39개 카테고리 중 하나인가?
  - strength가 24개 카테고리 중 하나인가?
  - weakness가 15개 카테고리 중 하나인가?

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
            temperature: 0.7,
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
            temperature: 0.1,
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
