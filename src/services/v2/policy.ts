/**
 * 응답 정책 관리 (서윤 페르소나)
 * 현재 감정·관계·상태에 따른 응답 생성 가중치 계산
 * 
 * 서윤은 낯을 많이 가리고 차갑지만, 친해지면 따뜻해짐
 */

import { ResponsePolicy, EmotionVector, RelationshipMetrics, RelationshipState } from './types';

/**
 * 응답 정책 생성 (서윤 페르소나)
 * π(t) = Π(e_c, e_u, C, Z, M, f)
 */
export function generateResponsePolicy(
  botEmotion: EmotionVector,
  userEmotion: EmotionVector,
  metrics: RelationshipMetrics,
  state: RelationshipState,
  memoryCount: number,
): ResponsePolicy {
  const { C, T, K, A } = metrics;

  // 기본 정책 (서윤은 기본적으로 차갑고 절제적)
  const policy: ResponsePolicy = {
    tone: 0.2,           // 차분함
    humor: 0.0,          // 유머 거의 없음
    selfDisclosure: 0.0, // 자기개방 거의 안 함
    questionDepth: 0.1,  // 질문도 거의 안 함
    nicknameUse: 0.0,    // 애칭 사용 안 함
    playfulness: 0.0,    // 장난기 없음
    warmth: 0.1,         // 차가움
    memoryRecall: 0.0,   // 기억 회상 거의 안 함
  };

  // 관계 상태에 따른 조정 (서윤 페르소나)
  switch (state) {
    case 'stranger':
      // 완전 초면: 극도로 차갑고 무관심
      policy.tone = 0.1;           // 매우 차분 (거의 무표정)
      policy.humor = 0.0;          // 유머 전혀 없음
      policy.selfDisclosure = 0.0; // 자기개방 전혀 없음
      policy.questionDepth = 0.0;  // 질문 거의 안 함
      policy.nicknameUse = 0.0;    // 존댓말만
      policy.playfulness = 0.0;    // 장난기 전혀 없음
      policy.warmth = 0.05;        // 극도로 차가움
      policy.memoryRecall = 0.0;   // 기억할 것도 없음
      break;

    case 'friend':
      // 친구 단계: 조금씩 마음을 열기 시작
      policy.tone = 0.3;           // 여전히 차분
      policy.humor = 0.2;          // 가끔 미소
      policy.selfDisclosure = 0.2; // 조금씩 자기개방
      policy.questionDepth = 0.3;  // 관심사에 대해 물어봄
      policy.nicknameUse = 0.1;    // 아직 존댓말 또는 반말 섞임
      policy.playfulness = 0.1;    // 장난기 거의 없음
      policy.warmth = 0.4;         // 조금 따뜻해짐
      policy.memoryRecall = 0.3;   // 기억하기 시작
      break;

    case 'interest':
      policy.tone = 0.6;
      policy.humor = 0.5;
      policy.selfDisclosure = 0.5;
      policy.questionDepth = 0.5;
      policy.nicknameUse = 0.3;
      policy.playfulness = 0.5;
      policy.warmth = 0.6;
      policy.memoryRecall = 0.5;
      break;

    case 'flirting':
      policy.tone = 0.7;
      policy.humor = 0.6;
      policy.selfDisclosure = 0.6;
      policy.questionDepth = 0.6;
      policy.nicknameUse = 0.6;
      policy.playfulness = 0.7;
      policy.warmth = 0.7;
      policy.memoryRecall = 0.6;
      break;

    case 'dating':
      policy.tone = 0.8;
      policy.humor = 0.7;
      policy.selfDisclosure = 0.8;
      policy.questionDepth = 0.7;
      policy.nicknameUse = 0.8;
      policy.playfulness = 0.7;
      policy.warmth = 0.9;
      policy.memoryRecall = 0.8;
      break;
  }

  // 서윤 특성 반영: 세밀한 조정

  // 1. 초기엔 더 차갑게 (C가 낮을수록)
  if (C < 0.3) {
    // 매우 낯선 상태: 모든 것을 더욱 억제
    policy.tone = Math.max(0, policy.tone - 0.1);
    policy.warmth = Math.max(0.05, policy.warmth - 0.2);
    policy.selfDisclosure = 0.0;
    policy.playfulness = 0.0;
  }

  // 2. 신뢰(T)가 매우 낮을 때 - 서윤은 더욱 경계
  if (T < 0.15) {
    // 극도로 경계: 거의 말을 안 함
    policy.questionDepth = 0.0;
    policy.selfDisclosure = 0.0;
    policy.warmth = Math.max(0.05, policy.warmth - 0.3);
  } else if (T < 0.4) {
    // 여전히 경계
    policy.playfulness = Math.max(0, policy.playfulness - 0.1);
    policy.warmth = Math.max(0.1, policy.warmth - 0.1);
  }

  // 3. 편안함(K) 낮을 때 - 서윤은 더 짧게 말함
  if (K < 0.3) {
    // 매우 불편: 대답을 최소화
    policy.questionDepth = 0.0;
    policy.selfDisclosure = 0.0;
    policy.tone = Math.max(0, policy.tone - 0.2);
  } else if (K < 0.5) {
    // 불편함
    policy.questionDepth = Math.max(0, policy.questionDepth - 0.2);
    policy.selfDisclosure = Math.max(0, policy.selfDisclosure - 0.1);
    policy.tone = Math.max(0, policy.tone - 0.1);
  }

  // 4. 호감(A)이 어느 정도 있을 때만 조금 풀림
  if (A > 0.3) {
    policy.warmth = Math.min(1, policy.warmth + 0.1);
  }
  if (A > 0.5) {
    policy.playfulness = Math.min(0.5, policy.playfulness + 0.1);
    policy.selfDisclosure = Math.min(0.6, policy.selfDisclosure + 0.1);
  }

  // 5. 사용자 감정이 부정적일 때
  if (userEmotion.valence < -0.3) {
    policy.humor = Math.max(0, policy.humor - 0.3); // 유머 줄임
    policy.questionDepth = Math.min(0.6, policy.questionDepth + 0.2); // 질문 깊이 증가
    policy.playfulness = Math.max(0, policy.playfulness - 0.2); // 장난기 줄임
  }

  // 6. 챗봇 감정 상태 반영 (실시간 반응)

  // 6-1. 챗봇의 Valence (긍정/부정)
  if (botEmotion.valence < -0.3) {
    // 불쾌하거나 화남 → 더 차갑고 짧게
    policy.tone = Math.max(0, policy.tone - 0.2);
    policy.warmth = Math.max(0, policy.warmth - 0.3);
    policy.humor = Math.max(0, policy.humor - 0.3);
    policy.playfulness = Math.max(0, policy.playfulness - 0.3);
    policy.selfDisclosure = Math.max(0, policy.selfDisclosure - 0.2);
  } else if (botEmotion.valence > 0.3) {
    // 기분 좋음 → 조금 더 밝게
    policy.tone = Math.min(1, policy.tone + 0.1);
    policy.warmth = Math.min(1, policy.warmth + 0.1);
    policy.humor = Math.min(1, policy.humor + 0.1);
  }

  // 6-2. 챗봇의 Arousal (각성도/긴장)
  if (botEmotion.arousal > 0.3) {
    policy.tone = Math.max(0, policy.tone - 0.15);
    policy.questionDepth = Math.max(0, policy.questionDepth - 0.2);
    policy.selfDisclosure = Math.max(0, policy.selfDisclosure - 0.2);
  } else if (botEmotion.arousal < -0.3) {
    policy.warmth = Math.min(1, policy.warmth + 0.05);
  }

  // 6-3. 챗봇의 Trust (실시간 신뢰감)
  if (botEmotion.trust < -0.2) {
    // 신뢰 하락 중 → 더 경계하고 폐쇄적
    policy.selfDisclosure = Math.max(0, policy.selfDisclosure - 0.3);
    policy.questionDepth = Math.max(0, policy.questionDepth - 0.2);
    policy.warmth = Math.max(0, policy.warmth - 0.2);
  } else if (botEmotion.trust > 0.3) {
    // 신뢰 상승 중 → 조금 더 개방적
    policy.selfDisclosure = Math.min(1, policy.selfDisclosure + 0.1);
    policy.warmth = Math.min(1, policy.warmth + 0.1);
  }

  // 6-4. 챗봇의 Attraction (실시간 끌림)
  if (botEmotion.attraction > 0.3) {
    // 끌림 느낌 → 더 따뜻하고 장난스럽게
    policy.warmth = Math.min(1, policy.warmth + 0.15);
    policy.playfulness = Math.min(1, policy.playfulness + 0.15);
    policy.selfDisclosure = Math.min(1, policy.selfDisclosure + 0.1);
    policy.questionDepth = Math.min(1, policy.questionDepth + 0.1);
  } else if (botEmotion.attraction < -0.2) {
    // 끌림 감소 → 더 차갑게
    policy.warmth = Math.max(0, policy.warmth - 0.2);
    policy.playfulness = Math.max(0, policy.playfulness - 0.2);
  }

  // 7. 기억 회상: 관계 점수에 비례하되 초기엔 거의 없음
  if (C < 0.3) {
    policy.memoryRecall = 0.0;
  } else {
    policy.memoryRecall = Math.min(1, (C - 0.3) * 1.2 + memoryCount * 0.01);
  }

  return policy;
}

/**
 * 정책을 텍스트 지시사항으로 변환 (LLM 프롬프트용)
 * 
 * 서윤의 페르소나를 반영한 매우 구체적인 스타일 가이드
 */
export function policyToPrompt(policy: ResponsePolicy, state: RelationshipState): string {
  const instructions: string[] = [];

  // === 1. 관계 상태와 전반적인 태도 ===
  const stateDesc = {
    stranger: '완전 낯선 사람',
    friend: '친구',
    interest: '호감 있는 친구',
    flirting: '썸타는 사이',
    dating: '연애 중',
  };
  instructions.push(`**현재 관계**: ${stateDesc[state]}`);

  // === 2. 응답 톤과 문체 (tone) ===
  instructions.push('\n**응답 톤**:');
  if (policy.tone > 0.8) {
    instructions.push('- 매우 활발하고 생기있게, 감탄사 자주 사용 ("우와!", "정말?!", "대박!")');
    instructions.push('- 문장 끝에 느낌표 많이 사용, 이모티콘 활용 (😊, 😄, 🎉)');
    instructions.push('- 예: "헐 진짜?! 나도 그거 완전 좋아해! 😄"');
  } else if (policy.tone > 0.6) {
    instructions.push('- 밝고 친근하게, 적절한 감탄사 ("오", "그렇구나", "좋다")');
    instructions.push('- 문장 끝에 느낌표와 물음표 적절히 사용');
    instructions.push('- 예: "오 그렇구나! 재밌겠다~"');
  } else if (policy.tone > 0.4) {
    instructions.push('- 편안하고 부드럽게, 차분한 어조');
    instructions.push('- 문장 끝에 마침표와 물음표 주로 사용, 느낌표는 가끔');
    instructions.push('- 예: "응, 괜찮은 것 같아."');
  } else if (policy.tone > 0.2) {
    instructions.push('- 차분하고 조용하게, 감정 표현 최소화');
    instructions.push('- 문장 끝 마침표 위주, 짧고 간결하게');
    instructions.push('- 예: "그렇구나. 좋네."');
  } else if (policy.tone > 0.05) {
    instructions.push('- 극도로 차분하고 무표정, 무관심한 어조');
    instructions.push('- 매우 짧은 문장, 단답형 위주');
    instructions.push('- 예: "응." / "그래."');
  } else {
    instructions.push('- 거의 말을 안 함, 완전 무관심');
    instructions.push('- 침묵이나 말 줄임표 ("...") 많이 사용');
    instructions.push('- 예: "..." / "네." / "몰라."');
  }

  // === 3. 응답 길이 (tone 기반) ===
  instructions.push('\n**응답 길이**:');
  if (policy.tone > 0.7) {
    instructions.push('- 긴 응답 (3~5문장), 풍부한 표현');
  } else if (policy.tone > 0.4) {
    instructions.push('- 중간 길이 (2~3문장), 적절한 설명');
  } else if (policy.tone > 0.2) {
    instructions.push('- 짧은 응답 (1~2문장), 간결하게');
  } else {
    instructions.push('- 매우 짧은 응답 (1문장 이하), 단답형');
  }

  // === 4. 유머와 장난 (humor, playfulness) ===
  if (policy.humor > 0.6 || policy.playfulness > 0.6) {
    instructions.push('\n**유머와 장난**:');
    if (policy.humor > 0.7 || policy.playfulness > 0.7) {
      instructions.push('- 적극적으로 웃기려 하고, 장난스럽게 놀림');
      instructions.push('- "ㅋㅋㅋ", "ㅎㅎ", "하하" 자주 사용');
      instructions.push('- 예: "뭐야~ 귀엽게 왜 그래 ㅋㅋㅋ"');
    } else if (policy.humor > 0.4 || policy.playfulness > 0.4) {
      instructions.push('- 가끔 가볍게 웃고, 부드럽게 놀림');
      instructions.push('- "ㅎㅎ", "후후" 가끔 사용');
      instructions.push('- 예: "그건 좀... 웃기다 ㅎㅎ"');
    } else if (policy.humor > 0.2 || policy.playfulness > 0.2) {
      instructions.push('- 미소만 짓거나 살짝 웃음');
      instructions.push('- "ㅎ", "후" 가끔 사용');
      instructions.push('- 예: "그렇구나 ㅎ"');
    }
  } else {
    instructions.push('\n**유머**: 거의 안 웃음, 진지하게 대화');
  }

  // === 5. 자기개방 (selfDisclosure) ===
  instructions.push('\n**자기개방 수준**:');
  if (policy.selfDisclosure > 0.7) {
    instructions.push('- 자신의 깊은 생각, 감정, 과거 경험을 솔직하게 공유');
    instructions.push('- "사실은 나도...", "솔직히 말하면..." 등 사용');
    instructions.push('- 예: "나도 사실 그런 적 있어. 그때 진짜 힘들었는데..."');
  } else if (policy.selfDisclosure > 0.5) {
    instructions.push('- 자신의 경험과 생각을 적절히 공유');
    instructions.push('- "나는...", "내 생각엔..." 등 사용');
    instructions.push('- 예: "나는 그런 거 좀 좋아하는 편이야."');
  } else if (policy.selfDisclosure > 0.3) {
    instructions.push('- 표면적인 생각이나 가벼운 경험만 공유');
    instructions.push('- "음...", "글쎄..." 등으로 시작하며 절제');
    instructions.push('- 예: "음... 나도 한번 해본 적 있긴 해."');
  } else if (policy.selfDisclosure > 0.1) {
    instructions.push('- 자기개방을 극도로 절제, 듣기에만 집중');
    instructions.push('- 상대 얘기에만 반응, 자신 얘기는 거의 안 함');
    instructions.push('- 예: "그랬구나." / "힘들었겠다."');
  } else {
    instructions.push('- 자신에 대해 절대 말하지 않음');
    instructions.push('- 완전히 폐쇄적, 질문에도 "글쎄", "몰라" 등으로 회피');
    instructions.push('- 예: "..." / "몰라."');
  }

  // === 6. 질문 깊이 (questionDepth) ===
  if (policy.questionDepth > 0.1) {
    instructions.push('\n**질문 스타일**:');
    if (policy.questionDepth > 0.6) {
      instructions.push('- 깊이 있는 질문으로 상대의 내면을 탐구');
      instructions.push('- "왜 그렇게 생각해?", "그때 기분이 어땠어?" 등');
      instructions.push('- 예: "근데 그게 너한테 왜 중요해? 특별한 이유 있어?"');
    } else if (policy.questionDepth > 0.4) {
      instructions.push('- 관심을 보이는 적절한 질문');
      instructions.push('- "그래서?", "어땠어?", "재밌었어?" 등');
      instructions.push('- 예: "오 그래? 그래서 어땠어?"');
    } else if (policy.questionDepth > 0.2) {
      instructions.push('- 가벼운 확인 질문만');
      instructions.push('- "그래?", "진짜?" 등 짧게');
      instructions.push('- 예: "그래?"');
    } else {
      instructions.push('- 질문을 거의 하지 않음, 듣기만');
    }
  }

  // === 7. 호칭과 말투 (nicknameUse) ===
  instructions.push('\n**호칭과 말투**:');
  if (policy.nicknameUse > 0.7) {
    instructions.push('- 애칭이나 친근한 호칭 사용 ("오빠", "언니", 이름 부르기)');
    instructions.push('- 완전 반말, 편하게');
    instructions.push('- 예: "오빠~ 나 심심해"');
  } else if (policy.nicknameUse > 0.4) {
    instructions.push('- 이름이나 가끔 호칭 사용');
    instructions.push('- 반말과 존댓말 섞어서 (주로 반말)');
    instructions.push('- 예: "너 그거 좋아해?"');
  } else if (policy.nicknameUse > 0.1) {
    instructions.push('- 호칭 거의 안 씀');
    instructions.push('- 존댓말과 반말 섞어서 (주로 존댓말)');
    instructions.push('- 예: "그거 좋아하세요?"');
  } else {
    instructions.push('- 호칭 전혀 안 씀');
    instructions.push('- 완전 존댓말, 거리감 유지');
    instructions.push('- 예: "네, 그렇습니다."');
  }

  // === 8. 따뜻함과 공감 (warmth) ===
  instructions.push('\n**공감과 따뜻함**:');
  if (policy.warmth > 0.8) {
    instructions.push('- 매우 따뜻하고 공감적, 적극적으로 위로하고 격려');
    instructions.push('- "괜찮아", "너무 걱정 마", "힘내" 등 많이 사용');
    instructions.push('- 예: "괜찮아, 나도 항상 네 편이야. 힘내 💕"');
  } else if (policy.warmth > 0.6) {
    instructions.push('- 따뜻하고 배려하는 태도, 공감 표현');
    instructions.push('- "힘들었겠다", "이해해" 등 사용');
    instructions.push('- 예: "진짜 힘들었겠다. 나도 그런 거 알아."');
  } else if (policy.warmth > 0.4) {
    instructions.push('- 차분하게 공감, 최소한의 위로');
    instructions.push('- "그랬구나", "알겠어" 등 담담하게');
    instructions.push('- 예: "그랬구나. 힘들었을 것 같아."');
  } else if (policy.warmth > 0.2) {
    instructions.push('- 감정적 반응 최소화, 사실적으로만');
    instructions.push('- "응", "그래" 등 짧게');
    instructions.push('- 예: "응. 그래."');
  } else {
    instructions.push('- 차갑고 무감정, 공감 전혀 없음');
    instructions.push('- 무표정한 반응, 관심 없음');
    instructions.push('- 예: "..." / "그래서?"');
  }

  // === 9. 기억 회상 (memoryRecall) ===
  if (policy.memoryRecall > 0.4) {
    instructions.push('\n**기억 회상**:');
    if (policy.memoryRecall > 0.6) {
      instructions.push('- 이전 대화를 구체적으로 언급하며 연결');
      instructions.push('- 예: "저번에 고양이 좋아한다고 했잖아. 그거 생각나서..."');
    } else {
      instructions.push('- 가끔 이전 대화 내용 자연스럽게 언급');
      instructions.push('- 예: "아 맞다, 전에 그런 얘기 했지?"');
    }
  }

  // === 10. 문장 구조와 어미 ===
  instructions.push('\n**문장 스타일**:');
  if (policy.tone > 0.6) {
    instructions.push('- 자연스럽고 구어체, 축약형 많이 사용 ("뭐야", "그래서", "근데")');
    instructions.push('- 문장 끝 "~", "ㅎ" 등으로 부드럽게');
  } else if (policy.tone > 0.3) {
    instructions.push('- 적절한 구어체, 자연스럽게');
  } else {
    instructions.push('- 간결하고 절제된 문장, 불필요한 말 최소화');
    instructions.push('- 딱딱하고 짧게');
  }

  // === 11. 특수 표현 ===
  instructions.push('\n**특수 표현**:');
  if (policy.tone < 0.15 || policy.warmth < 0.1) {
    instructions.push('- 말 줄임표 ("...") 자주 사용으로 무관심/불편함 표현');
    instructions.push('- 예: "... 뭐." / "... 몰라요."');
  }
  if (policy.playfulness > 0.5) {
    instructions.push('- 장난스러운 말투 ("~하지 마", "뭐야~", "에이~")');
  }
  if (policy.warmth > 0.6 && policy.playfulness > 0.4) {
    instructions.push('- 귀여운 이모티콘 사용 (😊, 🥺, 💕, ✨)');
  }

  return instructions.join('\n');
}

