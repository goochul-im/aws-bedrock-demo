// scripts/build-bigram.ts
import fs from 'fs';
import readline from 'readline';
import path from 'path';

const TSV  = path.resolve('ko_bigrams.tsv');   // 원본
const OUT  = path.resolve('src/data/bigram.json');         // 출력

// 1) 읽기 스트림
const rl = readline.createInterface({
  input: fs.createReadStream(TSV, { encoding: 'utf8' }),
});

type Bigram = Record<string, number>;
const bigram: Bigram = {};

rl.on('line', (line) => {
  // 토큰1<TAB>토큰2<TAB>빈도  (헤더·빈줄이면 l.length < 3)
  const parts = line.split('\t');
  if (parts.length !== 3) return;

  const [tok1, tok2, cntRaw] = parts;
  const cnt = Number(cntRaw);
  if (!Number.isFinite(cnt)) return;           // 헤더·비숫자 skip

  bigram[`${tok1}${tok2}`] = cnt;
});

rl.on('close', () => {
  fs.writeFileSync(OUT, JSON.stringify(bigram));
  console.log('✅  bigram.json 완성:', Object.keys(bigram).length, 'items');
});
