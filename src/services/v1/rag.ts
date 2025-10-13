import { openaiService } from './openai';
import { pineconeService, DocumentChunk } from './pinecone';
import { logger } from '../../utils/logger';

export interface RAGQueryRequest {
    query: string;
    topK?: number;
    filter?: Record<string, any>;
    systemPrompt?: string;
}

export interface RAGQueryResponse {
    sources: Array<{
        id: string;
        text: string;
        score: number;
        metadata?: Record<string, any>;
    }>;
    query: string;
}

export class RAGService {
    async query(request: RAGQueryRequest): Promise<RAGQueryResponse> {
        try {
            logger.info(`Processing RAG query: ${request.query}`);

            // 1. 쿼리를 임베딩으로 변환
            const queryEmbedding = await openaiService.generateEmbedding(request.query);

            // 2. Pinecone에서 유사한 문서 검색
            const searchResults = await pineconeService.searchSimilar(
                queryEmbedding,
                request.topK || 5,
                request.filter
            );

            if (searchResults.length === 0) {
                logger.warn('No relevant documents found for query');
                return {
                    sources: [],
                    query: request.query
                };
            }

            logger.info('RAG query processed successfully');

            return {
                sources: searchResults.map(result => ({
                    id: result.id,
                    text: result.text,
                    score: result.score,
                    metadata: result.metadata
                })),
                query: request.query
            };
        } catch (error) {
            logger.error('Error processing RAG query', error);
            throw new Error(`RAG query error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async addDocuments(documents: DocumentChunk[]): Promise<void> {
        try {
            logger.info(`Adding ${documents.length} documents to RAG system`);

            // 각 문서에 대해 임베딩 생성
            const embeddings: number[][] = [];
            for (const doc of documents) {
                const embedding = await openaiService.generateEmbedding(doc.text);
                embeddings.push(embedding);
            }

            // Pinecone에 문서와 임베딩 저장
            await pineconeService.upsertDocuments(documents, embeddings);

            logger.info('Documents added to RAG system successfully');
        } catch (error) {
            logger.error('Error adding documents to RAG system', error);
            throw new Error(`Add documents error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async deleteDocument(id: string): Promise<void> {
        try {
            logger.info(`Deleting document ${id} from RAG system`);
            await pineconeService.deleteDocument(id);
            logger.info('Document deleted from RAG system successfully');
        } catch (error) {
            logger.error('Error deleting document from RAG system', error);
            throw new Error(`Delete document error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getStats(): Promise<any> {
        try {
            return await pineconeService.getIndexStats();
        } catch (error) {
            logger.error('Error getting RAG system stats', error);
            throw new Error(`Get stats error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // 텍스트를 청크로 분할하는 유틸리티 메서드
    chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
        const chunks: string[] = [];
        let start = 0;

        while (start < text.length) {
            const end = Math.min(start + chunkSize, text.length);
            const chunk = text.slice(start, end);
            chunks.push(chunk);

            if (end === text.length) break;
            start = end - overlap;
        }

        return chunks;
    }

    // 파일에서 문서 청크 생성
    async createDocumentChunks(
        content: string,
        filename: string,
        chunkSize: number = 1000,
        overlap: number = 200
    ): Promise<DocumentChunk[]> {
        const chunks = this.chunkText(content, chunkSize, overlap);

        return chunks.map((chunk, index) => ({
            id: `${filename}_chunk_${index}`,
            text: chunk,
            metadata: {
                filename,
                chunkIndex: index,
                totalChunks: chunks.length,
                timestamp: new Date().toISOString()
            }
        }));
    }
}

export const ragService = new RAGService(); 