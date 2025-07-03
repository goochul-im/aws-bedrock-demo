// 1단계 : 초경량 정규식·문자 필터
export const lightFiltersFail = (text: string): boolean => {
    const len = text.length;
    if (!len) return true;           // 빈 문자열
  
    // (1) 허용 문자 비율 < 70%
    const allowed = text.match(/[가-힣a-zA-Z0-9\s.,!?]/g) ?? [];
    if (allowed.length / len < 0.7) return true;
  
    // (2) 한글 자모 연속 3+
    if (/[ㄱ-ㅎㅏ-ㅣ]{3,}/.test(text)) return true;
  
    // (3) 동일 글자 4회 이상 반복
    if (/(\w)\1{3,}/.test(text)) return true;
  
    // (4) 길이 ≤ 50 & 공백 0
    if (len <= 50 && !/\s/.test(text)) return true;
  
    return false;
  };
  