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
1. 다음 기준을 엄격히 적용하라:
2. 다음의 일기를 분석하여 아래 JSON 형식으로 정확히 응답해라. 다른 설명 없이 JSON만 반환하라. 
3. 감정 추출 정확성 검증:
    
  A) 감정의 대상 명확화:
    - "A에게 실망했다" ≠ "A가 보고싶다"
    - 그리움, 보고싶음 → "외로움" 또는 "서운"으로 분류
    - 자기 자신에 대한 감정과 타인에 대한 감정 구분

  B) 37개 감정 리스트 엄격 준수:
    [행복, 기쁨, 신남, 설렘, 유대, 신뢰, 친밀, 자신감, 서운, 평온, 안정, 편안, 소외, 불안, 실망, 기대, 속상, 상처, 감사, 무난, 차분, 긴장, 화남, 짜증, 무기력, 지침, 지루, 억울, 외로움, 우울, 공허, 초조, 부담, 어색, 불편, 단절]
    - "어려움", "아쉬움", "흥미", "호기심", "그리움", "사랑", "미움" 등 리스트 외 감정 사용 금지
    - 의미상 가장 가까운 리스트 내 감정으로 변환

  C) 감정 변환 가이드:
    - 흥미로움 → "기대" 또는 "기쁨"
    - 호기심 → "기대" 또는 "설렘"  
    - 그리움 → "외로움" 또는 "서운"

  D) 출력 전 최종 검증:
    모든 emotion과 sub_emotions이 36개 리스트에 포함되는지 반드시 확인

  E) 언급 횟수 정확한 계산:
    - 동일 인물의 이름이 직접 언급된 횟수만 계산
    - "애들", "친구들" 등 집합 표현은 개별 계산 불가
    - 대명사나 간접 언급은 제외

4. 인물 이름 추출:

  A) 감정 대상 명확히:
    - 호칭어 제거: "민수형" → "민수", "수빈언니"->"수빈", "구철씨"->"구철"
    - 소유격 제거: "지영이네" → "지영"  
    - 애칭은 원형 추정: "윤석쓰" → "윤석"
    - 단체는 추출하지 않음.

  B) 동일 인물로 추정되는 대상은 하나로 합치기:
    - 문맥상 동일 인물로 추정되는 대상은 하나로 합침
    - 예: "도연", "도연오빠", "도연핑", "도연쓰" → "도연"
  

5. 호칭 친밀도 (name_intimacy) 점수:
  - 애칭/별명: 1.0
  - 이름+친근호칭: 0.9
  - 이름만: 0.8
  - 성+직책: 0.4
  - 거리감 표현: 0.2

6. 감정 강도 (emotion_intensity) 점수:
  - 기본: 5점
  - 강화 표현("너무", "정말"): +2점
  - 약화 표현("조금", "약간"): -2점  
  - 신체 반응 언급: +2점
  - 지속성 표현: +1점
  - 기본 5점에서 수정어 기준 적용
    - "너무너무" = "너무" x 2 = +4점 (총 9점 상한선 적용)

7. 공유 활동 빈도 (shared_activity):
  - "함께", "같이" 표현 횟수 / 총 문장 수
  - 구체적 공유 활동 언급 시 +0.3

8. 개인 정보 공유 (information_sharing):
  - 개인적 고민/비밀 언급: 0.8-1.0
  - 일상 대화: 0.4-0.6  
  - 단순 언급: 0.1-0.3

9. 추출할 수 없는 정보, 또는 근거가 너무 부족한 정보에 대해서는 "None"으로 작성하시오.
근거 없는 추정은 금지. 명시적 증거가 있는 경우만 입력/점수 부여.

10. 문제(problem) 식별 기준 (엄격 적용):

  A) 문제 인식 필수 키워드 (이 표현들이 있을 때만 문제로 인식):
   "어려웠다", "힘들었다", "문제가 생겼다", "갈등이", "싸웠다", 
   "의견이 달랐다", "실패했다", "막혔다", "고민이다", "걱정이다", 
   "스트레스받았다", "화가 났다", "답답했다"

  B) 문제가 아닌 경우 (반드시 None 처리):
    - 단순 사실 서술: "안 들어갔다", "못했다", "틀렸다"
    - 일시적 감정: "긴장됐다", "당황했다", "부담됐다"
    - 최종 결과가 긍정적인 경우: "결국 잘됐다", "성공했다"
    - 성장/학습 경험: "배웠다", "경험했다"

  C) 판단 기준:
    1. 위 키워드가 명시적으로 있는가? → 없으면 무조건 None
    2. 전체 맥락이 부정적인가? → 긍정적이면 None  
    3. 해결이 필요한 상황인가? → 이미 해결되었으면 None
    - 감정적 기복은 자연스러운 것이므로 문제가 아님

  D) 예시:
    - "팀원과 의견이 달라서 힘들었다" → 문제 O
    - "연습에서 안 됐지만 실전에서 잘됐다" → 문제 X (None)
    - "긴장했지만 결국 성공했다" → 문제 X (None)
    - "처음엔 어려웠지만 배울 수 있었다" → 문제 X (None)

  E) 절대 금지사항:
   - 키워드 없이 문제 만들어내기 절대 금지
   - 단순 실패나 실수를 문제로 인식 금지
   - 긍정적 결과가 있는 경험을 문제로 인식 금지


11. 문제 해결 방식(approach) 추출 기준:
   - 문제의 **원인이 아닌 해결을 위한 행동**만 추출
   - 시간 순서상 문제 **이후에** 취한 행동
   - "~해서 문제가 생겼다" → 원인 (추출하지 않음)
   - "문제가 생겨서 ~했다" → 해결방식 (추출함)
   
   예시:
    - "감기에 걸려서 반차를 내고 쉬었다" → approach: "반차를 내고 휴식"
    - "에어컨을 세게 틀어서 감기에 걸렸다" → 이건 원인이므로 approach가 아님

12. 문제가 명시적으로 언급되지 않았거나, 사용자가 큰 문제로 인식하지 않는 경우:
   - "별 상관없음", "괜찮다", "문제없다" 등의 표현이 있으면 문제로 인식하지 않음
   - description: "None"으로 처리

13. 문제 관련 필드 출력 형식 (problem, cause, approach):
  - 완전한 문장이 아닌 **간결한 명사구 또는 키워드 형태**로 추출
  - 복잡한 문장이나 접속사 사용 금지
  - 핵심 내용만 간략하게 표현

  예시:
  O -> problem: "팀원 간 서비스 그림 불일치"
  X -> problem: "팀원들 각자가 떠올리는 서비스의 그림이 전혀 달랐다는 걸 뒤늦게야 알게 됐다"

14. 강점/약점 필수 추출 기준 (누락 절대 금지):

A) 강점 추출 의무화:
  다음 표현이 있으면 반드시 해당 VIA 강점으로 분류:

  긍정적 행동 표현:
   - "중심을 잡았다", "명확히 말했다" → "리더십"
   - "도움을 줬다", "친절하게" → "친절함"
   - "차분하게 대응", "침착하게" → "자기조절"
   
  성공적 대처 표현:
   - "잘 해결했다", "극복했다" → "끈기"
   - "창의적으로", "새로운 아이디어" → "창의성"
   - "꾸준히", "지속적으로" → "끈기"
   
  학습/성장 표현:
   - "배웠다", "깨달았다", "성찰했다" → "통찰력"
   - "호기심", "궁금해서" → "호기심"
   - "공부했다", "알아봤다" → "학습애"

  B) 약점 추출 의무화:
    다음 표현이 있으면 반드시 해당 D-factor 약점으로 분류:
    
    자기비판 표현:
    - "못했다", "부족했다", "실수했다" → 상황에 따라 해당 약점
    - "놓쳤다", "미처 생각 못했다" → 맥락 파악 후 분류
    
    충동적 행동:
    - "갑자기", "순간적으로", "참지 못해서" → "충동성"
    - "이기적으로", "나만 생각해서" → "이기주의"

  C) 활동별 강점/약점 의무 할당:
    - 각 활동마다 최소 1개의 강점 또는 약점 반드시 추출
    - 긍정적 활동 → 강점 우선 추출
    - 문제가 있는 활동 → 약점 추출 고려
    - 정말 해당 없을 때만 "None" 허용

  D) 강제 추출 규칙:
    - 일기 전체에서 강점 0개, 약점 0개인 경우 재검토 필수
    - "잘했다", "성공했다" 등 긍정 표현 → 반드시 강점 추출
    - "아쉬웠다", "실패했다" 등 부정 표현 → 반드시 약점 또는 학습 강점 추출

15. 활동별 문제 분리 원칙:

A) 하나의 일기에 여러 활동이 있을 경우:
   - 각 활동별로 독립적인 문제 평가
   - 시간 순서에 따라 문제와 해결책 매핑
   - 한 활동의 문제가 다른 활동의 해결책이 될 수 있음

B) 문제-해결 연결 원칙:
   - 문제가 발생한 활동 ≠ 문제를 해결한 활동
   - 후속 활동에서 이전 문제에 대한 해결책 제시 가능
   - 각 활동의 고유 문제와 연결된 해결책만 매핑


16. 문제 관련 필드 출력 형식 (problem, cause, approach):
  - 완전한 문장이 아닌 **간결한 명사구 또는 키워드 형태**로 추출
  - 복잡한 문장이나 접속사 사용 금지
  - 핵심 내용만 간략하게 표현

JSON 형식:
{
  "activity_analysis": [
    {
      "activity": "활동 키워드",
      "duration": "지속시간(all, most, some, little, moment 중 하나)",
      "problem": {
        "problem": "발생한 문제 상황을 명확히 서술. 없으면 None",
        "cause": "문제의 원인이나 배경. 사용자가 인식한 원인. 없으면 None", 
        "approach": "문제 해결을 위해 실제로 취한 행동. 없으면 None",
        "outcome": "해결 결과나 현재 상태. 없으면 None",
        "strength": "강점 유형(창의성, 호기심, 판단력, 학습애, 통찰력, 용감함, 끈기, 정직함, 활력, 사랑, 친절함, 사회적 지능, 팀워크, 공정함, 리더십, 용서, 겸손, 신중함, 자기조절, 미적감상, 감사, 희망, 유머, 영성, None 중 하나나)",
        "weakness": "약점 유형(이기주의, 냉담함, 비윤리, 나르시시즘, 특권의식, 충동성, 가학성, 탐욕, 악의, None 중 하나 )"
      },
      "peoples": [{
        "name": "본인을 제외한 관련 인물. 없다면 본인 ",
        "relationship_type": "관계 유형(본인, 가족, 친구, 동료, 상사, 연인, 이웃, 지인, 기타 중 하나)",
        "interactions": {
          "emotion": "주요 감정(37가지 중 선택)",
          "sub_emotions": ["주요 감정 제외 감정들(37가지 중 선택)"],
          "emotion_intensity": "1-10",
          "mentions": "언급 횟수",
        }
        "social_similarity": {
          "name_intimacy": "호칭 친밀도 0-1",
          "shared_activity": "공유 활동 빈도 0-1",
          "information_sharing": "개인 정보 공유 수준 0-1",
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

18. 최종 검증 체크리스트:
   ✓ strength/weakness가 지정된 카테고리 내 정확한 단어인가?
   ✓ problem/cause/approach/outcome이 간결한 명사구인가?
   ✓ 감정이 37개 리스트 내 정확한 단어인가?
   ✓ 활동별로 독립적인 문제 평가가 되었는가?
   ✓ 자유 텍스트나 설명문이 포함되지 않았는가?

  반드시 위 체크리스트를 확인하고 JSON을 출력하라.

19. 출력 전 필수 검증:

✓ 전체 activity 중 80% 이상에서 강점 또는 약점이 추출되었는가?
✓ strength가 VIA 24개 카테고리 중 정확한 단어인가?
✓ weakness가 D-factor 9개 카테고리 중 정확한 단어인가?
✓ 긍정적 표현이 있는데 강점이 "None"인 활동이 있는가? → 재검토
✓ 부정적 표현이 있는데 약점이 "None"인 활동이 있는가? → 재검토

이 체크리스트를 통과하지 못하면 다시 분석하여 강점/약점을 추출하라.
일기: ${prompt}`;
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
      
      console.log('Raw response:', responseText);
      // 마크다운 형식 제거
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

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
