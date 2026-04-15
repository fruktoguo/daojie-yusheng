import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PersistentDocumentEntity } from './entities/persistent-document.entity';

@Injectable()
export class PersistentDocumentService {
  constructor(
    @InjectRepository(PersistentDocumentEntity)
    private readonly documentRepo: Repository<PersistentDocumentEntity>,
  ) {}

  async countScope(scope: string): Promise<number> {
    return this.documentRepo.count({ where: { scope } });
  }

  async get<T>(scope: string, key: string): Promise<T | null> {
    const entity = await this.documentRepo.findOne({ where: { scope, key } });
    if (!entity) {
      return null;
    }
    return entity.payload as T;
  }

  async getScope<T>(scope: string): Promise<Array<{ key: string; payload: T }>> {
    const entities = await this.documentRepo.find({
      where: { scope },
      order: { key: 'ASC' },
    });
    return entities.map((entity) => ({
      key: entity.key,
      payload: entity.payload as T,
    }));
  }

  async save<T>(scope: string, key: string, payload: T): Promise<void> {
    await this.documentRepo.save(this.documentRepo.create({
      scope,
      key,
      payload,
    }));
  }

  async saveMany<T>(scope: string, documents: Array<{ key: string; payload: T }>): Promise<void> {
    if (documents.length === 0) {
      return;
    }
    await this.documentRepo.save(documents.map((document) => this.documentRepo.create({
      scope,
      key: document.key,
      payload: document.payload,
    })));
  }

  async delete(scope: string, key: string): Promise<void> {
    await this.documentRepo.delete({ scope, key });
  }
}

