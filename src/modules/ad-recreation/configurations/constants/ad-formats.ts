/**
 * Ad Formats - Static data for frontend dropdown
 *
 * Standard ad format dimensions for social media platforms.
 */

export interface AdFormat {
    id: string;
    label: string;
    ratio: string;
    dimensions: string;
}

export const AD_FORMATS: AdFormat[] = [
    {
        id: 'story',
        label: 'Instagram Story',
        ratio: '9:16',
        dimensions: '1080x1920',
    },
    {
        id: 'square',
        label: 'Instagram Post',
        ratio: '1:1',
        dimensions: '1080x1080',
    },
    {
        id: 'portrait',
        label: 'Portrait',
        ratio: '4:5',
        dimensions: '1080x1350',
    },
    {
        id: 'landscape',
        label: 'Landscape',
        ratio: '16:9',
        dimensions: '1920x1080',
    },
];
