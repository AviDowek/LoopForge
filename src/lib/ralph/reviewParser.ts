import type { ReviewResult, ReviewStatus, RequirementReview, MissingItem, SetupInstructions } from '@/types/review';

/**
 * Extract text content from Claude's stream-json output format
 * The stream-json format is JSONL with events like:
 * {"type":"content_block_delta","delta":{"text":"..."}}
 */
function extractTextFromStreamJson(output: string): string {
  const textParts: string[] = [];

  // Split by lines and parse each JSON event
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed);

      // Extract text from content_block_delta events
      if (event.type === 'content_block_delta' && event.delta?.text) {
        textParts.push(event.delta.text);
      }

      // Also check for text in other event types
      if (event.type === 'content_block_start' && event.content_block?.text) {
        textParts.push(event.content_block.text);
      }
    } catch {
      // Not valid JSON, might be plain text - include it
      // This handles cases where output is mixed format
      if (!trimmed.startsWith('{')) {
        textParts.push(trimmed);
      }
    }
  }

  return textParts.join('');
}

/**
 * Parse review JSON from Claude's output
 * Handles various output formats (stream-json, code blocks, raw JSON, etc.)
 */
export function parseReviewOutput(output: string): ReviewResult | null {
  // First, check if this is stream-json format and extract text
  let textContent = output;
  if (output.includes('"type":"content_block_delta"') || output.includes('"type":"message_start"')) {
    textContent = extractTextFromStreamJson(output);
    console.log(`[reviewParser] Extracted ${textContent.length} chars from stream-json`);
    console.log(`[reviewParser] First 500 chars of extracted text:`, textContent.slice(0, 500));
  }

  // Try to find JSON code block first (```json ... ```)
  const jsonCodeBlockMatch = textContent.match(/```json\s*([\s\S]*?)```/);
  if (jsonCodeBlockMatch) {
    console.log(`[reviewParser] Found JSON code block, attempting parse...`);
    try {
      const parsed = JSON.parse(jsonCodeBlockMatch[1].trim());
      console.log(`[reviewParser] JSON parsed successfully, validating...`);
      const validation = validateReviewResultWithDetails(parsed);
      if (validation.valid) {
        console.log(`[reviewParser] Validation passed!`);
        return {
          ...parsed,
          timestamp: Date.now(),
          rawOutput: output,
        };
      } else {
        console.log(`[reviewParser] Validation failed:`, validation.errors);
        // Try to fix common issues and return partial result
        return normalizeReviewResult({
          ...fixReviewResult(parsed),
          timestamp: Date.now(),
          rawOutput: output,
        });
      }
    } catch (e) {
      console.log(`[reviewParser] JSON parse error:`, e);
      // Continue to try other formats
    }
  }

  // Try to find raw JSON object with reviewStatus
  const rawJsonMatch = textContent.match(/\{[\s\S]*?"reviewStatus"[\s\S]*?\}(?=\s*$|[^}])/);
  if (rawJsonMatch) {
    console.log(`[reviewParser] Found raw JSON with reviewStatus`);
    try {
      // Find matching braces
      const startIdx = textContent.indexOf(rawJsonMatch[0]);
      let depth = 0;
      let endIdx = startIdx;

      for (let i = startIdx; i < textContent.length; i++) {
        if (textContent[i] === '{') depth++;
        if (textContent[i] === '}') {
          depth--;
          if (depth === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }

      const jsonStr = textContent.substring(startIdx, endIdx);
      console.log(`[reviewParser] Extracted JSON (${jsonStr.length} chars)`);
      const parsed = JSON.parse(jsonStr);
      const validation = validateReviewResultWithDetails(parsed);
      if (validation.valid) {
        return {
          ...parsed,
          timestamp: Date.now(),
          rawOutput: output,
        };
      } else {
        console.log(`[reviewParser] Raw JSON validation failed:`, validation.errors);
        // Try to fix and return partial
        return normalizeReviewResult({
          ...fixReviewResult(parsed),
          timestamp: Date.now(),
          rawOutput: output,
        });
      }
    } catch (e) {
      console.log(`[reviewParser] Raw JSON parse error:`, e);
      // Continue to fallback
    }
  }

  // Try to extract partial information if full parse failed
  console.log(`[reviewParser] Trying partial extraction...`);
  const partialResult = extractPartialReview(textContent);
  if (partialResult) {
    console.log(`[reviewParser] Partial extraction succeeded:`, partialResult.reviewStatus, partialResult.overallScore);
    return normalizeReviewResult({
      ...partialResult,
      timestamp: Date.now(),
      rawOutput: output,
    });
  }

  console.log(`[reviewParser] All parsing methods failed. Text content length: ${textContent.length}`);
  console.log(`[reviewParser] Last 1000 chars:`, textContent.slice(-1000));
  return null;
}

/**
 * Validate with detailed error messages
 */
function validateReviewResultWithDetails(result: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!result || typeof result !== 'object') {
    return { valid: false, errors: ['Result is not an object'] };
  }

  const r = result as Record<string, unknown>;

  // Check reviewStatus
  if (!['COMPLETE', 'PARTIAL', 'INCOMPLETE', 'ERROR', 'PENDING'].includes(r.reviewStatus as string)) {
    errors.push(`Invalid reviewStatus: ${r.reviewStatus}`);
  }

  // Check overallScore
  if (typeof r.overallScore !== 'number') {
    errors.push(`overallScore is not a number: ${typeof r.overallScore}`);
  } else if (r.overallScore < 0 || r.overallScore > 100) {
    errors.push(`overallScore out of range: ${r.overallScore}`);
  }

  // Check requirements
  if (!Array.isArray(r.requirements)) {
    errors.push(`requirements is not an array: ${typeof r.requirements}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Fix common issues in review result
 */
function fixReviewResult(result: Record<string, unknown>): Partial<ReviewResult> {
  const fixed: Partial<ReviewResult> = {};

  // Fix reviewStatus
  const status = String(result.reviewStatus || '').toUpperCase();
  if (['COMPLETE', 'PARTIAL', 'INCOMPLETE', 'ERROR', 'PENDING'].includes(status)) {
    fixed.reviewStatus = status as ReviewStatus;
  } else if (status.includes('COMPLETE')) {
    fixed.reviewStatus = 'COMPLETE';
  } else if (status.includes('PARTIAL')) {
    fixed.reviewStatus = 'PARTIAL';
  } else {
    fixed.reviewStatus = 'INCOMPLETE';
  }

  // Fix overallScore
  if (typeof result.overallScore === 'number') {
    fixed.overallScore = Math.max(0, Math.min(100, result.overallScore));
  } else if (typeof result.overallScore === 'string') {
    fixed.overallScore = parseInt(result.overallScore, 10) || 0;
  } else {
    fixed.overallScore = 0;
  }

  // Fix requirements - be lenient
  if (Array.isArray(result.requirements)) {
    fixed.requirements = result.requirements.map((req: any, idx: number) => ({
      id: req.id || `REQ-${idx + 1}`,
      description: req.description || req.name || 'Unknown requirement',
      status: ['COMPLETE', 'PARTIAL', 'MISSING'].includes(String(req.status).toUpperCase())
        ? String(req.status).toUpperCase() as 'COMPLETE' | 'PARTIAL' | 'MISSING'
        : 'MISSING',
      evidence: req.evidence,
      notes: req.notes,
    }));
  } else {
    fixed.requirements = [];
  }

  // Fix missingItems - be lenient
  if (Array.isArray(result.missingItems)) {
    fixed.missingItems = result.missingItems.map((item: any) => ({
      description: item.description || String(item),
      priority: ['HIGH', 'MEDIUM', 'LOW'].includes(String(item.priority).toUpperCase())
        ? String(item.priority).toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW'
        : 'MEDIUM',
      suggestedFix: item.suggestedFix,
    }));
  } else {
    fixed.missingItems = [];
  }

  // Copy other fields
  fixed.summary = String(result.summary || 'Review completed');
  fixed.testingNotes = String(result.testingNotes || '');

  if (result.setupInstructions && typeof result.setupInstructions === 'object') {
    const setup = result.setupInstructions as Record<string, unknown>;
    fixed.setupInstructions = {
      envVars: Array.isArray(setup.envVars) ? setup.envVars.map(String) : [],
      installCommands: Array.isArray(setup.installCommands) ? setup.installCommands.map(String) : ['npm install'],
      buildCommand: String(setup.buildCommand || 'npm run build'),
      testCommand: String(setup.testCommand || 'npm test'),
      runCommand: String(setup.runCommand || 'npm start'),
    };
  }

  return fixed;
}

/**
 * Extract partial review information from unstructured output
 */
function extractPartialReview(output: string): Partial<ReviewResult> | null {
  const result: Partial<ReviewResult> = {
    reviewStatus: 'ERROR' as ReviewStatus,
    overallScore: 0,
    requirements: [],
    missingItems: [],
    setupInstructions: {
      envVars: [],
      installCommands: [],
      buildCommand: 'npm run build',
      testCommand: 'npm test',
      runCommand: 'npm start',
    },
    testingNotes: '',
    summary: 'Review output could not be fully parsed. See raw output for details.',
  };

  // Try to extract status
  const statusMatch = output.match(/reviewStatus["']?\s*[:=]\s*["']?(COMPLETE|PARTIAL|INCOMPLETE)["']?/i);
  if (statusMatch) {
    result.reviewStatus = statusMatch[1].toUpperCase() as ReviewStatus;
  }

  // Try to extract score
  const scoreMatch = output.match(/overallScore["']?\s*[:=]\s*(\d+)/);
  if (scoreMatch) {
    result.overallScore = parseInt(scoreMatch[1], 10);
  }

  // Try to extract summary
  const summaryMatch = output.match(/summary["']?\s*[:=]\s*["']([^"']+)["']/);
  if (summaryMatch) {
    result.summary = summaryMatch[1];
  }

  // If we extracted at least status or score, return partial result
  if (statusMatch || scoreMatch) {
    return result as ReviewResult;
  }

  return null;
}

/**
 * Type guard to validate review result structure
 */
export function validateReviewResult(result: unknown): result is ReviewResult {
  if (!result || typeof result !== 'object') return false;

  const r = result as Record<string, unknown>;

  // Required fields
  if (!['COMPLETE', 'PARTIAL', 'INCOMPLETE', 'ERROR', 'PENDING'].includes(r.reviewStatus as string)) {
    return false;
  }

  if (typeof r.overallScore !== 'number' || r.overallScore < 0 || r.overallScore > 100) {
    return false;
  }

  if (!Array.isArray(r.requirements)) {
    return false;
  }

  // Validate requirements array
  for (const req of r.requirements) {
    if (!validateRequirementReview(req)) {
      return false;
    }
  }

  // missingItems is optional but if present must be array
  if (r.missingItems !== undefined && !Array.isArray(r.missingItems)) {
    return false;
  }

  if (r.missingItems) {
    for (const item of r.missingItems as unknown[]) {
      if (!validateMissingItem(item)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate individual requirement review
 */
function validateRequirementReview(req: unknown): req is RequirementReview {
  if (!req || typeof req !== 'object') return false;

  const r = req as Record<string, unknown>;

  if (typeof r.id !== 'string') return false;
  if (typeof r.description !== 'string') return false;
  if (!['COMPLETE', 'PARTIAL', 'MISSING'].includes(r.status as string)) return false;

  return true;
}

/**
 * Validate missing item
 */
function validateMissingItem(item: unknown): item is MissingItem {
  if (!item || typeof item !== 'object') return false;

  const i = item as Record<string, unknown>;

  if (typeof i.description !== 'string') return false;
  if (!['HIGH', 'MEDIUM', 'LOW'].includes(i.priority as string)) return false;

  return true;
}

/**
 * Create a default error review result
 */
export function createErrorReviewResult(error: string, rawOutput?: string): ReviewResult {
  return {
    reviewStatus: 'ERROR',
    overallScore: 0,
    requirements: [],
    missingItems: [],
    setupInstructions: {
      envVars: [],
      installCommands: [],
      buildCommand: '',
      testCommand: '',
      runCommand: '',
    },
    testingNotes: '',
    summary: `Review failed: ${error}`,
    timestamp: Date.now(),
    rawOutput,
  };
}

/**
 * Merge partial review result with defaults
 */
export function normalizeReviewResult(partial: Partial<ReviewResult>): ReviewResult {
  return {
    reviewStatus: partial.reviewStatus || 'ERROR',
    overallScore: partial.overallScore || 0,
    requirements: partial.requirements || [],
    missingItems: partial.missingItems || [],
    setupInstructions: partial.setupInstructions || {
      envVars: [],
      installCommands: [],
      buildCommand: 'npm run build',
      testCommand: 'npm test',
      runCommand: 'npm start',
    },
    testingNotes: partial.testingNotes || '',
    summary: partial.summary || 'No summary available',
    timestamp: partial.timestamp || Date.now(),
    rawOutput: partial.rawOutput,
    reviewDurationMs: partial.reviewDurationMs,
  };
}
