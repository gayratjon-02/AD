/**
 * Marketing Angles - Static data for frontend dropdown
 *
 * 22 common marketing angles used in ad creation.
 */

export interface MarketingAngle {
    id: string;
    label: string;
    description: string;
}

export const MARKETING_ANGLES: MarketingAngle[] = [
    {
        id: 'problem_solution',
        label: 'Problem / Solution',
        description: 'Present a common pain point and position the product as the ideal solution.',
    },
    {
        id: 'before_after',
        label: 'Before & After',
        description: 'Show a dramatic transformation from the problem state to the desired outcome.',
    },
    {
        id: 'social_proof',
        label: 'Social Proof / Reviews',
        description: 'Leverage customer testimonials, ratings, or user counts to build trust.',
    },
    {
        id: 'fomo',
        label: 'Urgency / FOMO',
        description: 'Create fear of missing out with limited-time offers or scarcity cues.',
    },
    {
        id: 'feature_highlight',
        label: 'Feature Highlight',
        description: 'Spotlight a specific product feature that sets it apart from alternatives.',
    },
    {
        id: 'cost_savings',
        label: 'Cost Savings',
        description: 'Emphasize monetary savings, ROI, or value-for-money compared to competitors.',
    },
    {
        id: 'us_vs_them',
        label: 'Us vs. Competitors',
        description: 'Directly compare your product against competitors to highlight advantages.',
    },
    {
        id: 'storytelling',
        label: 'Storytelling',
        description: 'Use a narrative arc to emotionally connect the audience with the brand.',
    },
    {
        id: 'minimalist',
        label: 'Minimalist',
        description: 'Use clean design with minimal text to let the product speak for itself.',
    },
    {
        id: 'luxury',
        label: 'Luxury',
        description: 'Convey premium quality through elegant visuals and aspirational messaging.',
    },
    {
        id: 'urgent',
        label: 'Urgent',
        description: 'Drive immediate action with countdown timers, flash sales, or deadline messaging.',
    },
    {
        id: 'educational',
        label: 'Educational',
        description: 'Teach the audience something valuable while naturally introducing the product.',
    },
    {
        id: 'how_to',
        label: 'How To',
        description: 'Walk the viewer through a step-by-step process that features the product.',
    },
    {
        id: 'myth_buster',
        label: 'Myth Buster',
        description: 'Debunk a common misconception to position the product as the truth.',
    },
    {
        id: 'benefit_stacking',
        label: 'Benefit Stacking',
        description: 'List multiple benefits in rapid succession to overwhelm with value.',
    },
    {
        id: 'curiosity_gap',
        label: 'Curiosity Gap',
        description: 'Tease an intriguing fact or result to compel the viewer to learn more.',
    },
    {
        id: 'expert_endorsement',
        label: 'Expert Endorsement',
        description: 'Feature industry experts or authority figures vouching for the product.',
    },
    {
        id: 'user_generated',
        label: 'User Generated',
        description: 'Showcase real content created by actual customers for authentic appeal.',
    },
    {
        id: 'lifestyle',
        label: 'Lifestyle',
        description: 'Associate the product with a desirable lifestyle or aspirational identity.',
    },
    {
        id: 'contrast',
        label: 'Contrast',
        description: 'Juxtapose two opposing scenarios to make the product benefit stand out.',
    },
    {
        id: 'question',
        label: 'Question',
        description: 'Open with a provocative question that hooks the viewer into engaging.',
    },
    {
        id: 'guarantee',
        label: 'Guarantee',
        description: 'Reduce purchase risk by highlighting money-back or satisfaction guarantees.',
    },
];
