export interface PromptCamera {
  focal_length_mm: number;
  aperture: number;
  focus: string;
  angle?: string;
}

export interface PromptBackground {
  wall: string;
  floor: string;
}

export interface ProductDetailsInPrompt {
  type: string;
  color: string;
  piping?: string;
  zip?: string;
  logos?: string;
  [key: string]: any;
}

export interface DAElementsInPrompt {
  background: string;
  props: string;
  mood: string;
  composition?: string;
  [key: string]: any;
}

export interface MergedPromptObject {
  type: string;
  display_name: string;
  prompt: string;
  negative_prompt: string;
  camera: PromptCamera;
  background: PromptBackground;
  product_details: ProductDetailsInPrompt;
  da_elements: DAElementsInPrompt;
  editable?: boolean;
  last_edited_at?: string | null;
}

export interface MergedPrompts {
  duo: MergedPromptObject;
  solo: MergedPromptObject;
  flatlay_front: MergedPromptObject;
  flatlay_back: MergedPromptObject;
  closeup_front: MergedPromptObject;
  closeup_back: MergedPromptObject;
}
