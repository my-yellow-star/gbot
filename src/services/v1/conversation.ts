import { openaiService } from '../v1/openai';
import { ragService } from '../v1/rag';
import { DocumentChunk } from '../v1/pinecone';
import { logger } from '../../utils/logger';
import { seoyoonPrompt } from '../../utils/prompt';

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
    affinityUpdateReason?: string;
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

            // 1. 과거 대화 기억 검색 (RAG)
            // const memories = await this.searchMemories(request.userId, request.message);

            // 2. 대화 히스토리 구성
            const conversationHistory = session.messages.slice(-200);

            // 3. 사용자 메시지 저장
            const userMessageId = `msg_${Date.now()}_user`;
            const userMessage: ConversationMessage = {
                id: userMessageId,
                role: 'user',
                content: request.message,
                timestamp: new Date()
            };
            session.messages.push(userMessage);

            // 4. AI 응답 생성
            const aiResult = await openaiService.generateRAGResponse(
                request.message,
                conversationHistory,
                seoyoonPrompt(session.currentAffinity)
            );
            console.log(aiResult);

            // 5. 호감도 업데이트 처리
            let newAffinity = session.currentAffinity;
            if (aiResult.affinityUpdate) {
                // Function calling으로 호감도 업데이트가 요청된 경우
                newAffinity = Math.max(-100, Math.min(100, aiResult.affinityUpdate.newAffinity));
                logger.info(`Affinity updated from ${session.currentAffinity} to ${newAffinity}: ${aiResult.affinityUpdate.reason}`);
            }

            // 6. AI 응답 저장
            const aiMessageId = `msg_${Date.now()}_assistant`;
            const aiMessage: ConversationMessage = {
                id: aiMessageId,
                role: 'assistant',
                content: aiResult.response,
                timestamp: new Date(),
                affinity: newAffinity
            };
            session.messages.push(aiMessage);
            session.currentAffinity = newAffinity;
            session.updatedAt = new Date();

            // 7. 대화 내역을 RAG 시스템에 저장
            // await this.saveConversationToRAG(request.userId, userMessage, aiMessage);

            logger.info(`Message processed successfully. Affinity: ${newAffinity}`);

            return {
                message: aiResult.response,
                affinity: newAffinity,
                sessionId: session.sessionId,
                messageId: aiMessageId,
                affinityUpdateReason: aiResult.affinityUpdate?.reason
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