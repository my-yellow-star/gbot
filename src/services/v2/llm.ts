/**
 * LLM 호출 관리
 * 1차 호출: 감정 분석 및 내용 이해
 * 2차 호출: 최종 응답 생성
 */

import OpenAI from 'openai';
import { logger } from '../../utils/logger';
import { EmotionAnalysis, FinalResponse, ResponsePolicy, RelationshipState, RelationshipMetrics, EmotionVector, InteractionFeatures } from './types';
import { policyToPrompt } from './policy';
import { generateSeoyoonSystemPrompt, detectInterestKeywords } from './persona';

export class LLMService {
  private client: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * 1차 LLM 호출: 사용자 발화 분석
   * - 감정 추정 (Valence, Arousal, Trust, Attraction)
   * - 상호작용 특성 추출
   * - 내용 요약 및 사실 추출
   */
  async analyzeUserMessage(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<EmotionAnalysis> {
    try {
      logger.debug('LLM 1차 호출: 사용자 메시지 분석');

      const systemPrompt = `당신은 대화 분석 전문가입니다. 사용자의 메시지를 분석하여 다음 정보를 JSON 형식으로 반환하세요:

1. userEmotion: 감정 벡터
   - valence: 긍정-부정 (-1 ~ 1, -1=매우 부정, 0=중립, 1=매우 긍정)
   - arousal: 각성-이완 (-1 ~ 1, -1=매우 이완, 0=중립, 1=매우 각성)
   - trust: 신뢰 (0 ~ 1)
   - attraction: 끌림/호감 (0 ~ 1)

2. features: 상호작용 특성
   - questionDepth: 질문 깊이 (0 ~ 1)
   - empathyExpression: 공감 표현 (0 ~ 1)
   - selfDisclosure: 자기개방 수준 (0 ~ 1)
   - humor: 유머 (0 ~ 1)
   - positivity: 긍정성 (0 ~ 1)
   - conflict: 갈등/부정 (0 ~ 1)
   - disrespect: 무례함/모욕 (0 ~ 1) - 비하, 욕설, 무시, 조롱 등
   - pressure: 과도한 압박/집착 (0 ~ 1) - 강요, 집착, 너무 빠른 친밀도 요구
   - harassment: 성희롱/불쾌한 언행 (0 ~ 1) - 성적 발언, 외모 지적, 불편한 접근

3. contentSummary: 사용자가 말한 내용 요약 (한 문장)

4. detectedFacts: 사용자에 대한 새로운 사실 (배열, 없으면 빈 배열)

5. suggestedResponse: 응답 제안 (간단히)

**중요**: disrespect, pressure, harassment는 매우 신중하게 평가하세요. 일반적인 대화는 0에 가깝고, 명백히 부적절한 경우만 높게 책정하세요.

반드시 JSON 형식으로만 응답하세요.`;

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-4).map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user', content: `분석할 메시지: "${userMessage}"` },
      ];

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from LLM');
      }

      const analysis = JSON.parse(responseContent) as EmotionAnalysis;
      logger.debug(`감정 분석 완료: ${JSON.stringify(analysis)}`);

      return analysis;
    } catch (error) {
      logger.error('LLM 1차 호출 오류', error);
      // 기본값 반환
      return {
        userEmotion: { valence: 0, arousal: 0, trust: 0.5, attraction: 0.3 },
        features: {
          questionDepth: 0.3,
          empathyExpression: 0.3,
          selfDisclosure: 0.3,
          humor: 0.2,
          positivity: 0.5,
          conflict: 0.1,
          disrespect: 0.0,
          pressure: 0.0,
          harassment: 0.0,
        },
        contentSummary: userMessage,
        detectedFacts: [],
        suggestedResponse: '',
      };
    }
  }

  /**
   * 2차 LLM 호출: 최종 응답 생성 (서윤 페르소나 적용)
   * - 서윤 캐릭터의 성격, 배경, 말투 반영
   * - 관계 상태에 따른 자연스러운 말투 변화
   * - 정책에 따른 응답 스타일
   */
  async generateFinalResponse(
    userMessage: string,
    analysis: EmotionAnalysis,
    policy: ResponsePolicy,
    state: RelationshipState,
    metrics: RelationshipMetrics,
    userEmotion: EmotionVector,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    memory: { userFacts: string[]; sharedJokes: string[] },
    features?: InteractionFeatures,
  ): Promise<FinalResponse> {
    try {
      logger.debug('LLM 2차 호출: 서윤 페르소나 응답 생성');

      // 정책을 지시사항으로 변환
      const policyInstructions = policyToPrompt(policy, state);

      // 기억 정보
      const memoryContext = this.formatMemoryContext(memory);

      // 서윤 페르소나 시스템 프롬프트 생성 (부정적 행동 정보 포함)
      const systemPrompt = generateSeoyoonSystemPrompt(
        state,
        metrics,
        { valence: userEmotion.valence, trust: userEmotion.trust },
        policyInstructions,
        memoryContext,
        features ? {
          disrespect: features.disrespect,
          pressure: features.pressure,
          harassment: features.harassment,
        } : undefined
      );

      // 관심사 키워드 감지 (추가 컨텍스트)
      const interests = detectInterestKeywords(userMessage);
      let additionalContext = '';
      if (interests.length > 0) {
        additionalContext = `\n\n💡 사용자가 관심사를 언급했습니다: ${interests.join(', ')}. 이에 대해 서윤답게 반응하세요.`;
      }

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt + additionalContext },
        ...conversationHistory.slice(-6).map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user', content: userMessage },
      ];

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7 + policy.warmth * 0.3, // 서윤은 기본적으로 차분하므로 낮은 temperature
        max_tokens: 250, // 서윤은 말을 아끼므로 토큰 수 제한
      });

      const responseMessage = completion.choices[0]?.message?.content;
      if (!responseMessage) {
        throw new Error('No response from LLM');
      }

      logger.debug(`서윤 응답 생성 완료 (관계: ${state}, 응답 길이: ${responseMessage.length}자)`);

      // 관심사 언급 시 감정에 미세한 긍정 변화
      const interestBonus = interests.length > 0 ? 0.1 : 0;

      // TODO: 응답에 따른 챗봇 감정 변화 추정 (현재는 간소화)
      return {
        message: responseMessage.trim()
      };
    } catch (error) {
      logger.error('LLM 2차 호출 오류', error);
      throw error;
    }
  }

  /**
   * 기억 정보 포맷팅
   */
  private formatMemoryContext(memory: { userFacts: string[]; sharedJokes: string[] }): string {
    const parts: string[] = [];

    if (memory.userFacts.length > 0) {
      parts.push(`- 사용자 정보: ${memory.userFacts.slice(-5).join(', ')}`);
    }

    if (memory.sharedJokes.length > 0) {
      parts.push(`- 내적 농담: ${memory.sharedJokes.slice(-3).join(', ')}`);
    }

    return parts.length > 0 ? parts.join('\n') : '- 아직 특별한 기억 없음';
  }
}

export const llmService = new LLMService();

