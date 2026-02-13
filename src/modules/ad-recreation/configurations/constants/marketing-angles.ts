/**
 * Marketing Angles — P0 Spec v3 (Feb 2026)
 *
 * An angle is a marketing message direction. Same ad layout, different story.
 * The user picks which angles to generate from a checkbox list.
 *
 * 22 pre-defined angles organized by 5 categories:
 * - PAIN_POINTS: Address specific problems the audience faces
 * - OBJECTIONS: Overcome purchase barriers and hesitations
 * - VALUE: Highlight financial and practical benefits
 * - SOCIAL_PROOF: Build trust through evidence and community
 * - EMOTIONAL: Connect on a personal, emotional level
 *
 * Each angle includes:
 * - hook: The opening line / headline template
 * - narrative_arc: { problem, discovery, result, payoff }
 * - target_persona: Who this angle speaks to
 * - funnel_stage: TOFU (awareness), MOFU (consideration), BOFU (decision)
 * - cta_options: Suggested CTA button texts
 * - compliance_notes: Any regulatory cautions
 */

export type AngleCategory = 'pain_points' | 'objections' | 'value' | 'social_proof' | 'emotional';
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
    // PAIN POINTS — Address specific problems
    // ═══════════════════════════════════════════════════════════
    {
        id: 'back_pain',
        label: 'Back Pain Relief',
        description: 'Target people suffering from chronic back pain who are looking for a home solution.',
        category: 'pain_points',
        hook: 'My back was getting worse every single day',
        narrative_arc: {
            problem: 'Chronic back pain from desk work / daily life',
            discovery: 'Friend recommended the product',
            result: 'Pain reduced significantly after 3-4 weeks',
            payoff: 'Can play with kids / enjoy life again without pain',
        },
        target_persona: 'Office worker 35-50 with back pain',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Try It Now', 'Fix Your Back', 'Start Feeling Better'],
        compliance_notes: 'Do not claim medical cure. Use language like "may help" or "users reported".',
    },
    {
        id: 'low_energy',
        label: 'Low Energy',
        description: 'Target people who feel exhausted and drained, looking for ways to boost daily energy.',
        category: 'pain_points',
        hook: 'I was exhausted by 3pm every day',
        narrative_arc: {
            problem: 'Constant fatigue, no energy for daily activities',
            discovery: 'Saw the product recommended online / by a friend',
            result: 'Energy levels improved, more productive throughout the day',
            payoff: 'Finally able to keep up with life and enjoy evenings',
        },
        target_persona: 'Busy professional 30-50 experiencing daily fatigue',
        funnel_stage: ['TOFU'],
        cta_options: ['Boost Your Energy', 'Feel Alive Again', 'Try It Today'],
        compliance_notes: 'Do not make medical energy claims. Focus on lifestyle improvement.',
    },
    {
        id: 'poor_posture',
        label: 'Poor Posture',
        description: 'Target people with posture issues from prolonged sitting or desk work.',
        category: 'pain_points',
        hook: 'Sitting 8 hours was destroying my back',
        narrative_arc: {
            problem: 'Poor posture from desk work causing discomfort',
            discovery: 'Researched home solutions and found the product',
            result: 'Posture noticeably improved in weeks',
            payoff: 'Standing taller, feeling more confident, less pain',
        },
        target_persona: 'Desk worker 25-45 with posture concerns',
        funnel_stage: ['TOFU'],
        cta_options: ['Fix Your Posture', 'Stand Taller', 'Start Today'],
        compliance_notes: 'Avoid medical posture correction claims.',
    },
    {
        id: 'exercise_guilt',
        label: 'Exercise Guilt',
        description: 'Target people who keep postponing exercise and feel guilty about inactivity.',
        category: 'pain_points',
        hook: "I kept saying 'next Monday' for 3 years",
        narrative_arc: {
            problem: 'Constantly postponing exercise, guilt building up',
            discovery: 'Found something that makes starting easy',
            result: 'Actually stuck with it because it fits into daily routine',
            payoff: 'No more guilt — finally taking care of myself',
        },
        target_persona: 'Anyone 25-55 who struggles to maintain exercise habits',
        funnel_stage: ['TOFU'],
        cta_options: ['Start Today', 'No More Excuses', 'Begin Your Journey'],
        compliance_notes: 'No shaming language. Empowering and positive tone only.',
    },

    // ═══════════════════════════════════════════════════════════
    // OBJECTIONS — Overcome purchase barriers
    // ═══════════════════════════════════════════════════════════
    {
        id: 'no_time',
        label: 'No Time',
        description: 'Overcome the "I have no time" objection by showing how the product fits into a busy schedule.',
        category: 'objections',
        hook: "Between school runs and work, me-time doesn't exist",
        narrative_arc: {
            problem: 'No time for self-care between work and family responsibilities',
            discovery: 'Found something that only takes 15 minutes',
            result: 'Fits perfectly into small daily windows',
            payoff: 'Finally doing something for myself without sacrificing family time',
        },
        target_persona: 'Busy parent, typically mum, 30-45',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Just 15 Minutes', 'Fits Your Schedule', 'Try It Free'],
        compliance_notes: 'None.',
    },
    {
        id: 'beginner_fear',
        label: 'Beginner Fear',
        description: 'Overcome the fear of starting something new by emphasizing beginner-friendliness.',
        category: 'objections',
        hook: "I've never done this before, will I look stupid?",
        narrative_arc: {
            problem: 'Intimidated by starting, fear of judgment or failure',
            discovery: 'The product is designed specifically for beginners',
            result: 'Felt comfortable from day one, no judgment',
            payoff: 'Gained confidence and skills faster than expected',
        },
        target_persona: 'First-timer in any age group, especially 30-55',
        funnel_stage: ['TOFU'],
        cta_options: ['Perfect for Beginners', 'Start With Confidence', 'No Experience Needed'],
        compliance_notes: 'None.',
    },
    {
        id: 'skeptic_partner',
        label: 'Skeptic Partner',
        description: 'Address the scenario where a partner or family member is doubtful, turning them into a believer.',
        category: 'objections',
        hook: "My husband laughed when I said I'd exercise at home",
        narrative_arc: {
            problem: 'Partner is skeptical about the product or new routine',
            discovery: 'Tried it anyway after a recommendation',
            result: '4 weeks later, visible results spoke for themselves',
            payoff: 'Partner is now convinced and wants one too',
        },
        target_persona: 'Someone whose partner is a purchase blocker, typically 30-50',
        funnel_stage: ['TOFU'],
        cta_options: ['Prove Them Wrong', 'See for Yourself', 'Try Risk-Free'],
        compliance_notes: 'Keep the tone lighthearted, not confrontational.',
    },
    {
        id: 'too_expensive',
        label: 'Too Expensive',
        description: 'Overcome the price objection by reframing cost as investment and comparing to alternatives.',
        category: 'objections',
        hook: "I can't afford classes every week",
        narrative_arc: {
            problem: 'Recurring costs of gym memberships, classes, or alternatives',
            discovery: 'One-time purchase that replaces ongoing expenses',
            result: 'Saving money month after month',
            payoff: 'Better results at a fraction of the ongoing cost',
        },
        target_persona: 'Budget-conscious buyer 25-55',
        funnel_stage: ['MOFU'],
        cta_options: ['Save Money Now', 'One-Time Investment', 'Compare the Cost'],
        compliance_notes: 'Ensure pricing claims are accurate and verifiable.',
    },
    {
        id: 'no_space',
        label: 'No Space',
        description: 'Overcome the space objection by showing the product works in small living spaces.',
        category: 'objections',
        hook: 'My flat is tiny, where would I put equipment?',
        narrative_arc: {
            problem: 'Small living space, no room for bulky equipment',
            discovery: 'Product is compact, foldable, or requires minimal space',
            result: 'Fits under the sofa / in a closet when not in use',
            payoff: 'Full functionality without sacrificing living space',
        },
        target_persona: 'Apartment dweller in urban area, 25-45',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Fits Anywhere', 'No Space Needed', 'See How Compact'],
        compliance_notes: 'None.',
    },

    // ═══════════════════════════════════════════════════════════
    // VALUE — Highlight financial and practical benefits
    // ═══════════════════════════════════════════════════════════
    {
        id: 'cost_savings',
        label: 'Cost Savings',
        description: 'Highlight long-term savings compared to recurring alternatives like gym memberships.',
        category: 'value',
        hook: 'Save £1,200+/year vs gym memberships',
        narrative_arc: {
            problem: 'Spending too much on recurring fitness/wellness costs',
            discovery: 'One product that replaces multiple expensive alternatives',
            result: 'Dramatic yearly savings with same or better results',
            payoff: 'Financial freedom plus better health outcomes',
        },
        target_persona: 'Value-conscious buyer comparing options, 30-55',
        funnel_stage: ['MOFU', 'BOFU'],
        cta_options: ['Start Saving', 'Calculate Your Savings', 'See the Value'],
        compliance_notes: 'Use "up to" or "typical savings" language. Ensure comparison is fair.',
    },
    {
        id: 'convenience',
        label: 'Convenience',
        description: 'Emphasize how easy the product is to use in daily life, requiring minimal time.',
        category: 'value',
        hook: '15 minutes while kids watch TV',
        narrative_arc: {
            problem: 'Life is too busy for complicated routines',
            discovery: 'This product fits into the smallest daily windows',
            result: 'Consistent use because it is so easy and quick',
            payoff: 'Real results without disrupting life',
        },
        target_persona: 'Busy parent or professional, 30-50',
        funnel_stage: ['MOFU'],
        cta_options: ['So Easy', 'Fits Your Life', 'Quick & Effective'],
        compliance_notes: 'None.',
    },
    {
        id: 'bundle_value',
        label: 'Bundle Value',
        description: 'Showcase the total value of included free gifts and bonuses with the purchase.',
        category: 'value',
        hook: 'Get 5 FREE gifts worth £195.75',
        narrative_arc: {
            problem: 'Worried about getting enough value for the price',
            discovery: 'The bundle includes far more than expected',
            result: 'Received multiple complementary items that enhance the experience',
            payoff: 'Feels like getting a complete package for the price of one item',
        },
        target_persona: 'Deal-seeker who loves perceived value, any age',
        funnel_stage: ['BOFU'],
        cta_options: ['Claim Your Gifts', 'Get the Bundle', 'See What\'s Included'],
        compliance_notes: 'Gift values must be accurate and verifiable.',
    },
    {
        id: 'fast_delivery',
        label: 'Fast Delivery',
        description: 'Remove the delivery waiting barrier by highlighting fast, free shipping.',
        category: 'value',
        hook: 'FREE next-day delivery',
        narrative_arc: {
            problem: 'Impatience about waiting for delivery',
            discovery: 'This brand offers fast, free delivery',
            result: 'Product arrived the very next day',
            payoff: 'Started using it immediately, no waiting frustration',
        },
        target_persona: 'Impulse/ready-to-buy shopper, any age',
        funnel_stage: ['BOFU'],
        cta_options: ['Order Now', 'Free Next-Day Delivery', 'Get It Tomorrow'],
        compliance_notes: 'Delivery claims must match actual service availability.',
    },

    // ═══════════════════════════════════════════════════════════
    // SOCIAL PROOF — Build trust through evidence
    // ═══════════════════════════════════════════════════════════
    {
        id: 'statistics',
        label: 'Statistics',
        description: 'Use compelling statistics and data points to build credibility and trust.',
        category: 'social_proof',
        hook: '94% felt stronger after 4 weeks',
        narrative_arc: {
            problem: 'Uncertain if the product actually works',
            discovery: 'Data and studies prove the effectiveness',
            result: 'Impressive statistics that validate the product',
            payoff: 'Confidence in purchasing based on evidence',
        },
        target_persona: 'Data-driven, analytical buyer, 30-55',
        funnel_stage: ['MOFU'],
        cta_options: ['See the Data', 'Proven Results', 'Join the 94%'],
        compliance_notes: 'Statistics must be from verifiable sources. Include sample size if possible.',
    },
    {
        id: 'reviews',
        label: 'Reviews',
        description: 'Leverage the volume and quality of customer reviews to build trust.',
        category: 'social_proof',
        hook: '2,400+ 5-star reviews',
        narrative_arc: {
            problem: 'Need social validation before purchasing',
            discovery: 'Thousands of real customers have reviewed the product',
            result: 'Overwhelming positive feedback from verified buyers',
            payoff: 'Confidence to buy based on community consensus',
        },
        target_persona: 'Review-checking buyer, any age',
        funnel_stage: ['MOFU', 'BOFU'],
        cta_options: ['Read Reviews', 'Join 2,400+ Happy Customers', 'See Why They Love It'],
        compliance_notes: 'Review counts must be accurate and current.',
    },
    {
        id: 'community',
        label: 'Community',
        description: 'Appeal to the desire to belong by showcasing the size of the user community.',
        category: 'social_proof',
        hook: 'Join 8,000+ women already using it',
        narrative_arc: {
            problem: 'Feeling alone in the journey or decision',
            discovery: 'A large, supportive community already exists',
            result: 'Joining a group of like-minded people',
            payoff: 'Belonging, support, and shared experience',
        },
        target_persona: 'Community-minded buyer who values belonging, 25-50',
        funnel_stage: ['MOFU'],
        cta_options: ['Join the Community', 'Be Part of It', 'Join 8,000+ Women'],
        compliance_notes: 'Community size numbers must be accurate.',
    },
    {
        id: 'word_of_mouth',
        label: 'Word of Mouth',
        description: 'Use the power of personal recommendations — "my friend told me about this".',
        category: 'social_proof',
        hook: 'My friend told me about this',
        narrative_arc: {
            problem: 'Wasn\'t looking for a solution, but heard about this organically',
            discovery: 'A trusted friend personally recommended the product',
            result: 'Tried it based on the recommendation',
            payoff: 'So good that now recommending it to others too',
        },
        target_persona: 'Trust-based buyer who values personal recommendations, any age',
        funnel_stage: ['TOFU'],
        cta_options: ['Try What Everyone\'s Talking About', 'See Why Friends Recommend It', 'Discover It'],
        compliance_notes: 'None.',
    },

    // ═══════════════════════════════════════════════════════════
    // EMOTIONAL — Connect on a personal, emotional level
    // ═══════════════════════════════════════════════════════════
    {
        id: 'strength',
        label: 'Strength',
        description: 'Appeal to the emotional desire to feel strong, capable, and empowered.',
        category: 'emotional',
        hook: 'I finally feel like myself again',
        narrative_arc: {
            problem: 'Lost sense of self, feeling weak or diminished',
            discovery: 'The product helped rebuild strength and confidence',
            result: 'Feeling physically and mentally stronger',
            payoff: 'Reconnected with who I really am',
        },
        target_persona: 'Someone on a self-improvement journey, typically 30-55',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Feel Strong Again', 'Rebuild Your Strength', 'Start Your Journey'],
        compliance_notes: 'Keep emotional claims relatable, not exaggerated.',
    },
    {
        id: 'self_care',
        label: 'Self-Care',
        description: 'Position the product as an act of self-love and personal care.',
        category: 'emotional',
        hook: "The first thing I've done for myself in years",
        narrative_arc: {
            problem: 'Always putting others first, neglecting personal needs',
            discovery: 'Decided to invest in self-care for once',
            result: 'The product became a cherished daily ritual',
            payoff: 'Happier, more balanced, better for everyone around me',
        },
        target_persona: 'Caregiver (parent, partner) who neglects self-care, 30-55',
        funnel_stage: ['TOFU'],
        cta_options: ['You Deserve This', 'Invest in Yourself', 'Your Time to Shine'],
        compliance_notes: 'None.',
    },
    {
        id: 'family',
        label: 'Family',
        description: 'Connect the product to being a better family member — playing with kids, being active with loved ones.',
        category: 'emotional',
        hook: 'I can finally play with my kids without pain',
        narrative_arc: {
            problem: 'Physical limitations preventing quality family time',
            discovery: 'The product addressed the root cause',
            result: 'Active and present with family again',
            payoff: 'Making memories instead of sitting on the sidelines',
        },
        target_persona: 'Parent 30-55 who wants to be active with family',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Be There for Them', 'Play Again', 'Enjoy Family Time'],
        compliance_notes: 'Do not exploit guilt about parenting.',
    },
    {
        id: 'confidence',
        label: 'Confidence',
        description: 'Appeal to the desire for confidence and self-assurance in daily life.',
        category: 'emotional',
        hook: 'I stand taller now, literally and figuratively',
        narrative_arc: {
            problem: 'Lacking confidence, feeling self-conscious',
            discovery: 'The product created a visible transformation',
            result: 'Better posture, better self-image, better presence',
            payoff: 'Walking taller and feeling more confident in every situation',
        },
        target_persona: 'Anyone seeking confidence boost, 25-55',
        funnel_stage: ['MOFU'],
        cta_options: ['Stand Taller', 'Boost Your Confidence', 'Feel the Difference'],
        compliance_notes: 'Avoid before/after body image claims that violate ad policies.',
    },
];

/**
 * Get angles grouped by category for frontend checkbox display
 */
export function getAnglesGroupedByCategory(): Record<AngleCategory, MarketingAngle[]> {
    const grouped: Record<AngleCategory, MarketingAngle[]> = {
        pain_points: [],
        objections: [],
        value: [],
        social_proof: [],
        emotional: [],
    };

    for (const angle of MARKETING_ANGLES) {
        grouped[angle.category].push(angle);
    }

    return grouped;
}

/**
 * Category display labels for the frontend
 */
export const ANGLE_CATEGORY_LABELS: Record<AngleCategory, string> = {
    pain_points: 'Pain Points',
    objections: 'Objections',
    value: 'Value Proposition',
    social_proof: 'Social Proof',
    emotional: 'Emotional Connection',
};
