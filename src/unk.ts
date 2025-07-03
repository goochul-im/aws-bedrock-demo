// 3단계 : 미사전(UNK) 비율
import fs from "node:fs";
import path from "node:path";

const dict = new Set(
  fs.readFileSync(path.join(__dirname, "../data/kor_dict.txt"), "utf-8")
    .trim()
    .split("\n")
); // 줄당 1단어

export const unkRatio = (text: string): number => {
  const tokens = text.split(/\s+/);
  const total = tokens.length;
  const unk = tokens.filter((t) => !dict.has(t)).length;
  return total ? unk / total : 1;
};

export const unkFail = (ratio: number, thresh = 0.4) => ratio > thresh;
