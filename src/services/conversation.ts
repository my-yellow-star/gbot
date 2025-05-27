import { openaiService } from './openai';
import { ragService } from './rag';
import { DocumentChunk } from './pinecone';
import { logger } from '../utils/logger';

export interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    affinity?: number; // 호감도
}

export interface ConversationSession {
    sessionId: string;
    userId: string;
    messages: ConversationMessage[];
    currentAffinity: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface ChatRequest {
    sessionId: string;
    userId: string;
    message: string;
}

export interface ChatResponse {
    message: string;
    affinity: number;
    sessionId: string;
    messageId: string;
}

export class ConversationService {
    private sessions: Map<string, ConversationSession> = new Map();

    // 새로운 대화 세션 생성
    createSession(userId: string): string {
        const sessionId = `session_${userId}_${Date.now()}`;
        const session: ConversationSession = {
            sessionId,
            userId,
            messages: [],
            currentAffinity: 0, // 초기 호감도 0
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.sessions.set(sessionId, session);
        logger.info(`Created new conversation session: ${sessionId}`);
        return sessionId;
    }

    // 세션 조회
    getSession(sessionId: string): ConversationSession | undefined {
        return this.sessions.get(sessionId);
    }

    // 대화 처리
    async processMessage(request: ChatRequest): Promise<ChatResponse> {
        try {
            logger.info(`Processing message for session: ${request.sessionId}`);

            let session = this.getSession(request.sessionId);
            if (!session) {
                // 세션이 없으면 새로 생성
                const newSessionId = this.createSession(request.userId);
                session = this.getSession(newSessionId)!;
            }

            // 1. 사용자 메시지 저장
            const userMessageId = `msg_${Date.now()}_user`;
            const userMessage: ConversationMessage = {
                id: userMessageId,
                role: 'user',
                content: request.message,
                timestamp: new Date()
            };
            session.messages.push(userMessage);

            // 2. 과거 대화 기억 검색 (RAG)
            const memories = await this.searchMemories(request.userId, request.message);

            // 3. 대화 컨텍스트 구성
            const conversationContext = this.buildConversationContext(session, memories);

            // 4. AI 응답 생성
            const aiResponse = await openaiService.generateRAGResponse(
                request.message,
                conversationContext,
                undefined // systemPrompt는 이미 openaiService에 내장되어 있음
            );

            // 5. 호감도 추출
            const affinity = this.extractAffinity(aiResponse);
            const cleanResponse = this.cleanResponse(aiResponse);

            // 6. AI 응답 저장
            const aiMessageId = `msg_${Date.now()}_assistant`;
            const aiMessage: ConversationMessage = {
                id: aiMessageId,
                role: 'assistant',
                content: cleanResponse,
                timestamp: new Date(),
                affinity
            };
            session.messages.push(aiMessage);
            session.currentAffinity = affinity;
            session.updatedAt = new Date();

            // 7. 대화 내역을 RAG 시스템에 저장
            await this.saveConversationToRAG(request.userId, userMessage, aiMessage);

            logger.info(`Message processed successfully. Affinity: ${affinity}`);

            return {
                message: cleanResponse,
                affinity,
                sessionId: session.sessionId,
                messageId: aiMessageId
            };

        } catch (error) {
            logger.error('Error processing message', error);
            throw new Error(`Conversation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // 과거 대화 기억 검색
    private async searchMemories(userId: string, currentMessage: string): Promise<string[]> {
        try {
            const searchResults = await ragService.query({
                query: currentMessage,
                topK: 3,
                filter: { userId } // 해당 사용자의 대화만 검색
            });

            return searchResults.sources.map(source => source.text);
        } catch (error) {
            logger.warn(`Failed to search memories, continuing without context, error: ${error}`);
            return [];
        }
    }

    // 대화 컨텍스트 구성
    private buildConversationContext(session: ConversationSession, memories: string[]): string[] {
        const context: string[] = [];

        // 과거 기억 추가
        if (memories.length > 0) {
            context.push(`과거 대화 기억:\n${memories.join('\n\n')}`);
        }

        // 최근 대화 내역 추가 (최대 10개)
        const recentMessages = session.messages.slice(-10);
        if (recentMessages.length > 0) {
            const recentConversation = recentMessages
                .map(msg => `${msg.role === 'user' ? '사용자' : '서윤'}: ${msg.content}`)
                .join('\n');
            context.push(`최근 대화:\n${recentConversation}`);
        }

        // 현재 호감도 정보 추가
        context.push(`현재 호감도: ${session.currentAffinity}`);

        return context;
    }

    // 응답에서 호감도 추출
    private extractAffinity(response: string): number {
        const affinityMatch = response.match(/<affinity>(-?\d+)<\/affinity>/);
        if (affinityMatch) {
            return parseInt(affinityMatch[1], 10);
        }
        return 0; // 기본값
    }

    // 응답에서 호감도 태그 제거
    private cleanResponse(response: string): string {
        return response.replace(/<affinity>-?\d+<\/affinity>/g, '').trim();
    }

    // 대화 내역을 RAG 시스템에 저장
    private async saveConversationToRAG(
        userId: string,
        userMessage: ConversationMessage,
        aiMessage: ConversationMessage
    ): Promise<void> {
        try {
            const conversationText = `사용자: ${userMessage.content}\n서윤: ${aiMessage.content}`;

            const document: DocumentChunk = {
                id: `conversation_${userId}_${userMessage.id}`,
                text: conversationText,
                metadata: {
                    userId,
                    userMessageId: userMessage.id,
                    aiMessageId: aiMessage.id,
                    timestamp: new Date().toISOString(),
                    affinity: aiMessage.affinity,
                    type: 'conversation'
                }
            };

            await ragService.addDocuments([document]);
            logger.debug(`Saved conversation to RAG: ${document.id}`);
        } catch (error) {
            logger.error('Failed to save conversation to RAG', error);
            // 대화 저장 실패는 치명적이지 않으므로 에러를 던지지 않음
        }
    }

    // 세션의 전체 대화 내역 조회
    getConversationHistory(sessionId: string): ConversationMessage[] {
        const session = this.getSession(sessionId);
        return session ? session.messages : [];
    }

    // 사용자의 모든 세션 조회
    getUserSessions(userId: string): ConversationSession[] {
        return Array.from(this.sessions.values())
            .filter(session => session.userId === userId)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    // 세션 삭제
    deleteSession(sessionId: string): boolean {
        return this.sessions.delete(sessionId);
    }

    // 현재 호감도 조회
    getCurrentAffinity(sessionId: string): number {
        const session = this.getSession(sessionId);
        return session ? session.currentAffinity : 0;
    }
}

export const conversationService = new ConversationService(); 