import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAdmin } from '@/lib/auth';
import { corsHeaders, successResponse, errorResponse, parsePagination } from '@/lib/api-utils';

const prisma = new PrismaClient();

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET - List all support tickets (admin view)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams);
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search');

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    if (priority) {
      where.priority = priority;
    }

    if (search) {
      where.OR = [
        { ticketNumber: { contains: search } },
        { subject: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              companyName: true,
            },
          },
          station: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },
          replies: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return successResponse({
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get tickets error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// PUT - Update ticket (status, assignment, resolution)
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const admin = authResult;

    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get('id');

    if (!ticketId) {
      return errorResponse('Ticket ID is required', 400);
    }

    const body = await request.json();
    const { status, assignedTo, resolution, priority } = body;

    // Verify ticket exists
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return errorResponse('Ticket not found', 404);
    }

    const updateData: any = {};

    if (status) {
      updateData.status = status;
      if (status === 'resolved') {
        updateData.resolvedAt = new Date();
      }
    }

    if (assignedTo !== undefined) {
      updateData.assignedTo = assignedTo;
    }

    if (resolution) {
      updateData.resolution = resolution;
    }

    if (priority) {
      updateData.priority = priority;
    }

    const updatedTicket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        station: {
          select: {
            id: true,
            name: true,
          },
        },
        replies: true,
      },
    });

    // Notify owner about status change
    if (status && ticket.ownerId) {
      await prisma.notification.create({
        data: {
          ownerId: ticket.ownerId,
          title: 'Support Ticket Updated',
          message: `Your ticket ${ticket.ticketNumber} status has been updated to: ${status.replace('_', ' ')}`,
          type: 'info',
          category: 'support',
        },
      });
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        ownerId: ticket.ownerId || undefined,
        action: 'ticket_updated_by_admin',
        description: `Ticket ${ticket.ticketNumber} updated by admin ${admin.email}`,
        metadata: JSON.stringify({ ticketId, changes: updateData }),
      },
    });

    return successResponse({
      message: 'Ticket updated successfully',
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error('Update ticket error:', error);
    return errorResponse('Internal server error', 500);
  }
}

// POST - Add reply to ticket (admin)
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const admin = authResult;

    const body = await request.json();
    const { ticketId, message, isInternal } = body;

    if (!ticketId || !message) {
      return errorResponse('Ticket ID and message are required', 400);
    }

    // Verify ticket exists
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return errorResponse('Ticket not found', 404);
    }

    // Create reply
    const reply = await prisma.ticketReply.create({
      data: {
        ticketId,
        message,
        isInternal: isInternal || false,
        createdBy: admin.email,
        createdByType: 'admin',
      },
    });

    // Update ticket status to in_progress if it was open
    if (ticket.status === 'open') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'in_progress' },
      });
    }

    // Notify owner if not internal note
    if (!isInternal && ticket.ownerId) {
      await prisma.notification.create({
        data: {
          ownerId: ticket.ownerId,
          title: 'New Reply on Your Ticket',
          message: `Support team has replied to your ticket ${ticket.ticketNumber}`,
          type: 'info',
          category: 'support',
        },
      });
    }

    return successResponse(
      {
        message: 'Reply added successfully',
        reply,
      },
      undefined,
      { ...corsHeaders, 'Content-Type': 'application/json' }
    );
  } catch (error) {
    console.error('Add reply error:', error);
    return errorResponse('Internal server error', 500);
  }
}
