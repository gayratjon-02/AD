/**
 * Marketing Angles — Spec v3 (Feb 2026)
 *
 * An angle is a marketing message direction. Same ad layout, different story.
 * The user picks which angles to generate from a checkbox list.
 *
 * 22 pre-defined angles organized by 5 categories:
 * - PAIN_POINTS: Real problems and frustrations the audience faces
 * - OBJECTIONS: Common purchase hesitations, addressed head-on
 * - VALUE: Financial and practical benefits
 * - SOCIAL_PROOF: Evidence, reviews, and community trust
 * - EMOTIONAL: Deep personal and emotional connections
 *
 * Each angle includes:
 * - hook: The opening headline (uses {product_name} / {brand_name} placeholders)
 * - narrative_arc: { problem, discovery, result, payoff }
 * - target_persona: Who this angle speaks to
 * - funnel_stage: TOFU (awareness), MOFU (consideration), BOFU (decision)
 * - cta_options: Suggested CTA button texts
 * - compliance_notes: Any regulatory cautions
 * - visual_cues: MANDATORY visual direction for Gemini image generation
 *
 * Placeholders replaced at runtime:
 *   {product_name} → brand's product name
 *   {brand_name}   → brand name
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
    visual_cues: string;
}

export const MARKETING_ANGLES: MarketingAngle[] = [
    // ═══════════════════════════════════════════════════════════
    // PAIN POINTS (5) — Real problems the audience faces
    // ═══════════════════════════════════════════════════════════
    {
        id: 'pain_back',
        label: 'Back Pain',
        description: 'Target people suffering from chronic back pain who need a home solution.',
        category: 'pain_points',
        hook: 'My back was getting worse every single day',
        narrative_arc: {
            problem: 'Chronic back pain from sitting at a desk 8+ hours a day, tried physio and stretches but nothing lasting',
            discovery: 'A friend recommended {product_name} as a gentle daily routine',
            result: 'Back pain significantly reduced after 3-4 weeks of consistent use',
            payoff: 'Can finally play with the kids again without wincing',
        },
        target_persona: 'Office worker aged 35-50 with chronic back pain from desk work',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Fix Your Back', 'Start Feeling Better', 'Try {product_name}'],
        compliance_notes: 'Do not claim medical cure. Use "may help" or "users report" language.',
        visual_cues: 'Show a person at a desk or in an office environment holding their lower back in visible discomfort (muted, grey-toned left side). On the right side or as a transition, show the same person using the product at home, standing straight and smiling with warm, bright lighting. The CONTRAST between pain and relief must be immediately obvious. Use a dark-to-light color transition across the image.',
    },
    {
        id: 'pain_low_energy',
        label: 'Low Energy',
        description: 'Target people who feel exhausted and drained, needing an energy boost.',
        category: 'pain_points',
        hook: 'I was exhausted by 3pm every single day',
        narrative_arc: {
            problem: 'Constant fatigue, relying on coffee, crashing mid-afternoon, no energy for family or hobbies',
            discovery: 'Started using {product_name} for just 15 minutes a day',
            result: 'Energy levels transformed — no more afternoon crashes, sleeping better',
            payoff: 'Finally have energy to enjoy evenings with family instead of collapsing on the sofa',
        },
        target_persona: 'Tired professional or parent aged 30-50 who feels drained daily',
        funnel_stage: ['TOFU'],
        cta_options: ['Boost Your Energy', 'Feel Alive Again', 'Try 15 Minutes'],
        compliance_notes: 'Do not make medical energy claims. Focus on lifestyle improvement.',
        visual_cues: 'Show a person slumped or exhausted in a dull, desaturated environment (couch, office, kitchen). Use LOW ENERGY visual cues: dim lighting, muted colors, heavy posture. The product should appear as a bright, energizing element — warm golden light emanating from it or around the person using it. The mood shift from tired to energized must be DRAMATIC and visible.',
    },
    {
        id: 'pain_posture',
        label: 'Poor Posture',
        description: 'Target people with posture problems from sedentary lifestyle.',
        category: 'pain_points',
        hook: 'Sitting 8 hours a day was destroying my body',
        narrative_arc: {
            problem: 'Hunched shoulders, tight neck, rounded back from hours at a desk or phone',
            discovery: 'Discovered {product_name} specifically targets posture improvement',
            result: 'Standing taller, shoulders back, neck tension gone within weeks',
            payoff: 'People actually comment on how much taller and more confident I look',
        },
        target_persona: 'Desk worker or phone-addicted person aged 25-45 with visible posture issues',
        funnel_stage: ['TOFU'],
        cta_options: ['Fix Your Posture', 'Stand Taller', 'Start Today'],
        compliance_notes: 'Do not claim to cure spinal conditions. Focus on posture improvement.',
        visual_cues: 'Show a CLEAR side-by-side or overlay comparison of BAD POSTURE vs. GOOD POSTURE. Left/top: person hunched over desk or phone with red highlight lines showing curved spine. Right/bottom: same person standing tall and straight with green alignment lines. The product must be visible as the catalyst for change. Use anatomical visual cues (posture lines, spine alignment) to make the difference UNMISTAKABLE.',
    },
    {
        id: 'pain_guilt',
        label: 'Exercise Guilt',
        description: 'Target people who keep postponing exercise and feel guilty about it.',
        category: 'pain_points',
        hook: 'I kept saying "next Monday" for 3 years',
        narrative_arc: {
            problem: 'Constant guilt about not exercising, buying gym memberships that go unused, broken promises to self',
            discovery: '{product_name} made it so easy there were no more excuses',
            result: 'Actually sticking to a routine for the first time ever',
            payoff: 'The guilt is gone — replaced with genuine pride and consistency',
        },
        target_persona: 'Serial procrastinator aged 25-45 who feels guilty about lack of exercise',
        funnel_stage: ['TOFU'],
        cta_options: ['No More Excuses', 'Start This Monday', 'Finally Do It'],
        compliance_notes: 'Avoid shaming language. Focus on empowerment and ease.',
        visual_cues: 'Show a calendar or planner with "START MONDAY" written and crossed out MULTIPLE times (visual pattern of broken promises). Beside it or transitioning from it, show the person actually using the product at home with a genuine smile — the EASE and simplicity of the moment contrasting with all the failed plans. Use warm, inviting home lighting. The mood should be "finally doing it" — relief, not pressure.',
    },
    {
        id: 'pain_no_time',
        label: 'No Time',
        description: 'Target busy parents and professionals who have zero free time.',
        category: 'pain_points',
        hook: 'Between school runs and work, me-time doesn\'t exist',
        narrative_arc: {
            problem: 'Packed schedule — work, kids, chores, commute — literally no time left for self-care',
            discovery: '{product_name} takes only 15 minutes and can be done while kids watch TV',
            result: 'Found a routine that actually fits into the chaos of daily life',
            payoff: 'Finally something that works FOR my schedule, not against it',
        },
        target_persona: 'Busy parent (especially mums) aged 30-45 juggling work and kids',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Just 15 Minutes', 'Fits Your Schedule', 'Try It Free'],
        compliance_notes: 'Be inclusive of all parent types. Avoid stereotyping.',
        visual_cues: 'Show a BUSY, CHAOTIC home scene — toys on floor, school bags, clock showing a packed schedule. In the CENTER of the chaos, show the person calmly using the product in a small clear space, looking peaceful. A visible clock or timer showing "15 MIN" must be prominent. The contrast between the surrounding chaos and the calm 15-minute moment must be the HERO of the image. Warm, cozy home lighting.',
    },

    // ═══════════════════════════════════════════════════════════
    // OBJECTIONS (4) — Purchase hesitations addressed head-on
    // ═══════════════════════════════════════════════════════════
    {
        id: 'objection_beginner',
        label: 'Beginner Fear',
        description: 'Address fear of being a complete beginner and looking foolish.',
        category: 'objections',
        hook: 'I\'ve never done this before — will I look stupid?',
        narrative_arc: {
            problem: 'Intimidated by fitness/wellness — worried about doing it wrong or looking silly',
            discovery: '{product_name} is designed specifically for absolute beginners',
            result: 'Felt confident from day one — clear instructions, zero judgement',
            payoff: 'Wish I\'d started sooner instead of overthinking it',
        },
        target_persona: 'Complete beginner aged 30-55 who is intimidated by starting something new',
        funnel_stage: ['TOFU'],
        cta_options: ['Perfect for Beginners', 'Start Easy', 'Zero Experience Needed'],
        compliance_notes: 'Emphasize inclusivity. Never mock beginners.',
        visual_cues: 'Show a WARM, WELCOMING, non-intimidating scene. A person using the product at home with a relaxed, genuine smile — NOT a fitness model, but an everyday person. The environment should feel SAFE and PRIVATE (living room, bedroom). Include visual elements that say "beginner-friendly": simple step-by-step icons, a "Day 1" badge, or "Beginner" label. Soft, warm lighting. The mood must be APPROACHABLE, not aspirational.',
    },
    {
        id: 'objection_skeptic',
        label: 'Skeptic Partner',
        description: 'Address skepticism from partner or family members about the purchase.',
        category: 'objections',
        hook: 'My husband laughed when I said I\'d exercise at home',
        narrative_arc: {
            problem: 'Partner/family thinks it\'s a waste of money, another gadget that\'ll collect dust',
            discovery: 'Got {product_name} anyway — started seeing results within weeks',
            result: '4 weeks later, the skeptic is impressed and wants to try it too',
            payoff: 'From "told you so" to "where do I sign up" — the best feeling',
        },
        target_persona: 'Person aged 30-50 whose partner is skeptical about home fitness purchases',
        funnel_stage: ['TOFU'],
        cta_options: ['Prove Them Wrong', 'See Real Results', 'Try It Yourself'],
        compliance_notes: 'Keep partner portrayal respectful. Avoid antagonistic framing.',
        visual_cues: 'Show TWO people — one using the product confidently and happily, the other watching with a surprised/impressed expression (arms uncrossed, eyebrows raised, slight smile). The body language transformation from skepticism to interest must be CLEAR. Home environment. Split the image or show a "THEN vs NOW" progression: skeptical face on one side, impressed face on the other. Warm domestic lighting.',
    },
    {
        id: 'objection_expensive',
        label: 'Too Expensive',
        description: 'Address price objection by reframing value and long-term savings.',
        category: 'objections',
        hook: 'I can\'t afford expensive classes every week',
        narrative_arc: {
            problem: 'Studio classes cost a fortune, gym memberships go unused, personal trainers are out of budget',
            discovery: '{product_name} is a one-time cost that replaces all of those',
            result: 'Saving money every single month while getting better results at home',
            payoff: 'Best investment I\'ve made — pays for itself in the first month',
        },
        target_persona: 'Budget-conscious buyer aged 25-50 who feels priced out of fitness',
        funnel_stage: ['MOFU'],
        cta_options: ['Save Money Now', 'One-Time Cost', 'Better Value'],
        compliance_notes: 'Savings claims must be reasonable and defensible.',
        visual_cues: 'Show a CLEAR price comparison visual. On one side: expensive alternatives with price tags (gym, studio, trainer). On the other side: the product at home with a much lower price highlighted. Use a receipt, calculator, or savings counter visual element. Green "SAVE" indicators vs red "EXPENSIVE" indicators. The math must be VISUALLY OBVIOUS — the viewer should instantly see the savings without reading fine print.',
    },
    {
        id: 'objection_space',
        label: 'No Space',
        description: 'Address concern about not having enough room at home.',
        category: 'objections',
        hook: 'My flat is tiny — where would I even put it?',
        narrative_arc: {
            problem: 'Small apartment, no spare room, can\'t fit bulky equipment anywhere',
            discovery: '{product_name} folds flat / is compact enough to fit under the sofa or in a closet',
            result: 'Uses it daily in a tiny space — slides out, workout, slides back',
            payoff: 'No more excuses about space — it literally disappears when not in use',
        },
        target_persona: 'City dweller aged 25-40 in a small flat or shared space',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Fits Anywhere', 'See How Small', 'Perfect for Small Spaces'],
        compliance_notes: 'Product dimensions must be accurate if stated.',
        visual_cues: 'Show a SMALL, COMPACT living space (studio flat, tiny bedroom). The product should be shown IN USE in the tight space, demonstrating that it FITS. Then show it STORED — folded under a sofa, tucked in a closet, leaning against a wall. The BEFORE: cramped room looking impossible. The AFTER: same room with product fitting perfectly. Include measurement references or furniture scale comparison to prove the small footprint.',
    },

    // ═══════════════════════════════════════════════════════════
    // VALUE (4) — Financial and practical benefits
    // ═══════════════════════════════════════════════════════════
    {
        id: 'value_savings',
        label: 'Cost Savings',
        description: 'Show long-term financial savings compared to alternatives.',
        category: 'value',
        hook: 'Save over 1,200 per year compared to a gym',
        narrative_arc: {
            problem: 'Spending a fortune on gym memberships, classes, and trainers that add up fast',
            discovery: '{product_name} replaces monthly fees with a single investment',
            result: 'Calculated the savings — it pays for itself within weeks',
            payoff: 'Same results (or better) at a fraction of the cost, year after year',
        },
        target_persona: 'Cost-conscious buyer aged 25-55 who tracks expenses',
        funnel_stage: ['MOFU', 'BOFU'],
        cta_options: ['Start Saving', 'Calculate Your Savings', 'One-Time Investment'],
        compliance_notes: 'Savings figures must be based on real average comparisons. Use "up to" language.',
        visual_cues: 'Create a BOLD, CLEAN savings infographic-style ad. Large typography showing the savings number prominently. Use a visual comparison: a stack of receipts/bills (gym, classes) vs. the single product price. Green savings arrows, percentage badges, or a piggy bank element. The NUMBER must be the HERO — make it impossible to scroll past without seeing the savings figure. Clean background, financial green accent color.',
    },
    {
        id: 'value_convenience',
        label: 'Convenience',
        description: 'Highlight how easy and quick it is to use, fitting into any routine.',
        category: 'value',
        hook: '15 minutes while the kids watch TV',
        narrative_arc: {
            problem: 'Everything takes too long — gym commute, class schedules, setup time',
            discovery: '{product_name} needs zero setup, zero commute, zero scheduling',
            result: 'Fitting it in during lunch breaks, while cooking, while kids play',
            payoff: 'The easiest routine I\'ve ever maintained — because it asks for so little',
        },
        target_persona: 'Busy person aged 28-50 who values time efficiency above all',
        funnel_stage: ['MOFU'],
        cta_options: ['Just 15 Minutes', 'Try It Now', 'So Easy'],
        compliance_notes: 'Time claims must reflect typical usage.',
        visual_cues: 'Show a CASUAL, EFFORTLESS home scene. Person using the product in everyday clothes (not workout gear) while life happens around them — kids playing nearby, TV on, coffee on the table. A prominent "15 MIN" timer or clock element. The mood must be RELAXED and EASY — this is NOT an intense workout ad. It should look as natural as making a cup of tea. Warm, lived-in home environment with natural lighting.',
    },
    {
        id: 'value_bundle',
        label: 'Bundle Value',
        description: 'Highlight the total value of bundled items and free gifts.',
        category: 'value',
        hook: 'Plus FREE gifts worth over 195',
        narrative_arc: {
            problem: 'Buying everything separately is expensive and overwhelming',
            discovery: '{product_name} comes with everything included — plus bonus free gifts',
            result: 'Got way more than expected — the extras alone are worth the price',
            payoff: 'Feels like a steal — massive value for money',
        },
        target_persona: 'Value-seeking buyer aged 30-55 who loves getting more for their money',
        funnel_stage: ['BOFU'],
        cta_options: ['Claim Your Gifts', 'Get the Bundle', 'See What\'s Included'],
        compliance_notes: 'Gift values must be verifiable. State RRP clearly.',
        visual_cues: 'Show a beautiful FLAT-LAY or UNBOXING arrangement of the product PLUS all the bonus gifts spread out artfully. Each item should be clearly visible with its individual value tag. A large "FREE" badge on the gifts. The total value should be displayed prominently as a number. Think luxury gift box aesthetic — premium packaging, tissue paper, organized layout. The overall impression must be "you get ALL of this." Bright, clean product photography lighting.',
    },
    {
        id: 'value_delivery',
        label: 'Fast Delivery',
        description: 'Highlight free and fast delivery as a conversion driver.',
        category: 'value',
        hook: 'FREE next-day delivery — order today, start tomorrow',
        narrative_arc: {
            problem: 'Tired of waiting weeks for delivery or paying extra for shipping',
            discovery: '{product_name} offers completely free next-day delivery',
            result: 'Ordered in the evening, arrived the next morning',
            payoff: 'No waiting, no shipping costs — instant gratification',
        },
        target_persona: 'Impulse-ready buyer who wants it NOW, any age',
        funnel_stage: ['BOFU'],
        cta_options: ['Order Now, Get Tomorrow', 'Free Delivery', 'Ship It Free'],
        compliance_notes: 'Delivery claims must be accurate for the target region. State conditions.',
        visual_cues: 'Show an EXCITING DELIVERY MOMENT — a person opening their front door to find the product package, or hands opening a beautifully branded box. A delivery truck or "NEXT DAY" badge element. The mood must be EXCITEMENT and ANTICIPATION. Include a "FREE DELIVERY" stamp or badge prominently. The package should look premium and well-designed. Bright, optimistic morning lighting suggesting "it just arrived."',
    },

    // ═══════════════════════════════════════════════════════════
    // SOCIAL PROOF (4) — Evidence, reviews, and community trust
    // ═══════════════════════════════════════════════════════════
    {
        id: 'proof_statistics',
        label: 'Statistics',
        description: 'Use impressive statistics and data points to build credibility.',
        category: 'social_proof',
        hook: '94% felt stronger after just 4 weeks',
        narrative_arc: {
            problem: 'Hard to trust marketing claims without evidence or data',
            discovery: 'Real survey data from {product_name} users shows incredible results',
            result: 'The numbers speak for themselves — measurable improvement',
            payoff: 'Confidence to buy because the data backs it up',
        },
        target_persona: 'Data-driven buyer aged 28-55 who wants evidence before purchasing',
        funnel_stage: ['MOFU'],
        cta_options: ['See the Data', 'Join the 94%', 'Proven Results'],
        compliance_notes: 'All statistics must be from real, documented surveys. State sample size.',
        visual_cues: 'Create a BOLD, DATA-DRIVEN ad. The statistic number (e.g., "94%") must be ENORMOUS — the single biggest visual element, taking up at least 30% of the image. Use a clean, authoritative design with the product shown smaller below or beside the number. Include supporting micro-stats as secondary elements. Think infographic-meets-advertisement. Clean sans-serif typography, brand colors, minimal background. The NUMBER is the hero, not the product.',
    },
    {
        id: 'proof_reviews',
        label: 'Reviews',
        description: 'Showcase real customer reviews and star ratings.',
        category: 'social_proof',
        hook: '2,400+ five-star reviews can\'t be wrong',
        narrative_arc: {
            problem: 'Don\'t know if this product actually works — need proof from real people',
            discovery: 'Thousands of verified customers have shared their honest reviews',
            result: 'Overwhelming 5-star ratings and detailed success stories',
            payoff: 'Confidence to buy because so many real people love it',
        },
        target_persona: 'Review-checking buyer aged 25-55 who reads reviews before every purchase',
        funnel_stage: ['MOFU', 'BOFU'],
        cta_options: ['Read Reviews', 'Join 2,400+ Happy Customers', 'See Why They Love It'],
        compliance_notes: 'Review counts must be current and verifiable. Star ratings must be real.',
        visual_cues: 'Show multiple REVIEW CARDS or TESTIMONIAL BUBBLES arranged attractively around or near the product. Each card should have visible 5-star ratings, a short quote snippet, and a customer name/avatar. The overall review count should be displayed prominently. Use a warm, trustworthy design — soft shadows on review cards, clean typography. The product is shown centrally with the reviews surrounding it like a wall of approval. Think App Store review UI aesthetic.',
    },
    {
        id: 'proof_community',
        label: 'Community',
        description: 'Show the size and warmth of the existing customer community.',
        category: 'social_proof',
        hook: 'Join 8,000+ people who already made the switch',
        narrative_arc: {
            problem: 'Don\'t want to be a guinea pig — want to join something proven and popular',
            discovery: '{product_name} has a thriving community of thousands of real users',
            result: 'Being part of a supportive group that shares tips, progress, and motivation',
            payoff: 'Not just buying a product — joining a movement of like-minded people',
        },
        target_persona: 'Social buyer aged 25-50 who values belonging and community',
        funnel_stage: ['MOFU'],
        cta_options: ['Join the Community', 'Be Part of Something', 'Join 8,000+ Members'],
        compliance_notes: 'Community size must be accurate. Do not inflate numbers.',
        visual_cues: 'Show a COLLAGE or MOSAIC of diverse, happy faces — real people (not stock model types) of different ages, ethnicities, and backgrounds, all using or holding the product. Alternatively, show a grid of user-generated-style photos. The large community number (e.g., "8,000+") must be prominently displayed. The mood is WARM, INCLUSIVE, and WELCOMING. Think Instagram community feed aesthetic. The message is "you\'re not alone — thousands already love this."',
    },
    {
        id: 'proof_word_of_mouth',
        label: 'Word of Mouth',
        description: 'Friend-to-friend recommendation — the most trusted form of marketing.',
        category: 'social_proof',
        hook: 'My friend told me about this and it changed everything',
        narrative_arc: {
            problem: 'Wouldn\'t have found this on my own — too much noise in advertising',
            discovery: 'A trusted friend personally recommended {product_name}',
            result: 'Tried it based on their recommendation — they were completely right',
            payoff: 'Now I\'m the one recommending it to everyone I know',
        },
        target_persona: 'Recommendation-driven buyer aged 25-50 who trusts friends over ads',
        funnel_stage: ['TOFU'],
        cta_options: ['Try What They Love', 'See Why Friends Recommend It', 'Join Them'],
        compliance_notes: 'Do not fabricate word-of-mouth recommendations.',
        visual_cues: 'Show TWO FRIENDS in a natural, casual setting — coffee shop, kitchen table, park bench. One is SHOWING the product or their phone screen to the other, who looks genuinely interested and engaged. The body language must be NATURAL and CONVERSATIONAL — leaning in, pointing, smiling. This must look like a REAL conversation, not a posed photo. Include a speech bubble or text overlay with the recommendation quote. Warm, natural lighting. The product is present but secondary to the human connection.',
    },

    // ═══════════════════════════════════════════════════════════
    // EMOTIONAL (5) — Deep personal and emotional connections
    // ═══════════════════════════════════════════════════════════
    {
        id: 'emotional_strength',
        label: 'Strength',
        description: 'Empowerment and feeling strong — physically and mentally.',
        category: 'emotional',
        hook: 'I finally feel like myself again',
        narrative_arc: {
            problem: 'Felt weak, out of shape, or disconnected from my own body for too long',
            discovery: '{product_name} helped rebuild strength gradually and gently',
            result: 'Feeling physically stronger and mentally empowered',
            payoff: 'Reconnected with my body — I feel like ME again, only stronger',
        },
        target_persona: 'Person aged 30-55 who has lost touch with their physical strength and identity',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Feel Strong Again', 'Rebuild Your Strength', 'Start Today'],
        compliance_notes: 'Focus on emotional empowerment, not extreme fitness transformation.',
        visual_cues: 'Show a person in a POWERFUL, CONFIDENT POSE — standing tall, arms slightly out or hands on hips, chin up, subtle smile. The lighting should be DRAMATIC and HEROIC: golden hour backlight, lens flare, or strong side-lighting creating a silhouette effect. The product is visible nearby or being used. The mood is EMPOWERMENT and PRIDE. Use warm, strong colors (gold, amber, deep brand colors). This should feel like a personal victory moment — quiet strength, not loud athleticism.',
    },
    {
        id: 'emotional_self_care',
        label: 'Self-Care',
        description: 'Finally doing something for yourself — not for anyone else.',
        category: 'emotional',
        hook: 'The first thing I\'ve done for myself in years',
        narrative_arc: {
            problem: 'Always putting everyone else first — partner, kids, work, responsibilities',
            discovery: '{product_name} became my daily moment of self-care — just for me',
            result: 'Having 15 minutes that are purely MINE changed my entire outlook',
            payoff: 'A better me means a better mum, partner, friend, colleague — everyone benefits',
        },
        target_persona: 'Self-sacrificing parent or caregiver aged 30-50 who never prioritizes themselves',
        funnel_stage: ['TOFU'],
        cta_options: ['You Deserve This', 'Your Time', 'Invest in Yourself'],
        compliance_notes: 'Avoid guilt-tripping. Frame as positive self-investment.',
        visual_cues: 'Show a SERENE, PEACEFUL moment — a person using the product alone in a quiet, clean space with soft morning or evening light. Candles, a plant, a warm blanket nearby — elements of CALM and COMFORT. The mood must be MEDITATIVE and GENTLE. No chaos, no kids in frame, no distractions. This is THEIR moment. Soft, warm color palette (cream, blush, soft brand colors). The person looks relaxed, eyes closed or peacefully focused. Think spa-meets-home aesthetic.',
    },
    {
        id: 'emotional_family',
        label: 'Family',
        description: 'Being physically able to be present for your family.',
        category: 'emotional',
        hook: 'I can finally play with my kids without pain',
        narrative_arc: {
            problem: 'Physical limitations preventing full participation in family life — can\'t run, lift, or play',
            discovery: '{product_name} gradually improved mobility and strength',
            result: 'Can now chase the kids, pick them up, get on the floor and play',
            payoff: 'The look on their faces when mum/dad can finally join in — priceless',
        },
        target_persona: 'Parent aged 30-50 whose physical limitations affect family life',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Be There for Them', 'Play Again', 'Family First'],
        compliance_notes: 'Avoid implying the product cures medical conditions. Focus on quality of life.',
        visual_cues: 'Show a JOYFUL FAMILY MOMENT — parent actively playing with children (running in a garden, lifting a child, playing on the floor). The parent\'s face shows PURE JOY and FREEDOM of movement. The product is shown subtly in the background (visible in the living room or nearby). Bright, warm, outdoor or indoor natural light. The children are laughing and engaged. The mood is WARMTH, LOVE, and PHYSICAL FREEDOM. This is the emotional payoff — the "why" behind the purchase. Think lifestyle family photography.',
    },
    {
        id: 'emotional_confidence',
        label: 'Confidence',
        description: 'Standing taller, feeling better — inside and out.',
        category: 'emotional',
        hook: 'I stand taller now — literally and figuratively',
        narrative_arc: {
            problem: 'Low confidence, poor self-image, avoiding mirrors and social situations',
            discovery: '{product_name} didn\'t just change my body — it changed how I carry myself',
            result: 'Better posture, more energy, and a visible boost in self-assurance',
            payoff: 'Walking into rooms differently — head high, shoulders back, genuinely confident',
        },
        target_persona: 'Person aged 25-50 who wants to feel more confident in their body',
        funnel_stage: ['MOFU'],
        cta_options: ['Stand Taller', 'Feel Confident', 'Transform Your Confidence'],
        compliance_notes: 'Avoid body-shaming. Focus on positive transformation and self-acceptance.',
        visual_cues: 'Show a person walking CONFIDENTLY — strong stride, great posture, slight smile, looking ahead. The setting should be a public space (street, office, cafe) where the person STANDS OUT because of their energy and bearing. Use power composition: low camera angle looking up at the person, making them look tall and commanding. The product can be shown in a small inset or "powered by" element. The mood is ASPIRATIONAL CONFIDENCE — not arrogant, but quietly self-assured. Fashion-editorial lighting style.',
    },
    {
        id: 'emotional_transformation',
        label: 'Life Transformation',
        description: 'A complete life shift — not just physical, but everything changed.',
        category: 'emotional',
        hook: 'This didn\'t just change my routine — it changed my life',
        narrative_arc: {
            problem: 'Stuck in a rut — same unfulfilling routine, same aches, same excuses, same dissatisfaction',
            discovery: '{product_name} was the catalyst for a complete lifestyle shift',
            result: 'Better sleep, more energy, improved mood, stronger relationships — everything improved',
            payoff: 'Looking back at where I was 6 months ago feels like a different lifetime',
        },
        target_persona: 'Person aged 30-55 ready for a meaningful life change, not just a product',
        funnel_stage: ['TOFU', 'MOFU'],
        cta_options: ['Change Your Life', 'Start Your Transformation', 'Begin Today'],
        compliance_notes: 'Transformation claims must be realistic. Avoid miraculous before/after promises.',
        visual_cues: 'Create a CINEMATIC before/after or journey visual. Left side: muted, grey-toned version of a person\'s daily life (slumped on couch, dark room, lonely). Right side: VIBRANT, COLOR-RICH version of the same person\'s transformed life (active, social, outdoors, smiling). The transition should be dramatic — like turning a page from black-and-white to full color. The product should be at the CENTER of the transition as the turning point. Dramatic lighting shift from cold/blue to warm/golden.',
    },
];

/**
 * Get angles grouped by category for display
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
 * Category display labels
 */
export const ANGLE_CATEGORY_LABELS: Record<AngleCategory, string> = {
    pain_points: 'Pain Points',
    objections: 'Objections',
    value: 'Value',
    social_proof: 'Social Proof',
    emotional: 'Emotional',
};

/**
 * Replace placeholders in angle text with actual brand/product names.
 * Call this at runtime when building prompts.
 */
export function resolveAnglePlaceholders(
    text: string,
    productName: string,
    brandName: string,
): string {
    return text
        .replace(/\{product_name\}/g, productName)
        .replace(/\{brand_name\}/g, brandName);
}
