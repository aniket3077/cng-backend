import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

function generateTicketNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `FBT-${dateStr}-${random}`;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request);
    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders }
      );
    }

    const userId = payload.userId;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const tickets = await prisma.supportTicket.findMany({
      where: {
        userId,
        ...(status && { status }),
      },
      include: {
        replies: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      { tickets },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Get customer tickets error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request);
    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders }
      );
    }

    const userId = payload.userId;
    const body = await request.json();
    const { subject, description, category, priority } = body;

    if (!subject || !description || !category) {
      return NextResponse.json(
        { error: 'Subject, description, and category are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    let ticketNumber;
    let isUnique = false;

    while (!isUnique) {
      ticketNumber = generateTicketNumber();
      const existing = await prisma.supportTicket.findUnique({
        where: { ticketNumber },
      });
      if (!existing) {
        isUnique = true;
      }
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber: ticketNumber!,
        subject,
        description,
        category,
        priority: priority || 'medium',
        status: 'open',
        userId,
      },
    });

    return NextResponse.json(
      {
        message: 'Support ticket created successfully',
        ticket,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Create customer ticket error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
