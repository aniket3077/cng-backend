import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

const prisma = new PrismaClient();

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
    // SECURITY FIX: verify the owner session via the shared auth helper.
    const payload = await requireAuth(request);
    if (payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const ownerId = payload.userId;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const tickets = await prisma.supportTicket.findMany({
      where: {
        ownerId,
        ...(status && { status }),
      },
      include: {
        station: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
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
    console.error('Get tickets error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY FIX: verify the owner session via the shared auth helper.
    const payload = await requireAuth(request);
    if (payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const ownerId = payload.userId;
    const body = await request.json();
    const { subject, description, category, priority, stationId } = body;

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
        ownerId,
        stationId: stationId || null,
      },
      include: {
        station: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        ownerId,
        action: 'support_ticket_created',
        description: `Support ticket ${ticketNumber} created`,
        metadata: JSON.stringify({ ticketId: ticket.id, category }),
      },
    });

    await prisma.notification.create({
      data: {
        ownerId,
        title: 'Support Ticket Created',
        message: `Your ticket ${ticketNumber} has been created. We'll respond soon.`,
        type: 'info',
        category: 'support',
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
    console.error('Create ticket error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // SECURITY FIX: verify the owner session via the shared auth helper.
    const payload = await requireAuth(request);
    if (payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const ownerId = payload.userId;
    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get('id');

    if (!ticketId) {
      return NextResponse.json(
        { error: 'Ticket ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, ownerId },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found or unauthorized' },
        { status: 404, headers: corsHeaders }
      );
    }

    const reply = await prisma.ticketReply.create({
      data: {
        ticketId,
        message,
        isInternal: false,
        createdBy: ownerId,
        createdByType: 'owner',
      },
    });

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        message: 'Reply added successfully',
        reply,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Add reply error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}