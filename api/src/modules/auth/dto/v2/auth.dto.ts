import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body of refresh and logout. Only native clients (`X-Coco-Client: native`)
 * send it; the web's refresh token travels in its httpOnly cookie.
 */
export class RefreshInput {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken?: string;
}
