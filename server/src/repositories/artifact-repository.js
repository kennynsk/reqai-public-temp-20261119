import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';

import { createTextMaterialValidator } from '../domain/text-material.js';

import { ApiError } from '../errors/api-error.js';

const CHUNK_BYTES = 1024 * 1024;

export class ArtifactRepository {
  constructor(pool, { schema = 'reqai', artifactSchema = 'reqai_artifacts' } = {}) {
    this.pool = pool; this.schema = `"${schema}"`; this.artifactSchema = `"${artifactSchema}"`;
  }

  async *readChunks({ tenantId, artifactId }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN'); await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      let after = -1;
      while (true) {
        const result = await client.query(`SELECT chunk_index,content FROM ${this.artifactSchema}.artifact_content WHERE tenant_id=$1 AND artifact_id=$2 AND chunk_index>$3 ORDER BY chunk_index LIMIT 16`, [tenantId, artifactId, after]);
        if (!result.rows.length) break;
        for (const row of result.rows) { after = row.chunk_index; yield row.content; }
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async readText({ tenantId, artifactId, maxBytes = 2 * 1024 * 1024 }) {
    const parts = []; let size = 0;
    for await (const chunk of this.readChunks({ tenantId, artifactId })) {
      size += chunk.length;
      if (size > maxBytes) throw new ApiError({ status: 413, code: 'ACTIVITY_INPUT_TOO_LARGE', message: 'Activity input must be chunked before reading' });
      parts.push(chunk);
    }
    return Buffer.concat(parts, size).toString('utf8');
  }

  async createText({ tenantId, ownerUserId, text, kind = 'INTERMEDIATE', contentType = 'application/json', expiresAt = null, maxBytes = 104_857_600 }) {
    const buffer = Buffer.from(String(text), 'utf8');
    if (buffer.length > maxBytes) throw new ApiError({ status: 413, code: 'ARTIFACT_TOO_LARGE', message: 'Generated artifact exceeds configured maximum size' });
    const artifactId = randomUUID(); const sha256 = createHash('sha256').update(buffer).digest('hex'); const client = await this.pool.connect();
    try {
      await client.query('BEGIN'); await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query(`INSERT INTO ${this.schema}.artifacts(id,tenant_id,owner_user_id,kind,content_type,size_bytes,sha256,storage_status,expires_at,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,'AVAILABLE',$8,now())`, [artifactId, tenantId, ownerUserId, kind, contentType, buffer.length, sha256, expiresAt]);
      for (let offset = 0, index = 0; offset < buffer.length; offset += CHUNK_BYTES, index += 1) await client.query(`INSERT INTO ${this.artifactSchema}.artifact_content(artifact_id,tenant_id,chunk_index,content) VALUES($1,$2,$3,$4)`, [artifactId, tenantId, index, buffer.subarray(offset, offset + CHUNK_BYTES)]);
      await client.query('COMMIT'); return { artifactId, sizeBytes: buffer.length, sha256 };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async upload({ tenantId, ownerUserId, readable, expectedSha256, contentType, maxBytes, expiresAt }) {
    const validator = createTextMaterialValidator(contentType);
    const client = await this.pool.connect();
    const artifactId = randomUUID(); const hash = createHash('sha256'); let size = 0; let index = 0; let pending = Buffer.alloc(0);
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query(`INSERT INTO ${this.schema}.artifacts(id,tenant_id,owner_user_id,kind,content_type,size_bytes,sha256,storage_status,expires_at) VALUES($1,$2,$3,'INPUT',$4,0,$5,'UPLOADING',$6)`, [artifactId, tenantId, ownerUserId, contentType, '0'.repeat(64), expiresAt]);
      for await (const value of readable) {
        const incoming = Buffer.from(value); size += incoming.length;
        if (size > maxBytes) throw new ApiError({ status: 413, code: 'ARTIFACT_TOO_LARGE', message: 'Artifact exceeds configured maximum size' });
        validator.write(incoming);
        hash.update(incoming); pending = Buffer.concat([pending, incoming]);
        while (pending.length >= CHUNK_BYTES) {
          await client.query(`INSERT INTO ${this.artifactSchema}.artifact_content(artifact_id,tenant_id,chunk_index,content) VALUES($1,$2,$3,$4)`, [artifactId, tenantId, index++, pending.subarray(0, CHUNK_BYTES)]);
          pending = pending.subarray(CHUNK_BYTES);
        }
      }
      if (pending.length) await client.query(`INSERT INTO ${this.artifactSchema}.artifact_content(artifact_id,tenant_id,chunk_index,content) VALUES($1,$2,$3,$4)`, [artifactId, tenantId, index, pending]);
      const sha256 = hash.digest('hex');
      if (sha256.toLowerCase() !== expectedSha256.toLowerCase()) throw new ApiError({ status: 400, code: 'ARTIFACT_CHECKSUM_MISMATCH', message: 'Artifact checksum does not match X-Content-SHA256' });
      validator.finish();
      const result = await client.query(`UPDATE ${this.schema}.artifacts SET size_bytes=$3,sha256=$4,storage_status='AVAILABLE',completed_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, artifactId, size, sha256]);
      await client.query('COMMIT'); return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async validateMaterial({ tenantId, ownerUserId, artifactId }) {
    const metadata = await this.metadata({ tenantId, ownerUserId, artifactId });
    if (!metadata) throw new ApiError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: 'Материал не найден.' });
    const validator = createTextMaterialValidator(metadata.content_type);
    for await (const bytes of this.readChunks({ tenantId, artifactId })) validator.write(bytes);
    validator.finish();
    return metadata;
  }

  async metadata({ tenantId, ownerUserId = null, artifactId }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN'); await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await client.query(`SELECT * FROM ${this.schema}.artifacts WHERE tenant_id=$1 AND id=$2 AND storage_status='AVAILABLE' AND ($3::text IS NULL OR owner_user_id=$3)`, [tenantId, artifactId, ownerUserId]);
      await client.query('COMMIT'); return result.rows[0] || null;
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  async streamTo({ tenantId, artifactId, writable }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN'); await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      let after = -1;
      while (true) {
        const result = await client.query(`SELECT chunk_index,content FROM ${this.artifactSchema}.artifact_content WHERE tenant_id=$1 AND artifact_id=$2 AND chunk_index>$3 ORDER BY chunk_index LIMIT 16`, [tenantId, artifactId, after]);
        if (!result.rows.length) break;
        for (const row of result.rows) { if (!writable.write(row.content)) await once(writable, 'drain'); after = row.chunk_index; }
      }
      await client.query('COMMIT'); writable.end();
    } catch (e) { await client.query('ROLLBACK'); writable.destroy(e); throw e; } finally { client.release(); }
  }
}
