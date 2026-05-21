import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

// GET - List all users with filters and pagination
export async function GET(request: NextRequest) {
    try {
        // SECURITY FIX: require a verified admin session for user management.
        const admin = await requireAdmin(request);
        if (!admin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: corsHeaders }
            );
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const search = searchParams.get('search');

        const skip = (page - 1) * limit;

        const where: any = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    role: true,
                    createdAt: true,
                    updatedAt: true,
                    subscriptionType: true,
                    subscriptionEndsAt: true,
                    _count: {
                        select: {
                            vehicles: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.user.count({ where }),
        ]);

        return NextResponse.json(
            {
                users,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            },
            { status: 200, headers: corsHeaders }
        );
    } catch (error) {
        console.error('Get users error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

// PUT - Update user details (subscription)
export async function PUT(request: NextRequest) {
    try {
        // SECURITY FIX: require a verified admin session before updating users.
        const admin = await requireAdmin(request);
        if (!admin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: corsHeaders }
            );
        }

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('id');

        if (!userId) {
            return NextResponse.json(
                { error: 'User ID is required' },
                { status: 400, headers: corsHeaders }
            );
        }

        const body = await request.json();
        const { subscriptionType, subscriptionEndsAt } = body;

        const data: any = {};
        if (subscriptionType !== undefined) data.subscriptionType = subscriptionType;
        if (subscriptionEndsAt !== undefined) data.subscriptionEndsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                subscriptionType: true,
                subscriptionEndsAt: true,
            },
        });

        return NextResponse.json(
            { user: updatedUser, message: 'User updated successfully' },
            { status: 200, headers: corsHeaders }
        );
    } catch (error) {
        console.error('Update user error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

// DELETE - Delete user
export async function DELETE(request: NextRequest) {
    try {
        // SECURITY FIX: require a verified admin session before deleting users.
        const admin = await requireAdmin(request);
        if (!admin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: corsHeaders }
            );
        }

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('id');

        if (!userId) {
            return NextResponse.json(
                { error: 'User ID is required' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Delete user
        await prisma.user.delete({
            where: { id: userId },
        });

        // Log activity
        await prisma.activityLog.create({
            data: {
                adminId: admin.userId,
                action: 'user_deleted',
                description: `User ${userId} deleted by admin`,
            },
        });

        return NextResponse.json(
            { message: 'User deleted successfully' },
            { status: 200, headers: corsHeaders }
        );
    } catch (error) {
        console.error('Delete user error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
