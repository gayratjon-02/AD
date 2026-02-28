import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateModelReferencesTable1740700000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS model_references (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
                user_id UUID NOT NULL,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(10) NOT NULL DEFAULT 'adult',
                image_url VARCHAR(500) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_model_references_brand ON model_references(brand_id);`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_model_references_user ON model_references(user_id);`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS model_references;`);
    }
}
