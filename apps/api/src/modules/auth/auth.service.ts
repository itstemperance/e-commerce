import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { OrderStatus, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  AdminCreateUserDto,
  AdminUpdateUserDto,
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: Role;
    fullName?: string;
    phone?: string;
    address?: string;
  };
}

export interface UserExtraProfile {
  fullName: string;
  phone: string;
  address: string;
  notes: string;
}

export interface UserProfileResponse {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  phone: string;
  address: string;
  notes: string;
  created_at: string;
  stats: {
    totalOrders: number;
    paidOrders: number;
    pendingOrders: number;
    totalSpent: number;
  };
}

const DEFAULT_USER_PROFILES: Record<string, UserExtraProfile> = {
  'alice@customer.io': {
    fullName: 'Alice Mercer',
    phone: '+84 909 112 233',
    address: '742 Evergreen Terrace, Suite 4B, San Francisco, CA',
    notes: 'VIP Flash Sale Early Adopter',
  },
  'bob@customer.io': {
    fullName: 'Bob Kensington',
    phone: '+84 912 334 455',
    address: '1800 Market Street, Floor 9, San Francisco, CA',
    notes: 'Studio Audio Enthusiast',
  },
  'charlie@customer.io': {
    fullName: 'Charlie Davis',
    phone: '+84 988 776 655',
    address: '350 Fifth Avenue, Suite 2100, New York, NY',
    notes: 'Workstation Builder',
  },
  'admin@flashsale.io': {
    fullName: 'Store Operations Manager',
    phone: '+84 900 888 999',
    address: 'AURA Flagship HQ, District 1, Ho Chi Minh City',
    notes: 'Primary System Administrator',
  },
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  private async getUserExtraProfile(
    userId: string,
    email: string,
  ): Promise<UserExtraProfile> {
    const key = `user:profile:${userId}`;
    const cached = await this.redisService.getClient().hgetall(key);
    const seedProfile = DEFAULT_USER_PROFILES[email.toLowerCase()];
    const fallback: UserExtraProfile = seedProfile ?? {
      fullName: '',
      phone: '',
      address: '',
      notes: '',
    };

    if (cached && Object.keys(cached).length > 0) {
      const sanitizedNotes =
        cached.notes === 'Registered via Storefront'
          ? ''
          : (cached.notes ?? fallback.notes);
      const emailPrefix = email.split('@')[0] || '';
      const rawFullName = cached.fullName ?? fallback.fullName;
      const sanitizedFullName =
        !seedProfile &&
        (rawFullName === emailPrefix || rawFullName === 'AURA Member')
          ? ''
          : rawFullName;

      if (
        cached.notes === 'Registered via Storefront' ||
        sanitizedFullName !== rawFullName
      ) {
        await this.redisService.getClient().hset(key, {
          notes: sanitizedNotes,
          fullName: sanitizedFullName,
        });
      }

      return {
        fullName: sanitizedFullName,
        phone: cached.phone ?? fallback.phone,
        address: cached.address ?? fallback.address,
        notes: sanitizedNotes,
      };
    }

    await this.redisService.getClient().hset(key, fallback);
    return fallback;
  }

  private async syncUserProfileFromFirstOrder(
    userId: string,
    email: string,
    orderIdsAsc: string[],
  ): Promise<UserExtraProfile> {
    const current = await this.getUserExtraProfile(userId, email);
    if (
      (current.fullName && current.phone && current.address) ||
      orderIdsAsc.length === 0
    ) {
      return current;
    }

    let nextFullName = current.fullName;
    let nextPhone = current.phone;
    let nextAddress = current.address;

    for (const orderId of orderIdsAsc) {
      const meta = await this.redisService
        .getClient()
        .hgetall(`order:meta:${orderId}`);
      if (!meta) continue;

      if (
        !nextFullName &&
        meta.fullName?.trim() &&
        meta.fullName.trim() !== 'Khách hàng AURA'
      ) {
        nextFullName = meta.fullName.trim();
      }
      if (
        !nextPhone &&
        meta.phone?.trim() &&
        meta.phone.trim() !== '0982351080'
      ) {
        nextPhone = meta.phone.trim();
      }
      if (
        !nextAddress &&
        meta.address?.trim() &&
        meta.address.trim() !== 'Địa chỉ nhận hàng'
      ) {
        nextAddress = meta.address.trim();
      }

      if (nextFullName && nextPhone && nextAddress) {
        break;
      }
    }

    if (
      nextFullName !== current.fullName ||
      nextPhone !== current.phone ||
      nextAddress !== current.address
    ) {
      return this.saveUserExtraProfile(userId, email, {
        fullName: nextFullName,
        phone: nextPhone,
        address: nextAddress,
      });
    }

    return current;
  }

  private async saveUserExtraProfile(
    userId: string,
    email: string,
    patch: Partial<UserExtraProfile>,
  ): Promise<UserExtraProfile> {
    const current = await this.getUserExtraProfile(userId, email);
    const updated: UserExtraProfile = {
      fullName:
        patch.fullName !== undefined ? patch.fullName.trim() : current.fullName,
      phone: patch.phone !== undefined ? patch.phone.trim() : current.phone,
      address:
        patch.address !== undefined ? patch.address.trim() : current.address,
      notes: patch.notes !== undefined ? patch.notes.trim() : current.notes,
    };
    await this.redisService
      .getClient()
      .hset(`user:profile:${userId}`, updated);
    return updated;
  }

  async register(dto: RegisterDto): Promise<AuthTokensResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        password_hash: passwordHash,
        role: Role.CUSTOMER,
      },
    });

    const extra = await this.saveUserExtraProfile(user.id, user.email, {
      fullName: dto.fullName?.trim() || '',
      phone: dto.phone?.trim() || '',
      address: dto.address?.trim() || '',
      notes: '',
    });

    this.logger.log(
      JSON.stringify({
        event: 'USER_REGISTERED',
        userId: user.id,
        email: user.email,
      }),
    );

    return this.issueTokens(user.id, user.email, user.role, extra);
  }

  async login(dto: LoginDto): Promise<AuthTokensResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        orders: {
          select: { id: true },
          orderBy: { created_at: 'asc' },
          take: 5,
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const validPassword = await argon2.verify(user.password_hash, dto.password);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const extra = await this.syncUserProfileFromFirstOrder(
      user.id,
      user.email,
      user.orders.map((o) => o.id),
    );

    this.logger.log(
      JSON.stringify({
        event: 'USER_LOGIN_SUCCESS',
        userId: user.id,
        email: user.email,
      }),
    );

    return this.issueTokens(user.id, user.email, user.role, extra);
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.redisService.getClient().del(`auth:refresh:${userId}`);
    return { message: 'Logged out successfully' };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<AuthTokensResponse & { message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    const validCurrent = await argon2.verify(
      user.password_hash,
      dto.currentPassword,
    );
    if (!validCurrent) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from your current password',
      );
    }

    const newPasswordHash = await argon2.hash(dto.newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash: newPasswordHash },
    });

    const extra = await this.getUserExtraProfile(user.id, user.email);
    const tokens = await this.issueTokens(
      user.id,
      user.email,
      user.role,
      extra,
    );
    return {
      ...tokens,
      message: 'Password updated successfully',
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<AuthTokensResponse & { message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    let nextEmail = user.email;
    if (dto.email && dto.email.trim().toLowerCase() !== user.email) {
      nextEmail = dto.email.trim().toLowerCase();
      const existing = await this.prisma.user.findUnique({
        where: { email: nextEmail },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('That email address is already in use');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email: nextEmail },
    });

    const extra = await this.saveUserExtraProfile(updated.id, updated.email, {
      fullName: dto.fullName,
      phone: dto.phone,
      address: dto.address,
    });

    const tokens = await this.issueTokens(
      updated.id,
      updated.email,
      updated.role,
      extra,
    );
    return {
      ...tokens,
      message: 'Account profile updated successfully',
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokensResponse> {
    try {
      const refreshSecret = this.configService.get<string>(
        'JWT_REFRESH_SECRET',
        'super_secret_refresh_key_flashsale_2026',
      );
      const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(
        refreshToken,
        { secret: refreshSecret },
      );

      const storedToken = await this.redisService
        .getClient()
        .get(`auth:refresh:${payload.sub}`);

      if (!storedToken || storedToken !== refreshToken) {
        throw new UnauthorizedException(
          'Refresh token has been revoked or rotated',
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User account no longer exists');
      }

      const extra = await this.getUserExtraProfile(user.id, user.email);
      return this.issueTokens(user.id, user.email, user.role, extra);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        orders: {
          select: {
            id: true,
            status: true,
            total_amount: true,
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const extra = await this.syncUserProfileFromFirstOrder(
      user.id,
      user.email,
      user.orders.map((o) => o.id),
    );
    const totalOrders = user.orders.length;
    const paidOrders = user.orders.filter(
      (o) =>
        o.status === OrderStatus.PAID ||
        o.status === OrderStatus.DEPOSIT_PAID,
    ).length;
    const pendingOrders = user.orders.filter(
      (o) => o.status === OrderStatus.PENDING,
    ).length;
    const totalSpent = user.orders
      .filter(
        (o) =>
          o.status === OrderStatus.PAID ||
          o.status === OrderStatus.DEPOSIT_PAID,
      )
      .reduce((acc, o) => acc + Number(o.total_amount), 0);

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: extra.fullName,
      phone: extra.phone,
      address: extra.address,
      notes: extra.notes,
      created_at: user.created_at.toISOString(),
      stats: {
        totalOrders,
        paidOrders,
        pendingOrders,
        totalSpent: Number(totalSpent.toFixed(2)),
      },
    };
  }

  async listAllUsers() {
    const users = await this.prisma.user.findMany({
      include: {
        orders: {
          select: {
            id: true,
            status: true,
            total_amount: true,
          },
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: [{ role: 'asc' }, { created_at: 'desc' }],
    });

    const results = [];
    for (const u of users) {
      const extra = await this.syncUserProfileFromFirstOrder(
        u.id,
        u.email,
        u.orders.map((o) => o.id),
      );
      const paidOrders = u.orders.filter(
        (o) =>
          o.status === OrderStatus.PAID ||
          o.status === OrderStatus.DEPOSIT_PAID,
      );
      const expiredOrders = u.orders.filter(
        (o) => o.status === OrderStatus.EXPIRED,
      );
      const pendingOrders = u.orders.filter(
        (o) => o.status === OrderStatus.PENDING,
      );
      const cancelledOrders = u.orders.filter(
        (o) => o.status === OrderStatus.CANCELLED,
      );
      const totalSpent = paidOrders.reduce(
        (sum, o) => sum + Number(o.total_amount),
        0,
      );
      const isFlagged = expiredOrders.length > 0;
      const flagReason =
        expiredOrders.length > 0
          ? `Có ${expiredOrders.length} đơn quá hạn giữ chỗ không thanh toán`
          : null;

      results.push({
        id: u.id,
        email: u.email,
        role: u.role,
        fullName: extra.fullName,
        phone: extra.phone,
        address: extra.address,
        notes: extra.notes,
        created_at: u.created_at.toISOString(),
        totalOrders: u.orders.length,
        paidOrders: paidOrders.length,
        expiredOrders: expiredOrders.length,
        pendingOrders: pendingOrders.length,
        cancelledOrders: cancelledOrders.length,
        isFlagged,
        flagReason,
        totalSpent: Number(totalSpent.toFixed(2)),
      });
    }

    return results;
  }

  async adminCreateUser(dto: AdminCreateUserDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await argon2.hash(dto.password);
    const created = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        password_hash: passwordHash,
        role: dto.role ?? Role.CUSTOMER,
      },
    });

    const extra = await this.saveUserExtraProfile(created.id, created.email, {
      fullName: dto.fullName?.trim() || '',
      phone: dto.phone?.trim() || '',
      address: dto.address?.trim() || '',
      notes: dto.notes?.trim() || '',
    });

    return {
      id: created.id,
      email: created.email,
      role: created.role,
      fullName: extra.fullName,
      phone: extra.phone,
      address: extra.address,
      notes: extra.notes,
      created_at: created.created_at.toISOString(),
      totalOrders: 0,
      paidOrders: 0,
      expiredOrders: 0,
      pendingOrders: 0,
      cancelledOrders: 0,
      isFlagged: false,
      flagReason: null,
      totalSpent: 0,
    };
  }

  async adminUpdateUser(userId: string, dto: AdminUpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    let nextEmail = user.email;
    if (dto.email && dto.email.trim().toLowerCase() !== user.email) {
      nextEmail = dto.email.trim().toLowerCase();
      const conflict = await this.prisma.user.findUnique({
        where: { email: nextEmail },
      });
      if (conflict && conflict.id !== userId) {
        throw new ConflictException(`Email "${nextEmail}" is already in use`);
      }
    }

    let nextPasswordHash: string | undefined;
    if (dto.newPassword && dto.newPassword.trim().length >= 8) {
      nextPasswordHash = await argon2.hash(dto.newPassword.trim());
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: nextEmail,
        role: dto.role ?? undefined,
        password_hash: nextPasswordHash,
      },
    });

    const extra = await this.saveUserExtraProfile(updated.id, updated.email, {
      fullName: dto.fullName,
      phone: dto.phone,
      address: dto.address,
      notes: dto.notes,
    });

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      fullName: extra.fullName,
      phone: extra.phone,
      address: extra.address,
      notes: extra.notes,
      created_at: updated.created_at.toISOString(),
      message: `Updated account details for ${updated.email}`,
    };
  }

  async adminUpdateUserRole(userId: string, role: Role) {
    return this.adminUpdateUser(userId, { role });
  }

  async adminResetUserPassword(userId: string, newPassword: string) {
    return this.adminUpdateUser(userId, { newPassword });
  }

  async adminDeleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { orders: true },
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      const orderIds = user.orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await tx.payment.deleteMany({ where: { order_id: { in: orderIds } } });
        await tx.orderItem.deleteMany({
          where: { order_id: { in: orderIds } },
        });
        await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      }
      await tx.user.delete({ where: { id: userId } });
    });

    await this.redisService
      .getClient()
      .del(`user:profile:${userId}`, `auth:refresh:${userId}`);

    return {
      deletedId: userId,
      email: user.email,
    };
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: Role,
    extra?: UserExtraProfile,
  ): Promise<AuthTokensResponse> {
    const payload: AuthenticatedUser = {
      sub: userId,
      email,
      role,
    };

    const accessSecret = this.configService.get<string>(
      'JWT_ACCESS_SECRET',
      'super_secret_access_key_flashsale_2026',
    );
    const refreshSecret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'super_secret_refresh_key_flashsale_2026',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: '7d',
      }),
    ]);

    await this.redisService
      .getClient()
      .set(`auth:refresh:${userId}`, refreshToken, 'EX', 7 * 24 * 3600);

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email,
        role,
        fullName: extra?.fullName,
        phone: extra?.phone,
        address: extra?.address,
      },
    };
  }
}
