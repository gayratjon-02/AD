/**
 * Marketing Angles — P0 Spec v4 (Feb 2026)
 *
 * An angle is a marketing message direction. Same ad layout, different story.
 * The user picks which angles to generate from a checkbox list.
 *
 * 22 pre-defined angles organized by 5 categories:
 * - PROBLEM_FOCUSED: Present pain points and transformations
 * - TRUST_PROOF: Build trust through evidence and endorsements
 * - VALUE_FEATURES: Highlight benefits and competitive advantages
 * - ENGAGEMENT: Connect through stories and education
 * - LIFESTYLE_BRAND: Associate with aspirational identity
 *
 * IDs MUST match the frontend AngleSelector.tsx exactly.
 *
 * Each angle includes:
 * - hook: The opening line / headline template
 * - narrative_arc: { problem, discovery, result, payoff }
 * - target_persona: Who this angle speaks to
 * - funnel_stage: TOFU (awareness), MOFU (consideration), BOFU (decision)
 * - cta_options: Suggested CTA button texts
 * - compliance_notes: Any regulatory cautions
 */

export type AngleCategory = 'problem_focused' | 'trust_proof' | 'value_features' | 'engagement' | 'lifestyle_brand';
export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

export interface NarrativeArc {
    problem: string;
    discovery: string;
    result: string;
    payoff: string;
}

export interface MarketingAngle {
    id: string;
    label: string;
    description: string;
    category: AngleCategory;
    hook: string;
    narrative_arc: NarrativeArc;
    target_persona: string;
    funnel_stage: FunnelStage[];
    cta_options: string[];
    compliance_notes: string;
}

export const MARKETING_ANGLES: MarketingAngle[] = [
    // ═══════════════════════════════════════════════════════════
    // PROBLEM-FOCUSED (4) — Present pain points and transformations
    // ═══════════════════════════════════════════════════════════
    {
        id: 'problem_solution',
        label: 'Problem / Solution',
        description: 'Present a specific pain point the audience faces and position the product as the clear solution.',
        category: 'problem_focused',
        hook: 'Tired of dealing with this every single day?',
        narrative_arc: {
            problem: 'A recurring frustration or unmet need in daily life',
            discovery: 'Found a product that directly addresses the root cause',
            result: 'The problem is resolved or significantly reduced',
            payoff: 'Life is easier, smoother, and more enjoyable',
        },
        target_persona: 'Anyone experiencing a specific frustration that the product solves',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Solve It Now', 'See How It Works', 'Get the Solution'],
        compliance_notes: 'Ensure problem claims are relatable and not exaggerated.',
    },
    {
        id: 'before_after',
        label: 'Before & After',
        description: 'Show a dramatic transformation — the contrast between life before and after the product.',
        category: 'problem_focused',
        hook: 'This is what changed everything for me',
        narrative_arc: {
            problem: 'A visible or felt struggle in the before state',
            discovery: 'Tried the product and committed to the process',
            result: 'A clear, dramatic transformation occurred',
            payoff: 'Life looks and feels completely different now',
        },
        target_persona: 'Visual-driven buyer who responds to transformation stories, 25-55',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['See the Difference', 'Transform Now', 'Start Your Journey'],
        compliance_notes: 'Transformations must be realistic. Avoid misleading before/after imagery.',
    },
    {
        id: 'myth_buster',
        label: 'Myth Buster',
        description: 'Debunk a common misconception in the industry and position the product as the truth.',
        category: 'problem_focused',
        hook: 'Everyone told you this was true. They were wrong.',
        narrative_arc: {
            problem: 'A widespread myth or misconception that misleads buyers',
            discovery: 'Research or experience reveals the truth',
            result: 'The product works because it follows the real science/logic',
            payoff: 'Smarter buying decision, better results',
        },
        target_persona: 'Educated, skeptical buyer who values truth over hype, 25-50',
        funnel_stage: ['TOFU'],
        cta_options: ['Learn the Truth', 'Bust the Myth', 'See for Yourself'],
        compliance_notes: 'Claims must be factually accurate and verifiable.',
    },
    {
        id: 'contrast',
        label: 'Contrast',
        description: 'Juxtapose two opposing scenarios — the struggle without vs. the ease with the product.',
        category: 'problem_focused',
        hook: 'One choice. Two completely different outcomes.',
        narrative_arc: {
            problem: 'Life without the product is harder, slower, or less satisfying',
            discovery: 'A simple switch changes the entire experience',
            result: 'Side-by-side comparison shows the clear winner',
            payoff: 'The choice becomes obvious',
        },
        target_persona: 'Decisive buyer who responds to clear comparisons, any age',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Make the Switch', 'Choose Better', 'See the Difference'],
        compliance_notes: 'Comparisons must be fair and not disparaging.',
    },

    // ═══════════════════════════════════════════════════════════
    // TRUST & PROOF (5) — Build trust through evidence
    // ═══════════════════════════════════════════════════════════
    {
        id: 'social_proof',
        label: 'Social Proof',
        description: 'Use testimonials, ratings, and real customer feedback to build instant trust.',
        category: 'trust_proof',
        hook: '2,400+ 5-star reviews can\'t be wrong',
        narrative_arc: {
            problem: 'Uncertain if the product actually delivers on its promises',
            discovery: 'Thousands of real customers have shared their experience',
            result: 'Overwhelming positive feedback from verified buyers',
            payoff: 'Confidence to buy based on community consensus',
        },
        target_persona: 'Review-checking buyer who needs social validation, any age',
        funnel_stage: ['MOFU', 'BOFU'],
        cta_options: ['Read Reviews', 'Join Happy Customers', 'See Why They Love It'],
        compliance_notes: 'Review counts and ratings must be accurate and current.',
    },
    {
        id: 'expert_endorsement',
        label: 'Expert Endorsement',
        description: 'Authority figures, professionals, or industry experts vouch for the product.',
        category: 'trust_proof',
        hook: 'Recommended by leading professionals in the field',
        narrative_arc: {
            problem: 'Need expert validation before trusting a product',
            discovery: 'Respected authorities have tested and approved the product',
            result: 'Expert endorsement provides credibility and confidence',
            payoff: 'Trust the product because trusted experts trust it',
        },
        target_persona: 'Authority-driven buyer who values professional opinions, 30-60',
        funnel_stage: ['MOFU'],
        cta_options: ['Expert Approved', 'See Who Recommends It', 'Trusted by Pros'],
        compliance_notes: 'Expert endorsements must be genuine and disclosed. Follow FTC guidelines.',
    },
    {
        id: 'user_generated',
        label: 'User Generated',
        description: 'Real customer content — unboxing, reviews, photos — feels authentic and relatable.',
        category: 'trust_proof',
        hook: 'Real customers. Real results. No filters.',
        narrative_arc: {
            problem: 'Polished brand ads feel unreliable, want to see real usage',
            discovery: 'Actual customers sharing their genuine experience',
            result: 'Authentic, unfiltered content shows the real product',
            payoff: 'Trust built through transparency, not marketing polish',
        },
        target_persona: 'Authenticity-seeking buyer, especially younger demographics, 18-40',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['See Real Results', 'Join the Community', 'Share Your Story'],
        compliance_notes: 'UGC must be genuine. Disclose if incentivized.',
    },
    {
        id: 'guarantee',
        label: 'Guarantee',
        description: 'Money-back or satisfaction guarantee removes all purchase risk.',
        category: 'trust_proof',
        hook: 'Try it risk-free. Love it or get your money back.',
        narrative_arc: {
            problem: 'Fear of wasting money on something that might not work',
            discovery: 'The brand offers a no-questions-asked guarantee',
            result: 'Zero risk in trying — the worst case is a full refund',
            payoff: 'Freedom to try without financial worry',
        },
        target_persona: 'Risk-averse buyer who needs reassurance, any age',
        funnel_stage: ['BOFU'],
        cta_options: ['Try Risk-Free', 'Money-Back Guarantee', '100% Satisfaction'],
        compliance_notes: 'Guarantee terms must be clearly stated and honored.',
    },
    {
        id: 'fomo',
        label: 'Urgency / FOMO',
        description: 'Limited-time offers or scarcity create urgency to act now.',
        category: 'trust_proof',
        hook: 'Only 48 hours left. Don\'t miss this.',
        narrative_arc: {
            problem: 'Procrastination and indecision delay the purchase',
            discovery: 'A limited-time offer creates a reason to act now',
            result: 'Acted fast and secured the deal before it expired',
            payoff: 'Got the product at the best price / before it sold out',
        },
        target_persona: 'Deal-sensitive buyer who responds to deadlines, any age',
        funnel_stage: ['BOFU'],
        cta_options: ['Act Now', 'Limited Time Only', 'Don\'t Miss Out'],
        compliance_notes: 'Scarcity claims must be genuine. Do not create false urgency.',
    },

    // ═══════════════════════════════════════════════════════════
    // VALUE & FEATURES (4) — Highlight benefits and advantages
    // ═══════════════════════════════════════════════════════════
    {
        id: 'cost_savings',
        label: 'Cost Savings',
        description: 'Highlight long-term savings, ROI, and value-for-money compared to alternatives.',
        category: 'value_features',
        hook: 'Stop overpaying. Start saving.',
        narrative_arc: {
            problem: 'Spending too much on recurring or overpriced alternatives',
            discovery: 'This product delivers better value at a lower total cost',
            result: 'Significant savings over time with same or better quality',
            payoff: 'More money in your pocket, better product in your hands',
        },
        target_persona: 'Value-conscious buyer comparing options, 25-55',
        funnel_stage: ['MOFU', 'BOFU'],
        cta_options: ['Start Saving', 'See the Value', 'Compare the Cost'],
        compliance_notes: 'Use "up to" or "typical savings" language. Ensure comparison is fair.',
    },
    {
        id: 'feature_highlight',
        label: 'Feature Highlight',
        description: 'Spotlight a single standout feature that differentiates the product.',
        category: 'value_features',
        hook: 'One feature. Total game-changer.',
        narrative_arc: {
            problem: 'Other products lack this specific capability or feature',
            discovery: 'This product has a standout feature that changes everything',
            result: 'The feature delivers a tangible, noticeable benefit',
            payoff: 'Once you experience it, you can\'t go back',
        },
        target_persona: 'Detail-oriented buyer who values specific capabilities, 25-50',
        funnel_stage: ['MOFU'],
        cta_options: ['See the Feature', 'Experience It', 'Learn More'],
        compliance_notes: 'Feature claims must be accurate and demonstrable.',
    },
    {
        id: 'benefit_stacking',
        label: 'Benefit Stacking',
        description: 'List multiple benefits together to show overwhelming value.',
        category: 'value_features',
        hook: 'Not just one benefit. Here are seven.',
        narrative_arc: {
            problem: 'Skeptical that one product can deliver real value',
            discovery: 'The product offers multiple, stacking benefits',
            result: 'Each benefit adds to the overall value proposition',
            payoff: 'Comprehensive solution that covers all needs',
        },
        target_persona: 'Thorough researcher who wants complete solutions, 30-55',
        funnel_stage: ['MOFU', 'BOFU'],
        cta_options: ['See All Benefits', 'Get Everything', 'Full Package'],
        compliance_notes: 'All listed benefits must be accurate.',
    },
    {
        id: 'us_vs_them',
        label: 'Us vs. Competitors',
        description: 'Direct comparison showing clear advantages over competitor products.',
        category: 'value_features',
        hook: 'Why people are switching from the other guys',
        narrative_arc: {
            problem: 'Currently using an inferior competitor product',
            discovery: 'A side-by-side comparison reveals the better option',
            result: 'Clear advantages in quality, price, or experience',
            payoff: 'Switched and never looked back',
        },
        target_persona: 'Comparison shopper actively evaluating options, 25-50',
        funnel_stage: ['MOFU', 'BOFU'],
        cta_options: ['Compare Now', 'See Why We Win', 'Make the Switch'],
        compliance_notes: 'Competitor comparisons must be fair, factual, and not defamatory.',
    },

    // ═══════════════════════════════════════════════════════════
    // ENGAGEMENT (5) — Connect through stories and education
    // ═══════════════════════════════════════════════════════════
    {
        id: 'storytelling',
        label: 'Storytelling',
        description: 'Tell an emotional narrative arc that naturally leads to the product.',
        category: 'engagement',
        hook: 'Let me tell you a story that changed everything',
        narrative_arc: {
            problem: 'A relatable character faces a meaningful challenge',
            discovery: 'Through their journey, they encounter the product',
            result: 'The product becomes a turning point in their story',
            payoff: 'An emotional, satisfying conclusion that inspires action',
        },
        target_persona: 'Emotionally driven buyer who connects through stories, 25-55',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Start Your Story', 'Begin the Journey', 'Write Your Chapter'],
        compliance_notes: 'Stories should be relatable and not misleading.',
    },
    {
        id: 'educational',
        label: 'Educational',
        description: 'Teach the audience something valuable while naturally introducing the product.',
        category: 'engagement',
        hook: 'Most people don\'t know this, but...',
        narrative_arc: {
            problem: 'Lack of knowledge leads to poor decisions or missed opportunities',
            discovery: 'Educational content reveals insights and the product\'s role',
            result: 'Audience learns something valuable and sees the product differently',
            payoff: 'Informed decision to purchase based on understanding, not hype',
        },
        target_persona: 'Curious, knowledge-seeking buyer, 25-50',
        funnel_stage: ['TOFU'],
        cta_options: ['Learn More', 'Discover How', 'See the Science'],
        compliance_notes: 'Educational claims must be accurate and well-sourced.',
    },
    {
        id: 'how_to',
        label: 'How To',
        description: 'Step-by-step process showing how to use or benefit from the product.',
        category: 'engagement',
        hook: '3 simple steps to transform your routine',
        narrative_arc: {
            problem: 'Unsure how to get started or how the product fits in',
            discovery: 'A clear, simple process makes it accessible',
            result: 'Following the steps leads to visible results',
            payoff: 'Anyone can do it — the process is simple and effective',
        },
        target_persona: 'Practical buyer who values clear instructions, any age',
        funnel_stage: ['MOFU'],
        cta_options: ['See How', 'Try These Steps', 'Get Started'],
        compliance_notes: 'Steps must be accurate and achievable.',
    },
    {
        id: 'curiosity_gap',
        label: 'Curiosity Gap',
        description: 'Tease an intriguing result or secret that compels the audience to learn more.',
        category: 'engagement',
        hook: 'The one thing nobody tells you about this',
        narrative_arc: {
            problem: 'There\'s a hidden insight or secret most people miss',
            discovery: 'A teaser creates irresistible curiosity to learn more',
            result: 'The reveal connects the insight to the product',
            payoff: 'Satisfaction of discovering something others don\'t know',
        },
        target_persona: 'Curious, scroll-stopping audience, 18-45',
        funnel_stage: ['TOFU'],
        cta_options: ['Find Out', 'Discover the Secret', 'Learn Why'],
        compliance_notes: 'Do not use clickbait. The reveal must match the tease.',
    },
    {
        id: 'question',
        label: 'Question',
        description: 'Hook with a provocative or relatable question that demands an answer.',
        category: 'engagement',
        hook: 'Have you ever wondered why this keeps happening?',
        narrative_arc: {
            problem: 'A question highlights a pain point or unmet desire',
            discovery: 'The question leads naturally to the product as the answer',
            result: 'The audience sees the product as the logical response',
            payoff: 'From question to conviction in one smooth flow',
        },
        target_persona: 'Engaged, thoughtful audience who responds to questions, any age',
        funnel_stage: ['TOFU'],
        cta_options: ['Get the Answer', 'Find Out', 'Yes, Show Me'],
        compliance_notes: 'Questions must be genuine and not misleading.',
    },

    // ═══════════════════════════════════════════════════════════
    // LIFESTYLE & BRAND (4) — Associate with aspirational identity
    // ═══════════════════════════════════════════════════════════
    {
        id: 'lifestyle',
        label: 'Lifestyle',
        description: 'Associate the product with an aspirational identity and way of living.',
        category: 'lifestyle_brand',
        hook: 'This isn\'t just a product. It\'s a way of life.',
        narrative_arc: {
            problem: 'Current lifestyle feels incomplete or uninspired',
            discovery: 'The product represents the lifestyle the audience aspires to',
            result: 'Owning the product elevates daily experience and identity',
            payoff: 'Living the life you\'ve always imagined',
        },
        target_persona: 'Aspirational buyer who shops for identity, 22-45',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Live the Life', 'Elevate Your Style', 'Join the Movement'],
        compliance_notes: 'Lifestyle claims should be aspirational but achievable.',
    },
    {
        id: 'luxury',
        label: 'Luxury',
        description: 'Premium quality, elegance, and exclusivity — the product is a luxury experience.',
        category: 'lifestyle_brand',
        hook: 'Crafted for those who demand the finest',
        narrative_arc: {
            problem: 'Settling for ordinary when you deserve extraordinary',
            discovery: 'A product that meets the highest standards of quality',
            result: 'The premium experience is felt in every detail',
            payoff: 'Indulgence and satisfaction that justify the investment',
        },
        target_persona: 'Affluent buyer who values quality over price, 30-60',
        funnel_stage: ['MOFU', 'BOFU'],
        cta_options: ['Experience Luxury', 'Discover Premium', 'Indulge Yourself'],
        compliance_notes: 'Luxury claims must match product quality and pricing.',
    },
    {
        id: 'minimalist',
        label: 'Minimalist',
        description: 'Clean, simple design where the product speaks for itself without noise.',
        category: 'lifestyle_brand',
        hook: 'Less noise. More substance.',
        narrative_arc: {
            problem: 'Overwhelmed by cluttered, noisy marketing and options',
            discovery: 'A product that embraces simplicity and clarity',
            result: 'The clean design and focused purpose deliver calm confidence',
            payoff: 'Elegance through simplicity — no extras, no fluff',
        },
        target_persona: 'Design-conscious buyer who values simplicity, 25-45',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Keep It Simple', 'Pure Design', 'See the Difference'],
        compliance_notes: 'None.',
    },
    {
        id: 'urgent',
        label: 'Urgent',
        description: 'Countdown, deadline messaging, and time-sensitive offers that drive immediate action.',
        category: 'lifestyle_brand',
        hook: 'Last chance. This offer ends tonight.',
        narrative_arc: {
            problem: 'The desire to buy is there but action keeps getting delayed',
            discovery: 'A genuine deadline creates the push to act now',
            result: 'Made the decision and secured the product in time',
            payoff: 'Relief and excitement from acting decisively',
        },
        target_persona: 'Ready-to-buy audience who needs a final push, any age',
        funnel_stage: ['BOFU'],
        cta_options: ['Act Now', 'Claim Before Midnight', 'Last Chance'],
        compliance_notes: 'Deadlines and countdowns must be genuine. Do not create false urgency.',
    },
];

/**
 * Get angles grouped by category for display
 */
export function getAnglesGroupedByCategory(): Record<AngleCategory, MarketingAngle[]> {
    const grouped: Record<AngleCategory, MarketingAngle[]> = {
        problem_focused: [],
        trust_proof: [],
        value_features: [],
        engagement: [],
        lifestyle_brand: [],
    };

    for (const angle of MARKETING_ANGLES) {
        grouped[angle.category].push(angle);
    }

    return grouped;
}

/**
 * Category display labels
 */
export const ANGLE_CATEGORY_LABELS: Record<AngleCategory, string> = {
    problem_focused: 'Problem-Focused',
    trust_proof: 'Trust & Proof',
    value_features: 'Value & Features',
    engagement: 'Engagement',
    lifestyle_brand: 'Lifestyle & Brand',
};
