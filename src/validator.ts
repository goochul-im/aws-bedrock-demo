import { lightFiltersFail } from "./filters";
import { markovScore, isGibberishByMarkov } from "./markov";
import { unkRatio, unkFail } from "./unk";

export const isValidDiary = (text: string): boolean => {
  if (lightFiltersFail(text)) return false;

  const score = markovScore(text);
  if (isGibberishByMarkov(score)) return false;

  const ratio = unkRatio(text);
  if (unkFail(ratio)) return false;

  return true;
};

/* 사용 예시 --------------------------------------- */
import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.question("일기를 입력하세요:\n", (ans) => {
  console.log(isValidDiary(ans) ? "✅ 통과" : "❌ 무의미 텍스트");
  rl.close();
});
