import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { requireSuperAdmin } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';

const prisma = new PrismaClient();

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

// GET - List all admins (Superadmin only)
export async function GET(request: NextRequest) {
    try {
        try {
            requireSuperAdmin(request);
        } catch (e) {
            return NextResponse.json(
                { error: 'Unauthorized: Superadmin access required' },
                { status: 401, headers: corsHeaders }
            );
        }

        const admins = await prisma.admin.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ admins }, { headers: corsHeaders });
    } catch (error) {
        console.error('Get admins error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

// POST - Create new admin (Superadmin only)
export async function POST(request: NextRequest) {
    try {
        try {
            requireSuperAdmin(request);
        } catch (e) {
            return NextResponse.json(
                { error: 'Unauthorized: Superadmin access required' },
                { status: 401, headers: corsHeaders }
            );
        }

        const { name, email, password, role } = await request.json();

        if (!name || !email || !password) {
            return NextResponse.json(
                { error: 'Name, email and password are required' },
                { status: 400, headers: corsHeaders }
            );
        }

        const existingAdmin = await prisma.admin.findUnique({
            where: { email },
        });

        if (existingAdmin) {
            return NextResponse.json(
                { error: 'Admin with this email already exists' },
                { status: 409, headers: corsHeaders }
            );
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const newAdmin = await prisma.admin.create({
            data: {
                name,
                email,
                passwordHash,
                role: role || 'admin',
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
            },
        });

        return NextResponse.json(
            { message: 'Admin created successfully', admin: newAdmin },
            { status: 201, headers: corsHeaders }
        );
    } catch (error) {
        console.error('Create admin error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

// PUT - Update admin role (Superadmin only)
export async function PUT(request: NextRequest) {
    try {
        const authPayload = requireSuperAdmin(request);

        // Safety check: Don't allow demoting yourself if you are the only superadmin, 
        // but for now, we just proceed. Maybe block modifying own role?
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const { role } = await request.json();

        if (!id || !role) {
            return NextResponse.json(
                { error: 'ID and role are required' },
                { status: 400, headers: corsHeaders }
            );
        }

        if (id === authPayload.userId && role !== 'superadmin') {
            // Warn or block self-demotion? 
            // For now, let's allow it but maybe careful.
        }

        const updatedAdmin = await prisma.admin.update({
            where: { id },
            data: { role },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
            },
        });

        return NextResponse.json(
            { message: 'Admin updated successfully', admin: updatedAdmin },
            { headers: corsHeaders }
        );

    } catch (error: any) {
        // Check if error is from requireSuperAdmin
        if (error.message === 'Superadmin access required' || error.message === 'No authorization token provided') {
            return NextResponse.json(
                { error: 'Unauthorized: Superadmin access required' },
                { status: 401, headers: corsHeaders }
            );
        }

        console.error('Update admin error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

// DELETE - Remove admin (Superadmin only)
export async function DELETE(request: NextRequest) {
    try {
        const authPayload = requireSuperAdmin(request);

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'ID is required' },
                { status: 400, headers: corsHeaders }
            );
        }

        if (id === authPayload.userId) {
            return NextResponse.json(
                { error: 'Cannot delete your own account' },
                { status: 400, headers: corsHeaders }
            );
        }

        await prisma.admin.delete({
            where: { id },
        });

        return NextResponse.json(
            { message: 'Admin deleted successfully' },
            { headers: corsHeaders }
        );
    } catch (error: any) {
        if (error.message === 'Superadmin access required' || error.message === 'No authorization token provided') {
            return NextResponse.json(
                { error: 'Unauthorized: Superadmin access required' },
                { status: 401, headers: corsHeaders }
            );
        }
        console.error('Delete admin error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
