

export interface ImageLabelConfig {
    frontImages: string[];
    backImages: string[];
    referenceImages: string[];
    productName?: string;
}


export function generateImageContext(config: ImageLabelConfig): string {
    const lines: string[] = [];
    let imageIndex = 1;

    lines.push('');
    lines.push('══════════════════════════════════════════════════════════════════════════════');
    lines.push('📸 IMAGE GUIDE');
    lines.push('══════════════════════════════════════════════════════════════════════════════');

    // FRONT IMAGES
    if (config.frontImages?.length) {
        lines.push('');
        lines.push('┌─────────────────────────────────────────────────────────────────┐');
        lines.push(`│ FRONT IMAGES (${config.frontImages.length}) → USE FOR: design_front              │`);
        lines.push('│ Extract: logo, front pockets, closure, waistband               │');
        lines.push('└─────────────────────────────────────────────────────────────────┘');

        for (let i = 0; i < config.frontImages.length; i++) {
            lines.push(`  Image ${imageIndex}: FRONT VIEW ${i + 1}`);
            imageIndex++;
        }
    }

    // BACK IMAGES
    if (config.backImages?.length) {
        lines.push('');
        lines.push('┌─────────────────────────────────────────────────────────────────┐');
        lines.push(`│ BACK IMAGES (${config.backImages.length}) → USE FOR: design_back                │`);
        lines.push('│ Extract: patch, back pocket, seams                             │');
        lines.push('│                                                                │');
        lines.push('│ ⚠️ REMINDER: If patch on RIGHT of screen → WEARER\'S LEFT       │');
        lines.push('└─────────────────────────────────────────────────────────────────┘');

        for (let i = 0; i < config.backImages.length; i++) {
            lines.push(`  Image ${imageIndex}: BACK VIEW ${i + 1}`);
            imageIndex++;
        }
    }

    // REFERENCE IMAGES
    if (config.referenceImages?.length) {
        lines.push('');
        lines.push('┌─────────────────────────────────────────────────────────────────┐');
        lines.push(`│ REFERENCE IMAGES (${config.referenceImages.length}) → SUPPLEMENTARY ONLY          │`);
        lines.push('│ Use to: verify texture, check hardware color, see fit         │');
        lines.push('│ DO NOT use to override front/back observations                │');
        lines.push('└─────────────────────────────────────────────────────────────────┘');

        for (let i = 0; i < config.referenceImages.length; i++) {
            lines.push(`  Image ${imageIndex}: REFERENCE ${i + 1}`);
            imageIndex++;
        }
    }

    // TOTAL
    lines.push('');
    lines.push(`TOTAL: ${imageIndex - 1} images`);

    // PRODUCT NAME
    if (config.productName) {
        lines.push(`PRODUCT NAME: ${config.productName}`);
    }

    lines.push('══════════════════════════════════════════════════════════════════════════════');
    lines.push('');

    return lines.join('\n');
}


export function getPantsSpecificPrompt(): string {
    return `
⚠️ PANTS-SPECIFIC RULES:
1. ANKLE: Check for zipper OR elastic cuff (NEVER both!)
2. BACK POCKET: Usually above patch, welt style
3. PATCH POSITION: Always use "WEARER'S LEFT" or "WEARER'S RIGHT"
4. WAISTBAND: Report height (cm), drawstring, eyelets
`;
}

export function getJacketSpecificPrompt(): string {
    return `
⚠️ JACKET-SPECIFIC RULES:
1. COLLAR: Type, height, closure style
2. CUFFS: Ribbed (bomber) or plain (trucker)?
3. HEM: Ribbed waistband (bomber) or straight (overshirt)?
4. ZIPPER: Color, teeth size, puller shape
`;
}




