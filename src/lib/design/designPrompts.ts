import type { PRDType } from '../llm/types';
import type { DesignSystem } from '@/types/design';

// ---------------------------------------------------------------------------
// Design Director System Prompt
// ---------------------------------------------------------------------------

export const DESIGN_DIRECTOR_SYSTEM_PROMPT = `You are a Design Director at a world-class digital design agency. You have 15+ years of experience shipping award-winning products for companies like Stripe, Linear, Vercel, and Arc Browser.

## YOUR DESIGN PHILOSOPHY

You believe great digital design is:
1. **Opinionated, not neutral** — Every design choice communicates something. Default aesthetics communicate laziness. You make deliberate, bold choices.
2. **Systematic, not random** — Everything derives from the design system tokens. No magic numbers. Every spacing value, color, and font size references the scale.
3. **Content-first, not decoration-first** — The layout serves the content hierarchy. You never add decorative elements that don't serve the user's task.
4. **Restrained, not maximalist** — You know when to use ONE strong accent, not five. Negative space is as important as positive space.
5. **Specifically beautiful, not generically pretty** — Each project gets a unique visual personality derived from its domain and users.

## DESIGN ANTI-PATTERNS YOU MUST AVOID

These are hallmarks of AI-generated design. You will be penalized for using them:

- **Generic hero sections**: A centered headline + subtitle + CTA button + stock image/illustration. Real landing pages have personality.
- **Three-column feature grids**: Three identical cards with icon + title + description. This is the "I gave up" layout.
- **Gradient blobs**: Random gradient shapes behind content for "visual interest". This is decoration without purpose.
- **Default Tailwind colors**: Using blue-500, gray-100, etc. without meaningful customization. The Tailwind palette is a starting point, not a design system.
- **Cookie-cutter SaaS aesthetics**: White background, blue primary, gray cards, rounded-lg everything. This looks like every other SaaS product.
- **Over-rounding**: Not everything needs border-radius. Mixing sharp and soft corners creates visual rhythm.
- **Icon soup**: Using icons just because you can. Every icon must earn its place.
- **Fake testimonials and placeholder content**: Use realistic, contextual content that matches the product domain.
- **Symmetrical layouts only**: Break the grid intentionally. Asymmetry creates visual interest and hierarchy.
- **Excessive dividers/borders**: Use spacing and background color to create separation, not lines everywhere.
- **Generic stock imagery descriptions**: No "happy person using laptop" energy. If describing images, make them specific to the domain.

## HOW YOU THINK ABOUT DESIGN

When given a product brief, your process is:

1. **Understand the domain**: What emotional register does this product need? A financial tool needs trust and precision. A creative tool needs energy and expressiveness. A developer tool needs clarity and density.

2. **Identify the personality**: Every product has a personality axis:
   - Playful <-> Serious
   - Dense <-> Spacious
   - Warm <-> Cool
   - Organic <-> Geometric
   - Bold <-> Subtle

3. **Choose a typographic voice**: The typeface IS the personality. You choose specific fonts (from Google Fonts) that embody the product's character. Never default to Inter for everything — choose fonts with character that fit the domain.

4. **Build a color story**: Colors aren't decorative — they encode meaning. Your palette tells a story about what the product is and who it's for. Consider the psychological associations of your choices.

5. **Define spatial rhythm**: Consistent spacing creates visual harmony. You pick a base unit and stick to it religiously. The density should match the content type — data-heavy apps need tighter spacing, consumer apps need more breathing room.

6. **Create visual texture**: Through subtle background variations, shadow layering, border treatments, and typographic contrast. Not through decorative elements.

## OUTPUT FORMAT

You always output complete, self-contained HTML files that:
- Use a CDN link for Tailwind CSS: \`<script src="https://cdn.tailwindcss.com"></script>\`
- Include a \`<script>\` block to configure Tailwind with custom theme colors/fonts via \`tailwind.config\`
- Include Google Fonts via \`<link>\` tags
- Include a \`<style>\` block with CSS custom properties for all design tokens
- Are fully responsive (mobile-first, using Tailwind breakpoints)
- Include realistic, domain-appropriate placeholder content (real-sounding names, realistic data, domain-specific terminology)
- Have NO JavaScript behavior (pure visual reference)
- Are framework-agnostic — just HTML + CSS
- Include hover states and transitions defined in CSS
- Use semantic HTML elements (nav, main, section, article, aside, footer)

Your HTML should be production-quality mockup code, not wireframes. A developer should look at this and clearly understand the visual intent for every element.`;


// ---------------------------------------------------------------------------
// Design System Generation Prompt
// ---------------------------------------------------------------------------

export function buildDesignSystemPrompt(prd: PRDType): string {
  const productContext = prd.product ? `
Product Vision: ${prd.product.vision}
Problem Statement: ${prd.product.problem_statement}
Value Proposition: ${prd.product.value_proposition}
Target Users:
${prd.product.target_users?.map(u => `- ${u.persona}: ${u.description} (Goals: ${u.goals.join(', ')})`).join('\n')}` : '';

  const featuresContext = prd.features ? `
Key Features:
${prd.features.slice(0, 8).map(f => `- ${f.name} (${f.priority}): ${f.description}`).join('\n')}` : '';

  const userFlowsContext = prd.user_flows ? `
User Flows:
${prd.user_flows.map(uf => `- ${uf.name}: ${uf.description}`).join('\n')}` : '';

  return `Generate a complete design system for this product.

## Product Context
Name: ${prd.meta.full_name}
Platform: ${prd.meta.target_platform}
Architecture: ${prd.meta.architecture}
${productContext}
${featuresContext}
${userFlowsContext}

## Tech Stack
${Object.entries(prd.tech_stack).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Your Task

Think deeply about this product's domain, its users, and the emotional register it needs. Then create a comprehensive design system as a JSON object.

The design system must feel UNIQUE to this product. Not a generic template with swapped colors — a thoughtful system that reflects the product's personality.

Return a JSON code block with this exact structure:

\`\`\`json
{
  "name": "A creative name for this design direction (e.g., 'Arctic Precision', 'Warm Ember')",
  "description": "2-sentence description of the aesthetic philosophy and why it fits this product.",
  "colors": {
    "primary": [
      { "name": "primary-50", "value": "#hex", "usage": "Lightest tint, backgrounds" },
      { "name": "primary-100", "value": "#hex", "usage": "..." },
      { "name": "primary-200", "value": "#hex", "usage": "..." },
      { "name": "primary-300", "value": "#hex", "usage": "..." },
      { "name": "primary-400", "value": "#hex", "usage": "..." },
      { "name": "primary-500", "value": "#hex", "usage": "Default primary" },
      { "name": "primary-600", "value": "#hex", "usage": "..." },
      { "name": "primary-700", "value": "#hex", "usage": "..." },
      { "name": "primary-800", "value": "#hex", "usage": "..." },
      { "name": "primary-900", "value": "#hex", "usage": "Darkest shade" }
    ],
    "secondary": [
      ...same 50-900 structure
    ],
    "accent": [
      ...same 50-900 structure (this is your bold highlight color for CTAs)
    ],
    "neutral": [
      ...same 50-900 structure
    ],
    "semantic": {
      "success": "#hex",
      "warning": "#hex",
      "error": "#hex",
      "info": "#hex"
    },
    "background": {
      "primary": "#hex (main page background)",
      "secondary": "#hex (cards, panels)",
      "tertiary": "#hex (subtle sections)"
    },
    "text": {
      "primary": "#hex (main text)",
      "secondary": "#hex (supporting text)",
      "muted": "#hex (disabled, hints)",
      "inverse": "#hex (text on dark backgrounds)"
    }
  },
  "typography": {
    "fontFamilies": {
      "heading": "Specific Google Font name (NOT Inter, NOT Roboto unless truly fitting)",
      "body": "Specific Google Font name",
      "mono": "Specific Google Font name"
    },
    "scale": [
      { "name": "display", "fontFamily": "heading font", "fontSize": "3.5rem", "fontWeight": 800, "lineHeight": "1.1", "letterSpacing": "-0.03em", "usage": "Hero headlines" },
      { "name": "h1", "fontFamily": "heading font", "fontSize": "2.25rem", "fontWeight": 700, "lineHeight": "1.2", "letterSpacing": "-0.02em", "usage": "Page titles" },
      { "name": "h2", "fontFamily": "heading font", "fontSize": "1.875rem", "fontWeight": 700, "lineHeight": "1.25", "letterSpacing": "-0.01em", "usage": "Section titles" },
      { "name": "h3", "fontFamily": "heading font", "fontSize": "1.5rem", "fontWeight": 600, "lineHeight": "1.3", "letterSpacing": "0", "usage": "Subsection titles" },
      { "name": "h4", "fontFamily": "heading font", "fontSize": "1.25rem", "fontWeight": 600, "lineHeight": "1.4", "letterSpacing": "0", "usage": "Card titles" },
      { "name": "body-lg", "fontFamily": "body font", "fontSize": "1.125rem", "fontWeight": 400, "lineHeight": "1.6", "letterSpacing": "0", "usage": "Lead paragraphs" },
      { "name": "body", "fontFamily": "body font", "fontSize": "1rem", "fontWeight": 400, "lineHeight": "1.6", "letterSpacing": "0", "usage": "Default body text" },
      { "name": "body-sm", "fontFamily": "body font", "fontSize": "0.875rem", "fontWeight": 400, "lineHeight": "1.5", "letterSpacing": "0.01em", "usage": "Secondary text" },
      { "name": "caption", "fontFamily": "body font", "fontSize": "0.75rem", "fontWeight": 500, "lineHeight": "1.4", "letterSpacing": "0.02em", "usage": "Labels, timestamps" },
      { "name": "overline", "fontFamily": "body font", "fontSize": "0.6875rem", "fontWeight": 600, "lineHeight": "1.4", "letterSpacing": "0.08em", "usage": "Category labels, all-caps" }
    ]
  },
  "spacing": {
    "unit": 4,
    "scale": {
      "3xs": "2px", "2xs": "4px", "xs": "8px", "sm": "12px", "md": "16px",
      "lg": "24px", "xl": "32px", "2xl": "48px", "3xl": "64px", "4xl": "96px"
    }
  },
  "borderRadius": {
    "none": "0", "sm": "4px", "md": "8px", "lg": "12px", "xl": "16px", "full": "9999px"
  },
  "shadows": {
    "sm": "0 1px 2px rgba(0,0,0,0.05)",
    "md": "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)",
    "lg": "0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)",
    "xl": "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.04)"
  },
  "transitions": {
    "fast": "100ms ease",
    "default": "200ms ease",
    "slow": "400ms ease"
  }
}
\`\`\`

CRITICAL RULES:
- Do NOT use default Tailwind blue/gray. Choose colors that REFLECT this specific product's domain.
- Choose Google Fonts with character. The font IS the personality. Consider the domain carefully.
- Shadow values can use colored shadows if that fits the aesthetic (e.g., tinted with primary color).
- The entire system should feel cohesive — the colors, fonts, and spacing should all tell the same story.
- Output ONLY the JSON code block, nothing else.`;
}


// ---------------------------------------------------------------------------
// Page Design Generation Prompt
// ---------------------------------------------------------------------------

export function buildPageDesignPrompt(
  pageName: string,
  pageDescription: string,
  userFlowSteps: string[],
  designSystem: DesignSystem,
  prd: PRDType,
  anchorPageHtml?: string,
  previousHtml?: string,
  judgeFeedback?: { score: number; issues: string[]; suggestions: string[] },
): string {
  const tokenCSS = designSystemToCSS(designSystem);
  const tailwindConfig = designSystemToTailwindConfig(designSystem);

  let prompt = '';

  // If this is a regeneration with judge feedback, lead with that
  if (judgeFeedback && previousHtml) {
    prompt += `## CRITICAL: Previous Version Scored ${judgeFeedback.score}/100

Your previous design was judged and needs improvement. Address EVERY issue below:

### Issues Found:
${judgeFeedback.issues.map(i => `- ${i}`).join('\n')}

### Specific Suggestions:
${judgeFeedback.suggestions.map(s => `- ${s}`).join('\n')}

Do NOT repeat the same mistakes. The judge is strict and will penalize generic patterns.

---

`;
  }

  prompt += `Design the "${pageName}" page for ${prd.meta.full_name}.

## Page Purpose
${pageDescription}

## User Flow for This Page
${userFlowSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Design System Name: "${designSystem.name}"
${designSystem.description}

## Design Tokens (MUST USE — embed these in your HTML)

### CSS Custom Properties:
\`\`\`css
${tokenCSS}
\`\`\`

### Tailwind Config:
\`\`\`javascript
${tailwindConfig}
\`\`\`

### Typography
- Heading font: "${designSystem.typography.fontFamilies.heading}"
- Body font: "${designSystem.typography.fontFamilies.body}"
- Mono font: "${designSystem.typography.fontFamilies.mono}"

### Color Palette Summary
- Primary: ${designSystem.colors.primary.find(c => c.name.includes('500'))?.value || 'see tokens'}
- Accent: ${designSystem.colors.accent.find(c => c.name.includes('500'))?.value || 'see tokens'}
- Background: ${designSystem.colors.background.primary}
- Text: ${designSystem.colors.text.primary}

## Product Context
- Platform: ${prd.meta.target_platform}
- Architecture: ${prd.meta.architecture}
${prd.product ? `- Vision: ${prd.product.vision}` : ''}
${prd.features ? `- Key Features: ${prd.features.slice(0, 5).map(f => f.name).join(', ')}` : ''}
`;

  if (anchorPageHtml) {
    prompt += `
## CONSISTENCY REFERENCE — Match This Visual Style

The following is the anchor page design. Your page MUST feel like it belongs to the same application. Match the:
- Navigation pattern and placement exactly
- Color usage ratios (how much primary vs neutral vs accent)
- Typography application (heading sizes, body text, labels)
- Spacing rhythm (padding, margins, gaps)
- Component styling (buttons, cards, inputs)
- Overall visual density and whitespace usage

\`\`\`html
${anchorPageHtml.slice(0, 12000)}
\`\`\`
`;
  }

  prompt += `
## Requirements
- Output a COMPLETE, self-contained HTML file
- Include \`<script src="https://cdn.tailwindcss.com"></script>\` in head
- Include Tailwind config script with custom theme extending colors/fonts
- Include Google Fonts via \`<link>\` tags for all specified font families
- Include \`<style>\` block with the CSS custom properties above
- Responsive design (mobile-first, use Tailwind sm:/md:/lg: prefixes)
- Realistic content that matches the product domain — NOT "Lorem ipsum"
- NO JavaScript behavior — pure visual reference
- Use semantic HTML elements
- Include hover/focus states via Tailwind hover: and focus: utilities
- Every spacing value, color, and font size must reference the design system

Output ONLY the complete HTML file, no explanations.`;

  return prompt;
}


// ---------------------------------------------------------------------------
// Judge Agent System Prompt
// ---------------------------------------------------------------------------

export const DESIGN_JUDGE_SYSTEM_PROMPT = `You are a Senior Design Critic and Quality Assurance specialist at a top-tier design consultancy. You evaluate web page designs against strict quality criteria. You have a trained eye for generic, template-like designs and you specifically penalize them.

You are HARSH but FAIR. A score of 80+ means "this looks like it was designed by a skilled human designer." Most AI-generated designs score 40-60 on first attempt.

## SCORING RUBRIC

### 1. Visual Hierarchy (weight: 20%)
- Is it immediately clear what the most important content is?
- Do headings, body text, and captions have appropriate visual weight?
- Does the eye flow naturally through the content?
- Are there clear focal points that guide attention?
- Score 90+: Masterful hierarchy with clear information architecture
- Score 70-89: Good hierarchy, minor improvements possible
- Score 50-69: Hierarchy exists but some elements compete for attention
- Score <50: Flat design, everything has similar visual weight

### 2. Typography (weight: 15%)
- Are font choices distinctive and appropriate for the domain?
- Is the type scale used consistently (no random sizes)?
- Are line heights and letter spacing comfortable for reading?
- Is there good contrast between heading and body typography?
- Score 90+: Beautiful, distinctive typography that enhances the brand
- Score 70-89: Good typography, well-executed scale
- Score 50-69: Acceptable but generic font choices or inconsistent sizing
- Score <50: Poor font choices, unreadable, or no typographic rhythm

### 3. Color & Contrast (weight: 15%)
- Does the palette feel unique and intentional (not default Tailwind)?
- Is color used to encode meaning, not just decoration?
- Do text/background combinations have sufficient contrast (WCAG AA)?
- Is the color usage restrained and purposeful?
- Score 90+: Distinctive palette with masterful, restrained application
- Score 70-89: Good palette, appropriate usage
- Score 50-69: Generic colors, slightly off contrast, or overuse of color
- Score <50: Poor contrast, garish colors, or zero personality

### 4. Spacing & Layout (weight: 20%)
- Does spacing follow a consistent rhythm/scale?
- Is the grid system used well with intentional alignment?
- Is there appropriate use of negative space?
- Is the layout interesting or just a stack of generic sections?
- Score 90+: Sophisticated layout with intentional whitespace and rhythm
- Score 70-89: Clean layout with consistent spacing
- Score 50-69: Spacing works but feels generic, cramped, or overly uniform
- Score <50: Inconsistent spacing, no rhythm, chaotic or too sparse

### 5. Component Design (weight: 15%)
- Do buttons, cards, inputs feel custom-designed for this product?
- Are interactive affordances clear (hover states defined in CSS)?
- Do components match the overall design language?
- Is there variety in component treatment (not everything looks the same)?
- Score 90+: Components feel bespoke, cohesive, and polished
- Score 70-89: Well-designed components with minor refinement needed
- Score 50-69: Generic but functional (default Tailwind component look)
- Score <50: Default HTML styling or obviously template-based

### 6. Innovation & Personality (weight: 10%)
- Does this design have a unique point of view?
- Would you remember this design if you saw it tomorrow?
- Does it avoid ALL the AI design anti-patterns listed below?
- Does it feel like a real product, not a template?
- Score 90+: Truly distinctive, award-worthy design decisions
- Score 70-89: Has personality, feels intentional and fresh
- Score 50-69: Competent but forgettable, could be any SaaS product
- Score <50: Generic template, obvious AI-generated patterns

### 7. Design System Consistency (weight: 5%)
- Are the design system tokens used consistently throughout?
- Do colors, fonts, and spacing all reference the provided system?
- No "magic numbers" outside the defined scale?
- Score 90+: Perfect adherence to the design system with no deviations
- Score 70-89: Good adherence with minor deviations
- Score 50-69: Partially follows the system, some ad-hoc values
- Score <50: Design system tokens mostly ignored

## AI DESIGN ANTI-PATTERNS TO PENALIZE

Deduct points from Innovation & Personality (and relevant other criteria) if you find:
- Centered hero with generic headline + CTA
- Three-column cards with icon + title + description
- Gradient blob decorations
- Default Tailwind blue-500/gray-100 palette
- Every element has the same border-radius
- Excessive use of icons without purpose
- Generic stock-photo-style image descriptions
- Perfectly symmetrical layout with no visual tension
- "Lorem ipsum" or obviously fake placeholder text

## OUTPUT FORMAT

Return a JSON code block:
\`\`\`json
{
  "overallScore": 75,
  "scores": [
    { "criterion": "visual_hierarchy", "score": 80, "feedback": "Strong heading hierarchy, but the sidebar and main content compete for attention. The CTA gets lost below the fold." },
    { "criterion": "typography", "score": 70, "feedback": "Good font pairing but the body text line-height is too tight at 1.4. Increase to 1.6 for comfortable reading." },
    { "criterion": "color_contrast", "score": 75, "feedback": "The muted text on the light gray background (#999 on #f5f5f5) fails WCAG AA. The accent color is well-used for CTAs." },
    { "criterion": "spacing_layout", "score": 72, "feedback": "Consistent 16px/32px rhythm in most sections, but the hero section has 48px padding that breaks the pattern." },
    { "criterion": "component_design", "score": 68, "feedback": "Buttons are well-designed but all cards look identical. Vary the card treatment for different content types." },
    { "criterion": "innovation", "score": 65, "feedback": "The features section uses the classic three-column grid. Consider an alternating layout or asymmetric presentation." },
    { "criterion": "consistency", "score": 85, "feedback": "Good adherence to the design system. One heading uses a font size not in the scale." }
  ],
  "passed": false,
  "strengths": ["Specific strength #1 with details", "Specific strength #2"],
  "issues": ["Specific, actionable problem description #1", "Specific problem #2"],
  "suggestions": [
    "Replace the three-column features grid with an alternating two-column layout where each feature gets asymmetric visual weight",
    "Increase body text line-height from 1.4 to 1.6 and fix the muted text contrast ratio"
  ]
}
\`\`\`

RULES:
- The overallScore MUST be the weighted average of individual scores (weights: visual_hierarchy=20%, typography=15%, color_contrast=15%, spacing_layout=20%, component_design=15%, innovation=10%, consistency=5%)
- "passed" is true ONLY when overallScore >= the threshold provided in the prompt
- Feedback in "issues" and "suggestions" MUST be SPECIFIC and ACTIONABLE. Not "improve the layout" but "replace the three-column grid with an alternating layout that gives each feature different visual weight"
- Each score feedback should reference specific elements in the HTML
- Output ONLY the JSON code block, nothing else`;


// ---------------------------------------------------------------------------
// Judge User Prompt Builder
// ---------------------------------------------------------------------------

export function buildJudgeUserPrompt(
  htmlContent: string,
  designSystem: DesignSystem,
  pageName: string,
  threshold: number,
): string {
  return `Evaluate this "${pageName}" page design against the scoring rubric.

## Design System Reference
Name: "${designSystem.name}"
Primary color: ${designSystem.colors.primary.find(c => c.name.includes('500'))?.value}
Heading font: "${designSystem.typography.fontFamilies.heading}"
Body font: "${designSystem.typography.fontFamilies.body}"

## Pass Threshold: ${threshold}/100

## HTML to Evaluate:
\`\`\`html
${htmlContent}
\`\`\`

Score this design honestly. Remember: 80+ means "skilled human designer" quality. Be specific in your feedback.`;
}


// ---------------------------------------------------------------------------
// Consistency Check Prompt
// ---------------------------------------------------------------------------

export const CONSISTENCY_CHECK_SYSTEM_PROMPT = `You are reviewing a set of page designs for cross-page visual consistency. All pages must feel like they belong to the same application — same design system, same patterns, same visual language.

## What to Check

1. **Navigation**: Same nav pattern, same items, same styling, same height across ALL pages
2. **Color Usage Ratios**: Not just same palette — same application of colors (primary for actions, neutral for backgrounds, etc.)
3. **Typography Application**: Same heading styles at same hierarchy levels, same body text styles
4. **Spacing Rhythm**: Same content max-width, same section padding, same card padding
5. **Component Styling**: Buttons look the same across pages, cards have same treatment, inputs match
6. **Footer**: Consistent if present
7. **Visual Density**: Similar information density — one page shouldn't feel cramped while another is airy

## Output Format

Return a JSON code block:
\`\`\`json
{
  "overallScore": 85,
  "passed": true,
  "issues": [
    {
      "pages": ["dashboard", "settings"],
      "description": "Navigation height is 64px on dashboard but 72px on settings. Standardize to 64px.",
      "severity": "MEDIUM"
    }
  ],
  "summary": "Brief overall assessment of consistency across pages."
}
\`\`\`

- "passed" is true when overallScore >= 75
- Issues severity: HIGH = fundamentally different visual language, MEDIUM = noticeable inconsistency, LOW = minor deviation
- Be specific about what's inconsistent and which pages are affected
- Output ONLY the JSON code block`;


export function buildConsistencyCheckPrompt(
  pages: Array<{ name: string; htmlContent: string }>,
  designSystem: DesignSystem,
): string {
  // Truncate pages to fit in context — take first ~3000 chars of each (enough for structure, nav, colors)
  const truncatedPages = pages.map(p => ({
    name: p.name,
    html: p.htmlContent.slice(0, 3000) + (p.htmlContent.length > 3000 ? '\n<!-- ... truncated ... -->' : ''),
  }));

  return `Check the following ${pages.length} page designs for visual consistency.

## Design System: "${designSystem.name}"
- Primary: ${designSystem.colors.primary.find(c => c.name.includes('500'))?.value}
- Heading font: "${designSystem.typography.fontFamilies.heading}"
- Body font: "${designSystem.typography.fontFamilies.body}"
- Base spacing unit: ${designSystem.spacing.unit}px

## Pages to Check:

${truncatedPages.map(p => `### ${p.name}
\`\`\`html
${p.html}
\`\`\``).join('\n\n')}

Review all pages and identify any inconsistencies in navigation, colors, typography, spacing, components, or density.`;
}


// ---------------------------------------------------------------------------
// DESIGN_REFERENCE.md Generator
// ---------------------------------------------------------------------------

export function generateDesignReferenceMd(
  designSystem: DesignSystem,
  pages: Array<{ id: string; name: string }>,
): string {
  return `# Design Reference

This document summarizes the visual design system for this project. Reference the HTML mockups in \`designs/pages/\` when implementing UI.

## Design Direction: "${designSystem.name}"
${designSystem.description}

## Typography
- **Heading font**: ${designSystem.typography.fontFamilies.heading}
- **Body font**: ${designSystem.typography.fontFamilies.body}
- **Mono font**: ${designSystem.typography.fontFamilies.mono}

## Color Palette
- **Primary**: ${designSystem.colors.primary.find(c => c.name.includes('500'))?.value || '(see design-system.json)'}
- **Secondary**: ${designSystem.colors.secondary.find(c => c.name.includes('500'))?.value || '(see design-system.json)'}
- **Accent**: ${designSystem.colors.accent.find(c => c.name.includes('500'))?.value || '(see design-system.json)'}
- **Background**: ${designSystem.colors.background.primary}
- **Text**: ${designSystem.colors.text.primary}

## Spacing
- Base unit: ${designSystem.spacing.unit}px
- Scale: ${Object.entries(designSystem.spacing.scale).map(([k, v]) => `${k}=${v}`).join(', ')}

## Border Radius
${Object.entries(designSystem.borderRadius).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Page Designs
${pages.map(p => `- [\`designs/pages/${p.id}.html\`](designs/pages/${p.id}.html) — ${p.name}`).join('\n')}

## How to Use
1. Open any \`.html\` file in \`designs/pages/\` in a browser to see the mockup
2. Match the visual layout, colors, typography, and spacing when implementing
3. Use the design system tokens from \`designs/design-system.json\` in your Tailwind config
4. The mockups are responsive — check desktop, tablet, and mobile viewports
`;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert DesignSystem JSON to CSS custom properties block
 */
export function designSystemToCSS(ds: DesignSystem): string {
  const lines: string[] = [':root {'];

  // Colors
  for (const scale of ['primary', 'secondary', 'accent', 'neutral'] as const) {
    for (const token of ds.colors[scale]) {
      lines.push(`  --color-${token.name}: ${token.value};`);
    }
  }
  lines.push(`  --color-success: ${ds.colors.semantic.success};`);
  lines.push(`  --color-warning: ${ds.colors.semantic.warning};`);
  lines.push(`  --color-error: ${ds.colors.semantic.error};`);
  lines.push(`  --color-info: ${ds.colors.semantic.info};`);
  lines.push(`  --bg-primary: ${ds.colors.background.primary};`);
  lines.push(`  --bg-secondary: ${ds.colors.background.secondary};`);
  lines.push(`  --bg-tertiary: ${ds.colors.background.tertiary};`);
  lines.push(`  --text-primary: ${ds.colors.text.primary};`);
  lines.push(`  --text-secondary: ${ds.colors.text.secondary};`);
  lines.push(`  --text-muted: ${ds.colors.text.muted};`);
  lines.push(`  --text-inverse: ${ds.colors.text.inverse};`);

  // Typography
  lines.push(`  --font-heading: ${ds.typography.fontFamilies.heading};`);
  lines.push(`  --font-body: ${ds.typography.fontFamilies.body};`);
  lines.push(`  --font-mono: ${ds.typography.fontFamilies.mono};`);

  // Spacing
  for (const [name, value] of Object.entries(ds.spacing.scale)) {
    lines.push(`  --space-${name}: ${value};`);
  }

  // Border radius
  for (const [name, value] of Object.entries(ds.borderRadius)) {
    lines.push(`  --radius-${name}: ${value};`);
  }

  // Shadows
  for (const [name, value] of Object.entries(ds.shadows)) {
    lines.push(`  --shadow-${name}: ${value};`);
  }

  // Transitions
  for (const [name, value] of Object.entries(ds.transitions)) {
    lines.push(`  --transition-${name}: ${value};`);
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Convert DesignSystem to Tailwind config script block content
 */
export function designSystemToTailwindConfig(ds: DesignSystem): string {
  // Build color object for Tailwind
  const buildColorScale = (tokens: Array<{ name: string; value: string }>, prefix: string) => {
    const obj: Record<string, string> = {};
    for (const token of tokens) {
      const shade = token.name.replace(`${prefix}-`, '');
      obj[shade] = token.value;
    }
    return obj;
  };

  const config = {
    theme: {
      extend: {
        colors: {
          primary: buildColorScale(ds.colors.primary, 'primary'),
          secondary: buildColorScale(ds.colors.secondary, 'secondary'),
          accent: buildColorScale(ds.colors.accent, 'accent'),
          neutral: buildColorScale(ds.colors.neutral, 'neutral'),
        },
        fontFamily: {
          heading: [ds.typography.fontFamilies.heading, 'sans-serif'],
          body: [ds.typography.fontFamilies.body, 'sans-serif'],
          mono: [ds.typography.fontFamilies.mono, 'monospace'],
        },
        borderRadius: ds.borderRadius,
        boxShadow: ds.shadows,
      },
    },
  };

  return `tailwind.config = ${JSON.stringify(config, null, 2)}`;
}

/**
 * Extract page screens from PRD user flows
 */
export function extractPagesFromPRD(prd: PRDType): Array<{
  id: string;
  name: string;
  description: string;
  userFlowRef: string;
  userFlowSteps: string[];
}> {
  const pages: Array<{
    id: string;
    name: string;
    description: string;
    userFlowRef: string;
    userFlowSteps: string[];
  }> = [];

  const seenIds = new Set<string>();

  if (prd.user_flows) {
    for (const flow of prd.user_flows) {
      // Each user flow typically represents a key screen/journey
      const id = flow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!seenIds.has(id)) {
        seenIds.add(id);
        pages.push({
          id,
          name: flow.name,
          description: flow.description,
          userFlowRef: flow.name,
          userFlowSteps: flow.steps,
        });
      }
    }
  }

  // If no user flows, generate pages from epics that have UI-related tasks
  if (pages.length === 0) {
    for (const epic of prd.epics) {
      const hasUI = epic.user_stories.some(s =>
        s.tasks.some(t => t.type === 'code' && t.files.some(f =>
          f.includes('page') || f.includes('component') || f.includes('.tsx') || f.includes('.vue') || f.includes('.html')
        ))
      );
      if (hasUI) {
        const id = epic.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!seenIds.has(id)) {
          seenIds.add(id);
          pages.push({
            id,
            name: epic.name,
            description: epic.description || `UI for ${epic.name}`,
            userFlowRef: epic.name,
            userFlowSteps: epic.user_stories.map(s => s.title),
          });
        }
      }
    }
  }

  // Always ensure at least a home/landing page
  if (!seenIds.has('home') && !seenIds.has('landing') && !seenIds.has('dashboard')) {
    pages.unshift({
      id: 'home',
      name: 'Home',
      description: `Main landing page for ${prd.meta.full_name}`,
      userFlowRef: 'Home',
      userFlowSteps: ['User arrives at the application', 'User sees the main value proposition', 'User navigates to key features'],
    });
  }

  return pages;
}
