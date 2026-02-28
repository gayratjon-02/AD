import { IsUUID, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreatePackshotDto {
  @IsUUID()
  product_id: string;

  @IsBoolean()
  @IsOptional()
  hanger_mode?: boolean; // default true (hanger), false = ghost mannequin

  @IsString()
  @IsOptional()
  detail_1_focus?: string; // auto-detected if not provided

  @IsString()
  @IsOptional()
  detail_2_focus?: string; // auto-detected if not provided
}
