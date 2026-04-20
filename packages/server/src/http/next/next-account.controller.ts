import { Body, Controller, Headers, Post } from '@nestjs/common';

import { NextPlayerAuthService } from './next-player-auth.service';

interface PasswordBody {
  currentPassword?: unknown;
  newPassword?: unknown;
}

interface DisplayNameBody {
  displayName?: unknown;
}

interface RoleNameBody {
  roleName?: unknown;
}

@Controller('api/account')
export class NextAccountController {
  constructor(private readonly authService: NextPlayerAuthService) {}

  @Post('password')
  async updatePassword(@Headers('authorization') authorization: string, @Body() body: PasswordBody) {
    return this.authService.updatePassword(
      extractBearerToken(authorization),
      pickString(body?.currentPassword),
      pickString(body?.newPassword),
    );
  }

  @Post('display-name')
  async updateDisplayName(@Headers('authorization') authorization: string, @Body() body: DisplayNameBody) {
    return this.authService.updateDisplayName(extractBearerToken(authorization), pickString(body?.displayName));
  }

  @Post('role-name')
  async updateRoleName(@Headers('authorization') authorization: string, @Body() body: RoleNameBody) {
    return this.authService.updateRoleName(extractBearerToken(authorization), pickString(body?.roleName));
  }
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function extractBearerToken(authorization: string) {
  const normalizedAuthorization = typeof authorization === 'string' ? authorization.trim() : '';
  return normalizedAuthorization.startsWith('Bearer ')
    ? normalizedAuthorization.slice('Bearer '.length).trim()
    : '';
}
