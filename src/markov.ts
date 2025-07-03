// 2단계 : 2-gram 마르코프 확률 점수
import * as fs   from 'fs';      // Node 내장 모듈을 명시적으로 임포트
import * as path from 'path';    // ← path가 undefined였던 원인

type Bigram = Record<string, number>;   // "가ㄱ": 1.2e-4 …

const bigram: Bigram = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../src/data/bigram.json"), "utf-8")
);

const EPS = 1e-7;

export const markovScore = (text: string): number => {
  const cleaned = text
    .replace(/[^가-힣a-zA-Z]/g, "")      // 2-gram 학습과 동일 규칙
    .trim();
  if (cleaned.length < 2) return 0;      // 너무 짧으면 0

  let logProb = 0;
  for (let i = 0; i < cleaned.length - 1; i++) {
    const pair = cleaned.slice(i, i + 2);
    const p = bigram[pair] ?? EPS;
    logProb += Math.log(p);
  }
  // 문자당 평균 로그확률 (값이 작을수록 ‘비자연’)
  return logProb / (cleaned.length - 1);
};

// 경험적 컷오프(하위 1%)  ⇒  -10  정도가 흔함, 직접 조정
export const isGibberishByMarkov = (score: number, cut = -9): boolean =>
  score < cut;
