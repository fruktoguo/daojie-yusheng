import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { GM_HTTP_CONTRACT } from './native-gm-contract';
import { NativeGmAuthGuard } from './native-gm-auth.guard';
import { NativeGmSecretStoreService } from './native-gm-secret-store.service';

interface SetSecretBody {
  key?: string;
  value?: string;
  description?: string;
}

@Controller(GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NativeGmAuthGuard)
export class NativeGmSecretController {
  constructor(private readonly secretStore: NativeGmSecretStoreService) {}

  @Get('secrets')
  list() {
    return this.secretStore.list();
  }

  @Get('secrets/:key')
  async getOne(@Param('key') key: string) {
    const record = await this.secretStore.get(key);
    if (!record) return { found: false };
    return { found: true, ...record };
  }

  @Post('secrets')
  async set(@Body() body: SetSecretBody) {
    await this.secretStore.set(body?.key ?? '', body?.value ?? '', body?.description ?? '');
    return { ok: true };
  }

  @Delete('secrets/:key')
  async remove(@Param('key') key: string) {
    const deleted = await this.secretStore.delete(key);
    return { ok: true, deleted };
  }
}
