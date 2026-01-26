export interface BackgroundInfo {
  color_hex: string;
  color_name: string;
  description: string;
  texture?: string;
}

export interface PropsInfo {
  items: string[];
  placement: string;
  style: string;
}

export interface LightingInfo {
  type: string;
  temperature: string;
  direction: string;
  intensity: string;
}

export interface CompositionInfo {
  layout: string;
  poses: string;
  framing: string;
}

export interface StylingInfo {
  bottom: string;
  feet: string;
  accessories?: string;
}

export interface CameraInfo {
  focal_length_mm: number;
  aperture: number;
  focus: string;
}

export interface AnalyzedDAJSON {
  background: BackgroundInfo;
  props: PropsInfo;
  mood: string;
  lighting: LightingInfo;
  composition: CompositionInfo;
  styling: StylingInfo;
  camera: CameraInfo;
  quality: string;
  analyzed_at?: string;
}

export interface FixedElements {
  background: {
    wall_hex: string;
    wall_description: string;
    floor_hex: string;
    floor_description: string;
  };
  props: {
    left: string[];
    right: string[];
    center: string[];
  };
  styling: {
    bottom: string;
    feet: string;
  };
  lighting: string;
  mood: string;
  composition_defaults: {
    duo?: string;
    solo?: string;
    [key: string]: string | undefined;
  };
}
