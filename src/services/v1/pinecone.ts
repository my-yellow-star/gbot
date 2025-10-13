import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from '../../utils/logger';

export interface DocumentChunk {
    id: string;
    text: string;
    metadata?: Record<string, any>;
}

export interface SearchResult {
    id: string;
    score: number;
    text: string;
    metadata?: Record<string, any>;
}

export class PineconeService {
    private client: Pinecone;
    private indexName: string;

    constructor() {
        if (!process.env.PINECONE_API_KEY) {
            throw new Error('PINECONE_API_KEY is required');
        }
        if (!process.env.PINECONE_INDEX_NAME) {
            throw new Error('PINECONE_INDEX_NAME is required');
        }

        this.client = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY,
            environment: process.env.PINECONE_ENVIRONMENT || 'us-east-1-aws'
        });
        this.indexName = process.env.PINECONE_INDEX_NAME;
    }

    async upsertDocuments(documents: DocumentChunk[], embeddings: number[][]): Promise<void> {
        try {
            logger.debug(`Upserting ${documents.length} documents to Pinecone`);

            const index = this.client.index(this.indexName);

            const vectors = documents.map((doc, i) => ({
                id: doc.id,
                values: embeddings[i],
                metadata: {
                    text: doc.text,
                    ...doc.metadata
                }
            }));

            await index.upsert(vectors);
            logger.debug('Documents upserted successfully');
        } catch (error) {
            logger.error('Error upserting documents to Pinecone', error);
            throw new Error(`Pinecone upsert error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async searchSimilar(
        queryEmbedding: number[],
        topK: number = 5,
        filter?: Record<string, any>
    ): Promise<SearchResult[]> {
        try {
            logger.debug(`Searching for ${topK} similar documents in Pinecone`);

            const index = this.client.index(this.indexName);

            const queryResponse = await index.query({
                vector: queryEmbedding,
                topK,
                includeMetadata: true,
                filter
            });

            const results: SearchResult[] = queryResponse.matches?.map(match => ({
                id: match.id,
                score: match.score || 0,
                text: match.metadata?.text as string || '',
                metadata: match.metadata
            })) || [];

            logger.debug(`Found ${results.length} similar documents`);
            return results;
        } catch (error) {
            logger.error('Error searching similar documents in Pinecone', error);
            throw new Error(`Pinecone search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async deleteDocument(id: string): Promise<void> {
        try {
            logger.debug(`Deleting document ${id} from Pinecone`);

            const index = this.client.index(this.indexName);
            await index.deleteOne(id);

            logger.debug('Document deleted successfully');
        } catch (error) {
            logger.error('Error deleting document from Pinecone', error);
            throw new Error(`Pinecone delete error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getIndexStats(): Promise<any> {
        try {
            const index = this.client.index(this.indexName);
            const stats = await index.describeIndexStats();
            return stats;
        } catch (error) {
            logger.error('Error getting index stats from Pinecone', error);
            throw new Error(`Pinecone stats error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

export const pineconeService = new PineconeService(); 