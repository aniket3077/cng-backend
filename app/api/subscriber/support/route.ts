import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

function verifyToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { ownerId: string; type: string };
    if (decoded.type !== 'owner') {
      return null;
    }
    return decoded.ownerId;
  } catch (error) {
    return null;
  }
}

// Generate ticket number
function generateTicketNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `FBT-${dateStr}-${random}`;
}

// GET - List owner's support tickets
export async function GET(request: NextRequest) {
  try {
    const ownerId = verifyToken(request);
    if (!ownerId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

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

// POST - Create support ticket
export async function POST(request: NextRequest) {
  try {
    const ownerId = verifyToken(request);
    if (!ownerId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { subject, description, category, priority, stationId } = body;

    if (!subject || !description || !category) {
      return NextResponse.json(
        { error: 'Subject, description, and category are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Generate unique ticket number
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

    // Log activity
    await prisma.activityLog.create({
      data: {
        ownerId,
        action: 'support_ticket_created',
        description: `Support ticket ${ticketNumber} created`,
        metadata: JSON.stringify({ ticketId: ticket.id, category }),
      },
    });

    // Create notification
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

// PUT - Reply to ticket
export async function PUT(request: NextRequest) {
  try {
    const ownerId = verifyToken(request);
    if (!ownerId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

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

    // Verify ticket ownership
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, ownerId },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found or unauthorized' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Create reply
    const reply = await prisma.ticketReply.create({
      data: {
        ticketId,
        message,
        createdBy: ownerId,
        createdByType: 'owner',
      },
    });

    // Update ticket status if it was resolved
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'open' },
      });
    }

    return NextResponse.json(
      {
        message: 'Reply added successfully',
        reply,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Reply ticket error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
