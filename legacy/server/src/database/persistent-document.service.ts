import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PersistentDocumentEntity } from './entities/persistent-document.entity';

@Injectable()
/** PersistentDocumentService：封装相关状态与行为。 */
export class PersistentDocumentService {
  constructor(
    @InjectRepository(PersistentDocumentEntity)
    private readonly documentRepo: Repository<PersistentDocumentEntity>,
  ) {}

/** countScope：执行对应的业务逻辑。 */
  async countScope(scope: string): Promise<number> {
    return this.documentRepo.count({ where: { scope } });
  }

/** get：执行对应的业务逻辑。 */
  async get<T>(scope: string, key: string): Promise<T | null> {
/** entity：定义该变量以承载业务值。 */
    const entity = await this.documentRepo.findOne({ where: { scope, key } });
    if (!entity) {
      return null;
    }
    return entity.payload as T;
  }

  async getScope<T>(scope: string): Promise<Array<{ key: string; payload: T }>> {
/** entities：定义该变量以承载业务值。 */
    const entities = await this.documentRepo.find({
      where: { scope },
      order: { key: 'ASC' },
    });
    return entities.map((entity) => ({
      key: entity.key,
      payload: entity.payload as T,
    }));
  }

/** save：执行对应的业务逻辑。 */
  async save<T>(scope: string, key: string, payload: T): Promise<void> {
    await this.documentRepo.save(this.documentRepo.create({
      scope,
      key,
      payload,
    }));
  }

/** saveMany：执行对应的业务逻辑。 */
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

/** delete：执行对应的业务逻辑。 */
  async delete(scope: string, key: string): Promise<void> {
    await this.documentRepo.delete({ scope, key });
  }
}

