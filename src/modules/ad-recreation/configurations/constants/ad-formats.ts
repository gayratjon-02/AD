/**
 * Ad Formats - Static data for frontend dropdown
 *
 * Standard ad format dimensions for social media platforms.
 * Safe zones ensure content stays within platform-visible areas.
 *
 * Safe zone data from client spec v3 (Feb 2026):
 * - danger_top: hidden by status bar, username, audio pill
 * - danger_bottom: hidden by CTA button, captions, nav bar
 * - danger_sides: side margins for safe content
 * - usable_area: computed rectangle where content is visible
 */

export interface SafeZone {
    danger_top: number;
    danger_bottom: number;
    danger_sides: number;
    usable_area: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export interface AdFormat {
    id: string;
    label: string;
    ratio: string;
    dimensions: string;
    width: number;
    height: number;
    safe_zone: SafeZone;
}

export const AD_FORMATS: AdFormat[] = [
    {
        id: 'story',
        label: 'Instagram Story',
        ratio: '9:16',
        dimensions: '1080x1920',
        width: 1080,
        height: 1920,
        safe_zone: {
            danger_top: 250,       // status bar + username
            danger_bottom: 340,    // CTA + reactions
            danger_sides: 60,
            usable_area: { x: 60, y: 250, width: 960, height: 1330 },
        },
    },
    {
        id: 'square',
        label: 'Instagram Post',
        ratio: '1:1',
        dimensions: '1080x1080',
        width: 1080,
        height: 1080,
        safe_zone: {
            danger_top: 80,
            danger_bottom: 120,    // CTA overlay
            danger_sides: 60,
            usable_area: { x: 60, y: 80, width: 960, height: 880 },
        },
    },
    {
        id: 'portrait',
        label: 'Portrait',
        ratio: '4:5',
        dimensions: '1080x1350',
        width: 1080,
        height: 1350,
        safe_zone: {
            danger_top: 80,
            danger_bottom: 150,
            danger_sides: 60,
            usable_area: { x: 60, y: 80, width: 960, height: 1120 },
        },
    },
    {
        id: 'landscape',
        label: 'Landscape',
        ratio: '16:9',
        dimensions: '1920x1080',
        width: 1920,
        height: 1080,
        safe_zone: {
            danger_top: 60,
            danger_bottom: 100,
            danger_sides: 80,
            usable_area: { x: 80, y: 60, width: 1760, height: 920 },
        },
    },
];

