import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import type { ReviewResult } from '@/types/review';

const DB_FILE = path.join(process.cwd(), 'data', 'projects.json');
const REVIEWS_DIR = path.join(process.cwd(), 'data', 'reviews');

interface Project {
  id: string;
  name: string;
  path: string;
}

async function readProjects(): Promise<Project[]> {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function ensureReviewsDir(): Promise<void> {
  try {
    await fs.mkdir(REVIEWS_DIR, { recursive: true });
  } catch {
    // Already exists
  }
}

async function getLatestReview(projectId: string): Promise<ReviewResult | null> {
  try {
    const reviewPath = path.join(REVIEWS_DIR, `${projectId}.json`);
    const data = await fs.readFile(reviewPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveReview(projectId: string, review: ReviewResult): Promise<void> {
  await ensureReviewsDir();
  const reviewPath = path.join(REVIEWS_DIR, `${projectId}.json`);
  await fs.writeFile(reviewPath, JSON.stringify(review, null, 2));
}

// GET /api/projects/[projectId]/review - Get latest review result
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const projects = await readProjects();
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const review = await getLatestReview(projectId);

    if (!review) {
      return NextResponse.json({
        message: 'No review found for this project',
        review: null
      });
    }

    return NextResponse.json({ review });
  } catch (error) {
    console.error('Error fetching review:', error);
    return NextResponse.json({ error: 'Failed to fetch review' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/review - Trigger a new review or save review result
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const projects = await readProjects();
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // If body contains a review result, save it
    if (body.review) {
      const review: ReviewResult = {
        ...body.review,
        timestamp: body.review.timestamp || Date.now(),
      };
      await saveReview(projectId, review);
      return NextResponse.json({
        message: 'Review saved successfully',
        review
      });
    }

    // Otherwise, return instructions for triggering via WebSocket
    // The actual review is triggered via WebSocket for real-time streaming
    return NextResponse.json({
      message: 'To trigger a review, use the WebSocket connection and emit "review:trigger" event.',
      wsUrl: process.env.WS_URL || 'http://localhost:3006',
      projectPath: project.path,
    });
  } catch (error) {
    console.error('Error with review:', error);
    return NextResponse.json({ error: 'Failed to process review request' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/review - Clear review result
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const reviewPath = path.join(REVIEWS_DIR, `${projectId}.json`);

    try {
      await fs.unlink(reviewPath);
    } catch {
      // File doesn't exist, that's fine
    }

    return NextResponse.json({
      message: 'Review cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing review:', error);
    return NextResponse.json({ error: 'Failed to clear review' }, { status: 500 });
  }
}
