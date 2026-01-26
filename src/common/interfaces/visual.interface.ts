export interface VisualMetadata {
  resolution: string;
  ratio: string;
  generation_time_ms?: number;
}

export interface VisualCamera {
  focal_length_mm: number;
  aperture: number;
  focus: string;
  angle?: string;
}

export interface Visual {
  type: string;
  display_name: string;
  style_name: string;
  prompt: string;
  negative_prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  image_url?: string;
  image_filename?: string;
  generated_at?: string;
  camera: VisualCamera;
  metadata: VisualMetadata;
}
