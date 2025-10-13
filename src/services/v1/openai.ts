import OpenAI from 'openai';
import { logger } from '../../utils/logger';
import { ConversationMessage } from './conversation';

// Function calling을 위한 타입 정의
export interface AffinityUpdate {
    newAffinity: number;
    reason: string;
}

// Function calling을 위한 도구 정의
const tools: OpenAI.Chat.ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "update_affinity",
            description: "사용자의 말이나 행동에 따라 호감도가 변화할 때 호출하는 함수",
            parameters: {
                type: "object",
                properties: {
                    newAffinity: {
                        type: "number",
                        description: "새로운 호감도 값 (-100에서 100 사이)"
                    },
                    reason: {
                        type: "string",
                        description: "호감도가 변화한 이유"
                    }
                },
                required: ["newAffinity", "reason"]
            }
        }
    }
];

export class OpenAIService {
    private client: OpenAI;

    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is required');
        }

        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async generateChatResponse(messages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<{ response: string; affinityUpdate?: AffinityUpdate }> {
        try {
            logger.debug('Generating chat response with OpenAI');
            const completion = await this.client.chat.completions.create({
                model: 'gpt-4.1-mini',
                messages,
                tools,
                tool_choice: "auto",
                max_tokens: 100,
                temperature: 1.5,
                frequency_penalty: 1.5,
                presence_penalty: 1,
            });

            const choice = completion.choices[0];
            if (!choice) {
                throw new Error('No response generated from OpenAI');
            }

            let affinityUpdate: AffinityUpdate | undefined;

            // Function call이 있는지 확인
            if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
                for (const toolCall of choice.message.tool_calls) {
                    if (toolCall.function.name === 'update_affinity') {
                        try {
                            const args = JSON.parse(toolCall.function.arguments);
                            affinityUpdate = {
                                newAffinity: args.newAffinity,
                                reason: args.reason
                            };
                            logger.info(`Affinity update requested: ${args.newAffinity} (${args.reason})`);
                        } catch (error) {
                            logger.error('Error parsing update_affinity arguments', error);
                        }
                    }
                }

                // Function call 결과를 포함하여 최종 응답 생성
                const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                    ...messages,
                    choice.message,
                    {
                        role: 'tool',
                        tool_call_id: choice.message.tool_calls[0].id,
                        content: JSON.stringify({ success: true, message: "호감도가 업데이트되었습니다." })
                    }
                ];

                const finalCompletion = await this.client.chat.completions.create({
                    model: 'gpt-4.1-nano',
                    messages: followUpMessages,
                    max_tokens: 1000,
                    temperature: 1,
                });

                const finalResponse = finalCompletion.choices[0]?.message?.content;
                if (!finalResponse) {
                    throw new Error('No final response generated from OpenAI');
                }

                return {
                    response: finalResponse,
                    affinityUpdate
                };
            }

            // Function call이 없는 경우 일반 응답 반환
            const response = choice.message.content;
            if (!response) {
                throw new Error('No response generated from OpenAI');
            }

            return {
                response,
                affinityUpdate
            };

        } catch (error) {
            logger.error('Error generating chat response', error);
            throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async generateEmbedding(text: string): Promise<number[]> {
        try {
            logger.debug('Generating embedding with OpenAI');

            const response = await this.client.embeddings.create({
                model: 'text-embedding-3-small',
                input: text,
            });

            const embedding = response.data[0]?.embedding;
            if (!embedding) {
                throw new Error('No embedding generated from OpenAI');
            }

            logger.debug('Embedding generated successfully');
            return embedding;
        } catch (error) {
            logger.error('Error generating embedding', error);
            throw new Error(`OpenAI embedding error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async generateRAGResponse(
        query: string,
        conversationHistory: ConversationMessage[],
        systemPrompt: string
    ): Promise<{ response: string; affinityUpdate?: AffinityUpdate }> {
        try {
            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                {
                    role: 'system',
                    content: systemPrompt
                },
                ...conversationHistory.map(message => ({
                    role: message.role,
                    content: message.content
                })),
                {
                    role: 'user',
                    content: query
                }
            ];
            console.log(messages);

            return await this.generateChatResponse(messages);

        } catch (error) {
            logger.error('Error generating RAG response', error);
            throw new Error(`RAG response error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

export const openaiService = new OpenAIService(); 